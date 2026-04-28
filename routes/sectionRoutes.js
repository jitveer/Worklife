const express = require("express");
const router = express.Router();
const sectionController = require("../controllers/sectionController");

// Manual Start Appraisal (optional)
router.post("/appraisals/start", sectionController.startAppraisal);
router.get("/personalinfo", sectionController.getPersonalInfo);

// employee routes
router.post("/submit-start-stage", sectionController.submitStartStage);
router.get("/my-performance-requests", sectionController.getMyPerformanceRequests);
router.get("/performance/requests/:id", sectionController.getPerformanceRequestById);
router.get("/performance/requests/:id/approvals", sectionController.trackPerformanceApproval);
router.post("/submit-mid-stage", sectionController.submitMidStage);
// router.get("/employee/full-stage/:appraisalId", sectionController.getFullStageForEmployee);
// Full Stage Prefill for an employee
router.get("/employee/full-stage-prefill/:appraisalId", sectionController.getFullStagePrefill);
router.get("/evaluation-summary/:appraisalId", sectionController.getEvaluationSummary);
router.post("/employee/submit-full-stage", sectionController.submitFullStage);

// approver routes
router.get("/appraisals/stage-info", sectionController.getStageDetails);
router.post("/appraisals/start-stage/update-fields", sectionController.updateStartStageFields);
router.post("/appraisals/mid-stage/update-fields", sectionController.updateMidStageFields);
//start_stage
router.post("/appraisals/start-stage/approve", (req, res) => {
  req.body.status = "Approved";
  sectionController.updateAppraisalStatus(req, res);
});

router.post("/appraisals/start-stage/reject", (req, res) => {
  req.body.status = "Rejected";
  sectionController.updateAppraisalStatus(req, res);
});
// Mid-stage approval
router.post("/appraisals/mid-stage/approve", (req, res) => {
  req.body.status = "Approved";
  sectionController.updateMidStageStatus(req, res);
});

router.post("/appraisals/mid-stage/reject", (req, res) => {
  req.body.status = "Rejected";
  sectionController.updateMidStageStatus(req, res);
});

router.post("/appraisals/full-stage/update-fields", sectionController.updateFullStageFields);

// ✅ Approve Full Stage
router.post("/appraisals/full-stage/approve", (req, res) => {
  req.body.status = "Approved";
  sectionController.updateFullStageStatus(req, res);
});

// ✅ Reject Full Stage
router.post("/appraisals/full-stage/reject", (req, res) => {
  req.body.status = "Rejected";
  sectionController.updateFullStageStatus(req, res);
});

router.get("/approvals/list", sectionController.getPerformanceApprovalsList);

// delete
router.post("/appraisals/start-stage/delete-item", sectionController.deleteStartItem);


module.exports = router;






