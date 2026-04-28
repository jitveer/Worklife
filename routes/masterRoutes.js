const express = require("express");
const router = express.Router();
const db = require('../db');
const masterController = require("../controllers/masterController");

// GET all table data dynamically
router.get("/:type", masterController.getMasterList);
router.post("/:type", masterController.addMaster);
router.put("/:type/:id", masterController.updateMaster);
router.delete("/:type/:id", masterController.deleteMaster);


module.exports = router;
