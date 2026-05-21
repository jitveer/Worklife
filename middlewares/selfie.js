const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ✅ Correct absolute path to uploads folder
const uploadDir = path.join(process.cwd(), "uploads", "attendance_selfie");

// ✅ Ensure folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

// ✅ Secure File Filter: Only allow safe image formats for attendance selfies
const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.png', '.jpg', '.jpeg'];
  const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg'];

  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  if (allowedExtensions.includes(ext) && allowedMimeTypes.includes(mime)) {
    cb(null, true);
  } else {
    cb(new Error("Only images (.png, .jpg, .jpeg) are allowed for attendance selfies!"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

module.exports = upload;
