const db = require('../db');
const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');


// Fetch personal info
router.get('/personalinfo', expenseController.getPersonalInfo);

// Submit new expense claim
router.post('/submit', expenseController.createExpenseClaim);
//view for approver
+ router.get('/view/:req_no', expenseController.getExpenseClaimByReqNo);

// Update approval (approve/reject)
router.post('/update-approval', expenseController.updateExpenseApproval);

// My requests
router.get('/my-claims', expenseController.getExpenseClaimsByUser);

// Approver table
router.get('/approvals', expenseController.getExpenseApprovals);

router.get('/my-requests', expenseController.getMyExpenseRequests);

router.get("/track/:req_no", expenseController.trackExpenseApproval);

// Generate a new req_no
router.get('/get-new-req-no', (req, res) => {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ''); 
  const prefix = `EXP${dateStr}`;

  const sql = `
    SELECT req_no FROM expense_claim 
    WHERE req_no LIKE '${prefix}%' 
    ORDER BY req_no DESC 
    LIMIT 1
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error generating new req_no:', err);
      return res.status(500).json({ error: 'Database error while generating req_no' });
    }

    let newNumber = 1;
    if (results.length > 0) {
      const lastReqNo = results[0].req_no;
      const lastNumber = parseInt(lastReqNo.slice(-4));
      newNumber = lastNumber + 1;
    }

    const paddedNumber = String(newNumber).padStart(4, '0');
    const newReqNo = `${prefix}${paddedNumber}`;

    res.json({ req_no: newReqNo });
  });
});

module.exports = router;
