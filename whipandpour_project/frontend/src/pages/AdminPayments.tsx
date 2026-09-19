import { useState } from 'react';
import { useLocation } from 'wouter';
import { Search, Download, Loader2, AlertTriangle } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { useAdmin } from '@/contexts/AdminContext';
import { trpc } from '@/lib/trpc';
import { formatPrice, toNumber } from '@/const';

/**
 * Admin → Payments
 *
 * There is no separate payments table: each row here is derived from an order.
 * `paymentStatus` is only ever advanced by a verified gateway callback, so a
 * `pending` row means the money has genuinely not been confirmed — never
 * present it as received.
 *
 * Easypaisa and JazzCash have no gateway integration, so those rows are flagged
 * as needing manual confirmation rather than implying an automated settlement.
 */

const statusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-600',
  refunded: 'bg-gray-100 text-gray-600',
};

const methodColors: Record<string, string> = {
  stripe: 'bg-indigo-100 text-indigo-700',
  jazzcash: 'bg-pink-100 text-pink-700',
  easypaisa: 'bg-green-100 text-green-700',
  cod: 'bg-orange-100 text-orange-700',
};

const methodLabels: Record<string, string> = {
  stripe: '💳 Stripe',
  jazzcash: '📱 JazzCash',
  easypaisa: '📲 Easypaisa',
  cod: '💵 COD',
};

export default function AdminPayments() {
  const { isAdminAuthenticated, isCheckingSession } = useAdmin();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');

  const { data, isLoading, isError, error } = trpc.admin.payments.list.useQuery(undefined, {
    enabled: isAdminAuthenticated,
  });

  if (isCheckingSession) {
    return (
      <AdminLayout title="Payments">
        <div className="flex items-center justify-center py-20 text-[#7A7066]">
          <Loader2 className="animate-spin mr-2" size={20} /> Checking your session…
        </div>
      </AdminLayout>
    );
  }

  if (!isAdminAuthenticated) { navigate('/admin/login'); return null; }

  const transactions = data?.records ?? [];
  const term = search.trim().toLowerCase();

  const filtered = transactions.filter((t: any) => {
    const matchSearch =
      !term ||
      t.orderNumber.toLowerCase().includes(term) ||
      (t.customerName || '').toLowerCase().includes(term) ||
      (t.customerEmail || '').toLowerCase().includes(term) ||
      (t.gatewayReference || '').toLowerCase().includes(term);
    const matchStatus = statusFilter === 'all' || t.paymentStatus === statusFilter;
    const matchMethod = methodFilter === 'all' || t.method === methodFilter;
    return matchSearch && matchStatus && matchMethod;
  });

  const totals = data?.totals ?? { all: '0', confirmed: '0', pending: '0', failed: '0' };
  const awaitingManual = transactions.filter(
    (t: any) => t.requiresManualConfirmation && t.paymentStatus === 'pending'
  ).length;

  return (
    <AdminLayout title="Payments">
      {awaitingManual > 0 && (
        <div className="mb-5 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            <strong>{awaitingManual} order(s) need manual payment confirmation.</strong>{' '}
            Easypaisa and JazzCash have no gateway integration in this store, so those
            payments cannot confirm themselves. Verify the transfer with the customer,
            then record it once a gateway or reconciliation process is in place.
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Confirmed by a gateway', value: formatPrice(totals.confirmed), color: 'text-green-600' },
          { label: 'Awaiting payment', value: formatPrice(totals.pending), color: 'text-amber-600' },
          { label: 'Total ordered', value: formatPrice(totals.all), color: 'text-[#C9A84C]' },
          { label: 'Transactions', value: String(transactions.length), color: 'text-[#2C2C2C]' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-[#E8DDD0] p-4">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-[#7A7066] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Payment Method Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {(['cod', 'jazzcash', 'easypaisa', 'stripe'] as const).map((method) => {
          const count = transactions.filter((t: any) => t.method === method).length;
          const confirmed = transactions
            .filter((t: any) => t.method === method && t.paymentStatus === 'completed')
            .reduce((sum: number, t: any) => sum + toNumber(t.amount), 0);
          return (
            <div key={method} className={`rounded-xl border p-4 ${methodColors[method].includes('indigo') ? 'bg-indigo-50 border-indigo-200' : method === 'jazzcash' ? 'bg-pink-50 border-pink-200' : method === 'easypaisa' ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
              <p className={`text-sm font-bold ${methodColors[method].split(' ')[1]}`}>{methodLabels[method]}</p>
              <p className="text-lg font-bold text-[#2C2C2C] mt-1">{count} txns</p>
              <p className="text-xs text-[#7A7066]">{formatPrice(confirmed)} confirmed</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7066]" />
          <input
            type="text"
            placeholder="Search by order ID, customer or reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-[#E8DDD0] rounded-xl bg-white text-sm text-[#2C2C2C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 border border-[#E8DDD0] rounded-xl bg-white text-sm text-[#2C2C2C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]">
          <option value="all">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
        <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}
          className="px-4 py-2.5 border border-[#E8DDD0] rounded-xl bg-white text-sm text-[#2C2C2C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]">
          <option value="all">All Methods</option>
          <option value="cod">COD</option>
          <option value="jazzcash">JazzCash</option>
          <option value="easypaisa">Easypaisa</option>
          <option value="stripe">Stripe</option>
        </select>
      </div>

      {/* Transaction Table */}
      <div className="bg-white rounded-xl border border-[#E8DDD0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#FAF7F2] border-b border-[#E8DDD0]">
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Transaction ID</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Order</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Customer</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Amount</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Method</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Status</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Reference</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="py-12 text-center text-[#7A7066]"><Loader2 className="animate-spin inline mr-2" size={16} />Loading payments…</td></tr>
              ) : isError ? (
                <tr><td colSpan={8} className="py-12 text-center text-red-600">{(error as any)?.message ?? 'Could not load payments'}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-[#7A7066]">
                  {transactions.length === 0 ? 'No payments yet — records appear here as orders are placed.' : 'No transactions match your filters.'}
                </td></tr>
              ) : filtered.map((txn: any) => (
                <tr key={txn.id} className="border-t border-[#E8DDD0] hover:bg-[#FAF7F2] transition-colors">
                  <td className="px-5 py-4 font-mono text-xs text-[#7A7066]">#{txn.id}</td>
                  <td className="px-5 py-4 font-mono text-xs font-semibold text-[#2C2C2C] whitespace-nowrap">{txn.orderNumber}</td>
                  <td className="px-5 py-4">
                    <p className="font-medium text-[#2C2C2C]">{txn.customerName}</p>
                    <p className="text-xs text-[#7A7066]">{txn.customerEmail}</p>
                  </td>
                  <td className="px-5 py-4 font-bold text-[#C9A84C] whitespace-nowrap">{formatPrice(txn.amount)}</td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${methodColors[txn.method]}`}>
                      {methodLabels[txn.method]}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[txn.paymentStatus]}`}>
                      {txn.paymentStatus.charAt(0).toUpperCase() + txn.paymentStatus.slice(1)}
                    </span>
                    {txn.requiresManualConfirmation && txn.paymentStatus === 'pending' && (
                      <span className="block text-[10px] text-amber-700 mt-1">confirm manually</span>
                    )}
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-[#7A7066] max-w-[140px] truncate">
                    {txn.gatewayReference || <span className="italic text-[#B0A79C]">no gateway reference</span>}
                  </td>
                  <td className="px-5 py-4 text-[#7A7066] whitespace-nowrap">
                    {txn.createdAt ? new Date(txn.createdAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#E8DDD0] bg-[#FAF7F2] flex items-center justify-between">
          <p className="text-xs text-[#7A7066]">Showing {filtered.length} of {transactions.length} transactions</p>
          <button className="flex items-center gap-1.5 text-xs text-[#C9A84C] font-semibold hover:underline">
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}
