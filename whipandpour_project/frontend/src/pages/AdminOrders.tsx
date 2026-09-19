import { useState } from 'react';
import { useLocation } from 'wouter';
import { Search, Eye, X, Loader2, Gift } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { useAdmin } from '@/contexts/AdminContext';
import { trpc } from '@/lib/trpc';
import { formatPrice } from '@/const';
import { toast } from 'sonner';

/**
 * Admin → Orders
 *
 * Reads real orders. `orderNumber` is generated and stored server-side, so the
 * ID shown here is the same one the customer received.
 *
 * Payment status is displayed but never edited from this screen: an order is
 * only "paid" when a payment gateway confirms it.
 */

type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

const statusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  processing: 'bg-yellow-100 text-yellow-700',
  shipped: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
};

const paymentColors: Record<string, string> = {
  stripe: 'bg-indigo-100 text-indigo-700',
  jazzcash: 'bg-pink-100 text-pink-700',
  easypaisa: 'bg-green-100 text-green-700',
  cod: 'bg-orange-100 text-orange-700',
};

const paymentStatusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-600',
  refunded: 'bg-purple-100 text-purple-700',
};

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString() : '—';

export default function AdminOrders() {
  const { isAdminAuthenticated, isCheckingSession } = useAdmin();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const utils = trpc.useUtils();
  const { data: orders = [], isLoading, isError, error } = trpc.admin.orders.list.useQuery(
    undefined,
    { enabled: isAdminAuthenticated }
  );

  const updateStatusMutation = trpc.admin.orders.updateStatus.useMutation({
    onSuccess: (result: any) => {
      utils.admin.orders.list.invalidate();
      utils.admin.customers.list.invalidate();
      utils.admin.stats.invalidate();
      setSelectedOrder((prev: any) =>
        prev && prev.id === result.id ? { ...prev, status: result.status } : prev
      );
      toast.success(`Order ${result.orderNumber} is now ${result.status}`);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not update the order'),
  });

  const markAdvancePaidMutation = trpc.admin.orders.markAdvancePaid.useMutation({
    onSuccess: (result: any) => {
      utils.admin.orders.list.invalidate();
      setSelectedOrder((prev: any) =>
        prev && prev.id === result.id ? { ...prev, advancePaid: result.advancePaid } : prev
      );
      toast.success(`Advance payment recorded for ${result.orderNumber}`);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not record the advance payment'),
  });

  if (isCheckingSession) {
    return (
      <AdminLayout title="Orders">
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
  const filtered = orders.filter((o: any) => {
    const matchSearch =
      !term ||
      o.orderNumber.toLowerCase().includes(term) ||
      (o.customerName ?? '').toLowerCase().includes(term) ||
      (o.customerEmail ?? '').toLowerCase().includes(term);
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const updateStatus = (id: number, status: OrderStatus) => {
    updateStatusMutation.mutate({ id, status });
  };

  const openDetail = (order: any) => setSelectedOrder(order);

  const statusOptions: (OrderStatus | 'all')[] = ['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'];

  return (
    <AdminLayout title="Orders">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7066]" />
          <input
            type="text"
            placeholder="Search by order ID, customer name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-[#E8DDD0] rounded-xl bg-white text-sm text-[#2C2C2C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-4 py-2.5 border border-[#E8DDD0] rounded-xl bg-white text-sm text-[#2C2C2C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E8DDD0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#FAF7F2] border-b border-[#E8DDD0]">
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Order ID</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Customer</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Total</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Payment</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Paid?</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Status</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Date</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="py-12 text-center text-[#7A7066]"><Loader2 className="animate-spin inline mr-2" size={16} />Loading orders…</td></tr>
              ) : isError ? (
                <tr><td colSpan={8} className="py-12 text-center text-red-600">{(error as any)?.message ?? 'Could not load orders'}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-[#7A7066]">
                  {orders.length === 0 ? 'No orders yet — they appear here as customers check out.' : 'No orders match your filters'}
                </td></tr>
              ) : filtered.map((order: any) => (
                <tr key={order.id} className="border-t border-[#E8DDD0] hover:bg-[#FAF7F2] transition-colors">
                  <td className="px-5 py-4 font-mono text-xs font-semibold text-[#2C2C2C] whitespace-nowrap">{order.orderNumber}</td>
                  <td className="px-5 py-4">
                    <p className="font-medium text-[#2C2C2C]">{order.customerName}</p>
                    <p className="text-xs text-[#7A7066]">{order.customerEmail}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-[#C9A84C] whitespace-nowrap">{formatPrice(order.total)}</p>
                    <p className="text-xs text-[#7A7066]">{order.itemCount} items</p>
                    {order.giftPackaging && (
                      <p className="text-xs text-[#C9A84C] font-semibold flex items-center gap-1 mt-0.5">
                        <Gift size={11} /> Gift wrap
                      </p>
                    )}
                    {order.advanceRequired && (
                      <p className={`text-xs font-semibold mt-0.5 ${order.advancePaid ? 'text-green-700' : 'text-amber-700'}`}>
                        Advance {order.advancePaid ? 'received' : `due: ${formatPrice(order.advanceAmount)}`}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${paymentColors[order.paymentMethod] ?? 'bg-gray-100 text-gray-600'}`}>
                      {order.paymentMethod}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${paymentStatusColors[order.paymentStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                      {order.paymentStatus}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <select
                      value={order.status}
                      disabled={updateStatusMutation.isPending}
                      onChange={(e) => updateStatus(order.id, e.target.value as OrderStatus)}
                      className={`px-2.5 py-1.5 rounded-full text-xs font-semibold border-0 cursor-pointer ${statusColors[order.status]}`}
                    >
                      {(['pending', 'processing', 'shipped', 'delivered', 'cancelled'] as OrderStatus[]).map((s) => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-4 text-[#7A7066] whitespace-nowrap">{formatDate(order.createdAt)}</td>
                  <td className="px-5 py-4">
                    <button onClick={() => openDetail(order)} className="p-2 text-[#C9A84C] hover:bg-[#E8DDD0] rounded-lg transition-colors" title="View details">
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
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-[#E8DDD0]">
              <h2 className="text-lg font-bold text-[#2C2C2C]">Order {selectedOrder.orderNumber}</h2>
              <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-[#E8DDD0] rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-xs text-[#7A7066] mb-1">Customer</p><p className="font-semibold text-[#2C2C2C]">{selectedOrder.customerName}</p></div>
                <div><p className="text-xs text-[#7A7066] mb-1">Email</p><p className="font-medium text-[#2C2C2C] text-xs break-all">{selectedOrder.customerEmail}</p></div>
                <div><p className="text-xs text-[#7A7066] mb-1">Phone</p><p className="font-medium text-[#2C2C2C]">{selectedOrder.customerPhone ?? '—'}</p></div>
                <div><p className="text-xs text-[#7A7066] mb-1">Date</p><p className="font-medium text-[#2C2C2C]">{formatDate(selectedOrder.createdAt)}</p></div>
                <div><p className="text-xs text-[#7A7066] mb-1">Subtotal</p><p className="font-medium text-[#2C2C2C]">{formatPrice(selectedOrder.subtotal)}</p></div>
                <div><p className="text-xs text-[#7A7066] mb-1">Shipping</p><p className="font-medium text-[#2C2C2C]">{formatPrice(selectedOrder.shippingCost)}</p></div>
                <div><p className="text-xs text-[#7A7066] mb-1">Total Amount</p><p className="font-bold text-[#C9A84C]">{formatPrice(selectedOrder.total)}</p></div>
                <div><p className="text-xs text-[#7A7066] mb-1">Items</p><p className="font-semibold text-[#2C2C2C]">{selectedOrder.itemCount} items</p></div>
                <div><p className="text-xs text-[#7A7066] mb-1">Payment Method</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${paymentColors[selectedOrder.paymentMethod] ?? 'bg-gray-100 text-gray-600'}`}>{selectedOrder.paymentMethod}</span>
                </div>
                <div><p className="text-xs text-[#7A7066] mb-1">Payment Status</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${paymentStatusColors[selectedOrder.paymentStatus] ?? 'bg-gray-100 text-gray-600'}`}>{selectedOrder.paymentStatus}</span>
                </div>
              </div>

              {selectedOrder.paymentStatus === 'pending' && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  No payment has been confirmed for this order. Payment status can only be
                  advanced by a verified gateway callback, never from this screen.
                </p>
              )}

              {selectedOrder.advanceRequired && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">
                    30% advance payment
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                    <div>
                      <p className="text-xs text-[#7A7066] mb-0.5">Advance amount</p>
                      <p className="font-semibold text-[#2C2C2C]">{formatPrice(selectedOrder.advanceAmount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#7A7066] mb-0.5">Balance due</p>
                      <p className="font-semibold text-[#2C2C2C]">{formatPrice(selectedOrder.balanceDueAmount)}</p>
                    </div>
                  </div>
                  {selectedOrder.advancePaid ? (
                    <p className="text-xs font-semibold text-green-700">✓ Advance received</p>
                  ) : (
                    <button
                      onClick={() => markAdvancePaidMutation.mutate({ id: selectedOrder.id })}
                      disabled={markAdvancePaidMutation.isPending}
                      className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 transition-colors disabled:opacity-60"
                    >
                      Mark advance received
                    </button>
                  )}
                </div>
              )}

              {selectedOrder.giftPackaging && (
                <div className="bg-[#FAF7F2] border border-[#C9A84C]/40 rounded-xl p-4">
                  <p className="text-xs font-bold text-[#C9A84C] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Gift size={13} /> Gift order — pack accordingly
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-sm mb-2">
                    <div>
                      <p className="text-xs text-[#7A7066] mb-0.5">Card is for</p>
                      <p className="font-semibold text-[#2C2C2C]">
                        {selectedOrder.giftRecipientName || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[#7A7066] mb-0.5">Signed from</p>
                      <p className="font-semibold text-[#2C2C2C]">
                        {selectedOrder.giftSenderName || '—'}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-[#7A7066] mb-1">Handwritten card message</p>
                  <p className="text-sm text-[#2C2C2C] italic whitespace-pre-wrap">
                    {selectedOrder.giftCardMessage || 'No message — send the card blank.'}
                  </p>
                  <p className="text-xs text-[#7A7066] mt-2">
                    Packaging fee charged: {formatPrice(selectedOrder.giftPackagingFee)} · omit prices
                    from the packing slip.
                  </p>
                </div>
              )}

              <div>
                <p className="text-xs text-[#7A7066] mb-1">Shipping Address</p>
                <p className="text-sm text-[#2C2C2C]">
                  {selectedOrder.shippingAddress}, {selectedOrder.shippingCity}{' '}
                  {selectedOrder.shippingZipCode}, {selectedOrder.shippingCountry}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#7A7066] mb-2">Update Status</p>
                <select
                  value={selectedOrder.status}
                  disabled={updateStatusMutation.isPending}
                  onChange={(e) => updateStatus(selectedOrder.id, e.target.value as OrderStatus)}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold border border-[#E8DDD0] cursor-pointer w-full ${statusColors[selectedOrder.status]}`}
                >
                  {(['pending', 'processing', 'shipped', 'delivered', 'cancelled'] as OrderStatus[]).map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs text-[#7A7066] mb-1">Tracking Number</p>
                <p className="text-sm text-[#2C2C2C]">{selectedOrder.trackingNumber || 'Not dispatched yet'}</p>
              </div>
            </div>
            <div className="p-6 border-t border-[#E8DDD0]">
              <button onClick={() => setSelectedOrder(null)} className="w-full py-2.5 border border-[#E8DDD0] text-[#7A7066] rounded-xl font-semibold hover:bg-[#FAF7F2] transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
