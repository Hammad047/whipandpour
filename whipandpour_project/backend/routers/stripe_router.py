"""
routers/stripe_router.py — Stripe checkout session creation and retrieval.
Mirrors: stripe.createCheckoutSession, stripe.getSession
"""

import os
from typing import Optional, List
from sqlalchemy.orm import Session
from auth import TRPCError

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")


def stripe_create_checkout_session(
    db: Session,
    user,
    cart_items: List[dict],
    subtotal: float,
    shipping_cost: float,
    discount_amount: float,
    promo_code: Optional[str],
    shipping_address: str,
    shipping_city: str,
    shipping_state: Optional[str],
    shipping_zip_code: str,
    shipping_country: str,
    customer_email: str,
    customer_phone: Optional[str],
    origin: str,
) -> dict:
    try:
        import stripe as stripe_lib
        stripe_lib.api_key = STRIPE_SECRET_KEY or "sk_test_placeholder"
    except ImportError:
        raise TRPCError(
            message="stripe package not installed. Run: pip install stripe",
            code="INTERNAL_SERVER_ERROR",
        )

    total = subtotal + shipping_cost - discount_amount

    try:
        session = stripe_lib.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": "usd",
                        "product_data": {
                            "name": item["productName"],
                            "metadata": {"size": item.get("size", "")},
                        },
                        "unit_amount": int(round(item["price"] * 100)),
                    },
                    "quantity": item["quantity"],
                }
                for item in cart_items
            ],
            mode="payment",
            success_url=f"{origin}/checkout?success=true",
            cancel_url=f"{origin}/checkout?canceled=true",
            customer_email=customer_email,
            metadata={
                "userId": str(user.id),
                "customerEmail": customer_email,
                "customerName": user.name or "Customer",
                "shippingAddress": shipping_address,
                "shippingCity": shipping_city,
                "shippingState": shipping_state or "",
                "shippingZipCode": shipping_zip_code,
                "shippingCountry": shipping_country,
                "customerPhone": customer_phone or "",
                "promoCode": promo_code or "",
                "subtotal": str(subtotal),
                "shippingCost": str(shipping_cost),
                "discountAmount": str(discount_amount),
                "total": str(total),
                "cartItems": __import__("json").dumps(cart_items),
            },
        )
        return {"sessionId": session.id, "url": session.url}
    except Exception as e:
        raise TRPCError(
            message=f"Failed to create checkout session: {str(e)}",
            code="INTERNAL_SERVER_ERROR",
        )


def stripe_get_session(session_id: str) -> dict:
    try:
        import stripe as stripe_lib
        stripe_lib.api_key = STRIPE_SECRET_KEY or "sk_test_placeholder"
    except ImportError:
        raise TRPCError(
            message="stripe package not installed.",
            code="INTERNAL_SERVER_ERROR",
        )

    try:
        session = stripe_lib.checkout.Session.retrieve(session_id)
        return dict(session)
    except Exception as e:
        raise TRPCError(
            message=f"Failed to retrieve session: {str(e)}",
            code="INTERNAL_SERVER_ERROR",
        )
