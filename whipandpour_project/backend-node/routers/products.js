/**
 * routers/products.js — Product query handlers.
 * Node port of routers/products.py.
 * Mirrors: products.list, products.featured, products.bestsellers, products.bySlug, products.byId
 */

const { Op } = require("sequelize");
const { Product, CATEGORIES } = require("../db");
const { money } = require("../money");

function serializeProduct(p) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    category: p.category,
    price: money(p.price),
    stock: p.stock,
    images: typeof p.images === "string" ? JSON.parse(p.images) : p.images,
    scentNotes: typeof p.scentNotes === "string" ? JSON.parse(p.scentNotes) : p.scentNotes,
    burnTime: p.burnTime,
    waxType: p.waxType,
    sizeOptions: typeof p.sizeOptions === "string" ? JSON.parse(p.sizeOptions) : p.sizeOptions,
    isFeatured: Boolean(p.isFeatured),
    isBestseller: Boolean(p.isBestseller),
    isLimitedEdition: Boolean(p.isLimitedEdition),
    isActive: Boolean(p.isActive),
    averageRating: money(p.averageRating),
    reviewCount: p.reviewCount,
    viewCount: p.viewCount,
    createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : null,
  };
}

async function productsList(opts = {}) {
  const { category, search, minPrice, maxPrice, limit = 12, offset = 0, sortBy } = opts;

  // Soft-deleted products stay in the database for order history but must
  // never appear in the storefront.
  const where = { isActive: true };
  if (category && category !== "all") where.category = category;

  if (search) {
    const term = `%${search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.like]: term } },
      { description: { [Op.like]: term } },
      { category: { [Op.like]: term } },
      { scentNotes: { [Op.like]: term } },
    ];
  }
  if (minPrice != null) where.price = { ...(where.price || {}), [Op.gte]: minPrice };
  if (maxPrice != null) where.price = { ...(where.price || {}), [Op.lte]: maxPrice };

  let order;
  if (sortBy === "price" || sortBy === "price-asc") order = [["price", "ASC"]];
  else if (sortBy === "price-desc") order = [["price", "DESC"]];
  else if (sortBy === "rating") order = [["averageRating", "DESC"]];
  else if (sortBy === "name") order = [["name", "ASC"]];
  else order = [["createdAt", "DESC"], ["id", "DESC"]]; // "newest" and any unknown value

  const results = await Product.findAll({ where, order, limit, offset });
  return results.map(serializeProduct);
}

function productsCategories() {
  // Category slugs and labels, so the frontend never hardcodes the list.
  return Object.entries(CATEGORIES).map(([value, label]) => ({ value, label }));
}

async function productsFeatured(limit = 12) {
  // Ordered newest-first so the selection is deterministic.
  const results = await Product.findAll({
    where: { isFeatured: true, isActive: true },
    order: [["createdAt", "DESC"], ["id", "DESC"]],
    limit,
  });
  return results.map(serializeProduct);
}

async function productsBestsellers(limit = 12) {
  const results = await Product.findAll({
    where: { isBestseller: true, isActive: true },
    order: [["createdAt", "DESC"], ["id", "DESC"]],
    limit,
  });
  return results.map(serializeProduct);
}

async function productsBySlug(slug) {
  const p = await Product.findOne({ where: { slug, isActive: true } });
  return p ? serializeProduct(p) : null;
}

async function productsById(productId) {
  const p = await Product.findOne({ where: { id: productId, isActive: true } });
  return p ? serializeProduct(p) : null;
}

module.exports = {
  serializeProduct, productsList, productsCategories,
  productsFeatured, productsBestsellers, productsBySlug, productsById,
};
