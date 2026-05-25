const db = require("../db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { sendCredentialsEmail } = require("../services/mailer");

function generateAttendancePasscode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function generateStrongPassword(length = 10) {

  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const special = "@#$!&*";

  const all = upper + lower + numbers + special;

  let password =
    upper[Math.floor(Math.random() * upper.length)] +
    lower[Math.floor(Math.random() * lower.length)] +
    numbers[Math.floor(Math.random() * numbers.length)] +
    special[Math.floor(Math.random() * special.length)];

  for (let i = 4; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}



function md5(password) {
  return crypto.createHash("md5").update(password).digest("hex");
}

exports.login = (req, res) => {

  const { company, role, email, password } = req.body;

  // DEVICE IP
  const ip =
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress;

  const sql = `
    SELECT * FROM users
    WHERE email = ? AND company_id = ? AND role_id = ?
  `;

  db.query(sql, [email, company, role], async (err, results) => {

    if (err) {

      console.error("DB Error:", err.message);

      return res.status(500).json({
        success: false,
        message: "Server error"
      });
    }

    if (results.length === 0) {

      return res.json({
        success: false,
        message: "Invalid credentials."
      });
    }

    const user = results[0];

    // =========================
    // CHECK DEVICE LOCK
    // =========================

    db.query(
      `SELECT * FROM login_attempts
       WHERE ip_address = ? AND email = ?`,
      [ip, email],
      async (err, attemptRows) => {

        if (attemptRows.length > 0) {

          const attemptData = attemptRows[0];

          if (
            attemptData.lock_until &&
            new Date(attemptData.lock_until) > new Date()
          ) {

            return res.json({
              success: false,
              message:
                "Too many failed attempts from this device. Try again after 30 minutes."
            });
          }
        }

        // =========================
        // MD5 PASSWORD SUPPORT
        // =========================

        if (user.password.length === 32) {

          if (md5(password) === user.password) {

            const newHash = await bcrypt.hash(password, 10);

            db.query(
              "UPDATE users SET password=? WHERE id=?",
              [newHash, user.id]
            );

            console.log("Password upgraded to bcrypt");

          } else {

            return handleFailedAttempt();
          }
        }

        // =========================
        // BCRYPT CHECK
        // =========================

        const isMatch = await bcrypt.compare(
          password,
          user.password
        );

        if (!isMatch) {

          return handleFailedAttempt();
        }

        // =========================
        // RESET ATTEMPTS AFTER SUCCESS
        // =========================

        db.query(
          `DELETE FROM login_attempts
           WHERE ip_address=? AND email=?`,
          [ip, email]
        );

        // =========================
        // SESSION
        // =========================

        req.session.user = {

          email: user.email,
          companyId: user.company_id,
          roleId: user.role_id,
          departmentId: user.department_id,
          name: `${user.first_name} ${user.last_name}`,
          employee_id: user.employee_id || null,
          user_id: user.id || null
        };

        return res.json({
          success: true,
          message: "Login successful"
        });

        // =========================
        // FAILED ATTEMPT FUNCTION
        // =========================

        function handleFailedAttempt() {

          db.query(
            `SELECT * FROM login_attempts
             WHERE ip_address=? AND email=?`,
            [ip, email],
            (err, rows) => {

              if (rows.length === 0) {

                db.query(
                  `INSERT INTO login_attempts
                   (ip_address, email, attempts)
                   VALUES (?, ?, 1)`,
                  [ip, email]
                );

                return res.json({
                  success: false,
                  message: "Invalid credentials. 4 attempts left."
                });

              } else {

                const attempts =
                  rows[0].attempts + 1;

                // LOCK AFTER 5 ATTEMPTS
                if (attempts >= 5) {

                  const lockUntil = new Date(
                    Date.now() + 30 * 60 * 1000
                  );

                  db.query(
                    `UPDATE login_attempts
                     SET attempts=?,
                         lock_until=?
                     WHERE ip_address=? AND email=?`,
                    [attempts, lockUntil, ip, email]
                  );

                  return res.json({
                    success: false,
                    message:
                      "Too many failed attempts. Device locked for 30 minutes."
                  });

                } else {

                  db.query(
                    `UPDATE login_attempts
                     SET attempts=?
                     WHERE ip_address=? AND email=?`,
                    [attempts, ip, email]
                  );

                  return res.json({
                    success: false,
                    message:
                      `${5 - attempts} attempts left.`
                  });
                }
              }
            }
          );
        }

      }
    );

  });

};


// GET ROLES CONTROLLER
exports.getRoles = (req, res) => {
  const sql = `SELECT * FROM roles`;
  db.query(sql, (err, results) => {
    if (err) {
      console.error("DB Error while fetching roles:", err.message);
      return res.status(500).json({ success: false, message: "Failed to fetch roles" });
    }
    res.json(results);
  });
};


exports.getAllCompanies = (req, res) => {
  db.query("SELECT id, company_name FROM company_name", (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Server error" });
    }
    res.json(results);
  });
};


// CREATE USER CONTROLLER
exports.createUser = async (req, res) => {
  const { first_name, last_name, employeeId, companyId, departmentId, roleId, email } = req.body;

  if (!first_name || !last_name || !employeeId || !companyId || !departmentId || !roleId || !email) {
    return res.status(400).send("Missing fields");
  }


  // ✅ 1. Generate 4-digit password
  const attendancePasscode = generateAttendancePasscode();
  const loginPassword = generateStrongPassword();

  const hashedPassword = await bcrypt.hash(loginPassword, 10);

  db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
    if (err) return res.status(500).send("Server error");

    if (results.length > 0) {
      return res.status(400).send("User already exists");
    }

    const sql = `
      INSERT INTO users (first_name, last_name, employee_id, company_id, department_id, role_id, email, password)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [first_name, last_name, employeeId, companyId, departmentId, roleId, email, hashedPassword], (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error creating user");
      }

      //console.log(" User created and linked to employeeId:", employeeId);
      db.query(
        "UPDATE employees SET passcode = ? WHERE employee_id = ?",
        [attendancePasscode, employeeId]
      );

      sendCredentialsEmail(
        email,
        loginPassword,
        attendancePasscode,

        (mailErr) => {

          if (mailErr) {
            console.error(mailErr);

            return res.status(500).send(
              "User created but email failed"
            );
          }

          res.send(
            "User created and credentials sent successfully!"
          );
        }
      );
    });
  });
};


// mail the password by clicking send button in emplyee-list page 
// Send 4-digit passcode to user
exports.sendUserPasscode = async (req, res) => {

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      message: "Email required"
    });
  }

  db.query(
    "SELECT * FROM users WHERE email = ?",
    [email],

    async (err, results) => {

      if (err) {
        return res.status(500).send("DB error");
      }

      if (results.length === 0) {
        return res.status(404).send("User not found");
      }

      // GENERATE NEW ATTENDANCE CODE
      const attendancePasscode =
        generateAttendancePasscode();

      // GENERATE NEW LOGIN PASSWORD
      const loginPassword =
        generateStrongPassword();

      // HASH LOGIN PASSWORD
      const hashedPassword =
        await bcrypt.hash(loginPassword, 10);

      // UPDATE USERS TABLE
      db.query(
        "UPDATE users SET password = ? WHERE email = ?",
        [hashedPassword, email],

        (err2) => {

          if (err2) {
            console.error(err2);

            return res.status(500).send(
              "Password update failed"
            );
          }

          // UPDATE EMPLOYEE PASSCODE
          db.query(
            "UPDATE employees SET passcode = ? WHERE email = ?",
            [attendancePasscode, email],

            (err3) => {

              if (err3) {
                console.error(err3);

                return res.status(500).send(
                  "Employees update failed"
                );
              }

              // SEND EMAIL
              sendCredentialsEmail(
                email,
                loginPassword,
                attendancePasscode,

                (mailErr) => {

                  if (mailErr) {
                    console.error(mailErr);

                    return res.status(500).send(
                      "Email sending failed"
                    );
                  }

                  res.json({
                    success: true,
                    message:
                      "Credentials sent successfully"
                  });
                }
              );

            }
          );

        }
      );

    }
  );

};


//  LOGOUT CONTROLLER
exports.logout = (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).json({ success: false, message: "Logout failed" });
    }
    res.clearCookie("connect.sid"); // Optional: clear session cookie
    res.json({ success: true, message: "Logged out successfully" });
  });
};

//  SESSION CHECK CONTROLLER
exports.checkSession = (req, res) => {
  if (req.session && req.session.user) {
    res.json({
      loggedIn: true,
      user: req.session.user
    });
  } else {
    res.json({
      loggedIn: false,
    });
  }
};