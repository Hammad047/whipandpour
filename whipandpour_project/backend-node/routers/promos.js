/**
 * routers/promos.js — Promo code validation.
 * Node port of routers/promos.py.
 * Mirrors: promos.validate
 */

const { PromoCode } = require("../db");
const { money } = require("../money");

function serializePromo(p) {
  return {
    id: p.id,
    code: p.code,
    discountType: p.discountType,
    value: money(p.value),
    usageLimit: p.usageLimit,
    usedCount: p.usedCount,
    expiryDate: p.expiryDate ? new Date(p.expiryDate).toISOString() : null,
    isActive: Boolean(p.isActive),
    applicableCategory: p.applicableCategory,
    minOrderAmount: p.minOrderAmount != null ? money(p.minOrderAmount) : "0.00",
    firstOrderOnly: Boolean(p.firstOrderOnly),
    createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : null,
  };
}

async function promosValidate(code) {
  const promo = await PromoCode.findOne({ where: { code: code.toUpperCase(), isActive: true } });
  if (!promo) return null;

  if (promo.expiryDate && new Date(promo.expiryDate) < new Date()) return null;
  if (promo.usageLimit != null && (promo.usedCount || 0) >= promo.usageLimit) return null;

  return serializePromo(promo);
}

module.exports = { serializePromo, promosValidate };
