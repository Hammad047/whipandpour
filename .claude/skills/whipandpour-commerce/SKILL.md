---
name: whipandpour-commerce
description: Product, cart, checkout, order and payment rules for Whip&Pour — category enum, product lifecycle, order creation, and the hard rule that payment status is never faked. Load when touching products, inventory, checkout, orders, or payment code.
---

# Whip & Pour — Commerce Rules

## Product categories

`Product.category` is a SQLAlchemy `SAEnum`. Current values:

`dessert-jar`, `cupcake`, `iced-latte`, `cheesecake`, `wax-melts`

Changing this list requires, in order:
1. `SAEnum(...)` in `backend/database.py`
2. Existing rows migrated (SQLite stores the string; invalid values only fail on write)
3. `PromoCode.applicableCategory` enum
4. `src/types/index.ts` union type
5. Category labels/badges: `ProductCard`, `ProductDetail`, `Navbar` dropdown, `ShopFilters`, admin product form

Keep the machine value (slug) separate from the display label. Use one shared
`CATEGORIES` constant rather than repeating literals.

## Product lifecycle

```
admin.products.create  →  products table (SQLite)
                       →  utils.products.list.invalidate()
                       →  products.list / products.bySlug  →  Shop / ProductDetail
                       →  ProductCard "Add to cart" → CartContext (localStorage)
                       →  orders.create → orders + orderItems rows
```

Slugs must be unique — the column has a UNIQUE constraint. Generate from the
name, and on collision append a counter. A duplicate slug raises an
`IntegrityError` that must be caught and returned as `CONFLICT`.

Deleting a product must not orphan `orderItems`. Prefer a soft delete or block
deletion when order items reference the product.

## Orders

- `orderNumber` is generated **server-side** and is UNIQUE. Never generate an
  order number in the frontend (`Math.random()` in a component is not an ID).
- `create_order()` in `routers/orders.py` inserts the order and its items in one
  transaction via `db.flush()` then `db.commit()`.
- Admin and customer views must show the same `orderNumber`.

## Payment — the hard rule

**Never set `paymentStatus = 'completed'` without confirmation from a real
payment gateway.**

Keep these four concerns separate:

| Concern | Where |
|---|---|
| Method selection | Checkout UI → `paymentMethod` column |
| Processing | Gateway adapter (Stripe today; Easypaisa/JazzCash not implemented) |
| Order creation | `orders.create` — always writes `paymentStatus='pending'` |
| Payment status | Only a verified webhook/callback may advance it |

Cash on delivery legitimately stays `pending` until delivery.

Do not collect raw card numbers, CVCs, or wallet PINs in this application.
Card data belongs in a gateway-hosted form (Stripe Checkout). Capturing a PAN
or an Easypaisa/JazzCash PIN in a React input is a PCI and account-security
problem, not a UI detail.

## Gifting

Gift packaging is a paid add-on stored on the order
(`giftPackaging`, `giftPackagingFee`, `giftCardMessage`, `giftRecipientName`,
`giftSenderName`). The fee lives in `GIFT_PACKAGING_FEE` in
`backend/routers/orders.py` and is published through the public
`gifting.options` procedure — never hardcode the price in a component, or the
homepage and checkout will drift from what is actually charged. The fee is
snapshotted onto the order so past orders keep the price they were charged.

## Reviews

A review may only be written by someone who bought the product. With guest
checkout there is no login to rely on, so the proof is **order number + the
email on the order**. `reviews.create` verifies all three of: order exists,
email matches, order contains the product. Reviews are stored `pending` and only
reach the product page once approved in Admin → Reviews.

Product rating = imported aggregate (`importedReviewCount` / `importedRatingSum`,
carried over from the live store) **plus** approved local reviews. Recalculating
from local rows alone would wipe the imported history. `recalculate_product_rating()`
must be called after any moderation change, and needs an explicit `db.flush()`
first because `SessionLocal` sets `autoflush=False`.

## Inventory

`stock` is authoritative on the product row. Restock and order placement both
change it, so adjust it **on the backend** in the same transaction as the order
— a frontend-computed stock value will drift.
