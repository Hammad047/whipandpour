"""
main.py — FastAPI application with tRPC-compatible HTTP batch endpoint.

The frontend uses @trpc/client with httpBatchLink pointed at /api/trpc.
tRPC batch protocol:
  GET  /api/trpc/<proc1>,<proc2>?batch=1&input={"0":...,"1":...}
  POST /api/trpc/<proc1>,<proc2>?batch=1          body: {"0":...,"1":...}

Each request in the batch corresponds to one tRPC procedure call.
The response must be a JSON array of length N, each item being either:
  { "result": { "data": <superjson-envelope> } }
  { "error": { "json": { "message": ..., "code": -32600, "data": { "code": "...", "httpStatus": ... } } } }

superjson envelope: { "json": <value>, "meta": { ... } }  (meta only needed for special types like Date/Map/Set)
For plain JSON values we just wrap as: { "json": <value> }
"""

import json
import os
import traceback
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse, unquote

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func

from database import SessionLocal, init_db
from auth import (
    TRPCError,
    UNAUTHED_ERR_MSG,
    NOT_ADMIN_ERR_MSG,
    verify_password,
    get_user_id_from_request,
    create_session,
    destroy_session,
    set_session_cookie,
    clear_session_cookie,
    COOKIE_NAME,
)
from database import User, Product

# Import all route handlers
from routers.products import (
    products_list,
    products_featured,
    products_bestsellers,
    products_by_slug,
    products_by_id,
    products_categories,
)
from routers.cart import cart_get, cart_add, cart_update, cart_clear
from routers.wishlist import wishlist_list, wishlist_add, wishlist_remove
from routers.orders import (
    orders_list,
    orders_by_id,
    orders_items,
    create_order_from_cart,
    lookup_orders,
)
from routers.admin import (
    admin_products_list,
    admin_products_create,
    admin_products_update,
    admin_products_delete,
    admin_inventory_restock,
    admin_inventory_set_stock,
    admin_customers_list,
    admin_orders_list,
    admin_orders_update_status,
    admin_orders_mark_advance_paid,
    admin_stats,
    admin_promos_list,
    admin_promos_create,
    admin_promos_update,
    admin_promos_delete,
    admin_reviews_list,
    admin_reviews_update_status,
    admin_reviews_delete,
    admin_analytics,
    admin_payments_list,
)
from routers.promos import promos_validate
from routers.reviews import reviews_by_product, reviews_create, reviews_can_review
from routers.stripe_router import (
    stripe_create_checkout_session,
    stripe_get_session,
)


# ─── Lifespan ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[Startup] Initializing database…")
    init_db()
    print("[Startup] Database ready.")
    yield
    print("[Shutdown] Goodbye.")


# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Whip & Pour API",
    description="Python FastAPI backend — tRPC-compatible batch endpoint",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── tRPC response helpers ────────────────────────────────────────────────────

def trpc_ok(data: Any) -> dict:
    """Wrap a successful result in the superjson + tRPC envelope."""
    return {"result": {"data": {"json": data}}}


def trpc_err(message: str, code: str = "INTERNAL_SERVER_ERROR", http_status: int = 500) -> dict:
    """Format a tRPC error envelope."""
    trpc_code_map = {
        "PARSE_ERROR": -32700,
        "BAD_REQUEST": -32600,
        "INTERNAL_SERVER_ERROR": -32603,
        "UNAUTHORIZED": -32001,
        "FORBIDDEN": -32003,
        "NOT_FOUND": -32004,
        "METHOD_NOT_SUPPORTED": -32005,
        "TIMEOUT": -32008,
        "CONFLICT": -32009,
        "PRECONDITION_FAILED": -32012,
        "PAYLOAD_TOO_LARGE": -32013,
        "TOO_MANY_REQUESTS": -32029,
    }
    numeric_code = trpc_code_map.get(code, -32603)
    return {
        "error": {
            "json": {
                "message": message,
                "code": numeric_code,
                "data": {
                    "code": code,
                    "httpStatus": http_status,
                },
            }
        }
    }


# ─── Auth helpers ─────────────────────────────────────────────────────────────

def _get_user(request: Request, db):
    """Return User ORM object if session cookie is valid, else None."""
    user_id = get_user_id_from_request(request)
    if user_id is None:
        return None
    return db.query(User).filter(User.id == user_id).first()


def _require_user(request: Request, db) -> User:
    user = _get_user(request, db)
    if user is None:
        raise TRPCError(code="UNAUTHORIZED", message=UNAUTHED_ERR_MSG)
    return user


def _require_admin(request: Request, db) -> User:
    """
    Gate for every admin.* procedure.

    Authorization is the `role` column on the user row reached through the
    session cookie. A client-side flag is not evidence of anything.
    """
    user = _require_user(request, db)
    if user.role != "admin":
        raise TRPCError(code="FORBIDDEN", message=NOT_ADMIN_ERR_MSG)
    return user


# ─── tRPC procedure dispatcher ───────────────────────────────────────────────

def _parse_input(raw: Any) -> Any:
    """
    tRPC sends input as a superjson envelope: {"json": <value>}
    or sometimes as a plain value. Handle both.
    """
    if isinstance(raw, dict) and "json" in raw:
        return raw["json"]
    return raw


async def dispatch_procedure(
    procedure: str,
    input_data: Any,
    is_mutation: bool,
    request: Request,
    response: Response,
    db,
) -> Any:
    """
    Route a single tRPC procedure name → handler.
    Returns the raw Python value (will be wrapped in trpc_ok/trpc_err by caller).
    Raises TRPCError on auth/validation failures.
    """
    inp = _parse_input(input_data)

    # ── auth ──────────────────────────────────────────────────────────────────
    if procedure == "auth.me":
        user = _get_user(request, db)
        if user is None:
            return None
        return {
            "id": user.id,
            "openId": user.openId,
            "name": user.name,
            "email": user.email,
            "phone": user.phone,
            "address": user.address,
            "city": user.city,
            "state": user.state,
            "zipCode": user.zipCode,
            "country": user.country,
            "loginMethod": user.loginMethod,
            "role": user.role,
            "createdAt": user.createdAt.isoformat() if user.createdAt else None,
        }

    if procedure == "auth.logout":
        session_id = request.cookies.get(COOKIE_NAME)
        if session_id:
            destroy_session(session_id)
        clear_session_cookie(response)
        return {"success": True}

    # ── products ──────────────────────────────────────────────────────────────
    if procedure == "products.list":
        inp = inp or {}
        return products_list(
            db,
            category=inp.get("category"),
            search=inp.get("search"),
            min_price=inp.get("minPrice"),
            max_price=inp.get("maxPrice"),
            # Default raised from 12: a store with more than 12 products would
            # silently hide the rest from any caller that omitted `limit`.
            limit=min(int(inp.get("limit", 100)), 200),
            offset=int(inp.get("offset", 0)),
            sort_by=inp.get("sortBy"),
        )

    if procedure == "products.categories":
        return products_categories()

    if procedure == "system.mailStatus":
        # Lets the checkout UI avoid promising an email that cannot be sent.
        from mailer import mail_status

        return mail_status()

    # ── gifting ───────────────────────────────────────────────────────────────
    if procedure == "gifting.options":
        # Served from the backend so the checkout price and the price actually
        # charged cannot drift apart.
        from routers.orders import GIFT_MESSAGE_MAX_LENGTH, GIFT_PACKAGING_FEE

        return {
            "packagingFee": str(GIFT_PACKAGING_FEE),
            "messageMaxLength": GIFT_MESSAGE_MAX_LENGTH,
            "includes": [
                "Signature kraft gift box with satin ribbon",
                "Handwritten card with your message",
                "Tissue-wrapped and cushioned for safe delivery",
                "Prices hidden from the recipient's packing slip",
            ],
        }

    if procedure == "products.featured":
        return products_featured(db)

    if procedure == "products.bestsellers":
        return products_bestsellers(db)

    if procedure == "products.bySlug":
        if not inp or "slug" not in inp:
            raise TRPCError(message="slug is required", code="BAD_REQUEST")
        return products_by_slug(db, inp["slug"])

    if procedure == "products.byId":
        if not inp or "id" not in inp:
            raise TRPCError(message="id is required", code="BAD_REQUEST")
        return products_by_id(db, int(inp["id"]))

    # ── cart ──────────────────────────────────────────────────────────────────
    if procedure == "cart.get":
        user = _require_user(request, db)
        return cart_get(db, user.id)

    if procedure == "cart.add":
        user = _require_user(request, db)
        if not inp:
            raise TRPCError(message="Input required", code="BAD_REQUEST")
        return cart_add(
            db,
            user_id=user.id,
            product_id=int(inp["productId"]),
            quantity=int(inp["quantity"]),
            size=str(inp["size"]),
        )

    if procedure == "cart.update":
        user = _require_user(request, db)
        if not inp:
            raise TRPCError(message="Input required", code="BAD_REQUEST")
        return cart_update(
            db,
            user_id=user.id,
            product_id=int(inp["productId"]),
            quantity=int(inp["quantity"]),
            size=str(inp["size"]),
        )

    if procedure == "cart.clear":
        user = _require_user(request, db)
        return cart_clear(db, user.id)

    # ── wishlist ──────────────────────────────────────────────────────────────
    if procedure == "wishlist.list":
        user = _require_user(request, db)
        return wishlist_list(db, user.id)

    if procedure == "wishlist.add":
        user = _require_user(request, db)
        if not inp or "productId" not in inp:
            raise TRPCError(message="productId is required", code="BAD_REQUEST")
        return wishlist_add(db, user_id=user.id, product_id=int(inp["productId"]))

    if procedure == "wishlist.remove":
        user = _require_user(request, db)
        if not inp or "productId" not in inp:
            raise TRPCError(message="productId is required", code="BAD_REQUEST")
        return wishlist_remove(db, user_id=user.id, product_id=int(inp["productId"]))

    # ── orders ────────────────────────────────────────────────────────────────
    if procedure == "orders.list":
        user = _require_user(request, db)
        return orders_list(db, user.id)

    if procedure == "orders.byId":
        user = _require_user(request, db)
        if not inp or "id" not in inp:
            raise TRPCError(message="id is required", code="BAD_REQUEST")
        return orders_by_id(db, order_id=int(inp["id"]), user_id=user.id)

    if procedure == "orders.create":
        if not is_mutation:
            raise TRPCError(message="orders.create must be a mutation", code="METHOD_NOT_SUPPORTED")
        # Guest checkout: a session is used when present, but is not required.
        # There is no customer login flow, so requiring one would block every
        # shopper from completing an order.
        return create_order_from_cart(db, _get_user(request, db), inp)

    if procedure == "orders.lookup":
        # Public: guests have no session, so ownership is proven by order
        # number + the email the order was placed with.
        if not inp:
            raise TRPCError(message="Order number and email are required", code="BAD_REQUEST")
        return lookup_orders(
            db,
            order_number=str(inp.get("orderNumber", "")),
            email=str(inp.get("email", "")),
        )

    if procedure == "orders.items":
        if not inp or "orderId" not in inp:
            raise TRPCError(message="orderId is required", code="BAD_REQUEST")
        return orders_items(db, order_id=int(inp["orderId"]))

    # ── admin (every branch requires role=admin) ─────────────────────────────
    if procedure.startswith("admin."):
        _require_admin(request, db)

        if procedure == "admin.products.list":
            return admin_products_list(db)

        if procedure == "admin.products.create":
            return admin_products_create(db, inp)

        if procedure == "admin.products.update":
            if not inp or "id" not in inp:
                raise TRPCError(message="id is required", code="BAD_REQUEST")
            return admin_products_update(db, int(inp["id"]), inp.get("data", inp))

        if procedure == "admin.products.delete":
            if not is_mutation:
                raise TRPCError(message="Delete must be a mutation", code="METHOD_NOT_SUPPORTED")
            if not inp or "id" not in inp:
                raise TRPCError(message="id is required", code="BAD_REQUEST")
            return admin_products_delete(db, int(inp["id"]))

        if procedure == "admin.inventory.restock":
            if not inp or "id" not in inp:
                raise TRPCError(message="id is required", code="BAD_REQUEST")
            return admin_inventory_restock(db, int(inp["id"]), int(inp.get("amount", 0)))

        if procedure == "admin.inventory.setStock":
            if not inp or "id" not in inp:
                raise TRPCError(message="id is required", code="BAD_REQUEST")
            return admin_inventory_set_stock(db, int(inp["id"]), int(inp.get("stock", 0)))

        if procedure == "admin.customers.list":
            return admin_customers_list(db)

        if procedure == "admin.orders.list":
            return admin_orders_list(db)

        if procedure == "admin.orders.updateStatus":
            if not inp or "id" not in inp:
                raise TRPCError(message="id is required", code="BAD_REQUEST")
            return admin_orders_update_status(db, int(inp["id"]), str(inp.get("status", "")))

        if procedure == "admin.orders.markAdvancePaid":
            if not is_mutation:
                raise TRPCError(message="markAdvancePaid must be a mutation", code="METHOD_NOT_SUPPORTED")
            if not inp or "id" not in inp:
                raise TRPCError(message="id is required", code="BAD_REQUEST")
            return admin_orders_mark_advance_paid(db, int(inp["id"]))

        if procedure == "admin.stats":
            return admin_stats(db)

        # ── promo codes ──
        if procedure == "admin.promos.list":
            return admin_promos_list(db)

        if procedure == "admin.promos.create":
            return admin_promos_create(db, inp)

        if procedure == "admin.promos.update":
            if not inp or "id" not in inp:
                raise TRPCError(message="id is required", code="BAD_REQUEST")
            return admin_promos_update(db, int(inp["id"]), inp.get("data", inp))

        if procedure == "admin.promos.delete":
            if not is_mutation:
                raise TRPCError(message="Delete must be a mutation", code="METHOD_NOT_SUPPORTED")
            if not inp or "id" not in inp:
                raise TRPCError(message="id is required", code="BAD_REQUEST")
            return admin_promos_delete(db, int(inp["id"]))

        # ── reviews ──
        if procedure == "admin.reviews.list":
            return admin_reviews_list(db)

        if procedure == "admin.reviews.updateStatus":
            if not inp or "id" not in inp:
                raise TRPCError(message="id is required", code="BAD_REQUEST")
            return admin_reviews_update_status(db, int(inp["id"]), str(inp.get("status", "")))

        if procedure == "admin.reviews.delete":
            if not is_mutation:
                raise TRPCError(message="Delete must be a mutation", code="METHOD_NOT_SUPPORTED")
            if not inp or "id" not in inp:
                raise TRPCError(message="id is required", code="BAD_REQUEST")
            return admin_reviews_delete(db, int(inp["id"]))

        # ── reporting ──
        if procedure == "admin.analytics":
            return admin_analytics(db)

        if procedure == "admin.payments.list":
            return admin_payments_list(db)

        raise TRPCError(message=f"Procedure not found: {procedure}", code="NOT_FOUND")

    # ── promos ────────────────────────────────────────────────────────────────
    if procedure == "promos.validate":
        if not inp or "code" not in inp:
            raise TRPCError(message="code is required", code="BAD_REQUEST")
        return promos_validate(db, code=str(inp["code"]))

    # ── reviews ───────────────────────────────────────────────────────────────
    if procedure == "reviews.byProduct":
        if not inp or inp.get("productId") in (None, ""):
            raise TRPCError(message="productId is required", code="BAD_REQUEST")
        return reviews_by_product(db, product_id=int(inp["productId"]))

    if procedure == "reviews.canReview":
        if not inp or inp.get("productId") in (None, ""):
            raise TRPCError(message="productId is required", code="BAD_REQUEST")
        return reviews_can_review(
            db,
            product_id=int(inp["productId"]),
            order_number=str(inp.get("orderNumber", "")),
            email=str(inp.get("email", "")),
        )

    if procedure == "reviews.create":
        # Public, but gated on proving a real purchase inside the handler.
        if not is_mutation:
            raise TRPCError(message="reviews.create must be a mutation", code="METHOD_NOT_SUPPORTED")
        if not inp or inp.get("productId") in (None, ""):
            raise TRPCError(message="productId is required", code="BAD_REQUEST")
        return reviews_create(db, product_id=int(inp["productId"]), data=inp)

    # ── stripe ────────────────────────────────────────────────────────────────
    if procedure == "stripe.createCheckoutSession":
        user = _require_user(request, db)
        if not inp:
            raise TRPCError(message="Input required", code="BAD_REQUEST")
        origin = request.headers.get("origin", str(request.base_url).rstrip("/"))
        return stripe_create_checkout_session(
            db=db,
            user=user,
            cart_items=inp.get("cartItems", []),
            subtotal=float(inp.get("subtotal", 0)),
            shipping_cost=float(inp.get("shippingCost", 0)),
            discount_amount=float(inp.get("discountAmount", 0)),
            promo_code=inp.get("promoCode"),
            shipping_address=inp.get("shippingAddress", ""),
            shipping_city=inp.get("shippingCity", ""),
            shipping_state=inp.get("shippingState"),
            shipping_zip_code=inp.get("shippingZipCode", ""),
            shipping_country=inp.get("shippingCountry", ""),
            customer_email=inp.get("customerEmail", ""),
            customer_phone=inp.get("customerPhone"),
            origin=origin,
        )

    if procedure == "stripe.getSession":
        if not inp or "sessionId" not in inp:
            raise TRPCError(message="sessionId is required", code="BAD_REQUEST")
        return stripe_get_session(session_id=str(inp["sessionId"]))

    # ── system.health (optional, used by some tRPC setups) ───────────────────
    if procedure in ("system.health", "health"):
        return {"status": "ok"}

    raise TRPCError(message=f"Procedure not found: {procedure}", code="NOT_FOUND")


# ─── Main tRPC batch handler ──────────────────────────────────────────────────

@app.api_route("/api/trpc/{procedures}", methods=["GET", "POST"])
async def trpc_handler(procedures: str, request: Request):
    """
    Handle tRPC HTTP batch requests.

    URL patterns:
      GET  /api/trpc/products.list?batch=1&input={"0":{"json":{"limit":12}}}
      POST /api/trpc/products.featured,products.bestsellers?batch=1
           body: {"0":null,"1":null}
    """
    response = Response()

    # Split comma-separated procedure names
    proc_names = [p.strip() for p in procedures.split(",") if p.strip()]
    is_batch = len(proc_names) > 1 or request.query_params.get("batch") == "1"
    is_mutation = request.method == "POST"

    # ── Parse inputs ──────────────────────────────────────────────────────────
    inputs: dict[int, Any] = {}

    if is_mutation:
        try:
            body_bytes = await request.body()
            body = json.loads(body_bytes) if body_bytes else {}
            # tRPC batch: {"0": <input0>, "1": <input1>, ...}
            if isinstance(body, dict):
                for k, v in body.items():
                    try:
                        inputs[int(k)] = v
                    except ValueError:
                        pass
        except Exception:
            inputs = {}
    else:
        # GET: input param is a JSON object keyed by index
        raw_input = request.query_params.get("input", "{}")
        try:
            parsed = json.loads(unquote(raw_input))
            if isinstance(parsed, dict):
                for k, v in parsed.items():
                    try:
                        inputs[int(k)] = v
                    except ValueError:
                        pass
        except Exception:
            inputs = {}

    # ── Dispatch each procedure ────────────────────────────────────────────────
    db = SessionLocal()
    results = []

    try:
        for idx, proc_name in enumerate(proc_names):
            input_data = inputs.get(idx)
            try:
                data = await dispatch_procedure(
                    procedure=proc_name,
                    input_data=input_data,
                    is_mutation=is_mutation,
                    request=request,
                    response=response,
                    db=db,
                )
                results.append(trpc_ok(data))
            except TRPCError as e:
                results.append(trpc_err(e.message, e.code, e.http_status))
            except Exception as e:
                traceback.print_exc()
                results.append(trpc_err(str(e), "INTERNAL_SERVER_ERROR", 500))
    finally:
        db.close()

    # ── Copy any cookies set on `response` to the actual response ─────────────
    # Use a JSONResponse and copy headers
    resp_body = json.dumps(results)
    final = JSONResponse(content=results, status_code=200)

    # Propagate Set-Cookie headers from the mutable `response` object
    for key, val in response.headers.items():
        if key.lower() == "set-cookie":
            final.headers.append(key, val)

    return final


# ─── Demo login endpoint (for testing without OAuth) ─────────────────────────

@app.post("/api/auth/demo-login")
async def demo_login(request: Request):
    """
    Create or fetch a demo user and return a session cookie.
    POST body: { "name": "...", "email": "..." }  (both optional)
    This endpoint exists purely for local testing — not part of production OAuth flow.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    name = body.get("name", "Demo User")
    email = body.get("email", "demo@whipandpour.com")
    open_id = f"demo_{email.replace('@','_').replace('.','_')}"

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.openId == open_id).first()
        if not user:
            user = User(
                openId=open_id,
                name=name,
                email=email,
                loginMethod="demo",
                role="user",
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        session_id = create_session(user.id)

        resp = JSONResponse(content={
            "success": True,
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "role": user.role,
            },
        })
        set_session_cookie(resp, session_id)
        return resp
    finally:
        db.close()


@app.post("/api/auth/admin-login")
async def admin_login(request: Request):
    """
    Verify admin credentials against the database and issue a session cookie.

    Replaces the previous client-side check, which compared the password to a
    string literal inside the shipped JavaScript bundle.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    email = str(body.get("email", "")).strip().lower()
    password = str(body.get("password", ""))

    if not email or not password:
        return JSONResponse({"success": False, "message": "Email and password are required"}, status_code=400)

    db = SessionLocal()
    try:
        user = db.query(User).filter(func.lower(User.email) == email).first()

        # One generic message for every failure mode, so the response cannot be
        # used to discover which admin emails exist.
        if user is None or user.role != "admin" or not verify_password(password, user.passwordHash):
            return JSONResponse(
                {"success": False, "message": "Invalid email or password"}, status_code=401
            )

        user.lastSignedIn = datetime.utcnow()
        db.commit()

        session_id = create_session(user.id)
        resp = JSONResponse(
            {
                "success": True,
                "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role},
            }
        )
        set_session_cookie(resp, session_id)
        return resp
    finally:
        db.close()


@app.get("/api/auth/demo-logout")
async def demo_logout(request: Request):
    session_id = request.cookies.get(COOKIE_NAME)
    if session_id:
        destroy_session(session_id)
    resp = JSONResponse(content={"success": True})
    clear_session_cookie(resp)
    return resp


# ─── Health check ─────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "whipandpour-python-backend"}


# ─── SEO: sitemap + robots ─────────────────────────────────────────────────────
# Registered before the SPA catch-all below (Starlette matches routes in
# registration order), and as plain routes rather than tRPC procedures since
# they're consumed by crawlers, not the frontend's tRPC client.

@app.get("/sitemap.xml")
async def sitemap():
    from xml.sax.saxutils import escape

    store_url = os.getenv("STORE_URL", "https://whipandpour.com").rstrip("/")
    db = SessionLocal()
    try:
        products = (
            db.query(Product)
            .filter(Product.isActive == True)  # noqa: E712
            .order_by(Product.id)
            .all()
        )
        urls = [(f"{store_url}/", None, "1.0")]
        urls += [(f"{store_url}/shop", None, "0.9")]
        urls += [(f"{store_url}/about", None, "0.5")]
        urls += [(f"{store_url}/contact", None, "0.5")]
        for p in products:
            lastmod = p.updatedAt.replace(tzinfo=timezone.utc).isoformat() if p.updatedAt else None
            urls.append((f"{store_url}/product/{p.slug}", lastmod, "0.8"))

        entries = "\n".join(
            "  <url>\n"
            f"    <loc>{escape(loc)}</loc>\n"
            + (f"    <lastmod>{lastmod}</lastmod>\n" if lastmod else "")
            + f"    <priority>{priority}</priority>\n"
            "  </url>"
            for loc, lastmod, priority in urls
        )
        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"{entries}\n"
            "</urlset>"
        )
        return Response(content=xml, media_type="application/xml")
    finally:
        db.close()


@app.get("/robots.txt")
async def robots():
    store_url = os.getenv("STORE_URL", "https://whipandpour.com").rstrip("/")
    body = f"User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: {store_url}/sitemap.xml\n"
    return Response(content=body, media_type="text/plain")


# ─── Serve built frontend (production mode) ───────────────────────────────────
# The React frontend is built into ../frontend/dist
# Run: cd ../frontend && npm run build   first.
# Then this block serves index.html for all unmatched routes (SPA fallback).

_frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

if os.path.isdir(_frontend_dist):
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse

    _frontend_dist = os.path.abspath(_frontend_dist)

    # Hashed build output (JS/CSS).
    _assets_dir = os.path.join(_frontend_dist, "assets")
    if os.path.isdir(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """
        Serve a real file from the build output when one exists, otherwise fall
        back to index.html so client-side routing works.

        Only /assets used to be mounted, so everything copied from `public/`
        (product images, favicon, robots.txt) was swallowed by this catch-all
        and returned index.html with a 200 — images silently rendered blank in
        production while working fine under the Vite dev server.
        """
        index = os.path.join(_frontend_dist, "index.html")

        if full_path:
            candidate = os.path.abspath(os.path.join(_frontend_dist, full_path))
            # Never serve anything outside the build directory: `full_path` is
            # attacker-controlled and may contain ../ segments.
            if (
                candidate.startswith(_frontend_dist + os.sep)
                and os.path.isfile(candidate)
            ):
                return FileResponse(candidate)

        if os.path.isfile(index):
            return FileResponse(index)
        return JSONResponse(
            {"message": "Frontend not built. Run: cd ../frontend && npm run build"},
            status_code=404,
        )

else:
    @app.get("/")
    async def root():
        return {
            "message": "Whip & Pour API is running",
            "docs": "/docs",
            "hint": "Build the frontend with: cd ../frontend && npm run build",
        }


# ─── Entry point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
