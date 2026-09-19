import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';

interface Product {
  id: number;
  name: string;
  slug: string;
  category: string;
  price: number;
  images: string[];
  scentNotes?: string[];
  isBestseller?: boolean;
  isLimitedEdition?: boolean;
}

interface InfiniteProductScrollerProps {
  products: Product[];
  title?: string;
  subtitle?: string;
  speed?: number; // pixels per second, default 60
}


export default function InfiniteProductScroller({
  products,
  title = 'Our Collection',
  subtitle = 'Handcrafted candles made with love',
  speed = 60,
}: InfiniteProductScrollerProps) {
  const [, navigate] = useLocation();
  const trackRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const positionRef = useRef(0);
  const pausedRef = useRef(false);
  const [isHovered, setIsHovered] = useState(false);

  // Render nothing rather than falling back to hardcoded products: the old
  // FALLBACK_PRODUCTS list referenced discontinued items and dead image URLs.
  const displayProducts = products;

  // Duplicate the list so the scroll loops seamlessly
  const doubled = [...displayProducts, ...displayProducts, ...displayProducts];

  const CARD_WIDTH = 280; // px
  const GAP = 24; // px
  const ITEM_WIDTH = CARD_WIDTH + GAP;
  const loopAt = ITEM_WIDTH * displayProducts.length;

  useEffect(() => {
    let lastTime: number | null = null;

    const animate = (timestamp: number) => {
      if (lastTime === null) lastTime = timestamp;
      const delta = timestamp - lastTime;
      lastTime = timestamp;

      if (!pausedRef.current && trackRef.current) {
        positionRef.current += (speed * delta) / 1000;
        if (positionRef.current >= loopAt) {
          positionRef.current -= loopAt;
        }
        trackRef.current.style.transform = `translateX(-${positionRef.current}px)`;
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [speed, loopAt]);

  useEffect(() => {
    pausedRef.current = isHovered;
  }, [isHovered]);

  const getPrice = (p: Product) => {
    const n = typeof p.price === 'number' ? p.price : parseFloat(String(p.price || 0));
    return n.toLocaleString();
  };

  const getImage = (p: Product) => {
    const imgs = Array.isArray(p.images) ? p.images : [];
    return imgs[0] || '/images/products/photo-1546039907-7fa05f864c02.jpg';
  };

  return (
    <section className="py-20 bg-[#FAF7F2] overflow-hidden">
      {/* Section Header */}
      <div className="text-center mb-12 px-4">
        <p className="text-xs font-bold tracking-[0.3em] text-[#C9A84C] uppercase mb-3">
          — Explore —
        </p>
        <h2
          className="text-4xl md:text-5xl font-bold text-[#2C2C2C] mb-4"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          {title}
        </h2>
        <p className="text-[#7A7066] text-lg">{subtitle}</p>
        <div className="h-0.5 w-20 bg-gradient-to-r from-[#C9A84C] to-[#D4A5A5] rounded mx-auto mt-5" />
      </div>

      {/* Gradient fade edges */}
      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-r from-[#FAF7F2] to-transparent pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-l from-[#FAF7F2] to-transparent pointer-events-none" />

        {/* Scrolling track */}
        <div
          className="overflow-hidden cursor-grab active:cursor-grabbing"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div
            ref={trackRef}
            className="flex will-change-transform"
            style={{ gap: `${GAP}px`, paddingLeft: `${GAP}px` }}
          >
            {doubled.map((product, idx) => (
              <button
                key={`${product.id}-${idx}`}
                onClick={() => navigate(`/product/${product.slug}`)}
                className="flex-shrink-0 group text-left focus:outline-none"
                style={{ width: `${CARD_WIDTH}px` }}
              >
                {/* Card */}
                <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-[#E8DDD0] hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  {/* Image */}
                  <div className="relative overflow-hidden h-64 bg-[#F5EFE8]">
                    <img
                      src={getImage(product)}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          '/images/products/photo-1546039907-7fa05f864c02.jpg';
                      }}
                    />
                    {/* Badges */}
                    <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                      {product.isBestseller && (
                        <span className="px-2.5 py-1 bg-[#C9A84C] text-[#2C2C2C] text-[10px] font-bold rounded-full uppercase tracking-wider shadow">
                          ⭐ Bestseller
                        </span>
                      )}
                      {product.isLimitedEdition && (
                        <span className="px-2.5 py-1 bg-[#2C2C2C] text-white text-[10px] font-bold rounded-full uppercase tracking-wider shadow">
                          Limited
                        </span>
                      )}
                    </div>
                    {/* Category chip */}
                    <div className="absolute bottom-3 right-3">
                      <span
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                          product.category === 'premium'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {product.category === 'premium' ? '👑 Premium' : '🕯️ Signature'}
                      </span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4">
                    <h3 className="font-bold text-[#2C2C2C] text-base mb-1 group-hover:text-[#C9A84C] transition-colors truncate">
                      {product.name}
                    </h3>
                    {product.scentNotes && product.scentNotes.length > 0 && (
                      <p className="text-xs text-[#7A7066] mb-3 truncate">
                        {product.scentNotes.slice(0, 2).join(' · ')}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <p className="text-lg font-bold text-[#C9A84C]">
                        PKR {getPrice(product)}
                      </p>
                      <div className="w-8 h-8 rounded-full bg-[#FAF7F2] border border-[#E8DDD0] flex items-center justify-center group-hover:bg-[#C9A84C] group-hover:border-[#C9A84C] transition-all">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="group-hover:text-[#2C2C2C] text-[#7A7066]">
                          <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="text-center mt-10">
        <button
          onClick={() => navigate('/shop')}
          className="inline-flex items-center gap-2 px-8 py-3.5 bg-[#2C2C2C] text-white rounded-xl font-semibold hover:bg-[#C9A84C] hover:text-[#2C2C2C] transition-all duration-300 text-sm tracking-wide"
        >
          View All Products
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </section>
  );
}
