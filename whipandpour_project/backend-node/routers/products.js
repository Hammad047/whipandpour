/**
 * routers/products.js — Product query handlers.
 * Node port of routers/products.py.
 * Mirrors: products.list, products.featured, products.bestsellers, products.bySlug, products.byId
 */

const { Op } = require("sequelize");
const { Product, Collection, likeOp } = require("../db");
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
      { name: { [likeOp]: term } },
      { description: { [likeOp]: term } },
      { category: { [likeOp]: term } },
      { scentNotes: { [likeOp]: term } },
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

/** First usable URL out of a product's images column, or null. */
function firstImageOf(product) {
  let images = product.images;
  if (typeof images === "string") {
    try {
      images = JSON.parse(images);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(images)) return null;
  const found = images.find((url) => typeof url === "string" && url.trim());
  return found ? found.trim() : null;
}

async function productsCategories() {
  // Inactive collections are included so existing products still get a label;
  // the storefront filters them out of navigation and listings.
  const rows = await Collection.findAll({ order: [["sortOrder", "ASC"], ["label", "ASC"]] });

  // A representative photo per collection, so the storefront can show real
  // stock rather than a placeholder illustration. Drawn from active products
  // only — an inactive line should not be the face of a collection — and
  // newest-first, so the pick is deterministic and follows new arrivals.
  //
  // One query for every collection rather than one per collection: this is
  // called on every page load through useCollections().
  const products = await Product.findAll({
    where: { isActive: true },
    attributes: ["category", "images", "createdAt", "id"],
    order: [["createdAt", "DESC"], ["id", "DESC"]],
  });

  const stockImage = new Map();
  for (const product of products) {
    if (stockImage.has(product.category)) continue;
    const image = firstImageOf(product);
    if (image) stockImage.set(product.category, image);
  }

  return rows.map((c) => ({
    value: c.slug,
    label: c.label,
    description: c.description ?? null,
    coverImage: c.coverImage ?? null,
    // What the storefront should actually render: an admin-chosen cover wins,
    // otherwise a photo from the collection's own stock. Null only when the
    // collection has no active product carrying an image.
    image: c.coverImage ?? stockImage.get(c.slug) ?? null,
    isActive: Boolean(c.isActive),
  }));
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
