function checkAuth(req, res, next) {
  if (req.session && req.session.user) {
    next(); // ✅ User is logged in
  } else {
    res.redirect('/login.html'); // ❌ Not logged in, redirect to login
  }
}

module.exports = checkAuth;
