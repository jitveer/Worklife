const db = require('../db');
const pdfService = require('../services/pdfService');
const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");
dayjs.extend(customParseFormat);


// universal helper function for notification when approver request there own request 
function getUserEmail(userId) {
    return new Promise((resolve) => {
        db.query(`SELECT email FROM users WHERE id=?`, [userId], (err, rows) => {
            resolve(rows?.[0]?.email ?? null);
        });
    });
}

function getEmployeeEmailByAppraisal(appraisalId) {
    return new Promise((resolve) => {
        const sql = `
          SELECT e.email
          FROM appraisals a
          JOIN employees e ON e.id = a.employee_id
          WHERE a.id=? LIMIT 1
        `;
        db.query(sql, [appraisalId], (err, rows) => {
            resolve(rows?.[0]?.email ?? null);
        });
    });
}

function pushNotification(email, message, link) {
    return new Promise((resolve) => {
        if (!email) return resolve();

        const checkSql = `
            SELECT id FROM notifications
            WHERE email=? AND link=? LIMIT 1
        `;
        db.query(checkSql, [email, link], (err, rows) => {
            if (rows?.length) {
                const updSql = `
                    UPDATE notifications
                    SET message=?, status='unread', updated_at=NOW()
                    WHERE id=?`;
                db.query(updSql, [message, rows[0].id], () => resolve());
            } else {
                const insSql = `
                    INSERT INTO notifications (email, message, link, status, created_at, updated_at)
                    VALUES (?, ?, ?, 'unread', NOW(), NOW())`;
                db.query(insSql, [email, message, link], () => resolve());
            }
        });
    });
}

const sectionController = {

    // 🔹 AUTO: Triggered internally when a new employee is added
    createInitialAppraisal: (employeeId, callback) => {
        const today = new Date();
        const datePart = today.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD

        // Step 1: Check the latest sequence for today's date
        const sqlMax = `
        SELECT MAX(CAST(SUBSTRING(req_no, 10) AS UNSIGNED)) AS max_seq
        FROM appraisals
        WHERE req_no LIKE ?
        `;
        const likePattern = `P${datePart}%`;

        db.query(sqlMax, [likePattern], (err, result) => {
            if (err) {
                console.error("❌ Failed to fetch last req_no:", err);
                if (callback) callback(err, null);
                return;
            }

            // Step 2: Generate next sequence for today
            const nextSeq = (result[0].max_seq || 0) + 1;
            const reqNo = `P${datePart}${String(nextSeq).padStart(2, "0")}`;

            const sql = `
            INSERT INTO appraisals 
            (req_no, employee_id, start_date, mid_year_due, full_year_due, status, created_at, updated_at)
            VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 2 MINUTE), DATE_ADD(NOW(), INTERVAL 3 MINUTE), 'pending', NOW(), NOW())
            `;
            db.query(sql, [reqNo, employeeId], (err, result) => {
                if (err) {
                    console.error("❌ Failed to auto-create appraisal:", err);
                    if (callback) callback(err, null);
                    return;
                }
                if (callback) callback(null, result.insertId);
            });
        });
    },



    // 🔹 MANUAL: API endpoint (optional if HR/Manager wants to start appraisal manually)
    startAppraisal: (req, res) => {
        const { employeeId } = req.body;
        const reqNo = "TEMP" + Date.now(); // ✅ temporary, you can reuse generator above if needed

        const sql = `
      INSERT INTO appraisals (req_no, employee_id, start_date, mid_year_due, full_year_due, status, created_at, updated_at) 
      VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 6 MONTH), DATE_ADD(CURDATE(), INTERVAL 12 MONTH), 'pending', NOW(), NOW())
    `;
        db.query(sql, [reqNo, employeeId], (err, result) => {
            if (err) return res.status(500).json({ success: false, error: "Failed to start appraisal." });
            res.json({ success: true, message: "Appraisal started", appraisalId: result.insertId });
        });
    },



    // 🔹 Personal Info for performance page
    getPersonalInfo: (req, res) => {
        const user = req.session.user; // { user_id, role }
        if (!user?.user_id) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const sql = `
        SELECT 
            u.email, 
            e.employee_id, 
            e.first_name, 
            e.last_name, 
            c.company_name AS company, 
            e.designation, 
            d.department_name AS department, 
            lm.name AS line_manager, 
            e.doj AS joining_date
        FROM users u
        JOIN employees e ON u.employee_id = e.employee_id
        LEFT JOIN company_name c ON e.company_id = c.id
        LEFT JOIN department d ON e.department_id = d.id
        LEFT JOIN line_managers lm ON e.line_manager_id = lm.id
  
        WHERE u.id = ?
        `;

        db.query(sql, [user.user_id], (err, rows) => {
            if (err) {
                console.error("❌ Personal info lookup error:", err);
                return res.status(500).json({ success: false, message: "Server error" });
            }

            if (!rows.length) {
                return res.status(404).json({ success: false, message: "Personal info not found" });
            }

            const info = rows[0];

            // 🔹 Format joining_date as DD-MMM-YYYY
            let formattedJoiningDate = null;
            if (info.joining_date) {
                const joinDate = new Date(info.joining_date);
                const options = { day: "2-digit", month: "short", year: "numeric" };
                formattedJoiningDate = joinDate.toLocaleDateString("en-GB", options).replace(/ /g, "-");
            }

            // 🔹 Generate request number PERFYYYYMMDD0001
            const reqSql = "SELECT MAX(CAST(SUBSTRING(req_no, 13) AS UNSIGNED)) AS max_no FROM appraisals";
            db.query(reqSql, (err2, result) => {
                if (err2) {
                    console.error("❌ ReqNo generation error:", err2);
                    return res.status(500).json({ success: false, message: "Server error" });
                }

                const nextNo = (result[0].max_no || 0) + 1;
                const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
                const reqNo = "PERF" + datePart + nextNo.toString().padStart(4, "0");

                // 🔹 Format today’s date for request_date
                const today = new Date();
                const options = { day: "2-digit", month: "short", year: "numeric" };
                const formattedDate = today.toLocaleDateString("en-GB", options).replace(/ /g, "-");

                res.json({
                    success: true,
                    req_no: reqNo,
                    request_date: formattedDate,
                    employee_id: info.employee_id,
                    name: info.first_name + " " + info.last_name,
                    email: info.email,
                    company: info.company,
                    department: info.department,
                    designation: info.designation,
                    line_manager: info.line_manager || "Not Assigned",
                    joining_date: formattedJoiningDate
                });
            });
        });
    },



    // ================================
    // employee controller
    // ================================

    submitStartStage: (req, res) => {
        const empCode = req.session.user?.employee_id;
        if (!empCode) return res.status(401).json({ success: false, message: "Not logged in" });

        const { targets, overallComments, total_weight, total_score } = req.body;
        if (!targets || targets.length === 0) {
            return res.status(400).json({ success: false, message: "No targets provided" });
        }

        // Step 1: Get employee details
        const getEmpSql = "SELECT id, department_id, first_name, last_name, email FROM employees WHERE employee_id = ?";
        db.query(getEmpSql, [empCode], (err, empRows) => {
            if (err) return res.status(500).json({ success: false, message: "DB error" });
            if (!empRows.length) return res.status(404).json({ success: false, message: "Employee not found" });

            const numericEmpId = empRows[0].id;
            const departmentId = empRows[0].department_id;
            const employeeName = `${empRows[0].first_name} ${empRows[0].last_name}`;
            const employeeEmail = empRows[0].email;

            // Step 2: Get latest appraisal
            const getAppraisalSql = "SELECT id FROM appraisals WHERE employee_id = ? ORDER BY id DESC LIMIT 1";
            db.query(getAppraisalSql, [numericEmpId], (err2, appRows) => {
                if (err2) return res.status(500).json({ success: false, message: "DB error" });
                if (!appRows.length) return res.status(404).json({ success: false, message: "No active appraisal found" });

                const appraisalId = appRows[0].id;

                // ====== Step 3: Insert/Update start_stage (only 1 row) ======
                const getStageSql = "SELECT id FROM start_stage WHERE appraisal_id = ? LIMIT 1";
                db.query(getStageSql, [appraisalId], (errStageCheck, stageRows) => {
                    if (errStageCheck) return res.status(500).json({ success: false, message: "DB error checking start_stage" });

                    const stageExists = stageRows.length > 0;

                    if (stageExists) {
                        // UPDATE existing start_stage
                        const updateStageSql = `
                        UPDATE start_stage SET 
                            comments = ?, 
                            total_weight = ?, 
                            total_score = ?, 
                            updated_at = NOW()
                        WHERE id = ? AND appraisal_id = ?
                        `;
                        const updateStageParams = [
                            overallComments || "",
                            total_weight || 0,
                            total_score || 0,
                            stageRows[0].id,
                            appraisalId
                        ];

                        db.query(updateStageSql, updateStageParams, (errUpdStage) => {
                            if (errUpdStage) return res.status(500).json({ success: false, message: "DB error updating start_stage" });
                            processItems(stageRows[0].id);
                        });

                    } else {
                        // INSERT new start_stage
                        const insertStageSql = `
                        INSERT INTO start_stage (appraisal_id, comments, total_weight, total_score, created_at, updated_at)
                        VALUES (?, ?, ?, ?, NOW(), NOW())
                        `;
                        const insertStageParams = [
                            appraisalId,
                            overallComments || "",
                            total_weight || 0,
                            total_score || 0
                        ];

                        db.query(insertStageSql, insertStageParams, (errInsStage, stageResult) => {
                            if (errInsStage) return res.status(500).json({ success: false, message: "DB error inserting start_stage" });
                            processItems(stageResult.insertId);
                        });
                    }
                });

                // ====== Step 4: Insert/Update start_items ======
                function processItems(stageId) {
                    let i = 0;

                    function nextItem() {
                        if (i >= targets.length) {
                            // ====== Step 5: Insert performance_approvals (only 1 row per level) ======
                            // <-- CHANGED: added stage filter here so start_stage checks only start_stage approvals
                            const checkApprovalSql = "SELECT id FROM performance_approvals WHERE performance_request_id = ? AND level = 1 AND stage = 'start_stage' LIMIT 1";
                            db.query(checkApprovalSql, [appraisalId], (errCheckApp, approvalRows) => {
                                if (errCheckApp) return res.status(500).json({ success: false, message: "DB error checking approvals" });

                                if (approvalRows.length > 0) {
                                    console.log("L1 approval already exists");
                                }

                                const creatorUserId = req.session.user?.user_id;

                                // ✅ SELF REQUEST OVERRIDE
                                console.log("SELF CHECK → creatorUserId:", creatorUserId);
                                if ([31, 50].includes(Number(creatorUserId))) {

                                    const level1 = 11;
                                    const level2 = 13;

                                    // Insert Level-1
                                    const sql1 = `
                                    INSERT INTO performance_approvals
                                    (performance_request_id, approver_user_id, level, status, stage, updated_at)
                                    VALUES (?, ?, 1, 'Pending', 'start_stage', NOW())
                                `;
                                    db.query(sql1, [appraisalId, level1]);

                                    // Notify Level-1
                                    db.query("SELECT email FROM users WHERE id=? LIMIT 1", [level1], (e, rows) => {
                                        const email = rows?.[0]?.email;
                                        if (email) {
                                            const msg = `📩 New performance request pending your approval`;
                                            const link = `performance-approval.html?id=${appraisalId}&stage=start_stage`;
                                            db.query(
                                                "INSERT INTO notifications (email, message, link, status, created_at, updated_at) VALUES (?, ?, ?, 'unread', NOW(), NOW())",
                                                [email, msg, link]
                                            );
                                        }
                                    });

                                    // Notify Employee
                                    const msgEmployee = `✅ You submitted performance request successfully`;
                                    const linkEmployee = `my-performance.html?id=${appraisalId}&stage=start_stage`;
                                    db.query(
                                        "INSERT INTO notifications (email, message, link, status, created_at, updated_at) VALUES (?, ?, ?, 'unread', NOW(), NOW())",
                                        [employeeEmail, msgEmployee, linkEmployee]
                                    );

                                    return res.json({
                                        success: true,
                                        message: "Self-request routed → L1 → L2"
                                    });
                                }

                                // ✅ NORMAL FLOW

                                // Only use specific_user_id
                                const flowSql = "SELECT * FROM performance_approval_flows WHERE department_id = ? AND level = 1 LIMIT 1";
                                db.query(flowSql, [departmentId], (errFlow, approvers) => {
                                    if (errFlow) return res.status(500).json({ success: false, message: "DB error fetching approvers" });
                                    if (!approvers.length) return res.status(400).json({ success: false, message: "No level 1 approver found" });

                                    const firstApprover = approvers[0];
                                    const approverUserId = firstApprover.specific_user_id;
                                    if (!approverUserId || approverUserId === 0)
                                        return res.status(400).json({ success: false, message: "No specific approver assigned for this level" });

                                    // Get approver email
                                    const userSql = "SELECT email FROM users WHERE id=? LIMIT 1";
                                    db.query(userSql, [approverUserId], (errUser, userRows) => {
                                        if (errUser || !userRows.length) return res.status(500).json({ success: false, message: "Approver not found" });

                                        const approverEmail = userRows[0].email;

                                        const insertApprovalSql = `
                                        INSERT INTO performance_approvals
                                        (performance_request_id, approver_user_id, level, status, stage, updated_at)
                                        VALUES (?, ?, 1, 'Pending', 'start_stage', NOW())
                                        `;
                                        db.query(insertApprovalSql, [appraisalId, approverUserId], (errInsApp) => {
                                            if (errInsApp) return res.status(500).json({ success: false, message: "DB error inserting approval" });

                                            // Notifications
                                            const msgApprover = `📋 New performance request submitted by ${employeeName}`;
                                            const linkApprover = `performance-approval.html?id=${appraisalId}&stage=start_stage`;
                                            db.query(
                                                "INSERT INTO notifications (email, message, link, status, created_at, updated_at) VALUES (?, ?, ?, 'unread', NOW(), NOW())",
                                                [approverEmail, msgApprover, linkApprover]
                                            );

                                            const msgEmployee = `✅ You submitted performance request successfully`;
                                            const linkEmployee = `my-performance.html?id=${appraisalId}&stage=start_stage`;
                                            db.query(
                                                "INSERT INTO notifications (email, message, link, status, created_at, updated_at) VALUES (?, ?, ?, 'unread', NOW(), NOW())",
                                                [employeeEmail, msgEmployee, linkEmployee]
                                            );

                                            return res.json({ success: true, message: "Targets submitted successfully and sent to approver level 1" });
                                        });
                                    });
                                });
                            });
                            return;
                        }

                        const t = targets[i];
                        if (!t.target_text) { i++; nextItem(); return; }

                        if (t.id) {
                            // UPDATE start_items
                            const updateItemSql = `
                            UPDATE start_items SET 
                                target_text = ?, 
                                accomplishments = ?, 
                                manager_comments = ?, 
                                weightage = ?, 
                                rating = ?, 
                                score = ?
                            WHERE id = ? AND appraisal_id = ?
                            `;
                            const updateItemParams = [
                                t.target_text,
                                t.accomplishments || "",
                                t.manager_comments || "",
                                t.weightage || 0,
                                t.rating || 0,
                                t.score || 0,
                                t.id,
                                appraisalId
                            ];
                            db.query(updateItemSql, updateItemParams, (errUpdItem) => {
                                if (errUpdItem) return res.status(500).json({ success: false, message: "DB error updating start_items" });
                                i++; nextItem();
                            });
                        } else {
                            // INSERT start_items
                            const insertItemSql = `
                            INSERT INTO start_items 
                            (appraisal_id, target_text, accomplishments, manager_comments, weightage, rating, score)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                            `;
                            const insertItemParams = [
                                appraisalId,
                                t.target_text,
                                t.accomplishments || "",
                                t.manager_comments || "",
                                t.weightage || 0,
                                t.rating || 0,
                                t.score || 0
                            ];
                            db.query(insertItemSql, insertItemParams, (errInsItem) => {
                                if (errInsItem) return res.status(500).json({ success: false, message: "DB error inserting start_items" });
                                i++; nextItem();
                            });
                        }
                    }

                    nextItem();
                }
            });
        });
    },



    // employee own data in table
    getMyPerformanceRequests: (req, res) => {

        if (!req.session.user || !req.session.user.employee_id) {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        const employeeCode = req.session.user.employee_id;

        const sql = `
        SELECT
           a.id AS ID,
           a.req_no AS ReqNo,
           CONCAT(e.first_name, ' ', e.last_name) AS Name,
           s.Stage,
           s.Status
        FROM appraisals a
        JOIN employees e ON a.employee_id = e.id
        JOIN (
        SELECT appraisal_id, stage, MAX(status) AS Status
        FROM (
        SELECT appraisal_id, 'start_stage' AS stage, status FROM start_stage
        UNION ALL
        SELECT appraisal_id, 'mid_stage' AS stage, status FROM mid_stage
        UNION ALL
        SELECT appraisal_id, 'full_stage' AS stage, status FROM full_stage
        ) AS all_stages
        GROUP BY appraisal_id, stage
        ) AS s ON s.appraisal_id = a.id
        WHERE e.employee_id = ?
        ORDER BY a.id DESC, s.Stage ASC
        `;

        db.query(sql, [employeeCode], (err, results) => {
            if (err) {
                console.error("❌ Error fetching performance requests:", err);
                return res.status(500).json({ success: false, message: "Database error" });
            }
            res.json(results);
        });
    },



    // employee view popup 
    getPerformanceRequestById: (req, res) => {
        const appraisalId = req.params.id;

        const sql = `
        SELECT a.id, a.req_no, e.first_name, e.last_name,
           ss.status AS ss_status, ss.rejected_by AS ss_rejected_by, ss.rejection_reason AS ss_rejection_reason,
           ms.status AS ms_status, ms.rejected_by AS ms_rejected_by, ms.rejection_reason AS ms_rejection_reason,
           fs.status AS fs_status, fs.rejected_by AS fs_rejected_by, fs.rejection_reason AS fs_rejection_reason,
           CONCAT(u1.first_name, ' ', u1.last_name) AS ss_rejected_by_name,
           CONCAT(u2.first_name, ' ', u2.last_name) AS ms_rejected_by_name,
           CONCAT(u3.first_name, ' ', u3.last_name) AS fs_rejected_by_name
        FROM appraisals a
        JOIN employees e ON a.employee_id = e.id
        LEFT JOIN start_stage ss ON ss.appraisal_id = a.id
        LEFT JOIN mid_stage ms ON ms.appraisal_id = a.id
        LEFT JOIN full_stage fs ON fs.appraisal_id = a.id
        LEFT JOIN users u1 ON ss.rejected_by = u1.id
        LEFT JOIN users u2 ON ms.rejected_by = u2.id
        LEFT JOIN users u3 ON fs.rejected_by = u3.id
        WHERE a.id = ?
        LIMIT 1
        `;

        db.query(sql, [appraisalId], (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "DB error" });
            if (!rows.length) return res.status(404).json({ success: false, message: "Performance request not found" });

            const data = rows[0];

            res.json({
                id: data.id,
                req_no: data.req_no,
                employee_name: `${data.first_name} ${data.last_name}`,
                start_stage: {
                    status: data.ss_status,
                    rejected_by_name: data.ss_rejected_by_name || null,
                    rejection_reason: data.ss_rejection_reason || null
                },
                mid_stage: {
                    status: data.ms_status,
                    rejected_by_name: data.ms_rejected_by_name || null,
                    rejection_reason: data.ms_rejection_reason || null
                },
                full_stage: {
                    status: data.fs_status,
                    rejected_by_name: data.fs_rejected_by_name || null,
                    rejection_reason: data.fs_rejection_reason || null
                }
            });
        });
    },



    // employee tracking
    trackPerformanceApproval: (req, res) => {
        const { id } = req.params; // performance request ID
        const { stage } = req.query;

        if (!stage) return res.status(400).json({ success: false, message: "Stage query parameter is required" });

        const sql = `
        SELECT 
        pa.approver_user_id,
        pa.status,
        pa.updated_at AS date,
        pa.stage,
        CONCAT(u.first_name, ' ', u.last_name) AS approved_by_name
        FROM performance_approvals pa 
        LEFT JOIN users u ON pa.approver_user_id = u.id
        WHERE pa.performance_request_id = ? AND pa.stage = ?
        ORDER BY pa.level ASC
        `;

        db.query(sql, [id, stage], (err, results) => {
            if (err) {
                console.error("❌ Error fetching performance approval tracking:", err);
                return res.status(500).json({ success: false, message: "Tracking fetch failed" });
            }
            res.json(results);
        });
    },


    // ===========================
    // DELETE Start Stage Item
    // ===========================
    deleteStartItem: (req, res) => {
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Missing item ID"
            });
        }

        const sql = "DELETE FROM start_items WHERE id = ?";

        db.query(sql, [id], (err, result) => {
            if (err) {
                console.error("Delete error:", err);
                return res.status(500).json({
                    success: false,
                    message: "Database error"
                });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Item not found"
                });
            }

            return res.json({
                success: true,
                message: "Item deleted successfully"
            });
        });
    },




    // ---------------------------
    // mid stage        
    // ----------------------------

    submitMidStage: (req, res) => {
        const empCode = req.session.user?.employee_id;
        if (!empCode) return res.status(401).json({ success: false, message: "Not logged in" });

        const { items, overallComments, professional_total, behavioral_total } = req.body;
        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: "No items provided" });
        }

        // Step 1: Get employee details
        const getEmpSql = "SELECT id, department_id, first_name, last_name, email FROM employees WHERE employee_id = ?";
        db.query(getEmpSql, [empCode], (err, empRows) => {
            if (err) return res.status(500).json({ success: false, message: "DB error" });
            if (!empRows.length) return res.status(404).json({ success: false, message: "Employee not found" });

            const numericEmpId = empRows[0].id;
            const departmentId = empRows[0].department_id;
            const employeeName = `${empRows[0].first_name} ${empRows[0].last_name}`;
            const employeeEmail = empRows[0].email;

            // Step 2: Get latest appraisal
            const getAppraisalSql = "SELECT id FROM appraisals WHERE employee_id = ? ORDER BY id DESC LIMIT 1";
            db.query(getAppraisalSql, [numericEmpId], (err2, appRows) => {
                if (err2) return res.status(500).json({ success: false, message: "DB error" });
                if (!appRows.length) return res.status(404).json({ success: false, message: "No active appraisal found" });

                const appraisalId = appRows[0].id;

                // Step 3: Insert/Update mid_stage
                const getStageSql = "SELECT id FROM mid_stage WHERE appraisal_id = ? LIMIT 1";
                db.query(getStageSql, [appraisalId], (errStageCheck, stageRows) => {
                    if (errStageCheck) return res.status(500).json({ success: false, message: "DB error checking mid_stage" });

                    const stageId = stageRows.length > 0 ? stageRows[0].id : null;

                    const saveStage = stageId
                        ? "UPDATE mid_stage SET comments=?, professional_total=?, behavioral_total=?, updated_at=NOW() WHERE id=?"
                        : "INSERT INTO mid_stage (appraisal_id, comments, professional_total, behavioral_total, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'Pending', NOW(), NOW())";

                    const stageParams = stageId
                        ? [overallComments || "", professional_total || 0, behavioral_total || 0, stageId]
                        : [appraisalId, overallComments || "", professional_total || 0, behavioral_total || 0];

                    db.query(saveStage, stageParams, (errStageSave, stageResult) => {
                        if (errStageSave) return res.status(500).json({ success: false, message: "DB error saving mid_stage" });

                        const midStageId = stageId || stageResult.insertId;

                        // Step 4: Insert/Update mid_items
                        let i = 0;
                        function processNextItem() {
                            if (i >= items.length) {
                                sendNotifications();
                                return;
                            }

                            const item = items[i];

                            const sql = item.id
                                ? `UPDATE mid_items SET communication=?, decision_making=?, quality_orientation=?, initiative=?,
                                technical_skills=?, team_work=?, planning_organizing=?, adaptability=?,
                                self_confidence=?, creativity_innovation=?, strengths=?, training_needs=?,
                                manager_comments=?, employee_comments=?, updated_at=NOW()
                               WHERE id=? AND appraisal_id=?`
                                : `INSERT INTO mid_items 
                                (appraisal_id, communication, decision_making, quality_orientation, initiative,
                                technical_skills, team_work, planning_organizing, adaptability,
                                self_confidence, creativity_innovation, strengths, training_needs,
                                manager_comments, employee_comments, created_at, updated_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;

                            const params = item.id
                                ? [
                                    item.communication, item.decision_making, item.quality_orientation, item.initiative,
                                    item.technical_skills, item.team_work, item.planning_organizing, item.adaptability,
                                    item.self_confidence, item.creativity_innovation, item.strengths, item.training_needs,
                                    item.manager_comments || "", item.employee_comments || "", item.id, appraisalId
                                ]
                                : [
                                    appraisalId, item.communication, item.decision_making, item.quality_orientation, item.initiative,
                                    item.technical_skills, item.team_work, item.planning_organizing, item.adaptability,
                                    item.self_confidence, item.creativity_innovation, item.strengths, item.training_needs,
                                    item.manager_comments || "", item.employee_comments || ""
                                ];

                            db.query(sql, params, (errItem) => {
                                if (errItem) return res.status(500).json({ success: false, message: "DB error saving mid_items" });
                                i++;
                                processNextItem();
                            });
                        }

                        processNextItem();

                        // Step 5: Notifications Function
                        function sendNotifications() {
                            const flowSql = "SELECT specific_user_id FROM performance_approval_flows WHERE department_id=? AND level=1 LIMIT 1";
                            db.query(flowSql, [departmentId], (errFlow, approvers) => {
                                if (errFlow || !approvers.length) return res.status(500).json({ success: false, message: "No approver found" });

                                const approverUserId = approvers[0].specific_user_id;
                                if (!approverUserId) return res.status(500).json({ success: false, message: "Approver not assigned" });

                                const getEmailSql = "SELECT email FROM users WHERE id=? LIMIT 1";
                                db.query(getEmailSql, [approverUserId], (errUser, userRows) => {
                                    if (errUser || !userRows.length) return res.status(500).json({ success: false, message: "Approver not found" });

                                    const approverEmail = userRows[0].email;



                                    const creatorUserId = req.session.user?.user_id;

                                    if ([31, 50].includes(Number(creatorUserId))) {

                                        const level1 = 11;

                                        // Insert L1 approval
                                        const sqlL1 = `
                                        INSERT INTO performance_approvals
                                        (performance_request_id, approver_user_id, level, status, stage, updated_at)
                                        VALUES (?, ?, 1, 'Pending', 'mid_stage', NOW())
                                        `;
                                        db.query(sqlL1, [appraisalId, level1]);

                                        // Notify L1
                                        db.query("SELECT email FROM users WHERE id=? LIMIT 1", [level1], (e, rows2) => {
                                            const emailL1 = rows2?.[0]?.email;
                                            if (emailL1) {
                                                db.query(
                                                    "INSERT INTO notifications (email, message, link, status, created_at, updated_at) VALUES (?, ?, ?, 'unread', NOW(), NOW())",
                                                    [emailL1, "📩 Mid-Stage pending your approval", `performance-approval.html?id=${appraisalId}&stage=mid_stage`]
                                                );
                                            }
                                        });

                                        // Notify employee
                                        db.query(
                                            "INSERT INTO notifications (email, message, link, status, created_at, updated_at) VALUES (?, ?, ?, 'unread', NOW(), NOW())",
                                            [employeeEmail, "✅ Mid-Stage submitted successfully", `my-performance.html?id=${appraisalId}&stage=mid_stage`]
                                        );

                                        return res.json({
                                            success: true,
                                            message: "Self-request → forwarded to L1"
                                        });
                                    }

                                    // <-- CHANGED: check approval only for mid_stage
                                    const checkApprovalSql = "SELECT id FROM performance_approvals WHERE performance_request_id=? AND level=1 AND stage='mid_stage' LIMIT 1";
                                    db.query(checkApprovalSql, [appraisalId], (errCheck, approvalRows) => {
                                        if (errCheck) return res.status(500).json({ success: false, message: "DB error checking approvals" });

                                        if (approvalRows.length === 0) {
                                            const insertApprovalSql = `
                                            INSERT INTO performance_approvals
                                            (performance_request_id, approver_user_id, level, status, stage, updated_at)
                                            VALUES (?, ?, 1, 'Pending', 'mid_stage', NOW())
                                        `;
                                            db.query(insertApprovalSql, [appraisalId, approverUserId]);
                                        }

                                        // Notifications
                                        db.query(
                                            "INSERT INTO notifications (email, message, link, status, created_at, updated_at) VALUES (?, ?, ?, 'unread', NOW(), NOW())",
                                            [approverEmail, `📋 New mid-stage appraisal submitted by ${employeeName}`, `performance-approval.html?id=${appraisalId}&stage=mid_stage`]
                                        );

                                        db.query(
                                            "INSERT INTO notifications (email, message, link, status, created_at, updated_at) VALUES (?, ?, ?, 'unread', NOW(), NOW())",
                                            [employeeEmail, `✅ You submitted mid-stage successfully`, `my-performance.html?id=${appraisalId}&stage=mid_stage`]
                                        );

                                        return res.json({ success: true, message: "Mid-stage submitted and notifications sent" });
                                    });
                                });
                            });
                        }
                    });
                });
            });
        });
    },



    // ============================
    // Full stage prefill controller
    // ============================
    getFullStagePrefill: (req, res) => {
        const { appraisalId } = req.params;
        if (!appraisalId) return res.status(400).json({ success: false, message: "Appraisal ID is required" });

        const queries = {
            startStage: "SELECT * FROM start_stage WHERE appraisal_id = ?",
            startItems: "SELECT * FROM start_items WHERE appraisal_id = ?",
            midStage: "SELECT * FROM mid_stage WHERE appraisal_id = ?",
            midItems: "SELECT * FROM mid_items WHERE appraisal_id = ?",
            approvalHistory: `
            SELECT pa.approver_user_id, pa.status, pa.updated_at AS date, pa.stage,
                   CONCAT(u.first_name, ' ', u.last_name) AS approved_by_name
            FROM performance_approvals pa
            LEFT JOIN users u ON pa.approver_user_id = u.id
            WHERE pa.performance_request_id = ?
            ORDER BY pa.stage, pa.level ASC
        `
        };

        const responseData = {};

        // Fetch start stage
        db.query(queries.startStage, [appraisalId], (err, startStageRows) => {
            if (err) return res.status(500).json({ success: false, message: "Error fetching start stage", error: err });
            responseData.startStage = startStageRows[0] || null;

            db.query(queries.startItems, [appraisalId], (err2, startItemsRows) => {
                if (err2) return res.status(500).json({ success: false, message: "Error fetching start items", error: err2 });
                responseData.startItems = startItemsRows || [];

                db.query(queries.midStage, [appraisalId], (err3, midStageRows) => {
                    if (err3) return res.status(500).json({ success: false, message: "Error fetching mid stage", error: err3 });
                    responseData.midStage = midStageRows[0] || null;

                    db.query(queries.midItems, [appraisalId], (err4, midItemsRows) => {
                        if (err4) return res.status(500).json({ success: false, message: "Error fetching mid items", error: err4 });
                        responseData.midItems = midItemsRows || [];

                        // Fetch approval history
                        db.query(queries.approvalHistory, [appraisalId], (err5, approvalRows) => {
                            if (err5) return res.status(500).json({ success: false, message: "Error fetching approvals", error: err5 });
                            responseData.approvalHistory = approvalRows || [];
                            res.json({ success: true, data: responseData });
                        });
                    });
                });
            });
        });
    },


    // calculation 
    getEvaluationSummary: (req, res) => {
        const appraisalId = req.params.appraisalId;

        if (!appraisalId) {
            return res.status(400).json({ success: false, message: "Missing appraisal ID" });
        }

        // 🟢 Step 1: Query for Start Stage (Business Targets)
        const startStageQuery = `
        SELECT total_score
        FROM start_stage
        WHERE appraisal_id = ?
        LIMIT 1
    `;

        // 🟢 Step 2: Query for Mid Stage (Professional + Behavioral Competencies)
        const midStageQuery = `
        SELECT professional_total, behavioral_total
        FROM mid_stage
        WHERE appraisal_id = ?
        LIMIT 1
    `;

        db.query(startStageQuery, [appraisalId], (err, startResult) => {
            if (err) {
                console.error("Start Stage Query Error:", err);
                return res.status(500).json({ success: false, message: "Error fetching start stage" });
            }

            const businessScore = startResult.length ? parseFloat(startResult[0].total_score) || 0 : 0;

            db.query(midStageQuery, [appraisalId], (err2, midResult) => {
                if (err2) {
                    console.error("Mid Stage Query Error:", err2);
                    return res.status(500).json({ success: false, message: "Error fetching mid stage" });
                }

                const professionalScore = midResult.length ? parseFloat(midResult[0].professional_total) || 0 : 0;
                const behavioralScore = midResult.length ? parseFloat(midResult[0].behavioral_total) || 0 : 0;

                // 🧮 Step 3: Compute Overall
                const competenciesScore = ((professionalScore + behavioralScore) / 2).toFixed(2);
                const overallScore = ((businessScore + parseFloat(competenciesScore)) / 2).toFixed(2);

                // ✅ Step 4: Respond
                res.json({
                    success: true,
                    data: {
                        business_score: businessScore,
                        professional_score: professionalScore,
                        behavioral_score: behavioralScore,
                        overall_score: parseFloat(overallScore),
                        competencies_score: parseFloat(competenciesScore),
                        overall_score: parseFloat(overallScore)
                    }
                });
            });
        });
    },


    // submit full stage
    submitFullStage: (req, res) => {
        const empCode = req.session.user?.employee_id;
        if (!empCode) return res.status(401).json({ success: false, message: "Not logged in" });

        const {
            start_stage_items: startTargets,
            mid_stage_items: midItems,
            full_stage_items: fullItems,
            overall_comments: overallComments,
            start_comments,
            mid_comments,
            professional_total,
            behavioral_total,
            approvals
        } = req.body;
        if ((!startTargets || !startTargets.length) && (!midItems || !midItems.length) && (!fullItems || !fullItems.length)) {
            return res.status(400).json({ success: false, message: "No data provided for full stage" });
        }

        // Step 1: Get employee details
        const getEmpSql = "SELECT id, department_id, first_name, last_name, email FROM employees WHERE employee_id=?";
        db.query(getEmpSql, [empCode], (err, empRows) => {
            if (err) return res.status(500).json({ success: false, message: "DB error" });
            if (!empRows.length) return res.status(404).json({ success: false, message: "Employee not found" });

            const numericEmpId = empRows[0].id;
            const departmentId = empRows[0].department_id;
            const employeeName = `${empRows[0].first_name} ${empRows[0].last_name}`;
            const employeeEmail = empRows[0].email;

            // Step 2: Get latest appraisal
            const getAppraisalSql = "SELECT id FROM appraisals WHERE employee_id=? ORDER BY id DESC LIMIT 1";
            db.query(getAppraisalSql, [numericEmpId], (err2, appRows) => {
                if (err2) return res.status(500).json({ success: false, message: "DB error" });
                if (!appRows.length) return res.status(404).json({ success: false, message: "No active appraisal found" });

                const appraisalId = appRows[0].id;

                // ====== Step 3: Save start_stage & start_items ======
                function saveStartStage(next) {
                    if (!startTargets || !startTargets.length) return next();

                    const totalWeight = startTargets.reduce((sum, t) => sum + (t.weightage || 0), 0);
                    const totalScore = startTargets.reduce((sum, t) => {
                        const rating = parseFloat(t.rating) || 0;
                        const weight = parseFloat(t.weightage) || 0;
                        return sum + (rating * weight / 100);
                    }, 0);

                    const getStageSql = "SELECT id FROM start_stage WHERE appraisal_id=? LIMIT 1";
                    db.query(getStageSql, [appraisalId], (errStage, stageRows) => {
                        if (errStage) return res.status(500).json({ success: false, message: "DB error checking start_stage" });
                        const stageId = stageRows.length ? stageRows[0].id : null;

                        const saveSql = stageId
                            ? "UPDATE start_stage SET comments=?, total_weight=?, total_score=?, updated_at=NOW() WHERE id=?"
                            : "INSERT INTO start_stage (appraisal_id, comments, total_weight, total_score, created_at, updated_at) VALUES (?,?,?, ?, NOW(), NOW())";

                        const params = stageId
                            ? [start_comments || "", totalWeight, totalScore, stageId]
                            : [appraisalId, start_comments || "", totalWeight, totalScore];

                        db.query(saveSql, params, (errSave, result) => {
                            if (errSave) return res.status(500).json({ success: false, message: "DB error saving start_stage" });
                            const startStageId = stageId || result.insertId;

                            // Save start_items
                            let i = 0;
                            function nextItem() {
                                if (i >= startTargets.length) return next();
                                const t = startTargets[i];
                                if (!t.target_text) { i++; nextItem(); return; }

                                const sql = t.id
                                    ? "UPDATE start_items SET target_text=?, accomplishments=?, manager_comments=?, weightage=?, rating=?, score=? WHERE id=? AND appraisal_id=?"
                                    : "INSERT INTO start_items (appraisal_id, target_text, accomplishments, manager_comments, weightage, rating, score) VALUES (?,?,?,?,?,?,?)";

                                const paramsItem = t.id
                                    ? [t.target_text, t.accomplishments || "", t.manager_comments || "", t.weightage || 0, t.rating || 0, t.score || 0, t.id, appraisalId]
                                    : [appraisalId, t.target_text, t.accomplishments || "", t.manager_comments || "", t.weightage || 0, t.rating || 0, t.score || 0];

                                db.query(sql, paramsItem, (errItem) => {
                                    if (errItem) return res.status(500).json({ success: false, message: "DB error saving start_items" });
                                    i++; nextItem();
                                });
                            }
                            nextItem();
                        });
                    });
                }

                // ====== Step 4: Save mid_stage & mid_items ======
                function saveMidStage(next) {
                    if (!midItems || !midItems.length) return next();

                    const getStageSql = "SELECT id FROM mid_stage WHERE appraisal_id=? LIMIT 1";
                    db.query(getStageSql, [appraisalId], (errStage, stageRows) => {
                        if (errStage) return res.status(500).json({ success: false, message: "DB error checking mid_stage" });
                        const stageId = stageRows.length ? stageRows[0].id : null;

                        // Calculate professional average
                        let professional_total_avg = 0;
                        let behavioral_total_avg = 0;

                        if (midItems.length) {
                            // Average professional ratings per item
                            const profSum = midItems.reduce((sum, item) => {
                                const profRatings = [
                                    item.communication || 0,
                                    item.decision_making || 0,
                                    item.quality_orientation || 0,
                                    item.initiative || 0,
                                    item.technical_skills || 0
                                ];
                                return sum + profRatings.reduce((a, b) => a + b, 0) / profRatings.length;
                            }, 0);
                            professional_total_avg = profSum / midItems.length;

                            // Average behavioral ratings per item
                            const behSum = midItems.reduce((sum, item) => {
                                const behRatings = [
                                    item.team_work || 0,
                                    item.planning_organizing || 0,
                                    item.adaptability || 0,
                                    item.self_confidence || 0,
                                    item.creativity_innovation || 0
                                ];
                                return sum + behRatings.reduce((a, b) => a + b, 0) / behRatings.length;
                            }, 0);
                            behavioral_total_avg = behSum / midItems.length;
                        }

                        // Use averages when saving
                        const saveSql = stageId
                            ? "UPDATE mid_stage SET comments=?, professional_total=?, behavioral_total=?, updated_at=NOW() WHERE id=?"
                            : "INSERT INTO mid_stage (appraisal_id, comments, professional_total, behavioral_total, status, created_at, updated_at) VALUES (?,?,?,?, 'Pending', NOW(), NOW())";

                        const params = stageId
                            ? [mid_comments || "", professional_total_avg, behavioral_total_avg, stageId]
                            : [appraisalId, mid_comments || "", professional_total_avg, behavioral_total_avg];


                        db.query(saveSql, params, (errSave, result) => {
                            if (errSave) return res.status(500).json({ success: false, message: "DB error saving mid_stage" });
                            const midStageId = stageId || result.insertId;

                            let i = 0;
                            function nextItem() {
                                if (i >= midItems.length) return next();
                                const item = midItems[i];

                                const sql = item.id
                                    ? `UPDATE mid_items SET communication=?, decision_making=?, quality_orientation=?, initiative=?,
                                    technical_skills=?, team_work=?, planning_organizing=?, adaptability=?,
                                    self_confidence=?, creativity_innovation=?, strengths=?, training_needs=?,
                                    manager_comments=?, employee_comments=?, updated_at=NOW() WHERE id=? AND appraisal_id=?`
                                    : `INSERT INTO mid_items 
                                    (appraisal_id, communication, decision_making, quality_orientation, initiative,
                                    technical_skills, team_work, planning_organizing, adaptability,
                                    self_confidence, creativity_innovation, strengths, training_needs,
                                    manager_comments, employee_comments, created_at, updated_at)
                                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(), NOW())`;

                                const paramsItem = item.id
                                    ? [item.communication, item.decision_making, item.quality_orientation, item.initiative,
                                    item.technical_skills, item.team_work, item.planning_organizing, item.adaptability,
                                    item.self_confidence, item.creativity_innovation, item.strengths, item.training_needs,
                                    item.manager_comments || "", item.employee_comments || "", item.id, appraisalId]
                                    : [appraisalId, item.communication, item.decision_making, item.quality_orientation, item.initiative,
                                        item.technical_skills, item.team_work, item.planning_organizing, item.adaptability,
                                        item.self_confidence, item.creativity_innovation, item.strengths, item.training_needs,
                                        item.manager_comments || "", item.employee_comments || ""];

                                db.query(sql, paramsItem, (errItem) => {
                                    if (errItem) return res.status(500).json({ success: false, message: "DB error saving mid_items" });
                                    i++; nextItem();
                                });
                            }
                            nextItem();
                        });
                    });
                }

                // ====== Step 5: Save full_stage & full_items ======
                function saveFullStage() {
                    if (!fullItems || !fullItems.length) return sendNotifications();

                    const businessTargetsScore = (startTargets || []).reduce((acc, item) => {
                        const rating = parseFloat(item.rating) || 0;
                        const weight = parseFloat(item.weightage) || 0;
                        return acc + (rating * weight / 100); // Correct formula
                    }, 0);
                    const competenciesScore = (professional_total || 0) + (behavioral_total || 0);
                    const overallScore = (businessTargetsScore * 0.6) + (professional_total * 0.2) + (behavioral_total * 0.2);


                    const getStageSql = "SELECT id FROM full_stage WHERE appraisal_id=? LIMIT 1";
                    db.query(getStageSql, [appraisalId], (errStage, stageRows) => {
                        if (errStage) return res.status(500).json({ success: false, message: "DB error checking full_stage" });

                        const stageId = stageRows.length ? stageRows[0].id : null;
                        const saveSql = stageId
                            ? "UPDATE full_stage SET business_targets_score=?, professional=?, behavioral=?, overall_score=?, updated_at=NOW() WHERE id=?"
                            : "INSERT INTO full_stage (appraisal_id, business_targets_score, professional, behavioral, overall_score, status, created_at, updated_at) VALUES (?,?,?,?,?, 'Pending', NOW(), NOW())";

                        const params = stageId
                            ? [businessTargetsScore, professional_total, behavioral_total, overallScore, stageId]
                            : [appraisalId, businessTargetsScore, professional_total, behavioral_total, overallScore];

                        db.query(saveSql, params, (errSave, result) => {
                            if (errSave) return res.status(500).json({ success: false, message: "DB error saving full_stage" });

                            let i = 0;
                            function nextItem() {
                                if (i >= fullItems.length) return saveApprovalHistory();
                                const item = fullItems[i];

                                const sql = item.id
                                    ? `UPDATE full_items 
                                    SET key_achievements=?, development_areas=?, employee_comments=?, manager_comments=?, strengths=?, training_needs=?, updated_at=NOW() 
                                    WHERE id=? AND appraisal_id=?`
                                    : `INSERT INTO full_items 
                                    (appraisal_id, key_achievements, development_areas, employee_comments, manager_comments, strengths, training_needs, created_at, updated_at) 
                                    VALUES (?,?,?,?,?,?,?, NOW(), NOW())`;

                                const paramsItem = item.id
                                    ? [item.key_achievements, item.development_areas, item.employee_comments || "", item.manager_comments || "", item.strengths, item.training_needs, item.id, appraisalId]
                                    : [appraisalId, item.key_achievements, item.development_areas, item.employee_comments || "", item.manager_comments || "", item.strengths, item.training_needs];

                                db.query(sql, paramsItem, (errItem, resultItem) => {
                                    if (errItem) {
                                        console.error("❌ Full Item DB Error:", errItem);
                                        return res.status(500).json({ success: false, message: "DB error saving full_items" });
                                    }
                                    i++; nextItem();
                                });
                            }
                            nextItem();
                        });
                    });
                }


                function saveApprovalHistory() {
                    if (!approvals || !approvals.length) return sendNotifications();

                    // Delete old entries first
                    const deleteSql = "DELETE FROM stage_approvals WHERE appraisal_id = ?";
                    db.query(deleteSql, [appraisalId], (errDel) => {
                        if (errDel) {
                            console.error("❌ Error deleting old stage_approvals:", errDel);
                            return res.status(500).json({ success: false, message: "DB error clearing approvals" });
                        }

                        // Prepare new insert values
                        const values = approvals.map(a => {
                            const inputDate = a.approval_date?.trim() || "";

                            // Try to convert multiple date formats safely
                            const parsed = dayjs(inputDate, [
                                "DD-MM-YYYY",
                                "DD/MM/YYYY",
                                "D-M-YYYY",
                                "D/M/YYYY",
                                "DD MMM YYYY",
                                "YYYY-MM-DD"
                            ]);

                            // If invalid, use today’s date as fallback
                            const finalDate = parsed.isValid()
                                ? parsed.format("YYYY-MM-DD")
                                : dayjs().format("YYYY-MM-DD");

                            return [
                                appraisalId,
                                a.approver_type,
                                a.approver_name,
                                finalDate,
                                a.comments || ""
                            ];
                        });

                        const insertSql = `
                        INSERT INTO stage_approvals
                        (appraisal_id, approver_type, approver_name, approval_date, comments)
                        VALUES ?
                        `;
                        db.query(insertSql, [values], (errInsert) => {
                            if (errInsert) {
                                console.error("❌ Error inserting stage_approvals:", errInsert);
                                return res.status(500).json({ success: false, message: "DB error saving approvals" });
                            }
                            sendNotifications(); // proceed next
                        });
                    });
                }


                // ====== Step 6: Trigger Notifications and Performance Approval ONLY Level-1 Properly ======
                const sendNotifications = () => {
                    const flowSql = "SELECT specific_user_id FROM performance_approval_flows WHERE department_id=? AND level=1 LIMIT 1";
                    db.query(flowSql, [departmentId], (errFlow, rowsFlow) => {
                        if (errFlow || !rowsFlow.length) {
                            console.error("❌ No approver found");
                            return res.status(500).json({ success: false, message: "Approver not found" });
                        }

                        const approverUserId = rowsFlow[0].specific_user_id;



                        // ✅ SELF-REQUEST OVERRIDE → 31 or 50 → go to 11 → then 13
                        const creatorUserId = req.session.user?.user_id;

                        if (creatorUserId === 31 || creatorUserId === 50) {
                            const level1 = 11;
                            const level2 = 13;

                            // Level-1 Approver
                            db.query(`
                            INSERT INTO performance_approvals 
                            (performance_request_id, approver_user_id, level, stage, status, updated_at)
                            VALUES (?, ?, 1, 'full_stage', 'Pending', NOW())
                            `, [appraisalId, level1]);


                            // Notify Level-1 only
                            db.query("SELECT email FROM users WHERE id=? LIMIT 1", [level1], (e, rows) => {
                                const email1 = rows?.[0]?.email;
                                if (email1) {
                                    db.query(
                                        `INSERT INTO notifications (email, message, link, status, created_at, updated_at)
                                         VALUES (?, ?, ?, 'unread', NOW(), NOW())`,
                                        [
                                            email1,
                                            `📩 Full-stage request pending your approval`,
                                            `performance-approval.html?id=${appraisalId}&stage=full_stage`
                                        ]
                                    );
                                }
                            });

                            // Notify Employee
                            db.query(
                                `INSERT INTO notifications (email, message, link, status, created_at, updated_at)
                                 VALUES (?, ?, ?, 'unread', NOW(), NOW())`,
                                [
                                    employeeEmail,
                                    `✅ Full-stage submitted successfully`,
                                    `my-performance.html?id=${appraisalId}&stage=full_stage`
                                ]
                            );

                            return res.json({
                                success: true,
                                message: "Self-request routed → Full Stage → L1 → L2"
                            });
                        }





                        // ✅ Check if Level-1 approval already exists
                        const checkSql = `
                        SELECT id FROM performance_approvals
                        WHERE performance_request_id=? AND level=1 AND stage='full_stage' LIMIT 1
                        `;
                        db.query(checkSql, [appraisalId], (errC, existing) => {
                            if (errC) return res.status(500).json({ success: false, message: "DB error checking approval" });

                            if (existing.length === 0) {
                                // ✅ Insert new Level-1 approval ONLY if not exists
                                const insertSql = `
                                INSERT INTO performance_approvals 
                                (performance_request_id, approver_user_id, level, stage, status, updated_at)
                                VALUES (?, ?, 1, 'full_stage', 'Pending', NOW())
                                `;
                                db.query(insertSql, [appraisalId, approverUserId]);
                            }

                            // ✅ Send Notification to Approver & Employee
                            const approverEmailSql = "SELECT email FROM users WHERE id=? LIMIT 1";
                            db.query(approverEmailSql, [approverUserId], (errEmail, eRows) => {
                                if (!eRows || !eRows.length) {
                                    return res.status(500).json({ success: false, message: "No approver email" });
                                }
                                const approverEmail = eRows[0].email;

                                db.query(
                                    "INSERT INTO notifications (email, message, link, status, created_at, updated_at) VALUES (?, ?, ?, 'unread', NOW(), NOW())",
                                    [approverEmail, `📋 Full-stage submitted by ${employeeName}`, `performance-approval.html?id=${appraisalId}&stage=full_stage`]
                                );

                                db.query(
                                    "INSERT INTO notifications (email, message, link, status, created_at, updated_at) VALUES (?, ?, ?, 'unread', NOW(), NOW())",
                                    [employeeEmail, `✅ Full-stage submitted successfully`, `my-performance.html?id=${appraisalId}&stage=full_stage`]
                                );
                                return res.json({ success: true, message: "Full-stage submitted & approval triggered" });
                            });
                        });
                    });
                };

                // ====== Execute steps sequentially ======
                saveStartStage(() => saveMidStage(saveFullStage));
            });
        });
    },




    // =============================
    // Approver controller
    // =============================

    updateAppraisalStatus: (req, res) => {

        const { appraisalId, status, reason } = req.body;
        const approverUserId = req.session.user?.user_id; // numeric user ID from session


        if (!approverUserId) {
            return res.status(401).json({ success: false, message: "Not logged in" });
        }

        // Step 1: Update current approver decision (stage filter included)
        const updateSql = `
            UPDATE performance_approvals
            SET status = ?, updated_at = NOW()
            WHERE performance_request_id = ? 
            AND approver_user_id = ? 
            AND stage='start_stage'
            AND status = 'Pending'
            `;

        db.query(updateSql, [status, appraisalId, approverUserId], (err, result) => {
            if (err) {
                console.error("❌ DB error while updating approval:", err.sqlMessage || err);
                return res.status(500).json({ success: false, message: "DB error while updating approval" });
            }

            // ✅ No rows updated → means this approver already acted
            if (result.affectedRows === 0) {
                return res.json({ success: false, message: "You already took action on this request." });
            }

            // =====================
            // Rejected → notify employee
            // =====================
            if (status === "Rejected") {
                const updateStageSql = `
                UPDATE start_stage
                SET status='rejected', rejected_by=?, rejection_reason=?, updated_at=NOW()
                WHERE appraisal_id=?
                `;
                db.query(updateStageSql, [approverUserId, reason, appraisalId], (errStage) => {
                    if (errStage) return res.status(500).json({ success: false, message: "Failed to update stage" });

                    // Employee notification
                    const empNotifSql = `
                    UPDATE notifications n
                    JOIN employees e ON e.email = n.email
                    JOIN appraisals a ON e.id = a.employee_id
                    SET n.message=?, n.status='unread', n.updated_at=NOW()
                    WHERE a.id=? AND n.link=?;
                    `;
                    db.query(empNotifSql, ["❌ Your performance request has been rejected", appraisalId, `my-performance.html?id=${appraisalId}&stage=start_stage`]);

                    // Approver notification
                    const approverNotifSql = `
                    UPDATE notifications n
                    JOIN users u ON u.email = n.email
                    SET n.message=?, n.status='unread', n.updated_at=NOW()
                    WHERE u.id=? AND n.link=?;
                    `;
                    db.query(approverNotifSql, [
                        `❌ You have rejected this performance request`,
                        approverUserId,
                        `performance-approval.html?id=${appraisalId}&stage=start_stage`
                    ]);

                    return res.json({ success: true, message: "Request rejected & flow stopped" });
                });
                return;
            }

            // =====================
            // Approved → next approver
            // =====================
            const currentLevelSql = `
            SELECT level FROM performance_approvals
            WHERE performance_request_id=? AND approver_user_id=?  AND stage='start_stage'
            LIMIT 1
            `;
            db.query(currentLevelSql, [appraisalId, approverUserId], (errLvl, lvlRows) => {
                if (errLvl || !lvlRows.length) {
                    return res.json({ success: true, message: "Approved but level fetch failed" });
                }

                const currentLevel = lvlRows[0].level;
                const nextLevel = currentLevel + 1;

                if (approverUserId === 31 || approverUserId === 50) {

                    let forcedApprover = null;
                    if (nextLevel === 1) forcedApprover = 11;
                    if (nextLevel === 2) forcedApprover = 13;

                    if (forcedApprover) {

                        const insForcedSql = `
        INSERT INTO performance_approvals
        (performance_request_id, approver_user_id, level, status, stage, updated_at)
        VALUES (?, ?, ?, 'Pending', 'start_stage', NOW())
        `;
                        db.query(insForcedSql, [appraisalId, forcedApprover, nextLevel]);

                        // ✅ Add missing notifications
                        (async () => {

                            const employeeEmail = await getEmployeeEmailByAppraisal(appraisalId);
                            const nextApproverEmail = await getUserEmail(forcedApprover);
                            const approverEmail = await getUserEmail(approverUserId);

                            // ✅ Employee notification
                            await pushNotification(
                                employeeEmail,
                                "⏳ Your performance request is under process",
                                `my-performance.html?id=${appraisalId}&stage=start_stage`
                            );

                            // ✅ Approver (who took action)
                            await pushNotification(
                                approverEmail,
                                "✅ You have approved this performance request",
                                `performance-approval.html?id=${appraisalId}&stage=start_stage`
                            );

                            // ✅ Next approver (Level-1 → 11 / Level-2 → 13)
                            await pushNotification(
                                nextApproverEmail,
                                "📩 New performance request pending your approval",
                                `performance-approval.html?id=${appraisalId}&stage=start_stage`
                            );

                            return res.json({
                                success: true,
                                message: `Self-request override: moved to approver user_id ${forcedApprover}`
                            });

                        })();

                        return; // prevent function from continuing
                    }
                }


                // Fetch next approver using only specific_user_id
                const nextApproverSql = `
                SELECT specific_user_id FROM performance_approval_flows
                WHERE department_id = (
                    SELECT department_id
                    FROM employees e
                    JOIN appraisals a ON a.employee_id = e.id
                    WHERE a.id = ?
                )
                AND level = ?
                LIMIT 1
                `;
                db.query(nextApproverSql, [appraisalId, nextLevel], (errNext, nextRows) => {
                    if (errNext) {
                        return res.status(500).json({ success: false, message: "DB error finding next approver" });
                    }

                    if (!nextRows.length) {
                        // Fully approved
                        const finalSql = "UPDATE appraisals SET status='Approved', updated_at=NOW() WHERE id=?";
                        db.query(finalSql, [appraisalId]);

                        //  Update start_stage to approved
                        const updateStartStageFinalSql = `
                        UPDATE start_stage
                        SET status = 'approved', updated_at = NOW()
                        WHERE appraisal_id = ?
                        `;
                        db.query(updateStartStageFinalSql, [appraisalId]);

                        const msg = "✅ Your performance request has been fully approved";
                        const link = `my-performance.html?id=${appraisalId}&stage=start_stage`;
                        db.query(
                            "UPDATE notifications n " +
                            "JOIN employees e ON e.email = n.email " +
                            "JOIN appraisals a ON a.employee_id = e.id " +
                            "SET n.message=?, n.status='unread', n.updated_at=NOW() " +
                            "WHERE a.id=? AND n.link=?",
                            [msg, appraisalId, link]
                        );

                        // Approver notification
                        const approverNotifSql = `
                        UPDATE notifications n
                        JOIN users u ON u.email = n.email
                        SET n.message=?, n.status='unread', n.updated_at=NOW()
                        WHERE u.id=? AND n.link=?;
                        `;
                        db.query(approverNotifSql, [
                            `✅ You have approved this performance request`,
                            approverUserId,
                            `performance-approval.html?id=${appraisalId}&stage=start_stage`
                        ]);

                        return res.json({ success: true, message: "Final approval completed" });
                    }

                    // Next approver exists
                    const nextApproverUserId = nextRows[0].specific_user_id;

                    // Insert next approver
                    const insSql = `
                    INSERT INTO performance_approvals
                    (performance_request_id, approver_user_id, level, status, stage, updated_at)
                    VALUES (?, ?, ?, 'Pending', 'start_stage', NOW())
                    `;
                    db.query(insSql, [appraisalId, nextApproverUserId, nextLevel]);

                    // Notify next approver
                    const nextApproverEmailSql = `SELECT email FROM users WHERE id=? LIMIT 1`;
                    db.query(nextApproverEmailSql, [nextApproverUserId], (errEmail, emailRows) => {
                        const nextApproverEmail = emailRows[0]?.email;

                        if (nextApproverEmail) {
                            const msg = "📩 New performance request pending your approval";
                            const linkApprover = `performance-approval.html?id=${appraisalId}&stage=start_stage`;
                            db.query(
                                "INSERT INTO notifications (email, message, link, status, created_at, updated_at) " +
                                "VALUES (?, ?, ?, 'unread', NOW(), NOW())",
                                [nextApproverEmail, msg, linkApprover]
                            );
                        }

                        // Employee notification
                        const empNotifSql = `
                        UPDATE notifications n
                        JOIN employees e ON e.email = n.email
                        JOIN appraisals a ON e.id = a.employee_id
                        SET n.message='⏳ Your performance request is under process',
                        n.status='unread',
                        n.updated_at=NOW()
                        WHERE a.id=? AND n.link=?;
                        `;
                        db.query(empNotifSql, [appraisalId, `my-performance.html?id=${appraisalId}&stage=start_stage`]);

                        // Current approver notification
                        const approverNotifSql2 = `
                        UPDATE notifications n
                        JOIN users u ON u.email = n.email
                        SET n.message=?, n.status='unread', n.updated_at=NOW()
                        WHERE u.id=? AND n.link=?;
                        `;
                        db.query(approverNotifSql2, [
                            `✅ You have approved this performance request`,
                            approverUserId,
                            `performance-approval.html?id=${appraisalId}&stage=start_stage`
                        ]);

                        return res.json({ success: true, message: `Moved to approver level ${nextLevel}` });
                    });
                });
            });
        });
    },




    // ==============================================================
    // getStageDetails (only return the active stage, with comments)
    //===============================================================

    getStageDetails: (req, res) => {
        const appraisalId = req.query.id;
        const stage = req.query.stage; // 👈 capture stage if passed

        if (!appraisalId) {
            return res.status(400).json({ success: false, message: "Appraisal id missing" });
        }

        // ==========================
        // CASE 1: If stage param is provided → fetch only that stage
        // ==========================
        if (stage) {
            let sql = "";
            if (stage === "start_stage") {
                sql = `
                SELECT s.*, si.id AS item_id, si.target_text, si.accomplishments, si.manager_comments, si.weightage, si.rating, si.score,
                       e.first_name, e.last_name, e.employee_id
                FROM start_stage s
                LEFT JOIN start_items si ON si.appraisal_id = s.appraisal_id
                JOIN appraisals a ON s.appraisal_id = a.id
                JOIN employees e ON a.employee_id = e.id
                WHERE a.id = ?
                `;
            } else if (stage === "mid_stage") {
                sql = `
               SELECT 
               m.*, mi.id AS item_id, mi.communication, mi.decision_making, mi.quality_orientation, mi.initiative, mi.technical_skills,
               mi.team_work, mi.planning_organizing, mi.adaptability, mi.self_confidence, mi.creativity_innovation, mi.strengths,
               mi.training_needs, mi.manager_comments, mi.employee_comments, e.first_name,  e.last_name,  e.employee_id
               FROM mid_stage m 
               LEFT JOIN mid_items mi ON mi.appraisal_id = m.appraisal_id   -- 👈 join employee’s filled data
               JOIN appraisals a ON m.appraisal_id = a.id
               JOIN employees e ON a.employee_id = e.id
               WHERE a.id = ?
               `;
            } else if (stage === "full_stage") {
                sql = `
                SELECT 
                f.*, 
                fi.id AS full_item_id,
                fi.key_achievements,
                fi.development_areas,
                fi.employee_comments,
                fi.manager_comments,
                fi.strengths,
                fi.training_needs,
                e.first_name,
                e.last_name,
                e.employee_id
                FROM full_stage f
                LEFT JOIN full_items fi ON fi.appraisal_id = f.appraisal_id
                JOIN appraisals a ON f.appraisal_id = a.id
                JOIN employees e ON a.employee_id = e.id
                WHERE a.id = ?
                `;

            } else {
                return res.status(400).json({ success: false, message: "Invalid stage parameter" });
            }

            db.query(sql, [appraisalId], (err, rows) => {
                if (err) {
                    console.error("❌ Database error:", err);
                    return res.status(500).json({ success: false, message: "DB error", error: err });
                }
                if (!rows.length) return res.status(404).json({ success: false, message: `No data for ${stage}` });

                if (stage === "start_stage") {
                    // fetch approvals
                    const sqlApprovals = `
                    SELECT * FROM performance_approvals
                    WHERE performance_request_id = ? AND stage = 'start_stage'
                    `;
                    db.query(sqlApprovals, [appraisalId], (errAppr, approvalRows) => {
                        if (errAppr) return res.status(500).json({ success: false, message: "DB error approvals" });

                        const items = rows
                            .filter(r => r.item_id)
                            .map(r => ({
                                id: r.item_id,
                                target_text: r.target_text,
                                accomplishments: r.accomplishments,
                                manager_comments: r.manager_comments,
                                weightage: r.weightage,
                                rating: r.rating,
                                score: r.score
                            }));

                        return res.json({
                            success: true,
                            stage: "start_stage",
                            employee: {
                                id: rows[0].employee_id,
                                name: `${rows[0].first_name} ${rows[0].last_name}`
                            },
                            stageData: rows[0],
                            items,
                            approvals: approvalRows,
                            comments: rows[0].comments || "",
                            targets: items
                        });
                    });
                }
                else if (stage === "mid_stage") {
                    const sqlApprovals = `
                    SELECT * FROM performance_approvals
                    WHERE performance_request_id = ? AND stage = 'mid_stage'
                    `;
                    db.query(sqlApprovals, [appraisalId], (errAppr, approvalRows) => {
                        if (errAppr) return res.status(500).json({ success: false, message: "DB error approvals" });

                        const stageRow = rows[0];  // only one mid_stage row expected
                        const item = {
                            id: stageRow.item_id,
                            communication: stageRow.communication,
                            decision_making: stageRow.decision_making,
                            quality_orientation: stageRow.quality_orientation,
                            initiative: stageRow.initiative,
                            technical_skills: stageRow.technical_skills,
                            team_work: stageRow.team_work,
                            planning_organizing: stageRow.planning_organizing,
                            adaptability: stageRow.adaptability,
                            self_confidence: stageRow.self_confidence,
                            creativity_innovation: stageRow.creativity_innovation,
                            strengths: stageRow.strengths,
                            training_needs: stageRow.training_needs,
                            manager_comments: stageRow.manager_comments,
                            employee_comments: stageRow.employee_comments
                        };

                        return res.json({
                            success: true,
                            stage: "mid_stage",
                            employee: {
                                id: stageRow.employee_id,
                                name: `${stageRow.first_name} ${stageRow.last_name}`
                            },
                            stageData: stageRow,
                            approvals: approvalRows,
                            comments: stageRow.comments || "",
                            targets: item   // 👈 approver will now see employee’s filled data
                        });
                    });
                } else if (stage === "full_stage") {
                    // ------------------------
                    // Fetch Start Stage items
                    // ------------------------
                    const sqlStart = `
                    SELECT s.*, si.id AS item_id, si.target_text, si.accomplishments, si.manager_comments, si.weightage, si.rating, si.score,
                    e.first_name, e.last_name, e.employee_id
                    FROM start_stage s
                    LEFT JOIN start_items si ON si.appraisal_id = s.appraisal_id
                    JOIN appraisals a ON s.appraisal_id = a.id
                    JOIN employees e ON a.employee_id = e.id
                    WHERE a.id = ?
                    `;


                    db.query(sqlStart, [appraisalId], (errStart, startRows) => {
                        if (errStart) return res.status(500).json({ success: false, message: "DB error fetching start stage" });

                        const startItems = startRows
                            .filter(r => r.item_id)
                            .map(r => ({
                                id: r.item_id,
                                target_text: r.target_text,
                                accomplishments: r.accomplishments,
                                manager_comments: r.manager_comments,
                                weightage: r.weightage,
                                rating: r.rating,
                                score: r.score
                            }));
                        const startComments = startRows[0]?.comments || ""

                        // ------------------------
                        // Fetch Mid Stage items
                        // ------------------------
                        const sqlMid = `
                        SELECT m.*, mi.id AS item_id, mi.communication, mi.decision_making, mi.quality_orientation, mi.initiative,
                        mi.technical_skills, mi.team_work, mi.planning_organizing, mi.adaptability, mi.self_confidence,
                        mi.creativity_innovation, mi.strengths, mi.training_needs, mi.manager_comments, mi.employee_comments,
                        e.first_name, e.last_name, e.employee_id
                        FROM mid_stage m
                        LEFT JOIN mid_items mi ON mi.appraisal_id = m.appraisal_id
                        JOIN appraisals a ON m.appraisal_id = a.id
                        JOIN employees e ON a.employee_id = e.id
                        WHERE a.id = ?
                        `;
                        db.query(sqlMid, [appraisalId], (errMid, midRows) => {
                            if (errMid) return res.status(500).json({ success: false, message: "DB error fetching mid stage" });

                            const midItem = midRows.length ? {
                                id: midRows[0].item_id,
                                communication: midRows[0].communication,
                                decision_making: midRows[0].decision_making,
                                quality_orientation: midRows[0].quality_orientation,
                                initiative: midRows[0].initiative,
                                technical_skills: midRows[0].technical_skills,
                                team_work: midRows[0].team_work,
                                planning_organizing: midRows[0].planning_organizing,
                                adaptability: midRows[0].adaptability,
                                self_confidence: midRows[0].self_confidence,
                                creativity_innovation: midRows[0].creativity_innovation,
                                strengths: midRows[0].strengths,
                                training_needs: midRows[0].training_needs,
                                manager_comments: midRows[0].manager_comments,
                                employee_comments: midRows[0].employee_comments,
                                // totals
                                professional_total: midRows[0].professional_total,
                                behavioral_total: midRows[0].behavioral_total,
                            } : null;

                            const midComments = midRows[0]?.comments || "";

                            // ------------------------
                            // Fetch Full Stage items
                            // ------------------------
                            const sqlFull = `
                            SELECT 
                            f.*, 
                            fi.id AS full_item_id,
                            fi.key_achievements,
                            fi.development_areas,
                            fi.employee_comments,
                            fi.manager_comments,
                            fi.strengths,
                            fi.training_needs,
                            e.first_name,
                            e.last_name,
                            e.employee_id
                            FROM full_stage f
                            LEFT JOIN full_items fi ON fi.appraisal_id = f.appraisal_id
                            JOIN appraisals a ON f.appraisal_id = a.id
                            JOIN employees e ON a.employee_id = e.id
                            WHERE a.id = ?
                            `;
                            db.query(sqlFull, [appraisalId], (errFull, fullRows) => {
                                if (errFull) return res.status(500).json({ success: false, message: "DB error fetching full stage" });
                                if (!fullRows.length)
                                    return res.status(404).json({ success: false, message: "No full stage data found" });

                                const fullItems = fullRows
                                    .filter(r => r.item_id)
                                    .map(r => ({
                                        id: r.item_id,
                                        target_text: r.target_text,
                                        accomplishments: r.accomplishments,
                                        manager_comments: r.manager_comments,
                                        weightage: r.weightage,
                                        rating: r.rating,
                                        score: r.score
                                    }));

                                // ------------------------
                                // Fetch Approvals for full_stage
                                // ------------------------
                                const sqlApprovals = `
                                SELECT * FROM performance_approvals
                                WHERE performance_request_id = ? AND stage = 'full_stage'
                                `;
                                db.query(sqlApprovals, [appraisalId], (errAppr, approvalRows) => {
                                    if (errAppr) return res.status(500).json({ success: false, message: "DB error approvals" });




                                    // ------------------------
                                    // Fetch Section 8: stage_approvals
                                    // ------------------------
                                    const sqlStageApprovals = `
                                    SELECT 
                                    approver_type,
                                    approver_name,
                                    DATE_FORMAT(approval_date, '%Y-%m-%d') AS approval_date,
                                    comments
                                    FROM stage_approvals
                                    WHERE appraisal_id = ?
                                    ORDER BY id ASC
                                    `;

                                    db.query(sqlStageApprovals, [appraisalId], (errStageAppr, stageApprovalRows) => {
                                        if (errStageAppr)
                                            return res.status(500).json({ success: false, message: "DB error fetching stage approvals" });


                                        // Combine all items into a single object for approver
                                        const allTargets = {
                                            start: startItems,
                                            mid: midItem,
                                            full: fullItems
                                        };

                                        return res.json({
                                            success: true,
                                            stage: "full_stage",
                                            employee: {
                                                id: fullRows[0].employee_id,
                                                name: `${fullRows[0].first_name} ${fullRows[0].last_name}`
                                            },
                                            stageData: fullRows[0],
                                            approvals: approvalRows,
                                            section8Approvals: stageApprovalRows,
                                            startComments: startComments,
                                            midComments: midComments,
                                            targets: allTargets
                                        });
                                    });
                                });
                            });
                        });
                    });
                }

            });
            return; // 👈 VERY IMPORTANT: stop execution here if stage param was provided
        }


        // ==========================
        // CASE 2: No stage param → fallback (start → mid → full)
        // ==========================
        const sqlStart = `
        SELECT s.*, si.id AS item_id, si.target_text, si.accomplishments, si.manager_comments, si.weightage, si.rating, si.score,
               e.first_name, e.last_name, e.employee_id
        FROM start_stage s
        LEFT JOIN start_items si ON si.appraisal_id = s.appraisal_id
        JOIN appraisals a ON s.appraisal_id = a.id
        JOIN employees e ON a.employee_id = e.id
        WHERE a.id = ?
        `;
        db.query(sqlStart, [appraisalId], (errStart, startRows) => {
            if (errStart) return res.status(500).json({ success: false, message: "DB error fetching start stage" });
            if (!startRows.length) {
                // No start_stage → try mid_stage
                return checkMidStage();
            }

            const sqlApprovals = `
            SELECT * FROM performance_approvals
            WHERE performance_request_id = ? AND stage = 'start_stage'
            `;
            db.query(sqlApprovals, [appraisalId], (errAppr, approvalRows) => {
                if (errAppr) return res.status(500).json({ success: false, message: "DB error approvals" });

                const items = startRows
                    .filter(r => r.item_id)
                    .map(r => ({
                        id: r.item_id,
                        target_text: r.target_text,
                        accomplishments: r.accomplishments,
                        manager_comments: r.manager_comments,
                        weightage: r.weightage,
                        rating: r.rating,
                        score: r.score
                    }));

                return res.json({
                    success: true,
                    stage: "start_stage",
                    employee: {
                        id: startRows[0].employee_id,
                        name: `${startRows[0].first_name} ${startRows[0].last_name}`
                    },
                    stageData: startRows[0],
                    items,
                    approvals: approvalRows,
                    comments: startRows[0].comments || "",
                    targets: items
                });
            });
        });

        function checkMidStage() {
            const sqlMid = `
            SELECT 
            m.*, mi.id AS item_id, mi.communication, mi.decision_making, mi.quality_orientation, mi.initiative,
            mi.technical_skills, mi.team_work, mi.planning_organizing, mi.adaptability, mi.self_confidence,
            mi.creativity_innovation, mi.strengths, mi.training_needs, mi.manager_comments, mi.employee_comments,
            e.first_name, e.last_name, e.employee_id
            FROM mid_stage m
            LEFT JOIN mid_items mi ON mi.appraisal_id = m.appraisal_id
            JOIN appraisals a ON m.appraisal_id = a.id
            JOIN employees e ON a.employee_id = e.id
            WHERE a.id = ?
            `;
            db.query(sqlMid, [appraisalId], (errMid, midRows) => {
                if (errMid) return res.status(500).json({ success: false, message: "DB error mid_stage" });
                if (midRows.length) {
                    // fetch mid-stage approvals
                    const sqlApprovals = `
                SELECT * FROM performance_approvals
                WHERE performance_request_id = ? AND stage = 'mid_stage'
                `;
                    db.query(sqlApprovals, [appraisalId], (errAppr, approvalRows) => {
                        if (errAppr) return res.status(500).json({ success: false, message: "DB error approvals" });

                        const stageRow = midRows[0]; // only one mid_stage row expected
                        const item = {
                            id: stageRow.item_id,
                            communication: stageRow.communication,
                            decision_making: stageRow.decision_making,
                            quality_orientation: stageRow.quality_orientation,
                            initiative: stageRow.initiative,
                            technical_skills: stageRow.technical_skills,
                            team_work: stageRow.team_work,
                            planning_organizing: stageRow.planning_organizing,
                            adaptability: stageRow.adaptability,
                            self_confidence: stageRow.self_confidence,
                            creativity_innovation: stageRow.creativity_innovation,
                            strengths: stageRow.strengths,
                            training_needs: stageRow.training_needs,
                            manager_comments: stageRow.manager_comments,
                            employee_comments: stageRow.employee_comments
                        };

                        return res.json({
                            success: true,
                            stage: "mid_stage",
                            employee: {
                                id: stageRow.employee_id,
                                name: `${stageRow.first_name} ${stageRow.last_name}`
                            },
                            stageData: stageRow,
                            approvals: approvalRows,
                            comments: stageRow.comments || "",
                            targets: item // 👈 mapped employee’s filled data
                        });
                    });
                    return;
                }
                checkFullStage();
            });
        }
        function checkFullStage() {
            // Fetch approvals for all stages
            const sqlApprovals = `
            SELECT * FROM performance_approvals
            WHERE performance_request_id = ?
            `;
            db.query(sqlApprovals, [appraisalId], (errAppr, approvalRows) => {
                if (errAppr) return res.status(500).json({ success: false, message: "DB error approvals" });

                // Start stage
                const sqlStart = `
            SELECT s.*, si.id AS item_id, si.target_text, si.accomplishments, si.manager_comments, si.weightage, si.rating, si.score,
                   e.first_name, e.last_name, e.employee_id
            FROM start_stage s
            LEFT JOIN start_items si ON si.appraisal_id = s.appraisal_id
            JOIN appraisals a ON s.appraisal_id = a.id
            JOIN employees e ON a.employee_id = e.id
            WHERE a.id = ?
        `;
                db.query(sqlStart, [appraisalId], (errStart, startRows) => {
                    if (errStart) return res.status(500).json({ success: false, message: "DB error start_stage" });

                    const startItems = startRows
                        .filter(r => r.item_id)
                        .map(r => ({
                            stage: "start_stage",
                            id: r.item_id,
                            target_text: r.target_text,
                            accomplishments: r.accomplishments,
                            manager_comments: r.manager_comments,
                            weightage: r.weightage,
                            rating: r.rating,
                            score: r.score
                        }));
                    const startComments = startRows[0]?.comments || ""

                    // Mid stage
                    const sqlMid = `
                    SELECT m.*, mi.id AS item_id, mi.communication, mi.decision_making, mi.quality_orientation, mi.initiative,
                    mi.technical_skills, mi.team_work, mi.planning_organizing, mi.adaptability, mi.self_confidence,
                    mi.creativity_innovation, mi.strengths, mi.training_needs, mi.manager_comments, mi.employee_comments
                    FROM mid_stage m
                    LEFT JOIN mid_items mi ON mi.appraisal_id = m.appraisal_id
                    WHERE m.appraisal_id = ?
                    `;

                    db.query(sqlMid, [appraisalId], (errMid, midRows) => {
                        if (errMid) return res.status(500).json({ success: false, message: "DB error mid_stage" });
                        if (!midRows.length) return res.status(404).json({ success: false, message: "No mid_stage data" });

                        // Get totals & comments from mid_stage table (first row)
                        const midStageRow = midRows[0];
                        const midTotals = {
                            professional_total: midStageRow.professional_total,
                            behavioral_total: midStageRow.behavioral_total,
                            comments: midStageRow.comments
                        };

                        const midItems = midRows
                            .filter(r => r.item_id)
                            .map(r => ({
                                stage: "mid_stage",
                                id: r.item_id,
                                communication: r.communication,
                                decision_making: r.decision_making,
                                quality_orientation: r.quality_orientation,
                                initiative: r.initiative,
                                technical_skills: r.technical_skills,
                                team_work: r.team_work,
                                planning_organizing: r.planning_organizing,
                                adaptability: r.adaptability,
                                self_confidence: r.self_confidence,
                                creativity_innovation: r.creativity_innovation,
                                strengths: r.strengths,
                                training_needs: r.training_needs,
                                manager_comments: r.manager_comments,
                                employee_comments: r.employee_comments
                            }));
                        const midComments = midRows[0]?.comments || "";

                        // Full stage
                        const sqlFull = `
                        SELECT f.*, 
                        fi.id AS full_item_id,
                        fi.key_achievements,
                        fi.development_areas,
                        fi.employee_comments,
                        fi.manager_comments,
                        fi.strengths,
                        fi.training_needs,
                        e.first_name,
                        e.last_name,
                        e.employee_id
                        FROM full_stage f
                        LEFT JOIN full_items fi ON fi.appraisal_id = f.appraisal_id
                        JOIN appraisals a ON f.appraisal_id = a.id
                        JOIN employees e ON a.employee_id = e.id
                        WHERE a.id = ?
                        `;
                        db.query(sqlFull, [appraisalId], (errFull, fullRows) => {
                            if (errFull) return res.status(500).json({ success: false, message: "DB error full_stage" });
                            if (!fullRows.length)
                                return res.status(404).json({ success: false, message: "No full_stage data found" });

                            const fullItems = fullRows
                                .filter(r => r.item_id)
                                .map(r => ({
                                    stage: "full_stage",
                                    id: r.item_id,
                                    key_achievements: r.key_achievements,
                                    development_areas: r.development_areas,
                                    employee_comments: r.employee_comments,
                                    manager_comments: r.manager_comments,
                                    strengths: r.strengths,
                                    training_needs: r.training_needs
                                }));

                            const allItems = [...startItems, ...midItems, ...fullItems];

                            const employeeInfo = {
                                id: fullRows[0].employee_id,
                                name: `${fullRows[0].first_name} ${fullRows[0].last_name}`
                            };

                            // ✅ NEW: Fetch Section 8 (stage_approvals)
                            const sqlStageApprovals = `
                            SELECT 
                            approver_type,
                            approver_name,
                            DATE_FORMAT(approval_date, '%Y-%m-%d') AS approval_date,
                            comments
                            FROM stage_approvals
                            WHERE appraisal_id = ?
                            ORDER BY id ASC
                            `;

                            db.query(sqlStageApprovals, [appraisalId], (errStageAppr, stageApprovalRows) => {
                                if (errStageAppr) {
                                    console.error("❌ DB error fetching stage_approvals:", errStageAppr);
                                    return res.status(500).json({ success: false, message: "DB error stage_approvals" });
                                }


                                // ✅ Send final combined full-stage response
                                return res.json({
                                    success: true,
                                    stage: "full_stage",
                                    employee: employeeInfo,
                                    stageData: {
                                        ...fullRows[0],
                                        mid_professional_total: midTotals.professional_total,
                                        mid_behavioral_total: midTotals.behavioral_total,
                                    },
                                    approvals: approvalRows,              // from performance_approvals
                                    section8Approvals: stageApprovalRows, // 🔹 from stage_approvals table (Section 8)
                                    startComments: startComments,
                                    midComments: midComments,
                                    targets: allItems
                                });
                            });
                        });
                    });
                });
            });
        }

    },



    // fetch data for update then approve 
    updateStartStageFields: (req, res) => {
        const { appraisalId, stageUpdates, itemUpdates } = req.body;

        if (!appraisalId) {
            return res.status(400).json({ success: false, message: "Appraisal ID is required" });
        }

        const runQuery = (sql, params) => {
            return new Promise((resolve, reject) => {
                db.query(sql, params, (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            });
        };

        (async () => {
            try {
                // 1️⃣ Update start_stage table
                if (stageUpdates && stageUpdates.length) {
                    const stageSql = `
                    UPDATE start_stage
                    SET comments=?, total_weight=?, total_score=?, updated_at=NOW()
                    WHERE appraisal_id=?`;

                    for (const u of stageUpdates) {
                        await runQuery(stageSql, [u.comments, u.total_weight, u.total_score, appraisalId]);
                    }
                }

                // 2️⃣ Update existing items & insert new items
                if (itemUpdates && itemUpdates.length) {
                    for (const u of itemUpdates) {
                        if (u.itemId.startsWith("new-")) {
                            // 🔹 New row → INSERT
                            const insertSql = `
                            INSERT INTO start_items 
                            (appraisal_id, target_text, weightage, accomplishments, manager_comments, rating, score, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
                            await runQuery(insertSql, [
                                appraisalId,
                                u.target_text,        // Business Targets
                                u.weightage,          // Weight %
                                u.accomplishments,    // Accomplishments
                                u.manager_comments,   // Line Manager Comments
                                u.rating,             // Rating
                                u.score
                            ]);
                        } else {
                            // 🔹 Existing row → UPDATE
                            const updateSql = `
                           UPDATE start_items
                           SET target_text=?, weightage=?, accomplishments=?, manager_comments=?, rating=?, score=?, updated_at=NOW()
                           WHERE id=?`;
                            await runQuery(updateSql, [
                                u.target_text,        // Business Targets
                                u.weightage,          // Weight %
                                u.accomplishments,    // Accomplishments
                                u.manager_comments,   // Line Manager Comments
                                u.rating,             // Rating
                                u.score,              // Score
                                u.itemId
                            ]);
                        }
                    }
                }

                res.json({ success: true, message: "All updates saved successfully" });
            } catch (err) {
                console.error("❌ Error in updateStartStageFields:", err);
                res.status(500).json({ success: false, message: "Database error while updating" });
            }
        })();
    },




    // Updating mid_stage (status/comments) + mid_items (competency scores)
    updateMidStageFields: (req, res) => {
        const { appraisalId, stageUpdates, comments, status, professional_total, behavioral_total } = req.body;


        if (!appraisalId || !stageUpdates) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        const {
            communication,
            decision_making,
            quality_orientation,
            initiative,
            technical_skills,
            team_work,
            planning_organizing,
            adaptability,
            self_confidence,
            creativity_innovation,
            strengths,
            training_needs,
            manager_comments,
            employee_comments
        } = stageUpdates;

        db.getConnection((err, connection) => {
            if (err) return res.status(500).json({ success: false, message: "DB connection error" });

            connection.beginTransaction(txErr => {
                if (txErr) {
                    connection.release();
                    return res.status(500).json({ success: false, message: "Transaction error" });
                }

                // 1️⃣ Update mid_stage
                const stageSql = `
                UPDATE mid_stage
                SET comments=?, status=?, professional_total=?, behavioral_total=?, updated_at=NOW()
                WHERE appraisal_id=?
                `;
                connection.query(stageSql, [comments || "", status || "pending", professional_total || 0, behavioral_total || 0, appraisalId], (err1) => {
                    if (err1) {
                        return connection.rollback(() => {
                            connection.release();
                            console.error("❌ mid_stage update error:", err1);
                            return res.status(500).json({ success: false, message: "Error updating mid_stage" });
                        });
                    }

                    // 2️⃣ Update mid_items
                    const itemsSql = `
                    UPDATE mid_items
                    SET communication=?, decision_making=?, quality_orientation=?, initiative=?, technical_skills=?,
                        team_work=?, planning_organizing=?, adaptability=?, self_confidence=?, creativity_innovation=?,
                        strengths=?, training_needs=?, manager_comments=?, employee_comments=?, updated_at=NOW()
                    WHERE appraisal_id=?
                `;

                    const vals = [
                        communication, decision_making, quality_orientation, initiative,
                        technical_skills, team_work, planning_organizing, adaptability, self_confidence,
                        creativity_innovation, strengths, training_needs, manager_comments, employee_comments, appraisalId
                    ];

                    connection.query(itemsSql, vals, (err2) => {
                        if (err2) {
                            return connection.rollback(() => {
                                connection.release();
                                console.error("❌ mid_items update error:", err2);
                                return res.status(500).json({ success: false, message: "Error updating mid_items" });
                            });
                        }

                        connection.commit(commitErr => {
                            connection.release();
                            if (commitErr) {
                                console.error("❌ Commit failed:", commitErr);
                                return res.status(500).json({ success: false, message: "Transaction commit error" });
                            }
                            return res.json({ success: true, message: "Mid stage updated successfully" });
                        });
                    });
                });
            });
        });
    },




    // =============================
    // updateMidStageStatus
    // =============================
    updateMidStageStatus: (req, res) => {
        const { appraisalId, stageUpdates, comments, status, reason, professional_total, behavioral_total } = req.body;
        const approverUserId = req.session.user?.user_id;

        if (!approverUserId) {
            return res.status(401).json({ success: false, message: "Not logged in" });
        }

        // 🔒 Step 1: Prevent double approval/reject
        const checkSql = `
        SELECT status 
        FROM performance_approvals
        WHERE performance_request_id = ? 
          AND approver_user_id = ? 
          AND stage = 'mid_stage'
        LIMIT 1
        `;

        db.query(checkSql, [appraisalId, approverUserId], (err, rows) => {
            if (err) {
                console.error("DB error checking existing approval:", err);
                return res.status(500).json({ success: false, message: "DB error checking approval" });
            }

            if (rows.length && rows[0].status !== 'pending') {
                return res.status(400).json({ success: false, message: "You have already approved or rejected this request." });
            }

            // ✅ Proceed only if still pending
            continueMidStageUpdate();
        });


        function continueMidStageUpdate() {
            // Step 1: Update mid_stage and mid_items if approver made edits
            if (stageUpdates || comments) {
                const {
                    communication, decision_making, quality_orientation, initiative,
                    technical_skills, team_work, planning_organizing, adaptability,
                    self_confidence, creativity_innovation, strengths, training_needs,
                    manager_comments, employee_comments
                } = stageUpdates || {};

                const updateStageSql = `
            UPDATE mid_stage
            SET comments = ?, professional_total = ?, behavioral_total = ?, updated_at = NOW()
            WHERE appraisal_id = ?
            `;

                const updateItemsSql = `
            UPDATE mid_items
            SET communication=?, decision_making=?, quality_orientation=?, initiative=?,
                technical_skills=?, team_work=?, planning_organizing=?, adaptability=?,
                self_confidence=?, creativity_innovation=?, strengths=?, training_needs=?,
                manager_comments=?, employee_comments=?, updated_at=NOW()
            WHERE appraisal_id=?
            `;

                db.getConnection((err, connection) => {
                    if (err) return res.status(500).json({ success: false, message: "DB connection error" });

                    connection.beginTransaction(txErr => {
                        if (txErr) {
                            connection.release();
                            return res.status(500).json({ success: false, message: "Transaction error" });
                        }

                        connection.query(updateStageSql, [comments || "", professional_total || 0, behavioral_total || 0, appraisalId], (errStage) => {
                            if (errStage) {
                                return connection.rollback(() => {
                                    connection.release();
                                    return res.status(500).json({ success: false, message: "Error updating mid_stage" });
                                });
                            }

                            if (stageUpdates) {
                                const vals = [
                                    communication, decision_making, quality_orientation, initiative,
                                    technical_skills, team_work, planning_organizing, adaptability,
                                    self_confidence, creativity_innovation, strengths, training_needs,
                                    manager_comments, employee_comments, appraisalId
                                ];
                                connection.query(updateItemsSql, vals, (errItems) => {
                                    if (errItems) {
                                        return connection.rollback(() => {
                                            connection.release();
                                            return res.status(500).json({ success: false, message: "Error updating mid_items" });
                                        });
                                    }

                                    connection.commit(commitErr => {
                                        connection.release();
                                        if (commitErr) return res.status(500).json({ success: false, message: "Commit failed" });
                                        proceedApproval();
                                    });
                                });
                            } else {
                                connection.commit(commitErr => {
                                    connection.release();
                                    if (commitErr) return res.status(500).json({ success: false, message: "Commit failed" });
                                    proceedApproval();
                                });
                            }
                        });
                    });
                });

            } else {
                proceedApproval();
            }

            // Step 2: Approve/Reject logic
            function proceedApproval() {
                // Update current approver decision
                const updateSql = `
            UPDATE performance_approvals
            SET status = ?, updated_at = NOW()
            WHERE performance_request_id = ? AND approver_user_id = ? AND stage='mid_stage'
            `;
                db.query(updateSql, [status, appraisalId, approverUserId], (err) => {
                    if (err) {
                        console.error("❌ DB error while updating mid-stage approval:", err);
                        return res.status(500).json({ success: false, message: "DB error while updating approval" });
                    }

                    // Handle rejection
                    if (status === "Rejected") {
                        const rejectSql = `
                    UPDATE mid_stage
                    SET status='Rejected', rejected_by=?, rejection_reason=?, updated_at=NOW()
                    WHERE appraisal_id=?
                    `;
                        db.query(rejectSql, [approverUserId, reason, appraisalId], (errReject) => {
                            if (errReject) return res.status(500).json({ success: false, message: "Failed to update mid_stage" });

                            // Notify employee and approver
                            notifyEmployee(`❌ Your performance mid-stage request has been rejected`, `my-performance.html?id=${appraisalId}&stage=mid_stage`);
                            notifyApprover(`❌ You have rejected this mid-stage performance request`, `performance-approval.html?id=${appraisalId}&stage=mid_stage`);
                            return res.json({ success: true, message: "Mid-stage request rejected & flow stopped" });
                        });
                        return;
                    }

                    // Handle approval → find next approver
                    db.query(
                        "SELECT level FROM performance_approvals WHERE performance_request_id=? AND approver_user_id=? AND stage='mid_stage' LIMIT 1",
                        [appraisalId, approverUserId],
                        (errLvl, lvlRows) => {
                            if (errLvl || !lvlRows.length) return res.json({ success: true, message: "Approved but level fetch failed" });
                            const nextLevel = lvlRows[0].level + 1;


                            // ✅ SELF-USER → send to forced next approver
                            if (approverUserId === 31 || approverUserId === 50) {

                                let forcedNext = null;
                                if (nextLevel === 2) forcedNext = 13;

                                if (forcedNext) {

                                    db.query(
                                        `INSERT INTO performance_approvals
                                        (performance_request_id, approver_user_id, level, status, stage, updated_at)
                                        VALUES (?, ?, ?, 'Pending', 'mid_stage', NOW())`,
                                        [appraisalId, forcedNext, nextLevel]
                                    );

                                    notifyNextApprover(forcedNext, appraisalId);

                                    notifyApprover(
                                        "✅ Mid-stage approved",
                                        `performance-approval.html?id=${appraisalId}&stage=mid_stage`
                                    );

                                    notifyEmployee(
                                        "⏳ Your mid-stage request is under review",
                                        `my-performance.html?id=${appraisalId}&stage=mid_stage`
                                    );

                                    return res.json({
                                        success: true,
                                        message: `Self override → moved to user_id ${forcedNext}`
                                    });
                                }
                            }





                            const nextApproverSql = `
                        SELECT specific_user_id FROM performance_approval_flows
                        WHERE department_id = (
                            SELECT department_id
                            FROM employees e
                            JOIN appraisals a ON a.employee_id = e.id
                            WHERE a.id = ?
                        )
                        AND level = ?
                        LIMIT 1
                        `;
                            db.query(nextApproverSql, [appraisalId, nextLevel], (errNext, nextRows) => {
                                if (errNext) return res.status(500).json({ success: false, message: "DB error finding next approver" });

                                if (!nextRows.length) {
                                    // Fully approved
                                    db.query(
                                        "UPDATE mid_stage SET status='Approved', updated_at=NOW() WHERE appraisal_id=?",
                                        [appraisalId],
                                        (errUpd) => {
                                            if (errUpd) {
                                                console.error("Error updating mid_stage final approval:", errUpd);
                                                return res.status(500).json({ success: false, message: "Failed to finalize mid-stage status" });
                                            }

                                            notifyEmployee("✅ Your performance mid-stage request has been fully approved", `my-performance.html?id=${appraisalId}&stage=mid_stage`);
                                            notifyApprover("✅ You have approved this mid-stage request", `performance-approval.html?id=${appraisalId}&stage=mid_stage`);

                                            return res.json({ success: true, message: "Mid-stage fully approved" });
                                        }
                                    );
                                    return;
                                }

                                const nextApproverUserId = nextRows[0].specific_user_id;
                                db.query(
                                    "INSERT INTO performance_approvals (performance_request_id, approver_user_id, level, status, stage, updated_at) VALUES (?, ?, ?, 'Pending', 'mid_stage', NOW())",
                                    [appraisalId, nextApproverUserId, nextLevel],
                                    (errInsert) => {
                                        if (errInsert) console.error("Error inserting next approver:", errInsert);
                                        notifyEmployee("⏳ Your performance mid-stage request is under process", `my-performance.html?id=${appraisalId}&stage=mid_stage`);
                                        notifyApprover("✅ You have approved this mid-stage request", `performance-approval.html?id=${appraisalId}&stage=mid_stage`);
                                        notifyNextApprover(nextApproverUserId, appraisalId);
                                        return res.json({ success: true, message: `Moved to approver level ${nextLevel}` });
                                    }
                                );
                            });
                        }
                    );
                });
            }

            // Helper functions
            function notifyEmployee(msg, link) {
                db.query(`
            UPDATE notifications n
            JOIN employees e ON e.email = n.email
            JOIN appraisals a ON e.id = a.employee_id
            SET n.message=?, n.status='unread', n.updated_at=NOW()
            WHERE a.id=? AND n.link=?`,
                    [msg, appraisalId, link]
                );
            }

            function notifyApprover(msg, link) {
                db.query(`
            UPDATE notifications n
            JOIN users u ON u.email = n.email
            SET n.message=?, n.status='unread', n.updated_at=NOW()
            WHERE u.id=? AND n.link=?`,
                    [msg, approverUserId, link]
                );
            }

            function notifyNextApprover(userId, appraisalId) {
                db.query("SELECT email FROM users WHERE id=? LIMIT 1", [userId], (err, rows) => {
                    const email = rows[0]?.email;
                    if (!email) return;
                    db.query("INSERT INTO notifications (email, message, link, status, created_at, updated_at) VALUES (?, ?, ?, 'unread', NOW(), NOW())",
                        [email, "📩 New performance mid-stage request pending your approval", `performance-approval.html?id=${appraisalId}&stage=mid_stage`]
                    );
                });
            }
        }
    },



    // update changes in full stage after approver decision
    updateFullStageFields: (req, res) => {
        const { appraisalId, startStage, startItems, midStage, midItems, fullStage, fullItems, section8Approvals } = req.body;

        if (!appraisalId) return res.status(400).json({ success: false, message: "Appraisal ID is required" });

        db.getConnection((err, connection) => {
            if (err) {
                console.error("❌ DB Connection Error:", err);
                return res.status(500).json({ success: false, message: "Database connection error" });
            }

            connection.beginTransaction(txErr => {
                if (txErr) {
                    connection.release();
                    console.error("❌ Transaction begin error:", txErr);
                    return res.status(500).json({ success: false, message: "Transaction start failed" });
                }

                // =============== 1️⃣ Update start_stage ===============
                const updateStartStage = () => {
                    if (!startStage) return updateStartItems();

                    const params = [
                        startStage.comments || "",
                        startStage.total_weight || 0,
                        startStage.total_score || 0,
                        appraisalId
                    ];

                    const sql = `
                    UPDATE start_stage
                    SET comments=?, total_weight=?, total_score=?, updated_at=NOW()
                    WHERE appraisal_id=?`;

                    connection.query(sql, params, (err, result) => {
                        if (err) return rollback(err, "start_stage update error");
                        updateStartItems();
                    });
                };

                // =============== 1.1️⃣ Update start_items ===============
                const updateStartItems = (i = 0) => {
                    if (!startItems || i >= startItems.length) return updateMidStage();

                    const u = startItems[i];

                    const isNew = !u.itemId || u.itemId.toString().startsWith("new-");
                    const fields = [
                        u.target_text || "",
                        u.weightage || 0,
                        u.accomplishments || "",
                        u.manager_comments || "",
                        u.rating || 0,
                        u.score || 0
                    ];


                    if (isNew) {
                        const sql = `
                        INSERT INTO start_items
                        (appraisal_id, target_text, weightage, accomplishments, manager_comments, rating, score, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
                        connection.query(sql, [appraisalId, ...fields], (err, result) => {
                            if (err) return rollback(err, "start_items insert error");
                            updateStartItems(i + 1);
                        });
                    } else {
                        const sql = `
                        UPDATE start_items
                        SET target_text=?, weightage=?, accomplishments=?, manager_comments=?, rating=?, score=?, updated_at=NOW()
                        WHERE id=?`;
                        connection.query(sql, [...fields, u.itemId], (err, result) => {
                            if (err) return rollback(err, "start_items update error");
                            updateStartItems(i + 1);
                        });
                    }
                };

                // =============== 2️⃣ Update mid_stage ===============
                const updateMidStage = () => {
                    if (!midStage) return updateMidItems();

                    const params = [
                        midStage.comments || "",
                        midStage.professional_total || 0,
                        midStage.behavioral_total || 0,
                        midStage.status || "pending",
                        appraisalId
                    ];

                    const sql = `
                    UPDATE mid_stage
                    SET comments=?, professional_total=?, behavioral_total=?, status=?, updated_at=NOW()
                    WHERE appraisal_id=?`;
                    connection.query(sql, params, (err, result) => {
                        if (err) return rollback(err, "mid_stage update error");
                        updateMidItems();
                    });
                };

                // =============== 2.1️⃣ Update mid_items ===============
                const updateMidItems = (i = 0) => {
                    if (!midItems || i >= midItems.length) return updateFullStage();

                    const u = midItems[i];

                    const isNew = !u.itemId || u.itemId.toString().startsWith("new-");
                    const fields = [
                        u.communication || 0,
                        u.decision_making || 0,
                        u.quality_orientation || 0,
                        u.initiative || 0,
                        u.technical_skills || 0,
                        u.team_work || 0,
                        u.planning_organizing || 0,
                        u.adaptability || 0,
                        u.self_confidence || 0,
                        u.creativity_innovation || 0,
                        u.strengths || "",
                        u.training_needs || "",
                        u.manager_comments || "",
                        u.employee_comments || ""
                    ];

                    if (isNew) {
                        const sql = `
                        INSERT INTO mid_items
                        (appraisal_id, communication, decision_making, quality_orientation, initiative,
                         technical_skills, team_work, planning_organizing, adaptability, self_confidence,
                         creativity_innovation, strengths, training_needs, manager_comments, employee_comments,
                         created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
                        connection.query(sql, [appraisalId, ...fields], (err, result) => {
                            if (err) return rollback(err, "mid_items insert error");
                            updateMidItems(i + 1);
                        });
                    } else {
                        const sql = `
                        UPDATE mid_items
                        SET communication=?, decision_making=?, quality_orientation=?, initiative=?,
                            technical_skills=?, team_work=?, planning_organizing=?, adaptability=?,
                            self_confidence=?, creativity_innovation=?, strengths=?, training_needs=?,
                            manager_comments=?, employee_comments=?, updated_at=NOW()
                        WHERE id=?`;
                        connection.query(sql, [...fields, u.itemId], (err, result) => {
                            if (err) return rollback(err, "mid_items update error");
                            updateMidItems(i + 1);
                        });
                    }
                };

                // =============== 3️⃣ Update full_stage ===============
                const updateFullStage = () => {
                    if (!fullStage) return updateFullItems();

                    const params = [
                        fullStage.business_targets_score || 0,
                        fullStage.professional || 0,
                        fullStage.behavioral || 0,
                        fullStage.overall_score || 0,
                        fullStage.status || "pending",
                        appraisalId
                    ];


                    const sql = `
                    UPDATE full_stage
                    SET business_targets_score=?, professional=?, behavioral=?, overall_score=?, status=?, updated_at=NOW()
                    WHERE appraisal_id=?
                    `;
                    connection.query(sql, params, (err, result) => {
                        if (err) return rollback(err, "full_stage update error");
                        updateFullItems();
                    });
                };

                // =============== 3.1️⃣ Update full_items ===============
                const updateFullItems = (i = 0) => {
                    if (!fullItems || i >= fullItems.length) return updateSection8Approvals();

                    const u = fullItems[i];

                    const isNew = !u.itemId || u.itemId.toString().startsWith("new-");
                    const fields = [
                        u.key_achievements || "",
                        u.development_areas || "",
                        u.employee_comments || "",
                        u.manager_comments || "",
                        u.strengths || "",
                        u.training_needs || ""
                    ];

                    if (isNew) {
                        const sql = `
                        INSERT INTO full_items
                        (appraisal_id, key_achievements, development_areas, employee_comments,
                         manager_comments, strengths, training_needs, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
                        connection.query(sql, [appraisalId, ...fields], (err, result) => {
                            if (err) return rollback(err, "full_items insert error");
                            updateFullItems(i + 1);
                        });
                    } else {
                        const sql = `
                        UPDATE full_items
                        SET key_achievements=?, development_areas=?, employee_comments=?, manager_comments=?,
                            strengths=?, training_needs=?, updated_at=NOW()
                        WHERE id=?`;
                        connection.query(sql, [...fields, u.itemId], (err, result) => {
                            if (err) return rollback(err, "full_items update error");
                            updateFullItems(i + 1);
                        });
                    }
                };

                // =============== 3.2️⃣ Update Section 8: stage_approvals =============== 
                const updateSection8Approvals = (j = 0) => {
                    const approvals = section8Approvals || fullStage?.section8Approvals || [];

                    if (!approvals.length || j >= approvals.length) {
                        return commitTransaction();
                    }

                    const app = approvals[j];
                    // Format date safely using dayjs
                    // Parse user date input in multiple formats
                    let formattedDate = null;

                    if (app.approval_date && app.approval_date.trim() !== "") {
                        const d = dayjs(app.approval_date, [
                            "DD/MM/YYYY",
                            "D/M/YYYY",
                            "MM/DD/YYYY",
                            "M/D/YYYY",
                            "YYYY-MM-DD",
                            "YYYY/MM/DD"
                        ]);

                        formattedDate = d.isValid() ? d.format("YYYY-MM-DD HH:mm:ss") : null;
                    }
                    const params = [
                        app.approver_type,
                        appraisalId
                    ];

                    // First check if record exists for this appraisal and approver type
                    const checkSql = `
                    SELECT id FROM stage_approvals
                    WHERE approver_type=? AND appraisal_id=?`;

                    connection.query(checkSql, params, (err, rows) => {
                        if (err) return rollback(err, "stage_approvals select error");

                        if (rows.length > 0) {
                            // ✅ Update existing approval
                            const updateSql = `
                            UPDATE stage_approvals
                            SET approver_name=?, approval_date=?, comments=?, updated_at=NOW()
                            WHERE appraisal_id=? AND approver_type=?`;

                            connection.query(updateSql, [
                                app.approver_name || "",
                                formattedDate,
                                app.comments || "",
                                appraisalId,
                                app.approver_type
                            ], (err) => {
                                if (err) return rollback(err, "stage_approvals update error");
                                updateSection8Approvals(j + 1);
                            });

                        } else {
                            // ✅ Insert if missing
                            const insertSql = `
                            INSERT INTO stage_approvals
                            (appraisal_id, approver_type, approver_name, approval_date, comments, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, NOW(), NOW())`;

                            connection.query(insertSql, [
                                appraisalId,
                                app.approver_type,
                                app.approver_name || "",
                                formattedDate,
                                app.comments || ""
                            ], (err) => {
                                if (err) return rollback(err, "stage_approvals insert error");
                                updateSection8Approvals(j + 1);
                            });
                        }
                    });
                };


                // ✅ Commit or Rollback
                const commitTransaction = () => {
                    connection.commit(err => {
                        connection.release();
                        if (err) return res.status(500).json({ success: false, message: "Commit failed" });
                        console.log("🎉 All updates completed successfully for appraisalId:", appraisalId);
                        return res.json({ success: true, message: "All stages & items updated successfully" });
                    });
                };

                const rollback = (err, msg) => {
                    console.error(`❌ ${msg}:`, err);
                    connection.rollback(() => connection.release());
                    return res.status(500).json({ success: false, message: `Database error: ${msg}` });
                };

                updateStartStage(); // begin chain
            });
        });
    },




    // update full stage 
    updateFullStageStatus: (req, res) => {
        const {
            appraisalId,
            startStage,
            midStage,
            fullStage,
            status,
            reason
        } = req.body;

        const approverUserId = req.session.user?.user_id;
        if (!approverUserId) {
            return res.status(401).json({ success: false, message: "Not logged in" });
        }

        db.getConnection((err, connection) => {
            if (err) return res.status(500).json({ success: false, message: "DB connection error" });

            connection.beginTransaction(txErr => {
                if (txErr) {
                    connection.release();
                    return res.status(500).json({ success: false, message: "Transaction error" });
                }

                // --------------------------
                // 1️⃣ Update Start Stage
                // --------------------------
                if (startStage) {
                    connection.query(
                        `UPDATE start_stage
                     SET comments=?, updated_at=NOW()
                     WHERE appraisal_id=?`,
                        [startStage.comments || "", appraisalId]
                    );

                    if (Array.isArray(startStage.items)) {
                        startStage.items.forEach(item => {
                            connection.query(
                                `UPDATE start_items
                             SET target_text=?, manager_comments=?, accomplishments=?, weightage=?, rating=?, score=?, updated_at=NOW()
                             WHERE id=?`,
                                [
                                    item.target_text || "",
                                    item.manager_comments || "",
                                    item.accomplishments || "",
                                    item.weightage || 0,
                                    item.rating || 0,
                                    item.score || 0,
                                    item.id
                                ]
                            );
                        });
                    }
                }

                // --------------------------
                // 2️⃣ Update Mid Stage
                // --------------------------
                if (midStage) {
                    connection.query(
                        `UPDATE mid_stage
                     SET comments=?, professional_total=?, behavioral_total=?, updated_at=NOW()
                     WHERE appraisal_id=?`,
                        [
                            midStage.comments || "",
                            midStage.professional_total || 0,
                            midStage.behavioral_total || 0,
                            appraisalId
                        ]
                    );

                    if (Array.isArray(midStage.items)) {
                        midStage.items.forEach(item => {
                            connection.query(
                                `UPDATE mid_items
                             SET communication=?, decision_making=?, quality_orientation=?, initiative=?,
                                 technical_skills=?, team_work=?, planning_organizing=?, adaptability=?,
                                 self_confidence=?, creativity_innovation=?, strengths=?, training_needs=?,
                                 manager_comments=?, employee_comments=?, updated_at=NOW()
                                 WHERE id=?`,
                                [
                                    item.communication || 0,
                                    item.decision_making || 0,
                                    item.quality_orientation || 0,
                                    item.initiative || 0,
                                    item.technical_skills || 0,
                                    item.team_work || 0,
                                    item.planning_organizing || 0,
                                    item.adaptability || 0,
                                    item.self_confidence || 0,
                                    item.creativity_innovation || 0,
                                    item.strengths || "",
                                    item.training_needs || "",
                                    item.manager_comments || "",
                                    item.employee_comments || "",
                                    item.id
                                ]
                            );
                        });
                    }
                }

                // --------------------------
                // 3️⃣ Update Full Stage
                // --------------------------
                const fs = fullStage || {};

                // ✅ FIX APPLIED: removed the score update here completely
                // ✅ We DO NOT update business_targets_score/professional/behavioral/overall_score here.

                if (Array.isArray(fs.items)) {
                    fs.items.forEach(item => {
                        connection.query(
                            `UPDATE full_items
                         SET key_achievements=?, development_areas=?, employee_comments=?, manager_comments=?,
                             strengths=?, training_needs=?, updated_at=NOW()
                         WHERE id=?`,
                            [
                                item.key_achievements || "",
                                item.development_areas || "",
                                item.employee_comments || "",
                                item.manager_comments || "",
                                item.strengths || "",
                                item.training_needs || "",
                                item.id
                            ]
                        );
                    });
                }

                // ----- Section 8: Approval History -----
                if (Array.isArray(fs.section8Approvals)) {
                    fs.section8Approvals.forEach(app => {
                        const approvalDate = app.approval_date ? new Date(app.approval_date) : null;

                        if (app.id) {
                            const sql = `
                            UPDATE stage_approvals
                            SET approver_name = ?, approval_date = ?, comments = ?, updated_at = NOW()
                            WHERE id = ?`;
                            const params = [
                                app.approver_name || "",
                                approvalDate,
                                app.comments || "",
                                app.id
                            ];
                            connection.query(sql, params);
                        } else {
                            const sql = `
                            INSERT INTO stage_approvals
                            (appraisal_id, approver_type, approver_name, approval_date, comments, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, NOW(), NOW())`;
                            const params = [
                                appraisalId,
                                app.approver_type || "",
                                app.approver_name || "",
                                approvalDate,
                                app.comments || ""
                            ];
                            connection.query(sql, params);
                        }
                    });
                }

                // --------------------------
                // 4️⃣ Approval / Rejection Logic
                // --------------------------
                function proceedApproval() {
                    const updateSql = `
                    UPDATE performance_approvals
                    SET status=?, updated_at=NOW()
                    WHERE performance_request_id=? AND approver_user_id=? AND stage='full_stage'`;

                    connection.query(updateSql, [status, appraisalId, approverUserId], (err) => {
                        if (err) return connection.rollback(() => { connection.release(); res.status(500).json({ success: false, message: "Error updating approval" }); });

                        if (status === "Rejected") {
                            connection.query(
                                `UPDATE full_stage
                             SET status='Rejected', rejected_by=?, rejection_reason=?, updated_at=NOW()
                             WHERE appraisal_id=?`,
                                [approverUserId, reason || "", appraisalId]
                            );

                            notifyEmployee("❌ Your performance full-stage request has been rejected", `my-performance.html?id=${appraisalId}&stage=full_stage`);
                            notifyApprover("❌ You have rejected this full-stage request", `performance-approval.html?id=${appraisalId}&stage=full_stage`);

                            return connection.commit(commitErr => {
                                connection.release();
                                if (commitErr) return res.status(500).json({ success: false, message: "Commit failed" });
                                return res.json({ success: true, message: "Full-stage request rejected & flow stopped" });
                            });
                        }


                        // Continue approval workflow
                        connection.query(
                            `SELECT level FROM performance_approvals WHERE performance_request_id=? AND approver_user_id=? AND stage='full_stage' LIMIT 1`,
                            [appraisalId, approverUserId],
                            (errLvl, lvlRows) => {
                                if (errLvl || !lvlRows.length) return res.json({ success: true, message: "Approved but level fetch failed" });

                                const nextLevel = lvlRows[0].level + 1;



                                // ✅ SELF USER override — forward to forced next approver
                                if (approverUserId === 31 || approverUserId === 50) {

                                    let forcedNext = null;
                                    if (nextLevel === 2) forcedNext = 13;  // same behavior as mid-stage

                                    if (forcedNext) {

                                        connection.query(
                                            `INSERT INTO performance_approvals
            (performance_request_id, approver_user_id, level, status, stage, updated_at)
            SELECT ?, ?, ?, 'Pending', 'full_stage', NOW()
            WHERE NOT EXISTS (
                SELECT 1 FROM performance_approvals
                WHERE performance_request_id=? AND approver_user_id=? AND stage='full_stage'
            )`,
                                            [appraisalId, forcedNext, nextLevel, appraisalId, forcedNext]
                                        );

                                        notifyNextApprover(forcedNext, appraisalId);

                                        notifyApprover(
                                            "✅ Full-stage approved",
                                            `performance-approval.html?id=${appraisalId}&stage=full_stage`
                                        );

                                        notifyEmployee(
                                            "⏳ Your full-stage request is under review",
                                            `my-performance.html?id=${appraisalId}&stage=full_stage`
                                        );

                                        return connection.commit(commitErr => {
                                            connection.release();
                                            if (commitErr) return res.status(500).json({ success: false, message: "Commit failed" });

                                            return res.json({
                                                success: true,
                                                message: `Self override → moved to user_id ${forcedNext}`
                                            });
                                        });
                                    }
                                }



                                connection.query(
                                    `SELECT specific_user_id FROM performance_approval_flows
                                    WHERE department_id = (
                                    SELECT department_id
                                    FROM employees e
                                    JOIN appraisals a ON a.employee_id = e.id
                                    WHERE a.id = ?
                                 )
                                 AND level = ? LIMIT 1`,
                                    [appraisalId, nextLevel],
                                    (errNext, nextRows) => {
                                        if (errNext) return connection.rollback(() => connection.release());

                                        if (!nextRows.length) {
                                            // ✅ FIX APPLIED
                                            // REMOVE score update here
                                            connection.query(
                                                `UPDATE full_stage 
                                             SET status='Approved', updated_at=NOW() 
                                             WHERE appraisal_id=?`,
                                                [appraisalId]
                                            );

                                            notifyEmployee("✅ Your performance full-stage request has been fully approved", `my-performance.html?id=${appraisalId}&stage=full_stage`);
                                            notifyApprover("✅ You have approved this full-stage request", `performance-approval.html?id=${appraisalId}&stage=full_stage`);

                                            return connection.commit(commitErr => {
                                                connection.release();
                                                if (commitErr) return res.status(500).json({ success: false, message: "Commit failed" });
                                                res.json({ success: true, message: "Full-stage fully approved" });
                                            });
                                        }

                                        const nextApproverUserId = nextRows[0].specific_user_id;
                                        connection.query(
                                            "INSERT INTO performance_approvals (performance_request_id, approver_user_id, level, status, stage, updated_at) VALUES (?, ?, ?, 'Pending', 'full_stage', NOW())",
                                            [appraisalId, nextApproverUserId, nextLevel]
                                        );

                                        notifyEmployee("⏳ Your performance full-stage request is under process", `my-performance.html?id=${appraisalId}&stage=full_stage`);
                                        notifyApprover("✅ You have approved this full-stage request", `performance-approval.html?id=${appraisalId}&stage=full_stage`);
                                        notifyNextApprover(nextApproverUserId, appraisalId);

                                        connection.commit(commitErr => {
                                            connection.release();
                                            if (commitErr) return res.status(500).json({ success: false, message: "Commit failed" });
                                            res.json({ success: true, message: `Moved to approver level ${nextLevel}` });
                                        });
                                    }
                                );
                            }
                        );
                    });
                }

                function notifyEmployee(msg, link) {
                    connection.query(`
                    UPDATE notifications n
                    JOIN employees e ON e.email = n.email
                    JOIN appraisals a ON e.id = a.employee_id
                    SET n.message=?, n.status='unread', n.updated_at=NOW()
                    WHERE a.id=? AND n.link=?`, [msg, appraisalId, link]);
                }

                function notifyApprover(msg, link) {
                    connection.query(`
                    UPDATE notifications n
                    JOIN users u ON u.email = n.email
                    SET n.message=?, n.status='unread', n.updated_at=NOW()
                    WHERE u.id=? AND n.link=?`, [msg, approverUserId, link]);
                }

                function notifyNextApprover(userId, appraisalId) {
                    connection.query("SELECT email FROM users WHERE id=? LIMIT 1", [userId], (err, rows) => {
                        const email = rows[0]?.email;
                        if (!email) return;
                        connection.query(`
                        INSERT INTO notifications (email, message, link, status, created_at, updated_at)
                        VALUES (?, ?, ?, 'unread', NOW(), NOW())`,
                            [email, "📩 New performance full-stage request pending your approval", `performance-approval.html?id=${appraisalId}&stage=full_stage`]
                        );
                    });
                }

                const checkSql = `
                SELECT status 
                FROM performance_approvals
                WHERE performance_request_id=? 
                AND approver_user_id=? 
                AND stage='full_stage'
                AND status IN ('Approved', 'Rejected')
                LIMIT 1`;

                connection.query(checkSql, [appraisalId, approverUserId], (errCheck, rows) => {
                    if (errCheck) {
                        connection.release();
                        return res.status(500).json({ success: false, message: "Error checking approval status" });
                    }

                    if (rows.length > 0) {
                        return res.status(400).json({
                            success: false,
                            message: `You already ${rows[0].status.toLowerCase()} this full-stage request`
                        });
                    }

                    proceedApproval();
                });
            });

        });
    },


    // approver own table 
    getPerformanceApprovalsList: (req, res) => {

        const approverUserId = req.session.user?.user_id;
        if (!approverUserId) {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        // Filters
        const stage = req.query.stage || "all";
        const status = req.query.status || "all";
        const name = req.query.name || "";
        const fromDate = req.query.fromDate || null;
        const toDate = req.query.toDate || null;
        const isCSV = req.query.csv === "1"; // <-- CSV Export

        let conditions = [`pa.approver_user_id = ?`];
        let values = [approverUserId];

        // Stage
        if (stage !== "all") {
            conditions.push(`pa.stage = ?`);
            values.push(stage);
        }

        // Status
        if (status !== "all") {
            conditions.push(`pa.status = ?`);
            values.push(status);
        }

        // Name search
        if (name.trim() !== "") {
            conditions.push(`CONCAT(e.first_name, ' ', e.last_name) LIKE ?`);
            values.push(`%${name}%`);
        }

        // Date filters
        let dateFilter = "";
        if (fromDate && toDate) {
            dateFilter = `AND DATE(created_at) BETWEEN '${fromDate}' AND '${toDate}'`;
        } else if (fromDate) {
            dateFilter = `AND DATE(created_at) >= '${fromDate}'`;
        } else if (toDate) {
            dateFilter = `AND DATE(created_at) <= '${toDate}'`;
        }

        const finalWhere = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const sql = `
        SELECT
            a.id AS ID,
            a.req_no AS ReqNo,
            CONCAT(e.first_name, ' ', e.last_name) AS Name,
            s.Stage AS Stage,
            pa.status AS MyStatus,
            s.Status AS OverallStatus,
            DATE(a.created_at) AS CreatedDate
        FROM appraisals a
        JOIN employees e ON a.employee_id = e.id
        JOIN (
            SELECT performance_request_id AS appraisal_id, stage, status, approver_user_id
            FROM performance_approvals
            WHERE stage IN ('start_stage', 'mid_stage', 'full_stage')
        ) AS pa ON pa.appraisal_id = a.id
JOIN (
   SELECT appraisal_id, stage, status, created_at
FROM (
    SELECT appraisal_id, 'start_stage' AS stage, status, created_at 
    FROM start_stage
    WHERE 1=1
    ${dateFilter}

    UNION ALL

    SELECT appraisal_id, 'mid_stage' AS stage, status, created_at
    FROM mid_stage
    WHERE 1=1
    ${dateFilter}

    UNION ALL

    SELECT appraisal_id, 'full_stage' AS stage, status, created_at
    FROM full_stage
    WHERE 1=1
    ${dateFilter}
) AS all_stages
) AS s 
ON s.appraisal_id = a.id AND s.stage = pa.stage
        ${finalWhere}
        ORDER BY a.id DESC, s.Stage ASC;
    `;

        db.query(sql, values, (err, results) => {
            if (err) {
                console.error("❌ Error fetching approver list:", err);
                return res.status(500).json({ success: false, message: "Database error" });
            }

            // 📌 CSV EXPORT LOGIC
            if (isCSV) {
                let csv = "ID,ReqNo,Name,Stage,MyStatus,OverallStatus,CreatedDate\n";

                results.forEach(r => {
                    csv += `${r.ID},${r.ReqNo},"${r.Name}",${r.Stage},${r.MyStatus},${r.OverallStatus},${r.CreatedDate}\n`;
                });

                res.setHeader("Content-Type", "text/csv");
                res.setHeader("Content-Disposition", "attachment; filename=performance_approvals.csv");
                return res.send(csv);
            }

            // normal JSON response
            res.json(results);
        });
    },



};
module.exports = sectionController;


