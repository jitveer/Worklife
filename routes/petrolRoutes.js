const db = require('../db');
const express = require('express');
const router = express.Router();
const petrolController = require('../controllers/petrolController');
const upload = require("../uploadConfig");
const uploadPetrol = upload("petrol_files");

// Route to get personal info and generated petrol req_no
router.get('/personalinfo', petrolController.getPersonalInfo);

router.post("/submit", uploadPetrol.array("petrolAttachment"), petrolController.createPetrolClaim);

router.post('/approval/update', petrolController.updatePetrolApproval);
// A-table
router.get('/claims', petrolController.getPetrolApprovals);

// A-popup
router.get("/claims/:req_no", petrolController.getPetrolClaimByReqNo);

router.get("/my-claims", petrolController.getMyPetrolClaims);

router.get("/track/:reqNo", petrolController.trackPetrolApproval);

// updates done by approver to employee data
router.post("/update", uploadPetrol.array("petrolAttachment"), petrolController.updatePetrolClaim);

module.exports = router;
