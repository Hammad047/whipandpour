"""
Second audit pass: promo codes, review moderation, analytics and payments —
and whether each admin action actually changes what a shopper sees.
"""

import json
import sys
import urllib.parse
from http.cookiejar import CookieJar
from urllib.request import build_opener, HTTPCookieProcessor, Request

BASE = "http://127.0.0.1:8000"
admin = build_opener(HTTPCookieProcessor(CookieJar()))
guest = build_opener(HTTPCookieProcessor(CookieJar()))
results = []


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


def call(opener, procedure, payload=None, mutation=False):
    if mutation:
        req = Request(f"{BASE}/api/trpc/{procedure}?batch=1",
                      data=json.dumps({"0": {"json": payload}}).encode(),
                      headers={"Content-Type": "application/json"})
    else:
        qs = urllib.parse.quote(json.dumps({"0": payload}))
        req = Request(f"{BASE}/api/trpc/{procedure}?batch=1&input={qs}")
    try:
        with opener.open(req) as resp:
            entry = json.loads(resp.read())[0]
    except Exception as exc:
        body = getattr(exc, "file", None)
        if body is None:
            return None, f"transport error: {exc}"
        entry = json.loads(body.read())[0]
    if "error" in entry:
        return None, entry["error"]["json"]["message"]
    return entry["result"]["data"]["json"], None


def section(t):
    print(f"\n{'=' * 68}\n{t}\n{'=' * 68}")


req = Request(f"{BASE}/api/auth/admin-login",
              data=json.dumps({"email": "admin@whipandpour.com", "password": "WhipPour@123"}).encode(),
              headers={"Content-Type": "application/json"})
with admin.open(req) as r:
    r.read()

# ── Authorization on the new procedures ─────────────────────────────────────
section("8. AUTHORIZATION — NEW PROCEDURES")
new_procs = [
    ("admin.promos.list", None, False),
    ("admin.promos.create", {"code": "X", "discountType": "percent", "value": 5}, True),
    ("admin.promos.update", {"id": 1, "data": {}}, True),
    ("admin.promos.delete", {"id": 1}, True),
    ("admin.reviews.list", None, False),
    ("admin.reviews.updateStatus", {"id": 1, "status": "approved"}, True),
    ("admin.reviews.delete", {"id": 1}, True),
    ("admin.analytics", None, False),
    ("admin.payments.list", None, False),
]
blocked = sum(1 for p, pl, m in new_procs if (call(guest, p, pl, mutation=m)[1] or "").lower().count("login")
              or (call(guest, p, pl, mutation=m)[1] or "").lower().count("permission"))
record(f"all {len(new_procs)} new admin procedures blocked for anonymous users",
       blocked == len(new_procs), f"{blocked}/{len(new_procs)}")

# ── Promo codes ─────────────────────────────────────────────────────────────
section("9. PROMO CODES → CHECKOUT REFLECTION")

promos, err = call(admin, "admin.promos.list")
record("admin.promos.list returns seeded codes", promos is not None and len(promos) >= 3,
       err or f"{len(promos or [])} codes")

created, err = call(admin, "admin.promos.create", {
    "code": "audit25", "discountType": "percent", "value": 25,
    "usageLimit": 100, "minOrderAmount": 1000, "applicableCategory": "all", "isActive": True,
}, mutation=True)
record("admin.promos.create succeeds", created is not None, err or "")
record("code is normalised to uppercase", created and created["code"] == "AUDIT25",
       created["code"] if created else "")

live, err = call(guest, "promos.validate", {"code": "AUDIT25"})
record("new code immediately accepted at checkout", live is not None, err or "")
record("discount value matches what admin entered", live and live["value"] == "25.00",
       live["value"] if live else "")

_, err = call(admin, "admin.promos.create", {"code": "AUDIT25", "discountType": "flat", "value": 5}, mutation=True)
record("duplicate promo code rejected", err is not None, err or "ACCEPTED")
_, err = call(admin, "admin.promos.create", {"code": "BAD", "discountType": "percent", "value": 150}, mutation=True)
record("percentage over 100 rejected", err is not None, err or "ACCEPTED")
_, err = call(admin, "admin.promos.create", {"code": "BAD2", "discountType": "gift", "value": 5}, mutation=True)
record("invalid discount type rejected", err is not None, err or "ACCEPTED")
_, err = call(admin, "admin.promos.create", {"code": "a b!", "discountType": "percent", "value": 5}, mutation=True)
record("malformed code rejected", err is not None, err or "ACCEPTED")

# Deactivate → the storefront must stop honouring it.
call(admin, "admin.promos.update", {"id": created["id"], "data": {
    "code": "AUDIT25", "discountType": "percent", "value": 25,
    "usageLimit": 100, "minOrderAmount": 1000, "applicableCategory": "all", "isActive": False,
}}, mutation=True)

order_probe = {
    "fullName": "Promo Probe", "email": "promo.probe@example.com", "phone": "03001234567",
    "address": "1 Promo Street, Block A", "city": "Lahore", "province": "Punjab",
    "postalCode": "54000", "paymentMethod": "cod",
    "items": [{"productId": 3, "quantity": 1, "size": "Single"}],
    "promoCode": "AUDIT25",
}
_, err = call(guest, "orders.create", order_probe, mutation=True)
record("deactivated code is refused at order creation", err is not None, err or "STILL ACCEPTED")

# Reactivate and confirm an order actually gets the discount.
call(admin, "admin.promos.update", {"id": created["id"], "data": {
    "code": "AUDIT25", "discountType": "percent", "value": 25,
    "usageLimit": 100, "minOrderAmount": 1000, "applicableCategory": "all", "isActive": True,
}}, mutation=True)
placed, err = call(guest, "orders.create", order_probe, mutation=True)
record("reactivated code is honoured", placed is not None, err or "")
if placed:
    o = placed["order"]
    expected = round(float(o["subtotal"]) * 0.25, 2)
    record("discount applied server-side at 25%",
           abs(float(o["discountAmount"]) - expected) < 0.01,
           f"{o['discountAmount']} (expected {expected})")
    record("order records the promo code", o["promoCode"] == "AUDIT25", str(o["promoCode"]))

deleted, err = call(admin, "admin.promos.delete", {"id": created["id"]}, mutation=True)
record("admin.promos.delete succeeds", deleted is not None, err or deleted["message"])
gone, err = call(guest, "promos.validate", {"code": "AUDIT25"})
record("deleted code no longer validates", gone is None, "STILL VALID" if gone else "returns null")

# ── Review moderation ───────────────────────────────────────────────────────
section("10. REVIEW MODERATION → PRODUCT PAGE REFLECTION")

reviews, err = call(admin, "admin.reviews.list")
record("admin.reviews.list succeeds", reviews is not None, err or f"{len(reviews or [])} reviews")
target = reviews[0] if reviews else None

if target:
    pid = target["productId"]
    record("review joined to its product name", bool(target["productName"]), target["productName"])
    record("review joined to its customer name", bool(target["customerName"]), target["customerName"])

    before, _ = call(guest, "reviews.byProduct", {"productId": pid})
    product_before, _ = call(guest, "products.byId", {"id": pid})
    record("review is visible on the product page before moderation",
           any(r["id"] == target["id"] for r in before))

    _, err = call(admin, "admin.reviews.updateStatus", {"id": target["id"], "status": "rejected"}, mutation=True)
    record("admin can reject a review", err is None, err or "")

    after, _ = call(guest, "reviews.byProduct", {"productId": pid})
    record("rejected review disappears from the product page",
           not any(r["id"] == target["id"] for r in after))

    product_after, _ = call(guest, "products.byId", {"id": pid})
    record("rejecting a review decrements the product's review count by exactly 1",
           product_after["reviewCount"] == product_before["reviewCount"] - 1,
           f"{product_before['reviewCount']} → {product_after['reviewCount']}")
    record("imported live-store review history is preserved, not wiped",
           product_after["reviewCount"] > 100,
           f"count still {product_after['reviewCount']}")

    _, err = call(admin, "admin.reviews.updateStatus", {"id": target["id"], "status": "approved"}, mutation=True)
    restored, _ = call(guest, "reviews.byProduct", {"productId": pid})
    record("approving restores it to the product page",
           any(r["id"] == target["id"] for r in restored))
    product_restored, _ = call(guest, "products.byId", {"id": pid})
    record("reviewCount restored", product_restored["reviewCount"] == product_before["reviewCount"],
           str(product_restored["reviewCount"]))
    record("averageRating restored",
           product_restored["averageRating"] == product_before["averageRating"],
           f"{product_before['averageRating']} → {product_restored['averageRating']}")

    _, err = call(admin, "admin.reviews.updateStatus", {"id": target["id"], "status": "banana"}, mutation=True)
    record("invalid review status rejected", err is not None, err or "ACCEPTED")

# ── Analytics ───────────────────────────────────────────────────────────────
section("11. ANALYTICS — DERIVED FROM REAL ORDERS")

analytics, err = call(admin, "admin.analytics")
record("admin.analytics succeeds", analytics is not None, err or "")
orders, _ = call(admin, "admin.orders.list")

if analytics and orders is not None:
    record("totalOrders matches the orders table",
           analytics["totalOrders"] == len(orders), f"{analytics['totalOrders']} vs {len(orders)}")
    expected_revenue = round(sum(float(o["total"]) for o in orders), 2)
    record("totalRevenue matches the sum of order totals",
           abs(float(analytics["totalRevenue"]) - expected_revenue) < 0.01,
           f"{analytics['totalRevenue']} vs {expected_revenue}")
    record("confirmedRevenue stays 0 with no gateway-confirmed payment",
           float(analytics["confirmedRevenue"]) == 0.0, analytics["confirmedRevenue"])
    record("ordersByStatus sums to totalOrders",
           sum(analytics["ordersByStatus"].values()) == analytics["totalOrders"])
    record("unitsSold is positive once orders exist",
           analytics["unitsSold"] > 0, str(analytics["unitsSold"]))
    record("topProducts derived from order items", len(analytics["topProducts"]) > 0,
           f"{len(analytics['topProducts'])} products")
    record("time series buckets present",
           all(k in analytics for k in ("daily", "weekly", "monthly")))

# ── Payments ────────────────────────────────────────────────────────────────
section("12. PAYMENTS — DERIVED FROM REAL ORDERS")

payments, err = call(admin, "admin.payments.list")
record("admin.payments.list succeeds", payments is not None, err or "")

if payments and orders is not None:
    record("one payment record per order",
           len(payments["records"]) == len(orders), f"{len(payments['records'])} vs {len(orders)}")
    record("no payment shown as confirmed without a gateway",
           float(payments["totals"]["confirmed"]) == 0.0, payments["totals"]["confirmed"])
    record("pending total equals the value of all orders",
           abs(float(payments["totals"]["pending"]) - float(payments["totals"]["all"])) < 0.01,
           f"{payments['totals']['pending']} vs {payments['totals']['all']}")
    wallet = [r for r in payments["records"] if r["method"] in ("easypaisa", "jazzcash")]
    record("wallet payments flagged as needing manual confirmation",
           all(r["requiresManualConfirmation"] for r in wallet), f"{len(wallet)} wallet payment(s)")
    record("every record carries the real order number",
           all(r["orderNumber"] for r in payments["records"]))
    record("byMethod breakdown present", len(payments["byMethod"]) > 0)

section("SUMMARY")
passed = sum(1 for _, ok, _ in results if ok)
failed = [r for r in results if not r[1]]
print(f"  {passed}/{len(results)} checks passed")
for name, _, detail in failed:
    print(f"    FAILED: {name} — {detail}")
sys.exit(1 if failed else 0)
