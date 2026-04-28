const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Always point to worklife/public/uploads/medical_certificates
//const uploadDir = path.join(__dirname, "../public/uploads/medical_certificates");


// Function takes folder name & returns uploader
function createUploader(folderName) {
  // Set dynamic folder inside public/uploads
  const uploadDir = path.join(process.cwd(), "uploads", folderName);


  // Create folder if it doesn’t exist
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + path.extname(file.originalname)); // unique filename
    },
  });

  // ⭐ RETURN multer instance (IMPORTANT)
  return multer({ storage });
}
module.exports = createUploader;
