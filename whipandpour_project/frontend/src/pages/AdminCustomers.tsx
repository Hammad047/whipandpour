import { useState } from 'react';
import { useLocation } from 'wouter';
import { Search, Eye, X, Loader2 } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { useAdmin } from '@/contexts/AdminContext';
import { trpc } from '@/lib/trpc';
import { formatPrice, toNumber } from '@/const';

/**
 * Admin → Customers
 *
 * Customers and their orders come from the database. The Order ID column shows
 * `orders.orderNumber`, the same unique value the shopper sees on their
 * confirmation screen — it is never generated in the frontend.
 */

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString() : '—';

export default function AdminCustomers() {
  const { isAdminAuthenticated, isCheckingSession } = useAdmin();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);

  const { data: customers = [], isLoading, isError, error } =
    trpc.admin.customers.list.useQuery(undefined, { enabled: isAdminAuthenticated });

  if (isCheckingSession) {
    return (
      <AdminLayout title="Customers">
        <div className="flex items-center justify-center py-20 text-[#7A7066]">
          <Loader2 className="animate-spin mr-2" size={20} /> Checking your session…
        </div>
      </AdminLayout>
    );
  }

  if (!isAdminAuthenticated) {
    navigate('/admin/login');
    return null;
  }

  const term = search.trim().toLowerCase();
  const filtered = customers.filter(
    (c: any) =>
      !term ||
      (c.name ?? '').toLowerCase().includes(term) ||
      (c.email ?? '').toLowerCase().includes(term) ||
      (c.city ?? '').toLowerCase().includes(term) ||
      // Let staff paste an order number straight into the search box.
      (c.orders ?? []).some((o: any) => o.orderNumber.toLowerCase().includes(term))
  );

  const totalSpendAll = customers.reduce((sum: number, c: any) => sum + toNumber(c.totalSpent), 0);
  const withOrders = customers.filter((c: any) => c.orderCount > 0);

  return (
    <AdminLayout title="Customers">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Customers', value: customers.length },
          { label: 'Customers With Orders', value: withOrders.length },
          {
            label: 'Avg Orders / Customer',
            value: customers.length
              ? (customers.reduce((sum: number, c: any) => sum + c.orderCount, 0) / customers.length).toFixed(1)
              : '0.0',
          },
          {
            label: 'Avg Spend / Customer',
            value: customers.length ? formatPrice(totalSpendAll / customers.length) : formatPrice(0),
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-[#E8DDD0] p-4">
            <p className="text-2xl font-bold text-[#2C2C2C]">{stat.value}</p>
            <p className="text-xs text-[#7A7066] mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7066]" />
        <input
          type="text"
          placeholder="Search by name, email, city, or order ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-[#E8DDD0] rounded-xl bg-white text-sm text-[#2C2C2C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E8DDD0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#FAF7F2] border-b border-[#E8DDD0]">
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Customer</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">City</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Order ID</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Orders</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Total Spent</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Joined</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">View</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="py-12 text-center text-[#7A7066]"><Loader2 className="animate-spin inline mr-2" size={16} />Loading customers…</td></tr>
              ) : isError ? (
                <tr><td colSpan={7} className="py-12 text-center text-red-600">{(error as any)?.message ?? 'Could not load customers'}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-[#7A7066]">
                  {customers.length === 0 ? 'No customers yet — they appear here after their first order.' : 'No customers match your search'}
                </td></tr>
              ) : filtered.map((c: any) => (
                <tr key={c.id} className="border-t border-[#E8DDD0] hover:bg-[#FAF7F2] transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#C9A84C]/20 flex items-center justify-center text-[#C9A84C] font-bold text-sm flex-shrink-0">
                        {(c.name ?? c.email ?? '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-[#2C2C2C]">{c.name ?? 'Guest customer'}</p>
                        <p className="text-xs text-[#7A7066]">{c.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[#666]">{c.city ?? '—'}</td>
                  <td className="px-5 py-4">
                    {c.latestOrderNumber ? (
                      <span className="font-mono text-xs font-semibold text-[#2C2C2C] bg-[#FAF7F2] border border-[#E8DDD0] rounded-lg px-2 py-1 whitespace-nowrap">
                        {c.latestOrderNumber}
                      </span>
                    ) : (
                      <span className="text-xs text-[#7A7066]">No orders</span>
                    )}
                    {c.orderCount > 1 && (
                      <span className="ml-2 text-xs text-[#7A7066]">+{c.orderCount - 1} more</span>
                    )}
                  </td>
                  <td className="px-5 py-4 font-semibold text-[#2C2C2C]">{c.orderCount}</td>
                  <td className="px-5 py-4 font-semibold text-[#C9A84C] whitespace-nowrap">{formatPrice(c.totalSpent)}</td>
                  <td className="px-5 py-4 text-[#7A7066] whitespace-nowrap">{formatDate(c.joinDate)}</td>
                  <td className="px-5 py-4">
                    <button onClick={() => setSelected(c)} className="p-2 text-[#C9A84C] hover:bg-[#E8DDD0] rounded-lg transition-colors">
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-[#E8DDD0]">
              <h2 className="text-lg font-bold text-[#2C2C2C]">Customer Profile</h2>
              <button onClick={() => setSelected(null)} className="p-2 hover:bg-[#E8DDD0] rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-[#C9A84C]/20 flex items-center justify-center text-[#C9A84C] font-bold text-2xl">
                  {(selected.name ?? selected.email ?? '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-xl font-bold text-[#2C2C2C]">{selected.name ?? 'Guest customer'}</p>
                  <p className="text-sm text-[#7A7066]">{selected.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  { label: 'Phone', value: selected.phone ?? '—' },
                  { label: 'City', value: selected.city ?? '—' },
                  { label: 'Total Orders', value: selected.orderCount },
                  { label: 'Total Spent', value: formatPrice(selected.totalSpent) },
                  { label: 'Member Since', value: formatDate(selected.joinDate) },
                  { label: 'Last Order', value: formatDate(selected.lastOrderDate) },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-[#7A7066] mb-0.5">{item.label}</p>
                    <p className="font-semibold text-[#2C2C2C]">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Every order this customer has placed, by real order ID */}
              <div>
                <p className="text-xs text-[#7A7066] mb-2 uppercase tracking-wider font-semibold">
                  Order history
                </p>
                {(selected.orders ?? []).length === 0 ? (
                  <p className="text-sm text-[#7A7066]">No orders yet.</p>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {selected.orders.map((o: any) => (
                      <div
                        key={o.id}
                        className="flex items-center justify-between gap-3 bg-[#FAF7F2] border border-[#E8DDD0] rounded-lg px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-semibold text-[#2C2C2C]">
                            {o.orderNumber}
                          </p>
                          <p className="text-xs text-[#7A7066]">{formatDate(o.createdAt)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-[#C9A84C]">{formatPrice(o.total)}</p>
                          <p className="text-xs text-[#7A7066] capitalize">
                            {o.status} · payment {o.paymentStatus}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 border-t border-[#E8DDD0]">
              <button onClick={() => setSelected(null)} className="w-full py-2.5 border border-[#E8DDD0] text-[#7A7066] rounded-xl font-semibold hover:bg-[#FAF7F2] transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
