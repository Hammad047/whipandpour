"""
Admin panel audit.

Exercises every admin.* procedure and checks that each write is reflected on the
public, customer-facing API. Nothing here trusts the admin response alone: after
every mutation the storefront endpoints are re-queried as an anonymous visitor.
"""

import json
import sys
import urllib.parse
from http.cookiejar import CookieJar
from urllib.request import build_opener, HTTPCookieProcessor, Request

BASE = "http://127.0.0.1:8000"

admin = build_opener(HTTPCookieProcessor(CookieJar()))   # authenticated admin
guest = build_opener(HTTPCookieProcessor(CookieJar()))   # anonymous shopper

results = []


def record(area, name, ok, detail=""):
    results.append((area, name, ok, detail))
    mark = "PASS" if ok else "FAIL"
    print(f"  [{mark}] {name}" + (f" — {detail}" if detail else ""))


def call(opener, procedure, payload=None, mutation=False):
    """Invoke a tRPC procedure and return (data, error_message)."""
    if mutation:
        url = f"{BASE}/api/trpc/{procedure}?batch=1"
        body = json.dumps({"0": {"json": payload}}).encode()
        req = Request(url, data=body, headers={"Content-Type": "application/json"})
    else:
        qs = urllib.parse.quote(json.dumps({"0": payload}))
        req = Request(f"{BASE}/api/trpc/{procedure}?batch=1&input={qs}")

    try:
        with opener.open(req) as resp:
            entry = json.loads(resp.read())[0]
    except Exception as exc:  # HTTP 4xx still carries a tRPC envelope
        body = getattr(exc, "file", None)
        if body is None:
            return None, f"transport error: {exc}"
        entry = json.loads(body.read())[0]

    if "error" in entry:
        return None, entry["error"]["json"]["message"]
    return entry["result"]["data"]["json"], None


def storefront(procedure, payload=None):
    """Query as an anonymous visitor — the reflection check."""
    return call(guest, procedure, payload)


def section(title):
    print(f"\n{'=' * 68}\n{title}\n{'=' * 68}")


# ── 0. Authentication and authorization boundary ────────────────────────────
section("0. AUTHENTICATION & AUTHORIZATION")

req = Request(
    f"{BASE}/api/auth/admin-login",
    data=json.dumps({"email": "admin@whipandpour.com", "password": "WhipPour@123"}).encode(),
    headers={"Content-Type": "application/json"},
)
with admin.open(req) as resp:
    login = json.loads(resp.read())
record("auth", "admin login with correct credentials", login.get("success") is True,
       f"role={login.get('user', {}).get('role')}")

ADMIN_PROCEDURES = [
    ("admin.stats", None, False),
    ("admin.products.list", None, False),
    ("admin.customers.list", None, False),
    ("admin.orders.list", None, False),
    ("admin.products.create", {"name": "x", "description": "y", "category": "cupcake",
                               "price": "1", "stock": 1}, True),
    ("admin.products.update", {"id": 1, "data": {}}, True),
    ("admin.products.delete", {"id": 1}, True),
    ("admin.inventory.restock", {"id": 1, "amount": 1}, True),
    ("admin.inventory.setStock", {"id": 1, "stock": 1}, True),
    ("admin.orders.updateStatus", {"id": 1, "status": "shipped"}, True),
]

blocked = 0
for proc, payload, is_mut in ADMIN_PROCEDURES:
    _, err = call(guest, proc, payload, mutation=is_mut)
    if err and ("login" in err.lower() or "permission" in err.lower()):
        blocked += 1
    else:
        record("auth", f"{proc} blocked for anonymous", False, f"got: {err}")
record("auth", f"all {len(ADMIN_PROCEDURES)} admin procedures blocked for anonymous users",
       blocked == len(ADMIN_PROCEDURES), f"{blocked}/{len(ADMIN_PROCEDURES)} rejected")

# A logged-in but non-admin customer must also be refused.
req = Request(
    f"{BASE}/api/auth/demo-login",
    data=json.dumps({"name": "Regular Shopper", "email": "shopper.audit@example.com"}).encode(),
    headers={"Content-Type": "application/json"},
)
with guest.open(req) as resp:
    resp.read()
_, err = call(guest, "admin.stats")
record("auth", "admin.stats refused for authenticated non-admin",
       err is not None and "permission" in err.lower(), err or "NOT BLOCKED")

# Fresh anonymous opener for the reflection checks below.
guest = build_opener(HTTPCookieProcessor(CookieJar()))


# ── 1. CREATE → storefront ──────────────────────────────────────────────────
section("1. PRODUCT CREATE → STOREFRONT REFLECTION")

new_product = {
    "name": "Audit Pistachio Kunafa Jar",
    "description": "Created by the admin audit to verify create/read/update/delete.",
    "category": "dessert-jar",
    "price": "3600",
    "stock": 12,
    "images": ["/images/products/photo-1546039907-7fa05f864c02.jpg"],
    "scentNotes": ["Pistachio", "Orange Blossom"],
    "burnTime": "45 hours",
    "waxType": "100% Soy",
    "sizeOptions": [{"size": "Medium", "ml": 300}],
    "isFeatured": True,
    "isBestseller": True,
}

created, err = call(admin, "admin.products.create", new_product, mutation=True)
record("create", "admin.products.create succeeds", created is not None, err or f"id={created['id']}")

if not created:
    print("\nCannot continue without a created product.")
    sys.exit(1)

pid, slug = created["id"], created["slug"]

listed, _ = storefront("products.list", {"limit": 200})
record("create", "appears in storefront products.list",
       any(p["id"] == pid for p in listed))

by_slug, _ = storefront("products.bySlug", {"slug": slug})
record("create", "resolvable by slug on product page", by_slug is not None and by_slug["id"] == pid)

by_id, _ = storefront("products.byId", {"id": pid})
record("create", "resolvable by id", by_id is not None and by_id["id"] == pid)

in_cat, _ = storefront("products.list", {"limit": 200, "category": "dessert-jar"})
record("create", "appears under its category filter", any(p["id"] == pid for p in in_cat))

featured, _ = storefront("products.featured")
record("create", "isFeatured=true → appears in products.featured",
       any(p["id"] == pid for p in featured))

best, _ = storefront("products.bestsellers")
record("create", "isBestseller=true → appears in products.bestsellers",
       any(p["id"] == pid for p in best))

found, _ = storefront("products.list", {"limit": 200, "search": "Kunafa"})
record("create", "findable via storefront search", any(p["id"] == pid for p in found))

priced, _ = storefront("products.list", {"limit": 200, "minPrice": 3500, "maxPrice": 3700})
record("create", "respects storefront price filter", any(p["id"] == pid for p in priced))

record("create", "price stored exactly", by_slug["price"] == "3600.00", by_slug["price"])
record("create", "images stored", by_slug["images"] == new_product["images"])
record("create", "scent notes stored", by_slug["scentNotes"] == new_product["scentNotes"])
record("create", "size options stored", by_slug["sizeOptions"] == new_product["sizeOptions"])


# ── 2. UPDATE → storefront ──────────────────────────────────────────────────
section("2. PRODUCT UPDATE → STOREFRONT REFLECTION")

updated_payload = dict(new_product)
updated_payload.update({
    "name": "Audit Pistachio Kunafa Jar (Revised)",
    "price": "3950",
    "stock": 40,
    "category": "cheesecake",       # category move
    "isFeatured": False,
    "isBestseller": False,
    "scentNotes": ["Pistachio", "Rosewater"],
})
updated, err = call(admin, "admin.products.update", {"id": pid, "data": updated_payload}, mutation=True)
record("update", "admin.products.update succeeds", updated is not None, err or "")

if updated:
    record("update", "product id is stable across edits", updated["id"] == pid, f"{pid} → {updated['id']}")

    after, _ = storefront("products.byId", {"id": pid})
    record("update", "name change reflected", after["name"] == updated_payload["name"])
    record("update", "price change reflected", after["price"] == "3950.00", after["price"])
    record("update", "stock change reflected", after["stock"] == 40, str(after["stock"]))
    record("update", "scent notes change reflected", after["scentNotes"] == ["Pistachio", "Rosewater"])

    moved, _ = storefront("products.list", {"limit": 200, "category": "cheesecake"})
    record("update", "moved into new category filter", any(p["id"] == pid for p in moved))
    old_cat, _ = storefront("products.list", {"limit": 200, "category": "dessert-jar"})
    record("update", "removed from old category filter", not any(p["id"] == pid for p in old_cat))

    featured, _ = storefront("products.featured")
    record("update", "isFeatured=false → dropped from featured",
           not any(p["id"] == pid for p in featured))
    best, _ = storefront("products.bestsellers")
    record("update", "isBestseller=false → dropped from bestsellers",
           not any(p["id"] == pid for p in best))


# ── 3. INVENTORY → storefront ───────────────────────────────────────────────
section("3. INVENTORY → STOREFRONT REFLECTION")

restocked, err = call(admin, "admin.inventory.restock", {"id": pid, "amount": 25}, mutation=True)
record("inventory", "admin.inventory.restock succeeds", restocked is not None, err or "")
if restocked:
    record("inventory", "restock adds to existing stock (40 + 25)", restocked["stock"] == 65,
           str(restocked["stock"]))
    live, _ = storefront("products.byId", {"id": pid})
    record("inventory", "new stock visible on storefront", live["stock"] == 65, str(live["stock"]))

absolute, err = call(admin, "admin.inventory.setStock", {"id": pid, "stock": 3}, mutation=True)
record("inventory", "admin.inventory.setStock succeeds", absolute is not None, err or "")
if absolute:
    live, _ = storefront("products.byId", {"id": pid})
    record("inventory", "absolute stock visible on storefront", live["stock"] == 3, str(live["stock"]))

_, err = call(admin, "admin.inventory.restock", {"id": pid, "amount": -5}, mutation=True)
record("inventory", "negative restock rejected", err is not None, err or "ACCEPTED")
_, err = call(admin, "admin.inventory.setStock", {"id": pid, "stock": -1}, mutation=True)
record("inventory", "negative stock rejected", err is not None, err or "ACCEPTED")


# ── 4. Validation ───────────────────────────────────────────────────────────
section("4. ADMIN INPUT VALIDATION")

cases = [
    ("missing name", {"description": "d", "category": "cupcake", "price": "1", "stock": 1}),
    ("missing description", {"name": "n", "category": "cupcake", "price": "1", "stock": 1}),
    ("invalid category", {"name": "n", "description": "d", "category": "premium", "price": "1", "stock": 1}),
    ("zero price", {"name": "n", "description": "d", "category": "cupcake", "price": "0", "stock": 1}),
    ("negative price", {"name": "n", "description": "d", "category": "cupcake", "price": "-5", "stock": 1}),
    ("non-numeric price", {"name": "n", "description": "d", "category": "cupcake", "price": "abc", "stock": 1}),
    ("negative stock", {"name": "n", "description": "d", "category": "cupcake", "price": "1", "stock": -3}),
    ("bad image scheme", {"name": "n", "description": "d", "category": "cupcake", "price": "1",
                          "stock": 1, "images": ["javascript:alert(1)"]}),
]
for label, payload in cases:
    _, err = call(admin, "admin.products.create", payload, mutation=True)
    record("validation", f"rejects {label}", err is not None, err or "ACCEPTED")

_, err = call(admin, "admin.orders.updateStatus", {"id": 1, "status": "not-a-status"}, mutation=True)
record("validation", "rejects invalid order status", err is not None, err or "ACCEPTED")

_, err = call(admin, "admin.products.update", {"id": 999999, "data": new_product}, mutation=True)
record("validation", "update on missing product returns NOT_FOUND", err is not None, err or "ACCEPTED")
_, err = call(admin, "admin.products.delete", {"id": 999999}, mutation=True)
record("validation", "delete on missing product returns NOT_FOUND", err is not None, err or "ACCEPTED")

dup, err = call(admin, "admin.products.create", {
    "name": "Audit Pistachio Kunafa Jar", "description": "duplicate slug probe",
    "category": "cupcake", "price": "100", "stock": 1}, mutation=True)
record("validation", "duplicate name gets a unique slug", dup is not None and dup["slug"] != slug,
       dup["slug"] if dup else err)
dup_id = dup["id"] if dup else None


# ── 5. Customers & orders ───────────────────────────────────────────────────
section("5. CUSTOMER & ORDER MANAGEMENT")

order_payload = {
    "fullName": "Audit Customer",
    "email": "audit.customer@example.com",
    "phone": "03009998877",
    "address": "42 Audit Avenue, Block C",
    "city": "Karachi",
    "province": "Sindh",
    "postalCode": "75500",
    "paymentMethod": "cod",
    "items": [{"productId": pid, "quantity": 2, "size": "Medium"}],
}
placed, err = call(guest, "orders.create", order_payload, mutation=True)
record("orders", "customer can place an order", placed is not None, err or "")

if placed:
    order = placed["order"]
    order_number = order["orderNumber"]
    record("orders", "order number generated server-side", bool(order_number), order_number)
    record("orders", "payment status is pending, never 'paid'", order["paymentStatus"] == "pending",
           order["paymentStatus"])

    live, _ = storefront("products.byId", {"id": pid})
    record("orders", "stock decremented by the order (3 - 2)", live["stock"] == 1, str(live["stock"]))

    customers, err = call(admin, "admin.customers.list")
    record("customers", "admin.customers.list succeeds", customers is not None, err or "")
    match = next((c for c in (customers or []) if c["email"] == order_payload["email"]), None)
    record("customers", "new customer appears in admin", match is not None)

    if match:
        record("customers", "customer name captured", match["name"] == "Audit Customer", str(match["name"]))
        record("customers", "phone captured", match["phone"] == "03009998877", str(match["phone"]))
        record("customers", "city captured", match["city"] == "Karachi", str(match["city"]))
        record("customers", "order count is 1", match["orderCount"] == 1, str(match["orderCount"]))
        record("customers", "Order ID column matches the customer's order number",
               match["latestOrderNumber"] == order_number,
               f"{match['latestOrderNumber']} vs {order_number}")
        record("customers", "total spent matches the order total",
               abs(float(match["totalSpent"]) - float(order["total"])) < 0.01,
               f"{match['totalSpent']} vs {order['total']}")
        record("customers", "full order history embedded",
               len(match["orders"]) == 1 and match["orders"][0]["orderNumber"] == order_number)

    orders, err = call(admin, "admin.orders.list")
    record("orders", "admin.orders.list succeeds", orders is not None, err or "")
    admin_order = next((o for o in (orders or []) if o["orderNumber"] == order_number), None)
    record("orders", "order visible in admin", admin_order is not None)

    if admin_order:
        record("orders", "admin and customer see the same Order ID",
               admin_order["orderNumber"] == order_number)
        record("orders", "customer name on order", admin_order["customerName"] == "Audit Customer")
        record("orders", "line items included", admin_order["itemCount"] == 2, str(admin_order["itemCount"]))
        record("orders", "line item references the right product",
               admin_order["items"][0]["productId"] == pid)
        record("orders", "shipping address captured",
               admin_order["shippingCity"] == "Karachi" and admin_order["shippingZipCode"] == "75500")

        changed, err = call(admin, "admin.orders.updateStatus",
                            {"id": admin_order["id"], "status": "shipped"}, mutation=True)
        record("orders", "admin can advance order status", changed is not None, err or "")
        if changed:
            refetched, _ = call(admin, "admin.orders.list")
            now = next(o for o in refetched if o["orderNumber"] == order_number)
            record("orders", "status change persisted", now["status"] == "shipped", now["status"])
            record("orders", "payment status NOT changed by a status update",
                   now["paymentStatus"] == "pending", now["paymentStatus"])


# ── 6. Dashboard stats ──────────────────────────────────────────────────────
section("6. DASHBOARD STATISTICS")

stats, err = call(admin, "admin.stats")
record("stats", "admin.stats succeeds", stats is not None, err or "")
if stats:
    all_products, _ = call(admin, "admin.products.list")
    active = [p for p in all_products if p["isActive"]]
    record("stats", "productCount matches active products",
           stats["productCount"] == len(active), f"{stats['productCount']} vs {len(active)}")
    orders, _ = call(admin, "admin.orders.list")
    record("stats", "orderCount matches orders", stats["orderCount"] == len(orders),
           f"{stats['orderCount']} vs {len(orders)}")
    record("stats", "confirmedRevenue is 0 while no payment is confirmed",
           float(stats["confirmedRevenue"]) == 0.0, stats["confirmedRevenue"])
    record("stats", "lowStock count is correct",
           stats["lowStock"] == len([p for p in active if 0 < p["stock"] < 10]))
    record("stats", "outOfStock count is correct",
           stats["outOfStock"] == len([p for p in active if p["stock"] == 0]))
    record("stats", "productsByCategory sums to productCount",
           sum(stats["productsByCategory"].values()) == stats["productCount"])


# ── 7. DELETE → storefront ──────────────────────────────────────────────────
section("7. PRODUCT DELETE → STOREFRONT REFLECTION")

if dup_id:
    res, err = call(admin, "admin.products.delete", {"id": dup_id}, mutation=True)
    record("delete", "unreferenced product is hard-deleted",
           res is not None and res["deleted"] is True, err or res.get("message", ""))
    gone, _ = storefront("products.byId", {"id": dup_id})
    record("delete", "hard-deleted product gone from storefront", gone is None)

res, err = call(admin, "admin.products.delete", {"id": pid}, mutation=True)
record("delete", "order-referenced product is deactivated, not deleted",
       res is not None and res["deleted"] is False and res["deactivated"] is True,
       err or res.get("message", ""))

hidden, _ = storefront("products.byId", {"id": pid})
record("delete", "deactivated product hidden from storefront", hidden is None)
listed, _ = storefront("products.list", {"limit": 200})
record("delete", "deactivated product absent from product list",
       not any(p["id"] == pid for p in listed))

admin_list, _ = call(admin, "admin.products.list")
still_there = next((p for p in admin_list if p["id"] == pid), None)
record("delete", "deactivated product still visible to admin", still_there is not None)
record("delete", "admin sees it flagged inactive",
       still_there is not None and still_there["isActive"] is False)

orders, _ = call(admin, "admin.orders.list")
audit_order = next((o for o in orders if o["customerEmail"] == "audit.customer@example.com"), None)
record("delete", "existing order still resolves its product after deactivation",
       audit_order is not None and audit_order["items"][0]["productId"] == pid)

restored, err = call(admin, "admin.products.update",
                     {"id": pid, "data": {**updated_payload, "isActive": True}}, mutation=True)
record("delete", "admin can reactivate a deactivated product",
       restored is not None and restored["isActive"] is True, err or "")
back, _ = storefront("products.byId", {"id": pid})
record("delete", "reactivated product returns to storefront", back is not None)


# ── Summary ─────────────────────────────────────────────────────────────────
section("SUMMARY")
passed = sum(1 for *_, ok, _ in results if ok)
failed = [r for r in results if not r[2]]
print(f"  {passed}/{len(results)} checks passed")
if failed:
    print(f"\n  {len(failed)} FAILURES:")
    for area, name, _, detail in failed:
        print(f"    [{area}] {name} — {detail}")
print(f"\n  Audit product left in place: id={pid} (clean up with cleanup_audit.py)")
sys.exit(1 if failed else 0)
