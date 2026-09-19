import { useLocation } from 'wouter';
import { Flame, Heart, Award, Leaf, ChevronRight, Star } from 'lucide-react';

export default function About() {
  const [, navigate] = useLocation();

  const values = [
    {
      icon: Flame,
      color: '#C9A84C',
      title: 'Hand-Poured with Intention',
      desc: 'Every candle is carefully hand-poured in small batches to ensure the highest quality and consistency in every burn.',
    },
    {
      icon: Leaf,
      color: '#6B9E6B',
      title: '100% Natural Soy Wax',
      desc: 'We use only pure soy wax sourced from sustainable farms — clean-burning, non-toxic, and longer-lasting than paraffin.',
    },
    {
      icon: Heart,
      color: '#D4A5A5',
      title: 'Made with Love',
      desc: 'Each candle carries a piece of our heart. We believe fragrance is personal, and every scent tells a story.',
    },
    {
      icon: Award,
      color: '#C9A84C',
      title: 'Premium Fragrance Oils',
      desc: 'Our scents are curated from the finest fragrance houses — rich, layered, and true-to-nature from first light to last flicker.',
    },
  ];

  const team = [
    {
      name: 'Ayesha Malik',
      role: 'Founder & Head Chandler',
      image: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=300&h=300&fit=crop',
      bio: 'Ayesha started Whip & Pour after years of perfecting her craft at home. Her passion for scent and design drives every product we make.',
    },
    {
      name: 'Zara Khan',
      role: 'Fragrance Designer',
      image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop',
      bio: 'With a background in perfumery, Zara crafts each scent profile to evoke emotion, memory, and a deep sense of comfort.',
    },
    {
      name: 'Hassan Raza',
      role: 'Creative Director',
      image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&h=300&fit=crop',
      bio: 'Hassan brings the visual identity of Whip & Pour to life — from packaging to photography, every detail is intentional.',
    },
  ];

  const stats = [
    { value: '5,000+', label: 'Happy Customers' },
    { value: '40+', label: 'Unique Scents' },
    { value: '3', label: 'Years of Craft' },
    { value: '100%', label: 'Natural Ingredients' },
  ];

  return (
    <div className="min-h-screen bg-[#FAF7F2]">

      {/* ── Hero ── */}
      <section className="relative py-28 bg-gradient-to-br from-[#2C2C2C] to-[#1a1a1a] overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1603808033192-082d6919d3e1?w=1920&h=700&fit=crop"
            alt="Our Story"
            className="w-full h-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#2C2C2C]/90 to-transparent" />
        </div>
        <div className="relative container mx-auto px-4 md:px-8 max-w-4xl text-center">
          <p className="text-xs font-bold tracking-[0.3em] text-[#C9A84C] uppercase mb-4">
            — Our Story —
          </p>
          <h1
            className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Born from a Love of Scent
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed">
            Whip & Pour began in a small kitchen in Lahore — with a dream to bring
            the comfort of beautifully crafted candles into every Pakistani home.
          </p>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <section className="bg-white border-b border-[#E8DDD0] py-10">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {stats.map((s) => (
              <div key={s.label}>
                <p
                  className="text-3xl md:text-4xl font-bold text-[#C9A84C] mb-1"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {s.value}
                </p>
                <p className="text-sm text-[#7A7066] font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Our Story ── */}
      <section className="py-20">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <div>
              <p className="text-xs font-bold tracking-[0.3em] text-[#C9A84C] uppercase mb-4">
                — How It Started —
              </p>
              <h2
                className="text-4xl md:text-5xl font-bold text-[#2C2C2C] mb-6 leading-tight"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Candles That Feel Like Coming Home
              </h2>
              <p className="text-lg text-[#666] mb-5 leading-relaxed">
                It started with a simple question: why are the best candles always imported? We set
                out to change that — crafting premium, fragrant candles right here in Pakistan, using
                the finest ingredients and genuine care.
              </p>
              <p className="text-lg text-[#666] mb-5 leading-relaxed">
                Every Whip & Pour candle is small-batch, hand-poured, and tested for scent accuracy,
                burn time, and clean performance. We don't just make candles — we create experiences
                that linger long after the flame goes out.
              </p>
              <p className="text-lg text-[#666] mb-8 leading-relaxed">
                Our mission is simple: bring warmth, beauty, and the art of fragrance into your
                everyday life — affordably, sustainably, and with heart.
              </p>
              <button
                onClick={() => navigate('/shop')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#C9A84C] text-[#2C2C2C] rounded-xl font-semibold hover:bg-[#D4A5A5] transition-colors"
              >
                Shop Our Collection
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="relative">
              <img
                src="/images/products/photo-1607344645866-009c320b63e0.jpg"
                alt="Hand-poured candles"
                className="rounded-2xl shadow-2xl w-full"
                onError={(e) => {
                  e.currentTarget.src = '/images/products/photo-1546039907-7fa05f864c02.jpg';
                }}
              />
              <div className="absolute -bottom-6 -left-6 bg-white rounded-2xl shadow-xl p-5 border border-[#E8DDD0]">
                <div className="flex gap-1 text-[#C9A84C] mb-1">
                  {[...Array(5)].map((_, i) => <Star key={i} size={14} fill="currentColor" />)}
                </div>
                <p className="text-xs text-[#7A7066] font-medium">"Best candles in Pakistan!"</p>
                <p className="text-xs text-[#2C2C2C] font-bold mt-0.5">— Sarah Ahmed, Lahore</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Our Values ── */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="text-center mb-14">
            <p className="text-xs font-bold tracking-[0.3em] text-[#C9A84C] uppercase mb-3">
              — What We Stand For —
            </p>
            <h2
              className="text-4xl md:text-5xl font-bold text-[#2C2C2C]"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Our Values
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((v) => (
              <div
                key={v.title}
                className="bg-[#FAF7F2] rounded-2xl p-6 border border-[#E8DDD0] hover:shadow-lg transition-shadow group"
              >
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mb-5 group-hover:scale-110 transition-transform"
                  style={{ backgroundColor: `${v.color}18` }}
                >
                  <v.icon size={26} style={{ color: v.color }} />
                </div>
                <h3 className="text-lg font-bold text-[#2C2C2C] mb-3">{v.title}</h3>
                <p className="text-sm text-[#666] leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Meet the Team ── */}
      <section className="py-20 bg-[#FAF7F2]">
        <div className="container mx-auto px-4 md:px-8 max-w-5xl">
          <div className="text-center mb-14">
            <p className="text-xs font-bold tracking-[0.3em] text-[#C9A84C] uppercase mb-3">
              — The People Behind the Flame —
            </p>
            <h2
              className="text-4xl md:text-5xl font-bold text-[#2C2C2C]"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Meet Our Team
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {team.map((member) => (
              <div key={member.name} className="text-center group">
                <div className="relative mx-auto w-36 h-36 mb-5 rounded-full overflow-hidden border-4 border-[#E8DDD0] group-hover:border-[#C9A84C] transition-all shadow-lg">
                  <img
                    src={member.image}
                    alt={member.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    onError={(e) => {
                      e.currentTarget.src = '/images/products/photo-1569864358642-9d1684040f43.jpg';
                    }}
                  />
                </div>
                <h3 className="text-xl font-bold text-[#2C2C2C] mb-1">{member.name}</h3>
                <p className="text-sm font-semibold text-[#C9A84C] mb-3">{member.role}</p>
                <p className="text-sm text-[#666] leading-relaxed">{member.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 bg-gradient-to-r from-[#2C2C2C] to-[#1a1a1a] text-white text-center">
        <div className="container mx-auto px-4 max-w-2xl">
          <p className="text-xs font-bold tracking-[0.3em] text-[#C9A84C] uppercase mb-4">
            — Join Our Journey —
          </p>
          <h2
            className="text-4xl md:text-5xl font-bold mb-6"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Light Up Your World
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Discover our full collection and find the scent that speaks to your soul.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <button
              onClick={() => navigate('/shop')}
              className="px-8 py-4 bg-[#C9A84C] text-[#2C2C2C] rounded-xl font-bold hover:bg-[#D4A5A5] transition-all"
            >
              Shop Now
            </button>
            <button
              onClick={() => navigate('/contact')}
              className="px-8 py-4 border-2 border-white/40 text-white rounded-xl font-bold hover:border-[#C9A84C] hover:text-[#C9A84C] transition-all"
            >
              Contact Us
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}
