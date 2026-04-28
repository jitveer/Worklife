const express = require('express');
const router = express.Router();
const emp = require('../controllers/employeeController');
const upload = require("../uploadConfig");
const uploadPhoto = upload("photos");


router.post('/add', emp.addEmployee);
router.post('/getCompanyDeptRoleNames', emp.getCompanyDeptRoleNames);
router.get('/', emp.getEmployees);
router.get("/linemanagers", emp.getAllLineManagers);
router.get('/getAllCompanies', emp.getAllCompanies);
router.get('/getAllRoles', emp.getAllRoles);
router.get('/department', emp.getAllDepartment);
router.get('/:id', emp.getEmployeeById);
router.put('/update/:id', emp.updateEmployee);
router.delete('/delete/:id', emp.deleteEmployee);
router.post('/send-form-link', emp.sendEmployeeFormLink);



// storing photos of employee
router.post("/employee/upload-photo", uploadPhoto.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No photo uploaded" });

  const filePath = "/uploads/photos/" + req.file.filename;

  res.json({ success: true, filePath });
});

module.exports = router;
