import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  ShoppingCart, Menu, X, Heart, User, Search, ChevronDown,
  Home, Package, Phone, Info, MapPin, Star, Bell
} from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { CATEGORIES } from '@/const';

const TOP_BAR_MESSAGES = [
  'FREE DELIVERY ON ORDERS OVER PKR 4,000  |  HANDCRAFTED WITH LOVE 🕯️',
  'GET 10% OFF ON YOUR FIRST ORDER — CODE WELCOME10 ✨',
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [bannerIndex, setBannerIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setBannerIndex((i) => (i + 1) % TOP_BAR_MESSAGES.length),
      4000
    );
    return () => clearInterval(id);
  }, []);
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [location, navigate] = useLocation();
  const { getItemCount, setIsOpen } = useCart();
  const { count: wishlistCount } = useWishlist();
  const searchRef = useRef<HTMLInputElement>(null);

  // Check if admin page — hide navbar on admin pages
  const isAdminPage = location.startsWith('/admin');
  if (isAdminPage) return null;

  // Scroll handler for blur/sticky effect
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [searchOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/shop?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setSearchOpen(false);
    }
  };

  const goTo = (href: string) => {
    navigate(href);
    setMobileOpen(false);
    setCollectionOpen(false);
  };

  return (
    <>
      {/* Top Brand Bar — rotates between store messages and the first-order promo */}
      <div className="relative bg-[#2C2C2C] text-[#FAF7F2] text-center py-2 text-xs font-medium tracking-widest overflow-hidden h-8 flex items-center justify-center">
        {TOP_BAR_MESSAGES.map((message, i) => (
          <span
            key={message}
            className={`absolute inset-0 flex items-center justify-center px-4 transition-opacity duration-700 ${
              i === bannerIndex ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden={i !== bannerIndex}
          >
            {message}
          </span>
        ))}
      </div>

      {/* Main Navbar */}
      <nav
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-[#FAF7F2]/95 backdrop-blur-md shadow-md border-b border-[#E8DDD0]'
            : 'bg-[#FAF7F2] border-b border-[#E8DDD0]'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between h-16 md:h-20">

            {/* LEFT: Hamburger (mobile) + Desktop Nav */}
            <div className="flex items-center gap-2 md:gap-8">
              {/* Hamburger - mobile only */}
              <button
                onClick={() => setMobileOpen(true)}
                className="md:hidden p-2 rounded-lg hover:bg-[#E8DDD0] transition-colors"
                aria-label="Open menu"
              >
                <Menu size={22} className="text-[#2C2C2C]" />
              </button>

              {/* Desktop Navigation Links */}
              <div className="hidden md:flex items-center gap-6">
                <button
                  onClick={() => goTo('/')}
                  className="text-sm font-semibold text-[#2C2C2C] hover:text-[#C9A84C] transition-colors tracking-wide uppercase"
                >
                  Home
                </button>

                {/* Collection Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setCollectionOpen(!collectionOpen)}
                    onBlur={() => setTimeout(() => setCollectionOpen(false), 200)}
                    className="flex items-center gap-1 text-sm font-semibold text-[#2C2C2C] hover:text-[#C9A84C] transition-colors tracking-wide uppercase"
                  >
                    Collection <ChevronDown size={14} className={`transition-transform ${collectionOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {collectionOpen && (
                    <div className="absolute top-full left-0 mt-2 w-60 bg-white rounded-xl shadow-xl border border-[#E8DDD0] overflow-hidden z-50">
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat.value}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => goTo(`/shop?category=${cat.value}`)}
                          className="block w-full text-left px-5 py-3 text-sm text-[#2C2C2C] hover:bg-[#FAF7F2] hover:text-[#C9A84C] transition-colors font-medium"
                        >
                          {cat.icon} {cat.label}
                        </button>
                      ))}
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => goTo('/shop')}
                        className="block w-full text-left px-5 py-3 text-sm text-[#7A7066] hover:bg-[#FAF7F2] hover:text-[#C9A84C] transition-colors font-medium border-t border-[#E8DDD0]"
                      >
                        View all products →
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => goTo('/about')}
                  className="text-sm font-semibold text-[#2C2C2C] hover:text-[#C9A84C] transition-colors tracking-wide uppercase"
                >
                  About
                </button>
                <button
                  onClick={() => goTo('/contact')}
                  className="text-sm font-semibold text-[#2C2C2C] hover:text-[#C9A84C] transition-colors tracking-wide uppercase"
                >
                  Contact
                </button>
              </div>
            </div>

            {/* CENTER: Logo */}
            <div
              onClick={() => goTo('/')}
              className="absolute left-1/2 -translate-x-1/2 cursor-pointer select-none"
            >
              <h1 className="text-2xl md:text-3xl font-bold text-[#2C2C2C] tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
                <span className="text-[#C9A84C]">WHIP</span>
                <span className="text-[#D4A5A5]">&</span>
                <span>POUR</span>
              </h1>
            </div>

            {/* RIGHT: Search, Cart, Wishlist, Account */}
            <div className="flex items-center gap-1 md:gap-2">
              {/* Search */}
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className="p-2 rounded-lg hover:bg-[#E8DDD0] transition-colors"
                aria-label="Search"
              >
                <Search size={20} className="text-[#2C2C2C]" />
              </button>

              {/* Wishlist */}
              <button
                onClick={() => goTo('/wishlist')}
                className="relative p-2 rounded-lg hover:bg-[#E8DDD0] transition-colors"
                aria-label="Wishlist"
              >
                <Heart size={20} className="text-[#2C2C2C]" />
                {wishlistCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#C9A84C] text-[#2C2C2C] text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                    {wishlistCount > 99 ? '99+' : wishlistCount}
                  </span>
                )}
              </button>

              {/* Cart with badge */}
              <button
                onClick={() => setIsOpen(true)}
                className="relative p-2 rounded-lg hover:bg-[#E8DDD0] transition-colors"
                aria-label="Shopping Cart"
              >
                <ShoppingCart size={20} className="text-[#2C2C2C]" />
                {getItemCount() > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#D4A5A5] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                    {getItemCount() > 99 ? '99+' : getItemCount()}
                  </span>
                )}
              </button>

              {/* Account */}
              <button
                onClick={() => goTo('/account')}
                className="hidden md:flex p-2 rounded-lg hover:bg-[#E8DDD0] transition-colors"
                aria-label="Account"
              >
                <User size={20} className="text-[#2C2C2C]" />
              </button>
            </div>
          </div>

          {/* Search Bar (expands below navbar) */}
          {searchOpen && (
            <div className="pb-4">
              <form onSubmit={handleSearch} className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7A7066]" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search candles, scents…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-12 py-3 bg-white border border-[#E8DDD0] rounded-xl text-[#2C2C2C] placeholder-[#7A7066] focus:outline-none focus:ring-2 focus:ring-[#C9A84C] text-sm"
                />
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#7A7066] hover:text-[#2C2C2C]"
                >
                  <X size={16} />
                </button>
              </form>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <div
        className={`fixed top-0 right-0 h-full w-[320px] z-[70] bg-[#FAF7F2] shadow-2xl transform transition-transform duration-300 ease-in-out md:hidden ${
          mobileOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#E8DDD0] bg-white">
          <h2 className="text-xl font-bold text-[#2C2C2C]" style={{ fontFamily: "'Playfair Display', serif" }}>
            <span className="text-[#C9A84C]">WHIP</span>&<span className="text-[#D4A5A5]">POUR</span>
          </h2>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-2 rounded-lg hover:bg-[#E8DDD0] transition-colors"
          >
            <X size={20} className="text-[#2C2C2C]" />
          </button>
        </div>

        {/* Sidebar Links */}
        <div className="overflow-y-auto h-full pb-24">
          <div className="p-4 space-y-1">
            <button
              onClick={() => goTo('/')}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-[#2C2C2C] hover:bg-white hover:text-[#C9A84C] transition-all font-medium"
            >
              <Home size={18} className="text-[#C9A84C]" />
              Home
            </button>

            <button
              onClick={() => goTo('/shop')}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-[#2C2C2C] hover:bg-white hover:text-[#C9A84C] transition-all font-medium"
            >
              <Package size={18} className="text-[#C9A84C]" />
              All Products
            </button>

            {/* Collection Section */}
            <div>
              <button
                onClick={() => setCollectionOpen(!collectionOpen)}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-[#2C2C2C] hover:bg-white hover:text-[#C9A84C] transition-all font-medium"
              >
                <Package size={18} className="text-[#C9A84C]" />
                <span className="flex-1 text-left">Collection</span>
                <ChevronDown size={16} className={`transition-transform ${collectionOpen ? 'rotate-180' : ''}`} />
              </button>
              {collectionOpen && (
                <div className="ml-4 mt-1 space-y-1">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => goTo(`/shop?category=${cat.value}`)}
                      className="block w-full text-left px-4 py-2 rounded-xl text-sm text-[#2C2C2C] hover:bg-white hover:text-[#C9A84C] transition-all"
                    >
                      {cat.icon} {cat.label}
                    </button>
                  ))}
                  <button
                    onClick={() => goTo('/shop')}
                    className="block w-full text-left px-4 py-2 rounded-xl text-sm text-[#7A7066] hover:bg-white hover:text-[#C9A84C] transition-all"
                  >
                    View all products →
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => goTo('/about')}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-[#2C2C2C] hover:bg-white hover:text-[#C9A84C] transition-all font-medium"
            >
              <Info size={18} className="text-[#C9A84C]" />
              About
            </button>

            <button
              onClick={() => goTo('/contact')}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-[#2C2C2C] hover:bg-white hover:text-[#C9A84C] transition-all font-medium"
            >
              <Phone size={18} className="text-[#C9A84C]" />
              Contact
            </button>

            <div className="my-3 border-t border-[#E8DDD0]" />

            <button
              onClick={() => goTo('/wishlist')}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-[#2C2C2C] hover:bg-white hover:text-[#C9A84C] transition-all font-medium"
            >
              <Heart size={18} className="text-[#D4A5A5]" />
              Wishlist
              {wishlistCount > 0 && (
                <span className="ml-auto bg-[#C9A84C] text-[#2C2C2C] text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                  {wishlistCount}
                </span>
              )}
            </button>

            <button
              onClick={() => goTo('/account')}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-[#2C2C2C] hover:bg-white hover:text-[#C9A84C] transition-all font-medium"
            >
              <User size={18} className="text-[#C9A84C]" />
              My Account
            </button>

            <button
              onClick={() => { setIsOpen(true); setMobileOpen(false); }}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-[#2C2C2C] hover:bg-white hover:text-[#C9A84C] transition-all font-medium"
            >
              <ShoppingCart size={18} className="text-[#C9A84C]" />
              Cart
              {getItemCount() > 0 && (
                <span className="ml-auto bg-[#D4A5A5] text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                  {getItemCount()}
                </span>
              )}
            </button>

            <div className="my-3 border-t border-[#E8DDD0]" />

            <button
              onClick={() => goTo('/account')}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-[#2C2C2C] hover:bg-white hover:text-[#C9A84C] transition-all font-medium"
            >
              <MapPin size={18} className="text-[#C9A84C]" />
              Track My Order
            </button>
          </div>

          {/* Bottom CTA */}
          <div className="mx-4 mt-4">
            <button
              onClick={() => goTo('/shop')}
              className="w-full py-3 bg-[#C9A84C] text-[#2C2C2C] rounded-xl font-bold hover:bg-[#D4A5A5] transition-colors"
            >
              Shop Now 🕯️
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
