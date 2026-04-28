const db = require('../db');


// 1 Notifications
exports.getNotifications = (req, res) => {
  const email = req.query.email;

  const sql = `
    SELECT n.id, n.link, lr.requester_name, lr.requester_email
    FROM notifications n
    JOIN leave_requests lr ON n.leave_id = lr.id
    WHERE n.receiver_email = ?
    AND lr.requester_email != ?
  `;

  db.query(sql, [email, email], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "DB error" });
    }

    const result = rows.map(r => ({
      message: `Leave request from ${r.requester_name}`,
      link: r.link
    }));

    res.json(result);
  });
};

exports.getDashboardTiles = (req, res) => {
  // Example: You can run a query here or just test with dummy data
  res.json({
    tasks: 5,
    requests: 2,
    attendance: 1
  });
};




exports.addCalendarEvent = (req, res) => {
  const { event_date, title } = req.body;
  const image = req.file ? req.file.filename : null;

  const sql = `
    INSERT INTO calendar_events (event_date, title, image, created_by)
    VALUES (?, ?, ?, 1)
  `;

  db.query(sql, [event_date, title, image], (err) => {
    if (err) return res.status(500).json(err);
    res.json({ success: true });
  });
};

exports.getCalendarEvents = (req, res) => {
  const sql = `
    SELECT DATE_FORMAT(event_date, '%Y-%m-%d') AS event_date
    FROM calendar_events
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
};

exports.getEventByDate = (req, res) => {
  db.query(
    "SELECT * FROM calendar_events WHERE event_date=?",
    [req.params.date],
    (err, rows) => {
      if (err) return res.status(500).json(err);
      res.json(rows[0]);
    }
  );
};

