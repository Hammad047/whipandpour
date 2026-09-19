import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { Heart, ShoppingCart, ArrowLeft, Minus, Plus, Loader2, CreditCard } from 'lucide-react';
import Breadcrumb from '@/components/Breadcrumb';
import ProductImageSlider from '@/components/ProductImageSlider';
import ReviewsList from '@/components/ReviewsList';
import ReviewForm from '@/components/ReviewForm';
import RecommendationsSlider from '@/components/RecommendationsSlider';
import RecentlyViewedSlider from '@/components/RecentlyViewedSlider';
import { trpc } from '@/lib/trpc';
import { useCart } from '@/contexts/CartContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { categoryLabel, compareAtPrice, DISPLAY_DISCOUNT_PERCENT, formatPrice, toNumber } from '@/const';
import { useSEO, useJsonLd } from '@/hooks/useSEO';

export default function ProductDetail({ params }: { params: { slug: string } }) {
  const [, navigate] = useLocation();
  const { addItem } = useCart();
  const [selectedSize, setSelectedSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const { has: inWishlist, toggle: toggleWishlist } = useWishlist();

  // Use wouter params first, fall back to URL parsing
  const slug = params?.slug || window.location.pathname.split('/product/').pop()?.split('/')[0] || '';

  // Fetch product by slug
  const { data: product, isLoading, error } = trpc.products.bySlug.useQuery(
    { slug },
    { enabled: !!slug }
  );

  // Fetch all products for recommendations
  const { data: allProducts = [] } = trpc.products.list.useQuery({
    limit: 200,
    offset: 0,
  });

  // Reviews come from the database for this product, not a hardcoded list.
  const { data: apiReviews = [] } = trpc.reviews.byProduct.useQuery(
    { productId: product?.id },
    { enabled: !!product?.id }
  );

  /**
   * Sizes come from the product's own `sizeOptions` column. They used to be a
   * hardcoded Small/Medium/Large list with fixed prices, so every product
   * showed the same three sizes at the same three prices regardless of what
   * was actually stored.
   */
  const sizes = useMemo(() => {
    const options = Array.isArray(product?.sizeOptions) ? product.sizeOptions : [];
    return options.filter((o: any) => o && o.size);
  }, [product]);

  // Pick the first available size once the product loads.
  useEffect(() => {
    if (sizes.length > 0 && !sizes.some((s: any) => s.size === selectedSize)) {
      setSelectedSize(sizes[0].size);
    }
  }, [sizes, selectedSize]);

  // Each size (220ml/300ml) has its own admin-set price — fall back to the
  // product's flat price only if it somehow has no sizes at all.
  const activeSizePrice = useMemo(() => {
    const match = sizes.find((s: any) => s.size === selectedSize);
    return match?.price != null ? toNumber(match.price) : toNumber(product?.price);
  }, [sizes, selectedSize, product]);

  const productImage = Array.isArray(product?.images) ? product.images[0] : undefined;
  const absoluteImage = productImage
    ? new URL(productImage, window.location.origin).toString()
    : undefined;

  useSEO({
    title: product ? `${product.name} — ${categoryLabel(product.category)}` : 'Product',
    description: product
      ? `${product.name}: ${String(product.description).slice(0, 155)}`
      : 'Handcrafted dessert candle from Whip&Pour.',
    image: absoluteImage,
  });

  useJsonLd(
    'product-jsonld',
    product
      ? {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.name,
          description: product.description,
          image: absoluteImage ? [absoluteImage] : undefined,
          sku: String(product.id),
          category: categoryLabel(product.category),
          offers: {
            '@type': 'Offer',
            priceCurrency: 'PKR',
            price: activeSizePrice.toFixed(2),
            availability:
              product.stock > 0
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
            url: window.location.href,
          },
          ...(toNumber(product.averageRating) > 0
            ? {
                aggregateRating: {
                  '@type': 'AggregateRating',
                  ratingValue: toNumber(product.averageRating).toFixed(1),
                  reviewCount: product.reviewCount || 1,
                },
              }
            : {}),
        }
      : null
  );

  const recommendedProducts = product
    ? allProducts
        .filter((p: any) => p.id !== product.id && p.category === product.category)
        .slice(0, 4)
    : [];

  const reviews = apiReviews.map((r: any) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName || 'Verified Customer',
    rating: r.rating,
    title: r.title || '',
    content: r.body || '',
    verifiedPurchase: Boolean(r.isVerifiedPurchase),
    helpful: r.helpful ?? 0,
    createdAt: r.createdAt,
  }));

  const addToCart = () => {
    if (!product) return false;
    if (product.stock <= 0) {
      toast.error('This product is out of stock');
      return false;
    }
    const images = Array.isArray(product.images) ? product.images : [];
    addItem({
      id: nanoid(),
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      price: activeSizePrice,
      quantity,
      size: selectedSize || 'Standard',
      image: images[0] || '',
    });
    return true;
  };

  const handleAddToCart = () => {
    if (addToCart()) {
      toast.success(`${quantity} × ${product!.name} added to your cart`);
    }
  };

  /** Add the item, then go straight to checkout. */
  const handleBuyNow = () => {
    if (addToCart()) navigate('/checkout');
  };

  /**
   * Go back to wherever the shopper came from, falling back to the shop when
   * this page was opened directly (a shared link, or a new tab).
   */
  const handleBack = () => {
    if (window.history.length > 1) window.history.back();
    else navigate('/shop');
  };

  const handleToggleWishlist = () => {
    if (!product) return;
    const added = toggleWishlist(product.id);
    toast.success(added ? 'Saved to your wishlist' : 'Removed from your wishlist');
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#C9A84C]" size={40} />
      </div>
    );
  }

  // Show error state
  if (error || !product) {
    return (
      <div className="min-h-screen bg-[#FAF7F2]">
        <div className="container py-12">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-[#2C2C2C] mb-4">Product Not Found</h1>
            <p className="text-lg text-[#666] mb-8">Sorry, we couldn't find the product you're looking for.</p>
            <button
              onClick={() => navigate('/shop')}
              className="px-8 py-3 bg-[#C9A84C] text-[#2C2C2C] rounded-lg font-semibold hover:bg-[#D4A5A5] transition-colors"
            >
              Back to Shop
            </button>
          </div>
        </div>
      </div>
    );
  }

  const images = Array.isArray(product.images) ? product.images : [];
  const scentNotes = Array.isArray(product.scentNotes) ? product.scentNotes : [];
  const rating = toNumber(product.averageRating);

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Back Button */}
      <div className="bg-white border-b border-[#E8DDD0] sticky top-0 z-40">
        <div className="container py-4">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-[#C9A84C] hover:text-[#D4A5A5] transition-colors font-semibold"
          >
            <ArrowLeft size={20} />
            Back
          </button>
        </div>
      </div>

      <div className="container py-12">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: 'Shop', href: '/shop' },
            { label: categoryLabel(product.category), href: `/shop?category=${product.category}` },
            { label: product.name },
          ]}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
          {/* Product Images */}
          <div>
            <ProductImageSlider images={images} productName={product.name} />
          </div>

          {/* Product Info */}
          <div>
            {/* Category Badge */}
            <div className="mb-4">
              <button
                onClick={() => navigate(`/shop?category=${product.category}`)}
                className="inline-block px-4 py-2 rounded-full bg-[#2C2C2C] text-[#FAF7F2] text-sm font-semibold hover:bg-[#C9A84C] hover:text-[#2C2C2C] transition-colors"
              >
                {categoryLabel(product.category)}
              </button>
            </div>

            {/* Title & Rating */}
            <h1 className="text-4xl font-bold text-[#2C2C2C] mb-4">{product.name}</h1>

            <div className="flex items-center gap-4 mb-6">
              <div className="flex text-[#C9A84C] text-2xl">
                {'★'.repeat(Math.round(rating))}
                {'☆'.repeat(5 - Math.round(rating))}
              </div>
              <span className="text-[#666]">
                {rating.toFixed(1)} ({product.reviewCount ?? 0} reviews)
              </span>
            </div>

            {/* Price */}
            <div className="mb-8">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-4xl font-bold text-[#C9A84C]">{formatPrice(activeSizePrice)}</p>
                <p className="text-lg text-[#999] line-through">{formatPrice(compareAtPrice(activeSizePrice))}</p>
                <span className="text-xs font-bold text-white bg-[#D4A5A5] rounded-full px-2.5 py-1">
                  {DISPLAY_DISCOUNT_PERCENT}% OFF
                </span>
              </div>
              <p className="text-sm text-[#999] mt-2">
                Free shipping on orders over {formatPrice(4000)}
              </p>
            </div>

            {/* Description */}
            <p className="text-lg text-[#666] mb-8 leading-relaxed">{product.description}</p>

            {/* Scent Notes */}
            {scentNotes.length > 0 && (
              <div className="mb-8">
                <h3 className="font-semibold text-[#2C2C2C] mb-3">Scent Profile</h3>
                <div className="flex flex-wrap gap-2">
                  {scentNotes.map((scent: string) => (
                    <span
                      key={scent}
                      className="px-4 py-2 bg-[#F5F0E8] text-[#2C2C2C] rounded-full text-sm font-medium"
                    >
                      {scent}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Size Selection */}
            {sizes.length > 0 && (
              <div className="mb-8">
                <h3 className="font-semibold text-[#2C2C2C] mb-3">Select Size</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {sizes.map((size: any) => (
                    <button
                      key={size.size}
                      onClick={() => setSelectedSize(size.size)}
                      className={`py-3 px-4 rounded-lg font-semibold transition-all ${
                        selectedSize === size.size
                          ? 'bg-[#C9A84C] text-[#2C2C2C] border-2 border-[#C9A84C]'
                          : 'bg-white border-2 border-[#E8DDD0] text-[#2C2C2C] hover:border-[#C9A84C]'
                      }`}
                    >
                      <div className="text-sm">{size.size}</div>
                      {size.ml > 0 && <div className="text-xs mt-1 opacity-80">{size.ml} ml</div>}
                      {size.price != null && (
                        <div className="text-xs mt-1 font-bold opacity-90">{formatPrice(size.price)}</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div className="mb-8">
              <h3 className="font-semibold text-[#2C2C2C] mb-3">Quantity</h3>
              <div className="flex items-center gap-4 w-fit bg-[#F5F0E8] rounded-lg p-2">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="p-2 hover:bg-white rounded transition-colors"
                >
                  <Minus size={18} />
                </button>
                <span className="font-semibold text-lg w-8 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="p-2 hover:bg-white rounded transition-colors"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            {/* Product Facts */}
            {(product.burnTime || product.waxType) && (
              <div className="mb-8 grid grid-cols-2 gap-4">
                {product.burnTime && (
                  <div className="bg-white border border-[#E8DDD0] rounded-lg p-4">
                    <p className="text-xs uppercase tracking-wide text-[#7A7066] mb-1">Burn time</p>
                    <p className="font-semibold text-[#2C2C2C]">{product.burnTime}</p>
                  </div>
                )}
                {product.waxType && (
                  <div className="bg-white border border-[#E8DDD0] rounded-lg p-4">
                    <p className="text-xs uppercase tracking-wide text-[#7A7066] mb-1">Wax</p>
                    <p className="font-semibold text-[#2C2C2C]">{product.waxType}</p>
                  </div>
                )}
              </div>
            )}

            {/* Stock Status */}
            <div className="mb-8">
              {product.stock > 0 ? (
                <p className="text-green-600 font-semibold">✓ In Stock ({product.stock} available)</p>
              ) : (
                <p className="text-red-600 font-semibold">Out of Stock</p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <button
                onClick={handleBuyNow}
                disabled={product.stock === 0}
                className="flex-1 py-4 bg-[#2C2C2C] text-[#FAF7F2] rounded-lg font-semibold hover:bg-[#C9A84C] hover:text-[#2C2C2C] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CreditCard size={20} />
                Checkout Now
              </button>
            </div>

            <div className="flex gap-4 mb-8">
              <button
                onClick={handleAddToCart}
                disabled={product.stock === 0}
                className="flex-1 py-4 bg-[#C9A84C] text-[#2C2C2C] rounded-lg font-semibold hover:bg-[#D4A5A5] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShoppingCart size={20} />
                Add to Cart
              </button>
              <button
                onClick={handleToggleWishlist}
                className={`py-4 px-6 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                  inWishlist(product.id)
                    ? 'bg-red-50 text-red-600 border-2 border-red-600'
                    : 'bg-white border-2 border-[#E8DDD0] text-[#2C2C2C] hover:border-[#C9A84C]'
                }`}
              >
                <Heart size={20} fill={inWishlist(product.id) ? 'currentColor' : 'none'} />
              </button>
            </div>

            {/* Info Tabs */}
            <div className="space-y-4 pt-8 border-t border-[#E8DDD0]">
              <div>
                <h4 className="font-semibold text-[#2C2C2C] mb-2">How to Use</h4>
                <p className="text-[#666] text-sm">
                  Trim wick to 1/4 inch before each use. Allow wax to melt completely on first burn to prevent tunneling. Keep away from drafts.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-[#2C2C2C] mb-2">Shipping</h4>
                <p className="text-[#666] text-sm">
                  Free shipping on orders over PKR 4,000. Standard delivery: 2-4 working days, nationwide.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Reviews Section */}
        <div className="mb-16">
          <ReviewsList
            productId={product.id}
            reviews={reviews}
            averageRating={rating}
            totalReviews={product.reviewCount ?? 0}
          />
        </div>

        {/* Write Review Form */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-[#2C2C2C] mb-8">Share Your Experience</h2>
          <ReviewForm productId={product.id} />
        </div>

        {/* Recommendations */}
        {recommendedProducts.length > 0 && (
          <RecommendationsSlider products={recommendedProducts} />
        )}

        {/* Recently Viewed */}
        <RecentlyViewedSlider />
      </div>
    </div>
  );
}
