/**
 * routers/stripeRouter.js — Stripe checkout session creation and retrieval.
 * Node port of routers/stripe_router.py.
 * Mirrors: stripe.createCheckoutSession, stripe.getSession
 */

const Stripe = require("stripe");
const { TRPCError } = require("../auth");

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";
  return new Stripe(key);
}

async function stripeCreateCheckoutSession(opts) {
  const {
    user, cartItems, subtotal, shippingCost, discountAmount, promoCode,
    shippingAddress, shippingCity, shippingState, shippingZipCode, shippingCountry,
    customerEmail, customerPhone, origin,
  } = opts;

  const stripe = stripeClient();
  const total = subtotal + shippingCost - discountAmount;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: cartItems.map((item) => ({
        price_data: {
          currency: "usd",
          product_data: { name: item.productName, metadata: { size: item.size || "" } },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      })),
      mode: "payment",
      success_url: `${origin}/checkout?success=true`,
      cancel_url: `${origin}/checkout?canceled=true`,
      customer_email: customerEmail,
      metadata: {
        userId: String(user.id),
        customerEmail,
        customerName: user.name || "Customer",
        shippingAddress, shippingCity,
        shippingState: shippingState || "",
        shippingZipCode, shippingCountry,
        customerPhone: customerPhone || "",
        promoCode: promoCode || "",
        subtotal: String(subtotal),
        shippingCost: String(shippingCost),
        discountAmount: String(discountAmount),
        total: String(total),
        cartItems: JSON.stringify(cartItems),
      },
    });
    return { sessionId: session.id, url: session.url };
  } catch (err) {
    throw new TRPCError(`Failed to create checkout session: ${err.message}`, "INTERNAL_SERVER_ERROR");
  }
}

async function stripeGetSession(sessionId) {
  const stripe = stripeClient();
  try {
    return await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    throw new TRPCError(`Failed to retrieve session: ${err.message}`, "INTERNAL_SERVER_ERROR");
  }
}

module.exports = { stripeCreateCheckoutSession, stripeGetSession };
