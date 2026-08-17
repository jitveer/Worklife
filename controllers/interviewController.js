const db = require("../db");
const crypto = require("crypto");
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

    const query = `
    INSERT INTO interview_invites
    (candidate_email, role_id, token, expires_at, status)
    VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE), 'Pending')
  `;

    db.query(query, [email, role_id, token], (err) => {
        if (err) return res.status(500).json(err);

        const examLink = `${process.env.BASE_URL}/questions.html?token=${token}`;

        // Get role name
        db.query(
            "SELECT role_name FROM roles WHERE role_id = ?",
            [role_id],
            (err, result) => {
                const roleName = result?.[0]?.role_name || "Selected Role";

                // SEND TEST EMAIL (ETHEREAL)
                sendInterviewInviteEmail(email, examLink, roleName);
            }
        );

        // console.log("Exam Link:", examLink);

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
      ii.decision
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
   START EXAM (CANDIDATE)
====================== */
exports.startExam = (req, res) => {
    const { token } = req.query;

    const inviteQuery = `
    SELECT ii.candidate_email, ii.role_id
    FROM interview_invites ii
    WHERE ii.token = ?
      AND ii.expires_at > NOW()
      AND ii.status = 'Pending'
  `;

    db.query(inviteQuery, [token], (err, result) => {
        if (err) return res.status(500).json(err);
        if (!result.length)
            return res.status(403).json({ message: "Link expired" });

        const { candidate_email, role_id } = result[0];

        db.query(
            "SELECT paper_content FROM question_papers WHERE role_id = ?",
            [role_id],
            (err, paper) => {
                if (err) return res.status(500).json(err);

                const questions = JSON.parse(paper[0].paper_content).map(q => ({
                    section: q.section,
                    question: q.question,
                    options: q.options
                }));

                res.json({
                    company: "MNM REALITY PVT LTD.",
                    email: candidate_email,
                    duration: 600,
                    paper: questions
                });
            }
        );
    });
};

/* ======================
   SUBMIT EXAM
====================== */
exports.submitExam = (req, res) => {
    const { token, answers } = req.body;

    const inviteQuery = `
    SELECT invite_id, role_id
    FROM interview_invites
    WHERE token = ? AND status = 'Pending'
  `;

    db.query(inviteQuery, [token], (err, invite) => {
        if (err) return res.status(500).json(err);
        if (!invite.length)
            return res.status(403).json({ message: "Already submitted" });

        const { invite_id, role_id } = invite[0];

        db.query(
            "SELECT paper_content FROM question_papers WHERE role_id = ?",
            [role_id],
            (err, paper) => {
                const questions = JSON.parse(paper[0].paper_content);

                let score = 0;
                questions.forEach((q, i) => {
                    if (parseInt(answers[i]) === q.answer) score++;
                });

                db.query(
                    `UPDATE interview_invites
     SET score = ?,
         answers = ?,
         status = 'Completed'
     WHERE invite_id = ?`,
                    [score, JSON.stringify(answers), invite_id],
                    (updateErr, result) => {

                        if (updateErr) {
                            console.error("❌ INTERVIEW UPDATE ERROR:", updateErr);

                            return res.status(500).json({
                                success: false,
                                message: "Failed to save exam result"
                            });
                        }
                        return res.json({
                            message: "Exam submitted",
                            score,
                            total: questions.length
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

        // Only completed interviews can be viewed
        if (row.status !== "Completed") {
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

        return res.json({
            invite_id: row.invite_id,
            candidate_email: row.candidate_email,
            role_name: row.role_name,
            score: row.score,
            questions: questions,
            answers: answers
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