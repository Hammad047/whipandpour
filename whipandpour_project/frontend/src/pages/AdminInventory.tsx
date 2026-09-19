import { useState } from 'react';
import { useLocation } from 'wouter';
import { AlertTriangle, Package, TrendingDown, RefreshCw, Loader2 } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { useAdmin } from '@/contexts/AdminContext';
import { trpc } from '@/lib/trpc';
import { categoryLabel, formatPrice } from '@/const';
import { toast } from 'sonner';

/**
 * Admin → Inventory
 *
 * Stock levels are read from and written to the products table. The previous
 * version kept an 8-row hardcoded array in `useState`, so a restock was
 * discarded the moment the page unmounted and never reached the storefront.
 */
export default function AdminInventory() {
  const { isAdminAuthenticated, isCheckingSession } = useAdmin();
  const [, navigate] = useLocation();
  const [restockAmounts, setRestockAmounts] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');

  const utils = trpc.useUtils();
  const { data: inventory = [], isLoading, isError, error } = trpc.admin.products.list.useQuery(
    undefined,
    { enabled: isAdminAuthenticated }
  );

  const restock = trpc.admin.inventory.restock.useMutation({
    onSuccess: (product: any) => {
      utils.admin.products.list.invalidate();
      utils.admin.stats.invalidate();
      utils.products.list.invalidate();
      toast.success(`${product.name} restocked — now ${product.stock} units`);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not restock this product'),
  });

  if (isCheckingSession) {
    return (
      <AdminLayout title="Inventory">
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

  const lowStockItems = inventory.filter((i: any) => i.stock > 0 && i.stock < 10);
  const outOfStockItems = inventory.filter((i: any) => i.stock === 0);

  const filtered = inventory.filter((item: any) => {
    if (filter === 'low') return item.stock > 0 && item.stock < 10;
    if (filter === 'out') return item.stock === 0;
    return true;
  });

  const handleRestock = (id: number) => {
    const amount = parseInt(restockAmounts[id] || '0', 10);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid restock quantity');
      return;
    }
    restock.mutate({ id, amount });
    setRestockAmounts({ ...restockAmounts, [id]: '' });
  };

  const getStockStatus = (item: any) => {
    if (item.stock === 0) return { label: 'Out of Stock', class: 'bg-red-100 text-red-700 border-red-200' };
    if (item.stock < 10) return { label: 'Low Stock', class: 'bg-orange-100 text-orange-700 border-orange-200' };
    return { label: 'In Stock', class: 'bg-green-100 text-green-700 border-green-200' };
  };

  return (
    <AdminLayout title="Inventory">
      {/* Alert Banner */}
      {(lowStockItems.length > 0 || outOfStockItems.length > 0) && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-700 text-sm">Inventory Alert</p>
            <p className="text-sm text-red-600 mt-0.5">
              {outOfStockItems.length > 0 && `${outOfStockItems.length} product(s) are OUT OF STOCK. `}
              {lowStockItems.length > 0 && `${lowStockItems.length} product(s) have LOW STOCK (under 10 units).`}
            </p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Products', value: inventory.length, icon: Package, color: 'text-[#C9A84C]' },
          { label: 'In Stock', value: inventory.filter((i: any) => i.stock >= 10).length, icon: Package, color: 'text-green-600' },
          { label: 'Low Stock (<10)', value: lowStockItems.length, icon: TrendingDown, color: 'text-orange-600' },
          { label: 'Out of Stock', value: outOfStockItems.length, icon: AlertTriangle, color: 'text-red-600' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white rounded-xl border border-[#E8DDD0] p-4">
              <div className="flex items-center justify-between mb-2">
                <Icon size={18} className={s.color} />
              </div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-[#7A7066] mt-1">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-5">
        {(['all', 'low', 'out'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              filter === f ? 'bg-[#C9A84C] text-[#2C2C2C]' : 'bg-white border border-[#E8DDD0] text-[#7A7066] hover:border-[#C9A84C]'
            }`}
          >
            {f === 'all' ? 'All Products' : f === 'low' ? `⚠️ Low Stock (${lowStockItems.length})` : `🔴 Out of Stock (${outOfStockItems.length})`}
          </button>
        ))}
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-xl border border-[#E8DDD0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#FAF7F2] border-b border-[#E8DDD0]">
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Product</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Category</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Stock</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Status</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Price</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Last Updated</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Restock</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="py-12 text-center text-[#7A7066]"><Loader2 className="animate-spin inline mr-2" size={16} />Loading inventory…</td></tr>
              ) : isError ? (
                <tr><td colSpan={7} className="py-12 text-center text-red-600">{(error as any)?.message ?? 'Could not load inventory'}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-[#7A7066]">No products in this view</td></tr>
              ) : filtered.map((item: any) => {
                const status = getStockStatus(item);
                const isLowOrOut = item.stock < 10;
                return (
                  <tr key={item.id} className={`border-t border-[#E8DDD0] transition-colors ${isLowOrOut ? 'bg-red-50/40 hover:bg-red-50/60' : 'hover:bg-[#FAF7F2]'}`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#FAF7F2] border border-[#E8DDD0] flex-shrink-0">
                          <img src={(item.images ?? [])[0] || `/images/products/${item.category}-1.svg`} alt={item.name} className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = `/images/products/${item.category}-1.svg`; }} />
                        </div>
                        <div>
                          <p className="font-semibold text-[#2C2C2C]">{item.name}</p>
                          {isLowOrOut && (
                            <p className="text-xs text-red-500 flex items-center gap-1">
                              <AlertTriangle size={10} /> Needs restocking
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FAF7F2] border border-[#E8DDD0] text-[#2C2C2C] whitespace-nowrap">
                        {categoryLabel(item.category)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xl font-bold ${item.stock === 0 ? 'text-red-600' : item.stock < 10 ? 'text-orange-600' : 'text-green-600'}`}>
                        {item.stock}
                      </span>
                      <span className="text-xs text-[#7A7066] ml-1">units</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${status.class}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-[#C9A84C] whitespace-nowrap">{formatPrice(item.price)}</td>
                    <td className="px-5 py-4 text-[#7A7066] text-xs whitespace-nowrap">
                      {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          placeholder="Qty"
                          value={restockAmounts[item.id] || ''}
                          onChange={(e) => setRestockAmounts({ ...restockAmounts, [item.id]: e.target.value })}
                          className="w-16 px-2 py-1.5 border border-[#E8DDD0] rounded-lg text-xs text-center focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                        />
                        <button
                          onClick={() => handleRestock(item.id)}
                          disabled={restock.isPending}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-[#C9A84C] text-[#2C2C2C] rounded-lg text-xs font-semibold hover:bg-[#D4A5A5] transition-colors disabled:opacity-50"
                        >
                          <RefreshCw size={11} /> Add
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
