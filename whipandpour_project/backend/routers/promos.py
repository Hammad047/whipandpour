"""
routers/promos.py — Promo code validation.
Mirrors: promos.validate
"""

from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Session
from database import PromoCode


def _serialize_promo(p: PromoCode) -> dict:
    return {
        "id": p.id,
        "code": p.code,
        "discountType": p.discountType,
        "value": str(p.value),
        "usageLimit": p.usageLimit,
        "usedCount": p.usedCount,
        "expiryDate": p.expiryDate.isoformat() if p.expiryDate else None,
        "isActive": bool(p.isActive),
        "applicableCategory": p.applicableCategory,
        "minOrderAmount": str(p.minOrderAmount) if p.minOrderAmount is not None else "0",
        "firstOrderOnly": bool(p.firstOrderOnly),
        "createdAt": p.createdAt.isoformat() if p.createdAt else None,
        "updatedAt": p.updatedAt.isoformat() if p.updatedAt else None,
    }


def promos_validate(db: Session, code: str) -> Optional[dict]:
    promo = (
        db.query(PromoCode)
        .filter(PromoCode.code == code.upper(), PromoCode.isActive == True)
        .first()
    )

    if not promo:
        return None

    # Check expiry
    if promo.expiryDate and promo.expiryDate < datetime.utcnow():
        return None

    # Check usage limit
    if promo.usageLimit is not None and (promo.usedCount or 0) >= promo.usageLimit:
        return None

    return _serialize_promo(promo)
