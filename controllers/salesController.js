const db = require("../db");
const { sendNotificationToUser } = require("../services/pushService");

// Generate next request number for sales
function generateSalesReqNo(callback) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  const sql = `SELECT MAX(CAST(SUBSTRING(req_no, 13) AS UNSIGNED)) AS max_no FROM sales`;
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error generating req no:", err);
      return callback("INS" + today + "0001");
    }

    const nextNumber = result[0].max_no ? result[0].max_no + 1 : 1;
    const newReqNo = `INS${today}${String(nextNumber).padStart(4, '0')}`;
    callback(newReqNo);
  });
}


// Fetch logged-in employee information
exports.getSalesPersonalInfo = (req, res) => {
  const userEmail = req.session.user?.email;

  if (!userEmail) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const sql = `
    SELECT 
      e.id AS employee_db_id,
      e.employee_id,
      CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
      d.department_name AS department,
      e.designation,
      lm.name AS line_manager,
      e.doj AS joining_date,
      e.company_id
    FROM employees e
    JOIN department d ON e.department_id = d.id
    JOIN line_managers lm ON e.line_manager_id = lm.id
    WHERE e.email = ?
  `;

  db.query(sql, [userEmail], (err, rows) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (rows.length === 0) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const info = rows[0];

    // Generate Request Number
    generateSalesReqNo((reqNo) => {
      res.json({
        request_number: reqNo,
        request_date: new Date().toISOString().split("T")[0],
        employee_id: info.employee_id,
        employee_name: info.employee_name,
        department: info.department,
        designation: info.designation,
        line_manager: info.line_manager,
        joining_date: info.joining_date,
        requester_id: info.employee_db_id
      });
    });
  });
};




// Submit Sales Incentive Request
exports.submitSalesRequest = (req, res) => {
  const { req_no, remarks, items } = req.body;
  const attachments = req.body.file_paths || [];
  const empCode = req.session.user.employee_id;
  // 1️⃣ Get requester employee.id
  const requesterSql = `SELECT id FROM employees WHERE employee_id = ?`;
  db.query(requesterSql, [empCode], (err0, empRes) => {
    if (err0 || empRes.length === 0)
      return res.status(500).send({ error: "Invalid employee_id in session" });

    const requester_id = empRes[0].id;

    // 2️⃣ Insert into sales (same as petrol_claim)
    const insertSalesSql = `
      INSERT INTO sales (req_no, requester_id, status, attachments, created_at, updated_at)
      VALUES (?, ?, 'Pending', ?, NOW(), NOW())
    `;
    db.query(insertSalesSql, [req_no, requester_id, JSON.stringify(attachments)], (err1, result) => {
      if (err1) return res.status(500).send({ error: err1.message });

      const sale_id = result.insertId;

      // 3️⃣ Insert sales_items (same style as petrol_items)
      const itemSql = `
        INSERT INTO sales_items 
        (sale_id, applied_date, date_of_booking, representative_id, project_id, typo_id, status_id, dimension_sqft)
        VALUES ?
      `;

      const itemValues = items.map(i => [
        sale_id,
        i.applied_date,
        i.date_of_booking,
        i.representative_id,
        i.project_id,
        i.typo_id,
        i.status_id,
        i.dimension_sqft,
      ]);

      db.query(itemSql, [itemValues], err2 => {
        if (err2) return res.status(500).send({ error: err2.message });

        // 4️⃣ Read approvers from sales_flow (same as petrol_matrix)
        const matrixSql = `
          SELECT * FROM sales_flow
          WHERE request_type='sales_incentive'
          ORDER BY level ASC
        `;
        db.query(matrixSql, (err3, approvers) => {
          if (err3) return res.status(500).send({ error: err3.message });

          // Level-1 approvers
          const level1 = approvers.filter(a => a.level === 1);
          if (!level1.length)
            return res.status(500).send({ error: "No level-1 approver found" });

          // 5️⃣ Insert approval rows into sales_approval
          const approvalSql = `
            INSERT INTO sales_approval (req_no, approver_id, level, status)
            VALUES (?, ?, ?, 'Pending')
          `;
          level1.forEach(a => {
            db.query(approvalSql, [req_no, a.approver_user_id, a.level]);
          });

          // 6️⃣ Notify requester (same petrol logic)
          const getEmailSql = `
            SELECT u.email, CONCAT(e.first_name,' ',e.last_name) AS full_name
            FROM users u
            JOIN employees e ON u.email=e.email
            WHERE e.id=?
          `;
          db.query(getEmailSql, [requester_id], (err4, reqInfo) => {
            if (err4 || !reqInfo.length)
              return res.status(500).send({ error: "Requester not found" });

            const requesterEmail = reqInfo[0].email;
            const requesterName = reqInfo[0].full_name;

            const requesterMsg = `You submitted a Sales Incentive Request`;
            const requesterLink = `/my-sales.html?reqNo=${req_no}`;

            db.query(`
              INSERT INTO notifications (email, message, link, status, created_at, updated_at)
              VALUES (?, ?, ?, 'unread', NOW(), NOW())
            `, [requesterEmail, requesterMsg, requesterLink], (err) => {
              if (!err) {
                sendNotificationToUser(
                  requesterEmail,
                  requesterMsg,
                  requesterLink
                );
              }
            });

            // 7️⃣ Notify approvers
            level1.forEach(a => {
              db.query(`SELECT email FROM users WHERE id=?`, [a.approver_user_id], (err5, emailRes) => {
                if (emailRes?.length) {
                  const email = emailRes[0].email;
                  const msg = `${requesterName} submitted Sales Incentive ${req_no} for your approval`;
                  const link = `/sales-approver.html?reqNo=${req_no}`;
                  db.query(`
                    INSERT INTO notifications (email, message, link, status, created_at, updated_at)
                    VALUES (?, ?, ?, 'unread', NOW(), NOW())
                  `, [email, msg, link], (err) => {
                    if (!err) {
                      sendNotificationToUser(email, msg, link);
                    }
                  });
                }
              });
            });

            return res.send({
              success: true,
              req_no,
              message: `Sales Incentive Request ${req_no} submitted successfully`
            });
          });
        });
      });
    });
  });
};



// Update Sales Approval (approve / reject)
exports.updateSalesApproval = (req, res) => {
  const { req_no, approver_id, status, comments } = req.body;

  // Pre-check (same petrol logic)
  db.query(
    "SELECT status FROM sales_approval WHERE req_no=? AND approver_id=?",
    [req_no, approver_id],
    (err, rows) => {

      if (rows.length && rows[0].status.toLowerCase() !== 'pending')
        return res.status(400).json({ message: "Already acted on this request" });


      // ⭐ CREATE OR UPDATE SALES ITEMS (Approver edits + Add Row)
      if (req.body.updatedItems && Array.isArray(req.body.updatedItems)) {
        req.body.updatedItems.forEach(item => {

          // ⭐ CASE 1: NEW ROW → INSERT
          if (!item.id || item.id === "" || item.id === null) {
            db.query(`
        INSERT INTO sales_items 
          (sale_id, applied_date, date_of_booking, representative_id, project_id, typo_id, status_id, dimension_sqft, incentive_type, earned_incentive, total_incentive, created_at)
        VALUES
          ((SELECT id FROM sales WHERE req_no=?), ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `,
              [
                req.body.req_no,                   // sale_id (via req_no)
                item.applied_date,
                item.date_of_booking,
                item.representative_id,
                item.project_id,
                item.typo_id,
                item.status_id,
                item.dimension_sqft,
                item.incentive_type,
                item.earned_incentive,
                item.total_incentive
              ]);
          }

          // ⭐ CASE 2: EXISTING ROW → UPDATE
          else {
            db.query(`
            UPDATE sales_items SET
            applied_date = ?,
            date_of_booking = ?,
            representative_id = ?,
            project_id = ?,
            typo_id = ?,
            status_id = ?,
            dimension_sqft = ?,
            incentive_type = ?,
            earned_incentive = ?,
            total_incentive = ?,
            updated_at = NOW()
            WHERE id = ?
            `,
              [
                item.applied_date,
                item.date_of_booking,
                item.representative_id,
                item.project_id,
                item.typo_id,
                item.status_id,
                item.dimension_sqft,
                item.incentive_type,
                item.earned_incentive,
                item.total_incentive,
                item.id
              ]);
          }

        });
      }

      // ⭐ INSERT APPROVAL HISTORY ROWS
      if (req.body.approvalHistory && Array.isArray(req.body.approvalHistory)) {
        req.body.approvalHistory.forEach(entry => {
          db.query(`
            INSERT INTO sales_approval_history
            (sale_id, approver_type, approver_name, approval_date, remarks)
            VALUES (
            (SELECT id FROM sales WHERE req_no=?),
            ?, ?, ?, ?
            )
            ON DUPLICATE KEY UPDATE
            approver_name = VALUES(approver_name),
            approval_date = VALUES(approval_date),
            remarks = VALUES(remarks)
            `,
            [
              req.body.req_no,
              entry.approver_type,
              entry.approver_name,
              entry.approval_date,
              entry.remarks
            ]);
        });
      }


      // 1️⃣ Update current approver
      const updateSql = `
        UPDATE sales_approval 
        SET status=?, updated_at=NOW()
        WHERE req_no=? AND approver_id=?
      `;
      db.query(updateSql, [status, req_no, approver_id]);

      // Notify approver about their own action (same petrol)
      const getReqNameSql = `
        SELECT CONCAT(e.first_name,' ',e.last_name) AS full_name
        FROM sales s
        JOIN employees e ON s.requester_id=e.id
        WHERE s.req_no=?
      `;
      db.query(getReqNameSql, [req_no], (err2, reqInfo) => {
        if (!err2 && reqInfo.length > 0) {
          const requesterName = reqInfo[0].full_name;
          const message = status === "approved"
            ? `You approved ${requesterName}'s sales request`
            : `You rejected ${requesterName}'s sales request`;

          const link = `/sales-approver.html?reqNo=${req_no}`;

          db.query(`SELECT email FROM users WHERE id=?`, [approver_id], (err3, approverEmailRes) => {
            if (approverEmailRes?.length) {
              db.query(`
                UPDATE notifications SET message=?, updated_at=NOW()
                WHERE email=? AND link=?
              `, [message, approverEmailRes[0].email, link],
                (err) => {
                  if (!err) {
                    sendNotificationToUser(
                      approverEmailRes[0].email,
                      message,
                      link
                    );
                  }
                }
              );
            }
          });
        }
      });

      // 2️⃣ Skip same level approvers
      const skipSql = `
        UPDATE sales_approval 
        SET status='Skipped'
        WHERE req_no=? 
        AND level = (SELECT level FROM sales_approval WHERE req_no=? AND approver_id=?)
        AND approver_id!=?
      `;
      db.query(skipSql, [req_no, req_no, approver_id, approver_id]);

      // APPROVED FLOW (same exact petrol logic)
      if (status.toLowerCase() === 'approved') {
        const levelSql = `SELECT level FROM sales_approval WHERE req_no=? AND approver_id=?`;
        db.query(levelSql, [req_no, approver_id], (err4, levelRes) => {
          if (err4) return res.status(500).json({ message: err4.message });
          if (!levelRes?.length) return res.status(404).json({ message: "Approver level not found" });

          const currentLevel = levelRes[0].level;
          const nextLevel = currentLevel + 1;

          // Find next-level approvers
          const nextLvlSql = `
            SELECT approver_user_id FROM sales_flow
            WHERE request_type='sales_incentive' AND level=?
          `;
          db.query(nextLvlSql, [nextLevel], (err5, nextRows) => {

            // If next approvers exist → insert & notify
            if (nextRows.length > 0) {
              nextRows.forEach(row => {
                db.query(`
                  INSERT INTO sales_approval (req_no, approver_id, level, status)
                  VALUES (?, ?, ?, 'Pending')
                `, [req_no, row.approver_user_id, nextLevel]);

                db.query(`SELECT email FROM users WHERE id=?`, [row.approver_user_id], (eErr, eRes) => {
                  if (eRes?.length) {
                    const msg = `Sales Request ${req_no} requires your approval`;
                    const link = `/sales-approver.html?reqNo=${req_no}`;
                    db.query(`
                      INSERT INTO notifications (email, message, link, status, created_at, updated_at)
                      VALUES (?, ?, ?, 'unread', NOW(), NOW())
                    `, [eRes[0].email, msg, link], (err) => {
                      if (!err) {
                        sendNotificationToUser(eRes[0].email, msg, link);
                      }
                    });
                  }
                });
              });

              // Notify requester "under process"
              db.query(`
                SELECT e.email FROM sales s
                JOIN employees e ON s.requester_id=e.id
                WHERE s.req_no=?
              `, [req_no], (err6, reqEmailRes) => {
                if (reqEmailRes?.length) {
                  db.query(`
                    UPDATE notifications SET message='Your sales request is under process', updated_at=NOW()
                    WHERE email=? AND link=?
                  `, [reqEmailRes[0].email, `/my-sales.html?reqNo=${req_no}`],
                    (err) => {
                      if (!err) {
                        sendNotificationToUser(
                          reqEmailRes[0].email,
                          "Your sales request is under process",
                          `/my-sales.html?reqNo=${req_no}`
                        );
                      }
                    }
                  );
                }
              });

              return res.json({ message: "Next level approvers notified" });
            }

            // FINAL APPROVAL (no next levels)
            db.query(`UPDATE sales SET status='Approved' WHERE req_no=?`, [req_no]);

            db.query(`
              SELECT e.email FROM sales s
              JOIN employees e ON s.requester_id=e.id
              WHERE s.req_no=?
            `, [req_no], (err7, reqEmailRes) => {
              if (reqEmailRes?.length) {
                db.query(`
                  UPDATE notifications SET message=?, updated_at=NOW()
                  WHERE email=? AND link=?
                `, [`Your sales request ${req_no} has been approved`, reqEmailRes[0].email, `/my-sales.html?reqNo=${req_no}`],
                  (err) => {
                    if (!err) {
                      sendNotificationToUser(
                        reqEmailRes[0].email,
                        `Your sales request ${req_no} has been approved`,
                        `/my-sales.html?reqNo=${req_no}`
                      );
                    }
                  }
                );
              }
            });

            res.json({ message: "Sales request fully approved" });
          });
        });

      } else if (status.toLowerCase() === 'rejected') {
        // REJECT FLOW (same petrol logic)
        db.query(`
          UPDATE sales SET status='Rejected', rejected_by=?, rejection_reason=?, updated_at=NOW()
          WHERE req_no=?
        `, [approver_id, comments, req_no]);

        // Notify requester
        db.query(`
          SELECT e.email FROM sales s
          JOIN employees e ON s.requester_id=e.id
          WHERE s.req_no=?
        `, [req_no], (err8, reqEmailRes) => {
          if (reqEmailRes?.length) {
            db.query(`
              UPDATE notifications SET message=?, updated_at=NOW()
              WHERE email=? AND link=?
            `, [`❌ Your sales request ${req_no} has been rejected`, reqEmailRes[0].email, `/my-sales.html?reqNo=${req_no}`],
              (err) => {
                if (!err) {
                  sendNotificationToUser(
                    reqEmailRes[0].email,
                    `❌ Your sales request ${req_no} has been rejected`,
                    `/my-sales.html?reqNo=${req_no}`
                  );
                }
              }
            );
          }
        });

        res.json({ message: "Sales request rejected" });
      }
    }
  );
};



// pre-fetch data for approver to take action
exports.getSalesByReqNo = (req, res) => {
  const req_no = req.params.req_no;

  const saleSql = `
        SELECT 
            s.id AS sale_id,
            s.req_no,
            s.status,
            s.attachments,
            s.rejection_reason,
            s.rejected_by,
            CONCAT(u2.first_name, ' ', u2.last_name) AS rejected_by_name,
            s.created_at,

            e.employee_id,
            CONCAT(e.first_name, ' ', e.last_name) AS requester_name,
            d.department_name AS department,
            e.designation,
            e.doj AS joining_date,
            CONCAT(m.first_name, ' ', m.last_name) AS line_manager

        FROM sales s
        JOIN employees e ON s.requester_id = e.id
        LEFT JOIN department d ON e.department_id = d.id
        LEFT JOIN employees m ON e.line_manager_id = m.id
        LEFT JOIN users u2 ON s.rejected_by = u2.id
        WHERE s.req_no = ?
    `;

  db.query(saleSql, [req_no], (err, saleRes) => {
    if (err) return res.status(500).json({ error: err });
    if (!saleRes.length) return res.status(404).json({ error: "Invalid req_no" });

    const sale = saleRes[0];
    // Convert JSON string to array
    try {
      sale.attachments = sale.attachments
        ? JSON.parse(sale.attachments)
        : [];
    } catch (e) {
      console.error("Attachment JSON parse failed:", e, sale.attachments);
      sale.attachments = [];
    }


    // 🔥 Corrected items query
    const itemsSql = `
            SELECT 
                si.*,
                CONCAT(rep.first_name, ' ', rep.last_name) AS representative_name,
                p.project_name,
                t.typo_name,
                st.status_name
            FROM sales_items si
            LEFT JOIN employees rep ON si.representative_id = rep.id
            LEFT JOIN projects p ON si.project_id = p.id
            LEFT JOIN typo t ON si.typo_id = t.id
            LEFT JOIN project_status st ON si.status_id = st.id
            WHERE si.sale_id = ?
        `;

    db.query(itemsSql, [sale.sale_id], (err2, itemsRes) => {
      if (err2) return res.status(500).json({ error: err2 });

      // ⭐ 3️⃣ APPROVAL HISTORY QUERY (ADD THIS)
      const historySql = `
          SELECT approver_type, approver_name, approval_date, remarks
          FROM sales_approval_history
          WHERE sale_id = ?
      `;

      db.query(historySql, [sale.sale_id], (err3, historyRes) => {
        if (err3) return res.status(500).json({ error: err3 });

        const approverId = req.session.user?.user_id;

        db.query(
          `SELECT status 
           FROM sales_approval 
           WHERE req_no=? AND approver_id=?`,
          [req_no, approverId],
          (err4, approverRes) => {

            if (err4) return res.status(500).json({ error: err4 });

            const currentApproverStatus =
              approverRes?.length ? approverRes[0].status : "pending";

            // ⭐ FINAL RESPONSE WITH STATUS INCLUDED
            res.json({
              sale,
              items: itemsRes,
              approvalHistory: historyRes,
              currentApproverStatus    // ← ⭐ FRONTEND USES THIS
            });
          }
        );
      });
    });
  });
};






// dropdown options
exports.getDropdownData = (req, res) => {

  const repSql = `
    SELECT id, CONCAT(first_name, ' ', last_name) AS name
    FROM employees
    ORDER BY first_name ASC
  `;

  const typoSql = `
    SELECT id, typo_name AS name
    FROM typo
    ORDER BY typo_name ASC
  `;

  const projectSql = `
    SELECT id, project_name AS name
    FROM projects
    ORDER BY project_name ASC
  `;

  const statusSql = `
    SELECT id, status_name AS name
    FROM project_status
    ORDER BY status_name ASC
  `;

  let dropdown = {};

  // FETCH REPRESENTATIVES
  db.query(repSql, (err, reps) => {
    if (err) return res.status(500).json({ error: "Representative fetch failed" });

    dropdown.representatives = reps;

    // FETCH TYPO
    db.query(typoSql, (err2, typo) => {
      if (err2) return res.status(500).json({ error: "Typo fetch failed" });

      dropdown.typos = typo;

      // FETCH PROJECTS
      db.query(projectSql, (err3, projects) => {
        if (err3) return res.status(500).json({ error: "Project fetch failed" });

        dropdown.projects = projects;

        // FETCH STATUS
        db.query(statusSql, (err4, status) => {
          if (err4) return res.status(500).json({ error: "Status fetch failed" });

          dropdown.statuses = status;

          res.json(dropdown); // FINAL OUTPUT
        });
      });
    });
  });
};



// Delete only sales item table row
exports.deleteSalesItem = (req, res) => {
  const { item_id } = req.params;

  if (!item_id) {
    return res.status(400).json({ error: "item_id missing" });
  }

  const sql = "DELETE FROM sales_items WHERE id = ?";

  db.query(sql, [item_id], (err) => {
    if (err) {
      console.error("Delete item error:", err);
      return res.status(500).json({ error: "Failed to delete row" });
    }

    res.json({ success: true, message: "Row deleted" });
  });
};





// delete that comple request
exports.deleteSale = (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "sale_id missing" });
  }

  console.log("Deleting sale:", id);

  // Step 1: delete items
  db.query("DELETE FROM sales_items WHERE sale_id = ?", [id], (err1) => {
    if (err1) {
      console.error(err1);
      return res.status(500).json({ error: "Failed to delete items" });
    }

    // Step 2: delete approvals
    db.query(
      "DELETE FROM sales_approval WHERE req_no IN (SELECT req_no FROM sales WHERE id = ?)",
      [id],
      (err2) => {
        if (err2) {
          console.error(err2);
          return res.status(500).json({ error: "Failed to delete approvals" });
        }

        // Step 3: delete main sale
        db.query("DELETE FROM sales WHERE id = ?", [id], (err3) => {
          if (err3) {
            console.error(err3);
            return res.status(500).json({ error: "Failed to delete sale" });
          }

          res.json({ success: true, message: "Deleted successfully" });
        });
      }
    );
  });
};





// approver table list
exports.getSalesList = (req, res) => {
  if (!req.session.user || !req.session.user.user_id) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }

  const approverId = req.session.user.user_id;

  // Filters
  const status = req.query.status || "all";
  const search = req.query.name || "";
  const startDate = req.query.start || "";
  const endDate = req.query.end || "";
  const isReport = req.query.report === "1";

  // Base query
  let sql = `
    SELECT
      s.id AS sale_id,
      s.req_no,
      CONCAT(e.first_name, ' ', e.last_name) AS requester_name,
      sa.status AS approver_status,
      s.status AS final_status,
      s.created_at
    FROM sales s
    JOIN sales_approval sa 
        ON sa.req_no = s.req_no 
        AND sa.approver_id = ?
    JOIN employees e 
        ON s.requester_id = e.id
    WHERE 1=1
  `;

  const params = [approverId];

  // Status filter (my status)
  if (status !== "all") {
    sql += " AND LOWER(sa.status) = LOWER(?) ";
    params.push(status);
  }

  // Search filter
  if (search) {
    sql += " AND CONCAT(e.first_name, ' ', e.last_name) LIKE ? ";
    params.push(`%${search}%`);
  }

  // Date filter using sales.created_at
  if (startDate && endDate) {
    sql += " AND DATE(s.created_at) BETWEEN ? AND ? ";
    params.push(startDate, endDate);
  } else if (startDate) {
    sql += " AND DATE(s.created_at) >= ? ";
    params.push(startDate);
  } else if (endDate) {
    sql += " AND DATE(s.created_at) <= ? ";
    params.push(endDate);
  }

  sql += " ORDER BY s.created_at DESC ";

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error("Sales list fetch error:", err);
      return res.status(500).json({ success: false, error: err });
    }

    // CSV Report
    if (isReport) {
      const csv = [
        "Req No,Requester,Approver Status,Final Status,Created At",
        ...results.map(r =>
          `"${r.req_no}","${r.requester_name}","${r.approver_status}","${r.final_status}","${r.created_at}"`
        )
      ].join("\n");

      res.setHeader("Content-Disposition", `attachment; filename=sales-report-${Date.now()}.csv`);
      res.setHeader("Content-Type", "text/csv");
      return res.send(csv);
    }

    res.json({ success: true, data: results });
  });
};




// employee own data table
exports.getMySalesRequests = (req, res) => {

  if (!req.session.user || !req.session.user.employee_id) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }

  const employeeCode = req.session.user.employee_id;
  const statusFilter = req.query.status;

  let sql = `
        SELECT
            s.id,
            s.req_no,
            DATE(s.created_at) AS created_date,
            s.status AS final_status
        FROM sales s
        JOIN employees e ON s.requester_id = e.id
        WHERE e.employee_id = ?
    `;

  const params = [employeeCode];

  if (statusFilter && statusFilter !== "all") {
    sql += ` AND LOWER(s.status) = LOWER(?)`;
    params.push(statusFilter);
  }

  sql += ` ORDER BY s.id DESC`;

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error("Error fetching sales claims:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    res.json(results);
  });
};





// employee tracking 
exports.trackSalesApproval = (req, res) => {
  const { reqNo } = req.params;

  const sql = `
        SELECT 
            sa.level,
            sa.status,
            sa.updated_at AS approval_date,
            sa.approver_id,
            CONCAT(u.first_name, ' ', u.last_name) AS approver_name
        FROM sales_approval sa
        LEFT JOIN users u 
            ON sa.approver_id = u.id
        WHERE sa.req_no = ?
        ORDER BY sa.level ASC
    `;

  db.query(sql, [reqNo], (err, results) => {
    if (err) {
      console.error("❌ Sales tracking error:", err);
      return res.status(500).json({ success: false });
    }
    res.json(results);
  });
};

