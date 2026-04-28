const express = require("express");
const router = express.Router();
const db = require("../db");

router.post("/save-token", async (req, res) => {
  const { employee_id, token } = req.body;

  const sql = "UPDATE employees SET fcm_token = ? WHERE employee_id = ?";
  db.query(sql, [token, employee_id], (err) => {
    if (err) return res.status(500).send("DB error");
    res.send("Token saved");
  });
});

module.exports = router;
