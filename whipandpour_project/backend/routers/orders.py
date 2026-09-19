"""
routers/orders.py — Order handlers.
Mirrors: orders.list, orders.byId, orders.items
"""

import json
import re
import secrets
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from auth import TRPCError
from database import Order, OrderItem, Product

# Payment methods the order system accepts. Selecting one records an intent —
# it never implies the money moved. See create_order_from_cart().
PAYMENT_METHODS = ("stripe", "easypaisa", "jazzcash", "cod")

# Matches the threshold advertised on whipandpour.com.
FREE_SHIPPING_THRESHOLD = Decimal("4000")
SHIPPING_FLAT_RATE = Decimal("200")

# ── Gifting ──────────────────────────────────────────────────────────────────
# Gift packaging is a paid add-on; the handwritten card is included with it.
# Change the fee here and it applies to new orders only — existing orders keep
# the fee stored on the order row.
GIFT_PACKAGING_FEE = Decimal("1000")
GIFT_MESSAGE_MAX_LENGTH = 400

# ── Advance payment ───────────────────────────────────────────────────────────
# If any single line item's unit price is at or above this threshold, the
# order requires a 30% advance before it ships. There is no payment gateway
# for it — the shopper sends it via the manual JazzCash/Easypaisa/bank flow
# and staff confirm receipt (admin.orders.markAdvancePaid). This never changes
# paymentStatus; it is tracked separately so a partially-paid order is never
# mistaken for a fully-paid one.
ADVANCE_ITEM_THRESHOLD = Decimal("2500")
ADVANCE_PERCENT = Decimal("0.30")

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE_RE = re.compile(r"^[0-9+\-\s()]{7,20}$")


def _resolve_size_price(product: Product, size: str) -> Decimal:
    """
    Price a cart line by the size the shopper actually picked (220ml/300ml),
    not the product's flat `price` column — each size has its own admin-set
    price in `sizeOptions`. Never trust a price the client sends.
    """
    try:
        options = json.loads(product.sizeOptions) if product.sizeOptions else []
    except (ValueError, TypeError):
        options = []

    for option in options:
        if isinstance(option, dict) and option.get("size") == size and "price" in option:
            try:
                return Decimal(str(option["price"]))
            except (InvalidOperation, TypeError):
                break

    if not size and options:
        # No size selected (legacy single-size cart entry) — use the first.
        first = options[0]
        if isinstance(first, dict) and "price" in first:
            return Decimal(str(first["price"]))

    if not options:
        # Product predates per-size pricing and hasn't been migrated — fall
        # back to its flat price rather than failing the whole checkout.
        return Decimal(str(product.price))

    raise TRPCError(
        message=f"'{size}' is no longer a size option for {product.name}. Please refresh your cart.",
        code="BAD_REQUEST",
    )


def _serialize_order(o: Order) -> dict:
    return {
        "id": o.id,
        "userId": o.userId,
        "orderNumber": o.orderNumber,
        "status": o.status,
        "total": str(o.total),
        "subtotal": str(o.subtotal),
        "shippingCost": str(o.shippingCost) if o.shippingCost is not None else "0",
        "discountAmount": str(o.discountAmount) if o.discountAmount is not None else "0",
        "promoCode": o.promoCode,
        "shippingAddress": o.shippingAddress,
        "shippingCity": o.shippingCity,
        "shippingState": o.shippingState,
        "shippingZipCode": o.shippingZipCode,
        "shippingCountry": o.shippingCountry,
        "paymentMethod": o.paymentMethod,
        "paymentStatus": o.paymentStatus,
        "stripePaymentIntentId": o.stripePaymentIntentId,
        "trackingNumber": o.trackingNumber,
        "customerEmail": o.customerEmail,
        "customerPhone": o.customerPhone,
        "notes": o.notes,
        "giftPackaging": bool(o.giftPackaging),
        "giftPackagingFee": str(o.giftPackagingFee or 0),
        "giftCardMessage": o.giftCardMessage,
        "giftRecipientName": o.giftRecipientName,
        "giftSenderName": o.giftSenderName,
        "advanceRequired": bool(o.advanceRequired),
        "advanceAmount": str(o.advanceAmount or 0),
        "advancePaid": bool(o.advancePaid),
        "balanceDueAmount": str(o.balanceDueAmount or 0),
        "createdAt": o.createdAt.isoformat() if o.createdAt else None,
        "updatedAt": o.updatedAt.isoformat() if o.updatedAt else None,
    }


def _serialize_order_item(i: OrderItem) -> dict:
    return {
        "id": i.id,
        "orderId": i.orderId,
        "productId": i.productId,
        "quantity": i.quantity,
        "unitPrice": str(i.unitPrice),
        "size": i.size,
        "createdAt": i.createdAt.isoformat() if i.createdAt else None,
    }


def orders_list(db: Session, user_id: int) -> List[dict]:
    rows = (
        db.query(Order)
        .filter(Order.userId == user_id)
        .order_by(Order.createdAt.desc())
        .all()
    )
    return [_serialize_order(o) for o in rows]


def orders_by_id(db: Session, order_id: int, user_id: int) -> dict:
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order or order.userId != user_id:
        raise TRPCError(message="Order not found", code="NOT_FOUND")
    return _serialize_order(order)


def orders_items(db: Session, order_id: int) -> List[dict]:
    rows = db.query(OrderItem).filter(OrderItem.orderId == order_id).all()
    return [_serialize_order_item(i) for i in rows]


def create_order(
    db: Session,
    user_id: int,
    order_number: str,
    status: str,
    total: float,
    subtotal: float,
    shipping_cost: float,
    discount_amount: float,
    promo_code: Optional[str],
    shipping_address: str,
    shipping_city: str,
    shipping_state: Optional[str],
    shipping_zip_code: str,
    shipping_country: str,
    payment_method: str,
    payment_status: str,
    stripe_payment_intent_id: Optional[str],
    customer_email: str,
    customer_phone: Optional[str],
    cart_items: list,
) -> Order:
    order = Order(
        userId=user_id,
        orderNumber=order_number,
        status=status,
        total=total,
        subtotal=subtotal,
        shippingCost=shipping_cost,
        discountAmount=discount_amount,
        promoCode=promo_code,
        shippingAddress=shipping_address,
        shippingCity=shipping_city,
        shippingState=shipping_state,
        shippingZipCode=shipping_zip_code,
        shippingCountry=shipping_country,
        paymentMethod=payment_method,
        paymentStatus=payment_status,
        stripePaymentIntentId=stripe_payment_intent_id,
        customerEmail=customer_email,
        customerPhone=customer_phone,
    )
    db.add(order)
    db.flush()  # get order.id without committing

    for item in cart_items:
        oi = OrderItem(
            orderId=order.id,
            productId=item["productId"],
            quantity=item["quantity"],
            unitPrice=item["price"],
            size=item.get("size", ""),
        )
        db.add(oi)

    db.commit()
    db.refresh(order)
    return order


# ─── Order creation from the checkout page ───────────────────────────────────

def _generate_order_number(db: Session) -> str:
    """
    Server-side, collision-checked order number.

    Never generate this in the browser: two shoppers can produce the same
    Math.random() value, and a client-side number is not tied to the row that
    actually exists.
    """
    for _ in range(10):
        candidate = f"WP-{datetime.utcnow():%y%m}-{secrets.randbelow(1_000_000):06d}"
        if db.query(Order).filter(Order.orderNumber == candidate).first() is None:
            return candidate
    raise TRPCError(
        message="Could not allocate an order number, please try again",
        code="INTERNAL_SERVER_ERROR",
    )


def _clean(value: Any, field: str, *, max_len: int, required: bool = True) -> str:
    text = str(value or "").strip()
    if not text:
        if required:
            raise TRPCError(message=f"{field} is required", code="BAD_REQUEST")
        return ""
    if len(text) > max_len:
        raise TRPCError(message=f"{field} is too long", code="BAD_REQUEST")
    return text


def resolve_checkout_user(db: Session, current_user, email: str, full_name: str):
    """
    Return the user row an order should belong to.

    `orders.userId` is NOT NULL, and this store has no customer login flow, so a
    guest checkout still needs a user row. We reuse the account matching the
    email if there is one, otherwise create a guest account. This keeps repeat
    orders from the same email attached to a single customer record, which is
    what the admin customers table reports on.
    """
    from database import User

    if current_user is not None:
        return current_user

    normalized = email.strip().lower()
    existing = db.query(User).filter(func.lower(User.email) == normalized).first()
    if existing is not None:
        return existing

    guest = User(
        openId=f"guest_{normalized.replace('@', '_').replace('.', '_')}",
        name=full_name or None,
        email=normalized,
        loginMethod="guest_checkout",
        role="user",
    )
    db.add(guest)
    db.flush()
    return guest


def create_order_from_cart(db: Session, user, data: Any) -> dict:
    """
    Validate a checkout submission, price it from the database, and persist the
    order plus its line items.

    Two rules this function exists to enforce:

    1. **Prices come from the products table, never from the request.** A client
       can post any price it likes; we ignore it and re-read the row.
    2. **paymentStatus is always 'pending'.** No code path here marks an order
       paid. Only a verified gateway callback may do that.
    """
    if not isinstance(data, dict):
        raise TRPCError(message="Checkout data is required", code="BAD_REQUEST")

    # ── Customer details ────────────────────────────────────────────────────
    full_name = _clean(data.get("fullName"), "Full name", max_len=200)
    email = _clean(data.get("email"), "Email", max_len=320)
    if not _EMAIL_RE.match(email):
        raise TRPCError(message="Enter a valid email address", code="BAD_REQUEST")

    phone = _clean(data.get("phone"), "Phone number", max_len=20)
    if not _PHONE_RE.match(phone):
        raise TRPCError(message="Enter a valid phone number", code="BAD_REQUEST")

    address = _clean(data.get("address"), "Address", max_len=500)
    city = _clean(data.get("city"), "City", max_len=100)
    postal_code = _clean(data.get("postalCode"), "Postal code", max_len=20)
    province = _clean(data.get("province"), "Province", max_len=100, required=False)
    country = _clean(data.get("country") or "Pakistan", "Country", max_len=100)
    notes = _clean(data.get("notes"), "Notes", max_len=1000, required=False)

    payment_method = data.get("paymentMethod")
    if payment_method not in PAYMENT_METHODS:
        raise TRPCError(
            message=f"paymentMethod must be one of: {', '.join(PAYMENT_METHODS)}",
            code="BAD_REQUEST",
        )

    # A guest checkout still needs a user row for the NOT NULL foreign key.
    user = resolve_checkout_user(db, user, email, full_name)

    # ── Cart ────────────────────────────────────────────────────────────────
    raw_items = data.get("items") or []
    if not isinstance(raw_items, list) or not raw_items:
        raise TRPCError(message="Your cart is empty", code="BAD_REQUEST")
    if len(raw_items) > 50:
        raise TRPCError(message="Too many items in one order", code="BAD_REQUEST")

    priced_items = []
    subtotal = Decimal("0")

    for raw in raw_items:
        if not isinstance(raw, dict):
            raise TRPCError(message="Invalid cart item", code="BAD_REQUEST")
        try:
            product_id = int(raw.get("productId"))
            quantity = int(raw.get("quantity", 0))
        except (TypeError, ValueError):
            raise TRPCError(message="Invalid cart item", code="BAD_REQUEST")

        if quantity < 1 or quantity > 100:
            raise TRPCError(message="Quantity must be between 1 and 100", code="BAD_REQUEST")

        product = db.query(Product).filter(Product.id == product_id).first()
        if product is None or not product.isActive:
            raise TRPCError(
                message=f"A product in your cart is no longer available (id {product_id})",
                code="BAD_REQUEST",
            )
        if (product.stock or 0) < quantity:
            raise TRPCError(
                message=f"Only {product.stock or 0} left of {product.name}",
                code="CONFLICT",
            )

        size = str(raw.get("size") or "")[:100]
        unit_price = _resolve_size_price(product, size)
        subtotal += unit_price * quantity
        priced_items.append(
            {
                "product": product,
                "productId": product.id,
                "quantity": quantity,
                "unitPrice": unit_price,
                "size": size,
            }
        )

    # ── Gifting options ─────────────────────────────────────────────────────
    gift_packaging = bool(data.get("giftPackaging"))
    gift_message = _clean(data.get("giftCardMessage"), "Gift message",
                          max_len=GIFT_MESSAGE_MAX_LENGTH, required=False)
    gift_recipient = _clean(data.get("giftRecipientName"), "Recipient name",
                            max_len=200, required=False)
    gift_sender = _clean(data.get("giftSenderName"), "Sender name", max_len=200, required=False)

    # A card message only makes sense with the gift packaging that carries it.
    if (gift_message or gift_recipient) and not gift_packaging:
        raise TRPCError(
            message="Add gift packaging to include a handwritten card",
            code="BAD_REQUEST",
        )

    gift_fee = GIFT_PACKAGING_FEE if gift_packaging else Decimal("0")

    # ── Totals, computed server-side ────────────────────────────────────────
    shipping_cost = Decimal("0") if subtotal >= FREE_SHIPPING_THRESHOLD else SHIPPING_FLAT_RATE
    discount_amount = Decimal("0")
    promo_code = _clean(data.get("promoCode"), "Promo code", max_len=50, required=False) or None

    if promo_code:
        from database import PromoCode

        promo = (
            db.query(PromoCode)
            .filter(PromoCode.code == promo_code, PromoCode.isActive == True)  # noqa: E712
            .first()
        )
        if promo is None:
            raise TRPCError(message="That promo code is not valid", code="BAD_REQUEST")
        if promo.firstOrderOnly:
            # Any prior order for this email — regardless of status — counts as
            # "not a first order". Checked here, server-side, against the
            # database rather than trusting anything the client claims, so
            # clearing localStorage or resubmitting cannot re-claim the offer.
            has_ordered_before = (
                db.query(Order.id)
                .filter(func.lower(Order.customerEmail) == email.strip().lower())
                .first()
                is not None
            )
            if has_ordered_before:
                raise TRPCError(
                    message="This code is valid for first orders only",
                    code="BAD_REQUEST",
                )
        if subtotal < Decimal(str(promo.minOrderAmount or 0)):
            raise TRPCError(
                message=f"This code needs a minimum order of PKR {promo.minOrderAmount}",
                code="BAD_REQUEST",
            )
        if promo.discountType == "percent":
            discount_amount = (subtotal * Decimal(str(promo.value)) / Decimal("100"))
        else:
            discount_amount = Decimal(str(promo.value))
        discount_amount = min(discount_amount, subtotal).quantize(Decimal("0.01"))

    total = (subtotal + shipping_cost + gift_fee - discount_amount).quantize(Decimal("0.01"))

    # ── Advance payment ──────────────────────────────────────────────────────
    # Based on the priced line items, never the client's cart — a shopper
    # cannot dodge this by claiming a lower price for an expensive candle.
    requires_advance = any(item["unitPrice"] >= ADVANCE_ITEM_THRESHOLD for item in priced_items)
    advance_amount = (total * ADVANCE_PERCENT).quantize(Decimal("0.01")) if requires_advance else Decimal("0")
    balance_due = (total - advance_amount).quantize(Decimal("0.01"))

    # ── Persist ─────────────────────────────────────────────────────────────
    order = Order(
        userId=user.id,
        orderNumber=_generate_order_number(db),
        status="pending",
        total=total,
        subtotal=subtotal.quantize(Decimal("0.01")),
        shippingCost=shipping_cost,
        discountAmount=discount_amount,
        promoCode=promo_code,
        shippingAddress=address,
        shippingCity=city,
        shippingState=province or None,
        shippingZipCode=postal_code,
        shippingCountry=country,
        paymentMethod=payment_method,
        # Always pending. Cash on delivery settles at the door; card and wallet
        # payments settle when their gateway confirms. Nothing here is "paid".
        paymentStatus="pending",
        customerEmail=email,
        customerPhone=phone,
        notes=notes or None,
        giftPackaging=gift_packaging,
        giftPackagingFee=gift_fee,
        giftCardMessage=gift_message or None,
        giftRecipientName=gift_recipient or None,
        giftSenderName=gift_sender or None,
        advanceRequired=requires_advance,
        advanceAmount=advance_amount,
        advancePaid=False,
        balanceDueAmount=balance_due,
    )
    db.add(order)
    db.flush()  # assigns order.id without committing

    for item in priced_items:
        db.add(
            OrderItem(
                orderId=order.id,
                productId=item["productId"],
                quantity=item["quantity"],
                unitPrice=item["unitPrice"],
                size=item["size"],
            )
        )
        # Reserve stock in the same transaction so it cannot drift.
        item["product"].stock = (item["product"].stock or 0) - item["quantity"]

    # Keep the customer's saved details current for the next checkout.
    if not user.name:
        user.name = full_name
    user.phone = phone
    user.address = address
    user.city = city
    user.zipCode = postal_code
    user.country = country

    db.commit()
    db.refresh(order)

    serialized = _serialize_order_with_items(db, order)
    serialized["customerName"] = full_name

    # Email the confirmation. This runs on a background thread and can never
    # fail the order — if SMTP is not configured it logs and returns False.
    from mailer import send_order_confirmation

    email_queued = send_order_confirmation(serialized, serialized["items"])

    return {
        "order": _serialize_order(order),
        "items": [
            _serialize_order_item(i)
            for i in db.query(OrderItem).filter(OrderItem.orderId == order.id).all()
        ],
        # The UI must only promise an email when one was actually queued.
        "confirmationEmailQueued": email_queued,
        "giftPackagingFee": str(gift_fee),
        # Explicit so the UI never has to infer it.
        "paymentRequired": payment_method != "cod",
        "paymentStatus": order.paymentStatus,
    }


# ─── Guest order lookup ──────────────────────────────────────────────────────

def lookup_orders(db: Session, order_number: str, email: str) -> dict:
    """
    Look up an order for a shopper who has no account.

    Checkout is guest-based, so `orders.list` (which needs a session) is
    unreachable for real customers. The proof of ownership here is the same
    pair shown on the confirmation screen: order number + the email it was
    placed with. Both must match, so an order number alone reveals nothing.

    Returns the matching order plus every other order placed with that email,
    which is the closest thing to an order history a guest can have.
    """
    order_number = (order_number or "").strip()
    email = (email or "").strip()

    if not order_number:
        raise TRPCError(message="Enter the order number from your confirmation", code="BAD_REQUEST")
    if not _EMAIL_RE.match(email):
        raise TRPCError(message="Enter the email address used on the order", code="BAD_REQUEST")

    order = (
        db.query(Order)
        .filter(func.upper(Order.orderNumber) == order_number.upper())
        .first()
    )

    # One message for "no such order" and "wrong email" alike: distinguishing
    # them would turn this into a way to test whether an order number exists.
    if order is None or (order.customerEmail or "").strip().lower() != email.lower():
        raise TRPCError(
            message="We couldn't find an order with that number and email address.",
            code="NOT_FOUND",
        )

    history = (
        db.query(Order)
        .filter(func.lower(Order.customerEmail) == email.lower())
        .order_by(Order.createdAt.desc())
        .all()
    )

    return {
        "email": order.customerEmail,
        "customerName": order.giftSenderName or None,
        "orders": [_serialize_order_with_items(db, o) for o in history],
    }


def _serialize_order_with_items(db: Session, order: Order) -> dict:
    """An order plus its line items, with product names resolved for display."""
    items = db.query(OrderItem).filter(OrderItem.orderId == order.id).all()

    detailed = []
    for item in items:
        product = db.query(Product).filter(Product.id == item.productId).first()
        images = []
        if product:
            try:
                images = json.loads(product.images) if isinstance(product.images, str) else (product.images or [])
            except (ValueError, TypeError):
                images = []
        detailed.append(
            {
                **_serialize_order_item(item),
                "productName": product.name if product else "(no longer available)",
                "productSlug": product.slug if product else None,
                "image": images[0] if images else None,
                "lineTotal": str(item.unitPrice * item.quantity),
            }
        )

    data = _serialize_order(order)
    data["items"] = detailed
    data["itemCount"] = sum(i.quantity for i in items)
    return data
