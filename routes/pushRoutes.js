const express = require("express");
const router = express.Router();
const db = require("../db");

router.post("/subscribe", (req, res) => {
  const { email, subscription } = req.body;

  db.query(
    "SELECT * FROM push_subscriptions WHERE email = ?",
    [email],
    (err, rows) => {
      if (err) return res.status(500).send("Error");

      if (rows.length > 0) {
        db.query(
          "UPDATE push_subscriptions SET subscription = ? WHERE email = ?",
          [JSON.stringify(subscription), email],
          (err2) => {
            if (err2) return res.status(500).send("Error");

            return res.json({ message: "Updated subscription" });
          }
        );
      } else {
        db.query(
          "INSERT INTO push_subscriptions (email, subscription) VALUES (?, ?)",
          [email, JSON.stringify(subscription)],
          (err3) => {
            if (err3) return res.status(500).send("Error");

            res.json({ message: "Subscribed successfully" });
          }
        );
      }
    }
  );
});

module.exports = router;