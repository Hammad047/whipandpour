/**
 * routers/cart.js — Cart handlers.
 * Node port of routers/cart.py.
 * Mirrors: cart.get, cart.add, cart.update, cart.clear
 */

const { Cart } = require("../db");
const { TRPCError } = require("../auth");

function parseItems(itemsRaw) {
  if (typeof itemsRaw === "string") {
    try {
      return JSON.parse(itemsRaw);
    } catch {
      return [];
    }
  }
  return Array.isArray(itemsRaw) ? itemsRaw : [];
}

function serializeCart(cart) {
  return {
    id: cart.id,
    userId: cart.userId,
    items: parseItems(cart.items),
    createdAt: cart.createdAt ? new Date(cart.createdAt).toISOString() : null,
    updatedAt: cart.updatedAt ? new Date(cart.updatedAt).toISOString() : null,
  };
}

async function cartGet(userId) {
  const cart = await Cart.findOne({ where: { userId } });
  return cart ? serializeCart(cart) : { id: null, userId, items: [] };
}

async function cartAdd(userId, productId, quantity, size) {
  let cart = await Cart.findOne({ where: { userId } });

  if (!cart) {
    const newItems = JSON.stringify([{ productId, quantity, size }]);
    cart = await Cart.create({ userId, items: newItems });
  } else {
    const items = parseItems(cart.items);
    const existing = items.find((i) => i.productId === productId && i.size === size);
    if (existing) {
      existing.quantity += quantity;
    } else {
      items.push({ productId, quantity, size });
    }
    cart.items = JSON.stringify(items);
    await cart.save();
  }
  return { success: true };
}

async function cartUpdate(userId, productId, quantity, size) {
  const cart = await Cart.findOne({ where: { userId } });
  if (!cart) throw new TRPCError("Cart not found", "NOT_FOUND");

  const items = parseItems(cart.items);
  const idx = items.findIndex((i) => i.productId === productId && i.size === size);

  if (idx !== -1) {
    if (quantity === 0) items.splice(idx, 1);
    else items[idx].quantity = quantity;
  }

  cart.items = JSON.stringify(items);
  await cart.save();
  return { success: true };
}

async function cartClear(userId) {
  const cart = await Cart.findOne({ where: { userId } });
  if (cart) {
    cart.items = JSON.stringify([]);
    await cart.save();
  }
  return { success: true };
}

module.exports = { cartGet, cartAdd, cartUpdate, cartClear };
