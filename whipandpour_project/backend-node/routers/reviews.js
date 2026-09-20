/**
 * routers/reviews.js — Product reviews.
 * Node port of routers/reviews.py.
 * Mirrors: reviews.byProduct, reviews.canReview, reviews.create
 */

const { fn, col, where: sequelizeWhere } = require("sequelize");
const { Review, User, Order, OrderItem } = require("../db");
const { TRPCError } = require("../auth");

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const REVIEW_BODY_MAX = 2000;
const REVIEW_TITLE_MAX = 200;

function serializeReview(r, user) {
  return {
    id: r.id,
    productId: r.productId,
    userId: r.userId,
    // The reviews list renders a name; join it here rather than letting the
    // frontend invent one.
    userName: (user && user.name) || "Verified Customer",
    rating: r.rating,
    title: r.title,
    status: r.status,
    body: r.body,
    isVerifiedPurchase: Boolean(r.isVerifiedPurchase),
    helpful: r.helpful || 0,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
  };
}

async function reviewsByProduct(productId) {
  const rows = await Review.findAll({
    // Only approved reviews reach the storefront — moderation in the admin
    // panel is what gates this.
    where: { productId, status: "approved" },
    order: [["createdAt", "DESC"]],
  });
  const result = [];
  for (const review of rows) {
    const user = await User.findByPk(review.userId);
    result.push(serializeReview(review, user));
  }
  return result;
}

/**
 * Return the (order, user) that entitles this person to review the product.
 *
 * Reviews are gated on an actual purchase, not on being logged in. This store
 * has guest checkout, so the proof is the order number plus the email the
 * order was placed with — the same pair shown on the confirmation screen.
 */
async function findVerifiedPurchase(productId, orderNumber, email) {
  const found = await Order.findOne({
    where: sequelizeWhere(fn("UPPER", col("orderNumber")), orderNumber.trim().toUpperCase()),
  });

  if (!found) {
    throw new TRPCError("We couldn't find that order number. Check your confirmation email.", "NOT_FOUND");
  }

  if ((found.customerEmail || "").trim().toLowerCase() !== email.trim().toLowerCase()) {
    // Deliberately vague: this must not become a way to discover which email
    // placed a given order.
    throw new TRPCError("That order number and email address don't match.", "FORBIDDEN");
  }

  const bought = await OrderItem.findOne({ where: { orderId: found.id, productId } });
  if (!bought) {
    throw new TRPCError("That order doesn't include this product, so it can't be reviewed from it.", "FORBIDDEN");
  }

  const user = await User.findByPk(found.userId);
  return { order: found, user };
}

async function reviewsCanReview(productId, orderNumber, email) {
  let order, user;
  try {
    ({ order, user } = await findVerifiedPurchase(productId, orderNumber, email));
  } catch (err) {
    if (err instanceof TRPCError) return { eligible: false, reason: err.message };
    throw err;
  }

  const existing = await Review.findOne({ where: { productId, userId: order.userId } });
  if (existing) return { eligible: false, reason: "You've already reviewed this product." };

  return { eligible: true, reason: null, orderNumber: order.orderNumber };
}

async function reviewsCreate(productId, data) {
  const orderNumber = String(data.orderNumber || "").trim();
  const email = String(data.email || "").trim();

  if (!orderNumber) throw new TRPCError("Your order number is required", "BAD_REQUEST");
  if (!EMAIL_RE.test(email)) throw new TRPCError("Enter the email address used on the order", "BAD_REQUEST");

  const rating = parseInt(data.rating, 10);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new TRPCError("Choose a rating from 1 to 5", "BAD_REQUEST");
  }

  const title = String(data.title || "").trim().slice(0, REVIEW_TITLE_MAX);
  const body = String(data.body || data.content || "").trim();
  if (body.length < 10) throw new TRPCError("Please write at least a sentence about the product", "BAD_REQUEST");
  if (body.length > REVIEW_BODY_MAX) throw new TRPCError("Your review is too long", "BAD_REQUEST");

  const { user } = await findVerifiedPurchase(productId, orderNumber, email);
  if (!user) throw new TRPCError("We couldn't match that order to a customer", "NOT_FOUND");

  const already = await Review.findOne({ where: { productId, userId: user.id } });
  if (already) {
    throw new TRPCError("You've already reviewed this product. Contact us to change your review.", "CONFLICT");
  }

  const review = await Review.create({
    productId, userId: user.id, rating,
    title: title || null, body,
    // Proven against a real order — this is not a self-declared flag.
    isVerifiedPurchase: true,
    // Held for moderation; the admin Reviews page decides what goes live.
    status: "pending", helpful: 0,
    createdAt: new Date(), updatedAt: new Date(),
  });

  return {
    id: review.id,
    status: review.status,
    message: "Thank you! Your review has been submitted and will appear on the product page once our team has checked it.",
  };
}

module.exports = { reviewsByProduct, reviewsCanReview, reviewsCreate };
