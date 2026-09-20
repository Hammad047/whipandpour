/**
 * routers/admin.js — Admin-only handlers backing the admin panel.
 * Node port of routers/admin.py.
 *
 * Every procedure exported here is registered behind requireAdmin in
 * server.js. Nothing here may be reachable without an authenticated session
 * whose user row has role === 'admin'.
 */

const { Op } = require("sequelize");
const { CATEGORY_VALUES, Order, OrderItem, Product, User, PromoCode, Review } = require("../db");
const { TRPCError } = require("../auth");
const { serializeProduct } = require("./products");
const { Decimal, q2, money } = require("../money");

// ─── Validation helpers ──────────────────────────────────────────────────────
// The frontend validates for UX; this is the trust boundary. Every field that
// reaches the database goes through one of these.

const MAX_IMAGES = 5;

function requireStr(data, field, { maxLen, required = true }) {
  const value = data[field];
  if (value == null || (typeof value === "string" && !value.trim())) {
    if (required) throw new TRPCError(`${field} is required`, "BAD_REQUEST");
    return "";
  }
  if (typeof value !== "string") throw new TRPCError(`${field} must be text`, "BAD_REQUEST");
  const trimmed = value.trim();
  if (trimmed.length > maxLen) throw new TRPCError(`${field} must be ${maxLen} characters or fewer`, "BAD_REQUEST");
  return trimmed;
}

function requirePrice(data, field = "price") {
  const raw = data[field];
  if (raw == null || raw === "") throw new TRPCError(`${field} is required`, "BAD_REQUEST");
  let price;
  try {
    price = new Decimal(String(raw));
  } catch {
    throw new TRPCError(`${field} must be a number`, "BAD_REQUEST");
  }
  if (price.lte(0)) throw new TRPCError(`${field} must be greater than zero`, "BAD_REQUEST");
  if (price.gt(new Decimal("99999999.99"))) throw new TRPCError(`${field} is out of range`, "BAD_REQUEST");
  return q2(price);
}

function requireInt(data, field, { minimum = 0, maximum = 1_000_000 } = {}) {
  const raw = data[field];
  if (raw == null || raw === "") throw new TRPCError(`${field} is required`, "BAD_REQUEST");
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new TRPCError(`${field} must be a whole number`, "BAD_REQUEST");
  }
  if (value < minimum || value > maximum) {
    throw new TRPCError(`${field} must be between ${minimum} and ${maximum}`, "BAD_REQUEST");
  }
  return value;
}

function requireCategory(data) {
  const category = data.category;
  if (!CATEGORY_VALUES.includes(category)) {
    throw new TRPCError(`category must be one of: ${CATEGORY_VALUES.join(", ")}`, "BAD_REQUEST");
  }
  return category;
}

function stringList(data, field, { maxItems = 20, maxLen = 120 } = {}) {
  let raw = data[field] || [];
  if (typeof raw === "string") raw = raw.split(",").map((s) => s.trim());
  if (!Array.isArray(raw)) throw new TRPCError(`${field} must be a list`, "BAD_REQUEST");
  const cleaned = raw.map((item) => String(item).trim()).filter(Boolean);
  if (cleaned.length > maxItems) throw new TRPCError(`${field} accepts at most ${maxItems} entries`, "BAD_REQUEST");
  for (const item of cleaned) {
    if (item.length > maxLen) throw new TRPCError(`${field} entries are too long`, "BAD_REQUEST");
  }
  return cleaned;
}

function slugify(value) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "product";
}

async function uniqueSlug(base, { excludeId } = {}) {
  let slug = base;
  let counter = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const where = { slug };
    if (excludeId != null) where.id = { [Op.ne]: excludeId };
    const clash = await Product.findOne({ where });
    if (!clash) return slug;
    counter += 1;
    slug = `${base}-${counter}`;
  }
}

async function validateProductPayload(data, { productId } = {}) {
  if (!data || typeof data !== "object") throw new TRPCError("Product data is required", "BAD_REQUEST");

  const name = requireStr(data, "name", { maxLen: 255 });
  const description = requireStr(data, "description", { maxLen: 5000 });
  const category = requireCategory(data);
  // `price` is the 220ml price; `price300` the 300ml price — every product
  // is sold in exactly these two sizes (see buildTwoSizeOptions()).
  const price = requirePrice(data, "price");
  const price300 = requirePrice(data, "price300");
  const stock = requireInt(data, "stock", { minimum: 0, maximum: 1_000_000 });

  // Slug policy: generated from the name on create, then stable. Renaming a
  // product must not silently change its public /product/<slug> URL and
  // break every existing link, bookmark and search result. Pass an explicit
  // `slug` to change it deliberately.
  const requestedSlug = String(data.slug || "").trim();
  let slug;
  if (requestedSlug) {
    slug = await uniqueSlug(slugify(requestedSlug), { excludeId: productId });
  } else if (productId != null) {
    const existing = await Product.findByPk(productId);
    slug = existing ? existing.slug : await uniqueSlug(slugify(name));
  } else {
    slug = await uniqueSlug(slugify(name));
  }

  const images = stringList(data, "images", { maxItems: MAX_IMAGES, maxLen: 2000 });
  for (const url of images) {
    if (!(url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/"))) {
      throw new TRPCError("Image URLs must start with http://, https:// or /", "BAD_REQUEST");
    }
  }

  return {
    name, slug, description, category,
    price: price.toFixed(2),
    stock,
    images: JSON.stringify(images),
    scentNotes: JSON.stringify(stringList(data, "scentNotes")),
    burnTime: requireStr(data, "burnTime", { maxLen: 100, required: false }) || null,
    waxType: requireStr(data, "waxType", { maxLen: 100, required: false }) || null,
    sizeOptions: buildTwoSizeOptions(price, price300),
    isFeatured: Boolean(data.isFeatured),
    isBestseller: Boolean(data.isBestseller),
    isLimitedEdition: Boolean(data.isLimitedEdition),
  };
}

/**
 * Every product is sold in exactly two sizes — a 220ml and a 300ml glass —
 * each with its own admin-set price. `Product.price` stays the 220ml price
 * so existing sorting/filtering (which reads that one column) keeps working;
 * the 300ml price lives only in this JSON column.
 */
function buildTwoSizeOptions(price220, price300) {
  return JSON.stringify([
    { size: "220ml", ml: 220, price: price220.toFixed(2) },
    { size: "300ml", ml: 300, price: price300.toFixed(2) },
  ]);
}

// ─── Products ────────────────────────────────────────────────────────────────

async function adminSerialize(p) {
  const data = serializeProduct(p);
  data.isActive = Boolean(p.isActive);
  data.orderItemCount = await OrderItem.count({ where: { productId: p.id } });
  return data;
}

async function adminProductsList() {
  // Every product, newest first. Includes soft-deleted rows.
  const rows = await Product.findAll({ order: [["createdAt", "DESC"], ["id", "DESC"]] });
  return Promise.all(rows.map(adminSerialize));
}

async function adminProductsCreate(data) {
  const values = await validateProductPayload(data);
  try {
    const product = await Product.create({ ...values, averageRating: 0, reviewCount: 0, viewCount: 0, isActive: true });
    return adminSerialize(product);
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      throw new TRPCError("A product with that slug already exists", "CONFLICT");
    }
    throw err;
  }
}

async function adminProductsUpdate(productId, data) {
  const product = await Product.findByPk(productId);
  if (!product) throw new TRPCError("Product not found", "NOT_FOUND");

  const values = await validateProductPayload(data, { productId });
  Object.assign(product, values);

  if (data && "isActive" in data) product.isActive = Boolean(data.isActive);

  try {
    await product.save();
    return adminSerialize(product);
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      throw new TRPCError("A product with that slug already exists", "CONFLICT");
    }
    throw err;
  }
}

/**
 * A product referenced by an existing order is deactivated rather than
 * removed, so order history keeps resolving.
 */
async function adminProductsDelete(productId) {
  const product = await Product.findByPk(productId);
  if (!product) throw new TRPCError("Product not found", "NOT_FOUND");

  const referenced = await OrderItem.count({ where: { productId } });
  if (referenced) {
    product.isActive = false;
    await product.save();
    return {
      id: productId, deleted: false, deactivated: true,
      message: `This product appears in ${referenced} order item(s), so it was hidden from the store instead of deleted. Order history is preserved.`,
    };
  }

  await product.destroy();
  return { id: productId, deleted: true, deactivated: false, message: "Product deleted" };
}

// ─── Inventory ───────────────────────────────────────────────────────────────

async function adminInventoryRestock(productId, amount) {
  if (amount <= 0) throw new TRPCError("Restock amount must be greater than zero", "BAD_REQUEST");
  if (amount > 100_000) throw new TRPCError("Restock amount is too large", "BAD_REQUEST");

  const product = await Product.findByPk(productId);
  if (!product) throw new TRPCError("Product not found", "NOT_FOUND");

  product.stock = (product.stock || 0) + amount;
  await product.save();
  return adminSerialize(product);
}

async function adminInventorySetStock(productId, stock) {
  if (stock < 0) throw new TRPCError("Stock cannot be negative", "BAD_REQUEST");

  const product = await Product.findByPk(productId);
  if (!product) throw new TRPCError("Product not found", "NOT_FOUND");

  product.stock = stock;
  await product.save();
  return adminSerialize(product);
}

// ─── Customers ───────────────────────────────────────────────────────────────

async function adminCustomersList() {
  const customers = await User.findAll({ where: { role: "user" }, order: [["createdAt", "DESC"]] });

  const results = [];
  for (const user of customers) {
    const orders = await Order.findAll({ where: { userId: user.id }, order: [["createdAt", "DESC"]] });
    const totalSpent = orders.reduce((sum, o) => sum.plus(new Decimal(String(o.total || 0))), new Decimal(0));
    results.push({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      city: user.city,
      orderCount: orders.length,
      totalSpent: totalSpent.toFixed(2),
      joinDate: user.createdAt ? new Date(user.createdAt).toISOString() : null,
      lastOrderDate: orders.length ? new Date(orders[0].createdAt).toISOString() : null,
      // Most recent order first — this is the Order ID column.
      latestOrderNumber: orders.length ? orders[0].orderNumber : null,
      latestOrderId: orders.length ? orders[0].id : null,
      orders: orders.map((o) => ({
        id: o.id, orderNumber: o.orderNumber, status: o.status, paymentStatus: o.paymentStatus,
        total: money(o.total), createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : null,
      })),
    });
  }
  return results;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

const ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"];

async function adminOrdersList() {
  const orders = await Order.findAll({ order: [["createdAt", "DESC"]] });

  const results = [];
  for (const o of orders) {
    const user = await User.findByPk(o.userId);
    const items = await OrderItem.findAll({ where: { orderId: o.id } });
    results.push({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: (user && user.name) || o.customerEmail,
      customerEmail: o.customerEmail,
      customerPhone: o.customerPhone,
      userId: o.userId,
      status: o.status,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      stripePaymentIntentId: o.stripePaymentIntentId,
      total: money(o.total),
      subtotal: money(o.subtotal),
      shippingCost: money(o.shippingCost || 0),
      discountAmount: money(o.discountAmount || 0),
      promoCode: o.promoCode,
      shippingAddress: o.shippingAddress,
      shippingCity: o.shippingCity,
      shippingZipCode: o.shippingZipCode,
      shippingCountry: o.shippingCountry,
      trackingNumber: o.trackingNumber,
      giftPackaging: Boolean(o.giftPackaging),
      giftPackagingFee: money(o.giftPackagingFee || 0),
      giftCardMessage: o.giftCardMessage,
      giftRecipientName: o.giftRecipientName,
      giftSenderName: o.giftSenderName,
      advanceRequired: Boolean(o.advanceRequired),
      advanceAmount: money(o.advanceAmount || 0),
      advancePaid: Boolean(o.advancePaid),
      balanceDueAmount: money(o.balanceDueAmount || 0),
      itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
      items: items.map((i) => ({
        id: i.id, productId: i.productId, quantity: i.quantity,
        unitPrice: money(i.unitPrice), size: i.size,
      })),
      createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : null,
    });
  }
  return results;
}

async function adminOrdersUpdateStatus(orderId, status) {
  if (!ORDER_STATUSES.includes(status)) {
    throw new TRPCError(`status must be one of: ${ORDER_STATUSES.join(", ")}`, "BAD_REQUEST");
  }
  const order = await Order.findByPk(orderId);
  if (!order) throw new TRPCError("Order not found", "NOT_FOUND");

  order.status = status;
  await order.save();
  return { id: order.id, orderNumber: order.orderNumber, status: order.status };
}

/**
 * Record that staff have manually confirmed the advance payment for an
 * order that required one. This never touches paymentStatus — the advance
 * is a separate, partial amount, tracked so it isn't mistaken for the order
 * being fully paid.
 */
async function adminOrdersMarkAdvancePaid(orderId) {
  const order = await Order.findByPk(orderId);
  if (!order) throw new TRPCError("Order not found", "NOT_FOUND");
  if (!order.advanceRequired) throw new TRPCError("This order does not require an advance payment", "BAD_REQUEST");

  order.advancePaid = true;
  await order.save();
  return { id: order.id, orderNumber: order.orderNumber, advancePaid: order.advancePaid };
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

async function adminStats() {
  const products = await Product.findAll({ where: { isActive: true } });
  const orders = await Order.findAll();

  const revenue = orders
    .filter((o) => o.paymentStatus === "completed")
    .reduce((sum, o) => sum.plus(new Decimal(String(o.total || 0))), new Decimal(0));

  const byCategory = {};
  for (const p of products) byCategory[p.category] = (byCategory[p.category] || 0) + 1;

  return {
    productCount: products.length,
    outOfStock: products.filter((p) => (p.stock || 0) === 0).length,
    lowStock: products.filter((p) => (p.stock || 0) > 0 && (p.stock || 0) < 10).length,
    customerCount: await User.count({ where: { role: "user" } }),
    orderCount: orders.length,
    pendingOrders: orders.filter((o) => o.status === "pending").length,
    // Only payments a gateway actually confirmed count towards revenue.
    confirmedRevenue: revenue.toFixed(2),
    awaitingPayment: orders.filter((o) => o.paymentStatus === "pending").length,
    // Orders needing gift packaging that have not shipped yet.
    giftOrdersToPack: orders.filter((o) => o.giftPackaging && ["pending", "processing"].includes(o.status)).length,
    productsByCategory: byCategory,
  };
}

// ─── Promo codes ─────────────────────────────────────────────────────────────
// These are the codes shoppers type at checkout. Editing one here changes
// what promos.validate accepts and what createOrderFromCart() will discount.

const DISCOUNT_TYPES = ["percent", "flat"];

function serializePromoAdmin(p) {
  return {
    id: p.id,
    code: p.code,
    discountType: p.discountType,
    value: money(p.value),
    usageLimit: p.usageLimit,
    usedCount: p.usedCount || 0,
    expiryDate: p.expiryDate ? new Date(p.expiryDate).toISOString() : null,
    isActive: Boolean(p.isActive),
    applicableCategory: p.applicableCategory,
    minOrderAmount: money(p.minOrderAmount || 0),
    firstOrderOnly: Boolean(p.firstOrderOnly),
    createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
  };
}

async function validatePromoPayload(data, { promoId } = {}) {
  if (!data || typeof data !== "object") throw new TRPCError("Promo data is required", "BAD_REQUEST");

  const code = requireStr(data, "code", { maxLen: 50 }).toUpperCase();
  if (!/^[A-Z0-9_-]{3,50}$/.test(code)) {
    throw new TRPCError("Code must be 3–50 characters, letters, numbers, - or _ only", "BAD_REQUEST");
  }

  const clashWhere = { code };
  if (promoId != null) clashWhere.id = { [Op.ne]: promoId };
  if (await PromoCode.findOne({ where: clashWhere })) {
    throw new TRPCError(`Promo code ${code} already exists`, "CONFLICT");
  }

  const discountType = data.discountType || data.type;
  if (!DISCOUNT_TYPES.includes(discountType)) {
    throw new TRPCError("discountType must be 'percent' or 'flat'", "BAD_REQUEST");
  }

  let value;
  try {
    value = new Decimal(String(data.value));
  } catch {
    throw new TRPCError("value must be a number", "BAD_REQUEST");
  }
  if (value.lte(0)) throw new TRPCError("value must be greater than zero", "BAD_REQUEST");
  if (discountType === "percent" && value.gt(100)) {
    throw new TRPCError("A percentage discount cannot exceed 100", "BAD_REQUEST");
  }

  let usageLimit = data.usageLimit;
  if (usageLimit == null || usageLimit === "" || usageLimit === 0) {
    usageLimit = null;
  } else {
    usageLimit = requireInt({ usageLimit }, "usageLimit", { minimum: 1, maximum: 1_000_000 });
  }

  let expiryDate = null;
  if (data.expiryDate) {
    const parsed = new Date(String(data.expiryDate).slice(0, 19));
    if (Number.isNaN(parsed.getTime())) {
      throw new TRPCError("expiryDate must be a date (YYYY-MM-DD)", "BAD_REQUEST");
    }
    expiryDate = parsed;
  }

  const category = data.applicableCategory || "all";
  if (category !== "all" && !CATEGORY_VALUES.includes(category)) {
    throw new TRPCError(`applicableCategory must be 'all' or one of: ${CATEGORY_VALUES.join(", ")}`, "BAD_REQUEST");
  }

  let minOrder;
  try {
    minOrder = new Decimal(String(data.minOrderAmount || 0));
  } catch {
    throw new TRPCError("minOrderAmount must be a number", "BAD_REQUEST");
  }
  if (minOrder.lt(0)) throw new TRPCError("minOrderAmount cannot be negative", "BAD_REQUEST");

  return {
    code, discountType,
    value: q2(value).toFixed(2),
    usageLimit, expiryDate,
    isActive: data.isActive == null ? true : Boolean(data.isActive),
    applicableCategory: category,
    minOrderAmount: q2(minOrder).toFixed(2),
    firstOrderOnly: Boolean(data.firstOrderOnly),
  };
}

async function adminPromosList() {
  const rows = await PromoCode.findAll({ order: [["createdAt", "DESC"], ["id", "DESC"]] });
  return rows.map(serializePromoAdmin);
}

async function adminPromosCreate(data) {
  const values = await validatePromoPayload(data);
  try {
    const promo = await PromoCode.create({ ...values, usedCount: 0 });
    return serializePromoAdmin(promo);
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") throw new TRPCError("That promo code already exists", "CONFLICT");
    throw err;
  }
}

async function adminPromosUpdate(promoId, data) {
  const promo = await PromoCode.findByPk(promoId);
  if (!promo) throw new TRPCError("Promo code not found", "NOT_FOUND");

  const values = await validatePromoPayload(data, { promoId });
  Object.assign(promo, values);
  await promo.save();
  return serializePromoAdmin(promo);
}

async function adminPromosDelete(promoId) {
  const promo = await PromoCode.findByPk(promoId);
  if (!promo) throw new TRPCError("Promo code not found", "NOT_FOUND");

  // Orders store the code as a plain string, so deleting it does not corrupt
  // order history — but say so, because the number matters to the operator.
  const usedOn = await Order.count({ where: { promoCode: promo.code } });
  const code = promo.code;
  await promo.destroy();
  return {
    id: promoId, code,
    message: usedOn ? `${code} deleted. ${usedOn} past order(s) still record this code.` : `${code} deleted.`,
  };
}

// ─── Reviews ─────────────────────────────────────────────────────────────────
// Moderation. A review only appears on a product page once approved, and the
// product's rating is recomputed from approved reviews whenever that changes.

const REVIEW_STATUSES = ["pending", "approved", "rejected"];

/**
 * Recompute averageRating and reviewCount from approved reviews only.
 * Called after any moderation action so the storefront rating always
 * matches what a shopper can actually read on the page.
 */
async function recalculateProductRating(productId) {
  const approved = await Review.findAll({ where: { productId, status: "approved" } });
  const product = await Product.findByPk(productId);
  if (!product) return;

  // Combine locally-moderated reviews with the historical aggregate imported
  // from the live store, so rejecting one review moves the count by one
  // rather than collapsing a long history down to the rows we happen to hold.
  const importedCount = product.importedReviewCount || 0;
  const importedSum = Number(product.importedRatingSum || 0);

  const totalCount = importedCount + approved.length;
  const totalSum = importedSum + approved.reduce((s, r) => s + r.rating, 0);

  if (totalCount > 0) {
    product.averageRating = (Math.round((totalSum / totalCount) * 100) / 100).toFixed(2);
    product.reviewCount = totalCount;
  } else {
    product.averageRating = "0.00";
    product.reviewCount = 0;
  }
  await product.save();
}

async function adminReviewsList() {
  const rows = await Review.findAll({ order: [["createdAt", "DESC"]] });
  const results = [];
  for (const review of rows) {
    const user = await User.findByPk(review.userId);
    const product = await Product.findByPk(review.productId);
    results.push({
      id: review.id,
      productId: review.productId,
      productName: product ? product.name : "(deleted product)",
      customerName: (user && user.name) || "Guest",
      customerEmail: (user && user.email) || "",
      rating: review.rating,
      title: review.title || "",
      body: review.body || "",
      status: review.status,
      isVerifiedPurchase: Boolean(review.isVerifiedPurchase),
      helpful: review.helpful || 0,
      createdAt: review.createdAt ? new Date(review.createdAt).toISOString() : null,
    });
  }
  return results;
}

async function adminReviewsUpdateStatus(reviewId, status) {
  if (!REVIEW_STATUSES.includes(status)) {
    throw new TRPCError(`status must be one of: ${REVIEW_STATUSES.join(", ")}`, "BAD_REQUEST");
  }
  const review = await Review.findByPk(reviewId);
  if (!review) throw new TRPCError("Review not found", "NOT_FOUND");

  review.status = status;
  await review.save();
  await recalculateProductRating(review.productId);
  return { id: review.id, productId: review.productId, status: review.status };
}

async function adminReviewsDelete(reviewId) {
  const review = await Review.findByPk(reviewId);
  if (!review) throw new TRPCError("Review not found", "NOT_FOUND");

  const productId = review.productId;
  await review.destroy();
  await recalculateProductRating(productId);
  return { id: reviewId, productId, deleted: true };
}

// ─── Analytics ───────────────────────────────────────────────────────────────

/**
 * Sales reporting derived entirely from the orders table.
 * `totalRevenue` counts every placed order (what the store has sold);
 * `confirmedRevenue` counts only orders a gateway has confirmed as paid.
 * They differ deliberately — do not merge them.
 */
async function adminAnalytics() {
  const orders = await Order.findAll({ order: [["createdAt", "ASC"]] });
  const items = await OrderItem.findAll();

  function bucket(fmt) {
    const grouped = new Map();
    for (const o of orders) {
      if (!o.createdAt) continue;
      const d = new Date(o.createdAt);
      let key;
      if (fmt === "day") key = d.toISOString().slice(0, 10);
      else if (fmt === "week") {
        const onejan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const week = Math.ceil(((d - onejan) / 86400000 + onejan.getUTCDay() + 1) / 7);
        key = `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
      } else key = d.toISOString().slice(0, 7);

      if (!grouped.has(key)) grouped.set(key, { label: key, revenue: 0, orders: 0 });
      const row = grouped.get(key);
      row.revenue += Number(o.total || 0);
      row.orders += 1;
    }
    return Array.from(grouped.values());
  }

  const units = {};
  const revenueByProduct = {};
  for (const i of items) {
    units[i.productId] = (units[i.productId] || 0) + i.quantity;
    revenueByProduct[i.productId] = (revenueByProduct[i.productId] || 0) + Number(i.unitPrice || 0) * i.quantity;
  }

  const products = {};
  for (const p of await Product.findAll()) products[p.id] = p;

  const topProducts = Object.entries(units)
    .map(([pid, qty]) => ({
      productId: Number(pid),
      name: products[pid] ? products[pid].name : "(deleted product)",
      category: products[pid] ? products[pid].category : null,
      unitsSold: qty,
      revenue: (Math.round((revenueByProduct[pid] || 0) * 100) / 100).toFixed(2),
    }))
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 10);

  const revenueByCategory = {};
  for (const [pid, amount] of Object.entries(revenueByProduct)) {
    const product = products[pid];
    if (product) revenueByCategory[product.category] = (revenueByCategory[product.category] || 0) + amount;
  }

  const totalRevenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const confirmed = orders.filter((o) => o.paymentStatus === "completed");

  return {
    daily: bucket("day").slice(-14),
    weekly: bucket("week").slice(-12),
    monthly: bucket("month").slice(-12),
    topProducts,
    revenueByCategory: Object.fromEntries(
      Object.entries(revenueByCategory).map(([k, v]) => [k, (Math.round(v * 100) / 100).toFixed(2)])
    ),
    ordersByStatus: Object.fromEntries(
      ORDER_STATUSES.map((status) => [status, orders.filter((o) => o.status === status).length])
    ),
    totalOrders: orders.length,
    totalRevenue: (Math.round(totalRevenue * 100) / 100).toFixed(2),
    confirmedRevenue: (Math.round(confirmed.reduce((s, o) => s + Number(o.total || 0), 0) * 100) / 100).toFixed(2),
    averageOrderValue: orders.length ? (Math.round((totalRevenue / orders.length) * 100) / 100).toFixed(2) : "0",
    unitsSold: Object.values(units).reduce((a, b) => a + b, 0),
  };
}

// ─── Payments ────────────────────────────────────────────────────────────────

/**
 * Payment records, derived from orders — there is no separate payments
 * table. Every row states plainly whether money has actually been
 * confirmed. Nothing here may present a pending order as paid.
 */
async function adminPaymentsList() {
  const orders = await Order.findAll({ order: [["createdAt", "DESC"]] });

  const records = [];
  for (const o of orders) {
    const user = await User.findByPk(o.userId);
    records.push({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: (user && user.name) || o.customerEmail,
      customerEmail: o.customerEmail,
      amount: money(o.total),
      method: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      orderStatus: o.status,
      gatewayReference: o.stripePaymentIntentId,
      // A method with no integration can never self-confirm; the admin
      // panel should say so rather than imply otherwise.
      requiresManualConfirmation: ["easypaisa", "jazzcash"].includes(o.paymentMethod),
      createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : null,
    });
  }

  const byMethod = {};
  for (const r of records) {
    if (!byMethod[r.method]) byMethod[r.method] = { method: r.method, count: 0, amount: 0 };
    byMethod[r.method].count += 1;
    byMethod[r.method].amount += Number(r.amount);
  }

  const sum = (filterFn) =>
    (Math.round(records.filter(filterFn).reduce((s, r) => s + Number(r.amount), 0) * 100) / 100).toFixed(2);

  return {
    records,
    byMethod: Object.values(byMethod).map((row) => ({ ...row, amount: (Math.round(row.amount * 100) / 100).toFixed(2) })),
    totals: {
      all: sum(() => true),
      confirmed: sum((r) => r.paymentStatus === "completed"),
      pending: sum((r) => r.paymentStatus === "pending"),
      failed: sum((r) => r.paymentStatus === "failed"),
    },
    counts: Object.fromEntries(
      ["pending", "completed", "failed", "refunded"].map((status) => [
        status, records.filter((r) => r.paymentStatus === status).length,
      ])
    ),
  };
}

module.exports = {
  adminProductsList, adminProductsCreate, adminProductsUpdate, adminProductsDelete,
  adminInventoryRestock, adminInventorySetStock,
  adminCustomersList,
  adminOrdersList, adminOrdersUpdateStatus, adminOrdersMarkAdvancePaid,
  adminStats,
  adminPromosList, adminPromosCreate, adminPromosUpdate, adminPromosDelete,
  adminReviewsList, adminReviewsUpdateStatus, adminReviewsDelete,
  adminAnalytics, adminPaymentsList,
};
