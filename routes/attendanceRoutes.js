const express = require("express");
const router = express.Router();

const attendanceController = require("../controllers/attendanceController");
const upload = require("../middlewares/selfie");

/* ---------- PASSCODE ---------- */
router.get("/passcode", attendanceController.showPasscode);
router.post("/verify-passcode", attendanceController.verifyPasscode);

/* ---------- LOGIN OPTIONS ---------- */
router.get("/login-options", attendanceController.loginOptions);

/* ---------- OFFICE LOGIN ---------- */
router.post("/office-login", attendanceController.officeLogin);

/* ---------- SITE LOGIN ---------- */
router.get("/site-login", attendanceController.siteLoginPage);
router.post(
  "/site-login",
  upload.single("selfie"), 
  attendanceController.siteLogin
);

/*---------- total working hours and minutes----------*/
router.get("/today-working-time", attendanceController.getTodayWorkingTime);

/* ---------- SUCCESS ---------- */
router.get("/success", attendanceController.successPage);

router.get("/logout", attendanceController.logout);

router.post("/emergency-logout", attendanceController.emergencyLogout);

/* ---------- FETCH ATTENDANCE FOR HR ---------- */
router.get("/attendance", attendanceController.getAttendance);

router.get("/download", attendanceController.downloadReport);

module.exports = router;
