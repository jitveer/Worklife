const db = require('../db');
const { sendNotificationToUser } = require("../services/pushService");

function generateReqNo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const datePart = `${year}${month}${day}`;
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `LV-${datePart}-${randomPart}`;
}


// helper for self approval
function notifyLevel(approverUserId, leaveRequestId, requesterName) {
  db.query(
    `SELECT email FROM users WHERE id = ? LIMIT 1`,
    [approverUserId],
    (err, rows) => {
      if (err || rows.length === 0) return;

      const email = rows[0].email;

      db.query(
        `INSERT INTO notifications (email, message, link, status)
         VALUES (?, ?, ?, 'unread')`,
        [
          email,
          `${requesterName} submitted a leave request for your approval.`,
          `/leave-requests-approval.html?leaveId=${leaveRequestId}`
        ],
        (err) => {
          if (!err) {
            sendNotificationToUser(
              email,
              `${requesterName} submitted a leave request for your approval.`,
              `/leave-requests-approval.html?leaveId=${leaveRequestId}`
            );
          }
        }
      );
    }
  );
}

exports.submitLeaveRequest = (req, res) => {
  const filePath = req.file ? `/uploads/medical_certificates/${req.file.filename}` : null;
  const data = req.body;
  const userEmail = req.session.user?.email;
  const approverUserId = req.session.user?.user_id;
  if (!userEmail || !approverUserId) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  // Get personal info
  const personalSql = `
SELECT 
  CONCAT(e.first_name, ' ', e.last_name) AS requester_name,
  d.department_name AS department,
     lm.name AS line_manager
FROM users u
JOIN employees e ON u.email = e.email
JOIN department d ON e.department_id = d.id
LEFT JOIN line_managers lm ON e.line_manager_id = lm.line_manager_id
WHERE u.email = ?
`;

  db.query(personalSql, [userEmail], (err, personalResult) => {
    if (err) {
      console.error("Employee info lookup error:", err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (personalResult.length === 0) {
      return res.status(404).json({ success: false, message: 'Personal info not found' });
    }

    const requesterName = personalResult[0].requester_name;
    const departmentName = personalResult[0].department;
    const lineManagerName = personalResult[0].line_manager_name || "Not Assigned";


    // Get department_id
    const deptSql = "SELECT id FROM department WHERE department_name = ?";
    db.query(deptSql, [departmentName], (err, deptResult) => {
      if (err) {
        console.error("Department lookup error:", err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (deptResult.length === 0) {
        return res.status(404).json({ success: false, message: 'Department not found' });
      }

      const departmentId = deptResult[0].id;
      const reqNo = generateReqNo();

      // Insert leave_request
      const insertSql = `
        INSERT INTO leave_requests (
          req_no, leave_type, total_available_leaves, last_year_carried_forward_days,
          carried_forward_lapse_date, extended_lapsed_days, extended_lapsed_date,
          from_date, to_date, requested_days, remaining_days, location,
          destination, contact_info_1, contact_info_2, contact_info_3,
          medical_certificates, requester_comments, requester_email,
          department_id, requester_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        reqNo,
        data.leave_type,
        data.total_available_leaves,
        data.last_year_carried_forward_days,
        data.carried_forward_lapse_date,
        data.extended_lapsed_days,
        data.extended_lapsed_date,
        data.from_date,
        data.to_date,
        data.requested_days,
        data.remaining_days,
        data.location,
        data.destination,
        data.contact_info_1,
        data.contact_info_2,
        data.contact_info_3,
        filePath,
        data.requester_comments,
        userEmail,
        departmentId,
        requesterName,
      ];

      db.query(insertSql, values, (err, result) => {
        if (err) {
          console.error("Leave request insert error:", err);
          return res.status(500).json({ success: false, message: 'Database error' });
        }

        const leaveId = result.insertId;


        console.log("assignments", data.assignments)


        // Optional: Insert assignment info if provided
        let assignments = [];
        if (data.assignments) {
          try {
            // Parse if it's a string
            assignments = typeof data.assignments === 'string' ? JSON.parse(data.assignments) : data.assignments;
          } catch (err) {
            console.error("Assignments parsing error:", err);
            assignments = [];
          }
        }

        if (assignments.length > 0) {
          const values = assignments.map(a => [leaveId, a.assigned_employee_id, a.task_description]);
          const assignSql = `
          INSERT INTO leave_request_assignments (leave_request_id, assigned_employee_id, task_description)
          VALUES ?
          `;
          db.query(assignSql, [values], (err) => {
            if (err) {
              console.error("Assignment insert error:", err);
            } else {
              // console.log("All assignments inserted successfully.");
            }
          });
        }

        console.log(`Leave request inserted. ID: ${leaveId}`);

        const approverSql = `
          SELECT approver_role_id, specific_user_id, level
          FROM approval_flows
          WHERE department_id = ?
          ORDER BY level ASC
        `;

        db.query(approverSql, [departmentId], (err, approvers) => {
          if (err) {
            console.error("Approvers lookup error:", err);
            return res.status(500).json({ success: false, message: 'Database error' });
          }

          if (approvers.length === 0) {
            return res.status(400).json({ success: false, message: 'No approvers found for this department.' });
          }

          const firstLevel = approvers[0];
          const firstRoleId = firstLevel.approver_role_id;
          const level = firstLevel.level;





          /********************************
  ✅ SELF-REQUEST OVERRIDE (31 / 50)
 *********************************/
          const requesterSql = `
  SELECT id FROM users WHERE email = ?
`;

          db.query(requesterSql, [userEmail], (rqErr, rqRows) => {
            if (rqErr || rqRows.length === 0) {
              return res.status(500).json({ success: false, message: "Requester lookup failed" });
            }

            const requesterUserId = rqRows[0].id;

            if (requesterUserId == 31 || requesterUserId == 50) {

              const L1 = 11;  // first approver

              // Insert Level-1 approver = 11
              db.query(
                `INSERT INTO leave_request_approvals
                (leave_request_id, approver_user_id, level, status)
                VALUES (?, ?, 1, 'pending')`,
                [leaveId, L1]
              );

              // Notify L1
              db.query(
                `SELECT email FROM users WHERE id=?`,
                [L1],
                (e1, r1) => {
                  const email1 = r1?.[0]?.email;
                  if (email1) {
                    db.query(
                      `INSERT INTO notifications (email, message, link, status)
                       VALUES (?, ?, ?, 'unread')`,
                      [
                        email1,
                        `${requesterName} submitted a leave request for your approval.`,
                        `/leave-requests-approval.html?leaveId=${leaveId}`
                      ],
                      (err) => {
                        if (!err) {
                          sendNotificationToUser(email1,
                            `${requesterName} submitted a leave request for your approval.`,
                            `/leave-requests-approval.html?leaveId=${leaveId}`
                          );
                        }
                      }
                    );
                  }

                  // Notify requester
                  db.query(
                    `INSERT INTO notifications (email, message, link, status)
                     VALUES (?, ?, ?, 'unread')`,
                    [
                      userEmail,
                      "Your leave request is under approval process",
                      `/my-request.html?view=${leaveId}`
                    ],
                    (err) => {
                      if (!err) {
                        sendNotificationToUser(
                          userEmail,
                          "Your leave request is under approval process",
                          `/my-request.html?view=${leaveId}`
                        );
                      }
                    }
                  );

                  return res.status(200).json({
                    success: true,
                    message: "Self override → Routed to Level-1 (11)"
                  });
                }
              );

              return; // STOP normal workflow
            }

            // ✅ normal flow continues below




            // normal flow 
            if (firstLevel.specific_user_id) {
              const specificUserId = firstLevel.specific_user_id;

              db.query(
                "SELECT id, email FROM users WHERE id = ?",
                [specificUserId],
                (err, result) => {
                  if (err || result.length === 0) {
                    console.error("Error fetching specific approver:", err);
                    return res.status(500).json({ message: "Specific approver not found" });
                  }

                  const user = result[0];

                  const approvalSql = `
                  INSERT INTO leave_request_approvals (leave_request_id, approver_user_id, level, status)
                  VALUES (?, ?, ?, ?)
                `;
                  db.query(approvalSql, [leaveId, user.id, level, 'pending'], (err) => {
                    if (err) console.error("Insert specific approver error:", err);
                  });

                  db.query(
                    "INSERT INTO notifications (email, message, link, status) VALUES (?, ?, ?, ?)",
                    [
                      user.email,
                      `${requesterName} submitted a leave request for your approval.`,
                      `/leave-requests-approval.html?leaveId=${leaveId}`,
                      "unread"
                    ],
                    (err) => {
                      if (!err) {
                        sendNotificationToUser(
                          user.email,
                          `${requesterName} submitted a leave request for your approval.`,
                          `/leave-requests-approval.html?leaveId=${leaveId}`
                        );
                      }
                    }
                  );

                  db.query(
                    "INSERT INTO notifications (email, message, link, status) VALUES (?, ?, ?, ?)",
                    [
                      userEmail,
                      "You submitted a leave request",
                      `/my-request.html?view=${leaveId}`,
                      "unread"
                    ],
                    (err) => {
                      if (err) console.error(err);
                      return res.status(200).json({
                        success: true,
                        message: `Leave request submitted successfully by ${requesterName}`
                      });
                    }
                  );
                }
              );
            } else {
              db.query(
                "SELECT id, email FROM users WHERE role_id = ?",
                [firstRoleId],
                (err, userResult) => {
                  if (err || userResult.length === 0) {
                    console.error("Error getting users for approver role:", err);
                    return res.status(500).json({ success: false, message: "No users found for approver role" });
                  }

                  let insertedCount = 0;

                  userResult.forEach((user) => {
                    const insertFlowSql = `
                    INSERT INTO leave_request_approvals (leave_request_id, approver_user_id, level)
                    VALUES (?, ?, ?)
                  `;
                    db.query(insertFlowSql, [leaveId, user.id, level], (err) => {
                      if (err) {
                        console.error("Approval flow insert error:", err);
                      }

                      db.query(
                        "INSERT INTO notifications (email, message, link, status) VALUES (?, ?, ?, ?)",
                        [
                          user.email,
                          `${requesterName} submitted a leave request for your approval.`,
                          `/leave-requests-approval.html?leaveId=${leaveId}`,
                          "unread"
                        ],
                        (err) => {
                          if (!err) {
                            sendNotificationToUser(
                              user.email,
                              `${requesterName} submitted a leave request for your approval.`,
                              `/leave-requests-approval.html?leaveId=${leaveId}`
                            );
                          }
                        }
                      );

                      insertedCount++;
                      if (insertedCount === userResult.length) {
                        db.query(
                          "INSERT INTO notifications (email, message, link, status) VALUES (?, ?, ?, ?)",
                          [
                            userEmail,
                            "You submitted a leave request",
                            `/my-request.html?view=${leaveId}`,
                            "unread"
                          ],
                          (err) => {
                            if (!err) {
                              sendNotificationToUser(
                                userEmail,
                                "You submitted a leave request",
                                `/my-request.html?view=${leaveId}`
                              );
                            }

                            return res.status(200).json({
                              success: true,
                              message: `Leave request submitted successfully by ${requesterName}`
                            });
                          }
                        );
                      }
                    });
                  });
                }
              );
            }
          });
        });
      });
    });
  });
};


exports.updateLeaveStatus = (req, res) => {
  const leaveRequestId = req.params.id;
  const { status, reason } = req.body;
  const approverUserId = req.session.user?.user_id;

  if (!approverUserId) {
    return res.status(401).json({ success: false, message: "Not logged in" });
  }

  // 1. CANCELLED
  if (status === "cancelled") {
    const approverSql = `
    SELECT * FROM leave_request_approvals
    WHERE leave_request_id = ? AND approver_user_id = ? AND status = 'pending'
    LIMIT 1
    `;

    db.query(approverSql, [leaveRequestId, approverUserId], (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "DB error" });
      }
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: "You already acted on this request." });
      }

      const current = rows[0];

      //  Step 2: Cancel this approver's row
      db.query(
        `UPDATE leave_request_approvals SET status = 'cancelled' WHERE id = ?`,
        [current.id],
        (err) => {
          if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: "Error cancelling." });
          }


          // ✅ NEW: Skip all other approvers at this same level
          const skipOthersSql = `
          UPDATE leave_request_approvals
          SET status = 'skipped'
          WHERE leave_request_id = ? AND level = ? AND id != ?
          `;
          db.query(skipOthersSql, [leaveRequestId, current.level, current.id], (err) => {
            if (err) {
              console.error("Error skipping others:", err);
            }
          });


          //  NEW: Delete notifications for other skipped/cancelled approvers
          const deleteSkippedNotifSql = `
          DELETE FROM notifications
          WHERE link = ? 
          AND email IN (
          SELECT u.email
          FROM leave_request_approvals lra
          JOIN users u ON lra.approver_user_id = u.id
          WHERE lra.leave_request_id = ? 
          AND lra.level = ? 
          AND lra.status IN ('skipped')
          )
          `;

          db.query(
            deleteSkippedNotifSql,
            [
              `/leave-requests-approval.html?leaveId=${leaveRequestId}`,
              leaveRequestId,
              current.level
            ],
            (err) => {
              if (err) console.error("Error deleting skipped/cancelled notifications:", err);
            }
          );

          //  Step 3: Cancel request in main table
          const cancelSql = `
          UPDATE leave_requests
          SET status = ?, cancel_reason = ?, cancelled_by = ?
          WHERE id = ?
          `;
          db.query(cancelSql, ["cancelled", reason, approverUserId, leaveRequestId], (err) => {
            if (err) {
              console.error(err);
              return res.status(500).json({ success: false, message: "DB error" });
            }

            //  Step 4: Notify requester
            const getEmailSql = `SELECT requester_email FROM leave_requests WHERE id = ?`;
            db.query(getEmailSql, [leaveRequestId], (err, rows) => {
              if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: "DB error" });
              }
              if (rows.length === 0) {
                return res.status(404).json({ success: false, message: "Leave request not found." });
              }

              const requesterEmail = rows[0].requester_email;

              db.query(
                `INSERT INTO notifications (email, message, link, status)
                VALUES (?, ?, ?, 'unread')`,
                [
                  requesterEmail,
                  "Your leave request was cancelled.",
                  `/my-request.html?view=${leaveRequestId}`
                ],
                (err) => {
                  if (!err) {
                    sendNotificationToUser(
                      requesterEmail,
                      "Your leave request was cancelled.",
                      `/my-request.html?view=${leaveRequestId}`
                    );
                  }
                }
              );

              const updateApproverNotification = `
              UPDATE notifications
              SET message = ?
              WHERE email = ? AND link = ? AND message LIKE ?
              `;

              const getRequesterNameSql = `
              SELECT CONCAT(e.first_name, ' ', e.last_name) AS requester_name
              FROM leave_requests lr
              JOIN employees e ON lr.requester_email = e.email
              WHERE lr.id = ?
              `;

              db.query(getRequesterNameSql, [leaveRequestId], (err, nameRows) => {
                if (err) {
                  console.error("Error getting requester name:", err);
                } else if (nameRows.length > 0) {
                  const requesterName = nameRows[0].requester_name;

                  db.query(
                    updateApproverNotification,
                    [
                      `❌ You cancelled a leave request of ${requesterName}`,
                      req.session.user.email,
                      `/leave-requests-approval.html?leaveId=${leaveRequestId}`,
                      `%submitted a leave request%`
                    ],
                    (err) => {
                      if (err) console.error("Error updating approver notification:", err);
                    }
                  );
                }
              });

              return res.status(200).json({ success: true, message: "Leave request cancelled!" });
            });
          });
        }
      );
    });
  }



  // 2. APPROVED
  else if (status === "approved") {
    const approverSql = `
      SELECT * FROM leave_request_approvals
      WHERE leave_request_id = ? AND approver_user_id = ? AND status = 'pending'
      LIMIT 1
    `;
    db.query(approverSql, [leaveRequestId, approverUserId], (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "DB error" });
      }
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: "Approval not found or already processed." });
      }

      const current = rows[0];



      /**************************************************
       ✅ SELF SEQUENTIAL APPROVAL (for requester 31 / 50)
      **************************************************/
      const getRequesterInfo = `
  SELECT 
    u.id AS requester_user_id,
    CONCAT(e.first_name, ' ', e.last_name) AS requester_name
  FROM leave_requests lr
  JOIN users u ON lr.requester_email = u.email
  JOIN employees e ON e.email = lr.requester_email
  WHERE lr.id = ?
`;

      db.query(getRequesterInfo, [leaveRequestId], (err, rqRows) => {
        if (err || rqRows.length === 0) {
          return res.status(500).json({ success: false, message: "Requester lookup failed" });
        }

        const requesterUserId = rqRows[0].requester_user_id;
        const requesterName = rqRows[0].requester_name;

        if (requesterUserId == 31 || requesterUserId == 50) {


          /*******************************
           ✅ STEP-1 → L1(11) approves → L2(12)
          *******************************/
          if (current.level == 1) {

            // ✅ Mark current approver approved
            db.query(
              `UPDATE leave_request_approvals
         SET status='approved'
         WHERE id = ?`,
              [current.id]
            );

            // ✅ Update approver notification
            db.query(
              `UPDATE notifications
         SET message = ?
         WHERE email = ? AND link = ?`,
              [
                `✅ You approved leave request from ${requesterName}`,
                req.session.user.email,
                `/leave-requests-approval.html?leaveId=${leaveRequestId}`
              ]
            );

            // ✅ Remove any old L2
            db.query(
              `DELETE FROM leave_request_approvals 
         WHERE leave_request_id=? AND level=2`,
              [leaveRequestId]
            );

            // ✅ Insert next approver → 12
            db.query(
              `INSERT INTO leave_request_approvals 
               (leave_request_id, approver_user_id, level, status)
               VALUES (?, ?, ?, 'pending')`,
              [leaveRequestId, 12, 2],
              (err) => {
                if (err) {
                  console.error("L2 insert error:", err);
                  return res.status(500).json({ success: false, message: "Error inserting next approver" });
                }
              }
            );

            notifyLevel(12, leaveRequestId, requesterName);

            return res.status(200).json({
              success: true,
              message: "Moved L1(11) → L2(12)"
            });
          }


          /*******************************
           ✅ STEP-2 → L2(12) approves → L3(13)
          *******************************/
          if (current.level == 2) {

            // ✅ Mark current approver approved
            db.query(
              `UPDATE leave_request_approvals
               SET status='approved'
               WHERE id = ?`,
              [current.id]
            );

            // ✅ Update notification
            db.query(
              `UPDATE notifications
                SET message = ?
                WHERE email = ? AND link = ?`,
              [
                `✅ You approved leave request from ${requesterName}`,
                req.session.user.email,
                `/leave-requests-approval.html?leaveId=${leaveRequestId}`
              ]
            );

            // ✅ Remove old L3
            db.query(
              `DELETE FROM leave_request_approvals 
                WHERE leave_request_id=? AND level=3`,
              [leaveRequestId]
            );

            // ✅ Insert next approver → 13
            db.query(
              `INSERT INTO leave_request_approvals
              (leave_request_id, approver_user_id, level, status)
               VALUES (?, ?, ?, 'pending')`,
              [leaveRequestId, 13, 3],
              (err) => {
                if (err) {
                  console.error("L3 insert error:", err);
                  return res.status(500).json({
                    success: false,
                    message: "Error inserting L3"
                  });
                }

                // 🔔 ONLY AFTER SUCCESS
                notifyLevel(13, leaveRequestId, requesterName);
              }
            );
          }



          /*******************************
           ✅ STEP-3 → L3(13) approves → DONE
          *******************************/
          if (current.level == 3) {

            // ✅ Mark level-3 approved
            db.query(
              `UPDATE leave_request_approvals
         SET status='approved'
         WHERE id = ?`,
              [current.id]
            );

            // ✅ Update notification
            db.query(
              `UPDATE notifications
         SET message = ?
         WHERE email = ? AND link = ?`,
              [
                `✅ You approved leave request from ${requesterName}`,
                req.session.user.email,
                `/leave-requests-approval.html?leaveId=${leaveRequestId}`
              ]
            );

            // ✅ Close leave request
            db.query(
              `UPDATE leave_requests 
         SET status='approved'
         WHERE id=?`,
              [leaveRequestId]
            );

            return res.status(200).json({
              success: true,
              message: "Leave fully approved ✅"
            });
          }

          return; // ✅ stop normal flow
        }



        // normal flow for other employees
        db.query(
          `UPDATE leave_request_approvals SET status = 'approved' WHERE id = ?`,
          [current.id],
          (err) => {
            if (err) {
              console.error(err);
              return res.status(500).json({ success: false, message: "Error approving." });
            }
            db.query(
              `SELECT CONCAT(e.first_name, ' ', e.last_name) AS requester_name
            FROM leave_requests lr
            JOIN employees e ON lr.requester_email = e.email
            WHERE lr.id = ?`,
              [leaveRequestId],
              (err, result) => {
                if (err) {
                  console.error("Error getting requester name for notification:", err);
                } else if (result.length > 0) {
                  const requesterName = result[0].requester_name;
                  db.query(
                    `UPDATE notifications
                  SET message = ?
                  WHERE email = ? AND link = ? AND message LIKE ?`,
                    [
                      `✅ You approved leave request from ${requesterName}`,
                      req.session.user.email,
                      `/leave-requests-approval.html?leaveId=${leaveRequestId}`,
                      `%submitted a leave request%`
                    ],
                    (err) => {
                      if (err) console.error("Error updating approver notification:", err);
                    }
                  );
                }
              }
            );

            const skipSql = `
            UPDATE leave_request_approvals
            SET status = 'skipped'
            WHERE leave_request_id = ? AND level = ? AND id != ?
          `;
            db.query(skipSql, [leaveRequestId, current.level, current.id], (err) => {
              if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: "Error skipping others." });
              }


              // NEW: Delete notifications for skipped approvers
              const deleteSkippedNotifSql = `
            DELETE FROM notifications
            WHERE link = ? 
            AND email IN (
            SELECT u.email
            FROM leave_request_approvals lra
            JOIN users u ON lra.approver_user_id = u.id
            WHERE lra.leave_request_id = ? 
            AND lra.level = ? 
            AND lra.status = 'skipped'
            )
            `;

              db.query(
                deleteSkippedNotifSql,
                [
                  `/leave-requests-approval.html?leaveId=${leaveRequestId}`,
                  leaveRequestId,
                  current.level
                ],
                (err) => {
                  if (err) console.error("Error deleting skipped notifications:", err);
                }
              );

              const getDeptSql = `
              SELECT department_id, requester_email, requester_name
              FROM leave_requests
              WHERE id = ?
            `;
              db.query(getDeptSql, [leaveRequestId], (err, leaveRows) => {
                if (err) {
                  console.error(err);
                  return res.status(500).json({ success: false, message: "DB error" });
                }

                const departmentId = leaveRows[0].department_id;
                const requesterEmail = leaveRows[0].requester_email;
                const requesterName = leaveRows[0].requester_name;
                const nextLevel = current.level + 1;

                const flowSql = `
                SELECT approver_role_id FROM approval_flows
                WHERE department_id = ? AND level = ?
              `;
                db.query(flowSql, [departmentId, nextLevel], (err, flowRows) => {
                  if (err) {
                    console.error(err);
                    return res.status(500).json({ success: false, message: "DB error" });
                  }

                  if (flowRows.length === 0) {
                    db.query(
                      `UPDATE leave_requests SET status = 'approved' WHERE id = ?`,
                      [leaveRequestId],
                      (err) => {
                        if (err) console.error(err);

                        db.query(
                          `UPDATE notifications
                         SET message = 'Your leave request approved', created_at = NOW()
                         WHERE link = ? AND email = ?`,
                          [
                            `/my-request.html?view=${leaveRequestId}`,
                            requesterEmail
                          ],
                          (err) => {
                            if (!err) {
                              sendNotificationToUser(
                                requesterEmail,
                                "Your leave request approved",
                                `/my-request.html?view=${leaveRequestId}`
                              );
                            }
                          }
                        );

                        return res.status(200).json({
                          success: true,
                          message: "Leave fully approved!"
                        });
                      }
                    );

                  } else {
                    const nextRoleId = flowRows[0].approver_role_id;

                    db.query(
                      `SELECT id, email FROM users WHERE role_id = ?`,
                      [nextRoleId],
                      (err, nextApprovers) => {
                        if (err) {
                          console.error(err);
                          return res.status(500).json({ success: false, message: "DB error" });
                        }

                        if (nextApprovers.length === 0) {
                          return res.status(400).json({ success: false, message: "No next approvers." });
                        }

                        let inserted = 0;

                        nextApprovers.forEach((approver) => {
                          db.query(
                            `INSERT INTO leave_request_approvals (leave_request_id, approver_user_id, level, status)
                          VALUES (?, ?, ?, 'pending')`,
                            [leaveRequestId, approver.id, nextLevel],
                            (err) => {
                              if (err) console.error(err);

                              db.query(
                                `INSERT INTO notifications (email, message, link, status)
                               VALUES (?, ?, ?, 'unread')`,
                                [
                                  approver.email,
                                  `${requesterName} submitted a leave request for your approval.`,
                                  `/leave-requests-approval.html?leaveId=${leaveRequestId}`
                                ],
                                (err) => {
                                  if (err) console.error(err);

                                  inserted++;
                                  if (inserted === nextApprovers.length) {
                                    db.query(
                                      `UPDATE notifications
                                     SET message = 'Your leave request is currently under review', created_at = NOW()
                                     WHERE link = ? AND email = ?`,
                                      [
                                        `/my-request.html?view=${leaveRequestId}`,
                                        requesterEmail
                                      ],
                                      (err) => {
                                        if (err) console.error(err);

                                        return res.status(200).json({
                                          success: true,
                                          message: "Approved & next level triggered!"
                                        });
                                      }
                                    );
                                  }
                                }
                              );
                            }
                          );
                        });
                      }
                    );
                  }
                });
              });
            });
          }
        );
      });
    });
  }

  // 3. INVALID status
  else {
    return res.status(400).json({ success: false, message: "Invalid status." });
  }
};



exports.getLeaveRequests = (req, res) => {
  const approverUserId = req.session.user?.user_id;

  if (!approverUserId) {
    return res.status(401).json({ success: false, message: "Not logged in" });
  }

  const sql = `
    SELECT 
      lr.*, 
      lr.medical_certificates AS medical_certificates_url,
      d.department_name,
      lra.status AS approver_status,
      lra.level AS approver_level
    FROM leave_requests lr
    JOIN leave_request_approvals lra 
    LEFT JOIN departments d ON lr.department_id = d.id
      ON lr.id = lra.leave_request_id
    WHERE lra.approver_user_id = ?
      AND lra.status IN ('pending','approved','cancelled')
      AND (
        lra.status != 'pending'
        OR NOT EXISTS (
          SELECT 1 FROM leave_request_approvals 
          WHERE leave_request_id = lr.id
            AND level < lra.level
            AND status != 'approved'
        )
      )
    ORDER BY lr.created_at DESC
  `;

  db.query(sql, [approverUserId], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "DB error" });
    }
    res.json(rows);
  });
};


//  NEW: Get approval status for a single request (for the status dots)
exports.getApprovalsForRequest = (req, res) => {
  const leaveRequestId = req.params.id;

  const sql = `
                  SELECT lra.*, u.role_id
                  FROM leave_request_approvals lra
                  JOIN users u ON lra.approver_user_id = u.id
                  WHERE lra.leave_request_id = ?
                  ORDER BY level ASC
                  `;

  db.query(sql, [leaveRequestId], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'DB error' });
    }
    res.json(rows);
  });
};


// GET /api/leave-approvals/:id/my-status
exports.getMyApprovalStatus = (req, res) => {
  const leaveRequestId = req.params.id;
  const approverUserId = req.session.user?.user_id;

  console.log("Approver user ID from session:", approverUserId);

  if (!approverUserId) {
    return res.status(401).json({ status: "unauthorized" });
  }

  const sql = `
    SELECT status FROM leave_request_approvals
    WHERE leave_request_id = ? AND approver_user_id = ?
  `;

  db.query(sql, [leaveRequestId, approverUserId], (err, rows) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ status: "error" });
    }

    if (rows.length === 0) {
      return res.status(404).json({ status: "not_found" });
    }

    console.log("Approver row status:", rows[0].status);
    return res.json({ status: rows[0].status });
  });
};



// GET /api/leave/my-requests
exports.getMyLeaveRequests = (req, res) => {
  const requesterEmail = req.session.user?.email;

  if (!requesterEmail) {
    return res.status(401).json({ success: false, message: "Not logged in" });
  }

  const sql = `
    SELECT *
    FROM leave_requests
    WHERE requester_email = ?
    ORDER BY created_at DESC
  `;

  db.query(sql, [requesterEmail], (err, rows) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    res.json(rows);
  });
};



// CANSEL REASON WITH NAME
exports.getSingleLeaveRequest = (req, res) => {
  const leaveId = req.params.id;

  const sql = `
    SELECT 
      lr.*,
      CONCAT(u.first_name, ' ', u.last_name) AS cancelled_by_name
    FROM leave_requests lr
    LEFT JOIN users u ON lr.cancelled_by = u.id
    WHERE lr.id = ?
    LIMIT 1
  `;

  db.query(sql, [leaveId], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    res.json(rows[0]);
  });
};


