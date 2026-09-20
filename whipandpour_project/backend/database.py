"""
database.py — SQLAlchemy engine, session, all table models, and seed data.
Uses SQLite so no external database server is needed.
"""

import json
from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    create_engine, Column, Integer, String, Text, Boolean,
    Numeric, DateTime, Enum as SAEnum, UniqueConstraint, ForeignKey
)
from sqlalchemy.orm import declarative_base, sessionmaker, Session

DATABASE_URL = "sqlite:///./whipandpour.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ─── Product categories ────────────────────────────────────────────────────
# Machine value (stored in the DB) → human label (rendered in the UI).
# Changing this list also requires updating:
#   frontend/src/const.ts (CATEGORIES), src/types/index.ts,
#   Navbar collection dropdown, ShopFilters, and the admin product form.
CATEGORIES: dict[str, str] = {
    "dessert-jar": "Dessert Jar Candles",
    "cupcake":     "Cupcake Candles",
    "iced-latte":  "Iced Latte Candles",
    "cheesecake":  "Cheesecake Candles",
    "wax-melts":   "Wax Melts",
}
CATEGORY_VALUES = tuple(CATEGORIES.keys())


# ─── Helper: JSON stored as TEXT in SQLite ─────────────────────────────────

def json_col(default="[]"):
    """Store JSON arrays/objects as TEXT in SQLite."""
    return Column(Text, nullable=False, default=default)


# ─── Models ────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    openId      = Column(String(64), nullable=False, unique=True)
    name        = Column(Text, nullable=True)
    email       = Column(String(320), nullable=True, unique=True)
    phone       = Column(String(20), nullable=True)
    address     = Column(Text, nullable=True)
    city        = Column(String(100), nullable=True)
    state       = Column(String(100), nullable=True)
    zipCode     = Column(String(20), nullable=True)
    country     = Column(String(100), nullable=True)
    loginMethod = Column(String(64), nullable=True)
    passwordHash = Column(String(255), nullable=True)   # only set for admin accounts
    role        = Column(SAEnum("user", "admin", name="user_role"), nullable=False, default="user")
    createdAt   = Column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt   = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    lastSignedIn = Column(DateTime, nullable=False, default=datetime.utcnow)


class Product(Base):
    __tablename__ = "products"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    name             = Column(String(255), nullable=False)
    slug             = Column(String(255), nullable=False, unique=True)
    description      = Column(Text, nullable=False)
    category         = Column(SAEnum(*CATEGORY_VALUES, name="product_category"), nullable=False)
    price            = Column(Numeric(10, 2), nullable=False)
    stock            = Column(Integer, nullable=False, default=0)
    images           = Column(Text, nullable=False, default="[]")   # JSON array of URLs
    scentNotes       = Column(Text, nullable=False, default="[]")   # JSON array of strings
    burnTime         = Column(String(100), nullable=True)
    waxType          = Column(String(100), nullable=True)
    sizeOptions      = Column(Text, nullable=False, default="[]")   # JSON array [{size,ml}]
    isFeatured       = Column(Boolean, default=False)
    isBestseller     = Column(Boolean, default=False)
    isLimitedEdition = Column(Boolean, default=False)
    averageRating    = Column(Numeric(3, 2), default=0)
    reviewCount      = Column(Integer, default=0)
    # Historical reviews carried over from the live store that have no
    # individual `reviews` row. Kept separate so moderating a local review
    # adjusts the totals by exactly one instead of discarding the history.
    importedReviewCount = Column(Integer, nullable=False, default=0)
    importedRatingSum   = Column(Numeric(12, 2), nullable=False, default=0)
    viewCount        = Column(Integer, default=0)
    isActive         = Column(Boolean, nullable=False, default=True)  # soft delete
    createdAt        = Column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt        = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class Order(Base):
    __tablename__ = "orders"

    id                    = Column(Integer, primary_key=True, autoincrement=True)
    userId                = Column(Integer, ForeignKey("users.id"), nullable=False)
    orderNumber           = Column(String(50), nullable=False, unique=True)
    status                = Column(SAEnum("pending", "processing", "shipped", "delivered", "cancelled", name="order_status"), nullable=False, default="pending")
    total                 = Column(Numeric(10, 2), nullable=False)
    subtotal              = Column(Numeric(10, 2), nullable=False)
    shippingCost          = Column(Numeric(10, 2), default=0)
    discountAmount        = Column(Numeric(10, 2), default=0)
    promoCode             = Column(String(50), nullable=True)
    shippingAddress       = Column(Text, nullable=False)
    shippingCity          = Column(String(100), nullable=False)
    shippingState         = Column(String(100), nullable=True)
    shippingZipCode       = Column(String(20), nullable=False)
    shippingCountry       = Column(String(100), nullable=False)
    paymentMethod         = Column(SAEnum("stripe", "jazzcash", "easypaisa", "cod", name="payment_method"), nullable=False)
    paymentStatus         = Column(SAEnum("pending", "completed", "failed", "refunded", name="payment_status"), nullable=False, default="pending")
    stripePaymentIntentId = Column(String(255), nullable=True)
    trackingNumber        = Column(String(100), nullable=True)
    customerEmail         = Column(String(320), nullable=False)
    customerPhone         = Column(String(20), nullable=True)
    notes                 = Column(Text, nullable=True)
    # ── Gifting ──────────────────────────────────────────────────────────
    # Selected at checkout. The packaging fee is captured on the order rather
    # than recomputed later, so historical orders keep the price that was
    # actually charged even if the fee changes.
    giftPackaging         = Column(Boolean, nullable=False, default=False)
    giftPackagingFee      = Column(Numeric(10, 2), nullable=False, default=0)
    giftCardMessage       = Column(Text, nullable=True)
    giftRecipientName     = Column(String(200), nullable=True)
    giftSenderName        = Column(String(200), nullable=True)
    # ── Advance payment ──────────────────────────────────────────────────
    # Required when any line item's unit price is at/above ADVANCE_ITEM_THRESHOLD
    # (routers/orders.py). There is no payment gateway wired up for it — the
    # shopper sends the advance via the manual JazzCash/Easypaisa/bank flow and
    # staff flip advancePaid once it's actually received (admin.orders.markAdvancePaid).
    advanceRequired       = Column(Boolean, nullable=False, default=False)
    advanceAmount         = Column(Numeric(10, 2), nullable=False, default=0)
    advancePaid           = Column(Boolean, nullable=False, default=False)
    balanceDueAmount      = Column(Numeric(10, 2), nullable=False, default=0)
    createdAt             = Column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt             = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class OrderItem(Base):
    __tablename__ = "orderItems"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    orderId   = Column(Integer, ForeignKey("orders.id"), nullable=False)
    productId = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity  = Column(Integer, nullable=False)
    unitPrice = Column(Numeric(10, 2), nullable=False)
    size      = Column(String(100), nullable=True)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)


class Cart(Base):
    __tablename__ = "carts"
    __table_args__ = (UniqueConstraint("userId"),)

    id        = Column(Integer, primary_key=True, autoincrement=True)
    userId    = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    items     = Column(Text, nullable=False, default="[]")   # JSON array [{productId,quantity,size}]
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class Wishlist(Base):
    __tablename__ = "wishlists"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    userId    = Column(Integer, ForeignKey("users.id"), nullable=False)
    productId = Column(Integer, ForeignKey("products.id"), nullable=False)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)


class Review(Base):
    __tablename__ = "reviews"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    productId         = Column(Integer, ForeignKey("products.id"), nullable=False)
    userId            = Column(Integer, ForeignKey("users.id"), nullable=False)
    rating            = Column(Integer, nullable=False)
    title             = Column(String(200), nullable=True)
    body              = Column(Text, nullable=True)
    status            = Column(SAEnum("pending", "approved", "rejected", name="review_status"),
                               nullable=False, default="pending")
    isVerifiedPurchase = Column(Boolean, default=False)
    helpful           = Column(Integer, default=0)
    createdAt         = Column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt         = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class PromoCode(Base):
    __tablename__ = "promoCodes"

    id                  = Column(Integer, primary_key=True, autoincrement=True)
    code                = Column(String(50), nullable=False, unique=True)
    discountType        = Column(SAEnum("percent", "flat", name="discount_type"), nullable=False)
    value               = Column(Numeric(10, 2), nullable=False)
    usageLimit          = Column(Integer, nullable=True)
    usedCount           = Column(Integer, default=0)
    expiryDate          = Column(DateTime, nullable=True)
    isActive            = Column(Boolean, default=True)
    applicableCategory  = Column(SAEnum("all", *CATEGORY_VALUES, name="promo_category"), default="all")
    minOrderAmount      = Column(Numeric(10, 2), default=0)
    # True for codes (like the first-order 10% offer) that only apply to a
    # customer who has never placed an order. Checked by email at order
    # creation time — see create_order_from_cart() in routers/orders.py.
    firstOrderOnly      = Column(Boolean, nullable=False, default=False)
    createdAt           = Column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt           = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


# ─── Seed Data ─────────────────────────────────────────────────────────────
# Products, prices, copy, ratings and photography are taken from the live store
# at whipandpour.com, mapped into the five categories above.
#
# The live catalogue also carries Donut, Pancake, Chocolate, Fruity and Gift Box
# lines. Those categories are not part of this store's five, so those products
# are not seeded here — add them through the admin panel once a matching
# category exists.

SEED_PRODUCTS = [
    {
        "id": 1, "name": "Mango Mousse Cup", "slug": "mango-mousse-cup",
        "description": "A creamy mango mousse with a sunny alphonso swirl in a clear dessert cup. A summer hug for your home. Layered mousse, mango pulp swirl, whipped cream peak.",
        "category": "dessert-jar", "price": "1850.00", "stock": 24,
        "images": json.dumps(['/images/products/photo-1546039907-7fa05f864c02.jpg']),
        "scentNotes": json.dumps(['Ripe Mango', 'Whipped Mousse', 'Vanilla Cream']),
        "burnTime": "30 hours", "waxType": "Premium Soy Blend",
        "isFeatured": True, "isBestseller": True, "isLimitedEdition": False,
        "averageRating": "4.90", "reviewCount": 134, "viewCount": 620,
        "isActive": True,
    },
    {
        "id": 2, "name": "Tiramisu Dessert Cup", "slug": "tiramisu-dessert-cup",
        "description": "Layered tiramisu in a clear glass cup \u2014 espresso-soaked sponge, mascarpone cream and a cocoa dusting. Three layers, dusted finish, glass dessert cup.",
        "category": "dessert-jar", "price": "1950.00", "stock": 17,
        "images": json.dumps(['/images/products/photo-1571877227200-a0d98ea607e9.jpg']),
        "scentNotes": json.dumps(['Cocoa', 'Espresso', 'Mascarpone']),
        "burnTime": "30 hours", "waxType": "Premium Soy Blend",
        "isFeatured": True, "isBestseller": False, "isLimitedEdition": True,
        "averageRating": "4.80", "reviewCount": 91, "viewCount": 430,
        "isActive": True,
    },
    {
        "id": 3, "name": "Vanilla Buttercream Cupcake", "slug": "vanilla-buttercream-cupcake",
        "description": "A soft swirl of buttercream-style wax in a fluted cupcake liner. Lights up with a creamy vanilla glow that fills the whole room. Hand-piped buttercream swirl, gold-foil cupcake liner, edible-look cherry top.",
        "category": "cupcake", "price": "1650.00", "stock": 30,
        "images": json.dumps(['/images/products/photo-1486427944299-d1955d23e34d.jpg', '/images/products/photo-1563729784474-d77dbb933a9e.jpg', '/images/products/photo-1519869325930-281384150729.jpg']),
        "scentNotes": json.dumps(['Sugar Crystals', 'Madagascar Vanilla', 'Soft Butter']),
        "burnTime": "25-30 hours", "waxType": "Premium Soy Blend",
        "isFeatured": True, "isBestseller": True, "isLimitedEdition": False,
        "averageRating": "4.90", "reviewCount": 211, "viewCount": 980,
        "isActive": True,
    },
    {
        "id": 4, "name": "Red Velvet Cupcake Candle", "slug": "red-velvet-cupcake-candle",
        "description": "Deep red sponge with a swirl of pillowy cream cheese frosting. A romantic showstopper for any space. Two-tone red sponge, white whipped swirl, dusted shimmer.",
        "category": "cupcake", "price": "1750.00", "stock": 22,
        "images": json.dumps(['/images/products/photo-1614707267537-b85aaf00c4b7.jpg']),
        "scentNotes": json.dumps(['Cocoa', 'Red Velvet', 'Cream Cheese Frosting']),
        "burnTime": "25 hours", "waxType": "Premium Soy Blend",
        "isFeatured": True, "isBestseller": True, "isLimitedEdition": True,
        "averageRating": "4.90", "reviewCount": 156, "viewCount": 740,
        "isActive": True,
    },
    {
        "id": 5, "name": "Caramel Latte Candle", "slug": "caramel-latte-candle",
        "description": "A frothy latte topped with caramel drizzle, served in a real ceramic cup you can keep forever. Whipped foam top, caramel ribbon, mini latte cup.",
        "category": "iced-latte", "price": "2100.00", "stock": 19,
        "images": json.dumps(['/images/products/photo-1509042239860-f550ce710b93.jpg', '/images/products/photo-1497636577773-f1231844b336.jpg']),
        "scentNotes": json.dumps(['Espresso Crema', 'Steamed Milk', 'Salted Caramel']),
        "burnTime": "32 hours", "waxType": "Premium Soy Blend",
        "isFeatured": True, "isBestseller": True, "isLimitedEdition": False,
        "averageRating": "4.90", "reviewCount": 168, "viewCount": 860,
        "isActive": True,
    },
    {
        "id": 6, "name": "Blueberry Cheesecake Slice", "slug": "blueberry-cheesecake-slice",
        "description": "Hand-cut cheesecake slice with a buttery biscuit base and a glossy blueberry compote drizzle. Looks bakery-fresh. Layered cheesecake build, graham crust edge.",
        "category": "cheesecake", "price": "1950.00", "stock": 16,
        "images": json.dumps(['/images/products/photo-1565958011703-44f9829ba187.jpg', '/images/products/photo-1567171466295-4afa63d45416.jpg']),
        "scentNotes": json.dumps(['Wild Blueberry', 'Cheesecake Cream', 'Graham Cracker']),
        "burnTime": "28-32 hours", "waxType": "Premium Soy Blend",
        "isFeatured": True, "isBestseller": True, "isLimitedEdition": False,
        "averageRating": "4.90", "reviewCount": 119, "viewCount": 560,
        "isActive": True,
    },
    {
        "id": 7, "name": "Strawberry Cheesecake Slice", "slug": "strawberry-cheesecake-slice",
        "description": "A pastel pink cheesecake slice with a glossy strawberry pour and a hand-piped cream rosette. Layered slice, glossy red glaze, whipped cream rosette.",
        "category": "cheesecake", "price": "1950.00", "stock": 20,
        "images": json.dumps(['/images/products/photo-1488477181946-6428a0291777.jpg', '/images/products/photo-1542124948-dc391252a940.jpg']),
        "scentNotes": json.dumps(['Strawberry Jam', 'Cream Cheese', 'Vanilla Biscuit']),
        "burnTime": "28-30 hours", "waxType": "Premium Soy Blend",
        "isFeatured": False, "isBestseller": False, "isLimitedEdition": True,
        "averageRating": "4.80", "reviewCount": 102, "viewCount": 480,
        "isActive": True,
    },
]


SEED_PROMO_CODES = [
    {
        "code": "WELCOME10",
        "discountType": "percent",
        "value": "10.00",
        "usageLimit": 1000,
        "usedCount": 0,
        "expiryDate": None,
        "isActive": True,
        "applicableCategory": "all",
        "minOrderAmount": "0.00",
        # The "10% off your first order" promo advertised in the top banner.
        "firstOrderOnly": True,
    },
    {
        "code": "CHEESECAKE20",
        "discountType": "percent",
        "value": "20.00",
        "usageLimit": 500,
        "usedCount": 0,
        "expiryDate": None,
        "isActive": True,
        "applicableCategory": "cheesecake",
        "minOrderAmount": "3000.00",
    },
    {
        "code": "FLAT500",
        "discountType": "flat",
        "value": "500.00",
        "usageLimit": None,
        "usedCount": 0,
        "expiryDate": None,
        "isActive": True,
        "applicableCategory": "all",
        "minOrderAmount": "2000.00",
    },
]


# Real customer reviews from the live store, matched to the seeded products.
# `productSlug` is resolved to a product id at seed time.
SEED_REVIEWS = [
    {
        "productSlug": "vanilla-buttercream-cupcake", "customerName": "Mahnoor S.",
        "city": "Lahore", "rating": 5, "title": "Best gift I've ever sent",
        "body": "Ordered for my best friend's birthday. She literally cried. The buttercream swirl is so detailed — looks like a real bakery cupcake.",
        "isVerifiedPurchase": True, "helpful": 24, "date": "2026-04-18",
    },
    {
        "productSlug": "mango-mousse-cup", "customerName": "Ayesha K.",
        "city": "Islamabad", "rating": 5, "title": "Smells like home",
        "body": "Pure alphonso vibes. Delivery to Islamabad was quicker than expected and the box was beautifully wrapped.",
        "isVerifiedPurchase": True, "helpful": 18, "date": "2026-04-15",
    },
    {
        "productSlug": "caramel-latte-candle", "customerName": "Sana R.",
        "city": "Karachi", "rating": 5, "title": "Coffee-shop in my room",
        "body": "Lights up beautifully and the caramel scent is soft and cozy. The little ceramic cup is a keeper.",
        "isVerifiedPurchase": True, "helpful": 15, "date": "2026-04-05",
    },
    {
        "productSlug": "red-velvet-cupcake-candle", "customerName": "Fatima B.",
        "city": "Multan", "rating": 5, "title": "Aesthetic 10/10",
        "body": "Posted it on my Instagram story and got 50 DMs asking where I bought it. Beautifully made.",
        "isVerifiedPurchase": True, "helpful": 21, "date": "2026-04-01",
    },
]


# ─── Init DB + seed ─────────────────────────────────────────────────────────

def _seed_reviews(db: Session) -> None:
    """
    Insert the seed reviews, attaching each to a placeholder reviewer account.

    Reviews need a userId (NOT NULL), and these are real customers of the live
    store rather than site accounts, so each gets a lightweight reviewer row
    keyed on their display name.
    """
    from datetime import datetime as _dt

    inserted = 0
    for entry in SEED_REVIEWS:
        product = db.query(Product).filter(Product.slug == entry["productSlug"]).first()
        if product is None:
            continue

        open_id = f"reviewer_{entry['customerName'].lower().replace(' ', '_').replace('.', '')}"
        reviewer = db.query(User).filter(User.openId == open_id).first()
        if reviewer is None:
            reviewer = User(
                openId=open_id,
                name=entry["customerName"],
                city=entry.get("city"),
                loginMethod="imported_review",
                role="user",
            )
            db.add(reviewer)
            db.flush()

        db.add(
            Review(
                productId=product.id,
                userId=reviewer.id,
                rating=entry["rating"],
                title=entry["title"],
                body=entry["body"],
                isVerifiedPurchase=entry["isVerifiedPurchase"],
                status="approved",
                helpful=entry["helpful"],
                createdAt=_dt.fromisoformat(entry["date"]),
                updatedAt=_dt.fromisoformat(entry["date"]),
            )
        )
        inserted += 1

    db.commit()

    # Split each product's seeded aggregate into the part backed by local review
    # rows and the historical remainder imported from the live store.
    for product in db.query(Product).all():
        local = (
            db.query(Review)
            .filter(Review.productId == product.id, Review.status == "approved")
            .all()
        )
        local_count = len(local)
        local_sum = sum(r.rating for r in local)

        total_count = product.reviewCount or 0
        total_sum = float(product.averageRating or 0) * total_count

        product.importedReviewCount = max(0, total_count - local_count)
        product.importedRatingSum = Decimal(str(round(max(0.0, total_sum - local_sum), 2)))
    db.commit()

    if inserted:
        print(f"[DB] Seeded {inserted} reviews.")


def _seed_admin(db: Session) -> None:
    """
    Ensure exactly one admin account exists.

    Credentials come from ADMIN_EMAIL / ADMIN_PASSWORD. The historical demo pair
    is used as a fallback so an existing install keeps working; override both
    env vars before exposing this anywhere public.
    """
    import os
    from auth import hash_password

    email = os.getenv("ADMIN_EMAIL", "admin@whipandpour.com")
    password = os.getenv("ADMIN_PASSWORD", "WhipPour@123")

    admin = db.query(User).filter(User.email == email).first()
    if admin is None:
        admin = User(
            openId=f"admin_{email.replace('@', '_').replace('.', '_')}",
            name="Store Admin",
            email=email,
            loginMethod="admin",
            role="admin",
            passwordHash=hash_password(password),
        )
        db.add(admin)
        db.commit()
        print(f"[DB] Seeded admin account: {email}")
    elif admin.passwordHash is None:
        # Upgrade an account created before password auth existed.
        admin.passwordHash = hash_password(password)
        admin.role = "admin"
        db.commit()
        print(f"[DB] Set password for existing admin account: {email}")


def _migrate_schema(db: Session) -> None:
    """
    Add columns introduced after a database file already existed.

    `Base.metadata.create_all()` only creates missing tables, never missing
    columns on a table that's already there, so a column added to a model
    needs an explicit `ALTER TABLE` for anyone with an existing whipandpour.db.
    """
    from sqlalchemy import text

    existing_columns = {row[1] for row in db.execute(text("PRAGMA table_info(promoCodes)"))}
    if "firstOrderOnly" not in existing_columns:
        db.execute(text("ALTER TABLE promoCodes ADD COLUMN firstOrderOnly BOOLEAN NOT NULL DEFAULT 0"))
        db.commit()
        print("[DB] Migrated promoCodes: added firstOrderOnly column.")
        # The seed check below only inserts when the table is empty, so an
        # already-seeded WELCOME10 needs this flag set explicitly.
        welcome = db.query(PromoCode).filter(PromoCode.code == "WELCOME10").first()
        if welcome is not None and not welcome.firstOrderOnly:
            welcome.firstOrderOnly = True
            db.commit()
            print("[DB] Marked WELCOME10 as first-order-only.")

    order_columns = {row[1] for row in db.execute(text("PRAGMA table_info(orders)"))}
    order_migrations = {
        "advanceRequired": "BOOLEAN NOT NULL DEFAULT 0",
        "advanceAmount": "NUMERIC(10, 2) NOT NULL DEFAULT 0",
        "advancePaid": "BOOLEAN NOT NULL DEFAULT 0",
        "balanceDueAmount": "NUMERIC(10, 2) NOT NULL DEFAULT 0",
    }
    for column, ddl in order_migrations.items():
        if column not in order_columns:
            db.execute(text(f"ALTER TABLE orders ADD COLUMN {column} {ddl}"))
            db.commit()
            print(f"[DB] Migrated orders: added {column} column.")

    # Every product now sells in exactly two sizes (220ml / 300ml), each with
    # its own admin-set price. Products seeded before this existed have the
    # old free-form sizeOptions (e.g. "Duo Box", "Whole Cake") with no price
    # on them at all — rewrite those into the new shape, seeded from the
    # product's current price, so checkout's per-size pricing lookup always
    # finds a match instead of failing on stale data.
    migrated_sizes = 0
    for product in db.query(Product).all():
        try:
            options = json.loads(product.sizeOptions) if product.sizeOptions else []
        except (ValueError, TypeError):
            options = []
        sizes = {o.get("size") for o in options if isinstance(o, dict)}
        has_priced_sizes = {"220ml", "300ml"}.issubset(sizes) and all(
            "price" in o for o in options if isinstance(o, dict) and o.get("size") in ("220ml", "300ml")
        )
        if has_priced_sizes:
            continue
        base_price = Decimal(str(product.price or 0))
        price_300 = (base_price * Decimal("1.3") / Decimal("50")).quantize(Decimal("1")) * Decimal("50")
        product.sizeOptions = json.dumps([
            {"size": "220ml", "ml": 220, "price": str(base_price.quantize(Decimal("0.01")))},
            {"size": "300ml", "ml": 300, "price": str(price_300.quantize(Decimal("0.01")))},
        ])
        migrated_sizes += 1
    if migrated_sizes:
        db.commit()
        print(f"[DB] Migrated {migrated_sizes} product(s) to 220ml/300ml sizeOptions.")


def init_db():
    """Create all tables and seed products if empty."""
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    try:
        _migrate_schema(db)

        # Seed products
        if db.query(Product).count() == 0:
            for p in SEED_PRODUCTS:
                p = dict(p)
                # Every product ships in exactly two sizes — 220ml at the
                # seeded price, 300ml at a starter markup. Both are editable
                # from the admin panel afterwards (admin.products.update).
                base_price = Decimal(p["price"])
                price_300 = (base_price * Decimal("1.3") / Decimal("50")).quantize(Decimal("1")) * Decimal("50")
                p["sizeOptions"] = json.dumps([
                    {"size": "220ml", "ml": 220, "price": str(base_price.quantize(Decimal("0.01")))},
                    {"size": "300ml", "ml": 300, "price": str(price_300.quantize(Decimal("0.01")))},
                ])
                db.add(Product(**p))
            db.commit()
            print(f"[DB] Seeded {len(SEED_PRODUCTS)} products.")

        # Seed the admin account (credentials come from the environment)
        _seed_admin(db)

        # Seed reviews (needs products to exist first so slugs resolve)
        if db.query(Review).count() == 0:
            _seed_reviews(db)

        # Seed promo codes
        if db.query(PromoCode).count() == 0:
            for pc in SEED_PROMO_CODES:
                db.add(PromoCode(**pc))
            db.commit()
            print(f"[DB] Seeded {len(SEED_PROMO_CODES)} promo codes.")
    finally:
        db.close()


# ─── Dependency ─────────────────────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
