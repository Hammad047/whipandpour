/**
 * routers/wishlist.js — Wishlist handlers.
 * Node port of routers/wishlist.py.
 * Mirrors: wishlist.list, wishlist.add, wishlist.remove
 */

const { Wishlist, Product } = require("../db");
const { serializeProduct } = require("./products");

function serializeWishlistItem(w) {
  return {
    id: w.id,
    userId: w.userId,
    productId: w.productId,
    createdAt: w.createdAt ? new Date(w.createdAt).toISOString() : null,
  };
}

async function wishlistList(userId) {
  // Return wishlist items with full product details embedded.
  const items = await Wishlist.findAll({ where: { userId } });
  const result = [];
  for (const item of items) {
    const row = serializeWishlistItem(item);
    const product = await Product.findByPk(item.productId);
    if (product) row.product = serializeProduct(product);
    result.push(row);
  }
  return result;
}

async function wishlistAdd(userId, productId) {
  const existing = await Wishlist.findOne({ where: { userId, productId } });
  if (existing) return { success: true };

  await Wishlist.create({ userId, productId });
  return { success: true };
}

async function wishlistRemove(userId, productId) {
  await Wishlist.destroy({ where: { userId, productId } });
  return { success: true };
}

module.exports = { wishlistList, wishlistAdd, wishlistRemove };
