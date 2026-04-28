const express = require("express");
const router = express.Router();
const controller = require("../controllers/salesController"); // FIXED
const upload = require("../uploadConfig");
const uploadIncentive = upload("incentive_files");

router.get("/personal-info", controller.getSalesPersonalInfo);
router.post("/submit", controller.submitSalesRequest);
router.post("/update-approval", controller.updateSalesApproval);
router.get("/dropdown-data", controller.getDropdownData);

router.delete("/delete-item/:item_id", controller.deleteSalesItem);
router.delete("/delete/:id", controller.deleteSale);

// pre-fill data for approver
router.get("/view/:req_no", controller.getSalesByReqNo);
// ✔ FIXED approver table list
router.get("/sales-list", controller.getSalesList);

// employee sales table 
router.get("/my-sales", controller.getMySalesRequests);
router.get("/track/:reqNo", controller.trackSalesApproval);


// upload files
router.post("/incentive/upload", uploadIncentive.single("incentive_file"), (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const filePath = "/uploads/incentive_files/" + req.file.filename;

    res.json({ success: true, filePath });
});

module.exports = router;
