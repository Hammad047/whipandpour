import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { TrendingUp, ShoppingCart, Users, Package } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { useAdmin } from '@/contexts/AdminContext';
import { trpc } from '@/lib/trpc';
import { categoryLabel, formatPrice, toNumber } from '@/const';

// Illustrative chart data. The KPI cards, recent orders and top products above
// are real; this trend chart is a placeholder until reporting is built.
const dailyData = [
  { label: 'Mon', revenue: 8200, orders: 22 },
  { label: 'Tue', revenue: 11500, orders: 31 },
  { label: 'Wed', revenue: 9800, orders: 26 },
  { label: 'Thu', revenue: 13200, orders: 35 },
  { label: 'Fri', revenue: 15600, orders: 42 },
  { label: 'Sat', revenue: 18400, orders: 51 },
  { label: 'Sun', revenue: 14300, orders: 38 },
];

const weeklyData = [
  { label: 'W1', revenue: 82000, orders: 215 },
  { label: 'W2', revenue: 95000, orders: 248 },
  { label: 'W3', revenue: 88000, orders: 231 },
  { label: 'W4', revenue: 112000, orders: 295 },
];

const monthlyData = [
  { label: 'Jan', revenue: 245000, orders: 648 },
  { label: 'Feb', revenue: 312000, orders: 820 },
  { label: 'Mar', revenue: 289000, orders: 760 },
  { label: 'Apr', revenue: 378000, orders: 995 },
  { label: 'May', revenue: 421000, orders: 1108 },
];



const statusColors: Record<string, string> = {
  Delivered: 'bg-green-100 text-green-700',
  Processing: 'bg-yellow-100 text-yellow-700',
  Shipped: 'bg-blue-100 text-blue-700',
  Pending: 'bg-gray-100 text-gray-600',
  Cancelled: 'bg-red-100 text-red-700',
};

export default function AdminDashboard() {
  const { isAdminAuthenticated } = useAdmin();
  const [, navigate] = useLocation();
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

  const { data: summary } = trpc.admin.stats.useQuery(undefined, { enabled: isAdminAuthenticated });
  const { data: orders = [] } = trpc.admin.orders.list.useQuery(undefined, {
    enabled: isAdminAuthenticated,
  });
  const { data: products = [] } = trpc.admin.products.list.useQuery(undefined, {
    enabled: isAdminAuthenticated,
  });

  if (!isAdminAuthenticated) {
    navigate('/admin/login');
    return null;
  }

  const chartData = period === 'daily' ? dailyData : period === 'weekly' ? weeklyData : monthlyData;

  // KPI values come from the database. Revenue counts only orders a payment
  // gateway has actually confirmed, so it stays at zero until one does.
  const stats = [
    {
      label: 'Confirmed Revenue',
      value: formatPrice(summary?.confirmedRevenue ?? 0),
      change: `${summary?.awaitingPayment ?? 0} awaiting payment`,
      icon: TrendingUp,
      bg: 'bg-amber-50',
      iconColor: 'text-[#C9A84C]',
      border: 'border-amber-200',
    },
    {
      label: 'Total Orders',
      value: String(summary?.orderCount ?? 0),
      change: `${summary?.pendingOrders ?? 0} pending`,
      icon: ShoppingCart,
      bg: 'bg-rose-50',
      iconColor: 'text-[#D4A5A5]',
      border: 'border-rose-200',
    },
    {
      label: 'Total Customers',
      value: String(summary?.customerCount ?? 0),
      change: 'from real orders',
      icon: Users,
      bg: 'bg-amber-50',
      iconColor: 'text-[#C9A84C]',
      border: 'border-amber-200',
    },
    {
      label: 'Active Products',
      value: String(summary?.productCount ?? 0),
      change: `${summary?.lowStock ?? 0} low · ${summary?.outOfStock ?? 0} out · ${summary?.giftOrdersToPack ?? 0} gift orders to pack`,
      icon: Package,
      bg: 'bg-rose-50',
      iconColor: 'text-[#D4A5A5]',
      border: 'border-rose-200',
    },
  ];

  /**
   * Units sold per product, aggregated from real order items. Falls back to an
   * empty list until the store has orders — no invented sales figures.
   */
  const soldByProduct = new Map<number, number>();
  for (const order of orders) {
    for (const item of order.items ?? []) {
      soldByProduct.set(item.productId, (soldByProduct.get(item.productId) ?? 0) + item.quantity);
    }
  }
  const topProducts = products
    .map((product: any) => ({
      name: product.name,
      category: product.category,
      sales: soldByProduct.get(product.id) ?? 0,
    }))
    .sort((a: { sales: number }, b: { sales: number }) => b.sales - a.sales)
    .slice(0, 5);

  const recentOrders = orders.slice(0, 5).map((o: any) => ({
    id: o.orderNumber,
    customer: o.customerName,
    amount: toNumber(o.total),
    status: o.status.charAt(0).toUpperCase() + o.status.slice(1),
    date: o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '—',
    method: o.paymentMethod.toUpperCase(),
  }));

  return (
    <AdminLayout title="Dashboard">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className={`${stat.bg} ${stat.border} border rounded-xl p-5`}>
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-lg bg-white shadow-sm`}>
                  <Icon size={20} className={stat.iconColor} />
                </div>
                <span className="text-xs font-medium text-[#7A7066] text-right">
                  {stat.change}
                </span>
              </div>
              <p className="text-2xl font-bold text-[#2C2C2C]">{stat.value}</p>
              <p className="text-xs text-[#7A7066] mt-1">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Revenue Chart */}
      <div className="bg-white rounded-xl border border-[#E8DDD0] p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-[#2C2C2C]">Revenue & Orders</h3>
          <div className="flex gap-1 bg-[#FAF7F2] rounded-lg p-1 border border-[#E8DDD0]">
            {(['daily', 'weekly', 'monthly'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all capitalize ${
                  period === p
                    ? 'bg-[#C9A84C] text-[#2C2C2C] shadow-sm'
                    : 'text-[#7A7066] hover:text-[#2C2C2C]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD0" />
            <XAxis dataKey="label" stroke="#999" fontSize={12} />
            <YAxis stroke="#999" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#FAF7F2',
                border: '1px solid #E8DDD0',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Line type="monotone" dataKey="revenue" stroke="#C9A84C" strokeWidth={2.5} dot={{ fill: '#C9A84C', r: 3 }} name="Revenue (PKR)" />
            <Line type="monotone" dataKey="orders" stroke="#D4A5A5" strokeWidth={2.5} dot={{ fill: '#D4A5A5', r: 3 }} name="Orders" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Recent Orders + Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#E8DDD0] shadow-sm overflow-hidden">
          <div className="p-5 border-b border-[#E8DDD0] flex items-center justify-between">
            <h3 className="font-bold text-[#2C2C2C]">Recent Orders</h3>
            <button
              onClick={() => navigate('/admin/orders')}
              className="text-xs text-[#C9A84C] font-semibold hover:underline"
            >
              View All →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#FAF7F2]">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Order</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Customer</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Amount</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-[#7A7066]">
                      No orders yet — they appear here as customers check out.
                    </td>
                  </tr>
                )}
                {recentOrders.map((order: any) => (
                  <tr key={order.id} className="border-t border-[#E8DDD0] hover:bg-[#FAF7F2] transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs font-semibold text-[#2C2C2C] whitespace-nowrap">{order.id}</td>
                    <td className="px-5 py-3.5 text-[#666]">{order.customer}</td>
                    <td className="px-5 py-3.5 font-semibold text-[#C9A84C] whitespace-nowrap">{formatPrice(order.amount)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[order.status] || 'bg-gray-100 text-gray-600'}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[#7A7066]">{order.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-xl border border-[#E8DDD0] shadow-sm overflow-hidden">
          <div className="p-5 border-b border-[#E8DDD0] flex items-center justify-between">
            <h3 className="font-bold text-[#2C2C2C]">Top Products</h3>
            <button
              onClick={() => navigate('/admin/analytics')}
              className="text-xs text-[#C9A84C] font-semibold hover:underline"
            >
              Analytics →
            </button>
          </div>
          <div className="p-4 space-y-3">
            {topProducts.length === 0 && (
              <p className="text-sm text-[#7A7066] py-4 text-center">No products yet.</p>
            )}
            {topProducts.map((p: any, i: number) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-[#FAF7F2] border border-[#E8DDD0] flex items-center justify-center text-xs font-bold text-[#C9A84C] flex-shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#2C2C2C] truncate">{p.name}</p>
                  <p className="text-xs text-[#7A7066]">{p.sales} sales</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[#FAF7F2] border border-[#E8DDD0] text-[#2C2C2C] whitespace-nowrap">
                  {categoryLabel(p.category)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
