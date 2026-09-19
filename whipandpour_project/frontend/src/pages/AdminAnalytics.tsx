import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Loader2 } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { useAdmin } from '@/contexts/AdminContext';
import { trpc } from '@/lib/trpc';
import { categoryLabel, formatPrice, toNumber } from '@/const';

/**
 * Admin → Analytics
 *
 * Every figure here is aggregated from the orders and orderItems tables.
 * Nothing is invented: with no orders, the charts are legitimately empty.
 *
 * Note the deliberate split between "sold" and "confirmed": total revenue is
 * what customers have ordered, confirmed revenue is what a payment gateway has
 * actually settled. Merging them would overstate income.
 */

const CHART_COLORS = ['#C9A84C', '#D4A5A5', '#7A7066', '#2C2C2C', '#B08D57'];

const RADIAN = Math.PI / 180;
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function AdminAnalytics() {
  const { isAdminAuthenticated, isCheckingSession } = useAdmin();
  const [, navigate] = useLocation();
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

  const { data, isLoading, isError, error } = trpc.admin.analytics.useQuery(undefined, {
    enabled: isAdminAuthenticated,
  });
  const { data: payments } = trpc.admin.payments.list.useQuery(undefined, {
    enabled: isAdminAuthenticated,
  });

  if (isCheckingSession) {
    return (
      <AdminLayout title="Analytics">
        <div className="flex items-center justify-center py-20 text-[#7A7066]">
          <Loader2 className="animate-spin mr-2" size={20} /> Checking your session…
        </div>
      </AdminLayout>
    );
  }

  if (!isAdminAuthenticated) { navigate('/admin/login'); return null; }

  if (isLoading) {
    return (
      <AdminLayout title="Analytics">
        <div className="flex items-center justify-center py-20 text-[#7A7066]">
          <Loader2 className="animate-spin mr-2" size={20} /> Crunching your order history…
        </div>
      </AdminLayout>
    );
  }

  if (isError || !data) {
    return (
      <AdminLayout title="Analytics">
        <div className="py-20 text-center text-red-600">
          {(error as any)?.message ?? 'Could not load analytics'}
        </div>
      </AdminLayout>
    );
  }

  const revenueSeries = (data[period] ?? []).map((row: any) => ({
    month: row.label,
    revenue: row.revenue,
    orders: row.orders,
  }));

  const topProducts = (data.topProducts ?? []).map((p: any) => ({
    name: p.name,
    sales: p.unitsSold,
  }));

  const categoryData = Object.entries(data.revenueByCategory ?? {}).map(([key, value], i) => ({
    name: categoryLabel(key),
    value: toNumber(value),
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const paymentData = (payments?.byMethod ?? []).map((m: any, i: number) => ({
    name: m.method.toUpperCase(),
    value: m.count,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const hasOrders = data.totalOrders > 0;

  const tooltipStyle = {
    backgroundColor: '#FAF7F2',
    border: '1px solid #E8DDD0',
    borderRadius: '8px',
    fontSize: '12px',
  };

  return (
    <AdminLayout title="Analytics">
      {/* Summary Boxes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Ordered', value: formatPrice(data.totalRevenue), note: 'value of all orders placed' },
          { label: 'Confirmed Revenue', value: formatPrice(data.confirmedRevenue), note: 'settled by a payment gateway' },
          { label: 'Total Orders', value: String(data.totalOrders), note: `${data.unitsSold} units sold` },
          { label: 'Avg Order Value', value: formatPrice(data.averageOrderValue), note: 'across all orders' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-[#E8DDD0] p-4">
            <p className="text-xl font-bold text-[#2C2C2C]">{s.value}</p>
            <p className="text-xs text-[#7A7066] mt-0.5">{s.label}</p>
            <p className="text-xs text-[#7A7066] mt-1">{s.note}</p>
          </div>
        ))}
      </div>

      {/* Revenue Trend */}
      <div className="bg-white rounded-xl border border-[#E8DDD0] p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-bold text-[#2C2C2C]">Revenue &amp; Orders</h3>
          <div className="flex gap-1 bg-[#FAF7F2] rounded-lg p-1 border border-[#E8DDD0]">
            {(['daily', 'weekly', 'monthly'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition-colors ${
                  period === p ? 'bg-[#C9A84C] text-[#2C2C2C]' : 'text-[#7A7066]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        {!hasOrders && (
          <p className="text-sm text-[#7A7066] mb-3">
            No orders yet — this chart fills in as customers check out.
          </p>
        )}
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={revenueSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD0" />
            <XAxis dataKey="month" stroke="#999" fontSize={12} />
            <YAxis stroke="#999" fontSize={12} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Line type="monotone" dataKey="revenue" stroke="#C9A84C" strokeWidth={2.5} dot={{ r: 4, fill: '#C9A84C' }} name="Revenue (PKR)" />
            <Line type="monotone" dataKey="orders" stroke="#D4A5A5" strokeWidth={2.5} dot={{ r: 4, fill: '#D4A5A5' }} name="Orders" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Top Products + Pie Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Top Products Bar */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#E8DDD0] p-5 shadow-sm">
          <h3 className="font-bold text-[#2C2C2C] mb-4">Top Selling Products</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topProducts} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD0" horizontal={false} />
              <XAxis type="number" stroke="#999" fontSize={11} />
              <YAxis type="category" dataKey="name" stroke="#999" fontSize={11} width={120} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="sales" fill="#C9A84C" radius={[0, 6, 6, 0]} name="Units Sold" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Category Breakdown */}
        <div className="bg-white rounded-xl border border-[#E8DDD0] p-5 shadow-sm">
          <h3 className="font-bold text-[#2C2C2C] mb-4">Category Split</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={categoryData} cx="50%" cy="50%" outerRadius={75} dataKey="value" labelLine={false} label={renderCustomLabel}>
                {categoryData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-2">
            {categoryData.map((item) => (
              <div key={item.name} className="flex items-center gap-1.5 text-xs">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-[#666]">{item.name} ({item.value}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payment Method Breakdown */}
      <div className="bg-white rounded-xl border border-[#E8DDD0] p-5 shadow-sm">
        <h3 className="font-bold text-[#2C2C2C] mb-4">Payment Method Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={paymentData} cx="50%" cy="50%" outerRadius={85} dataKey="value" labelLine={false} label={renderCustomLabel}>
                {paymentData.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-3">
            {paymentData.map((item: any) => (
              <div key={item.name} className="flex items-center gap-3">
                <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-semibold text-[#2C2C2C]">{item.name}</span>
                    <span className="text-sm font-bold text-[#C9A84C]">{item.value}%</span>
                  </div>
                  <div className="h-2 bg-[#E8DDD0] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${item.value}%`, backgroundColor: item.color }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
