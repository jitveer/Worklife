const db = require("../db");
const reverseGeocode = require("../utils/reverseGeocode");
const watermarkImage = require("../utils/watermarkImage");

// // email sent with hashed password in eployee passcode column for attendance 
// const crypto = require("crypto");
// function hashPassword(password) {
//   return crypto.createHash("md5").update(password).digest("hex");
// }

/* ---------- SHOW PASSCODE PAGE ---------- */
exports.showPasscode = (req, res) => {
  res.redirect("/attendance/passcode.html");
};


/* ---------- VERIFY PASSCODE ---------- */
const bcrypt = require("bcrypt"); // add at top if not already

exports.verifyPasscode = (req, res) => {
  const { passcode } = req.body;

  if (!passcode || passcode.length !== 4) {
    return res.status(400).json({ success: false, message: "Enter 4-digit passcode" });
  }

  const sql = "SELECT * FROM employees"; // get all employees with hashed passcode

  db.query(sql, (err, employees) => {
    if (err) return res.status(500).json({ success: false, message: "DB error" });

    // 🔑 Find employee by bcrypt
    const emp = employees.find(emp => bcrypt.compareSync(passcode, emp.passcode));

    if (!emp) {
      return res.status(401).json({ success: false, message: "Invalid passcode" });
    }

    req.session.employee = emp;

    const today = new Date().toISOString().split("T")[0];

    const checkSql = `
      SELECT * FROM attendance
      WHERE employee_id = ? AND DATE(login_time) = ?
      ORDER BY id DESC LIMIT 1
    `;

    db.query(checkSql, [emp.id, today], (err, rows) => {
      if (err) return res.status(500).json({ success: false, message: "DB error" });

      if (rows.length > 0 && !rows[0].logout_time) {
        return res.json({
          success: true,
          action: "logout",
          attendance_id: rows[0].id
        });
      }

      return res.json({
        success: true,
        action: "login"
      });
    });
  });
};



// exports.verifyPasscode = (req, res) => {
//   const { passcode } = req.body;

//   // 🔥 hash input passcode

//   const hashedPasscode = hashPassword(passcode);

//   const sql = "SELECT * FROM employees WHERE passcode = ?";

//   db.query(sql, [hashedPasscode], (err, result) => {
//     if (err) return res.status(500).json({ message: "DB error" });

//     if (result.length === 0) {
//       return res.status(401).json({ message: "Invalid passcode" });
//     }

//     const emp = result[0];
//     req.session.employee = emp;

//     const today = new Date().toISOString().split("T")[0];

//     const checkSql = `
//       SELECT * FROM attendance
//       WHERE employee_id = ?
//       AND DATE(login_time) = ?
//       ORDER BY id DESC LIMIT 1
//     `;

//     db.query(checkSql, [emp.id, today], (err, rows) => {
//       if (err) return res.status(500).json({ message: "DB error" });

//       if (rows.length > 0 && !rows[0].logout_time) {
//         return res.json({
//           success: true,
//           action: "logout",
//           attendance_id: rows[0].id
//         });
//       }
//-----------------------------------------------------------------
//       // const now = new Date();
//       // const hour = 16;
//       // const minute = 10;

//       // if (hour > 10 || (hour === 10 && minute > 30)) {
//       //   return res.json({
//       //     success: false,
//       //     message: "Login time over. Please login tomorrow."
//       //   });
//       // }

//----------------------------------------------------------------------
//       // TEMPORARY FOR TESTING LOGIN
//       return res.json({
//         success: true,
//         action: "login"
//       });
//     });
//   });
// };




/* ---------- LOGIN OPTIONS PAGE ---------- */
exports.loginOptions = (req, res) => {
  if (!req.session.employee) {
    return res.redirect("/attendance/passcode.html");
  }
  res.redirect("/attendance/login-options.html");
};

/* ---------- OFFICE LOGIN ---------- */
exports.officeLogin = (req, res) => {

  const emp = req.session.employee;

  if (!emp) {
    return res.status(401).json({ success: false });
  }

  const now = new Date();

  const lateStart = new Date();
  lateStart.setHours(10, 0, 0);

  let late_minutes = 0;
  let late_seconds = 0;

  if (now > lateStart) {

    const diff = Math.floor((now - lateStart) / 1000);

    late_minutes = Math.floor(diff / 60);
    late_seconds = diff % 60;
  }

  const sql = `
    INSERT INTO attendance
    (
      employee_id,
      first_name,
      last_name,
      login_time,
      login_type,
      device_name,
      late_minutes,
      late_seconds
    )
    VALUES (?, ?, ?, NOW(), 'Office', ?, ?, ?)
  `;

  db.query(sql, [
    emp.id,
    emp.first_name,
    emp.last_name,
    req.headers["user-agent"],
    late_minutes,
    late_seconds
  ], (err) => {

    if (err) {
      return res.status(500).json({ success: false });
    }

    res.json({ success: true });

  });

};


/* ---------- SITE LOGIN PAGE ---------- */
exports.siteLoginPage = (req, res) => {
  console.log("==== SITE LOGIN HIT ====");
  console.log("BODY:", req.body);
  console.log("FILES:", req.files);
  if (!req.session.employee) {
    return res.redirect("/attendance/passcode.html");
  }
  res.redirect("/attendance/site-location.html");
};

/* ---------- SITE LOGIN SUBMIT ---------- */
exports.siteLogin = async (req, res) => {
  try {
    console.log("==== SITE LOGIN HIT ====");
    console.log("BODY:", req.body);
    console.log("FILE:", req.file);

    const emp = req.session.employee;
    if (!emp) {
      return res.status(401).send("Session expired");
    }

    // Calculate late login
    const now = new Date();

    const lateStart = new Date();
    lateStart.setHours(10, 0, 0);

    let late_minutes = 0;
    let late_seconds = 0;

    if (now > lateStart) {

      const diff = Math.floor((now - lateStart) / 1000);

      late_minutes = Math.floor(diff / 60);
      late_seconds = diff % 60;

    }

    // 1️⃣ Read latitude & longitude
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) {
      return res.status(400).send("Location missing");
    }

    // 2️⃣ Ensure selfie exists
    if (!req.file) {
      return res.status(400).send("Selfie missing");
    }

    // 3️⃣ DEFINE imagePath FIRST ✅
    const imagePath = `/uploads/attendance_selfie/${req.file.filename}`;

    // 4️⃣ Reverse geocode
    const location_address = await reverseGeocode(latitude, longitude);
    console.log("Resolved Location:", location_address);

    // 5️⃣ Watermark image AFTER imagePath exists ✅
    await watermarkImage(imagePath, location_address);

    // 6️⃣ Insert into DB
    const sql = `
      INSERT INTO attendance
      (
        employee_id,
        first_name,
        last_name,
        login_time,
        login_type,
        latitude,
        longitude,
        location_address,
        image,
        late_minutes,
        late_seconds
      )
      VALUES (?, ?, ?, NOW(), 'Site', ?, ?, ?, ?, ?, ?)
    `;

    db.query(
      sql,
      [
        emp.id,
        emp.first_name,
        emp.last_name,
        latitude,
        longitude,
        location_address,
        imagePath,
        late_minutes,
        late_seconds
      ],
      (err) => {
        if (err) {
          console.error("DB ERROR:", err);
          return res.status(500).send("Attendance insert failed");
        }

        res.json({ success: true });
      }
    );
  } catch (err) {
    console.error("SITE LOGIN ERROR:", err);
    res.status(500).send("Server error");
  }
};


/* ---------- SUCCESS PAGE ---------- */
exports.successPage = (req, res) => {
  res.redirect("/attendance/success.html");
};


/* ---------- logout ---------- */
exports.logout = (req, res) => {

  const emp = req.session.employee;

  if (!emp) {
    return res.redirect("/attendance/passcode.html");
  }

  const sql = `
    SELECT * FROM attendance
    WHERE employee_id = ?
    AND DATE(login_time) = CURDATE()
    ORDER BY id DESC LIMIT 1
  `;

  db.query(sql, [emp.id], (err, rows) => {

    if (err || !rows.length) {
      return res.redirect("/attendance/passcode.html");
    }

    const attendance = rows[0];

    const now = new Date();
    const hour = now.getHours();

    // before 6pm → emergency logout
    if (hour < 18) {
      return res.redirect("/attendance/emergency-logout.html");
    }

    const loginTime = new Date(attendance.login_time);
    const logoutTime = new Date();

    const diff = Math.floor((logoutTime - loginTime) / 1000);

    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);

    const workingTime = hours + " Hours " + minutes + " Minutes";

    const update = `
      UPDATE attendance
      SET logout_time = NOW(),
          working_timing = ?
      WHERE id = ?
    `;

    db.query(update, [workingTime, attendance.id], () => {

      res.redirect("/attendance/logout-success.html");

    });

  });

};


/* ----------Emergency logout ---------- */
exports.emergencyLogout = (req, res) => {

  const { reason } = req.body;
  const emp = req.session.employee;

  const sql = `
    SELECT * FROM attendance
    WHERE employee_id = ?
    AND DATE(login_time) = CURDATE()
    AND logout_time IS NULL
    ORDER BY id DESC LIMIT 1
  `;

  db.query(sql, [emp.id], (err, rows) => {

    if (err || !rows.length) {
      return res.json({ success: false });
    }

    const attendance = rows[0];

    const loginTime = new Date(attendance.login_time);
    const logoutTime = new Date();

    const diff = Math.floor((logoutTime - loginTime) / 1000);

    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);

    const workingTime = hours + " Hours " + minutes + " Minutes";

    const update = `
      UPDATE attendance
      SET logout_time = NOW(),
          reason = ?,
          working_timing = ?
      WHERE id = ?
    `;

    db.query(update, [reason, workingTime, attendance.id], () => {

      res.json({ success: true });

    });

  });

};



// total hours and minutes worked to display in frontend
exports.getTodayWorkingTime = (req, res) => {

  const emp = req.session.employee;

  // if session expired
  if (!emp) {
    return res.json({ workingTime: "0 Minutes" });
  }

  const sql = `
    SELECT login_time
    FROM attendance
    WHERE employee_id = ?
    AND DATE(login_time) = CURDATE()
    AND logout_time IS NULL
    ORDER BY id DESC
    LIMIT 1
  `;

  db.query(sql, [emp.id], (err, rows) => {

    if (err || !rows.length) {
      return res.json({ workingTime: "0 Minutes" });
    }

    const loginTime = new Date(rows[0].login_time);
    const now = new Date();

    const diff = Math.floor((now - loginTime) / 1000);

    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);

    const workingTime = hours + " Hours " + minutes + " Minutes";

    res.json({ workingTime });

  });

};



/* ---------- GET ALL ATTENDANCE ---------- */
exports.getAttendance = (req, res) => {

  const { start, end } = req.query;

  let sql = `
SELECT
  id,
  CONCAT(first_name,' ',last_name) AS name,
  login_time,
  logout_time,
  late_minutes,
  late_seconds,
  login_type,
  image,
  location_address
  FROM attendance
  `;

  let params = [];

  // ✅ APPLY FILTER
  if (start && end) {
    sql += " WHERE DATE(login_time) BETWEEN ? AND ?";
    params.push(start, end);
  }

  sql += " ORDER BY login_time DESC";

  db.query(sql, params, (err, rows) => {

    if (err) {
      console.error("Attendance fetch error:", err);
      return res.status(500).json({
        success: false,
        message: "Database error"
      });
    }

    res.json({
      success: true,
      data: rows
    });

  });

};


// download report 
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

exports.downloadReport = (req, res) => {
  const { start, end, type } = req.query;

  const sql = `
    SELECT 
      CONCAT(first_name,' ',last_name) AS name,
      login_time,
      logout_time,
    late_minutes,
    late_seconds,
    login_type,
    on_time_message
  FROM attendance
  WHERE DATE(login_time) BETWEEN ? AND ?
  ORDER BY login_time DESC
`;

  db.query(sql, [start, end], async (err, results) => {

    if (err) {
      return res.status(500).send("DB error");
    }

    // 🔥 STEP 1: GROUP DATA (IMPORTANT)
    const grouped = {};

    results.forEach(row => {
      const name = row.name;
      const date = new Date(row.login_time).getDate(); // 1–31

      if (!grouped[name]) {
        grouped[name] = {};
      }

      grouped[name][date] = {
        login: row.login_time
          ? new Date(row.login_time).toLocaleTimeString()
          : "",
        logout: row.logout_time
          ? new Date(row.logout_time).toLocaleTimeString()
          : ""
      };
    });

    // ================== EXCEL ==================
    if (type === "excel") {

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Monthly Attendance");

      // HEADER
      let header = ["Name"];
      for (let i = 1; i <= 31; i++) {
        header.push(i.toString());
      }
      sheet.addRow(header);

      // DATA
      Object.keys(grouped).forEach(name => {

        // LOGIN ROW
        let loginRow = [name + " (Login)"];
        for (let i = 1; i <= 31; i++) {
          loginRow.push(grouped[name][i]?.login || "");
        }
        sheet.addRow(loginRow);

        // LOGOUT ROW
        let logoutRow = ["(Logout)"];
        for (let i = 1; i <= 31; i++) {
          logoutRow.push(grouped[name][i]?.logout || "");
        }
        sheet.addRow(logoutRow);
      });

      // RESPONSE
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      res.setHeader(
        "Content-Disposition",
        "attachment; filename=attendance.xlsx"
      );

      await workbook.xlsx.write(res);
      return res.end();
    }

    // ================== PDF ==================
    const puppeteer = require("puppeteer");

    if (type === "pdf") {

      // ✅ Create table rows
      let rows = "";

      results.forEach((row, index) => {

        const login = row.login_time
          ? new Date(row.login_time).toLocaleString("en-IN")
          : "-";

        const logout = row.logout_time
          ? new Date(row.logout_time).toLocaleString("en-IN")
          : "-";

        // 🔥 Late Calculation
        let late = "";

        if ((row.late_minutes > 0) || (row.late_seconds > 0)) {

          const hours = Math.floor(row.late_minutes / 60);
          const mins = row.late_minutes % 60;
          const secs = row.late_seconds || 0;

          late = `
          ${hours > 0 ? hours + " hr " : ""}
          ${mins > 0 ? mins + " min " : ""}
          ${secs > 0 ? secs + " sec" : ""}
         `;

        } else {
          late = row.on_time_message ?? "";
        }

        rows += `
      <tr>
        <td>${index + 1}</td>
        <td>${row.name}</td>
        <td>${login}</td>
        <td>${logout}</td>
        <td>${row.login_type || "-"}</td>
        <td>${late || "-"}</td>
        </tr>
        `;
      });

      // ✅ FULL HTML (THIS MAKES IT LOOK LIKE FRONTEND)
      const html = `
  <html>
  <head>
    <style>
      body {
        font-family: Arial;
        padding: 20px;
      }

      h2 {
        text-align: center;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 20px;
      }

      th, td {
        border: 1px solid #ccc;
        padding: 8px;
        text-align: left;
      }

      th {
        background: #4f46e5;
        color: white;
      }

      tr:nth-child(even) {
        background: #f3f4f6;
      }
    </style>
  </head>

  <body>
    <h2>Attendance Report</h2>

    <table>
      <tr>
        <th>#</th>
        <th>Name</th>
        <th>Login</th>
        <th>Logout</th>
        <th>Type</th>
        <th>Late</th>
      </tr>

      ${rows}
    </table>
  </body>
  </html>
  `;

      // ✅ Convert to PDF
      const browser = await puppeteer.launch();
      const page = await browser.newPage();

      await page.setContent(html, { waitUntil: "domcontentloaded" });

      const pdf = await page.pdf({
        format: "A4",
        printBackground: true
      });

      await browser.close();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=attendance.pdf");

      res.send(pdf);
    }

  });
};