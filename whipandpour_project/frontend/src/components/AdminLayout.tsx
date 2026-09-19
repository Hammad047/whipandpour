import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  LayoutDashboard, Package, ShoppingCart, Users, BarChart2,
  Tag, Star, Warehouse, CreditCard, Menu, X, ChevronLeft,
  LogOut, Flame, ArrowLeft
} from 'lucide-react';
import { useAdmin } from '@/contexts/AdminContext';

interface AdminLayoutProps {
  children: React.ReactNode;
  title: string;
}

const navItems = [
  { label: 'Dashboard',   href: '/admin',            icon: LayoutDashboard },
  { label: 'Products',    href: '/admin/products',    icon: Package },
  { label: 'Orders',      href: '/admin/orders',      icon: ShoppingCart },
  { label: 'Customers',   href: '/admin/customers',   icon: Users },
  { label: 'Analytics',   href: '/admin/analytics',   icon: BarChart2 },
  { label: 'Promo Codes', href: '/admin/promos',      icon: Tag },
  { label: 'Reviews',     href: '/admin/reviews',     icon: Star },
  { label: 'Inventory',   href: '/admin/inventory',   icon: Warehouse },
  { label: 'Payments',    href: '/admin/payments',    icon: CreditCard },
];

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [location, navigate] = useLocation();
  const { adminUser, adminLogout } = useAdmin();

  const handleLogout = () => {
    adminLogout();
    navigate('/admin/login');
  };

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Logo / Header */}
      <div className={`flex items-center p-5 border-b border-[#2C2C2C]/20 ${collapsed && !mobile ? 'justify-center' : 'justify-between'}`}>
        {(!collapsed || mobile) && (
          <div className="flex items-center gap-2">
            <Flame size={22} className="text-[#C9A84C] flex-shrink-0" />
            <span className="font-bold text-white text-lg tracking-wide" style={{ fontFamily: "'Playfair Display', serif" }}>
              W&P Admin
            </span>
          </div>
        )}
        {collapsed && !mobile && (
          <Flame size={22} className="text-[#C9A84C]" />
        )}
        {!mobile && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft size={16} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        )}
        {mobile && (
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href || (item.href !== '/admin' && location.startsWith(item.href));
          return (
            <button
              key={item.href}
              onClick={() => {
                navigate(item.href);
                if (mobile) setMobileSidebarOpen(false);
              }}
              title={collapsed && !mobile ? item.label : undefined}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all text-sm font-medium ${
                isActive
                  ? 'bg-[#C9A84C] text-[#2C2C2C] shadow-md'
                  : 'text-[#FAF7F2]/80 hover:bg-white/10 hover:text-white'
              } ${collapsed && !mobile ? 'justify-center' : ''}`}
            >
              <Icon size={18} className="flex-shrink-0" />
              {(!collapsed || mobile) && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Bottom: User + Logout */}
      <div className="border-t border-white/10 p-3 space-y-2">
        {(!collapsed || mobile) && adminUser && (
          <div className="px-3 py-2">
            <p className="text-xs text-white/50">Signed in as</p>
            <p className="text-xs text-white font-medium truncate">{adminUser.email}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-red-300 hover:bg-red-900/30 transition-all text-sm font-medium ${collapsed && !mobile ? 'justify-center' : ''}`}
          title={collapsed && !mobile ? 'Logout' : undefined}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {(!collapsed || mobile) && <span>Logout</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#FAF7F2] overflow-hidden">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-[#2C2C2C] transition-all duration-300 flex-shrink-0 ${
          collapsed ? 'w-[64px]' : 'w-[240px]'
        }`}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-[260px] z-50 bg-[#2C2C2C] flex flex-col transform transition-transform duration-300 md:hidden ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent mobile />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-[#E8DDD0] px-4 md:px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden p-2 rounded-lg hover:bg-[#E8DDD0] transition-colors"
            >
              <Menu size={20} className="text-[#2C2C2C]" />
            </button>

            {/* Back to store */}
            <button
              onClick={() => navigate('/')}
              className="hidden md:flex items-center gap-1.5 text-sm text-[#7A7066] hover:text-[#C9A84C] transition-colors"
            >
              <ArrowLeft size={15} />
              Back to Store
            </button>

            <h1 className="text-lg md:text-xl font-bold text-[#2C2C2C]">{title}</h1>
          </div>

          <div className="flex items-center gap-2">
            {adminUser && (
              <span className="hidden md:block text-xs text-[#7A7066] bg-[#FAF7F2] px-3 py-1.5 rounded-full border border-[#E8DDD0]">
                {adminUser.email}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
            >
              <LogOut size={15} />
              <span className="hidden sm:block">Logout</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
