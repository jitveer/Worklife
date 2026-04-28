const express = require('express');
const router = express.Router();
const db = require('../db');
const dashboardController = require('../controllers/dashboardController');

const createUploader = require("../uploadConfig");
const uploadEventImage = createUploader("calendar_events");

router.get("/tiles", dashboardController.getDashboardTiles);

router.get('/pending-count', (req, res) => {
  const user = req.session.user;

  // Step 1: Check if user is logged in
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const approverId = user.user_id;

  // Step 2: Query leave_request_approval_flow
  const leaveQuery = `
    SELECT COUNT(*) AS pendingCount 
    FROM leave_request_approvals
    WHERE approver_user_id = ? AND status = 'pending'
  `;

  // Query pending expense approvals
  const expenseQuery = `
    SELECT COUNT(*) AS expenseCount 
    FROM expense_approvals
    WHERE approver_id = ? AND status = 'pending'
  `;
  const petrolQuery = `
    SELECT COUNT(*) AS petrolCount 
    FROM petrol_approvals
    WHERE approver_id = ? AND status = 'pending'
  `;
  const performanceQuery = `
    SELECT COUNT(*) AS performanceCount
    FROM performance_approvals
    WHERE approver_user_id = ? AND status = 'pending'
  `;

  // Run leave first
  db.query(leaveQuery, [approverId], (err, leaveResult) => {
    if (err) {
      console.error('Leave DB error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }

    // Run expense
    db.query(expenseQuery, [approverId], (err, expenseResult) => {
      if (err) {
        console.error('Expense DB error:', err);
        return res.status(500).json({ message: 'Internal server error' });
      }

      // Run petrol
      db.query(petrolQuery, [approverId], (err, petrolResult) => {
        if (err) {
          console.error('Petrol DB error:', err);
          return res.status(500).json({ message: 'Internal server error' });
        }

        // Run performance
        db.query(performanceQuery, [approverId], (err, perfResult) => {
          if (err) {
            console.error('Performance DB error:', err);
            return res.status(500).json({ message: 'Internal server error' });
          }


          const leave = leaveResult[0]?.leaveCount || 0;
          const expense = expenseResult[0]?.expenseCount || 0;
          const petrol = petrolResult[0]?.petrolCount || 0;
          const performance = perfResult[0]?.performanceCount || 0;

          const total = leave + expense + petrol + performance;
          res.json({ pending: total });
        });
      });
    });
  });
});



// HR save event
router.post(
  "/calendar-event",
  uploadEventImage.single("image"),
  dashboardController.addCalendarEvent
);

// Load all event dates
router.get("/calendar-events", dashboardController.getCalendarEvents);

// Load single event
router.get("/calendar-event/:date", dashboardController.getEventByDate);

module.exports = router;
