const cron = require("node-cron");
const db = require("../db"); // your MySQL connection

// Function to send notifications for appraisal stages
function sendStageNotifications() {
    const now = new Date();
    const nowHM = now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
    const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

    const sql = `
        SELECT a.id AS appraisalId, a.employee_id, e.email,
               a.start_date, a.mid_year_due, a.full_year_due,
               a.start_notified, a.mid_notified, a.full_notified
        FROM appraisals a
        JOIN employees e ON e.id = a.employee_id
        WHERE (DATE(a.start_date) = ? AND a.start_notified = 0)
           OR (DATE(a.mid_year_due) = ? AND a.mid_notified = 0)
           OR (DATE(a.full_year_due) = ? AND a.full_notified = 0)
    `;

    db.query(sql, [today, today, today], (err, rows) => {
        if (err) return console.error("DB error in cron:", err);

        rows.forEach((r) => {
            let stage = null;

            // Compare date & time (minute precision)
            const startHM = r.start_date.toISOString().slice(0, 16);
            const midHM = r.mid_year_due.toISOString().slice(0, 16);
            const fullHM = r.full_year_due.toISOString().slice(0, 16);

            if (nowHM === startHM && r.start_notified === 0) stage = "start_stage";
            else if (nowHM === midHM && r.mid_notified === 0) stage = "mid_stage";
            else if (nowHM === fullHM && r.full_notified === 0) stage = "full_stage";

            if (!stage) return;

            const message = `⏳ It's time to fill your ${stage.replace("_", " ")}`;
            const link = `performance.html?id=${r.appraisalId}&stage=${stage}`;

            // Prevent duplicate notifications in notifications table
            const checkSql = "SELECT id FROM notifications WHERE email=? AND link=? LIMIT 1";
            db.query(checkSql, [r.email, link], (errCheck, existing) => {
                if (errCheck) return console.error(errCheck);

                if (existing.length === 0) {
                    const insertSql = `
                        INSERT INTO notifications (email, message, link, status, created_at, updated_at)
                        VALUES (?, ?, ?, 'unread', NOW(), NOW())
                    `;
                    db.query(insertSql, [r.email, message, link], (errInsert) => {
                        if (errInsert) return console.error("Insert notif error:", errInsert);
                        console.log(`✅ Notification sent to ${r.email} for ${stage}`);

                        // Update the corresponding notified column
                        let updateSql = "";
                        if (stage === "start_stage") updateSql = "UPDATE appraisals SET start_notified = 1 WHERE id = ?";
                        else if (stage === "mid_stage") updateSql = "UPDATE appraisals SET mid_notified = 1 WHERE id = ?";
                        else if (stage === "full_stage") updateSql = "UPDATE appraisals SET full_notified = 1 WHERE id = ?";

                        db.query(updateSql, [r.appraisalId], (errUpdate) => {
                            if (errUpdate) console.error("Update notified error:", errUpdate);
                        });
                    });
                }
            });
        });
    });
}

// Schedule the cron job
function startCronJobs() {
    // For testing: every 5 minutes
    cron.schedule("* * * * *", () => {
        console.log("🔹 Running appraisal stage notifications cron...");
        sendStageNotifications();
    });

    // Production: every day at 9 AM
    // cron.schedule("0 9 * * *", sendStageNotifications);
}

module.exports = { startCronJobs };
