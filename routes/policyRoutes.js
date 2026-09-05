const express = require("express");
const router = express.Router();

const policyController = require("../controllers/policyController");

const upload = require("../uploadConfig");
const uploadPolicy = upload("policy_files");

// Get all policies
router.get("/", policyController.getPolicies);

// Add new policy with PDF
router.post(
  "/",
  uploadPolicy.single("attachment"),
  policyController.addPolicy
);

// Delete policy
router.delete("/:id", policyController.deletePolicy);

module.exports = router;