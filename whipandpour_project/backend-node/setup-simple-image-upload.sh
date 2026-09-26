cd ~/PycharmProjects/whipandpour_project_website_our/whipandpour_project

cat > setup-simple-image-upload.sh <<'EOF'
#!/usr/bin/env bash

set -e

PROJECT_ROOT="$(pwd)"
BACKEND="$PROJECT_ROOT/backend-node"
FRONTEND="$PROJECT_ROOT/frontend"

echo "=========================================="
echo " Whip & Pour - Simple Image Upload Setup"
echo "=========================================="

if [ ! -d "$BACKEND" ] || [ ! -d "$FRONTEND" ]; then
  echo "ERROR: Run this script from whipandpour_project/"
  exit 1
fi

echo
echo "==> Creating backups..."

TIMESTAMP=$(date +%Y%m%d_%H%M%S)

cp "$BACKEND/routers/uploads.js" \
   "$BACKEND/routers/uploads.js.backup-$TIMESTAMP"

cp "$BACKEND/server.js" \
   "$BACKEND/server.js.backup-$TIMESTAMP"

cp "$FRONTEND/src/pages/AdminProducts.tsx" \
   "$FRONTEND/src/pages/AdminProducts.tsx.backup-$TIMESTAMP"

echo "✓ Backups created"

echo
echo "==> Removing Cloudinary..."

cd "$BACKEND"

if npm list cloudinary >/dev/null 2>&1; then
  npm uninstall cloudinary
else
  echo "✓ Cloudinary package already absent"
fi

echo
echo "==> Creating upload directory..."

mkdir -p "$BACKEND/uploads/products"

echo "✓ Created:"
echo "  $BACKEND/uploads/products"

echo
echo "==> Creating simple upload router..."

cat > "$BACKEND/routers/uploads.js" <<'JS'
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
JS

echo "✓ Upload router created"

echo
echo "==> Updating server.js..."

python3 - "$BACKEND/server.js" <<'PY'
import sys

file = sys.argv[1]

with open(file, "r", encoding="utf-8") as f:
    content = f.read()

# Add path if it isn't already imported.
if "const path = require(\"path\");" not in content:
    marker = 'const express = require("express");'
    if marker in content:
        content = content.replace(
            marker,
            marker + '\nconst path = require("path");',
            1
        )
    else:
        marker = "const express = require('express');"
        if marker in content:
            content = content.replace(
                marker,
                marker + "\nconst path = require('path');",
                1
            )
        else:
            raise SystemExit("Could not find Express import in server.js")

# Add static uploads middleware after express.json if possible.
static_code = r'''
// Serve uploaded product images.
const uploadsPath = path.join(__dirname, "uploads");
app.use("/uploads", express.static(uploadsPath));
'''

if 'express.static(uploadsPath)' not in content:
    marker = "app.use(express.json());"

    if marker in content:
        content = content.replace(
            marker,
            marker + static_code,
            1
        )
    else:
        # Fallback: place it after app creation.
        marker = "const app = express();"

        if marker in content:
            content = content.replace(
                marker,
                marker + static_code,
                1
            )
        else:
            raise SystemExit(
                "Could not find app initialization in server.js"
            )

with open(file, "w", encoding="utf-8") as f:
    f.write(content)
PY

echo "✓ server.js updated"

echo
echo "==> Checking server.js upload route..."

grep -n -C 2 'express.static(uploadsPath)' "$BACKEND/server.js" || {
  echo "ERROR: Upload static route was not added."
  exit 1
}

echo
echo "==> Checking AdminProducts.tsx..."

UPLOAD_HANDLER=$(grep -c 'api/admin/upload/image' \
  "$FRONTEND/src/pages/AdminProducts.tsx" || true)

if [ "$UPLOAD_HANDLER" -gt 0 ]; then
  echo "✓ Image upload handler already exists"
else
  echo "WARNING: AdminProducts.tsx does not contain the upload handler."
  echo "The backend is ready, but the frontend upload handler needs to be added."
fi

echo
echo "==> Checking Upload button..."

UPLOAD_BUTTON=$(grep -c 'type="file"' \
  "$FRONTEND/src/pages/AdminProducts.tsx" || true)

if [ "$UPLOAD_BUTTON" -gt 0 ]; then
  echo "✓ File upload input already exists"
else
  echo "WARNING: No file input found in AdminProducts.tsx."
  echo "Your existing handleImageUpload function may exist, but the UI"
  echo "does not currently contain a file picker."
fi

echo
echo "==> Checking backend syntax..."

node --check "$BACKEND/routers/uploads.js"
node --check "$BACKEND/server.js"

echo "✓ Backend syntax OK"

echo
echo "==> Building frontend..."

cd "$FRONTEND"

npm run build

echo
echo "✓ Frontend build successful"

echo
echo "=========================================="
echo " SETUP COMPLETE"
echo "=========================================="

echo
echo "Changed:"
echo "  ✓ Removed Cloudinary dependency"
echo "  ✓ Created local image storage"
echo "  ✓ Created /api/admin/upload/image endpoint"
echo "  ✓ Created /uploads/products static route"
echo "  ✓ Backend syntax verified"
echo "  ✓ Frontend build verified"

echo
echo "Upload directory:"
echo "  $BACKEND/uploads/products"

echo
echo "IMPORTANT:"
echo "Render local filesystem is NOT permanent."
echo "Images may disappear after a Render redeploy/restart."

echo
echo "Next steps:"
echo
echo "1. Check the AdminProducts.tsx warning above."
echo
echo "2. Review changes:"
echo "   cd $PROJECT_ROOT"
echo "   git diff -- backend-node/server.js backend-node/routers/uploads.js"
echo
echo "3. Commit and push:"
echo "   git add backend-node frontend"
echo "   git commit -m \"Add simple product image uploads\""
echo "   git push"
echo
echo "4. Add this Render environment variable:"
echo "   PUBLIC_API_URL=https://api.whipandpour.com"
echo
echo "5. Deploy on Render."
echo
EOF
