const express = require("express");

const router = express.Router();

const {
    getAssets,
    getDeviceRecords,
    addDeviceRecord,
    updateDeviceRecord,
    deleteDeviceRecord
} = require("../controllers/officeAssetsController");


// Get all asset cards
router.get("/", getAssets);


// Get devices belonging to an asset
router.get("/:assetId/devices", getDeviceRecords);


// Add device
router.post("/:assetId/devices", addDeviceRecord);


// Update device
router.put("/devices/:deviceId", updateDeviceRecord);


// Delete device
router.delete("/devices/:deviceId", deleteDeviceRecord);


module.exports = router;