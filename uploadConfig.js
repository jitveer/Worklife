const multer = require("multer");
const path = require("path");
const fs = require("fs");

/**
 * Creates a multer uploader instance bound to a specific subfolder.
 * Includes security validation filter (RCE prevention) and size limits.
 * 
 * @param {string} folderName - Subfolder inside the uploads directory 
 */
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

  // ✅ Secure File Filter: Only allow safe image formats and PDFs to prevent RCE
  const fileFilter = (req, file, cb) => {
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.pdf'];
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];

    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype.toLowerCase();

    if (allowedExtensions.includes(ext) && allowedMimeTypes.includes(mime)) {
      cb(null, true);
    } else {
      cb(new Error("Only images (.png, .jpg, .jpeg) and PDFs (.pdf) are allowed!"), false);
    }
  };

  // ⭐ RETURN multer instance (IMPORTANT) with limits and validation filter
  return multer({ 
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB maximum file size limit (DoS protection)
  });
}

module.exports = createUploader;
