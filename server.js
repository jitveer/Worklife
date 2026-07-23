require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const dbPool = require('./db.js');
const rateLimit = require('express-rate-limit');
const checkAuth = require('./middlewares/authMiddleware');



const sessionStore = new MySQLStore({
  clearExpired: true, // Automatically clears expired sessions from the database
  checkExpirationInterval: 900000, // Checks every 15 minutes (in milliseconds)
  expiration: 86400000, // Session expires after 24 hours (in milliseconds)
  createDatabaseTable: true // Automatically creates the 'sessions' table if it doesn't exist
}, dbPool);


const path = require('path');
const cronJobs = require("./services/cronJobs"); // timer

const app = express();
app.set('trust proxy', 1); // ✅ Trust first reverse proxy (Nginx, PM2, Cloudflare) to read real client IP correctly
const PORT = process.env.PORT || 3000;

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
const payslipRoutes = require("./routes/payslipRoutes");

// uploads
global.appRoot = path.resolve(__dirname, "public");

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ CORS Configuration: Secure access control while allowing session sharing
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [
    'https://worklife-ems.mnmreality.com', // Production domain
    'http://localhost:3000',               // Local development
    'http://127.0.0.1:3000'
  ];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, postman, or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true // Allow cookies to be sent back and forth
}));


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
          "https://worklife-ems.mnmreality.com",
          "https://cdn.jsdelivr.net",
          "https://nominatim.openstreetmap.org"
        ],

        fontSrc: [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://fonts.gstatic.com"
        ],

        frameAncestors: ["'self'"] // ✅ Anti-Clickjacking: Prevents other domains from framing this website in iframes
      }
    }
  })
);



app.use(express.static(path.join(__dirname, 'public')));

// ✅ Rate Limiting: Prevent brute-force/DDoS attacks on API/attendance endpoints
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable older X-RateLimit-* headers
  message: {
    success: false,
    message: "Too many requests from this IP. Please try again after a minute."
  }
});

// Session middleware
app.use(session({
  name: 'worklife.sid', // ✅ Session Stealth: Hide express identification cookie name (connect.sid) from hacker probes
  secret: process.env.SESSION_SECRET || 'my_secret_key_12345_fallback', // Dynamic session secret
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // ✅ HTTPS secure cookie enabled dynamically in production
    httpOnly: true, // ✅ XSS cookie defense: Prevents client-side JS from accessing the session cookie
    sameSite: "lax",
  }
}));

// ✅ Apply Rate Limiter to API and Attendance routes
app.use('/api', apiLimiter);
app.use('/attendance', apiLimiter);

// ✅ Apply central authentication middleware to API and Attendance routes
app.use('/api', checkAuth);
app.use('/attendance', checkAuth);


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
app.use("/api/payslip", payslipRoutes);
// payslip logo inside pdf
app.use("/images", express.static("public/images"));

// Default root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ Global Error Handler (Hides internal database structure and formats upload filter errors)
app.use((err, req, res, next) => {
  console.error("Global Error Caught:", err.message);

  if (err.name === 'MulterError') {
    return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
  }

  if (err.message && (err.message.includes("Only images") || err.message.includes("allowed"))) {
    return res.status(400).json({ success: false, message: err.message });
  }

  res.status(500).json({ success: false, message: "Internal Server Error" });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running: http://localhost:${PORT}`);


  // 🔹 Start cron jobs after server is ready
  cronJobs.startCronJobs();
});
