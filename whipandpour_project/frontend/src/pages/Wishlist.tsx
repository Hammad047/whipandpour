import { useMemo } from 'react';
import { useLocation } from 'wouter';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { ShoppingCart, ArrowRight, Heart, Loader2, CreditCard } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import { useWishlist } from '@/contexts/WishlistContext';
import { useCart } from '@/contexts/CartContext';
import { trpc } from '@/lib/trpc';
import { formatPrice, toNumber } from '@/const';

/**
 * My Wishlist.
 *
 * Saved product ids come from WishlistContext; the products themselves are
 * re-fetched from the API so prices, stock and images are never stale, and a
 * product that has since been deleted or hidden simply drops out of the list.
 *
 * The previous version held `useState<Product[]>([])` and never loaded
 * anything, so this page always rendered the empty state — and nothing in the
 * app ever passed `onToggleWishlist` to ProductCard, so the heart button on
 * every other page did nothing at all.
 */
export default function Wishlist() {
  const [, navigate] = useLocation();
  const { ids, remove, clear, count } = useWishlist();
  const { addItem } = useCart();

  const { data: products = [], isLoading } = trpc.products.list.useQuery(
    { limit: 200, offset: 0 },
    { enabled: count > 0 }
  );

  // Keep the shopper's ordering (most recently saved first) and silently drop
  // anything no longer purchasable.
  const items = useMemo(
    () =>
      ids
        .map((id) => products.find((p: any) => p.id === id))
        .filter((p: any): p is any => Boolean(p)),
    [ids, products]
  );

  const unavailable = count - items.length;
  const inStock = items.filter((p: any) => p.stock > 0);
  const total = inStock.reduce((sum: number, p: any) => sum + toNumber(p.price), 0);

  const addOne = (product: any) => {
    const images = Array.isArray(product.images) ? product.images : [];
    const sizes = Array.isArray(product.sizeOptions) ? product.sizeOptions : [];
    addItem({
      id: nanoid(),
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      price: toNumber(product.price),
      quantity: 1,
      size: sizes[0]?.size ?? 'Standard',
      image: images[0] || '',
    });
  };

  const addAllToCart = () => {
    if (inStock.length === 0) {
      toast.error('Nothing in your wishlist is in stock right now');
      return false;
    }
    inStock.forEach(addOne);
    toast.success(
      `${inStock.length} item${inStock.length > 1 ? 's' : ''} moved to your cart`
    );
    return true;
  };

  /** Move everything in stock to the cart, then go straight to checkout. */
  const checkoutAll = () => {
    if (addAllToCart()) navigate('/checkout');
  };

  if (count === 0) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] py-20">
        <div className="container text-center">
          <Heart size={44} className="mx-auto text-[#D4A5A5] mb-5" />
          <h1
            className="text-4xl font-bold text-[#2C2C2C] mb-4"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            My Wishlist
          </h1>
          <p className="text-xl text-[#7A7066] mb-8">
            Your wishlist is empty — tap the heart on any candle to save it here.
          </p>
          <button
            onClick={() => navigate('/shop')}
            className="inline-flex items-center gap-2 px-8 py-3 bg-[#C9A84C] text-[#2C2C2C] rounded-lg font-semibold hover:bg-[#D4A5A5] transition-colors"
          >
            Start Shopping
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2] py-12">
      <div className="container">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h1
              className="text-4xl font-bold text-[#2C2C2C] mb-1"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              My Wishlist
            </h1>
            <p className="text-[#7A7066]">
              {count} saved {count === 1 ? 'candle' : 'candles'}
              {inStock.length > 0 && <> · {formatPrice(total)} for everything in stock</>}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                clear();
                toast.success('Wishlist cleared');
              }}
              className="px-4 py-2.5 border border-[#E8DDD0] bg-white text-[#7A7066] rounded-xl font-semibold text-sm hover:border-[#C9A84C] transition-colors"
            >
              Clear all
            </button>
            <button
              onClick={addAllToCart}
              disabled={inStock.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#C9A84C] text-[#2C2C2C] rounded-xl font-semibold text-sm hover:bg-[#FAF7F2] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShoppingCart size={16} />
              Add all to cart
            </button>
            <button
              onClick={checkoutAll}
              disabled={inStock.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#2C2C2C] text-[#FAF7F2] rounded-xl font-semibold text-sm hover:bg-[#C9A84C] hover:text-[#2C2C2C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CreditCard size={16} />
              Checkout ({inStock.length})
            </button>
          </div>
        </div>

        {unavailable > 0 && (
          <p className="mb-6 text-sm text-[#7A7066] bg-white border border-[#E8DDD0] rounded-xl p-4">
            {unavailable} saved {unavailable === 1 ? 'item is' : 'items are'} no longer
            available and {unavailable === 1 ? 'has' : 'have'} been left out.
          </p>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-[#7A7066]">
            <Loader2 className="animate-spin mr-2" size={18} /> Loading your saved candles…
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {items.map((product: any) => (
              <div key={product.id} className="relative">
                <ProductCard
                  product={product}
                  onToggleWishlist={() => remove(product.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
