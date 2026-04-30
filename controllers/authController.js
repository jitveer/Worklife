const db = require("../db");
const bcrypt = require("bcrypt");
const crypto = require("crypto"); 
const { sendPasscodeEmail } = require("../services/mailer");

function generate4DigitPassword() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function md5(password) {
  return crypto.createHash("md5").update(password).digest("hex");
}

exports.login = (req, res) => {
  const { company, role, email, password } = req.body;

  const sql = `
    SELECT * FROM users 
    WHERE email = ? AND company_id = ? AND role_id = ?
  `;

  db.query(sql, [email, company, role], async (err, results) => {
    if (err) {
      console.error("DB Error:", err.message);
      return res.status(500).json({ success: false, message: "Server error" });
    }

    if (results.length === 0) {
      return res.json({ success: false, message: "Invalid credentials." });
    }

    const user = results[0];

    // 🔄 STEP 1: check if old MD5 password
    if (user.password.length === 32) {
      // old MD5
      if (md5(password) === user.password) {
        // ✅ convert to bcrypt
        const newHash = await bcrypt.hash(password, 10);
        db.query("UPDATE users SET password=? WHERE id=?", [newHash, user.id]);

        console.log("Password upgraded to bcrypt");
      } else {
        return res.json({ success: false, message: "Invalid credentials." });
      }
    }

    // ✅ bcrypt compare (THIS IS MAIN CHANGE)
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.json({ success: false, message: "Invalid credentials." });
    }

    // session
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
  const plainPassword = generate4DigitPassword();

  const hashedPassword = await bcrypt.hash(plainPassword, 10);

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

      res.send("User created successfully!");
    });
  });
};


// mail the password by clicking send button in emplyee-list page 
// Send 4-digit passcode to user
exports.sendUserPasscode = async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ message: "Email required" });

  // Check if user exists in users table
  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
    if (err) return res.status(500).send("DB error");
    if (results.length === 0) return res.status(404).send("User not found");

    // ✅ Generate new 4-digit password
    const plainPassword = generate4DigitPassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    // ✅ Update the password column in users table only
    db.query(
      "UPDATE users SET password = ? WHERE email = ?",
      [hashedPassword, email],
      (err2) => {
        if (err2) {
          console.error("Password update error:", err2);
          return res.status(500).send("Password update failed");
        }

        //  3. ALSO update EMPLOYEES table (NEW)
        db.query(
          "UPDATE employees SET passcode = ? WHERE email = ?",
          [hashedPassword, email], // store hashed
          (err3) => {
            if (err3) {
              console.error("Employees update error:", err3);
              return res.status(500).send("Employees update failed");
            }


            // ✅ Send the plain 4-digit password via email
            sendPasscodeEmail(email, plainPassword, (err3, info) => {
              if (err3) {
                console.error("Email sending error:", err3);
                return res.status(500).send("Email sending failed");
              }

              //console.log(`4-digit passcode sent to ${email}: ${plainPassword}`);
              res.json({ success: true, message: "Passcode sent to email" });
            });
          });
      }
    );
  });
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