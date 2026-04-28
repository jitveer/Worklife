const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

router.post("/login", authController.login);
router.get("/roles", authController.getRoles);
router.post("/create-user", authController.createUser);

router.get("/logout", authController.logout);
router.post("/send-passcode", authController.sendUserPasscode);

//  New: session check route
router.get("/session-check", authController.checkSession);


module.exports = router;

