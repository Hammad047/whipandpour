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

const upload = multer({
  storage,

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }

    cb(null, true);
  },
});

router.post("/image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image was uploaded",
      });
    }

    const baseUrl =
      process.env.PUBLIC_API_URL ||
      `${req.protocol}://${req.get("host")}`;

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
