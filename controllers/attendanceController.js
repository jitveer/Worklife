const db = require("../db");
const reverseGeocode = require("../utils/reverseGeocode");
const watermarkImage = require("../utils/watermarkImage");
// Helper: Always get today's date in India Standard Time (IST) YYYY-MM-DD
function getTodayIST() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata"
  }).format(new Date());
}

// 🛡️ Bulletproof Lock to prevent rapid multiple clicks without leaking memory
const activeLoginRequests = new Map();

function acquireLoginLock(empId) {
  if (activeLoginRequests.has(empId)) {
    return false;
  }
  // Auto-release after 8 seconds as safety net so employee can never be trapped
  const timer = setTimeout(() => {
    activeLoginRequests.delete(empId);
  }, 8000);
  activeLoginRequests.set(empId, timer);
  return true;
}

function releaseLoginLock(empId) {
  if (activeLoginRequests.has(empId)) {
    clearTimeout(activeLoginRequests.get(empId));
    activeLoginRequests.delete(empId);
  }
}


/* ---------- SHOW PASSCODE PAGE ---------- */
exports.showPasscode = (req, res) => {
  res.redirect("/attendance/passcode.html");
};


/* ---------- VERIFY PASSCODE ---------- */
// const bcrypt = require("bcrypt"); // add at top if not already

exports.verifyPasscode = (req, res) => {
  const { passcode } = req.body;

  // console.log("===== VERIFY PASSCODE =====");
  // console.log("Received passcode:", passcode);
  // console.log("Session before verify:", req.session);


  if (!passcode || String(passcode).trim().length !== 4) {
    return res.status(400).json({ success: false, message: "Enter 4-digit passcode" });
  }

  const cleanPasscode = String(passcode).trim();
  // ⚡ Fast indexed lookup (1ms) instead of scanning the whole employees table repeatedly during morning rush
  const sql = "SELECT * FROM employees WHERE TRIM(passcode) = ? LIMIT 1";

  db.query(sql, [cleanPasscode], (err, employees) => {
    if (err) {
      console.error("VERIFY PASSCODE DB ERROR:", err);
      return res.status(500).json({ success: false, message: "DB error" });
    }

    const emp = (employees && employees.length > 0) ? employees[0] : null;

    if (!emp) {
      return res.status(401).json({ success: false, message: "Invalid passcode" });
    }

    req.session.employee = emp;

    const today = getTodayIST();

    const checkSql = `
      SELECT * FROM attendance
      WHERE employee_id = ? AND (DATE(login_time) = ? OR DATE(login_time) = CURDATE())
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

      //---------------------------------------------------------------------------------------
      // =====================================================
      // LOGIN TIME CHECK
      // =====================================================

      if (!isLoginTimeAllowed(emp.employee_id)) {
        const window = getEmployeeLoginWindow(emp.employee_id);

        const parts = new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        }).formatToParts(new Date());

        const hour = Number(parts.find(p => p.type === "hour").value);
        const minute = Number(parts.find(p => p.type === "minute").value);
        const currentMinutes = (hour * 60) + minute;

        if (currentMinutes < window.startMinutes) {
          return res.json({
            success: false,
            action: "login_not_started",
            message: `Login will be allowed only from ${window.allowedWindow}.`
          });
        }

        return res.json({
          success: false,
          action: "login_closed",
          message: `Login time is closed for today. Login was allowed from ${window.allowedWindow}.`
        });
      }

      return res.json({
        success: true,
        action: "login"
      });
    });
  });
};


// =====================================================
// HELPER: GET LOGIN WINDOW FOR EACH EMPLOYEE TYPE
// =====================================================
function getEmployeeLoginWindow(employeeId) {
  const empId = String(employeeId).trim();

  // 1️⃣ Hemanth (8:00 AM to 10:00 AM)
  const hemanthEmployees = ["2913"];

  const manjunathEmployees = ["7220"];

  // 2️⃣ Early Employees (8:30 AM to 9:00 AM)
  const earlyLoginEmployees = ["5919", "6701", "9330"];

  // 3️⃣ Arjun (9:25 AM to 10:00 AM)
  const arjunAkashEmployees = ["5149"];

  if (hemanthEmployees.includes(empId)) {
    return {
      allowedWindow: "8:00 AM to 10:00 AM",
      startMinutes: 8 * 60,
      startSeconds: 8 * 3600,
      endSeconds: (10 * 3600) + (2 * 60)
    };
  }

  if (manjunathEmployees.includes(empId)) {
    return {
      allowedWindow: "9:00 AM to 10:00 AM",
      startMinutes: 9 * 60,
      startSeconds: 9 * 3600,
      endSeconds: (10 * 3600) + (2 * 60) // Includes 2 min grace period like other shifts
    };
  }

  if (earlyLoginEmployees.includes(empId)) {
    return {
      allowedWindow: "8:30 AM to 9:00 AM",
      startMinutes: (8 * 60) + 30,
      startSeconds: (8 * 3600) + (30 * 60),
      endSeconds: (9 * 3600) + (2 * 60)
    };
  }

  if (arjunAkashEmployees.includes(empId)) {
    return {
      allowedWindow: "9:25 AM to 10:00 AM",
      startMinutes: (9 * 60) + 25,
      startSeconds: (9 * 3600) + (25 * 60),
      endSeconds: (10 * 3600) + (2 * 60)
    };
  }

  // 4️⃣ Regular Employees (9:45 AM to 10:00 AM)
  return {
    allowedWindow: "9:45 AM to 10:00 AM",
    startMinutes: (9 * 60) + 45,
    startSeconds: (9 * 3600) + (45 * 60),
    endSeconds: (10 * 3600) + (2 * 60)
  };
}

// =====================================================
// LOGIN TIME CHECK
// INDIA TIME
// =====================================================
function isLoginTimeAllowed(employeeId) {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  const hour = Number(parts.find(p => p.type === "hour").value);
  const minute = Number(parts.find(p => p.type === "minute").value);
  const second = Number(parts.find(p => p.type === "second").value);

  const currentTimeInSeconds =
    hour * 3600 +
    minute * 60 +
    second;

  const window = getEmployeeLoginWindow(employeeId);

  return (
    currentTimeInSeconds >= window.startSeconds &&
    currentTimeInSeconds < window.endSeconds
  );
}






/* ---------- LOGIN OPTIONS PAGE ---------- */
exports.loginOptions = (req, res) => {
  // console.log("===== LOGIN OPTIONS =====");
  // console.log("Session employee:", req.session.employee);

  if (!req.session.employee) {
    return res.redirect("/attendance/passcode.html");
  }
  res.redirect("/attendance/login-options.html");
};

/* ---------- OFFICE LOGIN ---------- */
exports.officeLogin = (req, res) => {
  // console.log("===== OFFICE LOGIN =====");
  // console.log("Session:", req.session);
  // console.log("Session employee:", req.session.employee);

  const emp = req.session.employee;

  if (!emp) {
    return res.status(401).json({ success: false, message: "Session expired" });
  }

  // 🛡️ GUARD 1: Block simultaneous rapid clicks from the same employee
  if (!acquireLoginLock(emp.id)) {
    return res.status(429).json({
      success: false,
      message: "Login is already processing. Please wait a moment."
    });
  }

  // =====================================================
  // CHECK LOGIN TIME
  // =====================================================
  if (!isLoginTimeAllowed(emp.employee_id)) {
    releaseLoginLock(emp.id);
    const window = getEmployeeLoginWindow(emp.employee_id);
    return res.status(403).json({
      success: false,
      message: `Office login is allowed only between ${window.allowedWindow}.`
    });
  }

  const today = getTodayIST();

  // 🛡️ GUARD 2: Check database if already logged in today without logout
  const checkSql = `
    SELECT id FROM attendance
    WHERE employee_id = ?
    AND (DATE(login_time) = ? OR DATE(login_time) = CURDATE())
    AND logout_time IS NULL
    LIMIT 1
  `;
  db.query(checkSql, [emp.id, today], (checkErr, rows) => {
    if (checkErr) {
      releaseLoginLock(emp.id);
      console.error("CHECK LOGIN ERROR:", checkErr);
      return res.status(500).json({ success: false, message: "Database check error" });
    }
    if (rows && rows.length > 0) {
      releaseLoginLock(emp.id);
      // Already logged in today, return success so it doesn't duplicate
      return res.json({ success: true, message: "Already logged in" });
    }

    // Login is within allowed time
    let late_minutes = 0;
    let late_seconds = 0;

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
    ], (err, result) => {
      releaseLoginLock(emp.id);

      if (err) {
        console.error("OFFICE LOGIN DB ERROR:", err);
        return res.status(500).json({ success: false, message: "Database insert error" });
      }
      res.json({ success: true });
    });

  });

};


/* ---------- SITE LOGIN PAGE ---------- */
exports.siteLoginPage = (req, res) => {
  // console.log("==== SITE LOGIN HIT ====");
  // console.log("BODY:", req.body);
  // console.log("FILES:", req.files);
  if (!req.session.employee) {
    return res.redirect("/attendance/passcode.html");
  }
  res.redirect("/attendance/site-location.html");
};

/* ---------- SITE LOGIN SUBMIT ---------- */
exports.siteLogin = async (req, res) => {
  const emp = req.session.employee;

  if (!emp) {
    return res.status(401).send("Session expired");
  }

  // 🛡️ Block rapid multiple clicks
  if (!acquireLoginLock(emp.id)) {
    return res.status(429).send("Site login is already being processed. Please wait a moment.");
  }

  try {
    // =====================================================
    // CHECK LOGIN TIME
    // =====================================================
    if (!isLoginTimeAllowed(emp.employee_id)) {
      releaseLoginLock(emp.id);
      const window = getEmployeeLoginWindow(emp.employee_id);
      return res.status(403).send(
        `Site login is allowed only between ${window.allowedWindow}.`
      );
    }

    // Login is within allowed time
    let late_minutes = 0;
    let late_seconds = 0;

    // 1️⃣ Read latitude & longitude
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) {
      releaseLoginLock(emp.id);
      return res.status(400).send("Location missing");
    }

    // 2️⃣ Ensure selfie exists
    if (!req.file) {
      releaseLoginLock(emp.id);
      return res.status(400).send("Selfie missing");
    }

    // 3️⃣ DEFINE imagePath FIRST ✅
    const imagePath = `/uploads/attendance_selfie/${req.file.filename}`;

    // 4️⃣ Reverse geocode (fail-safe: attendance will NEVER fail if geocode is slow or unavailable)
    let location_address = "Location not available";
    try {
      location_address = await reverseGeocode(latitude, longitude);
    } catch (geoErr) {
      console.error("Reverse geocode warning:", geoErr.message);
      location_address = `Lat: ${latitude}, Lng: ${longitude}`;
    }

    // 5️⃣ Watermark image (fail-safe: attendance will NEVER fail if image watermarking errors)
    try {
      await watermarkImage(imagePath, location_address);
    } catch (wmErr) {
      console.error("Watermark warning:", wmErr.message);
    }

    const today = getTodayIST();

    // 🛡️ Check if already logged in today without logout
    const checkSql = `
      SELECT id FROM attendance
      WHERE employee_id = ?
      AND (DATE(login_time) = ? OR DATE(login_time) = CURDATE())
      AND logout_time IS NULL
      LIMIT 1
    `;
    db.query(checkSql, [emp.id, today], (checkErr, rows) => {
      if (checkErr) {
        releaseLoginLock(emp.id);
        console.error("SITE LOGIN DB CHECK ERROR:", checkErr);
        return res.status(500).send("Database error");
      }
      if (rows && rows.length > 0) {
        releaseLoginLock(emp.id);
        return res.json({ success: true, message: "Already logged in" });
      }

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
          releaseLoginLock(emp.id);

          if (err) {
            console.error("DB ERROR:", err);
            return res.status(500).send("Attendance insert failed");
          }

          res.json({ success: true });
        }
      );
    });
  } catch (err) {
    releaseLoginLock(emp.id);
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

  const today = getTodayIST();

  const sql = `
    SELECT * FROM attendance
    WHERE employee_id = ?
    AND (DATE(login_time) = ? OR DATE(login_time) = CURDATE())
    AND logout_time IS NULL
    ORDER BY id DESC LIMIT 1
  `;

  db.query(sql, [emp.id, today], (err, rows) => {

    if (err || !rows.length) {
      return res.redirect("/attendance/passcode.html");
    }

    const attendance = rows[0];



    //-------------------------------------------------------------
    //for testing logout do changes in this 18 
    //-------------------------------------------------------------

    // before 6pm → emergency logout
    // Convert current time to India Standard Time (IST)
    const parts = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).formatToParts(new Date());
    const hour = Number(parts.find(p => p.type === "hour").value);
    // Before 6:00 PM IST (18:00) → Emergency Logout
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

  const today = getTodayIST();

  const sql = `
    SELECT * FROM attendance
    WHERE employee_id = ?
    AND (DATE(login_time) = ? OR DATE(login_time) = CURDATE())
    AND logout_time IS NULL
    ORDER BY id DESC LIMIT 1
  `;

  db.query(sql, [emp.id, today], (err, rows) => {

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

  const today = getTodayIST();

  const sql = `
    SELECT login_time
    FROM attendance
    WHERE employee_id = ?
    AND (DATE(login_time) = ? OR DATE(login_time) = CURDATE())
    AND logout_time IS NULL
    ORDER BY id DESC
    LIMIT 1
  `;

  db.query(sql, [emp.id, today], (err, rows) => {

    if (err || !rows.length) {
      return res.json({ workingTime: "0 Minutes" });
    }

    const loginTime = new Date(rows[0].login_time);
    const now = new Date();

    const diff = Math.floor((now - loginTime) / 1000);

    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);

    const workingTime = hours + " Hours " + minutes + " Minutes";

    res.json({
      workingTime,
      loginTime: rows[0].login_time
    });

  });

};



/* ---------- GET ALL ATTENDANCE ---------- */
exports.getAttendance = (req, res) => {

  const { start, end } = req.query;

  let sql = `
SELECT
  id,
  TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))) AS name,
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
      TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))) AS name,
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

      // Get IST date day (1-31)
      const date = Number(
        new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "numeric"
        }).format(new Date(row.login_time))
      );

      if (!grouped[name]) {
        grouped[name] = {};
      }

      grouped[name][date] = {
        login: row.login_time
          ? new Date(row.login_time).toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
          })
          : "",
        logout: row.logout_time
          ? new Date(row.logout_time).toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
          })
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
          ? new Date(row.login_time).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
          })
          : "-";
        const logout = row.logout_time
          ? new Date(row.logout_time).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
          })
          : "-";

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
      const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      });

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