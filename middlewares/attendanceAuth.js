module.exports = (req, res, next) => {
    if (!req.session || !req.session.employee) {
        return res.redirect("/attendance/passcode");
    }

    next();
};