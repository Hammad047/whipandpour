import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import { trpc } from '@/lib/trpc';
import { CATEGORIES, categoryLabel, formatPrice } from '@/const';
import { useSEO } from '@/hooks/useSEO';

type SortBy = 'newest' | 'price-asc' | 'price-desc' | 'rating' | 'name';

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
  { value: 'name', label: 'Name (A–Z)' },
];

const PRICE_BANDS: { label: string; range: [number, number] }[] = [
  { label: 'Under PKR 1,000', range: [0, 1000] },
  { label: 'PKR 1,000 – 2,000', range: [1000, 2000] },
  { label: 'PKR 2,000 – 3,000', range: [2000, 3000] },
  { label: 'Over PKR 3,000', range: [3000, 1000000] },
];

const PRICE_FLOOR = 0;
const PRICE_CEILING = 6000;

export default function Shop() {
  const [location, navigate] = useLocation();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [minPrice, setMinPrice] = useState<number>(PRICE_FLOOR);
  const [maxPrice, setMaxPrice] = useState<number>(PRICE_CEILING);
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [filtersOpen, setFiltersOpen] = useState(false);

  /**
   * wouter's `location` is the pathname only — it never contains the query
   * string. Read `window.location.search` instead, and re-run whenever the
   * location changes so navbar links like /shop?category=cupcake apply.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextCategory = params.get('category');
    const nextSearch = params.get('search');
    setCategory(
      nextCategory && CATEGORIES.some((c) => c.value === nextCategory) ? nextCategory : 'all'
    );
    setSearch(nextSearch ?? '');
  }, [location]);

  // Debounce the search box so a query isn't fired on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: products = [], isLoading, isError } = trpc.products.list.useQuery({
    limit: 200,
    offset: 0,
    category: category === 'all' ? undefined : category,
    search: debouncedSearch.trim() || undefined,
    minPrice,
    maxPrice,
    sortBy,
  });

  const selectCategory = (value: string) => {
    setCategory(value);
    // Keep the URL shareable and in sync with the visible filter.
    navigate(value === 'all' ? '/shop' : `/shop?category=${value}`, { replace: true });
  };

  const clearAll = () => {
    setSearch('');
    setMinPrice(PRICE_FLOOR);
    setMaxPrice(PRICE_CEILING);
    setSortBy('newest');
    selectCategory('all');
  };

  const activeFilterCount = useMemo(
    () =>
      (category !== 'all' ? 1 : 0) +
      (search.trim() ? 1 : 0) +
      (minPrice !== PRICE_FLOOR || maxPrice !== PRICE_CEILING ? 1 : 0),
    [category, search, minPrice, maxPrice]
  );

  const heading = category === 'all' ? 'Shop Our Collection' : categoryLabel(category);

  useSEO({
    title: category === 'all' ? 'Shop Dessert Candles' : `${categoryLabel(category)} — Shop`,
    description:
      category === 'all'
        ? 'Browse handcrafted dessert candles — cheesecake, cupcake, iced latte, dessert jar candles and wax melts — with nationwide delivery in Pakistan.'
        : `Shop ${categoryLabel(category)} — handcrafted, poured in small batches, with nationwide delivery in Pakistan.`,
  });

  const priceControls = (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="max-price" className="text-sm font-semibold text-[#2C2C2C]">
            Maximum price
          </label>
          <span className="text-sm font-bold text-[#C9A84C]">{formatPrice(maxPrice)}</span>
        </div>
        <input
          id="max-price"
          type="range"
          min={PRICE_FLOOR}
          max={PRICE_CEILING}
          step={100}
          value={Math.min(maxPrice, PRICE_CEILING)}
          onChange={(e) => {
            const next = Number(e.target.value);
            setMaxPrice(next);
            if (next < minPrice) setMinPrice(PRICE_FLOOR);
          }}
          className="w-full accent-[#C9A84C]"
        />
        <div className="flex justify-between text-xs text-[#7A7066] mt-1">
          <span>{formatPrice(PRICE_FLOOR)}</span>
          <span>{formatPrice(PRICE_CEILING)}+</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRICE_BANDS.map((band) => {
          const active = minPrice === band.range[0] && maxPrice === band.range[1];
          return (
            <button
              key={band.label}
              onClick={() => {
                if (active) {
                  setMinPrice(PRICE_FLOOR);
                  setMaxPrice(PRICE_CEILING);
                } else {
                  setMinPrice(band.range[0]);
                  setMaxPrice(band.range[1]);
                }
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                active
                  ? 'bg-[#C9A84C] text-[#2C2C2C] border-[#C9A84C]'
                  : 'bg-white text-[#7A7066] border-[#E8DDD0] hover:border-[#C9A84C]'
              }`}
            >
              {band.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Header */}
      <div className="bg-white border-b border-[#E8DDD0] py-8">
        <div className="container">
          <h1
            className="text-4xl md:text-5xl font-bold text-[#2C2C2C] mb-2"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {heading}
          </h1>
          <p className="text-lg text-[#7A7066]">
            Handcrafted dessert candles, poured in small batches
          </p>
        </div>
      </div>

      <div className="container py-8 md:py-10">
        {/* Category pills — replaces the old sidebar column */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-5 -mx-1 px-1">
          <button
            onClick={() => selectCategory('all')}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
              category === 'all'
                ? 'bg-[#2C2C2C] text-[#FAF7F2] border-[#2C2C2C]'
                : 'bg-white text-[#2C2C2C] border-[#E8DDD0] hover:border-[#C9A84C]'
            }`}
          >
            All Products
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => selectCategory(cat.value)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                category === cat.value
                  ? 'bg-[#2C2C2C] text-[#FAF7F2] border-[#2C2C2C]'
                  : 'bg-white text-[#2C2C2C] border-[#E8DDD0] hover:border-[#C9A84C]'
              }`}
            >
              {cat.icon} {cat.short}
            </button>
          ))}
        </div>

        {/* Search + sort toolbar */}
        <div className="flex flex-col md:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7A7066] pointer-events-none"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, scent or collection…"
              aria-label="Search products"
              className="w-full pl-11 pr-10 py-3 bg-white border border-[#E8DDD0] rounded-xl text-[#2C2C2C] placeholder-[#7A7066] focus:outline-none focus:ring-2 focus:ring-[#C9A84C] text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#7A7066] hover:text-[#2C2C2C]"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            aria-label="Sort products"
            className="px-4 py-3 bg-white border border-[#E8DDD0] rounded-xl text-sm text-[#2C2C2C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C] md:w-56"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => setFiltersOpen((open) => !open)}
            className="md:hidden flex items-center justify-center gap-2 px-4 py-3 bg-white border border-[#E8DDD0] rounded-xl text-sm font-semibold text-[#2C2C2C]"
          >
            <SlidersHorizontal size={16} />
            Price
            {activeFilterCount > 0 && (
              <span className="bg-[#C9A84C] text-[#2C2C2C] rounded-full px-2 text-xs">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Price filter — inline on desktop, collapsible on mobile */}
        <div
          className={`bg-white border border-[#E8DDD0] rounded-xl p-4 md:p-5 mb-6 ${
            filtersOpen ? 'block' : 'hidden md:block'
          }`}
        >
          {priceControls}
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <p className="text-[#7A7066] text-sm">
            {isLoading ? (
              'Loading products…'
            ) : (
              <>
                Showing <span className="font-semibold text-[#2C2C2C]">{products.length}</span>{' '}
                {products.length === 1 ? 'product' : 'products'}
                {category !== 'all' && <> in {categoryLabel(category)}</>}
                {debouncedSearch.trim() && <> for “{debouncedSearch.trim()}”</>}
              </>
            )}
          </p>
          {activeFilterCount > 0 && (
            <button
              onClick={clearAll}
              className="text-sm font-semibold text-[#C9A84C] hover:text-[#D4A5A5] transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>

        {/* Grid */}
        {isError ? (
          <div className="text-center py-16">
            <p className="text-lg text-[#2C2C2C] mb-2">We couldn’t load the products.</p>
            <p className="text-sm text-[#7A7066]">
              Please check your connection and refresh the page.
            </p>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-lg h-96 animate-pulse border border-[#E8DDD0]"
              />
            ))}
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.map((product: any) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <span className="text-5xl mb-4 block">🕯️</span>
            <p className="text-lg text-[#2C2C2C] mb-2">No products match your filters.</p>
            <p className="text-sm text-[#7A7066] mb-6">
              Try a different search term, or widen the price range.
            </p>
            <button
              onClick={clearAll}
              className="px-6 py-2.5 bg-[#C9A84C] text-[#2C2C2C] rounded-lg font-semibold hover:bg-[#D4A5A5] transition-colors"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
