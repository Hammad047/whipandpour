/**
 * money.js — precise decimal arithmetic for order totals, matching Python's
 * Decimal behavior exactly.
 *
 * Python's `Decimal.quantize(Decimal("0.01"))` (used throughout orders.py)
 * rounds half-to-even ("banker's rounding") by default. decimal.js defaults
 * to round-half-up. Left unconfigured, the two backends would compute a
 * different total on any calculation that lands exactly on a .xx5 boundary —
 * a one-cent discrepancy, but on money, in a system with two backend
 * implementations that must agree. Configured to match here.
 */

const Decimal = require("decimal.js");

Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN });

/** Round to 2 decimal places (cents), same rounding rule as Python's quantize. */
function q2(value) {
  return new Decimal(value).toDecimalPlaces(2);
}

/**
 * Format a raw DB value as a fixed 2dp money string. SQLite doesn't enforce
 * DECIMAL's fixed precision the way MySQL does, so Sequelize can hand back
 * "1950" instead of "1950.00" there — this keeps the API's money fields
 * formatted the same regardless of which database is behind it.
 */
function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : String(value);
}

module.exports = { Decimal, q2, money };
