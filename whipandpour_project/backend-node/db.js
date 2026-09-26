/**
 * db.js — Sequelize connection, every model, and seed data.
 *
 * Node port of database.py. Field names match exactly (camelCase) since they
 * are serialized straight into the tRPC JSON responses the frontend expects
 * — nothing in the frontend needed to change for this port.
 *
 * Uses SQLite by default (a single file, no server needed) for local dev.
 * Set DB_HOST/DB_NAME/DB_USER/DB_PASSWORD (e.g. Hostinger's hosted MySQL) to
 * point at MySQL instead — Sequelize abstracts the rest.
 */

const path = require("path");
const { Sequelize, DataTypes, Op } = require("sequelize");

function buildSequelize() {
  const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, DB_PORT } = process.env;

  if (DB_HOST && DB_NAME && DB_USER) {
    return new Sequelize(DB_NAME, DB_USER, DB_PASSWORD || "", {
      host: DB_HOST,
      port: Number(DB_PORT || 3306),
      dialect: "mysql",
      logging: false,
      define: { timestamps: false, freezeTableName: true },
      // MySQL connections idle out silently; without this the first query
      // after a lull fails instead of Sequelize transparently reconnecting.
      pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
      dialectOptions: { charset: "utf8mb4" },
    });
  }

  // Local dev default: a single file next to this module, regardless of the
  // process's working directory.
  const dbPath = path.join(__dirname, "whipandpour.db");
  return new Sequelize({
    dialect: "sqlite",
    storage: dbPath,
    logging: false,
    define: { timestamps: false, freezeTableName: true },
  });
}

const sequelize = buildSequelize();

// ─── Product categories ─────────────────────────────────────────────────────
// Machine value (stored in the DB) → human label (rendered in the UI).
// Changing this list also requires updating the frontend's CATEGORIES const.
const CATEGORIES = {
  "dessert-jar": "Dessert Jar Candles",
  cupcake: "Cupcake Candles",
  "iced-latte": "Iced Latte Candles",
  cheesecake: "Cheesecake Candles",
  "wax-melts": "Wax Melts",
};
const CATEGORY_VALUES = Object.keys(CATEGORIES);

// ─── Models ─────────────────────────────────────────────────────────────────

const User = sequelize.define("User", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  openId: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  name: { type: DataTypes.TEXT, allowNull: true },
  email: { type: DataTypes.STRING(320), allowNull: true, unique: true },
  phone: { type: DataTypes.STRING(20), allowNull: true },
  address: { type: DataTypes.TEXT, allowNull: true },
  city: { type: DataTypes.STRING(100), allowNull: true },
  state: { type: DataTypes.STRING(100), allowNull: true },
  zipCode: { type: DataTypes.STRING(20), allowNull: true },
  country: { type: DataTypes.STRING(100), allowNull: true },
  loginMethod: { type: DataTypes.STRING(64), allowNull: true },
  passwordHash: { type: DataTypes.STRING(255), allowNull: true }, // only set for admin accounts
  role: { type: DataTypes.ENUM("user", "admin"), allowNull: false, defaultValue: "user" },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  lastSignedIn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: "users" });

const Product = sequelize.define("Product", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  slug: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  description: { type: DataTypes.TEXT, allowNull: false },
  category: { type: DataTypes.ENUM(...CATEGORY_VALUES), allowNull: false },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  images: { type: DataTypes.TEXT, allowNull: false, defaultValue: "[]" }, // JSON array of URLs
  scentNotes: { type: DataTypes.TEXT, allowNull: false, defaultValue: "[]" }, // JSON array of strings
  burnTime: { type: DataTypes.STRING(100), allowNull: true },
  waxType: { type: DataTypes.STRING(100), allowNull: true },
  sizeOptions: { type: DataTypes.TEXT, allowNull: false, defaultValue: "[]" }, // JSON [{size,ml,price}]
  isFeatured: { type: DataTypes.BOOLEAN, defaultValue: false },
  isBestseller: { type: DataTypes.BOOLEAN, defaultValue: false },
  isLimitedEdition: { type: DataTypes.BOOLEAN, defaultValue: false },
  averageRating: { type: DataTypes.DECIMAL(3, 2), defaultValue: 0 },
  reviewCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  // Historical reviews carried over from the live store that have no
  // individual `reviews` row. Kept separate so moderating a local review
  // adjusts the totals by exactly one instead of discarding the history.
  importedReviewCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  importedRatingSum: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  viewCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, // soft delete
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: "products" });

const Order = sequelize.define("Order", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  orderNumber: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  status: {
    type: DataTypes.ENUM("pending", "processing", "shipped", "delivered", "cancelled"),
    allowNull: false,
    defaultValue: "pending",
  },
  total: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  subtotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  shippingCost: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  discountAmount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  promoCode: { type: DataTypes.STRING(50), allowNull: true },
  shippingAddress: { type: DataTypes.TEXT, allowNull: false },
  shippingCity: { type: DataTypes.STRING(100), allowNull: false },
  shippingState: { type: DataTypes.STRING(100), allowNull: true },
  shippingZipCode: { type: DataTypes.STRING(20), allowNull: false },
  shippingCountry: { type: DataTypes.STRING(100), allowNull: false },
  paymentMethod: {
    type: DataTypes.ENUM("stripe", "jazzcash", "easypaisa", "cod"),
    allowNull: false,
  },
  paymentStatus: {
    type: DataTypes.ENUM("pending", "completed", "failed", "refunded"),
    allowNull: false,
    defaultValue: "pending",
  },
  stripePaymentIntentId: { type: DataTypes.STRING(255), allowNull: true },
  trackingNumber: { type: DataTypes.STRING(100), allowNull: true },
  customerEmail: { type: DataTypes.STRING(320), allowNull: false },
  customerPhone: { type: DataTypes.STRING(20), allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  // ── Gifting ──
  // Selected at checkout. The packaging fee is captured on the order rather
  // than recomputed later, so historical orders keep the price that was
  // actually charged even if the fee changes.
  giftPackaging: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  giftPackagingFee: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  giftCardMessage: { type: DataTypes.TEXT, allowNull: true },
  giftRecipientName: { type: DataTypes.STRING(200), allowNull: true },
  giftSenderName: { type: DataTypes.STRING(200), allowNull: true },
  // ── Advance payment ──
  // Required when any line item's unit price is at/above ADVANCE_ITEM_THRESHOLD
  // (routers/orders.js). There is no payment gateway wired up for it — the
  // shopper sends the advance via the manual JazzCash/Easypaisa/bank flow and
  // staff flip advancePaid once it's actually received (admin.orders.markAdvancePaid).
  advanceRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  advanceAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  advancePaid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  balanceDueAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: "orders" });

const OrderItem = sequelize.define("OrderItem", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  productId: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  unitPrice: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  size: { type: DataTypes.STRING(100), allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: "orderItems" });

const Cart = sequelize.define("Cart", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  items: { type: DataTypes.TEXT, allowNull: false, defaultValue: "[]" }, // JSON [{productId,quantity,size}]
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: "carts" });

const Wishlist = sequelize.define("Wishlist", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  productId: { type: DataTypes.INTEGER, allowNull: false },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: "wishlists" });

const Review = sequelize.define("Review", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  productId: { type: DataTypes.INTEGER, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  rating: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING(200), allowNull: true },
  body: { type: DataTypes.TEXT, allowNull: true },
  status: {
    type: DataTypes.ENUM("pending", "approved", "rejected"),
    allowNull: false,
    defaultValue: "pending",
  },
  isVerifiedPurchase: { type: DataTypes.BOOLEAN, defaultValue: false },
  helpful: { type: DataTypes.INTEGER, defaultValue: 0 },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: "reviews" });

const PromoCode = sequelize.define("PromoCode", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  discountType: { type: DataTypes.ENUM("percent", "flat"), allowNull: false },
  value: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  usageLimit: { type: DataTypes.INTEGER, allowNull: true },
  usedCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  expiryDate: { type: DataTypes.DATE, allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  applicableCategory: {
    type: DataTypes.ENUM("all", ...CATEGORY_VALUES),
    defaultValue: "all",
  },
  minOrderAmount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  // True for codes (like the first-order 10% offer) that only apply to a
  // customer who has never placed an order. Checked by email at order
  // creation time — see create_order_from_cart() in routers/orders.js.
  firstOrderOnly: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: "promoCodes" });

// ─── Seed Data ──────────────────────────────────────────────────────────────
// Products, prices, copy, ratings and photography are taken from the live
// store at whipandpour.com, mapped into the five categories above.

const SEED_PRODUCTS = [
  {
    id: 1, name: "Mango Mousse Cup", slug: "mango-mousse-cup",
    description: "A creamy mango mousse with a sunny alphonso swirl in a clear dessert cup. A summer hug for your home. Layered mousse, mango pulp swirl, whipped cream peak.",
    category: "dessert-jar", price: "1850.00", stock: 24,
    images: JSON.stringify(["/images/products/photo-1546039907-7fa05f864c02.jpg"]),
    scentNotes: JSON.stringify(["Ripe Mango", "Whipped Mousse", "Vanilla Cream"]),
    burnTime: "30 hours", waxType: "Premium Soy Blend",
    isFeatured: true, isBestseller: true, isLimitedEdition: false,
    averageRating: "4.90", reviewCount: 134, viewCount: 620, isActive: true,
  },
  {
    id: 2, name: "Tiramisu Dessert Cup", slug: "tiramisu-dessert-cup",
    description: "Layered tiramisu in a clear glass cup — espresso-soaked sponge, mascarpone cream and a cocoa dusting. Three layers, dusted finish, glass dessert cup.",
    category: "dessert-jar", price: "1950.00", stock: 17,
    images: JSON.stringify(["/images/products/photo-1571877227200-a0d98ea607e9.jpg"]),
    scentNotes: JSON.stringify(["Cocoa", "Espresso", "Mascarpone"]),
    burnTime: "30 hours", waxType: "Premium Soy Blend",
    isFeatured: true, isBestseller: false, isLimitedEdition: true,
    averageRating: "4.80", reviewCount: 91, viewCount: 430, isActive: true,
  },
  {
    id: 3, name: "Vanilla Buttercream Cupcake", slug: "vanilla-buttercream-cupcake",
    description: "A soft swirl of buttercream-style wax in a fluted cupcake liner. Lights up with a creamy vanilla glow that fills the whole room. Hand-piped buttercream swirl, gold-foil cupcake liner, edible-look cherry top.",
    category: "cupcake", price: "1650.00", stock: 30,
    images: JSON.stringify([
      "/images/products/photo-1486427944299-d1955d23e34d.jpg",
      "/images/products/photo-1563729784474-d77dbb933a9e.jpg",
      "/images/products/photo-1519869325930-281384150729.jpg",
    ]),
    scentNotes: JSON.stringify(["Sugar Crystals", "Madagascar Vanilla", "Soft Butter"]),
    burnTime: "25-30 hours", waxType: "Premium Soy Blend",
    isFeatured: true, isBestseller: true, isLimitedEdition: false,
    averageRating: "4.90", reviewCount: 211, viewCount: 980, isActive: true,
  },
  {
    id: 4, name: "Red Velvet Cupcake Candle", slug: "red-velvet-cupcake-candle",
    description: "Deep red sponge with a swirl of pillowy cream cheese frosting. A romantic showstopper for any space. Two-tone red sponge, white whipped swirl, dusted shimmer.",
    category: "cupcake", price: "1750.00", stock: 22,
    images: JSON.stringify(["/images/products/photo-1614707267537-b85aaf00c4b7.jpg"]),
    scentNotes: JSON.stringify(["Cocoa", "Red Velvet", "Cream Cheese Frosting"]),
    burnTime: "25 hours", waxType: "Premium Soy Blend",
    isFeatured: true, isBestseller: true, isLimitedEdition: true,
    averageRating: "4.90", reviewCount: 156, viewCount: 740, isActive: true,
  },
  {
    id: 5, name: "Caramel Latte Candle", slug: "caramel-latte-candle",
    description: "A frothy latte topped with caramel drizzle, served in a real ceramic cup you can keep forever. Whipped foam top, caramel ribbon, mini latte cup.",
    category: "iced-latte", price: "2100.00", stock: 19,
    images: JSON.stringify([
      "/images/products/photo-1509042239860-f550ce710b93.jpg",
      "/images/products/photo-1497636577773-f1231844b336.jpg",
    ]),
    scentNotes: JSON.stringify(["Espresso Crema", "Steamed Milk", "Salted Caramel"]),
    burnTime: "32 hours", waxType: "Premium Soy Blend",
    isFeatured: true, isBestseller: true, isLimitedEdition: false,
    averageRating: "4.90", reviewCount: 168, viewCount: 860, isActive: true,
  },
  {
    id: 6, name: "Blueberry Cheesecake Slice", slug: "blueberry-cheesecake-slice",
    description: "Hand-cut cheesecake slice with a buttery biscuit base and a glossy blueberry compote drizzle. Looks bakery-fresh. Layered cheesecake build, graham crust edge.",
    category: "cheesecake", price: "1950.00", stock: 16,
    images: JSON.stringify([
      "/images/products/photo-1565958011703-44f9829ba187.jpg",
      "/images/products/photo-1567171466295-4afa63d45416.jpg",
    ]),
    scentNotes: JSON.stringify(["Wild Blueberry", "Cheesecake Cream", "Graham Cracker"]),
    burnTime: "28-32 hours", waxType: "Premium Soy Blend",
    isFeatured: true, isBestseller: true, isLimitedEdition: false,
    averageRating: "4.90", reviewCount: 119, viewCount: 560, isActive: true,
  },
  {
    id: 7, name: "Strawberry Cheesecake Slice", slug: "strawberry-cheesecake-slice",
    description: "A pastel pink cheesecake slice with a glossy strawberry pour and a hand-piped cream rosette. Layered slice, glossy red glaze, whipped cream rosette.",
    category: "cheesecake", price: "1950.00", stock: 20,
    images: JSON.stringify([
      "/images/products/photo-1488477181946-6428a0291777.jpg",
      "/images/products/photo-1542124948-dc391252a940.jpg",
    ]),
    scentNotes: JSON.stringify(["Strawberry Jam", "Cream Cheese", "Vanilla Biscuit"]),
    burnTime: "28-30 hours", waxType: "Premium Soy Blend",
    isFeatured: false, isBestseller: false, isLimitedEdition: true,
    averageRating: "4.80", reviewCount: 102, viewCount: 480, isActive: true,
  },
];

const SEED_PROMO_CODES = [
  {
    code: "WELCOME10", discountType: "percent", value: "10.00",
    usageLimit: 1000, usedCount: 0, expiryDate: null, isActive: true,
    applicableCategory: "all", minOrderAmount: "0.00",
    // The "10% off your first order" promo advertised in the top banner.
    firstOrderOnly: true,
  },
  {
    code: "CHEESECAKE20", discountType: "percent", value: "20.00",
    usageLimit: 500, usedCount: 0, expiryDate: null, isActive: true,
    applicableCategory: "cheesecake", minOrderAmount: "3000.00",
  },
  {
    code: "FLAT500", discountType: "flat", value: "500.00",
    usageLimit: null, usedCount: 0, expiryDate: null, isActive: true,
    applicableCategory: "all", minOrderAmount: "2000.00",
  },
];

// Real customer reviews from the live store, matched to the seeded products.
const SEED_REVIEWS = [
  {
    productSlug: "vanilla-buttercream-cupcake", customerName: "Mahnoor S.",
    city: "Lahore", rating: 5, title: "Best gift I've ever sent",
    body: "Ordered for my best friend's birthday. She literally cried. The buttercream swirl is so detailed — looks like a real bakery cupcake.",
    isVerifiedPurchase: true, helpful: 24, date: "2026-04-18",
  },
  {
    productSlug: "mango-mousse-cup", customerName: "Ayesha K.",
    city: "Islamabad", rating: 5, title: "Smells like home",
    body: "Pure alphonso vibes. Delivery to Islamabad was quicker than expected and the box was beautifully wrapped.",
    isVerifiedPurchase: true, helpful: 18, date: "2026-04-15",
  },
  {
    productSlug: "caramel-latte-candle", customerName: "Sana R.",
    city: "Karachi", rating: 5, title: "Coffee-shop in my room",
    body: "Lights up beautifully and the caramel scent is soft and cozy. The little ceramic cup is a keeper.",
    isVerifiedPurchase: true, helpful: 15, date: "2026-04-05",
  },
  {
    productSlug: "red-velvet-cupcake-candle", customerName: "Fatima B.",
    city: "Multan", rating: 5, title: "Aesthetic 10/10",
    body: "Posted it on my Instagram story and got 50 DMs asking where I bought it. Beautifully made.",
    isVerifiedPurchase: true, helpful: 21, date: "2026-04-01",
  },
];

// ─── Seed helpers ───────────────────────────────────────────────────────────

function sizeOptionsFor(basePrice) {
  // Every product ships in exactly two sizes — 220ml at the seeded price,
  // 300ml at a starter markup. Both are editable from the admin panel
  // afterwards (admin.products.update).
  const base = Math.round(Number(basePrice) * 100) / 100;
  const price300 = Math.round((base * 1.3) / 50) * 50;
  return JSON.stringify([
    { size: "220ml", ml: 220, price: base.toFixed(2) },
    { size: "300ml", ml: 300, price: price300.toFixed(2) },
  ]);
}

async function seedReviews() {
  let inserted = 0;
  for (const entry of SEED_REVIEWS) {
    const product = await Product.findOne({ where: { slug: entry.productSlug } });
    if (!product) continue;

    const openId = `reviewer_${entry.customerName.toLowerCase().replace(/ /g, "_").replace(/\./g, "")}`;
    let reviewer = await User.findOne({ where: { openId } });
    if (!reviewer) {
      reviewer = await User.create({
        openId, name: entry.customerName, city: entry.city,
        loginMethod: "imported_review", role: "user",
      });
    }

    await Review.create({
      productId: product.id, userId: reviewer.id, rating: entry.rating,
      title: entry.title, body: entry.body,
      isVerifiedPurchase: entry.isVerifiedPurchase, status: "approved",
      helpful: entry.helpful, createdAt: new Date(entry.date), updatedAt: new Date(entry.date),
    });
    inserted += 1;
  }

  // Split each product's seeded aggregate into the part backed by local
  // review rows and the historical remainder imported from the live store.
  const products = await Product.findAll();
  for (const product of products) {
    const local = await Review.findAll({ where: { productId: product.id, status: "approved" } });
    const localCount = local.length;
    const localSum = local.reduce((s, r) => s + r.rating, 0);

    const totalCount = product.reviewCount || 0;
    const totalSum = Number(product.averageRating || 0) * totalCount;

    product.importedReviewCount = Math.max(0, totalCount - localCount);
    product.importedRatingSum = Math.round(Math.max(0, totalSum - localSum) * 100) / 100;
    await product.save();
  }

  if (inserted) console.log(`[DB] Seeded ${inserted} reviews.`);
}

async function seedAdmin() {
  // Credentials come from ADMIN_EMAIL / ADMIN_PASSWORD. The historical demo
  // pair is used as a fallback so an existing install keeps working;
  // override both env vars before exposing this anywhere public.
  const { hashPassword } = require("./auth");

  const email = process.env.ADMIN_EMAIL || "admin@whipandpour.com";
  const password = process.env.ADMIN_PASSWORD || "WhipPour@123";

  let admin = await User.findOne({ where: { email } });
  if (!admin) {
    await User.create({
      openId: `admin_${email.replace("@", "_").replace(/\./g, "_")}`,
      name: "Store Admin", email, loginMethod: "admin", role: "admin",
      passwordHash: hashPassword(password),
    });
    console.log(`[DB] Seeded admin account: ${email}`);
  } else if (!admin.passwordHash) {
    admin.passwordHash = hashPassword(password);
    admin.role = "admin";
    await admin.save();
    console.log(`[DB] Set password for existing admin account: ${email}`);
  }
}

async function initDb() {
  // Creates tables if missing, adds columns if the model gained one since the
  // database was created. There's no legacy data to migrate here — this is a
  // fresh schema — so a plain alter-sync covers it, unlike the hand-rolled
  // migration the Python version needed for its already-live SQLite files.
  await sequelize.sync();

  if ((await Product.count()) === 0) {
    for (const p of SEED_PRODUCTS) {
      await Product.create({ ...p, sizeOptions: sizeOptionsFor(p.price) });
    }
    console.log(`[DB] Seeded ${SEED_PRODUCTS.length} products.`);
  }

  await seedAdmin();

  if ((await Review.count()) === 0) {
    await seedReviews();
  }

  if ((await PromoCode.count()) === 0) {
    for (const pc of SEED_PROMO_CODES) {
      await PromoCode.create(pc);
    }
    console.log(`[DB] Seeded ${SEED_PROMO_CODES.length} promo codes.`);
  }
}

module.exports = {
  sequelize, Op,
  CATEGORIES, CATEGORY_VALUES,
  User, Product, Order, OrderItem, Cart, Wishlist, Review, PromoCode,
  initDb, sizeOptionsFor,
};
