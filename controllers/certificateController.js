const db = require("../db");
const { sendNotificationToUser } = require("../services/pushService");

exports.getCertificatePersonalInfo = (req, res) => {
    const userEmail = req.session.user?.email;

    if (!userEmail) {
        return res.status(401).json({ error: "Not logged in" });
    }

    // 1️⃣ Fetch employee info
    const sql = `
    SELECT 
      e.id AS requester_id,
      CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
      e.employee_id,
      e.designation,
      e.doj AS joining_date,
      d.department_name,
      c.company_name,
      e.email,
     lm.name AS line_manager 
    FROM employees e
    JOIN department d ON e.department_id = d.id
    JOIN company_name c ON e.company_id = c.id
    LEFT JOIN line_managers lm ON e.line_manager_id = lm.id 
    WHERE e.email = ?
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

        // 2️⃣ Generate next CER req_no
        const nextSql = `
      SELECT MAX(CAST(SUBSTRING(req_no, 12) AS UNSIGNED)) AS max_no
      FROM certificate
      WHERE req_no LIKE ?
    `;

        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const prefix = `CER${today}%`;

        db.query(nextSql, [prefix], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: "Error generating req_no" });
            }

            const nextNumber = result[0].max_no ? result[0].max_no + 1 : 1;
            const reqNo = `CER${today}${String(nextNumber).padStart(4, '0')}`;

            // 3️⃣ Send response
            res.json({
                req_no: reqNo,
                request_date: new Date().toISOString().split("T")[0],
                employee_name: info.employee_name,
                employee_id: info.employee_id,
                requester_email: info.email,
                company: info.company_name,
                department: info.department_name,
                designation: info.designation,
                joining_date: info.joining_date,
                requester_id: info.requester_id,
                line_manager: info.line_manager
            });
        });
    });
};



// Name & Employee ID dropdown
exports.getEmployeeDropdown = (req, res) => {
    const sql = `
    SELECT 
      id,
      employee_id,
      doj,
      CONCAT(
        first_name,
        IF(middle_name IS NULL OR middle_name = '.', '', CONCAT(' ', middle_name)),
        ' ',
        last_name
      ) AS full_name
    FROM employees
    ORDER BY first_name
  `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Employee dropdown error:", err);
            return res.status(500).json([]); // ALWAYS return JSON
        }
        res.json(results);
    });
};



// certificate dropdown 
exports.getCertificateTypes = (req, res) => {
    const sql = `
    SELECT id, type 
    FROM certificate_types
    ORDER BY type
  `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Certificate type error:", err);
            return res.status(500).json({ message: "Failed to load certificate types" });
        }
        res.json(results);
    });
};



// submit controller 
exports.submitCertificateRequest = (req, res) => {
    const { req_no, certificate_type, joining_date, ending_date, remarks } = req.body;

    const empCode = req.session.user?.employee_id;

    if (!empCode || !req_no || !certificate_type) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    // 1️⃣ Convert employee_code → employee PK
    const empSql = `
        SELECT 
            e.id,
            CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
            e.email
        FROM employees e
        WHERE e.employee_id = ?
    `;

    db.query(empSql, [empCode], (err, empResult) => {
        if (err || empResult.length === 0) {
            console.error(err);
            return res.status(500).json({ error: "Invalid employee session" });
        }

        const emp = empResult[0];
        const employeeDbId = emp.id;

        // 2️⃣ Insert certificate (USE employeeDbId)
        const insertSql = `
            INSERT INTO certificate
            (req_no, requester_id, name, employee_id, certificate_type, joining_date, ending_date, remarks, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', NOW(), NOW())
        `;

        db.query(
            insertSql,
            [
                req_no,
                employeeDbId,        // requester_id
                emp.employee_name,
                employeeDbId,        // ✅ FK safe
                certificate_type,
                joining_date || null,
                ending_date || null,
                remarks || null
            ],
            (err2) => {
                if (err2) {
                    console.error("Insert Error:", err2.sqlMessage);
                    return res.status(500).json({ error: err2.sqlMessage });
                }

                // 3️⃣ Notify requester
                const requesterMessage = `Your certificate request ${req_no} is under process`;
                const requesterLink = `/my-certificates.html?reqNo=${req_no}`;

                db.query(
                    `
    INSERT INTO notifications
    (email, message, link, status, created_at, updated_at)
    VALUES (?, ?, ?, 'unread', NOW(), NOW())
    `,
                    [emp.email, requesterMessage, requesterLink],
                    async (errNotify) => {
                        if (!errNotify) {
                            // 🔔 SEND PUSH
                            sendNotificationToUser(emp.email, requesterMessage, requesterLink);
                        }
                    }
                );

                // 4️⃣ Notify HR
                const hrSql = `SELECT email FROM users WHERE role_id = 3 LIMIT 1`;

                db.query(hrSql, (err3, hrResult) => {
                    if (!err3 && hrResult.length > 0) {
                        const hrEmail = hrResult[0].email;
                        const hrMessage = `Certificate request ${req_no} requires your approval`;
                        const hrLink = `/certificate-approval.html?reqNo=${req_no}`;

                        db.query(
                            `
    INSERT INTO notifications
    (email, message, link, status, created_at, updated_at)
    VALUES (?, ?, ?, 'unread', NOW(), NOW())
    `,
                            [hrEmail, hrMessage, hrLink],
                            async (errNotify2) => {
                                if (!errNotify2) {
                                    // 🔔 SEND PUSH TO HR
                                    sendNotificationToUser(hrEmail, hrMessage, hrLink);
                                }
                            }
                        );
                    }

                    res.json({
                        success: true,
                        req_no,
                        message: "Certificate request submitted successfully"
                    });
                });
            }
        );
    });
};



// approve or reject
exports.updateCertificateStatus = (req, res) => {
    const { req_no, status, comments } = req.body;
    const hrUser = req.session.user;

    if (!req_no || !status) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    if (!["Approved", "Rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
    }

    if (hrUser.roleId !== 3) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    // 1️⃣ Get HR employee id
    const hrSql = `SELECT id FROM employees WHERE email = ?`;
    db.query(hrSql, [hrUser.email], (err, hrRes) => {
        if (err || hrRes.length === 0) {
            return res.status(500).json({ error: "HR employee not found" });
        }

        const hrEmployeeId = hrRes[0].id;

        // 2️⃣ Get requester info (NAME + EMAIL)
        const requesterSql = `
            SELECT 
                e.id,
                e.email,
                CONCAT(e.first_name, ' ', e.last_name) AS full_name
            FROM certificate c
            JOIN employees e ON c.requester_id = e.id
            WHERE c.req_no = ?
        `;

        db.query(requesterSql, [req_no], (err2, reqRes) => {
            if (err2 || reqRes.length === 0) {
                return res.status(404).json({ error: "Requester not found" });
            }

            const requester = reqRes[0];

            // 3️⃣ Update certificate table
            let updateSql, params;

            if (status === "Rejected") {
                updateSql = `
                    UPDATE certificate
                    SET status = 'Rejected',
                        rejection_reason = ?,
                        rejected_by = ?,
                        updated_at = NOW()
                    WHERE req_no = ?
                `;
                params = [comments, hrEmployeeId, req_no];
            } else {
                updateSql = `
                    UPDATE certificate
                    SET status = 'Approved',
                        updated_at = NOW()
                    WHERE req_no = ?
                `;
                params = [req_no];
            }

            db.query(updateSql, params, (err3) => {
                if (err3) {
                    console.error(err3);
                    return res.status(500).json({ error: "Update failed" });
                }

                /* ================= NOTIFICATIONS ================= */

                // 4️⃣ Employee notification (like expense)
                const employeeMsg =
                    status === "Approved"
                        ? `✅ Your certificate request for ${requester.full_name} has been approved.`
                        : `❌ Your certificate request for ${requester.full_name} has been rejected.`;

                db.query(
                    `
                    UPDATE notifications
                    SET message = ?, updated_at = NOW()
                    WHERE email = ? AND link = ?
                    `,
                    [
                        employeeMsg,
                        requester.email,
                        `/my-certificates.html?reqNo=${req_no}`
                    ],
                    (err) => {
                        if (!err) {
                            // 🔔 ADD THIS LINE
                            sendNotificationToUser(
                                requester.email,
                                employeeMsg,
                                `/my-certificates.html?reqNo=${req_no}`
                            );
                        }
                    }

                );

                // 5️⃣ HR (approver) notification
                const hrMsg =
                    status === "Approved"
                        ? `You approved ${requester.full_name}'s certificate request`
                        : `You rejected ${requester.full_name}'s certificate request`;

                db.query(
                    `
                    UPDATE notifications
                    SET message = ?, updated_at = NOW()
                    WHERE email = ? AND link = ?
                    `,
                    [
                        hrMsg,
                        hrUser.email,
                        `/certificate-approval.html?reqNo=${req_no}`
                    ],
                    (err) => {
                        if (!err) {
                            // 🔔 ADD THIS LINE
                            sendNotificationToUser(
                                hrUser.email,
                                hrMsg,
                                `/certificate-approval.html?reqNo=${req_no}`
                            );
                        }
                    }
                );

                res.json({
                    success: true,
                    message: `Certificate ${status.toLowerCase()} successfully`
                });
            });
        });
    });
};



// fetch the data to approver for taking action 
exports.getCertificateDetails = (req, res) => {
    const { reqNo } = req.params;

    const sql = `
        SELECT
            req_no,
            name,
            employee_id,
            certificate_type,
            joining_date,
            ending_date,
             remarks,
            status,
            rejection_reason
        FROM certificate
        WHERE req_no = ?
    `;

    db.query(sql, [reqNo], (err, result) => {
        if (err) {
            console.error("Fetch certificate error:", err);
            return res.status(500).json({ error: "Failed to fetch certificate details" });
        }

        if (result.length === 0) {
            return res.status(404).json({ error: "Certificate request not found" });
        }

        res.json(result[0]);
    });
};



// approver table 
exports.getCertificateList = (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ message: "Unauthorized" });
    }

    const roleId = req.session.user.roleId;

    // 🔒 HARD BLOCK — ONLY HR
    if (roleId !== 3) {
        return res.status(403).json({
            message: "Access denied. HR only."
        });
    }

    const status = req.query.status || "all";
    const search = req.query.search ? req.query.search.trim() : "";
    const startDate = req.query.start_date || "";
    const endDate = req.query.end_date || "";
    const isReport = req.query.report === "1";

    let sql = `
    SELECT
      c.id,
      c.req_no,
      c.name,
      c.certificate_type,
      c.joining_date,
      c.ending_date,
      c.status,
      c.created_at
    FROM certificate c
    JOIN employees e ON c.requester_id = e.id
    WHERE 1 = 1
  `;

    const params = [];

    if (status !== "all") {
        sql += " AND c.status = ? ";
        params.push(status);
    }

    if (search) {
        sql += " AND c.name LIKE ? ";
        params.push(`%${search}%`);
    }

    if (startDate && endDate) {
        sql += " AND DATE(c.created_at) BETWEEN ? AND ? ";
        params.push(startDate, endDate);
    } else if (startDate) {
        sql += " AND DATE(c.created_at) >= ? ";
        params.push(startDate);
    } else if (endDate) {
        sql += " AND DATE(c.created_at) <= ? ";
        params.push(endDate);
    }

    sql += " ORDER BY c.id DESC";

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error("Certificate list error:", err);
            return res.status(500).json({ message: "Database error" });
        }

        // CSV download (HR only anyway)
        if (isReport) {
            const header = [
                "ID",
                "Request No",
                "Name",
                "Employee ID",
                "Certificate Type",
                "Joining Date",
                "Ending Date",
                "Status",
                "Created At"
            ];

            const csv = [
                header.join(","),
                ...results.map(r => [
                    r.id,
                    `"${r.req_no}"`,
                    `"${r.name}"`,
                    r.employee_id,
                    r.certificate_type,
                    r.joining_date,
                    r.ending_date,
                    r.status,
                    `"${r.created_at}"`
                ].join(","))
            ].join("\n");

            res.setHeader(
                "Content-Disposition",
                `attachment; filename=certificate-report-${Date.now()}.csv`
            );
            res.setHeader("Content-Type", "text/csv");
            return res.send(csv);
        }

        res.json(results);
    });
};


// employee own table 
// employee own certificate table (FINAL)
exports.getMyCertificateRequests = (req, res) => {
    if (!req.session.user || !req.session.user.employee_id) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    const empCode = req.session.user.employee_id; // EMP0020

    const sql = `
        SELECT 
            c.req_no,
            c.employee_id,
            c.name,
            ct.type AS certificate_type_name,
            c.status,
            c.rejection_reason
        FROM certificate c
        JOIN certificate_types ct ON c.certificate_type = ct.id
        JOIN employees e ON c.requester_id = e.id
        WHERE e.employee_id = ?
        ORDER BY c.created_at DESC
    `;

    db.query(sql, [empCode], (err, results) => {
        if (err) {
            console.error("DB Error:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
    });
};
