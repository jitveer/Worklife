const db = require('../db');
const crypto = require("crypto");

function hashPassword(password) {
  return crypto.createHash("md5").update(password).digest("hex");
}


exports.getAllUsers = (req, res) => {
  const sql = `
    SELECT 
      u.id, 
      CONCAT(u.first_name, ' ', u.last_name) AS username, 
      u.email, 
      u.role_id AS role, 
      d.department_name, 
      c.company_name
    FROM users u
    LEFT JOIN department d ON u.department_id = d.id
    LEFT JOIN company_name c ON u.company_id = c.id
    ORDER BY u.id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: "Database error while fetching users" });
    res.json(results);
  });
};

exports.getUserById = (req, res) => {
  const id = req.params.id;

  const sql = `
    SELECT 
      u.id,
      CONCAT(u.first_name, ' ', u.last_name) AS name,
      u.email,
      u.password,
      u.employee_id,
      u.role_id,
      r.role AS role_name,
      c.company_name,
      d.department_name
    FROM users u
    LEFT JOIN user_role r ON u.role_id = r.id
    LEFT JOIN company_name c ON u.company_id = c.id
    LEFT JOIN department d ON u.department_id = d.id
    WHERE u.id = ?;
  `;

  db.query(sql, [id], (err, results) => {
    if (err) return res.status(500).json({ error: "User fetch error" });
    if (results.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(results[0]);
  });
};


// exports.updateUser = (req, res) => {
//   const id = req.params.id;
//   const data = req.body;

//   db.query("UPDATE users SET ? WHERE id = ?", [data, id], (err) => {
//     if (err) return res.status(500).send("Failed to update user");
//     res.send("User updated successfully");
//   });
// };



exports.updateUser = (req, res) => {
  const id = req.params.id;
  const { password, ...otherFields } = req.body;

  let updatedFields = { ...otherFields };

  // Check if password is provided and not empty
  if (password && password.trim() !== "") {
    updatedFields.password = hashPassword(password);
  }

  db.query("UPDATE users SET ? WHERE id = ?", [updatedFields, id], (err) => {
    if (err) return res.status(500).send("Failed to update user");
    res.send("User updated successfully");
  });
};


exports.deleteUser = (req, res) => {
  const id = req.params.id;
  db.query("DELETE FROM users WHERE id = ?", [id], (err) => {
    if (err) return res.status(500).send("Failed to delete user");
    res.send("User deleted successfully");
  });
};


exports.sendUserPasscode = (req, res) => {
  const id = req.params.id;

  db.query("SELECT email FROM users WHERE id = ?", [id], (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).send("User email not found");
    }

    const email = results[0].email;
    const passcode = Math.floor(100000 + Math.random() * 900000);

    // You would replace this with actual email sending logic (e.g. nodemailer)
    console.log(`Passcode ${passcode} sent to ${email}`);

    res.json({ message: `Passcode ${passcode} sent to ${email}` });
  });
};
