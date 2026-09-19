"""
routers/wishlist.py — Wishlist handlers.
Mirrors: wishlist.list, wishlist.add, wishlist.remove
"""

import json
from typing import List
from sqlalchemy.orm import Session
from database import Wishlist, Product
from routers.products import _serialize_product


def _serialize_wishlist_item(w: Wishlist) -> dict:
    return {
        "id": w.id,
        "userId": w.userId,
        "productId": w.productId,
        "createdAt": w.createdAt.isoformat() if w.createdAt else None,
    }


def wishlist_list(db: Session, user_id: int) -> List[dict]:
    """Return wishlist items with full product details embedded."""
    items = db.query(Wishlist).filter(Wishlist.userId == user_id).all()
    result = []
    for item in items:
        row = _serialize_wishlist_item(item)
        # Attach product data for convenience
        product = db.query(Product).filter(Product.id == item.productId).first()
        if product:
            row["product"] = _serialize_product(product)
        result.append(row)
    return result


def wishlist_add(db: Session, user_id: int, product_id: int) -> dict:
    existing = (
        db.query(Wishlist)
        .filter(Wishlist.userId == user_id, Wishlist.productId == product_id)
        .first()
    )
    if existing:
        return {"success": True}

    item = Wishlist(userId=user_id, productId=product_id)
    db.add(item)
    db.commit()
    return {"success": True}


def wishlist_remove(db: Session, user_id: int, product_id: int) -> dict:
    db.query(Wishlist).filter(
        Wishlist.userId == user_id, Wishlist.productId == product_id
    ).delete()
    db.commit()
    return {"success": True}
