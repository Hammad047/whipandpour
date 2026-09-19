"""
routers/admin.py — Admin-only handlers backing the admin panel.

Every procedure in this module is registered behind ``_require_admin`` in
main.py. Nothing here may be reachable without an authenticated session whose
user row has ``role == 'admin'``.

Mirrors:
  admin.products.list / create / update / delete
  admin.inventory.list / restock
  admin.customers.list
  admin.orders.list / updateStatus
  admin.stats
"""

import json
import re
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import TRPCError
from database import CATEGORY_VALUES, Order, OrderItem, Product, User
from routers.products import _serialize_product


# ─── Validation helpers ──────────────────────────────────────────────────────
# The frontend validates for UX; this is the trust boundary. Every field that
# reaches the database goes through one of these.

MAX_IMAGES = 5


def _require_str(data: dict, field: str, *, max_len: int, required: bool = True) -> str:
    value = data.get(field)
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise TRPCError(message=f"{field} is required", code="BAD_REQUEST")
        return ""
    if not isinstance(value, str):
        raise TRPCError(message=f"{field} must be text", code="BAD_REQUEST")
    value = value.strip()
    if len(value) > max_len:
        raise TRPCError(
            message=f"{field} must be {max_len} characters or fewer", code="BAD_REQUEST"
        )
    return value


def _require_price(data: dict, field: str = "price") -> Decimal:
    raw = data.get(field)
    if raw is None or raw == "":
        raise TRPCError(message="price is required", code="BAD_REQUEST")
    try:
        price = Decimal(str(raw))
    except (InvalidOperation, ValueError):
        raise TRPCError(message="price must be a number", code="BAD_REQUEST")
    if price <= 0:
        raise TRPCError(message="price must be greater than zero", code="BAD_REQUEST")
    if price > Decimal("99999999.99"):
        raise TRPCError(message="price is out of range", code="BAD_REQUEST")
    return price.quantize(Decimal("0.01"))


def _require_int(data: dict, field: str, *, minimum: int = 0, maximum: int = 1_000_000) -> int:
    raw = data.get(field)
    if raw is None or raw == "":
        raise TRPCError(message=f"{field} is required", code="BAD_REQUEST")
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise TRPCError(message=f"{field} must be a whole number", code="BAD_REQUEST")
    if not (minimum <= value <= maximum):
        raise TRPCError(
            message=f"{field} must be between {minimum} and {maximum}", code="BAD_REQUEST"
        )
    return value


def _require_category(data: dict) -> str:
    category = data.get("category")
    if category not in CATEGORY_VALUES:
        raise TRPCError(
            message=f"category must be one of: {', '.join(CATEGORY_VALUES)}",
            code="BAD_REQUEST",
        )
    return category


def _string_list(data: dict, field: str, *, max_items: int = 20, max_len: int = 120) -> list[str]:
    raw = data.get(field) or []
    if isinstance(raw, str):
        raw = [part.strip() for part in raw.split(",")]
    if not isinstance(raw, list):
        raise TRPCError(message=f"{field} must be a list", code="BAD_REQUEST")
    cleaned = [str(item).strip() for item in raw if str(item).strip()]
    if len(cleaned) > max_items:
        raise TRPCError(message=f"{field} accepts at most {max_items} entries", code="BAD_REQUEST")
    for item in cleaned:
        if len(item) > max_len:
            raise TRPCError(message=f"{field} entries are too long", code="BAD_REQUEST")
    return cleaned


def _size_options(price_220: Decimal, price_300: Decimal) -> list[dict]:
    """
    Every product is sold in exactly two sizes — a 220ml and a 300ml glass —
    each with its own admin-set price. `Product.price` stays the 220ml price
    so existing sorting/filtering (which reads that one column) keeps working;
    the 300ml price lives only in this JSON column.
    """
    return [
        {"size": "220ml", "ml": 220, "price": str(price_220)},
        {"size": "300ml", "ml": 300, "price": str(price_300)},
    ]


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "product"


def _unique_slug(db: Session, base: str, *, exclude_id: Optional[int] = None) -> str:
    """Return `base`, or `base-2`, `base-3`… if the slug is already taken."""
    slug, counter = base, 1
    while True:
        query = db.query(Product).filter(Product.slug == slug)
        if exclude_id is not None:
            query = query.filter(Product.id != exclude_id)
        if query.first() is None:
            return slug
        counter += 1
        slug = f"{base}-{counter}"


def _validate_product_payload(db: Session, data: Any, *, product_id: Optional[int] = None) -> dict:
    """Validate and normalise a create/update payload into column values."""
    if not isinstance(data, dict):
        raise TRPCError(message="Product data is required", code="BAD_REQUEST")

    name = _require_str(data, "name", max_len=255)
    description = _require_str(data, "description", max_len=5000)
    category = _require_category(data)
    # `price` is the 220ml price; `price300` the 300ml price — every product
    # is sold in exactly these two sizes (see _size_options()).
    price = _require_price(data, "price")
    price_300 = _require_price(data, "price300")
    stock = _require_int(data, "stock", minimum=0, maximum=1_000_000)

    # Slug policy: generated from the name on create, then **stable**. Renaming
    # a product must not silently change its public /product/<slug> URL and
    # break every existing link, bookmark and search result. Pass an explicit
    # `slug` to change it deliberately.
    requested_slug = str(data.get("slug") or "").strip()
    if requested_slug:
        slug = _unique_slug(db, _slugify(requested_slug), exclude_id=product_id)
    elif product_id is not None:
        existing = db.query(Product).filter(Product.id == product_id).first()
        slug = existing.slug if existing else _unique_slug(db, _slugify(name))
    else:
        slug = _unique_slug(db, _slugify(name))

    images = _string_list(data, "images", max_items=MAX_IMAGES, max_len=2000)
    for url in images:
        if not (url.startswith("http://") or url.startswith("https://") or url.startswith("/")):
            raise TRPCError(
                message="Image URLs must start with http://, https:// or /",
                code="BAD_REQUEST",
            )

    return {
        "name": name,
        "slug": slug,
        "description": description,
        "category": category,
        "price": price,
        "stock": stock,
        "images": json.dumps(images),
        "scentNotes": json.dumps(_string_list(data, "scentNotes")),
        "burnTime": _require_str(data, "burnTime", max_len=100, required=False) or None,
        "waxType": _require_str(data, "waxType", max_len=100, required=False) or None,
        "sizeOptions": json.dumps(_size_options(price, price_300)),
        "isFeatured": bool(data.get("isFeatured")),
        "isBestseller": bool(data.get("isBestseller")),
        "isLimitedEdition": bool(data.get("isLimitedEdition")),
    }


# ─── Products ────────────────────────────────────────────────────────────────

def admin_products_list(db: Session, include_inactive: bool = True) -> list[dict]:
    """Every product, newest first. Includes soft-deleted rows by default."""
    query = db.query(Product)
    if not include_inactive:
        query = query.filter(Product.isActive == True)  # noqa: E712
    rows = query.order_by(Product.createdAt.desc(), Product.id.desc()).all()
    return [_admin_serialize(db, p) for p in rows]


def _admin_serialize(db: Session, p: Product) -> dict:
    """Product plus admin-only fields the storefront does not need."""
    data = _serialize_product(p)
    data["isActive"] = bool(p.isActive)
    data["orderItemCount"] = (
        db.query(func.count(OrderItem.id)).filter(OrderItem.productId == p.id).scalar() or 0
    )
    return data


def admin_products_create(db: Session, data: Any) -> dict:
    values = _validate_product_payload(db, data)
    product = Product(**values, averageRating=0, reviewCount=0, viewCount=0, isActive=True)
    db.add(product)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise TRPCError(message="A product with that slug already exists", code="CONFLICT")
    db.refresh(product)
    return _admin_serialize(db, product)


def admin_products_update(db: Session, product_id: int, data: Any) -> dict:
    product = db.query(Product).filter(Product.id == product_id).first()
    if product is None:
        raise TRPCError(message="Product not found", code="NOT_FOUND")

    values = _validate_product_payload(db, data, product_id=product_id)
    for key, value in values.items():
        setattr(product, key, value)

    if "isActive" in (data or {}):
        product.isActive = bool(data["isActive"])

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise TRPCError(message="A product with that slug already exists", code="CONFLICT")
    db.refresh(product)
    return _admin_serialize(db, product)


def admin_products_delete(db: Session, product_id: int) -> dict:
    """
    Delete a product.

    A product referenced by an existing order is deactivated rather than
    removed, so order history keeps resolving. SQLite does not enforce foreign
    keys here, so this check is what protects past orders.
    """
    product = db.query(Product).filter(Product.id == product_id).first()
    if product is None:
        raise TRPCError(message="Product not found", code="NOT_FOUND")

    referenced = (
        db.query(func.count(OrderItem.id)).filter(OrderItem.productId == product_id).scalar() or 0
    )
    if referenced:
        product.isActive = False
        db.commit()
        return {
            "id": product_id,
            "deleted": False,
            "deactivated": True,
            "message": (
                f"This product appears in {referenced} order item(s), so it was hidden "
                "from the store instead of deleted. Order history is preserved."
            ),
        }

    db.delete(product)
    db.commit()
    return {"id": product_id, "deleted": True, "deactivated": False, "message": "Product deleted"}


# ─── Inventory ───────────────────────────────────────────────────────────────

def admin_inventory_restock(db: Session, product_id: int, amount: int) -> dict:
    """Add `amount` units to a product's stock. Stock lives on the product row."""
    if amount <= 0:
        raise TRPCError(message="Restock amount must be greater than zero", code="BAD_REQUEST")
    if amount > 100_000:
        raise TRPCError(message="Restock amount is too large", code="BAD_REQUEST")

    product = db.query(Product).filter(Product.id == product_id).first()
    if product is None:
        raise TRPCError(message="Product not found", code="NOT_FOUND")

    product.stock = (product.stock or 0) + amount
    db.commit()
    db.refresh(product)
    return _admin_serialize(db, product)


def admin_inventory_set_stock(db: Session, product_id: int, stock: int) -> dict:
    """Set an absolute stock level (used by the inline stock editor)."""
    if stock < 0:
        raise TRPCError(message="Stock cannot be negative", code="BAD_REQUEST")

    product = db.query(Product).filter(Product.id == product_id).first()
    if product is None:
        raise TRPCError(message="Product not found", code="NOT_FOUND")

    product.stock = stock
    db.commit()
    db.refresh(product)
    return _admin_serialize(db, product)


# ─── Customers ───────────────────────────────────────────────────────────────

def admin_customers_list(db: Session) -> list[dict]:
    """
    Customers with their real order history.

    Order IDs come from the orders table — the admin table and the customer's
    own order record therefore always show the same identifier.
    """
    customers = (
        db.query(User)
        .filter(User.role == "user")
        .order_by(User.createdAt.desc())
        .all()
    )

    results = []
    for user in customers:
        orders = (
            db.query(Order)
            .filter(Order.userId == user.id)
            .order_by(Order.createdAt.desc())
            .all()
        )
        total_spent = sum((o.total or 0) for o in orders)
        results.append(
            {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "phone": user.phone,
                "city": user.city,
                "orderCount": len(orders),
                "totalSpent": str(total_spent),
                "joinDate": user.createdAt.isoformat() if user.createdAt else None,
                "lastOrderDate": orders[0].createdAt.isoformat() if orders else None,
                # Most recent order first — this is the Order ID column.
                "latestOrderNumber": orders[0].orderNumber if orders else None,
                "latestOrderId": orders[0].id if orders else None,
                "orders": [
                    {
                        "id": o.id,
                        "orderNumber": o.orderNumber,
                        "status": o.status,
                        "paymentStatus": o.paymentStatus,
                        "total": str(o.total),
                        "createdAt": o.createdAt.isoformat() if o.createdAt else None,
                    }
                    for o in orders
                ],
            }
        )
    return results


# ─── Orders ──────────────────────────────────────────────────────────────────

ORDER_STATUSES = ("pending", "processing", "shipped", "delivered", "cancelled")


def admin_orders_list(db: Session) -> list[dict]:
    """All orders with their customer and line items."""
    orders = db.query(Order).order_by(Order.createdAt.desc()).all()

    results = []
    for o in orders:
        user = db.query(User).filter(User.id == o.userId).first()
        items = db.query(OrderItem).filter(OrderItem.orderId == o.id).all()
        results.append(
            {
                "id": o.id,
                "orderNumber": o.orderNumber,
                "customerName": (user.name if user else None) or o.customerEmail,
                "customerEmail": o.customerEmail,
                "customerPhone": o.customerPhone,
                "userId": o.userId,
                "status": o.status,
                "paymentMethod": o.paymentMethod,
                "paymentStatus": o.paymentStatus,
                "stripePaymentIntentId": o.stripePaymentIntentId,
                "total": str(o.total),
                "subtotal": str(o.subtotal),
                "shippingCost": str(o.shippingCost or 0),
                "discountAmount": str(o.discountAmount or 0),
                "promoCode": o.promoCode,
                "shippingAddress": o.shippingAddress,
                "shippingCity": o.shippingCity,
                "shippingZipCode": o.shippingZipCode,
                "shippingCountry": o.shippingCountry,
                "trackingNumber": o.trackingNumber,
                "giftPackaging": bool(o.giftPackaging),
                "giftPackagingFee": str(o.giftPackagingFee or 0),
                "giftCardMessage": o.giftCardMessage,
                "giftRecipientName": o.giftRecipientName,
                "giftSenderName": o.giftSenderName,
                "itemCount": sum(i.quantity for i in items),
                "items": [
                    {
                        "id": i.id,
                        "productId": i.productId,
                        "quantity": i.quantity,
                        "unitPrice": str(i.unitPrice),
                        "size": i.size,
                    }
                    for i in items
                ],
                "createdAt": o.createdAt.isoformat() if o.createdAt else None,
            }
        )
    return results


def admin_orders_update_status(db: Session, order_id: int, status: str) -> dict:
    if status not in ORDER_STATUSES:
        raise TRPCError(
            message=f"status must be one of: {', '.join(ORDER_STATUSES)}", code="BAD_REQUEST"
        )
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise TRPCError(message="Order not found", code="NOT_FOUND")

    order.status = status
    db.commit()
    return {"id": order.id, "orderNumber": order.orderNumber, "status": order.status}


def admin_orders_mark_advance_paid(db: Session, order_id: int) -> dict:
    """
    Record that staff have manually confirmed the advance payment for an
    order that required one. This never touches `paymentStatus` — the advance
    is a separate, partial amount, tracked so it isn't mistaken for the order
    being fully paid.
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise TRPCError(message="Order not found", code="NOT_FOUND")
    if not order.advanceRequired:
        raise TRPCError(message="This order does not require an advance payment", code="BAD_REQUEST")

    order.advancePaid = True
    db.commit()
    return {"id": order.id, "orderNumber": order.orderNumber, "advancePaid": order.advancePaid}


# ─── Dashboard ───────────────────────────────────────────────────────────────

def admin_stats(db: Session) -> dict:
    """Counts for the dashboard — all derived from the database, never hardcoded."""
    products = db.query(Product).filter(Product.isActive == True).all()  # noqa: E712
    orders = db.query(Order).all()

    revenue = sum(
        (o.total or 0) for o in orders if o.paymentStatus == "completed"
    )

    by_category: dict[str, int] = {}
    for p in products:
        by_category[p.category] = by_category.get(p.category, 0) + 1

    return {
        "productCount": len(products),
        "outOfStock": len([p for p in products if (p.stock or 0) == 0]),
        "lowStock": len([p for p in products if 0 < (p.stock or 0) < 10]),
        "customerCount": db.query(func.count(User.id)).filter(User.role == "user").scalar() or 0,
        "orderCount": len(orders),
        "pendingOrders": len([o for o in orders if o.status == "pending"]),
        # Only payments a gateway actually confirmed count towards revenue.
        "confirmedRevenue": str(revenue),
        "awaitingPayment": len([o for o in orders if o.paymentStatus == "pending"]),
        # Orders needing gift packaging that have not shipped yet — the packing
        # bench needs to see these.
        "giftOrdersToPack": len(
            [
                o
                for o in orders
                if o.giftPackaging and o.status in ("pending", "processing")
            ]
        ),
        "productsByCategory": by_category,
    }


# ─── Promo codes ─────────────────────────────────────────────────────────────
# These are the codes shoppers type at checkout. Editing one here changes what
# promos.validate accepts and what create_order_from_cart() will discount.

DISCOUNT_TYPES = ("percent", "flat")


def _serialize_promo(p: "PromoCode") -> dict:
    return {
        "id": p.id,
        "code": p.code,
        "discountType": p.discountType,
        "value": str(p.value),
        "usageLimit": p.usageLimit,
        "usedCount": p.usedCount or 0,
        "expiryDate": p.expiryDate.isoformat() if p.expiryDate else None,
        "isActive": bool(p.isActive),
        "applicableCategory": p.applicableCategory,
        "minOrderAmount": str(p.minOrderAmount or 0),
        "firstOrderOnly": bool(p.firstOrderOnly),
        "createdAt": p.createdAt.isoformat() if p.createdAt else None,
    }


def _validate_promo_payload(db: Session, data: Any, *, promo_id: Optional[int] = None) -> dict:
    from datetime import datetime

    from database import PromoCode

    if not isinstance(data, dict):
        raise TRPCError(message="Promo data is required", code="BAD_REQUEST")

    code = _require_str(data, "code", max_len=50).upper()
    if not re.fullmatch(r"[A-Z0-9_-]{3,50}", code):
        raise TRPCError(
            message="Code must be 3–50 characters, letters, numbers, - or _ only",
            code="BAD_REQUEST",
        )

    clash = db.query(PromoCode).filter(PromoCode.code == code)
    if promo_id is not None:
        clash = clash.filter(PromoCode.id != promo_id)
    if clash.first() is not None:
        raise TRPCError(message=f"Promo code {code} already exists", code="CONFLICT")

    discount_type = data.get("discountType") or data.get("type")
    if discount_type not in DISCOUNT_TYPES:
        raise TRPCError(message="discountType must be 'percent' or 'flat'", code="BAD_REQUEST")

    try:
        value = Decimal(str(data.get("value")))
    except (InvalidOperation, TypeError, ValueError):
        raise TRPCError(message="value must be a number", code="BAD_REQUEST")
    if value <= 0:
        raise TRPCError(message="value must be greater than zero", code="BAD_REQUEST")
    if discount_type == "percent" and value > 100:
        raise TRPCError(message="A percentage discount cannot exceed 100", code="BAD_REQUEST")

    usage_limit = data.get("usageLimit")
    if usage_limit in (None, "", 0):
        usage_limit = None
    else:
        usage_limit = _require_int({"usageLimit": usage_limit}, "usageLimit", minimum=1, maximum=1_000_000)

    expiry = data.get("expiryDate")
    expiry_date = None
    if expiry:
        try:
            expiry_date = datetime.fromisoformat(str(expiry)[:19])
        except ValueError:
            raise TRPCError(message="expiryDate must be a date (YYYY-MM-DD)", code="BAD_REQUEST")

    category = data.get("applicableCategory") or "all"
    if category != "all" and category not in CATEGORY_VALUES:
        raise TRPCError(
            message=f"applicableCategory must be 'all' or one of: {', '.join(CATEGORY_VALUES)}",
            code="BAD_REQUEST",
        )

    try:
        min_order = Decimal(str(data.get("minOrderAmount") or 0))
    except (InvalidOperation, ValueError):
        raise TRPCError(message="minOrderAmount must be a number", code="BAD_REQUEST")
    if min_order < 0:
        raise TRPCError(message="minOrderAmount cannot be negative", code="BAD_REQUEST")

    return {
        "code": code,
        "discountType": discount_type,
        "value": value.quantize(Decimal("0.01")),
        "usageLimit": usage_limit,
        "expiryDate": expiry_date,
        "isActive": bool(data.get("isActive", True)),
        "applicableCategory": category,
        "minOrderAmount": min_order.quantize(Decimal("0.01")),
        "firstOrderOnly": bool(data.get("firstOrderOnly", False)),
    }


def admin_promos_list(db: Session) -> list[dict]:
    from database import PromoCode

    rows = db.query(PromoCode).order_by(PromoCode.createdAt.desc(), PromoCode.id.desc()).all()
    return [_serialize_promo(p) for p in rows]


def admin_promos_create(db: Session, data: Any) -> dict:
    from database import PromoCode

    values = _validate_promo_payload(db, data)
    promo = PromoCode(**values, usedCount=0)
    db.add(promo)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise TRPCError(message="That promo code already exists", code="CONFLICT")
    db.refresh(promo)
    return _serialize_promo(promo)


def admin_promos_update(db: Session, promo_id: int, data: Any) -> dict:
    from database import PromoCode

    promo = db.query(PromoCode).filter(PromoCode.id == promo_id).first()
    if promo is None:
        raise TRPCError(message="Promo code not found", code="NOT_FOUND")

    for key, value in _validate_promo_payload(db, data, promo_id=promo_id).items():
        setattr(promo, key, value)
    db.commit()
    db.refresh(promo)
    return _serialize_promo(promo)


def admin_promos_delete(db: Session, promo_id: int) -> dict:
    from database import Order, PromoCode

    promo = db.query(PromoCode).filter(PromoCode.id == promo_id).first()
    if promo is None:
        raise TRPCError(message="Promo code not found", code="NOT_FOUND")

    # Orders store the code as a plain string, so deleting it does not corrupt
    # order history — but say so, because the number matters to the operator.
    used_on = db.query(func.count(Order.id)).filter(Order.promoCode == promo.code).scalar() or 0
    code = promo.code
    db.delete(promo)
    db.commit()
    return {
        "id": promo_id,
        "code": code,
        "message": (
            f"{code} deleted. {used_on} past order(s) still record this code."
            if used_on
            else f"{code} deleted."
        ),
    }


# ─── Reviews ─────────────────────────────────────────────────────────────────
# Moderation. A review only appears on a product page once approved, and the
# product's rating is recomputed from approved reviews whenever that changes.

REVIEW_STATUSES = ("pending", "approved", "rejected")


def recalculate_product_rating(db: Session, product_id: int) -> None:
    """
    Recompute averageRating and reviewCount from approved reviews only.

    Called after any moderation action so the storefront rating always matches
    what a shopper can actually read on the page.
    """
    from database import Review

    approved = (
        db.query(Review)
        .filter(Review.productId == product_id, Review.status == "approved")
        .all()
    )
    product = db.query(Product).filter(Product.id == product_id).first()
    if product is None:
        return

    # Combine locally-moderated reviews with the historical aggregate imported
    # from the live store, so rejecting one review moves the count by one rather
    # than collapsing a 211-review history down to the rows we happen to hold.
    imported_count = product.importedReviewCount or 0
    imported_sum = float(product.importedRatingSum or 0)

    total_count = imported_count + len(approved)
    total_sum = imported_sum + sum(r.rating for r in approved)

    if total_count > 0:
        product.averageRating = Decimal(str(round(total_sum / total_count, 2)))
        product.reviewCount = total_count
    else:
        product.averageRating = Decimal("0")
        product.reviewCount = 0


def admin_reviews_list(db: Session) -> list[dict]:
    from database import Review

    rows = (
        db.query(Review, User, Product)
        .outerjoin(User, User.id == Review.userId)
        .outerjoin(Product, Product.id == Review.productId)
        .order_by(Review.createdAt.desc())
        .all()
    )
    return [
        {
            "id": review.id,
            "productId": review.productId,
            "productName": product.name if product else "(deleted product)",
            "customerName": (user.name if user else None) or "Guest",
            "customerEmail": (user.email if user else None) or "",
            "rating": review.rating,
            "title": review.title or "",
            "body": review.body or "",
            "status": review.status,
            "isVerifiedPurchase": bool(review.isVerifiedPurchase),
            "helpful": review.helpful or 0,
            "createdAt": review.createdAt.isoformat() if review.createdAt else None,
        }
        for review, user, product in rows
    ]


def admin_reviews_update_status(db: Session, review_id: int, status: str) -> dict:
    from database import Review

    if status not in REVIEW_STATUSES:
        raise TRPCError(
            message=f"status must be one of: {', '.join(REVIEW_STATUSES)}", code="BAD_REQUEST"
        )
    review = db.query(Review).filter(Review.id == review_id).first()
    if review is None:
        raise TRPCError(message="Review not found", code="NOT_FOUND")

    review.status = status
    # SessionLocal is configured with autoflush=False, so the pending status
    # change must be flushed before the recalculation queries the reviews table
    # — otherwise it reads the pre-change state and lands one step behind.
    db.flush()
    recalculate_product_rating(db, review.productId)
    db.commit()
    return {"id": review.id, "productId": review.productId, "status": review.status}


def admin_reviews_delete(db: Session, review_id: int) -> dict:
    from database import Review

    review = db.query(Review).filter(Review.id == review_id).first()
    if review is None:
        raise TRPCError(message="Review not found", code="NOT_FOUND")

    product_id = review.productId
    db.delete(review)
    db.flush()
    recalculate_product_rating(db, product_id)
    db.commit()
    return {"id": review_id, "productId": product_id, "deleted": True}


# ─── Analytics ───────────────────────────────────────────────────────────────

def admin_analytics(db: Session) -> dict:
    """
    Sales reporting derived entirely from the orders table.

    `revenue` counts every placed order (what the store has sold);
    `confirmedRevenue` counts only orders a gateway has confirmed as paid. They
    differ deliberately — do not merge them.
    """
    from collections import OrderedDict

    orders = db.query(Order).order_by(Order.createdAt.asc()).all()
    items = db.query(OrderItem).all()

    def bucket(fmt: str) -> list[dict]:
        grouped: "OrderedDict[str, dict]" = OrderedDict()
        for o in orders:
            if not o.createdAt:
                continue
            key = o.createdAt.strftime(fmt)
            row = grouped.setdefault(key, {"label": key, "revenue": 0.0, "orders": 0})
            row["revenue"] += float(o.total or 0)
            row["orders"] += 1
        return list(grouped.values())

    units: dict[int, int] = {}
    revenue_by_product: dict[int, float] = {}
    for i in items:
        units[i.productId] = units.get(i.productId, 0) + i.quantity
        revenue_by_product[i.productId] = revenue_by_product.get(i.productId, 0.0) + float(
            (i.unitPrice or 0) * i.quantity
        )

    products = {p.id: p for p in db.query(Product).all()}
    top_products = sorted(
        (
            {
                "productId": pid,
                "name": products[pid].name if pid in products else "(deleted product)",
                "category": products[pid].category if pid in products else None,
                "unitsSold": qty,
                "revenue": str(round(revenue_by_product.get(pid, 0.0), 2)),
            }
            for pid, qty in units.items()
        ),
        key=lambda r: r["unitsSold"],
        reverse=True,
    )[:10]

    revenue_by_category: dict[str, float] = {}
    for pid, amount in revenue_by_product.items():
        product = products.get(pid)
        if product:
            revenue_by_category[product.category] = (
                revenue_by_category.get(product.category, 0.0) + amount
            )

    total_revenue = sum(float(o.total or 0) for o in orders)
    confirmed = [o for o in orders if o.paymentStatus == "completed"]

    return {
        "daily": bucket("%Y-%m-%d")[-14:],
        "weekly": bucket("%Y-W%W")[-12:],
        "monthly": bucket("%Y-%m")[-12:],
        "topProducts": top_products,
        "revenueByCategory": {k: str(round(v, 2)) for k, v in revenue_by_category.items()},
        "ordersByStatus": {
            status: len([o for o in orders if o.status == status])
            for status in ORDER_STATUSES
        },
        "totalOrders": len(orders),
        "totalRevenue": str(round(total_revenue, 2)),
        "confirmedRevenue": str(round(sum(float(o.total or 0) for o in confirmed), 2)),
        "averageOrderValue": str(round(total_revenue / len(orders), 2)) if orders else "0",
        "unitsSold": sum(units.values()),
    }


# ─── Payments ────────────────────────────────────────────────────────────────

def admin_payments_list(db: Session) -> dict:
    """
    Payment records, derived from orders — there is no separate payments table.

    Every row states plainly whether money has actually been confirmed. Nothing
    here may present a `pending` order as paid.
    """
    orders = db.query(Order).order_by(Order.createdAt.desc()).all()

    records = []
    for o in orders:
        user = db.query(User).filter(User.id == o.userId).first()
        records.append(
            {
                "id": o.id,
                "orderNumber": o.orderNumber,
                "customerName": (user.name if user else None) or o.customerEmail,
                "customerEmail": o.customerEmail,
                "amount": str(o.total),
                "method": o.paymentMethod,
                "paymentStatus": o.paymentStatus,
                "orderStatus": o.status,
                "gatewayReference": o.stripePaymentIntentId,
                # A method with no integration can never self-confirm; the
                # admin panel should say so rather than imply otherwise.
                "requiresManualConfirmation": o.paymentMethod in ("easypaisa", "jazzcash"),
                "createdAt": o.createdAt.isoformat() if o.createdAt else None,
            }
        )

    by_method: dict[str, dict] = {}
    for r in records:
        row = by_method.setdefault(r["method"], {"method": r["method"], "count": 0, "amount": 0.0})
        row["count"] += 1
        row["amount"] += float(r["amount"])

    return {
        "records": records,
        "byMethod": [
            {**row, "amount": str(round(row["amount"], 2))} for row in by_method.values()
        ],
        "totals": {
            "all": str(round(sum(float(r["amount"]) for r in records), 2)),
            "confirmed": str(
                round(sum(float(r["amount"]) for r in records if r["paymentStatus"] == "completed"), 2)
            ),
            "pending": str(
                round(sum(float(r["amount"]) for r in records if r["paymentStatus"] == "pending"), 2)
            ),
            "failed": str(
                round(sum(float(r["amount"]) for r in records if r["paymentStatus"] == "failed"), 2)
            ),
        },
        "counts": {
            status: len([r for r in records if r["paymentStatus"] == status])
            for status in ("pending", "completed", "failed", "refunded")
        },
    }
