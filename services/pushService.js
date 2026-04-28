const db = require("../db");
const webpush = require("../utils/webpush"); // ✅ FIXED

function sendNotificationToUser(email, message, link) {
  db.query(
    "SELECT * FROM push_subscriptions WHERE email = ?",
    [email],
    async (err, rows) => {

      if (err) {
        console.error("DB Error:", err);
        return;
      }

      if (!rows.length) {
        console.log("No subscriptions found");
        return;
      }

      const payload = JSON.stringify({
        title: "🔔 Notification",
        body: message,
        url: link
      });

      for (const row of rows) {
        const subscription = JSON.parse(row.subscription);

        try {
          await webpush.sendNotification(subscription, payload);
        } catch (err) {
          console.error("Push Error:", err);
        }
      }
    }
  );
}

module.exports = { sendNotificationToUser };