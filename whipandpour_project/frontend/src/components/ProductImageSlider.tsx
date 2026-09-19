import { useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { FreeMode, Navigation, Thumbs } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';

interface ProductImageSliderProps {
  images: string[];
  productName: string;
}

export default function ProductImageSlider({ images, productName }: ProductImageSliderProps) {
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);

  return (
    <div className="product-image-slider">
      {/* Main Image Slider */}
      <Swiper
        modules={[FreeMode, Navigation, Thumbs]}
        navigation
        thumbs={{ swiper: thumbsSwiper }}
        className="main-swiper"
      >
        {images.map((image, index) => (
          <SwiperSlide key={index}>
            <div className="relative bg-[#F5F0E8] rounded-lg overflow-hidden aspect-square">
              <img
                src={image}
                alt={`${productName} - ${index + 1}`}
                className="w-full h-full object-cover hover:scale-110 transition-transform duration-300"
                onError={(e) => {
                  e.currentTarget.src = '/images/products/dessert-jar-1.svg';
                }}
              />
            </div>
          </SwiperSlide>
        ))}
      </Swiper>

      {/* Thumbnail Slider */}
      <Swiper
        modules={[FreeMode, Navigation, Thumbs]}
        onSwiper={setThumbsSwiper}
        slidesPerView={images.length > 3 ? 4 : images.length}
        freeMode
        watchSlidesProgress
        className="thumbs-swiper mt-4"
      >
        {images.map((image, index) => (
          <SwiperSlide key={index}>
            <div className="cursor-pointer rounded-lg overflow-hidden border-2 border-transparent hover:border-[#C9A84C] transition-all">
              <img
                src={image}
                alt={`${productName} thumbnail ${index + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = '/images/products/dessert-jar-1.svg';
                }}
              />
            </div>
          </SwiperSlide>
        ))}
      </Swiper>

      <style>{`
        .product-image-slider {
          width: 100%;
        }

        /* Swiper core styles */
        .swiper {
          margin-left: auto;
          margin-right: auto;
          position: relative;
          overflow: hidden;
          list-style: none;
          padding: 0;
          z-index: 1;
        }
        .swiper-wrapper {
          position: relative;
          width: 100%;
          height: 100%;
          z-index: 1;
          display: flex;
          transition-property: transform;
          box-sizing: content-box;
        }
        .swiper-slide {
          flex-shrink: 0;
          width: 100%;
          height: 100%;
          position: relative;
          transition-property: transform;
        }
        .swiper-button-next,
        .swiper-button-prev {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          z-index: 10;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #C9A84C;
          width: 44px;
          height: 44px;
          background: rgba(255,255,255,0.9);
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          transition: all 0.3s ease;
        }
        .swiper-button-next { right: 10px; }
        .swiper-button-prev { left: 10px; }
        .swiper-button-next:hover,
        .swiper-button-prev:hover {
          background: #C9A84C;
          color: white;
        }
        .swiper-button-next::after,
        .swiper-button-prev::after {
          font-family: swiper-icons;
          font-size: 18px;
          font-weight: bold;
        }
        .swiper-button-disabled {
          opacity: 0.35;
          cursor: auto;
          pointer-events: none;
        }

        .main-swiper {
          width: 100%;
          border-radius: 12px;
          overflow: hidden;
        }

        .thumbs-swiper {
          width: 100%;
        }
        .thumbs-swiper .swiper-slide {
          opacity: 0.6;
          cursor: pointer;
          transition: opacity 0.3s ease;
          height: 80px;
        }
        .thumbs-swiper .swiper-slide-thumb-active {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
