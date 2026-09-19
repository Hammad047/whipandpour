import { useEffect, useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination } from 'swiper/modules';
import { useLocation } from 'wouter';
import { Heart, ShoppingCart, X } from 'lucide-react';


interface Product {
  id: number;
  name: string;
  slug: string;
  price: number | string;
  category: 'signature' | 'premium';
  images: string[];
  averageRating: number | string;
  reviewCount: number;
}

export default function RecentlyViewedSlider() {
  const [, navigate] = useLocation();
  const [recentlyViewed, setRecentlyViewed] = useState<Product[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('recentlyViewed');
    if (stored) {
      try {
        setRecentlyViewed(JSON.parse(stored));
      } catch (error) {
        console.error('Failed to parse recently viewed:', error);
      }
    }
  }, []);

  if (recentlyViewed.length === 0) return null;

  const handleRemove = (productId: number) => {
    const updated = recentlyViewed.filter((p) => p.id !== productId);
    setRecentlyViewed(updated);
    localStorage.setItem('recentlyViewed', JSON.stringify(updated));
  };

  const getPrice = (p: Product) =>
    typeof p.price === 'number' ? p.price : parseFloat(String(p.price || 0));

  const getRating = (p: Product) =>
    typeof p.averageRating === 'number' ? p.averageRating : parseFloat(String(p.averageRating || 0));

  return (
    <div className="recently-viewed-section py-12 border-t border-[#E8DDD0]">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl md:text-4xl font-bold text-[#2C2C2C]"
          style={{ fontFamily: "'Playfair Display', serif" }}>
          Recently Viewed
        </h2>
        <button
          onClick={() => {
            setRecentlyViewed([]);
            localStorage.removeItem('recentlyViewed');
          }}
          className="text-sm text-[#999] hover:text-[#C9A84C] transition-colors"
        >
          Clear History
        </button>
      </div>

      <Swiper
        modules={[Navigation, Pagination]}
        navigation
        pagination={{ clickable: true }}
        loop={recentlyViewed.length > 4}
        breakpoints={{
          320: { slidesPerView: 1, spaceBetween: 20 },
          768: { slidesPerView: 2, spaceBetween: 20 },
          1024: { slidesPerView: 4, spaceBetween: 24 },
        }}
        className="recently-viewed-swiper"
      >
        {recentlyViewed.map((product) => (
          <SwiperSlide key={product.id}>
            {/* Use button instead of Link — avoids nested <a> hydration error */}
            <button
              onClick={() => navigate(`/product/${product.slug}`)}
              className="product-card group cursor-pointer w-full text-left relative"
            >
              {/* Close Button */}
              <span
                onClick={(e) => { e.stopPropagation(); handleRemove(product.id); }}
                className="absolute top-2 right-2 z-10 p-2 bg-white rounded-full hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
              >
                <X size={16} className="text-red-500" />
              </span>

              {/* Image Container */}
              <div className="relative overflow-hidden rounded-lg mb-4 bg-[#F5F0E8] aspect-square">
                <img
                  src={Array.isArray(product.images) ? product.images[0] : ''}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                  onError={(e) => {
                    e.currentTarget.src = '/images/products/dessert-jar-1.svg';
                  }}
                />

                {/* Overlay Actions */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100">
                  <span
                    className="p-3 bg-white rounded-full hover:bg-[#C9A84C] transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Heart size={20} className="text-[#2C2C2C]" />
                  </span>
                  <span
                    className="p-3 bg-[#C9A84C] rounded-full hover:bg-[#D4A5A5] transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ShoppingCart size={20} className="text-white" />
                  </span>
                </div>
              </div>

              {/* Product Info */}
              <h3 className="font-semibold text-[#2C2C2C] text-lg mb-2 group-hover:text-[#C9A84C] transition-colors">
                {product.name}
              </h3>

              {/* Rating */}
              <div className="flex items-center gap-2 mb-3">
                <div className="flex text-[#C9A84C]">
                  {'★'.repeat(Math.round(getRating(product)))}
                  {'☆'.repeat(5 - Math.round(getRating(product)))}
                </div>
                <span className="text-xs text-[#999]">({product.reviewCount})</span>
              </div>

              {/* Price */}
              <p className="text-xl font-bold text-[#C9A84C]">
                PKR {getPrice(product).toLocaleString()}
              </p>
            </button>
          </SwiperSlide>
        ))}
      </Swiper>

      <style>{`
        .recently-viewed-section { width: 100%; }
        /* Swiper core */
        .swiper { position: relative; overflow: hidden; list-style: none; padding: 0; z-index: 1; margin: 0 auto; }
        .swiper-wrapper { position: relative; width: 100%; height: 100%; z-index: 1; display: flex; transition-property: transform; box-sizing: content-box; }
        .swiper-slide { flex-shrink: 0; width: 100%; height: 100%; position: relative; transition-property: transform; }
        .swiper-button-next, .swiper-button-prev {
          position: absolute; top: 35%; z-index: 10; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #C9A84C; width: 45px; height: 45px;
          background: #F5F0E8; border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s ease;
        }
        .swiper-button-next { right: 0; }
        .swiper-button-prev { left: 0; }
        .swiper-button-next:hover, .swiper-button-prev:hover { background: #C9A84C; color: white; }
        .swiper-button-next::after, .swiper-button-prev::after { font-family: swiper-icons; font-size: 18px; font-weight: bold; }
        .swiper-button-disabled { opacity: 0.35; cursor: auto; pointer-events: none; }
        .swiper-pagination { position: absolute; text-align: center; z-index: 10; bottom: 0; }
        .swiper-pagination-bullet { width: 8px; height: 8px; display: inline-block; border-radius: 50%; background: #D4A5A5; opacity: 0.5; margin: 0 4px; cursor: pointer; }
        .swiper-pagination-bullet-active { background: #C9A84C; opacity: 1; }
        .recently-viewed-swiper { width: 100%; padding: 20px 0 50px; }
        .product-card { transition: transform 0.3s ease; }
        .product-card:hover { transform: translateY(-5px); }
      `}</style>
    </div>
  );
}
