"""
routers/reviews.py — Product reviews.
Mirrors: reviews.byProduct
"""

from typing import List, Optional
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import Review, User


def _serialize_review(r: Review, user: Optional[User] = None) -> dict:
    return {
        "id": r.id,
        "productId": r.productId,
        "userId": r.userId,
        # The reviews list renders a name; join it here rather than letting the
        # frontend invent one.
        "userName": (user.name if user else None) or "Verified Customer",
        "rating": r.rating,
        "title": r.title,
        "status": r.status,
        "body": r.body,
        "isVerifiedPurchase": bool(r.isVerifiedPurchase),
        "helpful": r.helpful or 0,
        "createdAt": r.createdAt.isoformat() if r.createdAt else None,
        "updatedAt": r.updatedAt.isoformat() if r.updatedAt else None,
    }


def reviews_by_product(db: Session, product_id: int) -> List[dict]:
    rows = (
        db.query(Review, User)
        .outerjoin(User, User.id == Review.userId)
        # Only approved reviews reach the storefront — moderation in the admin
        # panel is what gates this.
        .filter(Review.productId == product_id, Review.status == "approved")
        .order_by(Review.createdAt.desc())
        .all()
    )
    return [_serialize_review(review, user) for review, user in rows]


# ─── Writing a review ────────────────────────────────────────────────────────

import re
from datetime import datetime

from auth import TRPCError
from database import Order, OrderItem

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

REVIEW_BODY_MAX = 2000
REVIEW_TITLE_MAX = 200


def _find_verified_purchase(db: Session, product_id: int, order_number: str, email: str):
    """
    Return the (order, user) that entitles this person to review the product.

    Reviews are gated on an actual purchase, not on being logged in. This store
    has guest checkout, so the proof is the order number plus the email the
    order was placed with — the same pair printed on the confirmation screen.
    """
    from database import User

    order = (
        db.query(Order)
        .filter(func.upper(Order.orderNumber) == order_number.strip().upper())
        .first()
    )
    if order is None:
        raise TRPCError(
            message="We couldn't find that order number. Check your confirmation email.",
            code="NOT_FOUND",
        )

    if (order.customerEmail or "").strip().lower() != email.strip().lower():
        # Deliberately vague: this must not become a way to discover which email
        # placed a given order.
        raise TRPCError(
            message="That order number and email address don't match.",
            code="FORBIDDEN",
        )

    bought = (
        db.query(OrderItem)
        .filter(OrderItem.orderId == order.id, OrderItem.productId == product_id)
        .first()
    )
    if bought is None:
        raise TRPCError(
            message="That order doesn't include this product, so it can't be reviewed from it.",
            code="FORBIDDEN",
        )

    user = db.query(User).filter(User.id == order.userId).first()
    return order, user


def reviews_can_review(db: Session, product_id: int, order_number: str, email: str) -> dict:
    """Non-destructive eligibility check, so the form can validate before submit."""
    try:
        order, _ = _find_verified_purchase(db, product_id, order_number, email)
    except TRPCError as exc:
        return {"eligible": False, "reason": exc.message}

    existing = (
        db.query(Review)
        .filter(Review.productId == product_id, Review.userId == order.userId)
        .first()
    )
    if existing is not None:
        return {"eligible": False, "reason": "You've already reviewed this product."}

    return {"eligible": True, "reason": None, "orderNumber": order.orderNumber}


def reviews_create(db: Session, product_id: int, data: dict) -> dict:
    """
    Create a review, but only for someone who actually bought the product.

    The review is stored as `pending` and does not appear on the product page
    until an admin approves it in the moderation queue.
    """
    order_number = str(data.get("orderNumber") or "").strip()
    email = str(data.get("email") or "").strip()

    if not order_number:
        raise TRPCError(message="Your order number is required", code="BAD_REQUEST")
    if not _EMAIL_RE.match(email):
        raise TRPCError(message="Enter the email address used on the order", code="BAD_REQUEST")

    try:
        rating = int(data.get("rating") or 0)
    except (TypeError, ValueError):
        raise TRPCError(message="Choose a rating from 1 to 5", code="BAD_REQUEST")
    if not 1 <= rating <= 5:
        raise TRPCError(message="Choose a rating from 1 to 5", code="BAD_REQUEST")

    title = str(data.get("title") or "").strip()[:REVIEW_TITLE_MAX]
    body = str(data.get("body") or data.get("content") or "").strip()
    if len(body) < 10:
        raise TRPCError(message="Please write at least a sentence about the product", code="BAD_REQUEST")
    if len(body) > REVIEW_BODY_MAX:
        raise TRPCError(message="Your review is too long", code="BAD_REQUEST")

    order, user = _find_verified_purchase(db, product_id, order_number, email)

    if user is None:
        raise TRPCError(message="We couldn't match that order to a customer", code="NOT_FOUND")

    already = (
        db.query(Review)
        .filter(Review.productId == product_id, Review.userId == user.id)
        .first()
    )
    if already is not None:
        raise TRPCError(
            message="You've already reviewed this product. Contact us to change your review.",
            code="CONFLICT",
        )

    review = Review(
        productId=product_id,
        userId=user.id,
        rating=rating,
        title=title or None,
        body=body,
        # Proven against a real order — this is not a self-declared flag.
        isVerifiedPurchase=True,
        # Held for moderation; the admin Reviews page decides what goes live.
        status="pending",
        helpful=0,
        createdAt=datetime.utcnow(),
        updatedAt=datetime.utcnow(),
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    return {
        "id": review.id,
        "status": review.status,
        "message": (
            "Thank you! Your review has been submitted and will appear on the "
            "product page once our team has checked it."
        ),
    }
