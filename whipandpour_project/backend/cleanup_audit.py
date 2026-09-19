"""
Reset the database to its seeded state after running the audit scripts.

The audits are deliberately not idempotent — they create products, orders,
customers, promo codes and reviews so they can verify the real write paths.
Run this between audit runs, and before handing the store back to real use.

    python3 cleanup_audit.py

Only removes rows the audits create. Seeded products (ids 1-7), the four
imported reviews, the three seeded promo codes and the admin account are kept.
"""

import sqlite3
import sys

DB = "whipandpour.db"

SEEDED_PRODUCT_MAX_ID = 7
SEEDED_REVIEW_MAX_ID = 4
SEEDED_PROMO_CODES = ("WELCOME10", "CHEESECAKE20", "FLAT500")


def main() -> int:
    conn = sqlite3.connect(DB)
    cur = conn.cursor()

    before = {
        "products": cur.execute("SELECT COUNT(*) FROM products").fetchone()[0],
        "orders": cur.execute("SELECT COUNT(*) FROM orders").fetchone()[0],
        "reviews": cur.execute("SELECT COUNT(*) FROM reviews").fetchone()[0],
        "users": cur.execute("SELECT COUNT(*) FROM users").fetchone()[0],
        "promos": cur.execute("SELECT COUNT(*) FROM promoCodes").fetchone()[0],
        "stock": cur.execute("SELECT SUM(stock) FROM products").fetchone()[0] or 0,
    }

    # Orders and their line items — every order in the audits is synthetic.
    cur.execute("DELETE FROM orderItems")
    cur.execute("DELETE FROM orders")

    # Products created by the audits.
    cur.execute("DELETE FROM products WHERE id > ?", (SEEDED_PRODUCT_MAX_ID,))

    # Reviews submitted during the audits; restore the seeded four to approved.
    cur.execute("DELETE FROM reviews WHERE id > ?", (SEEDED_REVIEW_MAX_ID,))
    cur.execute("UPDATE reviews SET status = 'approved'")

    # Shoppers created by guest checkout / demo login. Reviewer accounts
    # (loginMethod='imported_review') are kept: deleting them would orphan the
    # seeded reviews, and SQLite reuses freed ids.
    cur.execute("DELETE FROM users WHERE loginMethod IN ('guest_checkout', 'demo')")

    # Promo codes the audits create.
    placeholders = ",".join("?" * len(SEEDED_PROMO_CODES))
    cur.execute(f"DELETE FROM promoCodes WHERE code NOT IN ({placeholders})", SEEDED_PROMO_CODES)

    # Restore each product's rating to imported history + approved local reviews.
    cur.execute(
        """
        UPDATE products SET
          reviewCount = importedReviewCount
            + (SELECT COUNT(*) FROM reviews
               WHERE productId = products.id AND status = 'approved'),
          averageRating = CASE
            WHEN importedReviewCount
                 + (SELECT COUNT(*) FROM reviews
                    WHERE productId = products.id AND status = 'approved') = 0
            THEN 0
            ELSE ROUND(
              (importedRatingSum
               + COALESCE((SELECT SUM(rating) FROM reviews
                           WHERE productId = products.id AND status = 'approved'), 0))
              / (importedReviewCount
                 + (SELECT COUNT(*) FROM reviews
                    WHERE productId = products.id AND status = 'approved')), 2)
          END
        """
    )

    # Restore stock. Deleting an order does not give back the units it consumed,
    # and the quantities are gone with the order rows, so read the authoritative
    # levels straight from the seed definition.
    try:
        from database import SEED_PRODUCTS

        for seed in SEED_PRODUCTS:
            cur.execute(
                "UPDATE products SET stock = ? WHERE id = ? AND stock != ?",
                (seed["stock"], seed["id"], seed["stock"]),
            )
    except Exception as exc:  # pragma: no cover - seed import is best effort
        print(f"  WARNING: could not restore seeded stock levels ({exc})")

    conn.commit()

    after = {
        "products": cur.execute("SELECT COUNT(*) FROM products").fetchone()[0],
        "orders": cur.execute("SELECT COUNT(*) FROM orders").fetchone()[0],
        "reviews": cur.execute("SELECT COUNT(*) FROM reviews").fetchone()[0],
        "users": cur.execute("SELECT COUNT(*) FROM users").fetchone()[0],
        "promos": cur.execute("SELECT COUNT(*) FROM promoCodes").fetchone()[0],
        "stock": cur.execute("SELECT SUM(stock) FROM products").fetchone()[0] or 0,
    }

    print("Reset to seeded state:")
    for key in before:
        print(f"  {key:9} {before[key]:>4} → {after[key]}")

    orphans = cur.execute(
        "SELECT COUNT(*) FROM reviews r LEFT JOIN users u ON u.id = r.userId WHERE u.id IS NULL"
    ).fetchone()[0]
    if orphans:
        print(f"  WARNING: {orphans} review(s) reference a missing user")

    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
