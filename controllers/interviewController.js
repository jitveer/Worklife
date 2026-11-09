const db = require("../db");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { sendInterviewInviteEmail } = require("../services/mailer.js");
/* ======================
   GET ROLES
====================== */
exports.getRoles = (req, res) => {
    db.query("SELECT role_id, role_name FROM roles", (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });
};



/* ======================
   SEND INTERVIEW INVITE
====================== */
exports.sendInvite = (req, res) => {
    const { role_id, email } = req.body;

    if (!role_id || !email) {
        return res.status(400).json({ message: "Missing data" });
    }

    const token = crypto.randomBytes(16).toString("hex");

    // Link valid for 24 hours to begin exam; once started, duration is strictly 5 minutes
    const query = `
    INSERT INTO interview_invites
    (candidate_email, role_id, token, expires_at, status)
    VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR), 'Pending')
  `;

    db.query(query, [email, role_id, token], (err) => {
        if (err) return res.status(500).json(err);

        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
        const examLink = `${baseUrl}/questions.html?token=${token}`;

        // Get role name
        db.query(
            "SELECT role_name FROM roles WHERE role_id = ?",
            [role_id],
            (err, result) => {
                const roleName = result?.[0]?.role_name || "Selected Role";

                sendInterviewInviteEmail(email, examLink, roleName);
            }
        );

        res.json({ message: "Invite sent" });
    });
};



/* ======================
   INTERVIEW LIST (HR)
====================== */
exports.getInterviewList = (req, res) => {
    const query = `
    SELECT
      ii.invite_id,
      ii.candidate_email,
      r.role_name,
      ii.score,
      ii.status,
      ii.violation_reason,
      ii.decision,
      ii.created_at,
      ii.started_at
    FROM interview_invites ii
    JOIN roles r ON ii.role_id = r.role_id
    ORDER BY ii.created_at DESC
  `;

    db.query(query, (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });
};

/* ======================
   START EXAM (CANDIDATE INFO & PRE-FLIGHT)
====================== */
exports.startExam = (req, res) => {
    const { token } = req.query;

    const inviteQuery = `
    SELECT 
      ii.invite_id,
      ii.candidate_email, 
      ii.role_id,
      ii.started_at,
      ii.status,
      TIMESTAMPDIFF(SECOND, ii.started_at, NOW()) AS elapsed_seconds
    FROM interview_invites ii
    WHERE ii.token = ?
      AND ii.expires_at > NOW()
      AND ii.status = 'Pending'
  `;

    db.query(inviteQuery, [token], (err, result) => {
        if (err) return res.status(500).json(err);
        if (!result.length)
            return res.status(403).json({ message: "Link expired or already submitted" });

        const { candidate_email, role_id, started_at, elapsed_seconds } = result[0];
        const TOTAL_DURATION_SECONDS = 300; // STRICT 5 MINUTES

        // If candidate previously clicked Start and reloads/refreshes:
        let remainingSeconds = TOTAL_DURATION_SECONDS;
        let hasStarted = false;

        if (started_at) {
            hasStarted = true;
            remainingSeconds = TOTAL_DURATION_SECONDS - (elapsed_seconds || 0);

            if (remainingSeconds <= 0) {
                // Time ran out while page was closed
                db.query(
                    `UPDATE interview_invites 
                     SET status = 'Completed', score = 0, violation_reason = 'Time Expired (Closed/Away)' 
                     WHERE token = ?`,
                    [token]
                );
                return res.status(403).json({ message: "Exam time has expired" });
            }
        }

        db.query(
            "SELECT paper_content FROM question_papers WHERE role_id = ?",
            [role_id],
            (err, paper) => {
                if (err) return res.status(500).json(err);
                if (!paper.length || !paper[0].paper_content) {
                    return res.status(404).json({ message: "No question paper configured for this role. Please contact HR." });
                }

                try {
                    const questions = JSON.parse(paper[0].paper_content).map(q => ({
                        section: q.section,
                        question: q.question,
                        options: q.options
                    }));

                    res.json({
                        company: "MNM REALITY PVT LTD.",
                        email: candidate_email,
                        duration: remainingSeconds,
                        hasStarted: hasStarted,
                        totalDuration: TOTAL_DURATION_SECONDS,
                        paper: questions
                    });
                } catch (parseErr) {
                    return res.status(500).json({ message: "Error parsing question paper." });
                }
            }
        );
    });
};

/* ======================
   BEGIN EXAM (CANDIDATE CLICKS "START EXAM")
====================== */
exports.beginExam = (req, res) => {
    const { token } = req.body;

    if (!token) return res.status(400).json({ message: "Token missing" });

    const query = `
      UPDATE interview_invites
      SET started_at = COALESCE(started_at, NOW())
      WHERE token = ? AND status = 'Pending' AND expires_at > NOW()
    `;

    db.query(query, [token], (err, result) => {
        if (err) return res.status(500).json(err);
        if (result.affectedRows === 0) {
            return res.status(403).json({ message: "Cannot begin exam (invalid or expired token)" });
        }

        res.json({ success: true, message: "Exam begun", duration: 300 });
    });
};

/* ======================
   SUBMIT EXAM
====================== */
exports.submitExam = (req, res) => {
    const { token, answers, photos, violation_reason } = req.body;

    const inviteQuery = `
    SELECT invite_id, role_id
    FROM interview_invites
    WHERE token = ? AND status = 'Pending'
  `;

    db.query(inviteQuery, [token], (err, invite) => {
        if (err) return res.status(500).json(err);
        if (!invite.length)
            return res.status(403).json({ message: "Already submitted or invalid token" });

        const { invite_id, role_id } = invite[0];

        // Process & Save Proctoring Photos (Option A)
        let savedPhotoPaths = [];
        if (photos && Array.isArray(photos)) {
            const uploadDir = path.join(__dirname, "../uploads/proctoring");
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            photos.forEach((photoObj, idx) => {
                try {
                    const base64Data = typeof photoObj === "string" ? photoObj : photoObj.data;
                    const type = (photoObj && photoObj.type) ? photoObj.type : `snap_${idx}`;
                    const timestamp = (photoObj && photoObj.timestamp) ? photoObj.timestamp : new Date().toISOString();

                    if (base64Data && base64Data.includes("base64,")) {
                        const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
                        const filename = `snap_${invite_id}_${idx}_${Date.now()}.jpg`;
                        const fullPath = path.join(uploadDir, filename);

                        fs.writeFileSync(fullPath, Buffer.from(cleanBase64, "base64"));
                        savedPhotoPaths.push({
                            path: `/uploads/proctoring/${filename}`,
                            type: type,
                            timestamp: timestamp
                        });
                    }
                } catch (pErr) {
                    console.error("Error saving proctoring photo:", pErr);
                }
            });
        }

        db.query(
            "SELECT paper_content FROM question_papers WHERE role_id = ?",
            [role_id],
            (err, paper) => {
                if (err || !paper.length) return res.status(500).json({ message: "Paper load error" });

                const questions = JSON.parse(paper[0].paper_content);

                let score = 0;
                if (answers && Array.isArray(answers)) {
                    questions.forEach((q, i) => {
                        if (answers[i] !== null && answers[i] !== undefined && parseInt(answers[i]) === q.answer) {
                            score++;
                        }
                    });
                }

                const finalStatus = violation_reason ? "Terminated" : "Completed";

                db.query(
                    `UPDATE interview_invites
                     SET score = ?,
                         answers = ?,
                         proctoring_photos = ?,
                         violation_reason = ?,
                         status = ?
                     WHERE invite_id = ?`,
                    [
                        score, 
                        JSON.stringify(answers || []), 
                        JSON.stringify(savedPhotoPaths),
                        violation_reason || null,
                        finalStatus, 
                        invite_id
                    ],
                    (updateErr) => {
                        if (updateErr) {
                            console.error("❌ INTERVIEW UPDATE ERROR:", updateErr);
                            return res.status(500).json({
                                success: false,
                                message: "Failed to save exam result"
                            });
                        }
                        return res.json({
                            message: violation_reason ? "Exam terminated due to security violation" : "Exam submitted",
                            score,
                            total: questions.length,
                            violation: violation_reason || null
                        });
                    }
                );
            }
        );
    });
};







/* ======================
   VIEW COMPLETED INTERVIEW QUESTION PAPER
====================== */
exports.viewInterview = (req, res) => {

    const { invite_id } = req.params;

    const query = `
        SELECT
            ii.invite_id,
            ii.candidate_email,
            ii.role_id,
            ii.score,
            ii.status,
            ii.answers,
            ii.proctoring_photos,
            ii.violation_reason,
            r.role_name,
            qp.paper_content
        FROM interview_invites ii
        JOIN roles r
            ON ii.role_id = r.role_id
        JOIN question_papers qp
            ON ii.role_id = qp.role_id
        WHERE ii.invite_id = ?
    `;

    db.query(query, [invite_id], (err, rows) => {

        if (err) {
            console.error("View interview error:", err);

            return res.status(500).json({
                message: "Failed to load interview"
            });
        }

        if (!rows.length) {
            return res.status(404).json({
                message: "Interview not found"
            });
        }

        const row = rows[0];

        // Allow viewing if Completed or Terminated
        if (row.status !== "Completed" && row.status !== "Terminated") {
            return res.status(403).json({
                message: "Interview is not completed yet"
            });
        }

        const questions = JSON.parse(row.paper_content);

        let answers = [];

        if (row.answers) {
            if (typeof row.answers === "string") {
                try {
                    answers = JSON.parse(row.answers);
                } catch (error) {
                    console.error("Invalid answers data:", row.answers);

                    answers = row.answers
                        .split(",")
                        .map(answer => answer.trim());
                }
            } else {
                answers = row.answers;
            }
        }

        let photos = [];
        if (row.proctoring_photos) {
            try {
                photos = typeof row.proctoring_photos === "string" ? JSON.parse(row.proctoring_photos) : row.proctoring_photos;
            } catch (pErr) {
                photos = [];
            }
        }

        return res.json({
            invite_id: row.invite_id,
            candidate_email: row.candidate_email,
            role_name: row.role_name,
            score: row.score,
            status: row.status,
            violation_reason: row.violation_reason,
            questions: questions,
            answers: answers,
            photos: photos
        });
    });
};






/* ======================
   UPDATE DECISION (HR)
====================== */
exports.updateDecision = (req, res) => {
    const { invite_id, decision } = req.body;

    if (!invite_id || !decision) {
        return res.status(400).json({ message: "Missing data" });
    }

    // Prevent changing decision again
    const checkQuery = `
      SELECT decision
      FROM interview_invites
      WHERE invite_id = ?
    `;

    db.query(checkQuery, [invite_id], (err, rows) => {
        if (err) return res.status(500).json(err);

        if (rows[0].decision !== null) {
            return res.status(403).json({
                message: "Decision already made"
            });
        }

        // Update decision
        const updateQuery = `
          UPDATE interview_invites
          SET decision = ?
          WHERE invite_id = ?
        `;

        db.query(updateQuery, [decision, invite_id], err => {
            if (err) return res.status(500).json(err);

            res.json({ message: "Decision updated successfully" });
        });
    });
};




/* ======================
   DELETE INTERVIEW INVITE
====================== */
exports.deleteInterview = (req, res) => {
    const { invite_id } = req.body;

    if (!invite_id) {
        return res.status(400).json({ message: "Invite ID missing" });
    }

    const query = `
      DELETE FROM interview_invites
      WHERE invite_id = ?
    `;

    db.query(query, [invite_id], err => {
        if (err) return res.status(500).json(err);

        res.json({ message: "Interview deleted successfully" });
    });
};