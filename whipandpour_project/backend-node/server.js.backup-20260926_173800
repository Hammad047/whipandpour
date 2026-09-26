/**
 * server.js — Express application with tRPC-compatible HTTP batch endpoint.
 * Node port of main.py.
 *
 * The frontend uses @trpc/client with httpBatchLink pointed at /api/trpc.
 * tRPC batch protocol:
 *   GET  /api/trpc/<proc1>,<proc2>?batch=1&input={"0":...,"1":...}
 *   POST /api/trpc/<proc1>,<proc2>?batch=1          body: {"0":...,"1":...}
 *
 * Each request in the batch corresponds to one tRPC procedure call.
 * The response is a JSON array of length N, each item being either:
 *   { "result": { "data": <superjson-envelope> } }
 *   { "error": { "json": { "message": ..., "code": -32600, "data": { "code": "...", "httpStatus": ... } } } }
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { fn, col, where: sequelizeWhere } = require("sequelize");

const { initDb, User, Product } = require("./db");
const {
  TRPCError, UNAUTHED_ERR_MSG, NOT_ADMIN_ERR_MSG,
  verifyPassword, getUserIdFromRequest,
  createSession, destroySession, setSessionCookie, clearSessionCookie,
  getSessionIdFromRequest,
} = require("./auth");

const { productsList, productsCategories, productsFeatured, productsBestsellers, productsBySlug, productsById } = require("./routers/products");
const uploadRouter = require("./routers/uploads");
const { cartGet, cartAdd, cartUpdate, cartClear } = require("./routers/cart");
const { wishlistList, wishlistAdd, wishlistRemove } = require("./routers/wishlist");
const {
  ordersList, ordersById, ordersItems, createOrderFromCart, lookupOrders,
  GIFT_MESSAGE_MAX_LENGTH, GIFT_PACKAGING_FEE,
} = require("./routers/orders");
const {
  adminProductsList, adminProductsCreate, adminProductsUpdate, adminProductsDelete,
  adminInventoryRestock, adminInventorySetStock,
  adminCustomersList,
  adminOrdersList, adminOrdersUpdateStatus, adminOrdersMarkAdvancePaid,
  adminStats,
  adminPromosList, adminPromosCreate, adminPromosUpdate, adminPromosDelete,
  adminReviewsList, adminReviewsUpdateStatus, adminReviewsDelete,
  adminAnalytics, adminPaymentsList,
} = require("./routers/admin");
const { promosValidate } = require("./routers/promos");
const { reviewsByProduct, reviewsCanReview, reviewsCreate } = require("./routers/reviews");
const { stripeCreateCheckoutSession, stripeGetSession } = require("./routers/stripeRouter");
const { mailStatus } = require("./mailer");

const app = express();
app.use(express.json());

// Explicit origins, not "*" — this API sends a session cookie (credentials:
// true), and a wildcard origin combined with credentials lets any website
// ride a visitor's session. ALLOWED_ORIGINS overrides the default for a
// split deployment (e.g. a frontend on a different domain).
const DEFAULT_ORIGINS = "https://whipandpour.com,https://www.whipandpour.com,http://localhost:5173";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS)
  .split(",").map((o) => o.trim()).filter(Boolean);

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ─── tRPC response helpers ────────────────────────────────────────────────────

function trpcOk(data) {
  return { result: { data: { json: data === undefined ? null : data } } };
}

const TRPC_CODE_MAP = {
  PARSE_ERROR: -32700,
  BAD_REQUEST: -32600,
  INTERNAL_SERVER_ERROR: -32603,
  UNAUTHORIZED: -32001,
  FORBIDDEN: -32003,
  NOT_FOUND: -32004,
  METHOD_NOT_SUPPORTED: -32005,
  TIMEOUT: -32008,
  CONFLICT: -32009,
  PRECONDITION_FAILED: -32012,
  PAYLOAD_TOO_LARGE: -32013,
  TOO_MANY_REQUESTS: -32029,
};

function trpcErr(message, code = "INTERNAL_SERVER_ERROR", httpStatus = 500) {
  return {
    error: {
      json: {
        message,
        code: TRPC_CODE_MAP[code] || -32603,
        data: { code, httpStatus },
      },
    },
  };
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function getUser(req) {
  const userId = getUserIdFromRequest(req);
  if (userId == null) return null;
  return User.findByPk(userId);
}

async function requireUser(req) {
  const user = await getUser(req);
  if (!user) throw new TRPCError(UNAUTHED_ERR_MSG, "UNAUTHORIZED");
  return user;
}

/**
 * Gate for every admin.* procedure. Authorization is the `role` column on
 * the user row reached through the session cookie. A client-side flag is
 * not evidence of anything.
 */
async function requireAdmin(req) {
  const user = await requireUser(req);
  if (user.role !== "admin") throw new TRPCError(NOT_ADMIN_ERR_MSG, "FORBIDDEN");
  return user;
}

// ─── tRPC procedure dispatcher ───────────────────────────────────────────────

function parseInput(raw) {
  // tRPC sends input as a superjson envelope: {"json": <value>} or sometimes
  // as a plain value. Handle both.
  if (raw && typeof raw === "object" && "json" in raw) return raw.json;
  return raw;
}

async function dispatchProcedure(procedure, inputData, isMutation, req, res) {
  const inp = parseInput(inputData);

  // ── auth ──
  if (procedure === "auth.me") {
    const user = await getUser(req);
    if (!user) return null;
    return {
      id: user.id, openId: user.openId, name: user.name, email: user.email,
      phone: user.phone, address: user.address, city: user.city, state: user.state,
      zipCode: user.zipCode, country: user.country, loginMethod: user.loginMethod,
      role: user.role, createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
    };
  }

  if (procedure === "auth.logout") {
    const sessionId = getSessionIdFromRequest(req);
    if (sessionId) destroySession(sessionId);
    clearSessionCookie(res);
    return { success: true };
  }

  // ── products ──
  if (procedure === "products.list") {
    const i = inp || {};
    return productsList({
      category: i.category, search: i.search, minPrice: i.minPrice, maxPrice: i.maxPrice,
      // Default raised from 12: a store with more than 12 products would
      // silently hide the rest from any caller that omitted `limit`.
      limit: Math.min(Number(i.limit ?? 100), 200),
      offset: Number(i.offset ?? 0),
      sortBy: i.sortBy,
    });
  }

  if (procedure === "products.categories") return productsCategories();

  if (procedure === "system.mailStatus") {
    // Lets the checkout UI avoid promising an email that cannot be sent.
    return mailStatus();
  }

  // ── gifting ──
  if (procedure === "gifting.options") {
    // Served from the backend so the checkout price and the price actually
    // charged cannot drift apart.
    return {
      packagingFee: String(GIFT_PACKAGING_FEE),
      messageMaxLength: GIFT_MESSAGE_MAX_LENGTH,
      includes: [
        "Signature kraft gift box with satin ribbon",
        "Handwritten card with your message",
        "Tissue-wrapped and cushioned for safe delivery",
        "Prices hidden from the recipient's packing slip",
      ],
    };
  }

  if (procedure === "products.featured") return productsFeatured();
  if (procedure === "products.bestsellers") return productsBestsellers();

  if (procedure === "products.bySlug") {
    if (!inp || !inp.slug) throw new TRPCError("slug is required", "BAD_REQUEST");
    return productsBySlug(inp.slug);
  }

  if (procedure === "products.byId") {
    if (!inp || inp.id == null) throw new TRPCError("id is required", "BAD_REQUEST");
    return productsById(Number(inp.id));
  }

  // ── cart ──
  if (procedure === "cart.get") {
    const user = await requireUser(req);
    return cartGet(user.id);
  }

  if (procedure === "cart.add") {
    const user = await requireUser(req);
    if (!inp) throw new TRPCError("Input required", "BAD_REQUEST");
    return cartAdd(user.id, Number(inp.productId), Number(inp.quantity), String(inp.size));
  }

  if (procedure === "cart.update") {
    const user = await requireUser(req);
    if (!inp) throw new TRPCError("Input required", "BAD_REQUEST");
    return cartUpdate(user.id, Number(inp.productId), Number(inp.quantity), String(inp.size));
  }

  if (procedure === "cart.clear") {
    const user = await requireUser(req);
    return cartClear(user.id);
  }

  // ── wishlist ──
  if (procedure === "wishlist.list") {
    const user = await requireUser(req);
    return wishlistList(user.id);
  }

  if (procedure === "wishlist.add") {
    const user = await requireUser(req);
    if (!inp || inp.productId == null) throw new TRPCError("productId is required", "BAD_REQUEST");
    return wishlistAdd(user.id, Number(inp.productId));
  }

  if (procedure === "wishlist.remove") {
    const user = await requireUser(req);
    if (!inp || inp.productId == null) throw new TRPCError("productId is required", "BAD_REQUEST");
    return wishlistRemove(user.id, Number(inp.productId));
  }

  // ── orders ──
  if (procedure === "orders.list") {
    const user = await requireUser(req);
    return ordersList(user.id);
  }

  if (procedure === "orders.byId") {
    const user = await requireUser(req);
    if (!inp || inp.id == null) throw new TRPCError("id is required", "BAD_REQUEST");
    return ordersById(Number(inp.id), user.id);
  }

  if (procedure === "orders.create") {
    if (!isMutation) throw new TRPCError("orders.create must be a mutation", "METHOD_NOT_SUPPORTED");
    // Guest checkout: a session is used when present, but is not required.
    // There is no customer login flow, so requiring one would block every
    // shopper from completing an order.
    return createOrderFromCart(await getUser(req), inp);
  }

  if (procedure === "orders.lookup") {
    // Public: guests have no session, so ownership is proven by order
    // number + the email the order was placed with.
    if (!inp) throw new TRPCError("Order number and email are required", "BAD_REQUEST");
    return lookupOrders(String(inp.orderNumber || ""), String(inp.email || ""));
  }

  if (procedure === "orders.items") {
    if (!inp || inp.orderId == null) throw new TRPCError("orderId is required", "BAD_REQUEST");
    return ordersItems(Number(inp.orderId));
  }

  // ── admin (every branch requires role=admin) ──
  if (procedure.startsWith("admin.")) {
    await requireAdmin(req);

    if (procedure === "admin.products.list") return adminProductsList();
    if (procedure === "admin.products.create") return adminProductsCreate(inp);

    if (procedure === "admin.products.update") {
      if (!inp || inp.id == null) throw new TRPCError("id is required", "BAD_REQUEST");
      return adminProductsUpdate(Number(inp.id), inp.data || inp);
    }

    if (procedure === "admin.products.delete") {
      if (!isMutation) throw new TRPCError("Delete must be a mutation", "METHOD_NOT_SUPPORTED");
      if (!inp || inp.id == null) throw new TRPCError("id is required", "BAD_REQUEST");
      return adminProductsDelete(Number(inp.id));
    }

    if (procedure === "admin.inventory.restock") {
      if (!inp || inp.id == null) throw new TRPCError("id is required", "BAD_REQUEST");
      return adminInventoryRestock(Number(inp.id), Number(inp.amount || 0));
    }

    if (procedure === "admin.inventory.setStock") {
      if (!inp || inp.id == null) throw new TRPCError("id is required", "BAD_REQUEST");
      return adminInventorySetStock(Number(inp.id), Number(inp.stock || 0));
    }

    if (procedure === "admin.customers.list") return adminCustomersList();
    if (procedure === "admin.orders.list") return adminOrdersList();

    if (procedure === "admin.orders.updateStatus") {
      if (!inp || inp.id == null) throw new TRPCError("id is required", "BAD_REQUEST");
      return adminOrdersUpdateStatus(Number(inp.id), String(inp.status || ""));
    }

    if (procedure === "admin.orders.markAdvancePaid") {
      if (!isMutation) throw new TRPCError("markAdvancePaid must be a mutation", "METHOD_NOT_SUPPORTED");
      if (!inp || inp.id == null) throw new TRPCError("id is required", "BAD_REQUEST");
      return adminOrdersMarkAdvancePaid(Number(inp.id));
    }

    if (procedure === "admin.stats") return adminStats();

    // ── promo codes ──
    if (procedure === "admin.promos.list") return adminPromosList();
    if (procedure === "admin.promos.create") return adminPromosCreate(inp);

    if (procedure === "admin.promos.update") {
      if (!inp || inp.id == null) throw new TRPCError("id is required", "BAD_REQUEST");
      return adminPromosUpdate(Number(inp.id), inp.data || inp);
    }

    if (procedure === "admin.promos.delete") {
      if (!isMutation) throw new TRPCError("Delete must be a mutation", "METHOD_NOT_SUPPORTED");
      if (!inp || inp.id == null) throw new TRPCError("id is required", "BAD_REQUEST");
      return adminPromosDelete(Number(inp.id));
    }

    // ── reviews ──
    if (procedure === "admin.reviews.list") return adminReviewsList();

    if (procedure === "admin.reviews.updateStatus") {
      if (!inp || inp.id == null) throw new TRPCError("id is required", "BAD_REQUEST");
      return adminReviewsUpdateStatus(Number(inp.id), String(inp.status || ""));
    }

    if (procedure === "admin.reviews.delete") {
      if (!isMutation) throw new TRPCError("Delete must be a mutation", "METHOD_NOT_SUPPORTED");
      if (!inp || inp.id == null) throw new TRPCError("id is required", "BAD_REQUEST");
      return adminReviewsDelete(Number(inp.id));
    }

    // ── reporting ──
    if (procedure === "admin.analytics") return adminAnalytics();
    if (procedure === "admin.payments.list") return adminPaymentsList();

    throw new TRPCError(`Procedure not found: ${procedure}`, "NOT_FOUND");
  }

  // ── promos ──
  if (procedure === "promos.validate") {
    if (!inp || !inp.code) throw new TRPCError("code is required", "BAD_REQUEST");
    return promosValidate(String(inp.code));
  }

  // ── reviews ──
  if (procedure === "reviews.byProduct") {
    if (!inp || inp.productId == null || inp.productId === "") throw new TRPCError("productId is required", "BAD_REQUEST");
    return reviewsByProduct(Number(inp.productId));
  }

  if (procedure === "reviews.canReview") {
    if (!inp || inp.productId == null || inp.productId === "") throw new TRPCError("productId is required", "BAD_REQUEST");
    return reviewsCanReview(Number(inp.productId), String(inp.orderNumber || ""), String(inp.email || ""));
  }

  if (procedure === "reviews.create") {
    // Public, but gated on proving a real purchase inside the handler.
    if (!isMutation) throw new TRPCError("reviews.create must be a mutation", "METHOD_NOT_SUPPORTED");
    if (!inp || inp.productId == null || inp.productId === "") throw new TRPCError("productId is required", "BAD_REQUEST");
    return reviewsCreate(Number(inp.productId), inp);
  }

  // ── stripe ──
  if (procedure === "stripe.createCheckoutSession") {
    const user = await requireUser(req);
    if (!inp) throw new TRPCError("Input required", "BAD_REQUEST");
    const origin = req.headers.origin || `${req.protocol}://${req.get("host")}`;
    return stripeCreateCheckoutSession({
      user,
      cartItems: inp.cartItems || [],
      subtotal: Number(inp.subtotal || 0),
      shippingCost: Number(inp.shippingCost || 0),
      discountAmount: Number(inp.discountAmount || 0),
      promoCode: inp.promoCode,
      shippingAddress: inp.shippingAddress || "",
      shippingCity: inp.shippingCity || "",
      shippingState: inp.shippingState,
      shippingZipCode: inp.shippingZipCode || "",
      shippingCountry: inp.shippingCountry || "",
      customerEmail: inp.customerEmail || "",
      customerPhone: inp.customerPhone,
      origin,
    });
  }

  if (procedure === "stripe.getSession") {
    if (!inp || !inp.sessionId) throw new TRPCError("sessionId is required", "BAD_REQUEST");
    return stripeGetSession(String(inp.sessionId));
  }

  // ── system.health ──
  if (procedure === "system.health" || procedure === "health") return { status: "ok" };

  throw new TRPCError(`Procedure not found: ${procedure}`, "NOT_FOUND");
}

// ─── Main tRPC batch handler ──────────────────────────────────────────────────

app.all("/api/trpc/:procedures", async (req, res) => {
  const procNames = req.params.procedures.split(",").map((p) => p.trim()).filter(Boolean);
  const isMutation = req.method === "POST";

  // ── Parse inputs ──
  const inputs = {};

  if (isMutation) {
    const body = req.body || {};
    if (body && typeof body === "object") {
      for (const [k, v] of Object.entries(body)) {
        const idx = parseInt(k, 10);
        if (Number.isFinite(idx)) inputs[idx] = v;
      }
    }
  } else {
    // GET: input param is a JSON object keyed by index. Express already
    // URL-decodes query params.
    const raw = req.query.input || "{}";
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
          const idx = parseInt(k, 10);
          if (Number.isFinite(idx)) inputs[idx] = v;
        }
      }
    } catch {
      // leave inputs empty
    }
  }

  // ── Dispatch each procedure ──
  const results = [];
  for (let idx = 0; idx < procNames.length; idx++) {
    const procName = procNames[idx];
    try {
      const data = await dispatchProcedure(procName, inputs[idx], isMutation, req, res);
      results.push(trpcOk(data));
    } catch (err) {
      if (err instanceof TRPCError) {
        results.push(trpcErr(err.message, err.code, err.httpStatus));
      } else {
        console.error(err);
        results.push(trpcErr(err.message || String(err), "INTERNAL_SERVER_ERROR", 500));
      }
    }
  }

  res.json(results);
});

// ─── Demo login endpoint (for testing without OAuth) ─────────────────────────

app.post("/api/auth/demo-login", async (req, res) => {
  const body = req.body || {};
  const name = body.name || "Demo User";
  const email = body.email || "demo@whipandpour.com";
  const openId = `demo_${email.replace("@", "_").replace(/\./g, "_")}`;

  let user = await User.findOne({ where: { openId } });
  if (!user) {
    user = await User.create({ openId, name, email, loginMethod: "demo", role: "user" });
  }

  const sessionId = createSession(user.id);
  setSessionCookie(res, sessionId);
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post("/api/auth/admin-login", async (req, res) => {
  const body = req.body || {};
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required" });
  }

  const user = await User.findOne({ where: sequelizeWhere(fn("LOWER", col("email")), email) });

  // One generic message for every failure mode, so the response cannot be
  // used to discover which admin emails exist.
  if (!user || user.role !== "admin" || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ success: false, message: "Invalid email or password" });
  }

  user.lastSignedIn = new Date();
  await user.save();

  const sessionId = createSession(user.id);
  setSessionCookie(res, sessionId);
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get("/api/auth/demo-logout", (req, res) => {
  const sessionId = getSessionIdFromRequest(req);
  if (sessionId) destroySession(sessionId);
  clearSessionCookie(res);
  res.json({ success: true });
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "whipandpour-node-backend" });
});

// ─── SEO: sitemap + robots ─────────────────────────────────────────────────────
// Registered before the SPA catch-all below, and as plain routes rather than
// tRPC procedures since they're consumed by crawlers, not the frontend's
// tRPC client.

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

app.get("/sitemap.xml", async (req, res) => {
  const storeUrl = (process.env.STORE_URL || "https://whipandpour.com").replace(/\/$/, "");
  const products = await Product.findAll({ where: { isActive: true }, order: [["id", "ASC"]] });

  const urls = [
    [`${storeUrl}/`, null, "1.0"],
    [`${storeUrl}/shop`, null, "0.9"],
    [`${storeUrl}/about`, null, "0.5"],
    [`${storeUrl}/contact`, null, "0.5"],
  ];
  for (const p of products) {
    const lastmod = p.updatedAt ? new Date(p.updatedAt).toISOString() : null;
    urls.push([`${storeUrl}/product/${p.slug}`, lastmod, "0.8"]);
  }

  const entries = urls.map(([loc, lastmod, priority]) =>
    "  <url>\n" +
    `    <loc>${escapeXml(loc)}</loc>\n` +
    (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : "") +
    `    <priority>${priority}</priority>\n` +
    "  </url>"
  ).join("\n");

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${entries}\n</urlset>`;

  res.type("application/xml").send(xml);
});

app.get("/robots.txt", (req, res) => {
  const storeUrl = (process.env.STORE_URL || "https://whipandpour.com").replace(/\/$/, "");
  res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${storeUrl}/sitemap.xml\n`);
});

// ─── Serve built frontend (production mode) ───────────────────────────────────
// The React frontend is built into ../frontend/dist
// Run: cd ../frontend && npm run build   first.
// This block serves index.html for all unmatched routes (SPA fallback).

const frontendDist = path.join(__dirname, "..", "frontend", "dist");

if (fs.existsSync(frontendDist) && fs.statSync(frontendDist).isDirectory()) {
  const assetsDir = path.join(frontendDist, "assets");
  if (fs.existsSync(assetsDir)) {
    app.use("/assets", express.static(assetsDir));
  }

  // Everything copied from `public/` (product images, favicon, robots.txt,
  // .htaccess) that isn't under /assets — serves a real file when one
  // exists, falls through to the SPA index otherwise.
  app.use(express.static(frontendDist, { index: false }));

  app.get("*", (req, res) => {
    const indexPath = path.join(frontendDist, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ message: "Frontend not built. Run: cd ../frontend && npm run build" });
    }
  });
} else {
  app.get("/", (req, res) => {
    res.json({
      message: "Whip & Pour API is running",
      hint: "Build the frontend with: cd ../frontend && npm run build",
    });
  });
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT || 8000);

async function start() {
  console.log("[Startup] Initializing database…");
  await initDb();
  console.log("[Startup] Database ready.");

  app.use("/api/admin/upload", uploadRouter);
app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Startup] Listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[Startup] Failed to start:", err);
  process.exit(1);
});

module.exports = app;
