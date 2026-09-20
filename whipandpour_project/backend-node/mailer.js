/**
 * mailer.js — transactional email over SMTP, via nodemailer.
 * Node port of mailer.py — same env vars, same email content.
 *
 * Configured for Hostinger by default, since that is where this store's DNS
 * and mailbox live. Set these in backend-node/.env:
 *
 *   SMTP_HOST=smtp.hostinger.com
 *   SMTP_PORT=465                       # 465 = implicit SSL, 587 = STARTTLS
 *   SMTP_USER=owner@whipandpour.com    # the full mailbox address
 *   SMTP_PASSWORD=...                   # that mailbox's password
 *   MAIL_FROM=owner@whipandpour.com    # must match SMTP_USER on Hostinger
 *   MAIL_FROM_NAME=Whip & Pour
 *   MAIL_ADMIN=owner@whipandpour.com   # optional: copy of every new order
 *   MAIL_ENABLED=true                   # set false to disable without unsetting creds
 *
 * If SMTP is not configured, nothing is sent and nothing pretends otherwise.
 * sendOrderConfirmation resolves false, the failure is logged, and the order
 * is still created — email must never be able to fail a checkout.
 */

const nodemailer = require("nodemailer");

const DEFAULT_HOST = "smtp.hostinger.com";
const DEFAULT_PORT = 465;
const SEND_TIMEOUT_MS = 20_000;

function loadConfig() {
  const enabled = !["false", "0", "no"].includes(
    (process.env.MAIL_ENABLED || "true").trim().toLowerCase()
  );
  const host = (process.env.SMTP_HOST || DEFAULT_HOST).trim();
  const port = Number(process.env.SMTP_PORT || DEFAULT_PORT);
  const user = (process.env.SMTP_USER || "").trim();
  const password = process.env.SMTP_PASSWORD || "";
  const fromAddress = (process.env.MAIL_FROM || user || "").trim();
  const fromName = (process.env.MAIL_FROM_NAME || "Whip & Pour").trim();
  const adminAddress = (process.env.MAIL_ADMIN || "").trim();
  const storeUrl = (process.env.STORE_URL || "https://whipandpour.com").replace(/\/$/, "");
  // Escape hatch for a trusted local relay that offers no STARTTLS. Never
  // enable this against a remote mail server.
  const allowInsecure = ["true", "1", "yes"].includes(
    (process.env.MAIL_ALLOW_INSECURE || "").trim().toLowerCase()
  );

  const configured = Boolean(enabled && host && user && password && fromAddress);

  function describeMissing() {
    if (!enabled) return "MAIL_ENABLED is false";
    const missing = [];
    if (!host) missing.push("SMTP_HOST");
    if (!user) missing.push("SMTP_USER");
    if (!password) missing.push("SMTP_PASSWORD");
    if (!fromAddress) missing.push("MAIL_FROM");
    return missing.length ? `missing ${missing.join(", ")}` : "configured";
  }

  return { enabled, host, port, user, password, fromAddress, fromName, adminAddress, storeUrl, allowInsecure, configured, describeMissing };
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return `PKR ${value}`;
  return `PKR ${Math.round(n).toLocaleString("en-PK")}`;
}

async function sendOne(mailOptions, config) {
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      // Port 465 = implicit SSL. Otherwise use STARTTLS if offered; refuse to
      // send credentials in the clear unless MAIL_ALLOW_INSECURE is set for a
      // trusted local relay.
      secure: config.port === 465,
      requireTLS: config.port !== 465 && !config.allowInsecure,
      auth: { user: config.user, pass: config.password },
      connectionTimeout: SEND_TIMEOUT_MS,
      greetingTimeout: SEND_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
    });
    await transporter.sendMail(mailOptions);
    console.log(`[mailer] Sent "${mailOptions.subject}" to ${mailOptions.to}`);
    return true;
  } catch (err) {
    // A mail failure must never surface to the shopper as a failed order.
    console.error(`[mailer] Failed to send "${mailOptions.subject}" to ${mailOptions.to}:`, err.message);
    return false;
  }
}

function buildOrderEmail(order, items, config) {
  const number = order.orderNumber;
  const name = (order.customerName || "there").split(" ")[0];

  const lines = [
    `Hi ${name},`, "",
    "Thank you for your order from Whip & Pour.", "",
    `Order number: ${number}`,
    `Placed:       ${String(order.createdAt || "").slice(0, 10)}`,
    "", "What you ordered", "----------------",
  ];
  for (const item of items) {
    lines.push(
      `  ${item.quantity} x ${item.productName} (${item.size || "Standard"})` +
      ` — ${money(item.lineTotal || item.unitPrice)}`
    );
  }

  lines.push(
    "",
    `Subtotal:  ${money(order.subtotal)}`,
    `Shipping:  ${Number(order.shippingCost || 0) === 0 ? "Free" : money(order.shippingCost)}`
  );
  if (Number(order.giftPackagingFee || 0) > 0) lines.push(`Gift wrap: ${money(order.giftPackagingFee)}`);
  if (Number(order.discountAmount || 0) > 0) {
    const code = order.promoCode || "";
    lines.push(`Discount${code ? ` (${code})` : ""}: -${money(order.discountAmount)}`);
  }
  lines.push(
    `Total:     ${money(order.total)}`, "",
    "Delivery", "--------",
    `  ${order.shippingAddress}`,
    `  ${order.shippingCity} ${order.shippingZipCode}, ${order.shippingCountry}`,
    "", "Payment", "-------",
    `  Method: ${order.paymentMethod}`,
    `  Status: ${order.paymentStatus}`
  );

  // State the payment position plainly — never imply money has been received.
  if (order.paymentStatus !== "completed") {
    if (order.paymentMethod === "cod") {
      lines.push(`  Please have ${money(order.total)} ready for the courier on delivery.`);
    } else {
      lines.push("  We have not received payment yet. Our team will contact you with instructions.");
    }
  }

  if (order.giftPackaging) {
    lines.push("", "Gift packaging", "--------------", "  Your order will arrive gift-boxed with a handwritten card.");
    if (order.giftCardMessage) lines.push(`  Card message: "${order.giftCardMessage}"`);
  }

  lines.push(
    "", `Track your order: ${config.storeUrl}/account`,
    `(You'll need order number ${number} and this email address.)`,
    "", "Thank you,", "Whip & Pour"
  );
  const textBody = lines.join("\n");

  const rows = items.map((item) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #E8DDD0;">
        <strong style="color:#2C2C2C;">${item.productName}</strong><br>
        <span style="color:#7A7066;font-size:13px;">${item.size || "Standard"} · Qty ${item.quantity}</span>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #E8DDD0;text-align:right;color:#2C2C2C;white-space:nowrap;">
        ${money(item.lineTotal || item.unitPrice)}
      </td>
    </tr>`).join("");

  let paymentNote = "";
  if (order.paymentStatus !== "completed") {
    const note = order.paymentMethod === "cod"
      ? `Please have ${money(order.total)} ready for the courier on delivery.`
      : "We have not received payment yet — our team will contact you with instructions.";
    paymentNote = `<p style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:12px;color:#92400E;font-size:14px;">${note}</p>`;
  }

  let giftBlock = "";
  if (order.giftPackaging) {
    let messageHtml = "";
    if (order.giftCardMessage) {
      messageHtml = `<p style="margin:8px 0 0;font-style:italic;color:#2C2C2C;">&ldquo;${order.giftCardMessage}&rdquo;</p>`;
    }
    giftBlock = `<div style="background:#FAF7F2;border:1px solid #C9A84C;border-radius:8px;padding:12px;margin:16px 0;">
      <strong style="color:#C9A84C;font-size:12px;letter-spacing:1px;">GIFT PACKAGING INCLUDED</strong>${messageHtml}</div>`;
  }

  const giftFeeRow = Number(order.giftPackagingFee || 0) > 0
    ? `<tr><td>Gift packaging</td><td style="text-align:right;">${money(order.giftPackagingFee)}</td></tr>` : "";
  const discountRow = Number(order.discountAmount || 0) > 0
    ? `<tr><td>Discount</td><td style="text-align:right;">-${money(order.discountAmount)}</td></tr>` : "";

  const htmlBody = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#FAF7F2;font-family:Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E8DDD0;border-radius:12px;padding:28px;">
    <h1 style="margin:0 0 4px;font-size:22px;color:#2C2C2C;">Thank you, ${name}!</h1>
    <p style="margin:0 0 20px;color:#7A7066;font-size:14px;">We&rsquo;ve received your order. Here are the details.</p>
    <p style="margin:0 0 20px;font-size:14px;color:#2C2C2C;">
      <strong>Order number:</strong> <span style="font-family:monospace;">${number}</span>
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table>
    <table style="width:100%;margin-top:16px;font-size:14px;color:#7A7066;">
      <tr><td>Subtotal</td><td style="text-align:right;">${money(order.subtotal)}</td></tr>
      <tr><td>Shipping</td><td style="text-align:right;">${Number(order.shippingCost || 0) === 0 ? "Free" : money(order.shippingCost)}</td></tr>
      ${giftFeeRow}
      ${discountRow}
      <tr><td style="padding-top:8px;border-top:1px solid #E8DDD0;color:#2C2C2C;"><strong>Total</strong></td>
          <td style="padding-top:8px;border-top:1px solid #E8DDD0;text-align:right;color:#C9A84C;"><strong>${money(order.total)}</strong></td></tr>
    </table>
    ${giftBlock}
    ${paymentNote}
    <p style="font-size:14px;color:#2C2C2C;margin-top:20px;">
      <strong>Delivering to</strong><br>
      <span style="color:#7A7066;">${order.shippingAddress}<br>${order.shippingCity} ${order.shippingZipCode}, ${order.shippingCountry}</span>
    </p>
    <p style="margin-top:24px;">
      <a href="${config.storeUrl}/account" style="display:inline-block;background:#C9A84C;color:#2C2C2C;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;font-size:14px;">Track your order</a>
    </p>
    <p style="color:#7A7066;font-size:12px;">You&rsquo;ll need order number ${number} and this email address.</p>
  </div>
</body></html>`;

  return {
    from: `"${config.fromName}" <${config.fromAddress}>`,
    to: order.customerEmail,
    subject: `Your Whip & Pour order ${number}`,
    text: textBody,
    html: htmlBody,
  };
}

function buildAdminEmail(order, items, config) {
  const summary = items.map((i) => `  ${i.quantity} x ${i.productName} (${i.size || "Standard"})`).join("\n");
  let body =
    `New order ${order.orderNumber}\n\n` +
    `Customer: ${order.customerName || ""} <${order.customerEmail}>\n` +
    `Phone:    ${order.customerPhone || "—"}\n` +
    `Total:    ${money(order.total)} (${order.paymentMethod}, payment ${order.paymentStatus})\n` +
    `Gift wrap: ${order.giftPackaging ? "YES — handwritten card required" : "no"}\n\n` +
    `Items:\n${summary}\n\n` +
    `Deliver to:\n  ${order.shippingAddress}\n` +
    `  ${order.shippingCity} ${order.shippingZipCode}, ${order.shippingCountry}\n`;
  if (order.giftPackaging && order.giftCardMessage) {
    body += `\nCard message: "${order.giftCardMessage}"\n`;
  }

  return {
    from: `"${config.fromName}" <${config.fromAddress}>`,
    to: config.adminAddress,
    subject: `New order ${order.orderNumber} — ${money(order.total)}`,
    text: body,
  };
}

/**
 * Email the customer their order confirmation, and notify the studio.
 *
 * Resolves true only when SMTP is configured AND accepted the message.
 * Fires in the background by default (never awaited by the caller) so a
 * slow/unreachable mail server cannot delay the checkout response. Pass
 * `block: true` to await it directly (e.g. in tests).
 */
async function sendOrderConfirmation(order, items, { block = false } = {}) {
  const config = loadConfig();

  if (!config.configured) {
    console.warn(
      `[mailer] Order ${order.orderNumber}: confirmation email NOT sent (${config.describeMissing()}). ` +
      "Set SMTP_* in backend-node/.env to enable."
    );
    return false;
  }

  const deliver = async () => {
    const ok = await sendOne(buildOrderEmail(order, items, config), config);
    if (config.adminAddress) await sendOne(buildAdminEmail(order, items, config), config);
    return ok;
  };

  if (block) return deliver();

  deliver().catch((err) => console.error("[mailer] background send failed:", err));
  // Queued, not delivered — the caller must not report this as "sent".
  return true;
}

function mailStatus() {
  const config = loadConfig();
  return {
    configured: config.configured,
    detail: config.describeMissing(),
    host: config.configured ? config.host : null,
    fromAddress: config.configured ? config.fromAddress : null,
    notifiesAdmin: config.configured ? Boolean(config.adminAddress) : false,
  };
}

module.exports = { sendOrderConfirmation, mailStatus };
