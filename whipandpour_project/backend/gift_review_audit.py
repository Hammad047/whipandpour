"""Audit pass 3: gifting options and purchase-verified reviews."""

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


with admin.open(Request(f"{BASE}/api/auth/admin-login",
                        data=json.dumps({"email": "admin@whipandpour.com",
                                         "password": "WhipPour@123"}).encode(),
                        headers={"Content-Type": "application/json"})) as r:
    r.read()

# ── Gifting ─────────────────────────────────────────────────────────────────
section("13. GIFTING → ORDER & ADMIN REFLECTION")

opts, err = call(guest, "gifting.options")
record("gifting.options is public", opts is not None, err or "")
fee = float(opts["packagingFee"])
record("packaging fee published", fee > 0, opts["packagingFee"])
record("what's included is listed", len(opts["includes"]) >= 3, f"{len(opts['includes'])} items")

base_order = {
    "fullName": "Gift Giver", "email": "gift.giver@example.com", "phone": "03001234567",
    "address": "9 Gift Lane, Block D", "city": "Lahore", "province": "Punjab",
    "postalCode": "54000", "paymentMethod": "cod",
    "items": [{"productId": 3, "quantity": 1, "size": "Single"}],
}

plain, err = call(guest, "orders.create", base_order, mutation=True)
record("order without gifting succeeds", plain is not None, err or "")
plain_total = float(plain["order"]["total"]) if plain else 0

gift_order = dict(base_order)
gift_order.update({
    "giftPackaging": True,
    "giftRecipientName": "Fatima",
    "giftSenderName": "Ayesha",
    "giftCardMessage": "Happy birthday! Hope this makes your home smell lovely.",
})
gifted, err = call(guest, "orders.create", gift_order, mutation=True)
record("order with gifting succeeds", gifted is not None, err or "")

if gifted:
    o = gifted["order"]
    record("gift packaging recorded on the order", o["giftPackaging"] is True)
    record("gift fee charged and stored", abs(float(o["giftPackagingFee"]) - fee) < 0.01,
           o["giftPackagingFee"])
    record("gift fee added to the total",
           abs(float(o["total"]) - (plain_total + fee)) < 0.01,
           f"{o['total']} vs {plain_total} + {fee}")
    record("card message stored", o["giftCardMessage"].startswith("Happy birthday"))
    record("recipient name stored", o["giftRecipientName"] == "Fatima")
    record("sender name stored", o["giftSenderName"] == "Ayesha")

# A card without packaging makes no sense — must be rejected.
bad = dict(base_order)
bad.update({"giftPackaging": False, "giftCardMessage": "Sneaky free card"})
_, err = call(guest, "orders.create", bad, mutation=True)
record("card message without packaging is rejected", err is not None, err or "ACCEPTED")

# Over-long message
long_msg = dict(gift_order)
long_msg["giftCardMessage"] = "x" * 5000
_, err = call(guest, "orders.create", long_msg, mutation=True)
record("over-long card message rejected", err is not None, err or "ACCEPTED")

orders, _ = call(admin, "admin.orders.list")
admin_gift = next((o for o in orders if o["orderNumber"] == gifted["order"]["orderNumber"]), None)
record("gift order visible to admin", admin_gift is not None)
if admin_gift:
    record("admin sees the gift flag", admin_gift["giftPackaging"] is True)
    record("admin sees the card message to write",
           admin_gift["giftCardMessage"].startswith("Happy birthday"))
    record("admin sees recipient and sender",
           admin_gift["giftRecipientName"] == "Fatima" and admin_gift["giftSenderName"] == "Ayesha")

stats, _ = call(admin, "admin.stats")
record("dashboard counts gift orders awaiting packing",
       stats["giftOrdersToPack"] >= 1, str(stats["giftOrdersToPack"]))

# ── Purchase-verified reviews ───────────────────────────────────────────────
section("14. REVIEWS REQUIRE A REAL PURCHASE")

order_number = gifted["order"]["orderNumber"]
buyer_email = "gift.giver@example.com"
PRODUCT_BOUGHT = 3
PRODUCT_NOT_BOUGHT = 5

review = {
    "productId": PRODUCT_BOUGHT, "rating": 5, "title": "Lovely",
    "body": "Smells exactly like a bakery cupcake and burned evenly for hours.",
    "orderNumber": order_number, "email": buyer_email,
}

_, err = call(guest, "reviews.create", {**review, "orderNumber": "WP-0000-000000"}, mutation=True)
record("unknown order number rejected", err is not None, err or "ACCEPTED")

_, err = call(guest, "reviews.create", {**review, "email": "someone.else@example.com"}, mutation=True)
record("mismatched email rejected", err is not None, err or "ACCEPTED")

_, err = call(guest, "reviews.create", {**review, "productId": PRODUCT_NOT_BOUGHT}, mutation=True)
record("reviewing a product not in that order rejected", err is not None, err or "ACCEPTED")

_, err = call(guest, "reviews.create", {**review, "rating": 9}, mutation=True)
record("out-of-range rating rejected", err is not None, err or "ACCEPTED")

_, err = call(guest, "reviews.create", {**review, "body": "ok"}, mutation=True)
record("too-short review rejected", err is not None, err or "ACCEPTED")

_, err = call(guest, "reviews.create", {**review, "orderNumber": ""}, mutation=True)
record("missing order number rejected", err is not None, err or "ACCEPTED")

check, err = call(guest, "reviews.canReview", {
    "productId": PRODUCT_BOUGHT, "orderNumber": order_number, "email": buyer_email})
record("eligibility check passes for a real buyer", check and check["eligible"] is True,
       (check or {}).get("reason") or "")

created, err = call(guest, "reviews.create", review, mutation=True)
record("verified buyer can submit a review", created is not None, err or "")

if created:
    record("review is held for moderation, not published instantly",
           created["status"] == "pending", created["status"])

    public, _ = call(guest, "reviews.byProduct", {"productId": PRODUCT_BOUGHT})
    record("pending review is NOT on the product page",
           not any(r["id"] == created["id"] for r in public))

    admin_reviews, _ = call(admin, "admin.reviews.list")
    mine = next((r for r in admin_reviews if r["id"] == created["id"]), None)
    record("pending review appears in the admin queue", mine is not None)
    record("marked as a verified purchase automatically",
           mine and mine["isVerifiedPurchase"] is True)

    _, err = call(guest, "reviews.create", review, mutation=True)
    record("duplicate review from the same buyer rejected", err is not None, err or "ACCEPTED")

    call(admin, "admin.reviews.updateStatus",
         {"id": created["id"], "status": "approved"}, mutation=True)
    public, _ = call(guest, "reviews.byProduct", {"productId": PRODUCT_BOUGHT})
    record("approved review appears on the product page",
           any(r["id"] == created["id"] for r in public))
    shown = next(r for r in public if r["id"] == created["id"])
    record("shown with the reviewer's name", bool(shown["userName"]), shown["userName"])
    record("shown as a verified purchase", shown["isVerifiedPurchase"] is True)

section("SUMMARY")
passed = sum(1 for _, ok, _ in results if ok)
failed = [r for r in results if not r[1]]
print(f"  {passed}/{len(results)} checks passed")
for name, _, detail in failed:
    print(f"    FAILED: {name} — {detail}")
sys.exit(1 if failed else 0)
