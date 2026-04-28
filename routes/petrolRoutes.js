const db = require('../db');
const express = require('express');
const router = express.Router();
const petrolController = require('../controllers/petrolController');

// Route to get personal info and generated petrol req_no
router.get('/personalinfo', petrolController.getPersonalInfo);

router.post("/submit", petrolController.createPetrolClaim);

router.post('/approval/update', petrolController.updatePetrolApproval);
// A-table
router.get('/claims', petrolController.getPetrolApprovals);

// A-popup
router.get("/claims/:req_no", petrolController.getPetrolClaimByReqNo);

router.get("/my-claims", petrolController.getMyPetrolClaims);

router.get("/track/:reqNo", petrolController.trackPetrolApproval);


module.exports = router;
