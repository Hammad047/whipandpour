export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Product categories — the single source of truth for the frontend.
 *
 * `value` must match the SAEnum in backend/database.py (CATEGORIES). Adding or
 * renaming a category means changing both, plus migrating existing rows.
 */
export const CATEGORIES = [
  { value: "dessert-jar", label: "Dessert Jar Candles", short: "Dessert Jars", icon: "\u{1F36E}" },
  { value: "cupcake",     label: "Cupcake Candles",     short: "Cupcakes",     icon: "\u{1F9C1}" },
  { value: "iced-latte",  label: "Iced Latte Candles",  short: "Iced Lattes",  icon: "\u{1F9CB}" },
  { value: "cheesecake",  label: "Cheesecake Candles",  short: "Cheesecakes",  icon: "\u{1F370}" },
  { value: "wax-melts",   label: "Wax Melts",           short: "Wax Melts",    icon: "\u{2728}" },
] as const;

export type CategoryValue = (typeof CATEGORIES)[number]["value"];

export type CollectionOption = {
  value: string;
  label: string;
  icon?: string;
  short?: string;
  description?: string | null;
  coverImage?: string | null;
  isActive?: boolean;
};

// Collections are admin-managed. Until the API responds, the built-in list
// stands in; useCollections() replaces it with the live list.
let collectionOptions: CollectionOption[] = [...CATEGORIES];

export const setCollectionOptions = (rows: CollectionOption[]) => {
  collectionOptions = rows;
};

export const getCollectionOptions = (): CollectionOption[] => collectionOptions;

/** Human label for a collection slug, falling back to the raw value. */
export const categoryLabel = (value?: string | null): string =>
  (value && collectionOptions.find((c) => c.value === value)?.label) || value || "";

/**
 * The API sends money and ratings as strings ("2800.00"). Parse defensively —
 * a `typeof x === "number"` check always falls through to the else branch.
 */
export const toNumber = (value: unknown): number => {
  const n = parseFloat(String(value ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/** Must match FREE_SHIPPING_THRESHOLD / SHIPPING_FLAT_RATE in backend-node/routers/orders.js. */
export const FREE_SHIPPING_THRESHOLD = 4000;
export const SHIPPING_FLAT_RATE = 200;

/** Store currency is Pakistani Rupees. Never render a $ amount. */
export const formatPrice = (value: unknown): string =>
  `PKR ${toNumber(value).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

/**
 * Display-only "was / now" merchandising price. The number actually charged
 * (product.price, and everything derived from it in cart/checkout/orders) is
 * never touched — this only computes a higher struck-through "compare at"
 * price to show alongside today's real price with a matching discount badge.
 */
export const DISPLAY_DISCOUNT_PERCENT = 20;

export const compareAtPrice = (value: unknown): number =>
  toNumber(value) / (1 - DISPLAY_DISCOUNT_PERCENT / 100);

// Generate login URL safely — returns empty string if env vars are missing
// (this project uses its own local auth, no external OAuth needed)
export const getLoginUrl = (): string => {
  try {
    const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
    const appId = import.meta.env.VITE_APP_ID;
    if (!oauthPortalUrl || !appId) return '';
    const redirectUri = `${window.location.origin}/api/oauth/callback`;
    const state = btoa(redirectUri);
    const url = new URL(`${oauthPortalUrl}/app-auth`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");
    return url.toString();
  } catch {
    return '';
  }
};
