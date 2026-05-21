// backend/middlewares/authMiddleware.js

/**
 * Public routes that do NOT require authentication.
 * Add any new public route here.
 */
const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/roles',
  '/api/auth/send-passcode',
  '/api/auth/session-check',
  '/api/auth/logout',
  '/api/employees/add',
  '/api/employees/employee/upload-photo',
  '/api/employees/getAllCompanies',
  '/api/employees/department',
  '/api/employees/getAllRoles',
  '/api/employees/linemanagers',
  '/api/exam/start',
  '/api/exam/submit',
  '/api/roles',
  '/attendance/passcode',
  '/attendance/verify-passcode'
];

/**
 * Custom checkAuth middleware to protect API routes while allowing public assets
 * and essential candidate/onboarding forms to operate smoothly.
 */
function checkAuth(req, res, next) {
  // Normalize path (remove query parameters)
  const reqPath = req.originalUrl.split('?')[0];

  // If path matches a public route, bypass authentication
  if (PUBLIC_ROUTES.includes(reqPath)) {
    return next();
  }

  // Otherwise, verify session user or employee (for attendance clock-in)
  if (req.session && (req.session.user || req.session.employee)) {
    return next(); // ✅ Authenticated
  }

  // Return a clean 401 JSON response for unauthorized API requests
  return res.status(401).json({
    success: false,
    error: "Unauthorized",
    message: "Session expired or invalid. Please log in."
  });
}

module.exports = checkAuth;
