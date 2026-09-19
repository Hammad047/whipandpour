import { useLocation } from 'wouter';
import { ChevronRight, Flame, Truck, Award, Heart, Gift, PenLine, Package, EyeOff } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatPrice, toNumber } from '@/const';
import InfiniteProductScroller from '@/components/InfiniteProductScroller';
import { useSEO } from '@/hooks/useSEO';

export default function Home() {
  const [, navigate] = useLocation();

  useSEO({
    title: 'Handcrafted Dessert Candles in Pakistan',
    description:
      'Whip&Pour makes handcrafted dessert-shaped candles — cheesecake, cupcake, iced latte and dessert jar candles — poured in small batches and delivered across Pakistan.',
  });

  const { data: products = [] } = trpc.products.list.useQuery({
    limit: 200,
    offset: 0,
  });

  // Gift packaging price comes from the backend so the homepage never quotes a
  // figure that differs from what checkout actually charges.
  const { data: gifting } = trpc.gifting.options.useQuery(undefined, { staleTime: 60_000 });
  const giftFee = toNumber(gifting?.packagingFee ?? 0);

  // Bestsellers are flagged on the product row, not inferred from a category.
  const bestSellers = products.filter((p: any) => p.isBestseller).slice(0, 4);

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Hero Section */}
      <section className="relative h-screen bg-[#111] overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://www.honeyimhomecandles.com/cdn/shop/files/Desktop_Hero_1.png?format=pjpg&v=1744109622&width=1900"
            alt="Luxury Candles"
            className="w-full h-full object-cover opacity-70"
            onError={(e) => {
              e.currentTarget.src = '/images/products/photo-1486427944299-d1955d23e34d.jpg';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-black/10" />
        </div>

        <div className="relative h-full flex items-center">
          <div className="container mx-auto px-4 md:px-8 max-w-7xl">
            <div className="max-w-2xl">
              <p className="text-xs font-bold tracking-[0.3em] text-[#C9A84C] uppercase mb-4">
                ✦ Handcrafted Dessert Candles
              </p>
              <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
                Scents That Speak to the Soul
              </h1>
              <p className="text-xl text-gray-200 mb-8 leading-relaxed">
                From our hands to your home — fragrances that uplift, inspire, and create a sense of belonging. Made with love, crafted with care.
              </p>
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={() => navigate('/shop')}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-[#C9A84C] text-[#2C2C2C] rounded-lg font-semibold hover:bg-[#D4A5A5] transition-all duration-300 transform hover:scale-105"
                >
                  Step Inside
                  <ChevronRight size={20} />
                </button>
                <button
                  onClick={() => {
                    document.getElementById('scroller-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="inline-flex items-center gap-2 px-8 py-4 border-2 border-white/50 text-white rounded-lg font-semibold hover:border-[#C9A84C] hover:text-[#C9A84C] transition-all duration-300"
                >
                  Browse Collection
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 border-2 border-white rounded-full flex items-start justify-center p-2">
            <div className="w-1 h-2 bg-white rounded-full animate-pulse" />
          </div>
        </div>
      </section>

      {/* ── Infinite Auto-Scrolling Product Slider ── */}
      <div id="scroller-section">
        <InfiniteProductScroller
          products={products as any}
          title="Our Collection"
          subtitle="Hover to pause · Click any card to explore"
          speed={55}
        />
      </div>

      {/* Best Sellers Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="text-center mb-16">
            <p className="text-xs font-bold tracking-[0.3em] text-[#C9A84C] uppercase mb-3">— Top Picks —</p>
            <h2 className="text-4xl md:text-5xl font-bold text-[#2C2C2C] mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
              Best Sellers
            </h2>
            <div className="h-1 w-24 bg-[#C9A84C] rounded mx-auto" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {bestSellers.map((product: any) => {
              const images = Array.isArray(product.images) ? product.images : [];
              return (
                <button
                  key={product.id}
                  onClick={() => navigate(`/product/${product.slug}`)}
                  className="group text-left w-full"
                >
                  <div className="relative overflow-hidden rounded-lg mb-4 bg-[#FAF7F2] h-80">
                    {images.length > 0 ? (
                      <img
                        src={images[0]}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        onError={(e) => {
                          e.currentTarget.src = `/images/products/${product.category}-1.svg`;
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-6xl">🕯️</span>
                      </div>
                    )}
                  </div>
                  <h3 className="text-xl font-semibold text-[#2C2C2C] mb-2 group-hover:text-[#C9A84C] transition-colors">
                    {product.name}
                  </h3>
                  <p className="text-sm text-[#7A7066] mb-3">
                    {Array.isArray(product.scentNotes) && product.scentNotes.length > 0
                      ? product.scentNotes.slice(0, 2).join(' & ')
                      : 'Luxury Scent'}
                  </p>
                  <p className="text-2xl font-bold text-[#C9A84C]">
                    {formatPrice(product.price)}
                  </p>
                </button>
              );
            })}
          </div>

          {bestSellers.length === 0 && (
            <div className="text-center py-12 text-[#7A7066]">
              <span className="text-5xl mb-4 block">🕯️</span>
              <p className="text-lg">Products loading... Add some from the Admin panel!</p>
            </div>
          )}
        </div>
      </section>

      {/* Brand Story Section */}
      <section className="py-20 bg-[#FAF7F2]">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-bold tracking-[0.3em] text-[#C9A84C] uppercase mb-4">— Our Story —</p>
              <h2 className="text-4xl md:text-5xl font-bold text-[#2C2C2C] mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>
                Candles That Feel Like Home
              </h2>
              <p className="text-lg text-[#666] mb-6 leading-relaxed">
                Curate your space with our Signature Candles made with 100% pure soy wax and timeless fragrances. Each candle is hand-poured with intention, blending art and science to create moments of peace and warmth.
              </p>
              <p className="text-lg text-[#666] mb-8 leading-relaxed">
                We believe that the right scent can transform a space, elevate a mood, and create lasting memories. That's why we're committed to using only the finest ingredients and sustainable practices.
              </p>
              <button
                onClick={() => navigate('/shop')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#C9A84C] text-[#2C2C2C] rounded-lg font-semibold hover:bg-[#D4A5A5] transition-colors"
              >
                Explore Collection
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1603808033192-082d6919d3e1?w=600&h=600&fit=crop"
                alt="Luxury Candle Setup"
                className="rounded-lg shadow-2xl"
                onError={(e) => {
                  e.currentTarget.src = '/images/products/photo-1565958011703-44f9829ba187.jpg';
                }}
              />
              {/* Floating badge */}
              <div className="absolute -bottom-6 -left-6 bg-white rounded-2xl shadow-xl p-5 border border-[#E8DDD0]">
                <p className="text-3xl font-bold text-[#C9A84C]">100%</p>
                <p className="text-sm text-[#7A7066] font-medium">Natural Soy Wax</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-white border-y border-[#E8DDD0]">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center group">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-[#FAF7F2] flex items-center justify-center group-hover:bg-[#C9A84C]/10 transition-colors">
                  <Flame className="text-[#C9A84C]" size={32} />
                </div>
              </div>
              <h3 className="font-bold text-[#2C2C2C] mb-2 text-lg">Premium Ingredients</h3>
              <p className="text-[#666] text-sm">100% soy wax with natural essential oils</p>
            </div>
            <div className="text-center group">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-[#FAF7F2] flex items-center justify-center group-hover:bg-[#D4A5A5]/10 transition-colors">
                  <Truck className="text-[#D4A5A5]" size={32} />
                </div>
              </div>
              <h3 className="font-bold text-[#2C2C2C] mb-2 text-lg">Free Shipping</h3>
              <p className="text-[#666] text-sm">On orders over PKR 5,000</p>
            </div>
            <div className="text-center group">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-[#FAF7F2] flex items-center justify-center group-hover:bg-[#C9A84C]/10 transition-colors">
                  <Heart className="text-[#C9A84C]" size={32} />
                </div>
              </div>
              <h3 className="font-bold text-[#2C2C2C] mb-2 text-lg">Handcrafted</h3>
              <p className="text-[#666] text-sm">Each candle made with love</p>
            </div>
            <div className="text-center group">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-[#FAF7F2] flex items-center justify-center group-hover:bg-[#D4A5A5]/10 transition-colors">
                  <Award className="text-[#D4A5A5]" size={32} />
                </div>
              </div>
              <h3 className="font-bold text-[#2C2C2C] mb-2 text-lg">Satisfaction Guaranteed</h3>
              <p className="text-[#666] text-sm">30-day money back guarantee</p>
            </div>
          </div>
        </div>
      </section>

      {/* Custom Gifting Section */}
      <section className="py-20 bg-gradient-to-r from-[#2C2C2C] to-[#1a1a1a] text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <img
            src="https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=1920&h=1080&fit=crop"
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="container mx-auto px-4 md:px-8 max-w-7xl relative z-10">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <p className="text-xs font-bold tracking-[0.3em] text-[#C9A84C] uppercase mb-4">— Bespoke Gifting —</p>
            <h2 className="text-4xl md:text-5xl font-bold mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>
              Custom Gifting, Made Easy
            </h2>
            <p className="text-xl text-gray-300">
              Add gift packaging at checkout and we&rsquo;ll box it, ribbon it and write your
              card by hand — {formatPrice(giftFee)} for the whole thing.
            </p>
          </div>

          {/* What's included — these are the real options offered at checkout */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
            {[
              {
                icon: Gift,
                title: 'Signature Gift Box',
                text: 'Rigid kraft box with satin ribbon and a wax seal — no extra wrapping needed.',
              },
              {
                icon: PenLine,
                title: 'Handwritten Card',
                text: 'Your message, written by hand on a cotton card and tucked inside the box.',
              },
              {
                icon: Package,
                title: 'Protective Packing',
                text: 'Tissue-wrapped and cushioned so it arrives exactly as it left the studio.',
              },
              {
                icon: EyeOff,
                title: 'Prices Hidden',
                text: 'The packing slip leaves out prices, so you can send it straight to them.',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm"
                >
                  <div className="w-11 h-11 rounded-lg bg-[#C9A84C]/20 flex items-center justify-center mb-4">
                    <Icon size={20} className="text-[#C9A84C]" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-300 leading-relaxed">{item.text}</p>
                </div>
              );
            })}
          </div>

          <div className="text-center">
            <button
              onClick={() => navigate('/shop')}
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#C9A84C] text-[#2C2C2C] rounded-lg font-semibold hover:bg-[#D4A5A5] transition-all duration-300 transform hover:scale-105"
            >
              Start a Gift
              <ChevronRight size={20} />
            </button>
            <p className="text-sm text-gray-400 mt-4">
              Planning a wedding, mehndi or corporate order?{' '}
              <button
                onClick={() => navigate('/contact')}
                className="text-[#C9A84C] underline underline-offset-2 hover:text-[#D4A5A5]"
              >
                Talk to us about bulk gifting
              </button>
              .
            </p>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="text-center mb-16">
            <p className="text-xs font-bold tracking-[0.3em] text-[#C9A84C] uppercase mb-3">— Happy Customers —</p>
            <h2 className="text-4xl md:text-5xl font-bold text-[#2C2C2C] mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
              What Our Customers Say
            </h2>
            <div className="h-1 w-24 bg-[#C9A84C] rounded mx-auto" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { name: 'Sarah Ahmed', location: 'Lahore', text: "I'm a candle hoarder and these are absolutely exceptional. MashAllah, you guys are doing amazing work!", rating: 5 },
              { name: 'Hassan Khan', location: 'Karachi', text: 'I bought the cheesecake candles as gifts and everyone was impressed. The packaging alone is worth it!', rating: 5 },
              { name: 'Fatima Hassan', location: 'Islamabad', text: 'These candles have transformed my meditation space. The scents are pure and natural-smelling. Best purchase!', rating: 5 },
            ].map((testimonial, index) => (
              <div key={index} className="bg-[#FAF7F2] p-8 rounded-2xl border border-[#E8DDD0] hover:shadow-lg transition-shadow">
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <span key={i} className="text-[#C9A84C] text-lg">★</span>
                  ))}
                </div>
                <p className="text-[#666] mb-6 leading-relaxed italic">"{testimonial.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#C9A84C] to-[#D4A5A5] flex items-center justify-center text-white font-bold text-sm">
                    {testimonial.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-[#2C2C2C] text-sm">{testimonial.name}</p>
                    <p className="text-xs text-[#7A7066]">{testimonial.location}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter Section */}
      <section className="py-20 bg-[#FAF7F2] border-t border-[#E8DDD0]">
        <div className="container mx-auto px-4 md:px-8 max-w-2xl">
          <div className="text-center">
            <p className="text-xs font-bold tracking-[0.3em] text-[#C9A84C] uppercase mb-3">— Stay in Touch —</p>
            <h2 className="text-4xl font-bold text-[#2C2C2C] mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
              Subscribe to Our Newsletter
            </h2>
            <p className="text-lg text-[#666] mb-8">
              Get exclusive offers, new product launches, and candle care tips delivered to your inbox.
            </p>
            <form
              onSubmit={(e) => e.preventDefault()}
              className="flex gap-3 flex-col sm:flex-row"
            >
              <input
                type="email"
                placeholder="Enter your email"
                className="flex-1 px-6 py-3 rounded-lg border border-[#E8DDD0] focus:outline-none focus:ring-2 focus:ring-[#C9A84C] bg-white"
                required
              />
              <button
                type="submit"
                className="px-8 py-3 bg-[#C9A84C] text-[#2C2C2C] rounded-lg font-semibold hover:bg-[#D4A5A5] transition-colors whitespace-nowrap"
              >
                Subscribe
              </button>
            </form>
            <p className="text-sm text-[#999] mt-4">
              We respect your privacy. Unsubscribe at any time.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
