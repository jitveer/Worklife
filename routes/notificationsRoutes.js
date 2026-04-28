const express = require('express');
const router = express.Router();
const db = require('../db');

// Get all notifications for logged-in user
router.get("/", (req, res) => {
  const email = req.session.user?.email; // safer than query param
  if (!email) return res.status(401).json({ message: "Not logged in" });

  db.query(
    "SELECT * FROM notifications WHERE email = ? ORDER BY created_at DESC LIMIT 50",
    [email],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "DB error" });
      res.json({ notifications: rows });
    }
  );
});

// Mark as read
router.put("/:id/read", (req, res) => {
  const notifId = req.params.id;
  const email = req.session.user?.email;
  if (!email) return res.status(401).json({ message: "Not logged in" });

  // Make sure it belongs to the user
  db.query(
    "UPDATE notifications SET status = 'read' WHERE id = ? AND email = ?",
    [notifId, email],
    (err, result) => {
      if (err) return res.status(500).json({ message: "DB error" });
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Notification not found or not yours" });
      }
      res.json({ message: "Notification marked as read" });
    }
  );
});

// Delete notification
router.delete("/:id", (req, res) => {
  const notifId = req.params.id;
  const email = req.session.user?.email;
  if (!email) return res.status(401).json({ message: "Not logged in" });

  db.query(
    "DELETE FROM notifications WHERE id = ? AND email = ?",
    [notifId, email],
    (err, result) => {
      if (err) return res.status(500).json({ message: "DB error" });
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Notification not found or not yours" });
      }
      res.json({ message: "Notification deleted" });
    }
  );
});

module.exports = router;
