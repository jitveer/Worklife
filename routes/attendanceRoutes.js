const express = require("express");
const router = express.Router();

const attendanceController = require("../controllers/attendanceController");
const upload = require("../middlewares/selfie");

const attendanceAuth = require("../middlewares/attendanceAuth");

/* ---------- PASSCODE ---------- */
router.get("/passcode", attendanceController.showPasscode);
router.post("/verify-passcode", attendanceController.verifyPasscode);

/* ---------- LOGIN OPTIONS ---------- */
router.get("/login-options", attendanceAuth, attendanceController.loginOptions);

/* ---------- OFFICE LOGIN ---------- */
router.post("/office-login", attendanceAuth, attendanceController.officeLogin);

/* ---------- SITE LOGIN ---------- */
router.get("/site-login", attendanceAuth, attendanceController.siteLoginPage);
router.post(
  "/site-login",
  upload.single("selfie"), 
  attendanceController.siteLogin
);

/*---------- total working hours and minutes----------*/
router.get("/today-working-time", attendanceAuth, attendanceController.getTodayWorkingTime);

/* ---------- SUCCESS ---------- */
router.get("/success", attendanceAuth, attendanceController.successPage);

router.get("/logout", attendanceAuth, attendanceController.logout);

router.post("/emergency-logout", attendanceAuth, attendanceController.emergencyLogout);

/* ---------- FETCH ATTENDANCE FOR HR ---------- */
router.get("/attendance", attendanceController.getAttendance);

router.get("/download", attendanceController.downloadReport);

module.exports = router;
