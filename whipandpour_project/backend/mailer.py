"""
mailer.py — transactional email over SMTP.

Uses Python's standard library (`smtplib` + `email.message`), so there is no
extra dependency and no third-party service holding your customer data.

Configured for Hostinger by default, since that is where this store's DNS and
mailbox live. Set these in `backend/.env`:

    SMTP_HOST=smtp.hostinger.com
    SMTP_PORT=465                       # 465 = implicit SSL, 587 = STARTTLS
    SMTP_USER=owner@whipandpour.com    # the full mailbox address
    SMTP_PASSWORD=...                   # that mailbox's password
    MAIL_FROM=owner@whipandpour.com    # must match SMTP_USER on Hostinger
    MAIL_FROM_NAME=Whip & Pour
    MAIL_ADMIN=owner@whipandpour.com   # optional: copy of every new order
    MAIL_ENABLED=true                   # set false to disable without unsetting creds

**If SMTP is not configured, nothing is sent and nothing pretends otherwise.**
`send_order_confirmation` returns False, the failure is logged, and the order is
still created — email must never be able to fail a checkout.
"""

from __future__ import annotations

import logging
import os
import smtplib
import ssl
import threading
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from typing import Any, Optional

logger = logging.getLogger("whipandpour.mailer")

DEFAULT_HOST = "smtp.hostinger.com"
DEFAULT_PORT = 465
SEND_TIMEOUT_SECONDS = 20


class MailConfig:
    """SMTP settings resolved from the environment at send time."""

    def __init__(self) -> None:
        self.enabled = os.getenv("MAIL_ENABLED", "true").strip().lower() not in ("false", "0", "no")
        self.host = os.getenv("SMTP_HOST", DEFAULT_HOST).strip()
        self.port = int(os.getenv("SMTP_PORT", str(DEFAULT_PORT)))
        self.user = os.getenv("SMTP_USER", "").strip()
        self.password = os.getenv("SMTP_PASSWORD", "")
        self.from_address = (os.getenv("MAIL_FROM", "") or self.user).strip()
        self.from_name = os.getenv("MAIL_FROM_NAME", "Whip & Pour").strip()
        self.admin_address = os.getenv("MAIL_ADMIN", "").strip()
        self.store_url = os.getenv("STORE_URL", "https://whipandpour.com").rstrip("/")
        # Escape hatch for a trusted local relay that offers no STARTTLS.
        # Never enable this against a remote mail server.
        self.allow_insecure = os.getenv("MAIL_ALLOW_INSECURE", "").strip().lower() in ("true", "1", "yes")

    @property
    def configured(self) -> bool:
        return bool(self.enabled and self.host and self.user and self.password and self.from_address)

    def describe_missing(self) -> str:
        if not self.enabled:
            return "MAIL_ENABLED is false"
        missing = [
            name
            for name, value in (
                ("SMTP_HOST", self.host),
                ("SMTP_USER", self.user),
                ("SMTP_PASSWORD", self.password),
                ("MAIL_FROM", self.from_address),
            )
            if not value
        ]
        return "missing " + ", ".join(missing) if missing else "configured"


def _money(value: Any) -> str:
    """Render a Decimal/str amount as `PKR 1,850`."""
    try:
        return f"PKR {float(value):,.0f}"
    except (TypeError, ValueError):
        return f"PKR {value}"


def _send(message: EmailMessage, config: MailConfig) -> bool:
    """Deliver one message. Returns True only if the SMTP server accepted it."""
    try:
        context = ssl.create_default_context()
        if config.port == 465:
            with smtplib.SMTP_SSL(
                config.host, config.port, timeout=SEND_TIMEOUT_SECONDS, context=context
            ) as server:
                server.login(config.user, config.password)
                server.send_message(message)
        else:
            with smtplib.SMTP(config.host, config.port, timeout=SEND_TIMEOUT_SECONDS) as server:
                server.ehlo()

                # Upgrade to TLS when the server offers it (Hostinger does on 587).
                encrypted = False
                if server.has_extn("starttls"):
                    server.starttls(context=context)
                    server.ehlo()
                    encrypted = True

                if config.user and config.password:
                    # Never put a mailbox password on the wire in the clear. A
                    # local relay or capture server with no STARTTLS is fine to
                    # send through, but not to authenticate against.
                    if not encrypted and not config.allow_insecure:
                        raise smtplib.SMTPException(
                            f"{config.host}:{config.port} does not support STARTTLS; refusing to "
                            "send credentials unencrypted. Use port 465, or set "
                            "MAIL_ALLOW_INSECURE=true only for a trusted local relay."
                        )
                    if encrypted:
                        server.login(config.user, config.password)

                server.send_message(message)
        logger.info("Sent %r to %s", message["Subject"], message["To"])
        return True
    except Exception:
        # A mail failure must never surface to the shopper as a failed order.
        logger.exception("Failed to send %r to %s", message["Subject"], message.get("To"))
        return False


def _build_order_email(order: dict, items: list[dict], config: MailConfig) -> EmailMessage:
    """Compose the order confirmation as plain text with an HTML alternative."""
    number = order["orderNumber"]
    name = (order.get("customerName") or "there").split(" ")[0]

    lines = [
        f"Hi {name},",
        "",
        "Thank you for your order from Whip & Pour.",
        "",
        f"Order number: {number}",
        f"Placed:       {str(order.get('createdAt') or '')[:10]}",
        "",
        "What you ordered",
        "----------------",
    ]
    for item in items:
        lines.append(
            f"  {item['quantity']} x {item['productName']} ({item.get('size') or 'Standard'})"
            f" — {_money(item.get('lineTotal') or item['unitPrice'])}"
        )

    lines += [
        "",
        f"Subtotal:  {_money(order['subtotal'])}",
        f"Shipping:  {'Free' if float(order.get('shippingCost') or 0) == 0 else _money(order['shippingCost'])}",
    ]
    if float(order.get("giftPackagingFee") or 0) > 0:
        lines.append(f"Gift wrap: {_money(order['giftPackagingFee'])}")
    if float(order.get("discountAmount") or 0) > 0:
        code = order.get("promoCode") or ""
        lines.append(f"Discount{f' ({code})' if code else ''}: -{_money(order['discountAmount'])}")
    lines += [
        f"Total:     {_money(order['total'])}",
        "",
        "Delivery",
        "--------",
        f"  {order['shippingAddress']}",
        f"  {order['shippingCity']} {order['shippingZipCode']}, {order['shippingCountry']}",
        "",
        "Payment",
        "-------",
        f"  Method: {order['paymentMethod']}",
        f"  Status: {order['paymentStatus']}",
    ]

    # State the payment position plainly — never imply money has been received.
    if order["paymentStatus"] != "completed":
        if order["paymentMethod"] == "cod":
            lines.append(
                f"  Please have {_money(order['total'])} ready for the courier on delivery."
            )
        else:
            lines.append(
                "  We have not received payment yet. Our team will contact you with instructions."
            )

    if order.get("giftPackaging"):
        lines += ["", "Gift packaging", "--------------", "  Your order will arrive gift-boxed with a handwritten card."]
        if order.get("giftCardMessage"):
            lines.append(f'  Card message: "{order["giftCardMessage"]}"')

    lines += [
        "",
        f"Track your order: {config.store_url}/account",
        f"(You'll need order number {number} and this email address.)",
        "",
        "Thank you,",
        "Whip & Pour",
    ]
    text_body = "\n".join(lines)

    rows = "".join(
        f"""<tr>
              <td style="padding:8px 0;border-bottom:1px solid #E8DDD0;">
                <strong style="color:#2C2C2C;">{item['productName']}</strong><br>
                <span style="color:#7A7066;font-size:13px;">{item.get('size') or 'Standard'} · Qty {item['quantity']}</span>
              </td>
              <td style="padding:8px 0;border-bottom:1px solid #E8DDD0;text-align:right;color:#2C2C2C;white-space:nowrap;">
                {_money(item.get('lineTotal') or item['unitPrice'])}
              </td>
            </tr>"""
        for item in items
    )

    payment_note = ""
    if order["paymentStatus"] != "completed":
        note = (
            f"Please have {_money(order['total'])} ready for the courier on delivery."
            if order["paymentMethod"] == "cod"
            else "We have not received payment yet — our team will contact you with instructions."
        )
        payment_note = (
            f'<p style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;'
            f'padding:12px;color:#92400E;font-size:14px;">{note}</p>'
        )

    gift_block = ""
    if order.get("giftPackaging"):
        card_message = order.get("giftCardMessage")
        message_html = ""
        if card_message:
            message_html = (
                '<p style="margin:8px 0 0;font-style:italic;color:#2C2C2C;">'
                "&ldquo;" + str(card_message) + "&rdquo;</p>"
            )
        gift_block = (
            '<div style="background:#FAF7F2;border:1px solid #C9A84C;'
            'border-radius:8px;padding:12px;margin:16px 0;">'
            '<strong style="color:#C9A84C;font-size:12px;letter-spacing:1px;">'
            "GIFT PACKAGING INCLUDED</strong>" + message_html + "</div>"
        )

    gift_fee_row = ""
    if float(order.get("giftPackagingFee") or 0) > 0:
        gift_fee_row = (
            "<tr><td>Gift packaging</td><td style=\"text-align:right;\">"
            + _money(order["giftPackagingFee"])
            + "</td></tr>"
        )

    discount_row = ""
    if float(order.get("discountAmount") or 0) > 0:
        discount_row = (
            "<tr><td>Discount</td><td style=\"text-align:right;\">-"
            + _money(order["discountAmount"])
            + "</td></tr>"
        )

    html_body = f"""<!doctype html>
<html><body style="margin:0;padding:24px;background:#FAF7F2;font-family:Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E8DDD0;border-radius:12px;padding:28px;">
    <h1 style="margin:0 0 4px;font-size:22px;color:#2C2C2C;">Thank you, {name}!</h1>
    <p style="margin:0 0 20px;color:#7A7066;font-size:14px;">
      We&rsquo;ve received your order. Here are the details.
    </p>

    <p style="margin:0 0 20px;font-size:14px;color:#2C2C2C;">
      <strong>Order number:</strong>
      <span style="font-family:monospace;">{number}</span>
    </p>

    <table style="width:100%;border-collapse:collapse;font-size:14px;">{rows}</table>

    <table style="width:100%;margin-top:16px;font-size:14px;color:#7A7066;">
      <tr><td>Subtotal</td><td style="text-align:right;">{_money(order['subtotal'])}</td></tr>
      <tr><td>Shipping</td><td style="text-align:right;">{'Free' if float(order.get('shippingCost') or 0) == 0 else _money(order['shippingCost'])}</td></tr>
      {gift_fee_row}
      {discount_row}
      <tr><td style="padding-top:8px;border-top:1px solid #E8DDD0;color:#2C2C2C;"><strong>Total</strong></td>
          <td style="padding-top:8px;border-top:1px solid #E8DDD0;text-align:right;color:#C9A84C;"><strong>{_money(order['total'])}</strong></td></tr>
    </table>

    {gift_block}
    {payment_note}

    <p style="font-size:14px;color:#2C2C2C;margin-top:20px;">
      <strong>Delivering to</strong><br>
      <span style="color:#7A7066;">
        {order['shippingAddress']}<br>
        {order['shippingCity']} {order['shippingZipCode']}, {order['shippingCountry']}
      </span>
    </p>

    <p style="margin-top:24px;">
      <a href="{config.store_url}/account"
         style="display:inline-block;background:#C9A84C;color:#2C2C2C;text-decoration:none;
                padding:12px 22px;border-radius:8px;font-weight:bold;font-size:14px;">
        Track your order
      </a>
    </p>
    <p style="color:#7A7066;font-size:12px;">
      You&rsquo;ll need order number {number} and this email address.
    </p>
  </div>
</body></html>"""

    message = EmailMessage()
    message["Subject"] = f"Your Whip & Pour order {number}"
    message["From"] = formataddr((config.from_name, config.from_address))
    message["To"] = order["customerEmail"]
    message["Date"] = formatdate(localtime=True)
    message["Message-ID"] = make_msgid(domain=config.from_address.split("@")[-1] or None)
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    return message


def _build_admin_email(order: dict, items: list[dict], config: MailConfig) -> EmailMessage:
    """Short internal notification so the studio knows an order landed."""
    summary = "\n".join(
        f"  {i['quantity']} x {i['productName']} ({i.get('size') or 'Standard'})" for i in items
    )
    body = (
        f"New order {order['orderNumber']}\n\n"
        f"Customer: {order.get('customerName') or ''} <{order['customerEmail']}>\n"
        f"Phone:    {order.get('customerPhone') or '—'}\n"
        f"Total:    {_money(order['total'])} ({order['paymentMethod']}, payment {order['paymentStatus']})\n"
        f"Gift wrap: {'YES — handwritten card required' if order.get('giftPackaging') else 'no'}\n\n"
        f"Items:\n{summary}\n\n"
        f"Deliver to:\n  {order['shippingAddress']}\n"
        f"  {order['shippingCity']} {order['shippingZipCode']}, {order['shippingCountry']}\n"
    )
    if order.get("giftPackaging") and order.get("giftCardMessage"):
        body += f'\nCard message: "{order["giftCardMessage"]}"\n'

    message = EmailMessage()
    message["Subject"] = f"New order {order['orderNumber']} — {_money(order['total'])}"
    message["From"] = formataddr((config.from_name, config.from_address))
    message["To"] = config.admin_address
    message["Date"] = formatdate(localtime=True)
    message.set_content(body)
    return message


def send_order_confirmation(order: dict, items: list[dict], *, block: bool = False) -> bool:
    """
    Email the customer their order confirmation, and notify the studio.

    Returns True only when SMTP is configured AND the customer's message was
    accepted by the server. When it is not configured this logs a warning and
    returns False — it never raises, and never claims a send that did not happen.

    Runs on a background thread by default so a slow or unreachable mail server
    cannot delay the checkout response. Pass `block=True` in tests.
    """
    config = MailConfig()

    if not config.configured:
        logger.warning(
            "Order %s: confirmation email NOT sent (%s). "
            "Set SMTP_* in backend/.env to enable.",
            order.get("orderNumber"),
            config.describe_missing(),
        )
        return False

    def deliver() -> bool:
        ok = _send(_build_order_email(order, items, config), config)
        if config.admin_address:
            _send(_build_admin_email(order, items, config), config)
        return ok

    if block:
        return deliver()

    threading.Thread(
        target=deliver, name=f"mail-{order.get('orderNumber')}", daemon=True
    ).start()
    # Queued, not delivered — the caller must not report this as "sent".
    return True


def mail_status() -> dict:
    """Whether email is configured, for the admin panel and the checkout UI."""
    config = MailConfig()
    return {
        "configured": config.configured,
        "detail": config.describe_missing(),
        "host": config.host if config.configured else None,
        "fromAddress": config.from_address if config.configured else None,
        "notifiesAdmin": bool(config.admin_address) if config.configured else False,
    }
