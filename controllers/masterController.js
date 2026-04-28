const db = require("../db");

// Mapping for table names & column names
const masterConfig = {
    company: {
        table: "company_name",
        column: "company_name"
    },
    department: {
        table: "department",
        column: "department_name"
    },
    manager: {
        table: "line_managers",
        column: "name"
    },
    projects: {
        table: "projects",
        column: "project_name"
    },
    typo: {
        table: "typo",
        column: "typo_name"
    },
    status: {
        table: "project_status",
        column: "status_name"
    },
    role: {
        table: "user_role",
        column: "role"
    },
    "certificate-type": {
    table: "certificate_types",
    column: "type"
}
};



// GET master list
exports.getMasterList = (req, res) => {
    const type = req.params.type;

    if (!masterConfig[type]) {
        return res.status(400).json({ success: false, message: "Invalid master type" });
    }

    const { table, column } = masterConfig[type];

    const sql = `SELECT id, ${column} AS name FROM ${table} ORDER BY id DESC`;

    db.query(sql, (err, rows) => {
        if (err) {
            console.log("Master fetch error:", err);
            return res.status(500).json({ success: false });
        }
        res.json(rows);
    });
};

// 🔹 ADD RECORD
exports.addMaster = (req, res) => {
    const type = req.params.type;
    const { name } = req.body;

    if (!name) return res.status(400).json({ success: false, message: "Name required" });

    const { table, column } = masterConfig[type];

    db.query(
        `INSERT INTO ${table} (${column}) VALUES (?)`,
        [name],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, error: err });
            res.json({ success: true, id: result.insertId });
        }
    );
};

// 🔹 EDIT RECORD
exports.updateMaster = (req, res) => {
    const type = req.params.type;
    const { id } = req.params;
    const { name } = req.body;

    const { table, column } = masterConfig[type];

    db.query(
        `UPDATE ${table} SET ${column} = ? WHERE id = ?`,
        [name, id],
        (err) => {
            if (err) return res.status(500).json({ success: false, error: err });
            res.json({ success: true });
        }
    );
};

// 🔹 DELETE RECORD
exports.deleteMaster = (req, res) => {
    const type = req.params.type;
    const { id } = req.params;

    const { table } = masterConfig[type];

    db.query(
        `DELETE FROM ${table} WHERE id = ?`,
        [id],
        (err) => {
            if (err) return res.status(500).json({ success: false, error: err });
            res.json({ success: true });
        }
    );
};

