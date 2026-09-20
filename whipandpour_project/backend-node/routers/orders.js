/**
 * routers/orders.js — Order handlers.
 * Node port of routers/orders.py.
 * Mirrors: orders.list, orders.byId, orders.items, orders.create, orders.lookup
 */

const crypto = require("crypto");
const { fn, col, where: sequelizeWhere } = require("sequelize");
const { sequelize, Order, OrderItem, Product, User, PromoCode } = require("../db");
const { TRPCError } = require("../auth");
const { Decimal, q2, money } = require("../money");

// Payment methods the order system accepts. Selecting one records an intent —
// it never implies the money moved. See createOrderFromCart().
const PAYMENT_METHODS = ["stripe", "easypaisa", "jazzcash", "cod"];

// Matches the threshold advertised on whipandpour.com.
const FREE_SHIPPING_THRESHOLD = new Decimal("4000");
const SHIPPING_FLAT_RATE = new Decimal("200");

// ── Gifting ──
// Gift packaging is a paid add-on; the handwritten card is included with it.
// Change the fee here and it applies to new orders only — existing orders
// keep the fee stored on the order row.
const GIFT_PACKAGING_FEE = new Decimal("1000");
const GIFT_MESSAGE_MAX_LENGTH = 400;

// ── Advance payment ──
// If any single line item's unit price is at or above this threshold, the
// order requires a 30% advance before it ships. There is no payment gateway
// for it — the shopper sends it via the manual JazzCash/Easypaisa/bank flow
// and staff confirm receipt (admin.orders.markAdvancePaid). This never
// changes paymentStatus; it is tracked separately so a partially-paid order
// is never mistaken for a fully-paid one.
const ADVANCE_ITEM_THRESHOLD = new Decimal("2500");
const ADVANCE_PERCENT = new Decimal("0.30");

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^[0-9+\-\s()]{7,20}$/;

/**
 * Price a cart line by the size the shopper actually picked (220ml/300ml),
 * not the product's flat `price` column — each size has its own admin-set
 * price in `sizeOptions`. Never trust a price the client sends.
 */
function resolveSizePrice(product, size) {
  let options = [];
  try {
    options = product.sizeOptions ? JSON.parse(product.sizeOptions) : [];
  } catch {
    options = [];
  }

  for (const option of options) {
    if (option && typeof option === "object" && option.size === size && "price" in option) {
      try {
        return new Decimal(String(option.price));
      } catch {
        break;
      }
    }
  }

  if (!size && options.length) {
    // No size selected (legacy single-size cart entry) — use the first.
    const first = options[0];
    if (first && "price" in first) return new Decimal(String(first.price));
  }

  if (!options.length) {
    // Product predates per-size pricing and hasn't been migrated — fall
    // back to its flat price rather than failing the whole checkout.
    return new Decimal(String(product.price));
  }

  throw new TRPCError(
    `'${size}' is no longer a size option for ${product.name}. Please refresh your cart.`,
    "BAD_REQUEST"
  );
}

function serializeOrder(o) {
  return {
    id: o.id,
    userId: o.userId,
    orderNumber: o.orderNumber,
    status: o.status,
    total: money(o.total),
    subtotal: money(o.subtotal),
    shippingCost: o.shippingCost != null ? money(o.shippingCost) : "0.00",
    discountAmount: o.discountAmount != null ? money(o.discountAmount) : "0.00",
    promoCode: o.promoCode,
    shippingAddress: o.shippingAddress,
    shippingCity: o.shippingCity,
    shippingState: o.shippingState,
    shippingZipCode: o.shippingZipCode,
    shippingCountry: o.shippingCountry,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    stripePaymentIntentId: o.stripePaymentIntentId,
    trackingNumber: o.trackingNumber,
    customerEmail: o.customerEmail,
    customerPhone: o.customerPhone,
    notes: o.notes,
    giftPackaging: Boolean(o.giftPackaging),
    giftPackagingFee: money(o.giftPackagingFee || 0),
    giftCardMessage: o.giftCardMessage,
    giftRecipientName: o.giftRecipientName,
    giftSenderName: o.giftSenderName,
    advanceRequired: Boolean(o.advanceRequired),
    advanceAmount: money(o.advanceAmount || 0),
    advancePaid: Boolean(o.advancePaid),
    balanceDueAmount: money(o.balanceDueAmount || 0),
    createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : null,
    updatedAt: o.updatedAt ? new Date(o.updatedAt).toISOString() : null,
  };
}

function serializeOrderItem(i) {
  return {
    id: i.id,
    orderId: i.orderId,
    productId: i.productId,
    quantity: i.quantity,
    unitPrice: money(i.unitPrice),
    size: i.size,
    createdAt: i.createdAt ? new Date(i.createdAt).toISOString() : null,
  };
}

async function ordersList(userId) {
  const rows = await Order.findAll({ where: { userId }, order: [["createdAt", "DESC"]] });
  return rows.map(serializeOrder);
}

async function ordersById(orderId, userId) {
  const order = await Order.findByPk(orderId);
  if (!order || order.userId !== userId) throw new TRPCError("Order not found", "NOT_FOUND");
  return serializeOrder(order);
}

async function ordersItems(orderId) {
  const rows = await OrderItem.findAll({ where: { orderId } });
  return rows.map(serializeOrderItem);
}

/**
 * Server-side, collision-checked order number.
 *
 * Never generate this in the browser: two shoppers can produce the same
 * random value, and a client-side number is not tied to the row that
 * actually exists.
 */
async function generateOrderNumber() {
  for (let i = 0; i < 10; i++) {
    const now = new Date();
    const yy = String(now.getUTCFullYear()).slice(2);
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const rand = crypto.randomInt(0, 1_000_000);
    const candidate = `WP-${yy}${mm}-${String(rand).padStart(6, "0")}`;
    const exists = await Order.findOne({ where: { orderNumber: candidate } });
    if (!exists) return candidate;
  }
  throw new TRPCError("Could not allocate an order number, please try again", "INTERNAL_SERVER_ERROR");
}

function clean(value, field, { maxLen, required = true }) {
  const text = String(value == null ? "" : value).trim();
  if (!text) {
    if (required) throw new TRPCError(`${field} is required`, "BAD_REQUEST");
    return "";
  }
  if (text.length > maxLen) throw new TRPCError(`${field} is too long`, "BAD_REQUEST");
  return text;
}

/**
 * Return the user row an order should belong to.
 *
 * `orders.userId` is NOT NULL, and this store has no customer login flow, so
 * a guest checkout still needs a user row. We reuse the account matching the
 * email if there is one, otherwise create a guest account. This keeps repeat
 * orders from the same email attached to a single customer record, which is
 * what the admin customers table reports on.
 */
async function resolveCheckoutUser(currentUser, email, fullName) {
  if (currentUser) return currentUser;

  const normalized = email.trim().toLowerCase();
  const existing = await User.findOne({
    where: sequelizeWhere(fn("LOWER", col("email")), normalized),
  });
  if (existing) return existing;

  return User.create({
    openId: `guest_${normalized.replace("@", "_").replace(/\./g, "_")}`,
    name: fullName || null,
    email: normalized,
    loginMethod: "guest_checkout",
    role: "user",
  });
}

/**
 * Validate a checkout submission, price it from the database, and persist
 * the order plus its line items.
 *
 * Two rules this function exists to enforce:
 *
 * 1. Prices come from the products table, never from the request. A client
 *    can post any price it likes; we ignore it and re-read the row.
 * 2. paymentStatus is always 'pending'. No code path here marks an order
 *    paid. Only a verified gateway callback may do that.
 */
async function createOrderFromCart(currentUser, data) {
  if (!data || typeof data !== "object") throw new TRPCError("Checkout data is required", "BAD_REQUEST");

  // ── Customer details ──
  const fullName = clean(data.fullName, "Full name", { maxLen: 200 });
  const email = clean(data.email, "Email", { maxLen: 320 });
  if (!EMAIL_RE.test(email)) throw new TRPCError("Enter a valid email address", "BAD_REQUEST");

  const phone = clean(data.phone, "Phone number", { maxLen: 20 });
  if (!PHONE_RE.test(phone)) throw new TRPCError("Enter a valid phone number", "BAD_REQUEST");

  const address = clean(data.address, "Address", { maxLen: 500 });
  const city = clean(data.city, "City", { maxLen: 100 });
  const postalCode = clean(data.postalCode, "Postal code", { maxLen: 20 });
  const province = clean(data.province, "Province", { maxLen: 100, required: false });
  const country = clean(data.country || "Pakistan", "Country", { maxLen: 100 });
  const notes = clean(data.notes, "Notes", { maxLen: 1000, required: false });

  const paymentMethod = data.paymentMethod;
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    throw new TRPCError(`paymentMethod must be one of: ${PAYMENT_METHODS.join(", ")}`, "BAD_REQUEST");
  }

  // A guest checkout still needs a user row for the NOT NULL foreign key.
  const user = await resolveCheckoutUser(currentUser, email, fullName);

  // ── Cart ──
  const rawItems = data.items || [];
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new TRPCError("Your cart is empty", "BAD_REQUEST");
  }
  if (rawItems.length > 50) throw new TRPCError("Too many items in one order", "BAD_REQUEST");

  const pricedItems = [];
  let subtotal = new Decimal(0);

  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object") throw new TRPCError("Invalid cart item", "BAD_REQUEST");

    const productId = parseInt(raw.productId, 10);
    const quantity = parseInt(raw.quantity, 10);
    if (!Number.isFinite(productId) || !Number.isFinite(quantity)) {
      throw new TRPCError("Invalid cart item", "BAD_REQUEST");
    }
    if (quantity < 1 || quantity > 100) {
      throw new TRPCError("Quantity must be between 1 and 100", "BAD_REQUEST");
    }

    const product = await Product.findByPk(productId);
    if (!product || !product.isActive) {
      throw new TRPCError(`A product in your cart is no longer available (id ${productId})`, "BAD_REQUEST");
    }
    if ((product.stock || 0) < quantity) {
      throw new TRPCError(`Only ${product.stock || 0} left of ${product.name}`, "CONFLICT");
    }

    const size = String(raw.size || "").slice(0, 100);
    const unitPrice = resolveSizePrice(product, size);
    subtotal = subtotal.plus(unitPrice.times(quantity));
    pricedItems.push({ product, productId: product.id, quantity, unitPrice, size });
  }

  // ── Gifting options ──
  const giftPackaging = Boolean(data.giftPackaging);
  const giftMessage = clean(data.giftCardMessage, "Gift message", { maxLen: GIFT_MESSAGE_MAX_LENGTH, required: false });
  const giftRecipient = clean(data.giftRecipientName, "Recipient name", { maxLen: 200, required: false });
  const giftSender = clean(data.giftSenderName, "Sender name", { maxLen: 200, required: false });

  // A card message only makes sense with the gift packaging that carries it.
  if ((giftMessage || giftRecipient) && !giftPackaging) {
    throw new TRPCError("Add gift packaging to include a handwritten card", "BAD_REQUEST");
  }

  const giftFee = giftPackaging ? GIFT_PACKAGING_FEE : new Decimal(0);

  // ── Totals, computed server-side ──
  const shippingCost = subtotal.gte(FREE_SHIPPING_THRESHOLD) ? new Decimal(0) : SHIPPING_FLAT_RATE;
  let discountAmount = new Decimal(0);
  const promoCode = clean(data.promoCode, "Promo code", { maxLen: 50, required: false }) || null;

  if (promoCode) {
    const promo = await PromoCode.findOne({ where: { code: promoCode, isActive: true } });
    if (!promo) throw new TRPCError("That promo code is not valid", "BAD_REQUEST");

    if (promo.firstOrderOnly) {
      // Any prior order for this email — regardless of status — counts as
      // "not a first order". Checked here, server-side, against the
      // database rather than trusting anything the client claims, so
      // clearing localStorage or resubmitting cannot re-claim the offer.
      const hasOrderedBefore = await Order.findOne({
        where: sequelizeWhere(fn("LOWER", col("customerEmail")), email.trim().toLowerCase()),
      });
      if (hasOrderedBefore) {
        throw new TRPCError("This code is valid for first orders only", "BAD_REQUEST");
      }
    }

    if (subtotal.lt(new Decimal(String(promo.minOrderAmount || 0)))) {
      throw new TRPCError(`This code needs a minimum order of PKR ${promo.minOrderAmount}`, "BAD_REQUEST");
    }

    if (promo.discountType === "percent") {
      discountAmount = subtotal.times(new Decimal(String(promo.value))).div(100);
    } else {
      discountAmount = new Decimal(String(promo.value));
    }
    discountAmount = q2(Decimal.min(discountAmount, subtotal));
  }

  const total = q2(subtotal.plus(shippingCost).plus(giftFee).minus(discountAmount));

  // ── Advance payment ──
  // Based on the priced line items, never the client's cart — a shopper
  // cannot dodge this by claiming a lower price for an expensive candle.
  const requiresAdvance = pricedItems.some((item) => item.unitPrice.gte(ADVANCE_ITEM_THRESHOLD));
  const advanceAmount = requiresAdvance ? q2(total.times(ADVANCE_PERCENT)) : new Decimal(0);
  const balanceDue = q2(total.minus(advanceAmount));

  // ── Persist ──
  const result = await sequelize.transaction(async (t) => {
    const order = await Order.create(
      {
        userId: user.id,
        orderNumber: await generateOrderNumber(),
        status: "pending",
        total: total.toFixed(2),
        subtotal: q2(subtotal).toFixed(2),
        shippingCost: shippingCost.toFixed(2),
        discountAmount: discountAmount.toFixed(2),
        promoCode,
        shippingAddress: address,
        shippingCity: city,
        shippingState: province || null,
        shippingZipCode: postalCode,
        shippingCountry: country,
        paymentMethod,
        // Always pending. Cash on delivery settles at the door; card and
        // wallet payments settle when their gateway confirms. Nothing here
        // is "paid".
        paymentStatus: "pending",
        customerEmail: email,
        customerPhone: phone,
        notes: notes || null,
        giftPackaging,
        giftPackagingFee: giftFee.toFixed(2),
        giftCardMessage: giftMessage || null,
        giftRecipientName: giftRecipient || null,
        giftSenderName: giftSender || null,
        advanceRequired: requiresAdvance,
        advanceAmount: advanceAmount.toFixed(2),
        advancePaid: false,
        balanceDueAmount: balanceDue.toFixed(2),
      },
      { transaction: t }
    );

    for (const item of pricedItems) {
      await OrderItem.create(
        {
          orderId: order.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toFixed(2),
          size: item.size,
        },
        { transaction: t }
      );
      // Reserve stock in the same transaction so it cannot drift.
      item.product.stock = (item.product.stock || 0) - item.quantity;
      await item.product.save({ transaction: t });
    }

    // Keep the customer's saved details current for the next checkout.
    if (!user.name) user.name = fullName;
    user.phone = phone;
    user.address = address;
    user.city = city;
    user.zipCode = postalCode;
    user.country = country;
    await user.save({ transaction: t });

    return order;
  });

  const serialized = await serializeOrderWithItems(result);
  serialized.customerName = fullName;

  // Email the confirmation. This runs in the background and can never fail
  // the order — if SMTP is not configured it logs and returns false.
  const { sendOrderConfirmation } = require("../mailer");
  const emailQueued = await sendOrderConfirmation(serialized, serialized.items);

  return {
    order: serializeOrder(result),
    items: (await OrderItem.findAll({ where: { orderId: result.id } })).map(serializeOrderItem),
    // The UI must only promise an email when one was actually queued.
    confirmationEmailQueued: emailQueued,
    giftPackagingFee: giftFee.toFixed(2),
    // Explicit so the UI never has to infer it.
    paymentRequired: paymentMethod !== "cod",
    paymentStatus: result.paymentStatus,
  };
}

/**
 * Look up an order for a shopper who has no account.
 *
 * Checkout is guest-based, so orders.list (which needs a session) is
 * unreachable for real customers. The proof of ownership here is the same
 * pair shown on the confirmation screen: order number + the email it was
 * placed with. Both must match, so an order number alone reveals nothing.
 *
 * Returns the matching order plus every other order placed with that email,
 * which is the closest thing to an order history a guest can have.
 */
async function lookupOrders(orderNumber, email) {
  orderNumber = (orderNumber || "").trim();
  email = (email || "").trim();

  if (!orderNumber) throw new TRPCError("Enter the order number from your confirmation", "BAD_REQUEST");
  if (!EMAIL_RE.test(email)) throw new TRPCError("Enter the email address used on the order", "BAD_REQUEST");

  const order = await Order.findOne({
    where: sequelizeWhere(fn("UPPER", col("orderNumber")), orderNumber.toUpperCase()),
  });

  // One message for "no such order" and "wrong email" alike: distinguishing
  // them would turn this into a way to test whether an order number exists.
  if (!order || (order.customerEmail || "").trim().toLowerCase() !== email.toLowerCase()) {
    throw new TRPCError("We couldn't find an order with that number and email address.", "NOT_FOUND");
  }

  const history = await Order.findAll({
    where: sequelizeWhere(fn("LOWER", col("customerEmail")), email.toLowerCase()),
    order: [["createdAt", "DESC"]],
  });

  const orders = [];
  for (const o of history) orders.push(await serializeOrderWithItems(o));

  return {
    email: order.customerEmail,
    customerName: order.giftSenderName || null,
    orders,
  };
}

/** An order plus its line items, with product names resolved for display. */
async function serializeOrderWithItems(order) {
  const items = await OrderItem.findAll({ where: { orderId: order.id } });

  const detailed = [];
  for (const item of items) {
    const product = await Product.findByPk(item.productId);
    let images = [];
    if (product) {
      try {
        images = typeof product.images === "string" ? JSON.parse(product.images) : (product.images || []);
      } catch {
        images = [];
      }
    }
    detailed.push({
      ...serializeOrderItem(item),
      productName: product ? product.name : "(no longer available)",
      productSlug: product ? product.slug : null,
      image: images[0] || null,
      lineTotal: new Decimal(String(item.unitPrice)).times(item.quantity).toFixed(2),
    });
  }

  const data = serializeOrder(order);
  data.items = detailed;
  data.itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  return data;
}

module.exports = {
  PAYMENT_METHODS, GIFT_PACKAGING_FEE, GIFT_MESSAGE_MAX_LENGTH,
  FREE_SHIPPING_THRESHOLD, SHIPPING_FLAT_RATE,
  ADVANCE_ITEM_THRESHOLD, ADVANCE_PERCENT,
  serializeOrder, serializeOrderItem, serializeOrderWithItems,
  ordersList, ordersById, ordersItems,
  createOrderFromCart, lookupOrders, resolveCheckoutUser,
};
