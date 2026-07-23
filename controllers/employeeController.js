const db = require('../db');
const sectionController = require('./sectionController'); // performance

const crypto = require("crypto");
const { sendEmployeeFormEmail } = require("../services/mailer.js");

function generateRandomEmployeeId() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

exports.addEmployee = (req, res) => {
  const data = req.body;
  delete data.database;

  // console.log("Incoming data:", data);


  // generate 4 digit random employee id 
  const generateUniqueEmployeeId = (callback) => {
    const employeeId = generateRandomEmployeeId();

    db.query(
      "SELECT id FROM employees WHERE employee_id = ?",
      [employeeId],
      (err, results) => {
        if (err) return callback(err);

        if (results.length > 0) {
          // Already exists, generate another
          return generateUniqueEmployeeId(callback);
        }

        callback(null, employeeId);
      }
    );
  };

  generateUniqueEmployeeId((err, newEmployeeId) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Error generating Employee ID");
    }

    const sql = `
    INSERT INTO employees (
      passcode, first_name, middle_name, last_name, employee_id,
      line_manager_id, company_id, role_id,
      department_id, designation, email, adhar_number, pan_number,
      mobile, dob, doj, gender, blood_group, marital_status,
      pincode, present_address, permanent_address,
      permanent_country_name, permanent_state_name, permanent_city_name,
      emergency_contact_name, emergency_contact_number, emergency_contact_relationship,
      password, badge_count, notification_message, unread, token, image, islogged_in
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

    const values = [
      data.passcode,
      data.first_name,
      data.middle_name,
      data.last_name,
      newEmployeeId,   // Random unique 4-digit ID
      data.line_manager_id || null,
      data.company_id,
      data.role_id,
      data.department_id,
      data.designation,
      data.email,
      data.adhar_number,
      data.pan_number,
      data.mobile,
      data.dob,
      data.doj,
      data.gender,
      data.blood_group,
      data.marital_status,
      data.pincode,
      data.present_address,
      data.permanent_address,
      data.permanent_country_name,
      data.permanent_state_name,
      data.permanent_city_name,
      data.emergency_contact_name,
      data.emergency_contact_number,
      data.emergency_contact_relationship,
      data.password,
      data.badge_count,
      data.notification_message,
      data.unread,
      data.token,
      data.image,
      data.islogged_in
    ];

    db.query(sql, values, (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Internal Server Error");
      }

      const newDbId = result.insertId;

      sectionController.createInitialAppraisal(newDbId, (err2, appraisalId) => {
        if (err2) {
          return res.status(500).send("Employee saved, but appraisal creation failed.");
        }

        res.json({
          success: true,
          message: "Employee added successfully and appraisal started.",
          employeeId: newDbId,
          appraisalId
        });
      });
    });
  });
};


// fetch employees and show in frontend  
exports.getEmployees = (req, res) => {

  const sql = `
    SELECT 
      e.*,
      d.department_name AS departmentName
    FROM 
      employees e
    LEFT JOIN 
      department d ON e.department_id = d.id
      WHERE e.is_deleted = 0
    ORDER BY e.id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Database fetch error:", err);
      return res.status(500).send("Database fetch error");
    }
    res.json(results);
  });
};


// trash records
exports.getTrashEmployees = (req, res) => {

  const sql = `
    SELECT
      e.*,
      d.department_name AS departmentName
    FROM employees e
    LEFT JOIN department d
      ON e.department_id = d.id
    WHERE e.is_deleted = 1
    ORDER BY e.id DESC
  `;

  db.query(sql, (err, results) => {

    if (err) {
      return res.status(500).send("Database error");
    }

    res.json(results);
  });
};



// if deleted by mistake restore back to table 
exports.restoreEmployee = (req, res) => {
  const id = req.params.id;

  db.query(
    "UPDATE employees SET is_deleted = 0 WHERE id = ?",
    [id],
    (err, result) => {

      if (err) {
        return res.status(500).send("Restore failed");
      }

      res.send("Employee restored successfully");
    }
  );
};



exports.getEmployeeById = (req, res) => {
  const id = req.params.id;
  db.query("SELECT * FROM employees WHERE id = ?", [id], (err, results) => {
    if (err) return res.status(500).send("Error");
    res.json(results[0]);
  });
};


//company
exports.getAllCompanies = (req, res) => {
  // console.log("getAllCompanies route hit");
  db.query("SELECT id, company_name FROM company_name", (err, results) => {
    if (err) {
      console.error("Company fetch error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    // console.log("Company query results:", results);
    res.json(results);
  });
};


//Role
exports.getAllRoles = (req, res) => {
  // console.log("getAllRoles route hit");
  db.query("SELECT id, role FROM user_role", (err, results) => {
    if (err) {
      console.error("Role fetch error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    // console.log("Role query results:", results);
    res.json(results);
  });
};

// line manager
exports.getAllLineManagers = (req, res) => {
  // console.log("getAllLineManagers route hit");

  const sql = `SELECT id, name FROM line_managers`;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Line managers fetch error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    // console.log("Line managers query results:", results);

    res.json(results);
  });
};

//department
exports.getAllDepartment = (req, res) => {
  // console.log(" getAllDepartment route hit");

  db.query("SELECT * FROM department", (err, results) => {
    if (err) {
      console.error(" Department fetch error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    // console.log(" Department query results:", results);

    // Always return valid JSON array
    res.json(results);
  });
};


exports.updateEmployee = (req, res) => {
  const id = req.params.id;

  db.query(
    "UPDATE employees SET ? WHERE id = ?",
    [req.body, id],
    (err) => {
      if (err) {
        console.log(err);
        return res.status(500).send("Update failed");
      }

      res.json({
        success: true,
        message: "Employee updated successfully"
      });
    }
  );
};
// exports.deleteEmployee = (req, res) => {
//   const id = req.params.id;
//   db.query("DELETE FROM employees WHERE id = ?", [id], (err) => {
//     if (err) return res.status(500).send("Failed to delete employee.");
//     res.send("Employee deleted successfully.");
//   });
// };


exports.deleteEmployee = (req, res) => {
  const id = req.params.id;

  db.query(
    "UPDATE employees SET is_deleted = 1 WHERE id = ?",
    [id],
    (err) => {
      if (err) {
        return res.status(500).send("Failed to move employee to trash.");
      }

      res.send("Employee moved to trash successfully.");
    }
  );
};


exports.getCompanyDeptRoleNames = (req, res) => {
  const { department_id, company_id, role_id } = req.body;

  if (!department_id || !company_id || !role_id) {
    return res.status(400).json({ message: "All IDs are required" });
  }

  const sql = `
    SELECT 
      c.company_name,
      d.department_name,
      r.role
    FROM company_name c, department d, user_role r
    WHERE c.id = ? AND d.id = ? AND r.id = ?
  `;

  db.query(sql, [company_id, department_id, role_id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "No match found" });
    }

    res.status(200).json(results[0]);
  });
}



// send mail to fill form
exports.sendEmployeeFormLink = (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required"
    });
  }

  // Generate token (can be used later for validation)
  const token = crypto.randomBytes(16).toString("hex");

  // SAME PAGE link + auto-open form
  const formLink = `${process.env.BASE_URL}/employee-form.html?openForm=1&token=${token}`;

  // Send email
  sendEmployeeFormEmail(email, formLink);

  res.json({
    success: true,
    message: "Employee form link sent successfully"
  });
};