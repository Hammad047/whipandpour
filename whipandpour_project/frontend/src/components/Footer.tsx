import { useState } from 'react';
import { Mail, MapPin, Phone } from 'lucide-react';

export default function Footer() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubscribed(true);
      setEmail('');
      setTimeout(() => setSubscribed(false), 3000);
    }
  };

  return (
    <footer className="bg-[#2C2C2C] text-[#FAF7F2] mt-20">
      <div className="container py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div>
            <h3 className="text-2xl font-bold mb-4">
              <span className="text-[#C9A84C]">Whip</span>&Pour
            </h3>
            <p className="text-[#D4A5A5] text-sm leading-relaxed">
              Handcrafted luxury candles made with love and premium ingredients. Each candle tells a story.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-semibold mb-4 text-[#C9A84C]">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <a href="/shop" className="text-[#D4A5A5] hover:text-[#C9A84C] transition-colors">
                  Shop
                </a>
              </li>
              <li>
                <a href="/about" className="text-[#D4A5A5] hover:text-[#C9A84C] transition-colors">
                  About Us
                </a>
              </li>
              <li>
                <a href="/contact" className="text-[#D4A5A5] hover:text-[#C9A84C] transition-colors">
                  Contact
                </a>
              </li>
              <li>
                <a href="/faq" className="text-[#D4A5A5] hover:text-[#C9A84C] transition-colors">
                  FAQ
                </a>
              </li>
            </ul>
          </div>

          {/* Customer Service */}
          <div>
            <h4 className="text-lg font-semibold mb-4 text-[#C9A84C]">Customer Service</h4>
            <ul className="space-y-2">
              <li>
                <a href="/shipping" className="text-[#D4A5A5] hover:text-[#C9A84C] transition-colors">
                  Shipping Info
                </a>
              </li>
              <li>
                <a href="/returns" className="text-[#D4A5A5] hover:text-[#C9A84C] transition-colors">
                  Returns
                </a>
              </li>
              <li>
                <a href="/privacy" className="text-[#D4A5A5] hover:text-[#C9A84C] transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="/terms" className="text-[#D4A5A5] hover:text-[#C9A84C] transition-colors">
                  Terms of Service
                </a>
              </li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h4 className="text-lg font-semibold mb-4 text-[#C9A84C]">Newsletter</h4>
            <p className="text-[#D4A5A5] text-sm mb-4">
              Subscribe for exclusive offers and new candle releases.
            </p>
            <form onSubmit={handleSubscribe} className="flex flex-col gap-2">
              <input
                type="email"
                placeholder="Your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="px-4 py-2 rounded-lg bg-[#FAF7F2] text-[#2C2C2C] placeholder-[#7A7066] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                required
              />
              <button
                type="submit"
                className="px-4 py-2 bg-[#C9A84C] text-[#2C2C2C] rounded-lg font-medium hover:bg-[#D4A5A5] transition-colors"
              >
                Subscribe
              </button>
              {subscribed && (
                <p className="text-[#C9A84C] text-sm">Thank you for subscribing!</p>
              )}
            </form>
          </div>
        </div>

        {/* Contact Info */}
        <div className="border-t border-[#7A7066] pt-8 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center gap-3">
              <MapPin size={20} className="text-[#C9A84C]" />
              <div>
                <p className="text-[#D4A5A5] text-sm">Address</p>
                <p className="text-[#FAF7F2]">123 Candle Lane, Artisan City, AC 12345</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone size={20} className="text-[#C9A84C]" />
              <div>
                <p className="text-[#D4A5A5] text-sm">Phone</p>
                <p className="text-[#FAF7F2]">+1 (555) 123-4567</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Mail size={20} className="text-[#C9A84C]" />
              <div>
                <p className="text-[#D4A5A5] text-sm">Email</p>
                <p className="text-[#FAF7F2]">hello@whipandpour.com</p>
              </div>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="border-t border-[#7A7066] pt-8 text-center text-[#D4A5A5] text-sm">
          <p>&copy; 2026 Whip&Pour. All rights reserved. Handcrafted with love.</p>
        </div>
      </div>
    </footer>
  );
}
