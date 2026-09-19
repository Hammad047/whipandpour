"""
routers/products.py — Product query handlers.
Mirrors: products.list, products.featured, products.bestsellers, products.bySlug, products.byId
"""

import json
from typing import Optional, List, Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import Product


def _serialize_product(p: Product) -> dict:
    """Convert a Product ORM row to a JSON-safe dict (parse JSON text fields)."""
    return {
        "id": p.id,
        "name": p.name,
        "slug": p.slug,
        "description": p.description,
        "category": p.category,
        "price": str(p.price),
        "stock": p.stock,
        "images": json.loads(p.images) if isinstance(p.images, str) else p.images,
        "scentNotes": json.loads(p.scentNotes) if isinstance(p.scentNotes, str) else p.scentNotes,
        "burnTime": p.burnTime,
        "waxType": p.waxType,
        "sizeOptions": json.loads(p.sizeOptions) if isinstance(p.sizeOptions, str) else p.sizeOptions,
        "isFeatured": bool(p.isFeatured),
        "isBestseller": bool(p.isBestseller),
        "isLimitedEdition": bool(p.isLimitedEdition),
        "isActive": bool(p.isActive),
        "averageRating": str(p.averageRating),
        "reviewCount": p.reviewCount,
        "viewCount": p.viewCount,
        "createdAt": p.createdAt.isoformat() if p.createdAt else None,
        "updatedAt": p.updatedAt.isoformat() if p.updatedAt else None,
    }


def products_list(
    db: Session,
    category: Optional[str] = None,
    search: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    limit: int = 12,
    offset: int = 0,
    sort_by: Optional[str] = None,
) -> List[dict]:
    # Soft-deleted products stay in the database for order history but must
    # never appear in the storefront.
    query = db.query(Product).filter(Product.isActive == True)  # noqa: E712

    if category and category != "all":
        query = query.filter(Product.category == category)

    if search:
        # Match name, description and category so the navbar search finds a
        # product by what it is as well as by what it is called.
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Product.name.ilike(term),
                Product.description.ilike(term),
                Product.category.ilike(term),
                Product.scentNotes.ilike(term),
            )
        )

    if min_price is not None:
        query = query.filter(Product.price >= min_price)
    if max_price is not None:
        query = query.filter(Product.price <= max_price)

    if sort_by in ("price", "price-asc"):
        query = query.order_by(Product.price.asc())
    elif sort_by == "price-desc":
        query = query.order_by(Product.price.desc())
    elif sort_by == "rating":
        query = query.order_by(Product.averageRating.desc())
    elif sort_by == "name":
        query = query.order_by(Product.name.asc())
    else:  # "newest" and any unknown value
        query = query.order_by(Product.createdAt.desc(), Product.id.desc())

    results = query.offset(offset).limit(limit).all()
    return [_serialize_product(p) for p in results]


def products_categories() -> List[dict]:
    """Category slugs and labels, so the frontend never hardcodes the list."""
    from database import CATEGORIES

    return [{"value": value, "label": label} for value, label in CATEGORIES.items()]


def products_featured(db: Session, limit: int = 12) -> List[dict]:
    # Ordered newest-first so the selection is deterministic and a product the
    # admin has just marked "featured" actually surfaces. Without an ORDER BY,
    # SQLite returned an arbitrary subset once more than `limit` were flagged.
    results = (
        db.query(Product)
        .filter(Product.isFeatured == True, Product.isActive == True)  # noqa: E712
        .order_by(Product.createdAt.desc(), Product.id.desc())
        .limit(limit)
        .all()
    )
    return [_serialize_product(p) for p in results]


def products_bestsellers(db: Session, limit: int = 12) -> List[dict]:
    results = (
        db.query(Product)
        .filter(Product.isBestseller == True, Product.isActive == True)  # noqa: E712
        .order_by(Product.createdAt.desc(), Product.id.desc())
        .limit(limit)
        .all()
    )
    return [_serialize_product(p) for p in results]


def products_by_slug(db: Session, slug: str) -> Optional[dict]:
    p = (
        db.query(Product)
        .filter(Product.slug == slug, Product.isActive == True)  # noqa: E712
        .first()
    )
    return _serialize_product(p) if p else None


def products_by_id(db: Session, product_id: int) -> Optional[dict]:
    # Must exclude soft-deleted products, exactly like products_by_slug: this is
    # a public storefront endpoint and a hidden product must stay hidden.
    p = (
        db.query(Product)
        .filter(Product.id == product_id, Product.isActive == True)  # noqa: E712
        .first()
    )
    return _serialize_product(p) if p else None
