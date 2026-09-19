"""
routers/cart.py — Cart handlers.
Mirrors: cart.get, cart.add, cart.update, cart.clear
"""

import json
from typing import Optional, List
from sqlalchemy.orm import Session
from database import Cart
from auth import TRPCError


def _parse_items(items_raw) -> List[dict]:
    if isinstance(items_raw, str):
        try:
            return json.loads(items_raw)
        except Exception:
            return []
    if isinstance(items_raw, list):
        return items_raw
    return []


def _serialize_cart(cart: Cart) -> dict:
    return {
        "id": cart.id,
        "userId": cart.userId,
        "items": _parse_items(cart.items),
        "createdAt": cart.createdAt.isoformat() if cart.createdAt else None,
        "updatedAt": cart.updatedAt.isoformat() if cart.updatedAt else None,
    }


def cart_get(db: Session, user_id: int) -> Optional[dict]:
    cart = db.query(Cart).filter(Cart.userId == user_id).first()
    return _serialize_cart(cart) if cart else {"id": None, "userId": user_id, "items": []}


def cart_add(db: Session, user_id: int, product_id: int, quantity: int, size: str) -> dict:
    cart = db.query(Cart).filter(Cart.userId == user_id).first()

    if not cart:
        new_items = json.dumps([{"productId": product_id, "quantity": quantity, "size": size}])
        cart = Cart(userId=user_id, items=new_items)
        db.add(cart)
    else:
        items = _parse_items(cart.items)
        existing = next(
            (i for i in items if i["productId"] == product_id and i["size"] == size), None
        )
        if existing:
            existing["quantity"] += quantity
        else:
            items.append({"productId": product_id, "quantity": quantity, "size": size})
        cart.items = json.dumps(items)

    db.commit()
    return {"success": True}


def cart_update(db: Session, user_id: int, product_id: int, quantity: int, size: str) -> dict:
    cart = db.query(Cart).filter(Cart.userId == user_id).first()
    if not cart:
        raise TRPCError(message="Cart not found", code="NOT_FOUND")

    items = _parse_items(cart.items)
    idx = next(
        (i for i, item in enumerate(items)
         if item["productId"] == product_id and item["size"] == size),
        None,
    )

    if idx is not None:
        if quantity == 0:
            items.pop(idx)
        else:
            items[idx]["quantity"] = quantity

    cart.items = json.dumps(items)
    db.commit()
    return {"success": True}


def cart_clear(db: Session, user_id: int) -> dict:
    cart = db.query(Cart).filter(Cart.userId == user_id).first()
    if cart:
        cart.items = json.dumps([])
        db.commit()
    return {"success": True}
