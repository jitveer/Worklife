// routes/leaveRoutes.js
const express = require('express');
const router = express.Router();
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const upload = require("../uploadConfig"); // your upload setup file
const uploadMedical = upload("medical_certificates");
const leaveController = require('../controllers/leaveRequestController');
const db = require('../db');


// Get employees by department ID
router.get("/by-department", async (req, res) => {
  if (!req.session.user || !req.session.user.departmentId) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }

  const departmentId = req.session.user.departmentId;

  const sql = `
    SELECT employee_id, CONCAT(first_name, ' ', last_name) AS name 
    FROM employees 
    WHERE department_id = ?
  `;

  db.query(sql, [departmentId], (err, results) => {
    if (err) {
      console.error("Error fetching employees:", err);
      return res.status(500).json({ success: false, message: "Error fetching employees" });
    }

    res.json({ success: true, employees: results });
  });
});


//  Submit leave request (uses your controller logic)
router.post("/submit", uploadMedical.single("medical_certificates"), leaveController.submitLeaveRequest);

//router.post('/submit', leaveController.submitLeaveRequest);
router.put('/update-status/:id', leaveController.updateLeaveStatus);

//  Get personal info for leave page
router.get('/personalinfo', (req, res) => {
  const userEmail = req.session.user?.email;
  if (!userEmail) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const sql = `
  SELECT 
    CONCAT(e.first_name, ' ', e.last_name) AS requester_name,
    u.email AS email_id,
    d.department_name AS department,
    c.company_name AS company,
    e.designation, 
    lm.name AS line_manager,
    e.doj AS joining_date,
    e.employee_id
  FROM users u
  JOIN employees e ON u.email = e.email
  JOIN department d ON e.department_id = d.id
  JOIN company_name c ON e.company_id = c.id
  JOIN line_managers lm ON e.line_manager_id = lm.id
  WHERE u.email = ?
`;

  db.query(sql, [userEmail], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "DB error" });
    }
    if (result.length === 0) {
      return res.status(404).json({ error: "No employees info found" });
    }
    res.json(result[0]);
  });
});

router.post('/assign-leave-task', (req, res) => {
  console.log(req.body)
  const { leave_request_id, assigned_employee_id, task_description } = req.body;

  const sql = `
    INSERT INTO leave_request_assignments 
    (leave_request_id, assigned_employee_id, task_description) 
    VALUES (?, ?, ?)
  `;

  db.run(sql, [leave_request_id, assigned_employee_id, task_description], function (err) {
    if (err) {
      console.error('Error assigning task:', err.message);
      return res.status(500).send('Task assignment failed.');
    }
    res.status(200).send('Task successfully assigned to employee.');
  });
});




// approver own table with filtration
router.get("/", (req, res) => {
  const approverUserId = req.session.user?.user_id;

  if (!approverUserId) {
    return res.status(401).json({ message: "Not logged in" });
  }


  // ⭐ IMPORTANT: Add this!
  const isReport = req.query.report === "1";

  // NEW FILTERS COMING FROM FRONTEND
  const status = req.query.status || "all";
  const search = req.query.search || "";
  const startDate = req.query.start_date || "";
  const endDate = req.query.end_date || "";
  const requesterEmail = req.query.requester_email || null;

  // BASE QUERY
  let sql = `
    SELECT 
      lr.*,
      lra.status AS approver_status,
      lra.level AS approver_level
    FROM leave_requests lr
    JOIN leave_request_approvals lra 
      ON lr.id = lra.leave_request_id
    WHERE lra.approver_user_id = ?
  `;

  const params = [approverUserId];

  // ⭐ FILTER 1: STATUS
  if (status !== "all") {
    sql += " AND lr.status = ? ";
    params.push(status);
  }

  // ⭐ FILTER 2: SEARCH BY REQUESTER NAME
  if (search.trim() !== "") {
    sql += " AND lr.requester_name LIKE ? ";
    params.push(`%${search}%`);
  }

  // ⭐ FILTER 3: DATE RANGE
  if (startDate && endDate) {
    sql += " AND DATE(lr.created_at) BETWEEN ? AND ? ";
    params.push(startDate, endDate);
  } else if (startDate) {
    sql += " AND DATE(lr.created_at) >= ? ";
    params.push(startDate);
  } else if (endDate) {
    sql += " AND DATE(lr.created_at) <= ? ";
    params.push(endDate);
  }

  // ⭐ FILTER 4: MY REQUESTS
  if (requesterEmail) {
    sql += " AND lr.requester_email = ? ";
    params.push(requesterEmail);
  }

  // FINAL RULE (same as your existing one)
  sql += `
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

  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "DB error" });
    }
    // ================================
    // ⭐⭐⭐ CSV REPORT DOWNLOAD ⭐⭐⭐
    // ================================
    if (isReport) {
      const header = [
        "ID",
        "Request No",
        "Requester",
        "Leave Type",
        "From Date",
        "To Date",
        "Status",
        "Created At"
      ];

      const csv = [
        header.join(","),
        ...rows.map(r => [
          r.id,
          `"${r.req_no}"`,
          `"${r.requester_name}"`,
          `"${r.leave_type}"`,
          r.from_date,
          r.to_date,
          `"${r.status}"`,
          r.created_at
        ].join(","))
      ].join("\n");

      res.setHeader(
        "Content-Disposition",
        `attachment; filename=leave-report-${Date.now()}.csv`
      );
      res.setHeader("Content-Type", "text/csv");
      return res.send(csv);
    }

    // NORMAL JSON (table loading)
    res.json(rows);
  });
});;




// GET /api/leave/my-requests
router.get("/my-requests", (req, res) => {
  const userEmail = req.session.user?.email;

  if (!userEmail) return res.status(401).json({ message: "Not logged in" });

  const sql = `
    SELECT *
    FROM leave_requests
    WHERE requester_email = ?
    ORDER BY created_at DESC
  `;

  db.query(sql, [userEmail], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "DB error" });
    }
    res.json(rows);
  });
});


router.get("/:id", (req, res) => {
  const leaveId = req.params.id;
  const approverUserId = req.session.user?.user_id;

  if (!approverUserId) {
    return res.status(400).json({ message: "Missing user_id in session" });
  }

  const sql = `
    SELECT 
      lr.*,
      CONCAT(e.first_name, ' ', e.last_name) AS requester_name,
      e.employee_id,
      u.email AS email_id,
      c.company_name AS company,
      d.department_name,
      e.designation,
      lra.status AS approval_status
    FROM leave_requests lr
    JOIN users u ON lr.requester_email = u.email
    JOIN employees e ON u.email = e.email
    JOIN department d ON e.department_id = d.id
    JOIN company_name c ON e.company_id = c.id
    LEFT JOIN leave_request_approvals lra 
      ON lr.id = lra.leave_request_id AND lra.approver_user_id = ?
    WHERE lr.id = ?
  `;

  const assignmentQuery = `
    SELECT 
      la.assigned_employee_id,
      CONCAT(emp.first_name, ' ', emp.last_name) AS assigned_employee_name,
      la.task_description
    FROM leave_request_assignments la
    JOIN employees emp ON la.assigned_employee_id = emp.employee_id
    WHERE la.leave_request_id = ?
  `;

  const values = [approverUserId, leaveId];

  db.query(sql, values, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "DB error" });
    }
    if (rows.length === 0) {
      return res.status(404).json({ message: "Leave request not found" });
    }
    db.query(assignmentQuery, [leaveId], (err, assignmentRows) => {
      if (err) {
        console.error("Assignment query error:", err);
        return res.status(500).json({ message: "DB error on assignments" });
      }

      // Add assignments to the response
      const leaveDetails = rows[0];
      leaveDetails.assignments = assignmentRows;
      res.json(leaveDetails);
    });
  });
});


router.get('/leave-approvals/:id/my-status', leaveController.getMyApprovalStatus);
router.get("/details/:id", leaveController.getSingleLeaveRequest);

// Track approval flow for a leave request
router.get("/track/:id", (req, res) => {
  const leaveId = req.params.id;

  const sql = `
  SELECT 
  f.level,
  f.status,
  f.updated_at,
  CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS approver_name,
  u.email AS approver_email,
  u.role_id,
  r.role AS role_name 
FROM leave_request_approvals f
JOIN users u ON f.approver_user_id = u.id
JOIN user_role r ON u.role_id = r.id 
WHERE f.leave_request_id = ?
ORDER BY f.level ASC
  `;


  db.query(sql, [leaveId], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "DB error" });
    }
    res.json(rows);
  });
});


//  Delete leave request
router.delete("/:id", (req, res) => {
  const leaveId = req.params.id;

  db.query("DELETE FROM leave_requests WHERE id = ?", [leaveId], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "DB error" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Leave request not found" });
    }

    res.json({ message: "Leave request deleted" });
  });
});

module.exports = router;
