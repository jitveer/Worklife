const db = require('../db');
const express = require('express');
const router = express.Router();

// console.log("✅ Payslip Routes Loaded");
const payslipController = require("../controllers/payslipController");

// route
router.get("/employees", payslipController.getEmployees);

router.post("/bank/add", payslipController.addBankDetails);
router.put("/bank/update", payslipController.updateBankDetails);

router.get("/employee-list", payslipController.getEmployeeList);

router.get("/details/:emp_id", payslipController.getEmployeePayslipDetails);

// NEW - fetch latest sent payslip
router.get("/latest/:emp_id", payslipController.getLatestPayslip);

// 🔹 save payslip + send email
router.post("/save", payslipController.savePayslip);

module.exports = router;