const db = require("../db");

// ===============================
// GET ALL POLICIES
// ===============================
exports.getPolicies = (req, res) => {
    const sql = `
    SELECT
      id,
      title,
      description,
      file_name,
      file_path,
      file_size,
      created_at
    FROM company_policies
    ORDER BY id DESC
  `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Get policies error:", err);

            return res.status(500).json({
                success: false,
                message: "Failed to fetch policies."
            });
        }

        return res.json({
            success: true,
            policies: results
        });
    });
};


// ===============================
// ADD NEW POLICY
// ===============================
exports.addPolicy = (req, res) => {
    const { title, description } = req.body;

    // Check title and description
    if (!title || !title.trim() || !description || !description.trim()) {
        return res.status(400).json({
            success: false,
            message: "Policy title and description are required."
        });
    }

    // Check uploaded PDF
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: "Please upload a PDF policy document."
        });
    }

    // Make sure uploaded file is PDF
    if (req.file.mimetype !== "application/pdf") {
        return res.status(400).json({
            success: false,
            message: "Only PDF files are allowed."
        });
    }

    const fileName = req.file.originalname;
    const filePath = "/uploads/policy_files/" + req.file.filename;
    const fileSize = req.file.size;

    const sql = `
    INSERT INTO company_policies
    (
      title,
      description,
      file_name,
      file_path,
      file_size,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, NOW())
  `;

    db.query(
        sql,
        [
            title.trim(),
            description.trim(),
            fileName,
            filePath,
            fileSize
        ],
        (err, result) => {
            if (err) {
                console.error("Add policy error:", err);

                return res.status(500).json({
                    success: false,
                    message: "Failed to save policy."
                });
            }

            return res.status(201).json({
                success: true,
                message: "Policy added successfully.",
                policyId: result.insertId
            });
        }
    );
};


// ===============================
// DELETE POLICY
// ===============================
exports.deletePolicy = (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({
            success: false,
            message: "Policy ID is required."
        });
    }

    const sql = `
    DELETE FROM company_policies
    WHERE id = ?
  `;

    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error("Delete policy error:", err);

            return res.status(500).json({
                success: false,
                message: "Failed to delete policy."
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Policy not found."
            });
        }

        return res.json({
            success: true,
            message: "Policy deleted successfully."
        });
    });
};