const express = require("express");
const router = express.Router();

const {
  sendInvite,
  getRoles,
  getInterviewList,
  startExam,
  submitExam,
  viewInterview,
  updateDecision,
  deleteInterview
} = require("../controllers/interviewController");

// HR APIs
router.get("/roles", getRoles);
router.post("/interview/invite", sendInvite);
router.get("/interview/list", getInterviewList);
router.post("/decision", updateDecision);
router.post("/delete", deleteInterview);

// view button to see completed question paper 
router.get("/interview/view/:invite_id", viewInterview);

// Candidate APIs
router.get("/exam/start", startExam);
router.post("/exam/submit", submitExam);

module.exports = router;
