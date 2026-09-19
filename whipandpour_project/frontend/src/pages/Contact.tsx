import { useState } from 'react';
import { useLocation } from 'wouter';
import { Mail, Phone, MapPin, Clock, Instagram, Facebook, Send, CheckCircle } from 'lucide-react';

export default function Contact() {
  const [, navigate] = useLocation();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 4000);
    setForm({ name: '', email: '', subject: '', message: '' });
  };

  const contactInfo = [
    {
      icon: Phone,
      color: '#C9A84C',
      title: 'Phone / WhatsApp',
      lines: ['+92 300 123 4567', '+92 321 987 6543'],
      sub: 'Available Mon–Sat, 10am–7pm',
    },
    {
      icon: Mail,
      color: '#D4A5A5',
      title: 'Email Us',
      lines: ['hello@whipandpour.com', 'orders@whipandpour.com'],
      sub: 'We reply within 24 hours',
    },
    {
      icon: MapPin,
      color: '#C9A84C',
      title: 'Visit Our Studio',
      lines: ['DHA Phase 5, Lahore', 'Punjab, Pakistan'],
      sub: 'By appointment only',
    },
    {
      icon: Clock,
      color: '#D4A5A5',
      title: 'Business Hours',
      lines: ['Mon – Sat: 10am – 7pm', 'Sunday: 12pm – 5pm'],
      sub: 'Public holidays may vary',
    },
  ];

  const faqs = [
    {
      q: 'How long does delivery take?',
      a: 'Standard delivery across Pakistan takes 3–5 business days. Express delivery (1–2 days) is available for Lahore, Karachi, and Islamabad.',
    },
    {
      q: 'Do you offer custom/gift candles?',
      a: 'Yes! We offer custom labeling, scent blending, and gift packaging. Contact us via WhatsApp for bulk or bespoke orders.',
    },
    {
      q: 'What is your return policy?',
      a: 'We offer a 30-day satisfaction guarantee. If your candle arrives damaged or the scent isn\'t what you expected, we\'ll replace it free of charge.',
    },
    {
      q: 'Are your candles safe for pets?',
      a: 'Our soy wax candles are much safer than paraffin. However, we recommend burning candles in well-ventilated areas and keeping them away from pets.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#FAF7F2]">

      {/* ── Hero ── */}
      <section className="relative py-24 bg-gradient-to-br from-[#2C2C2C] to-[#1a1a1a] overflow-hidden">
        <div className="absolute inset-0 opacity-15">
          <img
            src="/images/products/photo-1549007994-cb92caebd54b.jpg"
            alt="Contact"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#2C2C2C]/80 to-transparent" />
        </div>
        <div className="relative container mx-auto px-4 text-center max-w-3xl">
          <p className="text-xs font-bold tracking-[0.3em] text-[#C9A84C] uppercase mb-4">
            — Get in Touch —
          </p>
          <h1
            className="text-5xl md:text-6xl font-bold text-white mb-5"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            We'd Love to Hear From You
          </h1>
          <p className="text-xl text-gray-300 leading-relaxed">
            Questions, custom orders, or just want to chat about candles? We're always happy to help.
          </p>
        </div>
      </section>

      {/* ── Contact Info Cards ── */}
      <section className="py-16 bg-white border-b border-[#E8DDD0]">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {contactInfo.map((info) => (
              <div
                key={info.title}
                className="bg-[#FAF7F2] rounded-2xl p-6 border border-[#E8DDD0] hover:shadow-lg transition-shadow group"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"
                  style={{ backgroundColor: `${info.color}20` }}
                >
                  <info.icon size={22} style={{ color: info.color }} />
                </div>
                <h3 className="font-bold text-[#2C2C2C] mb-2">{info.title}</h3>
                {info.lines.map((line) => (
                  <p key={line} className="text-[#2C2C2C] font-medium text-sm">{line}</p>
                ))}
                <p className="text-xs text-[#7A7066] mt-2">{info.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact Form + Social ── */}
      <section className="py-20">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14">

            {/* Form */}
            <div>
              <p className="text-xs font-bold tracking-[0.3em] text-[#C9A84C] uppercase mb-3">
                — Send a Message —
              </p>
              <h2
                className="text-3xl md:text-4xl font-bold text-[#2C2C2C] mb-8"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Drop Us a Note
              </h2>

              {submitted ? (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
                  <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
                  <h3 className="text-xl font-bold text-green-700 mb-2">Message Sent!</h3>
                  <p className="text-green-600">
                    Thank you for reaching out. We'll get back to you within 24 hours.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-semibold text-[#2C2C2C] mb-1.5">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Your name"
                        required
                        className="w-full px-4 py-3 rounded-xl border border-[#E8DDD0] bg-white text-[#2C2C2C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C] placeholder-[#7A7066] text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#2C2C2C] mb-1.5">
                        Email *
                      </label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="your@email.com"
                        required
                        className="w-full px-4 py-3 rounded-xl border border-[#E8DDD0] bg-white text-[#2C2C2C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C] placeholder-[#7A7066] text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#2C2C2C] mb-1.5">
                      Subject
                    </label>
                    <select
                      value={form.subject}
                      onChange={(e) => setForm({ ...form, subject: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-[#E8DDD0] bg-white text-[#2C2C2C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C] text-sm"
                    >
                      <option value="">Select a subject...</option>
                      <option value="order">Order Enquiry</option>
                      <option value="custom">Custom / Gift Order</option>
                      <option value="wholesale">Wholesale / Bulk Order</option>
                      <option value="return">Return / Exchange</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#2C2C2C] mb-1.5">
                      Message *
                    </label>
                    <textarea
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      placeholder="Tell us how we can help..."
                      required
                      rows={5}
                      className="w-full px-4 py-3 rounded-xl border border-[#E8DDD0] bg-white text-[#2C2C2C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C] placeholder-[#7A7066] text-sm resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-2 py-4 bg-[#C9A84C] text-[#2C2C2C] rounded-xl font-bold hover:bg-[#D4A5A5] transition-all text-sm tracking-wide"
                  >
                    <Send size={16} />
                    Send Message
                  </button>
                </form>
              )}
            </div>

            {/* Right side: Social + FAQ */}
            <div>
              {/* Social */}
              <div className="bg-white rounded-2xl border border-[#E8DDD0] p-7 mb-8">
                <h3 className="text-xl font-bold text-[#2C2C2C] mb-5">Follow Us</h3>
                <div className="flex flex-col gap-3">
                  <a
                    href="https://instagram.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-pink-50 to-purple-50 border border-pink-100 hover:shadow-md transition-shadow group"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                      <Instagram size={18} className="text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-[#2C2C2C] text-sm">@whipandpour</p>
                      <p className="text-xs text-[#7A7066]">Behind-the-scenes & new drops</p>
                    </div>
                  </a>
                  <a
                    href="https://facebook.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 rounded-xl bg-blue-50 border border-blue-100 hover:shadow-md transition-shadow group"
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                      <Facebook size={18} className="text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-[#2C2C2C] text-sm">Whip & Pour Candles</p>
                      <p className="text-xs text-[#7A7066]">Community & giveaways</p>
                    </div>
                  </a>
                  <a
                    href="https://wa.me/923001234567"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 rounded-xl bg-green-50 border border-green-100 hover:shadow-md transition-shadow group"
                  >
                    <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <Phone size={18} className="text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-[#2C2C2C] text-sm">WhatsApp Us</p>
                      <p className="text-xs text-[#7A7066]">Fastest way to reach us</p>
                    </div>
                  </a>
                </div>
              </div>

              {/* FAQ */}
              <div className="bg-white rounded-2xl border border-[#E8DDD0] p-7">
                <h3 className="text-xl font-bold text-[#2C2C2C] mb-5">Frequently Asked Questions</h3>
                <div className="space-y-4">
                  {faqs.map((faq) => (
                    <details
                      key={faq.q}
                      className="group border border-[#E8DDD0] rounded-xl overflow-hidden"
                    >
                      <summary className="flex items-center justify-between px-5 py-4 cursor-pointer text-sm font-semibold text-[#2C2C2C] hover:bg-[#FAF7F2] transition-colors select-none list-none">
                        {faq.q}
                        <span className="text-[#C9A84C] font-bold text-lg group-open:rotate-45 transition-transform inline-block">+</span>
                      </summary>
                      <div className="px-5 pb-4 text-sm text-[#666] leading-relaxed border-t border-[#E8DDD0] pt-3">
                        {faq.a}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── CTA strip ── */}
      <section className="py-14 bg-[#2C2C2C] text-white text-center">
        <div className="container mx-auto px-4">
          <p className="text-gray-400 text-sm mb-2">Ready to find your perfect scent?</p>
          <h3
            className="text-2xl md:text-3xl font-bold mb-6"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Browse Our Full Collection
          </h3>
          <button
            onClick={() => navigate('/shop')}
            className="px-8 py-3.5 bg-[#C9A84C] text-[#2C2C2C] rounded-xl font-bold hover:bg-[#D4A5A5] transition-all"
          >
            Shop Now 🕯️
          </button>
        </div>
      </section>

    </div>
  );
}
