const db = require('../db');
const { sendNotificationToUser } = require("../services/pushService");

exports.getPersonalInfo = (req, res) => {
  console.log('Session:', req.session);
  // Adjust based on how your session stores email
  const userEmail = req.session.email || req.session.user?.email;

  if (!userEmail) {
    return res.status(401).json({ error: "Not logged in" });
  }


  const sql = `
    SELECT 
      u.email AS requester_email,
      CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
      e.employee_id,
      d.department_name AS department,
      e.designation,
      lm.name AS line_manager,
      e.doj AS joining_date,
      c.company_name AS company,
      e.id AS requester_id
    FROM users u
    JOIN employees e ON u.email = e.email
    JOIN department d ON e.department_id = d.id
    JOIN company_name c ON e.company_id = c.id
    JOIN line_managers lm ON e.line_manager_id = lm.id
    WHERE u.email = ?
  `;

  db.query(sql, [userEmail], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }

    if (rows.length === 0) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const info = rows[0];
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `PET${today}`;

    // Correct substring index for numeric part (after "PETYYYYMMDD")
    const nextSql = `
  SELECT MAX(CAST(SUBSTRING(req_no, 11) AS UNSIGNED)) AS max_no
  FROM petrol_claim
  WHERE req_no LIKE ?
`;

    db.query(nextSql, [`${prefix}%`], (err, result) => {
      if (err) return res.status(500).json({ error: "DB error getting req_no" });

      const nextNumber = result[0].max_no ? result[0].max_no + 1 : 1;
      const formattedReqNo = `${prefix}${String(nextNumber).padStart(4, '0')}`;

      res.json({
        req_no: formattedReqNo,
        request_date: new Date().toISOString().slice(0, 10),
        employee_name: info.employee_name,
        requester_email: info.requester_email,
        company: info.company,
        department: info.department,
        designation: info.designation,
        line_manager: info.line_manager,
        joining_date: info.joining_date,
        employee_id: info.employee_id,
        requester_id: info.requester_id
      });
    });
  });
};



// 2. Create a new petrol conveyance
exports.createPetrolClaim = (req, res) => {
  const { req_no, remarks, items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).send({ error: "Items required" });
  }


  const empCode = req.session.user.employee_id;

  const getRequesterIdSql = `SELECT id FROM employees WHERE employee_id = ?`;
  db.query(getRequesterIdSql, [empCode], (err0, empResult) => {
    if (err0 || empResult.length === 0)
      return res.status(500).send({ error: "Invalid employee_id in session" });

    const requester_id = empResult[0].id;

    // 1️⃣ Insert petrol_claim
    const claimSql = `
      INSERT INTO petrol_claim (req_no, requester_id, remarks, status, created_at, updated_at)
      VALUES (?, ?, ?, 'Pending', NOW(), NOW())
    `;
    db.query(claimSql, [req_no, requester_id, remarks], (err, result) => {
      if (err) return res.status(500).send({ error: err.message });

      const petrol_claim_id = result.insertId;

      // 2️⃣ Insert petrol_items
      const itemSql = `
        INSERT INTO petrol_items (petrol_claim_id, date, start_km, end_km, total_km_travelled, location)
        VALUES ?
      `;
      const itemValues = items.map(item => [
        petrol_claim_id,
        item.date,
        Number(item.start_km),
        Number(item.end_km),
        Number(item.total_km_travelled),
        item.location || ""
      ]);

      db.query(itemSql, [itemValues], (err2) => {
        if (err2) {
          console.error("🔥 PETROL ITEM ERROR:", err2);
          return res.status(500).send({ error: err2.message });
        }

        // 3️⃣ Get approvers from petrol_matrix
        const matrixSql = `
          SELECT * FROM petrol_matrix WHERE request_type = 'petrol_conveyance' ORDER BY level ASC
        `;
        db.query(matrixSql, (err3, approvers) => {
          if (err3) return res.status(500).send({ error: err3.message });

          // 4️⃣ Insert first-level approvers into petrol_approvals
          const level1Approvers = approvers.filter(a => a.level === 1);
          if (level1Approvers.length === 0)
            return res.status(500).send({ error: "No level 1 approver found" });

          const approvalSql = `
            INSERT INTO petrol_approvals (req_no, petrol_claim_id, approver_id, level, status)
            VALUES (?, ?, ?, ?, 'Pending')
          `;
          level1Approvers.forEach(approver => {
            db.query(approvalSql, [req_no, petrol_claim_id, approver.approver_user_id, approver.level], (errInsert) => {
              if (errInsert) console.error("Insert approver error:", errInsert);
            });
          });

          // 5️⃣ Notify requester
          const requesterSql = `
            SELECT u.email, CONCAT(e.first_name, ' ', e.last_name) AS full_name
            FROM users u
            JOIN employees e ON u.email = e.email
            WHERE e.id = ?
          `;
          db.query(requesterSql, [requester_id], (err4, requesterResult) => {
            if (err4) return res.status(500).send({ error: err4.message });
            if (!requesterResult?.length) return res.status(404).send({ error: "Requester not found" });

            const requesterEmail = requesterResult[0].email;
            const requesterName = requesterResult[0].full_name;
            const requesterMsg = `You submitted a petrol claim`;
            const requesterLink = `/mypetrol.html?reqNo=${req_no}`;

            // Insert or update requester notification
            const notifCheck = `
              SELECT id FROM notifications WHERE email = ? AND link = ?
            `;
            db.query(notifCheck, [requesterEmail, requesterLink], (errCheck, notifRes) => {
              if (errCheck) console.error("Notif check error:", errCheck);
              if (notifRes.length > 0) {
                db.query(
                  `UPDATE notifications SET message = ?, updated_at = NOW() WHERE id = ?`,
                  [requesterMsg, notifRes[0].id],
                  (err) => {
                    if (!err) {
                      sendNotificationToUser(requesterEmail, requesterMsg, requesterLink); // ✅ ADD THIS
                    }
                  }
                );
              } else {
                db.query(
                  `INSERT INTO notifications (email, message, link, status, created_at, updated_at)
                   VALUES (?, ?, ?, 'unread', NOW(), NOW())`,
                  [requesterEmail, requesterMsg, requesterLink],
                  (err) => {
                    if (!err) {
                      sendNotificationToUser(requesterEmail, requesterMsg, requesterLink); // ✅ ADD THIS
                    }
                  }
                );
              }
            });

            // 6️⃣ Notify first-level approvers
            level1Approvers.forEach(approver => {
              db.query(`SELECT email FROM users WHERE id = ?`, [approver.approver_user_id], (err5, emailRes) => {
                if (emailRes?.length > 0) {
                  const email = emailRes[0].email;
                  const msg = `${requesterName} submitted a petrol claim for your approval`;
                  const link = `/petrol-approval.html?type=petrol&reqNo=${req_no}`;
                  db.query(
                    `INSERT INTO notifications (email, message, link, status, created_at, updated_at)
                     VALUES (?, ?, ?, 'unread', NOW(), NOW())`,
                    [email, msg, link],
                    (err) => {
                      if (!err) {
                        sendNotificationToUser(email, msg, link); // ✅ ADD THIS
                      }
                    }
                  );
                }
              });
            });

            res.send({ success: true, req_no, message: `Petrol claim ${req_no} submitted successfully.` });
          });
        });
      });
    });
  });
};


// update approve or reject
exports.updatePetrolApproval = (req, res) => {
  const { req_no, approver_id, status, comments } = req.body;

  //Pre-check if approver already acted for button disabling
  db.query(
    "SELECT status FROM petrol_approvals WHERE req_no=? AND approver_id=?",
    [req_no, approver_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err });

      if (rows.length && rows[0].status.toLowerCase() !== 'pending') {
        return res.status(400).json({ message: "Already acted on this request" });
      }

      // 1. Update current approver status
      const updateSql = `
       UPDATE petrol_approvals 
       SET status = ?, approved_at = NOW() 
      WHERE req_no = ? AND approver_id = ?
      `;
      db.query(updateSql, [status, req_no, approver_id], (err) => {
        if (err) return res.status(500).json({ error: err });


        const getRequesterName = `
        SELECT CONCAT(e.first_name, ' ', e.last_name) AS full_name
       FROM petrol_claim c
       JOIN employees e ON c.requester_id = e.id
       WHERE c.req_no = ?
       `;

        db.query(getRequesterName, [req_no], (errN, nameRes) => {
          if (errN || nameRes.length === 0) return;

          const requesterName = nameRes[0].full_name;
          const approverMessage = status.toLowerCase() === "approved"
            ? `You approved ${requesterName}'s petrol claim`
            : `You rejected ${requesterName}'s petrol claim`;

          const approverLink = `/petrol-approval.html?type=petrol&reqNo=${req_no}`;

          const approverEmailSql = `SELECT email FROM users WHERE id = ?`;
          db.query(approverEmailSql, [approver_id], (eErr, eRes) => {
            if (!eErr && eRes?.length > 0) {
              const approverEmail = eRes[0].email;
              db.query(`
        UPDATE notifications 
        SET message = ?, updated_at = NOW()
        WHERE email = ? AND link = ?
      `, [approverMessage, approverEmail, approverLink],
                (err) => {
                  if (!err) {
                    sendNotificationToUser(approverEmail, approverMessage, approverLink); // ✅ ADD THIS
                  }
                }
              );
            }
          });
        });


        // 2. Skip other same-level approvers
        const skipSql = `
      UPDATE petrol_approvals 
      SET status = 'Skipped'
      WHERE req_no = ? 
      AND level = (
        SELECT level FROM petrol_approvals WHERE req_no = ? AND approver_id = ?
      )
      AND approver_id != ?
    `;
        db.query(skipSql, [req_no, req_no, approver_id, approver_id]);

        //  If APPROVED flow
        if (status.toLowerCase() === "approved") {
          const currentLevelSql = `
        SELECT level FROM petrol_approvals 
        WHERE req_no = ? AND approver_id = ?
      `;
          db.query(currentLevelSql, [req_no, approver_id], (errL, levelRes) => {
            if (errL) return res.status(500).json({ error: errL.message });
            if (!levelRes?.length) return res.status(404).json({ message: "Approval level not found" });

            const currentLevel = levelRes[0].level;
            const nextLevel = currentLevel + 1;

            // 🔍 Find next level approvers from petrol_matrix
            const nextApproversSql = `
          SELECT approver_user_id FROM petrol_matrix
          WHERE request_type = 'petrol_conveyance' AND level = ?
        `;
            db.query(nextApproversSql, [nextLevel], (errN, approverRows) => {
              if (errN) return res.status(500).json({ error: errN.message });

              if (approverRows.length > 0) {
                //  Insert next level approvers
                const insertSql = `
              INSERT INTO petrol_approvals (req_no, petrol_claim_id, approver_id, level, status)
              VALUES (?, (SELECT id FROM petrol_claim WHERE req_no = ?), ?, ?, 'Pending')
            `;

                approverRows.forEach((row) => {
                  db.query(insertSql, [req_no, req_no, row.approver_user_id, nextLevel], (errInsert) => {
                    if (errInsert) console.error("Error inserting next approver:", errInsert);

                    const msg = `New Petrol Claim ${req_no} requires your approval`;
                    const link = `/petrol-approval.html?type=petrol&reqNo=${req_no}`;

                    db.query(`SELECT email FROM users WHERE id = ?`, [row.approver_user_id], (eErr, eRes) => {
                      if (!eErr && eRes?.length > 0) {
                        const email = eRes[0].email;
                        db.query(`
                      INSERT INTO notifications (email, message, link, status, created_at, updated_at)
                      VALUES (?, ?, ?, 'unread', NOW(), NOW())
                    `, [email, msg, link],
                          (err) => {
                            if (!err) {
                              sendNotificationToUser(email, msg, link); // ✅ ADD THIS
                            }
                          }
                        );
                      }
                    });
                  });
                });

                // Notify requester that claim is still under process
                const getRequester = `SELECT requester_id FROM petrol_claim WHERE req_no = ?`;
                db.query(getRequester, [req_no], (errR, requesterResult) => {
                  if (!errR && requesterResult?.length > 0) {
                    const requesterId = requesterResult[0].requester_id;
                    db.query(`SELECT email FROM employees WHERE id = ?`, [requesterId], (errE, emailRes) => {
                      if (!errE && emailRes?.length > 0) {
                        const requesterEmail = emailRes[0].email;
                        const msg = `Your petrol claim is under process`;
                        const link = `/mypetrol.html?reqNo=${req_no}`;
                        db.query(`UPDATE notifications SET message=?, updated_at=NOW() WHERE email=? AND link=?`,
                          [msg, requesterEmail, link],
                          (err) => {
                            if (!err) {
                              sendNotificationToUser(requesterEmail, msg, link); // ✅ ADD THIS
                            }
                          }
                        );
                      }
                    });
                  }
                });

                return res.status(200).json({ message: "Next level approvers notified" });

              } else {
                //  Fully approved
                db.query(`UPDATE petrol_claim SET status='Approved' WHERE req_no=?`, [req_no]);

                const getRequester = `SELECT requester_id FROM petrol_claim WHERE req_no = ?`;
                db.query(getRequester, [req_no], (errR, requesterResult) => {
                  if (errR) return res.status(500).json({ error: errR });
                  const requesterId = requesterResult[0].requester_id;

                  db.query(`SELECT email FROM employees WHERE id = ?`, [requesterId], (errE, emailRes) => {
                    if (errE) return res.status(500).json({ error: errE });
                    if (!emailRes?.length) return res.status(404).json({ message: "Requester email not found" });

                    const requesterEmail = emailRes[0].email;
                    const msg = `✅ Your Petrol Claim ${req_no} has been approved.`;
                    const link = `/mypetrol.html?reqNo=${req_no}`;
                    db.query(
                      `UPDATE notifications SET message=?, updated_at=NOW() WHERE email=? AND link=?`,
                      [msg, requesterEmail, link],
                      (err) => {
                        if (!err) {
                          sendNotificationToUser(requesterEmail, msg, link); // ✅ ADD THIS
                        }
                        return res.status(200).json({ message: "Fully approved and requester notified" });
                      }
                    );
                  });
                });
              }
            });
          });

        } else if (status.toLowerCase() === "rejected") {
          // ❌ Reject flow
          db.query(`
        UPDATE petrol_claim 
        SET status='Rejected', rejected_by=?, rejection_reason=?, updated_at=NOW()
        WHERE req_no=?`,
            [approver_id, comments, req_no]
          );

          const getRequester = `SELECT requester_id FROM petrol_claim WHERE req_no=?`;
          db.query(getRequester, [req_no], (errR, requesterResult) => {
            if (errR) return res.status(500).json({ error: errR });
            const requesterId = requesterResult[0].requester_id;

            db.query(`SELECT email FROM employees WHERE id=?`, [requesterId], (errE, emailRes) => {
              if (errE) return res.status(500).json({ error: errE });

              const requesterEmail = emailRes[0].email;
              const msg = `❌ Your Petrol Claim ${req_no} has been rejected.`;
              const link = `/mypetrol.html?reqNo=${req_no}`;
              db.query(
                `UPDATE notifications SET message=?, updated_at=NOW() WHERE email=? AND link=?`,
                [msg, requesterEmail, link],
                (err) => {
                  if (!err) {
                    sendNotificationToUser(requesterEmail, msg, link); // ✅ ADD THIS
                  }
                  return res.status(200).json({ message: "Petrol claim rejected and requester notified" });
                }
              );

            });
          });

        } else {
          res.status(200).json({ message: "Approval status updated" });
        }
      });
    }
  );
};



// approval frontend table with date filters
exports.getPetrolApprovals = (req, res) => {
  if (!req.session.user || !req.session.user.user_id) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }

  const approverId = req.session.user.user_id;

  // QUERY FILTERS
  const status = req.query.status || "all";
  const search = req.query.search || "";
  const startDate = req.query.start_date || "";
  const endDate = req.query.end_date || "";
  const isReport = req.query.report === "1";

  // BASE QUERY
  let sql = `
    SELECT
      pc.req_no,
      pc.remarks,
      LOWER(MAX(pa.status)) AS my_status,
      LOWER(pc.status) AS final_status,
      pc.created_at,
      CONCAT(e.first_name, ' ', e.last_name) AS requester_name
    FROM petrol_claim pc
    JOIN petrol_approvals pa ON pc.req_no = pa.req_no
    JOIN employees e ON pc.requester_id = e.id
    WHERE pa.approver_id = ?
  `;

  const params = [approverId];

  // STATUS FILTER
  if (status !== "all") {
    sql += ` AND LOWER(pa.status) = LOWER(?)`;
    params.push(status);
  }

  // SEARCH FILTER (NAME)
  if (search) {
    sql += ` AND CONCAT(e.first_name, ' ', e.last_name) LIKE ? `;
    params.push(`%${search}%`);
  }

  // DATE RANGE FILTER
  if (startDate && endDate) {
    sql += ` AND DATE(pc.created_at) BETWEEN ? AND ? `;
    params.push(startDate, endDate);
  } else if (startDate) {
    sql += ` AND DATE(pc.created_at) >= ? `;
    params.push(startDate);
  } else if (endDate) {
    sql += ` AND DATE(pc.created_at) <= ? `;
    params.push(endDate);
  }

  sql += `
    GROUP BY pc.req_no, pc.remarks, pc.status, e.first_name, e.last_name
    ORDER BY pc.created_at DESC;
  `;

  // RUN QUERY
  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    // CSV REPORT DOWNLOAD
    if (isReport) {
      const csv = [
        "Req No,Requester,Remarks,My Status,Final Status,Created At",
        ...results.map(r =>
          `"${r.req_no}","${r.requester_name}","${r.remarks}","${r.my_status}","${r.final_status}","${r.created_at}"`
        )
      ].join("\n");

      res.setHeader("Content-Disposition", `attachment; filename=petrol-report-${Date.now()}.csv`);
      res.setHeader("Content-Type", "text/csv");
      return res.send(csv);
    }

    res.json(results);
  });
};




// approver pop-up form
exports.getPetrolClaimByReqNo = (req, res) => {
  const reqNo = req.params.req_no;
  // SAFE CHECK
  if (!req.session.user || !req.session.user.user_id) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }

  const approverId = req.session.user.user_id;

  const claimSql = `
    SELECT 
        pc.req_no AS requester_no, 
        CONCAT(e.first_name, ' ', e.last_name) AS requester_name, 
        e.email, 
        DATE_FORMAT(pc.created_at, '%Y-%m-%d') AS date,
        d.department_name AS department, 
        pc.remarks,
        pc.rejection_reason,
        pc.rejected_by,
        CONCAT(r.first_name, ' ', r.last_name) AS rejected_by_name,
        pc.status,
        pa.status AS approval_status  
    FROM petrol_claim pc
    JOIN employees e ON pc.requester_id = e.id
    LEFT JOIN department d ON e.department_id = d.id
    LEFT JOIN petrol_approvals pa 
        ON pa.petrol_claim_id = pc.id 
        AND pa.approver_id = ?
    LEFT JOIN users r ON pc.rejected_by = r.id      
    WHERE pc.req_no = ?
    LIMIT 1
`;

  // Claim items (table rows)
  const itemsSql = `
    SELECT 
        DATE_FORMAT(date, '%Y-%m-%d') AS date, 
        start_km, 
        end_km, 
        total_km_travelled AS total_km, 
        location
    FROM petrol_items
    WHERE petrol_claim_id = ?
    ORDER BY date ASC
`;
  // Step 1: Get claim data
  db.query(claimSql, [approverId, reqNo], (err, claimRows) => {
    if (err) {
      console.error("Error in claimSql:", err);
      return res.status(500).json({ success: false, message: "DB error", error: err });
    }
    if (claimRows.length === 0) {
      return res.status(404).json({ success: false, message: "Claim not found" });
    }

    const claim = claimRows[0];

    // Step 2: Get claim ID for items
    db.query("SELECT id FROM petrol_claim WHERE req_no = ?", [reqNo], (errId, idRows) => {
      if (errId) {
        console.error("Error getting claim ID:", errId);
        return res.status(500).json({ success: false, message: "DB error", error: errId });
      }
      if (idRows.length === 0) {
        return res.status(404).json({ success: false, message: "Claim not found" });
      }

      const claimId = idRows[0].id;

      // Step 3: Get items
      db.query(itemsSql, [claimId], (err2, itemRows) => {
        if (err2) {
          console.error("Error in itemsSql:", err2);
          return res.status(500).json({ success: false, message: "DB error", error: err2 });
        }

        claim.items = itemRows;
        res.json(claim);
      });
    });
  });
};



// employee table
exports.getMyPetrolClaims = (req, res) => {
  if (!req.session.user || !req.session.user.employee_id) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }

  const employeeCode = req.session.user.employee_id; // e.g. EMP0008
  const statusFilter = req.query.status;

  let sql = `
    SELECT 
      pc.id,
      pc.req_no,
      pc.remarks,
      pc.status AS final_status,
      CONCAT(emp.first_name, ' ', emp.last_name) AS requester_name,
      GROUP_CONCAT(CONCAT(pi.location, ' (', pi.total_km_travelled, ' km)') SEPARATOR ', ') AS locations
    FROM petrol_claim pc
    JOIN employees emp ON pc.requester_id = emp.id
    LEFT JOIN petrol_items pi ON pi.petrol_claim_id = pc.id
    WHERE emp.employee_id = ?
    GROUP BY pc.id
  `;

  const params = [employeeCode];

  if (statusFilter && statusFilter !== "all") {
    sql += ` HAVING final_status = ?`;
    params.push(statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1));
  }

  sql += ` ORDER BY pc.id DESC`;

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error("Error fetching petrol claims:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    res.json(results);
  });
};



// TRACK PETROL APPROVAL 
exports.trackPetrolApproval = (req, res) => {
  const { reqNo } = req.params;

  const sql = `
    SELECT 
      pa.approver_id,
      pa.status,
      pa.approved_at AS date,
      CONCAT(u.first_name, ' ', u.last_name) AS approved_by_name
    FROM petrol_approvals pa
    LEFT JOIN users u ON pa.approver_id = u.id
    WHERE pa.req_no = ?
    ORDER BY pa.level ASC
  `;

  db.query(sql, [reqNo], (err, results) => {
    if (err) {
      console.error("❌ Error fetching petrol approval tracking:", err);
      return res.status(500).json({ success: false, message: "Tracking fetch failed" });
    }
    res.json(results);
  });
};


