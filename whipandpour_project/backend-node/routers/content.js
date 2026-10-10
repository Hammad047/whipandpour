/**
 * routers/content.js — Admin-editable homepage content.
 * Mirrors: content.homepage, admin.content.updateHomepage
 *
 * One row (key "homepage") in site_settings holds every editable field as
 * JSON, so adding a new field is a code change, never a migration.
 */

const { SiteSetting } = require("../db");
const { TRPCError } = require("../auth");

const HOMEPAGE_KEY = "homepage";

// Shown until an admin saves real content — same copy the page always had,
// so a fresh install (or a save that omits a field) never looks broken.
const DEFAULT_HOMEPAGE_CONTENT = {
  heroImage: "/images/products/photo-1486427944299-d1955d23e34d.jpg",
  heroEyebrow: "✦ Handcrafted Dessert Candles",
  heroHeading: "Scents That Speak to the Soul",
  heroParagraph:
    "From our hands to your home — fragrances that uplift, inspire, and create a sense of belonging. Made with love, crafted with care.",
  storyImage: "/images/products/photo-1565958011703-44f9829ba187.jpg",
  storyHeading: "Candles That Feel Like Home",
  storyParagraph1:
    "Curate your space with our Signature Candles made with 100% pure soy wax and timeless fragrances. Each candle is hand-poured with intention, blending art and science to create moments of peace and warmth.",
  storyParagraph2:
    "We believe that the right scent can transform a space, elevate a mood, and create lasting memories. That's why we're committed to using only the finest ingredients and sustainable practices.",
  badgeNumber: "100%",
  badgeLabel: "Natural Soy Wax",
};

async function contentHomepage() {
  const row = await SiteSetting.findByPk(HOMEPAGE_KEY);
  if (!row) return DEFAULT_HOMEPAGE_CONTENT;

  try {
    // Merge over the defaults so an older save missing a newly-added field
    // still returns something sensible for it, instead of undefined.
    return { ...DEFAULT_HOMEPAGE_CONTENT, ...JSON.parse(row.value) };
  } catch {
    return DEFAULT_HOMEPAGE_CONTENT;
  }
}

async function adminContentUpdateHomepage(data) {
  if (!data || typeof data !== "object") {
    throw new TRPCError("Content data is required", "BAD_REQUEST");
  }

  const next = { ...DEFAULT_HOMEPAGE_CONTENT };
  for (const field of Object.keys(DEFAULT_HOMEPAGE_CONTENT)) {
    if (typeof data[field] === "string" && data[field].trim()) {
      next[field] = data[field].trim().slice(0, 2000);
    }
  }

  await SiteSetting.upsert({ key: HOMEPAGE_KEY, value: JSON.stringify(next), updatedAt: new Date() });
  return next;
}

module.exports = { DEFAULT_HOMEPAGE_CONTENT, contentHomepage, adminContentUpdateHomepage };
