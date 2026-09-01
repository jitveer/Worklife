const db = require("../db");

// =====================================================
// GET ALL OFFICE ASSETS
// =====================================================
const getAssets = (req, res) => {
    const sql = `
        SELECT
            asset_id,
            asset_name,
            category,
            specifications,
            created_at
        FROM office_assets
        ORDER BY asset_id ASC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Error fetching office assets:", err);

            return res.status(500).json({
                success: false,
                message: "Failed to fetch office assets"
            });
        }

        res.status(200).json({
            success: true,
            data: results
        });
    });
};


// =====================================================
// GET DEVICE RECORDS FOR AN ASSET
// =====================================================
const getDeviceRecords = (req, res) => {
    const { assetId } = req.params;

    const sql = `
        SELECT
            device_id,
            asset_id,
            device_name,
            employee_name,
            assigned_date
        FROM device_records
        WHERE asset_id = ?
        ORDER BY device_id ASC
    `;

    db.query(sql, [assetId], (err, results) => {
        if (err) {
            console.error("Error fetching device records:", err);

            return res.status(500).json({
                success: false,
                message: "Failed to fetch device records"
            });
        }

        res.status(200).json({
            success: true,
            data: results
        });
    });
};


// =====================================================
// ADD DEVICE RECORD
// =====================================================
const addDeviceRecord = (req, res) => {
    const { assetId } = req.params;
    const { device_name, employee_name } = req.body;

    if (!device_name || !employee_name) {
        return res.status(400).json({
            success: false,
            message: "Device name and employee name are required"
        });
    }

    const sql = `
        INSERT INTO device_records
        (
            asset_id,
            device_name,
            employee_name
        )
        VALUES (?, ?, ?)
    `;

    db.query(
        sql,
        [
            assetId,
            device_name.trim(),
            employee_name.trim()
        ],
        (err, result) => {

            if (err) {
                console.error("Error adding device record:", err);

                return res.status(500).json({
                    success: false,
                    message: "Failed to add device record"
                });
            }

            res.status(201).json({
                success: true,
                message: "Device record added successfully",
                data: {
                    device_id: result.insertId
                }
            });
        }
    );
};


// =====================================================
// UPDATE DEVICE RECORD
// =====================================================
const updateDeviceRecord = (req, res) => {
    const { deviceId } = req.params;
    const { device_name, employee_name } = req.body;

    if (!device_name || !employee_name) {
        return res.status(400).json({
            success: false,
            message: "Device name and employee name are required"
        });
    }

    const sql = `
        UPDATE device_records
        SET
            device_name = ?,
            employee_name = ?
        WHERE device_id = ?
    `;

    db.query(
        sql,
        [
            device_name.trim(),
            employee_name.trim(),
            deviceId
        ],
        (err, result) => {

            if (err) {
                console.error("Error updating device record:", err);

                return res.status(500).json({
                    success: false,
                    message: "Failed to update device record"
                });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Device record not found"
                });
            }

            res.status(200).json({
                success: true,
                message: "Device record updated successfully"
            });
        }
    );
};


// =====================================================
// DELETE DEVICE RECORD
// =====================================================
const deleteDeviceRecord = (req, res) => {
    const { deviceId } = req.params;

    const sql = `
        DELETE FROM device_records
        WHERE device_id = ?
    `;

    db.query(sql, [deviceId], (err, result) => {

        if (err) {
            console.error("Error deleting device record:", err);

            return res.status(500).json({
                success: false,
                message: "Failed to delete device record"
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Device record not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Device record deleted successfully"
        });
    });
};


// =====================================================
// EXPORT
// =====================================================
module.exports = {
    getAssets,
    getDeviceRecords,
    addDeviceRecord,
    updateDeviceRecord,
    deleteDeviceRecord
};