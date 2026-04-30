const db = require('../db');
const { sendNotificationToUser } = require("../services/pushService");

// 1. Generate new req_no like EXP202507220001
function generateReqNo(callback) {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000);
  const req_no = `EXP${datePart}${random}`;
  callback(req_no);
}
exports.getPersonalInfo = (req, res) => {
  const userEmail = req.session.user?.email;

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

    // Generate next req_no
    const nextSql = `SELECT MAX(CAST(SUBSTRING(req_no, 8) AS UNSIGNED)) AS max_no FROM expense_claim`;
    db.query(nextSql, (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "DB error getting req_no" });
      }

      const nextNumber = result[0].max_no ? result[0].max_no + 1 : 1;
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const formattedReqNo = `EXP${today}${String(nextNumber).padStart(4, '0')}`;

      res.json({
        request_number: formattedReqNo,
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



// 2. Create a new claim
exports.createExpenseClaim = (req, res) => {
  const { req_no, total_expense, requester_comments, items } = req.body;
  const empCode = req.session.user.employee_id;

  const getRequesterIdSql = `SELECT id FROM employees WHERE employee_id = ?`;

  db.query(getRequesterIdSql, [empCode], (err0, empResult) => {
    if (err0 || empResult.length === 0) {
      return res.status(500).send({ error: "Invalid employee_id in session" });
    }

    const requester_id = empResult[0].id;

    const claimSql = `
    INSERT INTO expense_claim (req_no, total_expense, requester_comments, requester_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, NOW(), NOW())
  `;
    db.query(claimSql, [req_no, total_expense, requester_comments, requester_id], (err, result) => {
      if (err) return res.status(500).send({ error: err.message });

      const claim_id = result.insertId;
      const itemSql = `
      INSERT INTO expense_items (claim_id, date, expense_type, description, currency, each_rate, amount, total)
      VALUES ?
    `;
      const itemValues = items.map(item => [
        claim_id, item.date, item.expense_type, item.description, item.currency,
        item.each_rate, item.amount, item.total
      ]);

      db.query(itemSql, [itemValues], (err2) => {
        if (err2) return res.status(500).send({ error: err2.message });

        const matrixSql = `SELECT * FROM approval_matrix WHERE request_type = 'expense_claim' ORDER BY level ASC`;
        db.query(matrixSql, (err3, approvers) => {
          if (err3) return res.status(500).send({ error: err3.message });


          // Insert ALL level 1 approvers
          const level1Approvers = approvers.filter(a => a.level === 1);
          if (level1Approvers.length === 0) {
            return res.status(500).send({ error: "No level 1 approvers found" });
          }

          const approvalSql = `
          INSERT INTO expense_approvals (req_no, approver_id, level, status)
          VALUES ?
          `;
          const values = level1Approvers.map(a => [req_no, a.approver_user_id, a.level, 'Pending']);
          db.query(approvalSql, [values], (errInsert) => {
            if (errInsert) return res.status(500).send({ error: errInsert.message });


            // Notify requester
            const requesterSql = `
          SELECT u.email, CONCAT(e.first_name, ' ', e.last_name) AS full_name 
          FROM users u 
          JOIN employees e ON u.email = e.email  
          WHERE e.id = ?
        `;
            db.query(requesterSql, [requester_id], (err4, requesterResult) => {
              if (err4) return res.status(500).send({ error: err4.message });

              if (!requesterResult || requesterResult.length === 0) {
                console.error(`❌ No requester found for ID ${requester_id}`);
                return res.status(404).send({ error: "Requester not found. Please verify the requester_id and user-employee mapping." });
              }

              const requesterEmail = requesterResult[0].email;
              const requesterName = requesterResult[0].full_name;
              const requesterMsg = `You submitted an expense claim`;
              const requesterLink = `/myexpense.html?reqNo=${req_no}`;

              db.query(
                `INSERT INTO notifications (email, message, link, status, created_at, updated_at)
             VALUES (?, ?, ?, 'unread', NOW(), NOW())`,
                [requesterEmail, requesterMsg, requesterLink],
                (err) => {
                  if (!err) {
                    sendNotificationToUser(requesterEmail, requesterMsg, requesterLink);
                  }
                }
              );

              // Notify Level 1 approvers
              const level1Approvers = approvers.filter(a => a.level === 1);
              level1Approvers.forEach((approver) => {
                const getApproverEmail = `SELECT email FROM users WHERE id = ?`;
                db.query(getApproverEmail, [approver.approver_user_id], (err5, emailResult) => {
                  if (emailResult?.length > 0) {
                    const email = emailResult[0].email;
                    const msg = `${requesterName} submitted an expense claim for your approval`;
                    const link = `/expense-approval.html?type=expense&reqNo=${req_no}`;
                    db.query(
                      `INSERT INTO notifications (email, message, link, status, created_at, updated_at)
                       VALUES (?, ?, ?, 'unread', NOW(), NOW())`,
                      [email, msg, link],
                      (err2) => {
                        if (!err2) {
                          sendNotificationToUser(email, msg, link);
                        }
                      }
                    );
                  }
                });
              });

              res.send({ success: true, req_no, message: `Expense claim ${req_no} submitted successfully.` });
            });
          });
        });
      });
    });
  });
};


// 3. Approve/Reject - now correctly outside
exports.updateExpenseApproval = (req, res) => {
  const { req_no, approver_id, status, comments } = req.body;

  const updateSql = `
    UPDATE expense_approvals 
    SET status = ?, comments = ?, approved_at = NOW() 
    WHERE req_no = ? AND approver_id = ?
  `;

  db.query(updateSql, [status, comments, req_no, approver_id], (err) => {
    if (err) return res.status(500).json({ error: err });

    //  Skip other same-level approvers
    const skipSql = `
      UPDATE expense_approvals 
      SET status = 'Skipped'
      WHERE req_no = ? 
      AND level = (
        SELECT level FROM expense_approvals WHERE req_no = ? AND approver_id = ?
      )
      AND approver_id != ?
      AND status = 'Pending'
    `;
    db.query(skipSql, [req_no, req_no, approver_id, approver_id]);


    //  Update notification message for the approver
    const getRequesterName = `
    SELECT CONCAT(e.first_name, ' ', e.last_name) AS full_name 
    FROM expense_claim c
    JOIN employees e ON c.requester_id = e.id
    WHERE c.req_no = ?
    `;

    db.query(getRequesterName, [req_no], (errN, nameRes) => {
      if (errN || nameRes.length === 0) return;

      const requesterName = nameRes[0].full_name;
      const approverMessage = status.toLowerCase() === "approved"
        ? `You approved ${requesterName}'s expense claim`
        : `You rejected ${requesterName}'s expense claim`;

      const approverLink = `/expense-approval.html?type=expense&reqNo=${req_no}`;

      const approverEmailSql = `SELECT email FROM users WHERE id = ?`;
      db.query(approverEmailSql, [approver_id], (eErr, eRes) => {
        if (eRes?.length > 0) {
          const approverEmail = eRes[0].email;
          db.query(`
            UPDATE notifications 
            SET message = ?, updated_at = NOW()
            WHERE email = ? AND link = ?
            `,
            [approverMessage, approverEmail, approverLink], (err) => {
              if (!err) {
                sendNotificationToUser(approverEmail, approverMessage, approverLink);
              }
            }
          );
        }
      });
    });


    if (status.toLowerCase() === "approved") {
      console.log("Updating approval with:", { req_no, approver_id, status, comments });

      //  Find next pending approver for this request
      //  Get current level
      const currentLevelSql = `
       SELECT level FROM expense_approvals 
       WHERE req_no = ? AND approver_id = ?
       `;
      db.query(currentLevelSql, [req_no, approver_id], (errL, levelRes) => {
        if (errL) return res.status(500).json({ error: errL.message });

        if (!levelRes || levelRes.length === 0) {
          return res.status(404).json({
            success: false,
            message: `Approval level not found for req_no ${req_no} and approver_id ${approver_id}`
          });
        }

        const currentLevel = levelRes[0].level;
        const nextLevel = currentLevel + 1;

        //  Find next-level approvers from approval_matrix
        const nextApproversSql = `
         SELECT approver_user_id FROM approval_matrix
         WHERE request_type = 'expense_claim' AND level = ?
         `;
        db.query(nextApproversSql, [nextLevel], (errN, approverRows) => {
          if (errN) return res.status(500).json({ error: errN.message });

          if (approverRows.length > 0) {
            //  Insert next-level approvers into expense_approvals
            const insertSql = `
             INSERT INTO expense_approvals (req_no, approver_id, level, status)
             VALUES (?, ?, ?, 'Pending')
             `;

            approverRows.forEach((row) => {
              db.query(insertSql, [req_no, row.approver_user_id, nextLevel], (errInsert) => {
                if (errInsert) console.error("Error inserting next approver:", errInsert);

                const msg = `New Expense Claim ${req_no} requires your approval`;
                const link = `/expense-approval.html?type=expense&reqNo=${req_no}`;
                const emailSql = `SELECT email FROM users WHERE id = ?`;

                db.query(emailSql, [row.approver_user_id], (eErr, eRes) => {
                  if (eErr) console.error("Error fetching email:", eErr);
                  if (eRes?.length > 0) {
                    const email = eRes[0].email;
                    db.query(`
                    INSERT INTO notifications (email, message, link, status, created_at, updated_at)
                    VALUES (?, ?, ?, 'unread', NOW(), NOW())
                     `, [email, msg, link], (errNotif) => {
                      if (errNotif)
                        console.error("Error inserting notification:", errNotif);
                      sendNotificationToUser(email, msg, link);
                    });
                  }
                });
              });
            });

            res.status(200).json({ message: "Next level approvers notified" });
            // Update requester's notification to "under process"
            const getRequester = `SELECT requester_id FROM expense_claim WHERE req_no = ?`;
            db.query(getRequester, [req_no], (err4, requesterResult) => {
              if (err4) console.error("Error getting requester:", err4);
              else {
                const requesterId = requesterResult[0].requester_id;
                const getEmail = `SELECT email FROM employees WHERE id = ?`;
                db.query(getEmail, [requesterId], (errE, emailRes) => {
                  if (errE) console.error("Error getting requester email:", errE);
                  else if (emailRes?.length > 0) {
                    const requesterEmail = emailRes[0].email;
                    const updateMessage = `Your expense claim is under process`;
                    const link = `/myexpense.html?reqNo=${req_no}`;
                    db.query(`UPDATE notifications 
                     SET message = ?, updated_at = NOW()
                     WHERE email = ? AND link = ?`,
                      [updateMessage, requesterEmail, link], (err) => {
                        if (!err) {
                          sendNotificationToUser(requesterEmail, updateMessage, link);
                        }
                      }
                    );
                  }
                });
              }
            });
          } else {
            // expence_claim status approve after 2 approval
            const updateClaimStatus = `UPDATE expense_claim SET status = 'Approved' WHERE req_no = ?`;
            db.query(updateClaimStatus, [req_no]);

            // Update requester's notification message to “under process”
            const getRequester = `SELECT requester_id FROM expense_claim WHERE req_no = ?`;
            db.query(getRequester, [req_no], (err4, requesterResult) => {
              if (err4) return res.status(500).json({ error: err4 });

              const requesterId = requesterResult[0].requester_id;
              const getEmail = `SELECT email FROM employees WHERE id = ?`;

              db.query(getEmail, [requesterId], (errE, emailRes) => {
                if (errE) return res.status(500).json({ error: errE });

                if (!emailRes || emailRes.length === 0) {
                  console.error("❌ No email found for requester with ID:", requesterId);
                  return res.status(404).json({ message: "Requester email not found." });
                }

                const requesterEmail = emailRes[0].email;
                const updateMessage = `✅ Your expense claim ${req_no} has been approved.`;
                const link = `/myexpense.html?reqNo=${req_no}`;

                db.query(
                  `UPDATE notifications 
                  SET message = ?, updated_at = NOW()
                  WHERE email = ? AND link = ?`,
                  [updateMessage, requesterEmail, link],
                  (err6) => {
                    sendNotificationToUser(requesterEmail, updateMessage, link);
                    if (err6) return res.status(500).json({ error: err6 });

                    res.status(200).json({ message: "Fully approved and requester notified" });
                  }
                );
              });
            });
          }
        });
      });

    } else if (status.toLowerCase() === "rejected") {
      const updateRejectStatus = `
      UPDATE expense_claim 
      SET status = 'Rejected', 
      rejected_by = ?, 
      rejection_reason = ?,
      updated_at = NOW()
      WHERE req_no = ?
      `;
      db.query(updateRejectStatus, [approver_id, comments, req_no]);
      // ✅ Rejection flow
      const getRequester = `SELECT requester_id FROM expense_claim WHERE req_no = ?`;
      db.query(getRequester, [req_no], (err5, requesterResult) => {
        if (err5) return res.status(500).json({ error: err5 });

        const requesterId = requesterResult[0].requester_id;
        const emailQuery = `SELECT email FROM employees WHERE id = ?`;

        db.query(emailQuery, [requesterId], (err6, emailResult) => {
          if (err6) return res.status(500).json({ error: err6 });

          const requesterEmail = emailResult[0].email;
          const rejectedMsg = `❌ Your Expense Claim ${req_no} has been rejected.`;
          const link = `/myexpense.html?reqNo=${req_no}`;

          db.query(
            `UPDATE notifications 
             SET message = ?, updated_at = NOW() 
            WHERE email = ? AND link = ?`,
            [rejectedMsg, requesterEmail, link], (err7) => {
              if (err7) return res.status(500).json({ error: err7 });

              // push notification
              sendNotificationToUser(requesterEmail, rejectedMsg, link);

              res.status(200).json({
                message: "Expense claim rejected and requester notified"
              });
            });
        });
      });
    } else {
      res.status(200).json({ message: "Approval status updated" });
    }
  });
};


// pop-up details 
exports.getExpenseClaimByReqNo = (req, res) => {
  const { req_no } = req.params;
  const approver_id = req.query.approver_id;

  if (!approver_id) {
    return res.status(400).send({ error: "Approver ID is required" });
  }

  // Step 1: Get claim + employee + department info
  const claimSql = `
    SELECT 
      ec.id AS claim_id,
      ec.req_no,
      ec.status, 
      ec.total_expense,
      ec.requester_comments,
      ec.created_at AS claim_date,
      CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
      e.email,
      d.department_name,
       CONCAT(rej.first_name, ' ', rej.last_name) AS rejected_by_name,
      ec.rejection_reason
    FROM expense_claim ec
    JOIN employees e ON ec.requester_id = e.id
    JOIN department d ON e.department_id = d.id
    LEFT JOIN users rej ON ec.rejected_by = rej.id
    WHERE ec.req_no = ?
  `;

  db.query(claimSql, [req_no], (err, claimRows) => {
    if (err) return res.status(500).send({ error: err.message });
    if (claimRows.length === 0) return res.status(404).send({ error: "Claim not found" });

    const claim = claimRows[0];

    // Get current approver's status
    const approverSql = `
      SELECT status 
      FROM expense_approvals
      WHERE req_no = ? AND approver_id = ?
    `;

    db.query(approverSql, [req_no, approver_id], (err, approverRows) => {
      if (err) return res.status(500).send({ error: err.message });

      const userStatus = approverRows.length > 0 ? approverRows[0].status : null;


      // Step 2: Get all expense items for this claim
      const itemsSql = `SELECT date, expense_type, description, amount FROM expense_items WHERE claim_id = ?`;

      db.query(itemsSql, [claim.claim_id], (err, itemRows) => {
        if (err) return res.status(500).send({ error: err.message });

        // Step 3: Return full structured response
        res.json({
          req_no: claim.req_no,
          status: claim.status,
          employee_name: claim.employee_name,
          email: claim.email,
          department: claim.department_name,
          date: claim.claim_date,
          amount: claim.total_expense,
          requester_comments: claim.requester_comments,
          rejected_by: claim.rejected_by_name,
          rejection_reason: claim.rejection_reason,
          items: itemRows,
          user_status: userStatus
        });
      });
    });
  });
};

// 4. View claim history
exports.getExpenseClaimsByUser = (req, res) => {
  const { requester_id } = req.query;
  const sql = `SELECT * FROM expense_claim WHERE requester_id = ? ORDER BY created_at DESC`;
  db.query(sql, [requester_id], (err, results) => {
    if (err) return res.status(500).send({ error: err.message });
    res.send(results);
  });
};




// approver fronted table with filtration 

exports.getExpenseApprovals = (req, res) => {
  if (!req.session.user || !req.session.user.user_id) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }

  const approverId = req.session.user.user_id;

  // ---- READ QUERY FILTERS ----
  const status = req.query.status || "all";
  const search = req.query.search ? req.query.search.trim() : "";
  const startDate = req.query.start_date || "";
  const endDate = req.query.end_date || "";
  const isReport = req.query.report === "1";

  // ---- BASE QUERY ----
  let sql = `
    SELECT 
      ec.id,
      ec.req_no,
      ec.created_at,

      ei.amount,
      ea.status,
      ec.status AS final_status, 

      CONCAT(emp.first_name, ' ', emp.last_name) AS requester_name,
      ei.expense_type

    FROM expense_claim ec
    JOIN expense_approvals ea ON ec.req_no = ea.req_no
    JOIN employees emp ON ec.requester_id = emp.id
    JOIN expense_items ei ON ei.claim_id = ec.id

    WHERE ea.approver_id = ?
  `;

  const params = [approverId];

  // ---- STATUS FILTER ----
  if (status !== "all") {
    sql += " AND ea.status = ? ";
    params.push(status);
  }

  // ---- SEARCH FILTER (REQUESTER NAME) ----
  if (search) {
    sql += " AND CONCAT(emp.first_name, ' ', emp.last_name) LIKE ? ";
    params.push(`%${search}%`);
  }

  // ---- DATE RANGE FILTER ----
  if (startDate && endDate) {
    sql += " AND DATE(ec.created_at) BETWEEN ? AND ? ";
    params.push(startDate, endDate);
  } else if (startDate) {
    sql += " AND DATE(ec.created_at) >= ? ";
    params.push(startDate);
  } else if (endDate) {
    sql += " AND DATE(ec.created_at) <= ? ";
    params.push(endDate);
  }

  sql += `
    GROUP BY ec.id
    ORDER BY ec.id DESC;
  `;

  // ---- RUN QUERY ----
  db.query(sql, params, (err, results) => {
    if (err) {
      console.error("Error fetching expense approvals:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    // ---- REPORT DOWNLOAD ----
    if (isReport) {
      const header = [
        "ID", "Request No", "Created At", "Requester", "Expense Type", "Amount", "Status", "Final Status"
      ];

      const csv = [
        header.join(","),
        ...results.map(r => [
          r.id,
          `"${r.req_no}"`,
          `"${r.created_at}"`,
          `"${r.requester_name}"`,
          `"${r.expense_type}"`,
          r.amount,
          `"${r.status}"`,
          `"${r.final_status}"`
        ].join(","))
      ].join("\n");

      res.setHeader("Content-Disposition", `attachment; filename=expense-report-${Date.now()}.csv`);
      res.setHeader("Content-Type", "text/csv");
      return res.send(csv);
    }

    // NORMAL JSON RESPONSE
    res.json(results);
  });
};





//  employee own frontend table
exports.getMyExpenseRequests = (req, res) => {
  if (!req.session.user || !req.session.user.employee_id) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }

  const requesterId = req.session.user.employee_id;
  const status = req.query.status;

  let sql = `
    SELECT 
      ec.id,
      ec.req_no,
      ec.total_expense AS amount,
      CONCAT(emp.first_name, ' ', emp.last_name) AS requester_name,
    COALESCE((
      SELECT ea.status 
      FROM expense_approvals ea 
      WHERE ea.req_no = ec.req_no 
      ORDER BY ea.level DESC, ea.id DESC 
      LIMIT 1
    ), 'Pending') AS status
    FROM 
      expense_claim ec
    JOIN 
      employees emp ON ec.requester_id = emp.id
    WHERE 
      emp.employee_id = ?
  `;

  const params = [requesterId];

  if (status && status !== "all") {
    sql += ` HAVING status = ?`;
    params.push(status.charAt(0).toUpperCase() + status.slice(1));
  }

  sql += ` ORDER BY ec.id DESC`;

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error("Error fetching user expense requests:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    res.json(results);
  });
};




exports.trackExpenseApproval = (req, res) => {
  const reqNo = req.params.req_no;

  const sql = `
SELECT 
  ea.approver_id,
  ea.status,
  ea.approved_at AS date,
  CONCAT(u.first_name, ' ', u.last_name) AS approved_by_name
FROM expense_approvals ea
LEFT JOIN users u ON ea.approver_id = u.id
WHERE ea.req_no = ?
ORDER BY ea.level ASC
`;

  db.query(sql, [reqNo], (err, results) => {
    if (err) {
      console.error("❌ Error fetching expense approval tracking:", err);
      return res.status(500).json({ success: false, message: "Tracking fetch failed" });
    }
    res.json(results);
  });
};


