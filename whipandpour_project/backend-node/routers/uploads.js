const express = require("express");
const multer = require("multer");
const path = require("path");
const { UploadedImage } = require("../db");

const router = express.Router();

// SVG is excluded on purpose: it can carry script, and these files are served
// from the API origin.
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_FILE_BYTES,
  },

  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(extension)) {
      return cb(new Error("Only JPG, PNG, WEBP or GIF images are allowed"));
    }

    cb(null, true);
  },
});

function uniqueFilename(originalname) {
  const extension = path.extname(originalname).toLowerCase();
  const safeName = path
    .basename(originalname, extension)
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);

  return `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName || "image"}${extension}`;
}

const uploadSingleImage = (req, res, next) => {
  upload.single("image")(req, res, (err) => {
    if (!err) return next();
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Image must be smaller than 5MB"
        : err.message || "Image upload failed";
    return res.status(400).json({ success: false, message });
  });
};

router.post("/image", uploadSingleImage, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image was uploaded",
      });
    }

    const filename = uniqueFilename(req.file.originalname);
    await UploadedImage.create({
      name: filename,
      mimeType: req.file.mimetype,
      data: req.file.buffer,
    });

    // Not req.get("host") — the Vite dev proxy forwards requests with the
    // frontend's own Host header, which would point the URL at the wrong port.
    // PUBLIC_API_URL must be set explicitly in production.
    const baseUrl = process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 8000}`;
    const url = `${baseUrl}/uploads/products/${encodeURIComponent(filename)}`;

    console.log(`[Upload] Image stored: ${filename}`);

    return res.json({
      success: true,
      url,
      filename,
    });
  } catch (error) {
    console.error("[Upload] Image upload failed:", error);

    return res.status(500).json({
      success: false,
      message: "Image upload failed",
    });
  }
});

module.exports = router;
