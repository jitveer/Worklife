const express = require("express");
const router = express.Router();
const certificateController = require("../controllers/certificateController");

router.get("/personalinfo", certificateController.getCertificatePersonalInfo);
router.get("/dropdown", certificateController.getEmployeeDropdown);
router.get("/types", certificateController.getCertificateTypes);
router.post("/submit", certificateController.submitCertificateRequest);
router.get("/details/:reqNo", certificateController.getCertificateDetails);
router.put("/update-status", certificateController.updateCertificateStatus);
// Certificate list with filters
router.get("/list", certificateController.getCertificateList);
// Employee - My certificate requests
router.get("/my-requests", certificateController.getMyCertificateRequests);

module.exports = router;
