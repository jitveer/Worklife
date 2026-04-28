const express = require('express');
const cors = require('cors');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const dbPool = require('./db.js');



const sessionStore = new MySQLStore({
  clearExpired: true, // Automatically clears expired sessions from the database
  checkExpirationInterval: 900000, // Checks every 15 minutes (in milliseconds)
  expiration: 86400000, // Session expires after 24 hours (in milliseconds)
  createDatabaseTable: true // Automatically creates the 'sessions' table if it doesn't exist
}, dbPool);


const path = require('path');
const cronJobs = require("./services/cronJobs"); // timer

const app = express();
const PORT = 3000;

const authController = require("./controllers/authController");
const dashboardRoutes = require('./routes/dashboardRoutes');
const notificationRoutes = require('./routes/notificationsRoutes');
// const personalinfoRoutes = require("./routes/personalinfoRoutes");
const usersRoutes = require('./routes/usersRoutes');
const sectionRoutes = require('./routes/sectionRoutes');
const salesRoutes = require('./routes/salesRoutes');
//add and delete rows in multiple table
const masterRoutes = require("./routes/masterRoutes");
const certificateRoutes = require("./routes/certificateRoutes");
const interviewRoutes = require("./routes/interviewRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const pushRoutes = require("./routes/pushRoutes");

// uploads
global.appRoot = path.resolve(__dirname, "public");

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const helmet = require("helmet");

// ✅ Helmet with relaxed CSP (so Bootstrap + JS works)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],

        scriptSrc: [
          "'self'",
          "'unsafe-inline'",     // needed for your current HTML (buttons, modals)
          "'unsafe-eval'",
          "https://cdn.jsdelivr.net",
          "https://code.jquery.com"
        ],

        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://fonts.googleapis.com"
        ],

        imgSrc: ["'self'", "data:"],

        connectSrc: [
          "'self'",
          "https://worklife.globesproperties.in",
          "https://cdn.jsdelivr.net",
          "https://nominatim.openstreetmap.org"
        ],

        fontSrc: [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://fonts.gstatic.com"
        ]
      }
    }
  })
);



app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
app.use(session({
  secret: 'my_secret_key_12345', // use a strong secret in production!
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    sameSite: "lax",
  } // change to true if using HTTPS
}));


// not showing leave page to employee
// app.get("/leave-requests-approval.html", (req, res) => {
//   const role = req.session.role;

//   //  Block only employees
//   if (role === "employee") {
//     return res.status(403).send("Forbidden");
//   }


//  Correct path to file
//   res.sendFile(path.join(__dirname, './public/leave-requests-approval.html'));
// });

// app.get('/index.html', (req, res) => {
//   res.sendFile(path.join(__dirname, './public/index.html'));
// });


// // Public access to all pages (you can protect them later if needed)
// app.get('/dashboard.html', (req, res) => {
//   res.sendFile(path.join(__dirname, './public/dashboard.html'));
// });

// app.get('/humanresource.html', (req, res) => {
//   res.sendFile(path.join(__dirname, './public/humanresource.html'));
// });

// app.get('/employee-list.html', (req, res) => {
//   res.sendFile(path.join(__dirname, './public/employee-list.html'));
// });

// app.get('/add-employee.html', (req, res) => {
//   res.sendFile(path.join(__dirname, './public/add-employee.html'));
// });









const petrolRoutes = require('./routes/petrolRoutes');
app.use('/api/petrol', petrolRoutes);

// API routes
app.use("/api/employees", require("./routes/employeeRoutes"));
app.use("/api/expense", require("./routes/expenseRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/leave", require("./routes/leaveRequestRoutes"));
app.use('/api/dashboard', require("./routes/dashboardRoutes"));
app.use("/api/notifications", require("./routes/notificationsRoutes"));
app.use('/api/section', sectionRoutes);
app.use("/api/sales", salesRoutes);
// add and delete multiple rows in diffrent table
app.use("/api/master", masterRoutes);

// app.use("/api/personalinfo", require("./routes/personalinfoRoutes"));
app.use('/api/users', usersRoutes);

app.use("/uploads", express.static(path.join(__dirname, "./uploads")));
app.use("/api/certificate", certificateRoutes);
app.use("/api", interviewRoutes);
// attendance
app.use("/attendance", attendanceRoutes);
// push notification
app.use("/api/push", pushRoutes);

// Default root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// app.get("/", (req, res) => {
//   res.sendFile(path.join(__dirname, './public/index.html'));
// });

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running: http://localhost:${PORT}`);


  // 🔹 Start cron jobs after server is ready
  cronJobs.startCronJobs();
});
