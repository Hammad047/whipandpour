import { Heart, ShoppingCart } from 'lucide-react';
import { useLocation } from 'wouter';
import { useCart } from '@/contexts/CartContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { toast } from 'sonner';
import type { Product } from '@/types';
import { nanoid } from 'nanoid';
import { categoryLabel, compareAtPrice, DISPLAY_DISCOUNT_PERCENT, formatPrice, toNumber } from '@/const';

interface ProductCardProps {
  product: Product;
  onAddToCart?: () => void;
  /** Optional hook for callers that need to react (e.g. the wishlist page). */
  onToggleWishlist?: () => void;
}

export default function ProductCard({
  product,
  onAddToCart,
  onToggleWishlist,
}: ProductCardProps) {
  const [, navigate] = useLocation();
  const { addItem } = useCart();
  // Wishlist state comes from the shared context, not a prop that callers
  // forgot to pass — previously the heart rendered but did nothing anywhere
  // except the wishlist page itself.
  const { has, toggle } = useWishlist();
  const isInWishlist = has(product.id);
  const images = Array.isArray(product.images) ? product.images : [];
  const scentNotes = Array.isArray(product.scentNotes) ? product.scentNotes : [];

  const sizeOptions = Array.isArray(product.sizeOptions) ? product.sizeOptions : [];
  const defaultSize = sizeOptions[0]?.size ?? 'Standard';
  const rating = toNumber(product.averageRating);

  const handleAddToCart = () => {
    addItem({
      id: nanoid(),
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      price: toNumber(product.price),
      quantity: 1,
      // Use the product's own first size, not a hardcoded one that may not exist.
      size: defaultSize,
      image: images[0] || '',
    });
    onAddToCart?.();
  };

  return (
    <div className="group bg-white rounded-lg overflow-hidden border border-[#E8DDD0] hover:shadow-lg transition-shadow duration-300 animate-fadeIn">
      {/* Image Container */}
      <div
        className="relative h-64 bg-gradient-to-br from-[#FAF7F2] to-[#E8DDD0] overflow-hidden cursor-pointer"
        onClick={() => navigate(`/product/${product.slug}`)}
      >
        {images.length > 0 ? (
          <img
            src={images[0]}
            alt={product.name}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.src = `/images/products/${product.category}-1.svg`;
            }}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-[#C9A84C] text-4xl">🕯️</span>
          </div>
        )}

        {/* Category Badge */}
        <div className="absolute top-3 left-3">
          <span className="inline-block px-3 py-1 bg-[#2C2C2C]/85 text-[#FAF7F2] text-xs font-semibold rounded-full backdrop-blur-sm">
            {categoryLabel(product.category)}
          </span>
        </div>

        {/* Limited Edition Badge */}
        {product.isLimitedEdition && (
          <div className="absolute top-3 right-3">
            <span className="inline-block px-3 py-1 bg-[#D4A5A5] text-white text-xs font-semibold rounded-full">
              Limited
            </span>
          </div>
        )}

        {/* Wishlist Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            const added = toggle(product.id);
            toast.success(
              added ? `${product.name} saved to your wishlist` : `${product.name} removed from your wishlist`
            );
            onToggleWishlist?.();
          }}
          className="absolute bottom-3 right-3 p-2 bg-white rounded-full shadow-md hover:bg-[#FAF7F2] transition-colors"
          aria-label={isInWishlist ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
          title={isInWishlist ? "Remove from wishlist" : "Save to wishlist"}
        >
          <Heart
            size={18}
            className={isInWishlist ? 'fill-[#D4A5A5] text-[#D4A5A5]' : 'text-[#C9A84C]'}
          />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Name */}
        <h3
          className="text-lg font-semibold text-[#2C2C2C] mb-1 cursor-pointer hover:text-[#C9A84C] transition-colors"
          onClick={() => navigate(`/product/${product.slug}`)}
        >
          {product.name}
        </h3>

        {/* Scent Notes */}
        {scentNotes.length > 0 && (
          <p className="text-xs text-[#7A7066] mb-3">
            {scentNotes.slice(0, 2).join(', ')}
            {scentNotes.length > 2 && '...'}
          </p>
        )}

        {/* Rating */}
        {rating > 0 && (
          <div className="flex items-center gap-1 mb-3">
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <span
                  key={i}
                  className={`text-xs ${i < Math.round(rating) ? 'text-[#C9A84C]' : 'text-[#E8DDD0]'}`}
                >
                  ★
                </span>
              ))}
            </div>
            <span className="text-xs text-[#7A7066]">
              {rating.toFixed(1)} ({product.reviewCount})
            </span>
          </div>
        )}

        {/* Price */}
        <div className="flex items-center justify-between mb-4">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-2xl font-bold text-[#C9A84C]">
              {formatPrice(product.price)}
            </span>
            <span className="text-sm text-[#7A7066] line-through">
              {formatPrice(compareAtPrice(product.price))}
            </span>
            <span className="text-[10px] font-bold text-white bg-[#D4A5A5] rounded-full px-2 py-0.5">
              {DISPLAY_DISCOUNT_PERCENT}% OFF
            </span>
          </span>
          {product.stock < 10 && product.stock > 0 && (
            <span className="text-xs text-[#D4A5A5] font-semibold">
              Only {product.stock} left
            </span>
          )}
          {product.stock === 0 && (
            <span className="text-xs text-[#D4A5A5] font-semibold">Out of Stock</span>
          )}
        </div>

        {/* Add to Cart Button */}
        <button
          onClick={handleAddToCart}
          disabled={product.stock === 0}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#C9A84C] text-[#2C2C2C] rounded-lg font-medium hover:bg-[#D4A5A5] transition-colors disabled:bg-[#E8DDD0] disabled:text-[#7A7066] disabled:cursor-not-allowed"
        >
          <ShoppingCart size={16} />
          Add to Cart
        </button>
      </div>
    </div>
  );
}
