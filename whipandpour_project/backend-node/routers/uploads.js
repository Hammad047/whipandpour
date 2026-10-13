const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const uploadDir = path.join(__dirname, "..", "uploads", "products");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },

  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    const safeName = path
      .basename(file.originalname, extension)
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50);

    const uniqueName = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}-${safeName || "image"}${extension}`;

    cb(null, uniqueName);
  },
});

// SVG is excluded on purpose: it can carry script, and these files are served
// from the API origin.
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage,

  limits: {
    fileSize: MAX_FILE_BYTES,
  },

  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!file.mimetype.startsWith("image/") || !ALLOWED_EXTENSIONS.has(extension)) {
      return cb(new Error("Only JPG, PNG, WEBP or GIF images are allowed"));
    }

    cb(null, true);
  },
});

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

    // Not req.get("host") — the Vite dev proxy forwards requests with the
    // frontend's own Host header (localhost:5173) unchanged, so that would
    // build a URL pointing at the frontend's port, which has no /uploads
    // route at all. PUBLIC_API_URL must be set explicitly in production.
    const baseUrl = process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 8000}`;

    const url = `${baseUrl}/uploads/products/${encodeURIComponent(
      req.file.filename
    )}`;

    console.log(`[Upload] Image uploaded: ${url}`);

    return res.json({
      success: true,
      url,
      filename: req.file.filename,
    });
  } catch (error) {
    console.error("[Upload] Image upload failed:", error);

    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }

    return res.status(500).json({
      success: false,
      message: "Image upload failed",
    });
  }
});

module.exports = router;
