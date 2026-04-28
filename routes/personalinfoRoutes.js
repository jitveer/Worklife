// const express = require("express");
// const router = express.Router();
// const db = require("../db");

// // GET /api/leave/personalinfo
// router.get("/", (req, res) => {
//   const userEmail = req.session.user?.email;
//   console.log("Session user email:", userEmail);

//   if (!userEmail) {
//     return res.status(401).json({ error: "Not logged in" });
//   }

//   const sql = `
//     SELECT 
//       CONCAT(e.first_name, ' ', e.middle_name, ' ', e.last_name) AS requester_name,
//       e.employee_id,
//       e.email AS email_id,
//       d.name AS department,
//       c.name AS company,
//       e.designation,
//       e.doj AS joining_date,
//       lm.name AS line_manager
//     FROM employees e
//     LEFT JOIN departments d ON e.department_id = d.id
//     LEFT JOIN companies c ON e.company_id = c.id
//     LEFT JOIN line_managers lm ON e.line_manager_id = lm.id
//     WHERE e.email = ?
//   `;

//   db.query(sql, [userEmail], (err, result) => {
//     if (err) {
//       console.error("DB error:", err);
//       return res.status(500).json({ error: "DB error" });
//     }

//     if (result.length === 0) {
//       return res.status(404).json({ error: "No employee info found" });
//     }

//     res.json(result[0]);
//   });
// });

// module.exports = router;
