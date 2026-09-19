import { useState } from 'react';
import { useLocation } from 'wouter';
import { Search, CheckCircle, XCircle, Star, Trash2, Loader2 } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { useAdmin } from '@/contexts/AdminContext';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

/**
 * Admin → Reviews
 *
 * Moderation queue. A review only appears on its product page once it is
 * approved here, and approving or rejecting one recomputes that product's
 * `averageRating` and `reviewCount` from approved reviews — so the stars a
 * shopper sees always match the reviews they can actually read.
 *
 * Previously this page edited a hardcoded array, so "approving" a review had
 * no effect on the storefront at all.
 */

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
};

export default function AdminReviews() {
  const { isAdminAuthenticated, isCheckingSession } = useAdmin();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const utils = trpc.useUtils();
  const { data: reviews = [], isLoading, isError, error } = trpc.admin.reviews.list.useQuery(
    undefined,
    { enabled: isAdminAuthenticated }
  );

  /** Moderation changes product ratings, so refresh the storefront caches too. */
  const invalidate = () => {
    utils.admin.reviews.list.invalidate();
    utils.products.list.invalidate();
    utils.products.bySlug.invalidate();
    utils.products.byId.invalidate();
    utils.reviews.byProduct.invalidate();
    utils.admin.products.list.invalidate();
  };

  const setStatus = trpc.admin.reviews.updateStatus.useMutation({
    onSuccess: (r: any) => { invalidate(); toast.success(`Review ${r.status}`); },
    onError: (e: any) => toast.error(e?.message ?? 'Could not update the review'),
  });

  const removeReview = trpc.admin.reviews.delete.useMutation({
    onSuccess: () => { invalidate(); toast.success('Review deleted'); },
    onError: (e: any) => toast.error(e?.message ?? 'Could not delete the review'),
  });

  if (isCheckingSession) {
    return (
      <AdminLayout title="Reviews">
        <div className="flex items-center justify-center py-20 text-[#7A7066]">
          <Loader2 className="animate-spin mr-2" size={20} /> Checking your session…
        </div>
      </AdminLayout>
    );
  }

  if (!isAdminAuthenticated) { navigate('/admin/login'); return null; }

  const term = search.trim().toLowerCase();
  const filtered = reviews.filter((r: any) => {
    const matchSearch =
      !term ||
      r.productName.toLowerCase().includes(term) ||
      r.customerName.toLowerCase().includes(term) ||
      (r.title || '').toLowerCase().includes(term);
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const updateStatus = (id: number, status: 'approved' | 'rejected' | 'pending') => {
    setStatus.mutate({ id, status });
  };

  const handleDelete = (review: any) => {
    if (!confirm(`Delete this review of ${review.productName}? This cannot be undone.`)) return;
    removeReview.mutate({ id: review.id });
  };

  const pendingCount = reviews.filter((r: any) => r.status === 'pending').length;

  return (
    <AdminLayout title="Reviews">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Reviews', value: reviews.length, color: 'text-[#2C2C2C]' },
          { label: 'Pending Review', value: pendingCount, color: 'text-yellow-600' },
          { label: 'Approved (live on site)', value: reviews.filter((r: any) => r.status === 'approved').length, color: 'text-green-600' },
          {
            label: 'Avg Rating (approved)',
            value: (() => {
              const approved = reviews.filter((r: any) => r.status === 'approved');
              return approved.length
                ? (approved.reduce((sum: number, r: any) => sum + r.rating, 0) / approved.length).toFixed(1) + ' ★'
                : '—';
            })(),
            color: 'text-[#C9A84C]',
          },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-[#E8DDD0] p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-[#7A7066] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7066]" />
          <input
            type="text"
            placeholder="Search by product or customer name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-[#E8DDD0] rounded-xl bg-white text-sm text-[#2C2C2C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all capitalize ${
                statusFilter === s ? 'bg-[#C9A84C] text-[#2C2C2C]' : 'bg-white border border-[#E8DDD0] text-[#7A7066] hover:border-[#C9A84C]'
              }`}
            >
              {s}
              {s === 'pending' && pendingCount > 0 && (
                <span className="ml-1 bg-yellow-500 text-white text-xs rounded-full px-1.5 py-0.5">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-[#7A7066]">
            <Loader2 className="animate-spin mr-2" size={18} /> Loading reviews…
          </div>
        )}
        {isError && (
          <div className="py-16 text-center text-red-600">
            {(error as any)?.message ?? 'Could not load reviews'}
          </div>
        )}
        {!isLoading && !isError && filtered.length === 0 && (
          <div className="py-16 text-center text-[#7A7066]">
            {reviews.length === 0 ? 'No reviews yet.' : 'No reviews match your filters.'}
          </div>
        )}
        {filtered.map((review: any) => (
          <div key={review.id} className={`bg-white rounded-xl border ${review.status === 'pending' ? 'border-yellow-200' : 'border-[#E8DDD0]'} p-5 shadow-sm`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Header */}
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="font-bold text-[#2C2C2C]">{review.customerName}</span>
                  {review.isVerifiedPurchase && (
                    <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                      <CheckCircle size={11} />Verified Purchase
                    </span>
                  )}
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColors[review.status]}`}>
                    {review.status}
                  </span>
                  <span className="text-xs text-[#7A7066]">
                    {review.createdAt ? new Date(review.createdAt).toLocaleDateString() : '—'}
                  </span>
                </div>

                {/* Product + Rating */}
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs text-[#7A7066] bg-[#FAF7F2] px-2.5 py-1 rounded-full border border-[#E8DDD0]">
                    📦 {review.productName}
                  </span>
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(star => (
                      <Star
                        key={star}
                        size={13}
                        className={star <= review.rating ? 'fill-[#C9A84C] text-[#C9A84C]' : 'text-[#E8DDD0]'}
                      />
                    ))}
                    <span className="text-xs text-[#7A7066] ml-1">({review.rating}/5)</span>
                  </div>
                </div>

                {/* Review Content */}
                {review.title && <p className="font-semibold text-[#2C2C2C] mb-1 text-sm">"{review.title}"</p>}
                <p className="text-sm text-[#666] leading-relaxed">{review.body}</p>
                <p className="text-xs text-[#7A7066] mt-2">👍 {review.helpful} people found this helpful</p>
                <p className="text-xs mt-1.5 font-medium">
                  {review.status === 'approved' ? (
                    <span className="text-green-700">Live on the product page — counts towards its rating</span>
                  ) : (
                    <span className="text-[#7A7066]">Hidden from the product page</span>
                  )}
                </p>
              </div>

              {/* Action Buttons */}
              {review.status === 'pending' && (
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={() => updateStatus(review.id, 'approved')}
                    disabled={setStatus.isPending}
                    className="flex items-center gap-1.5 px-3 py-2 disabled:opacity-40 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-xs font-semibold"
                  >
                    <CheckCircle size={14} /> Approve
                  </button>
                  <button
                    onClick={() => updateStatus(review.id, 'rejected')}
                    disabled={setStatus.isPending}
                    className="flex items-center gap-1.5 px-3 py-2 disabled:opacity-40 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-xs font-semibold"
                  >
                    <XCircle size={14} /> Reject
                  </button>
                </div>
              )}
              {review.status !== 'pending' && (
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {review.status === 'approved' && (
                    <button onClick={() => updateStatus(review.id, 'rejected')} disabled={setStatus.isPending} className="px-3 py-2 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors font-medium disabled:opacity-40">
                      Reject
                    </button>
                  )}
                  {review.status === 'rejected' && (
                    <button onClick={() => updateStatus(review.id, 'approved')} disabled={setStatus.isPending} className="px-3 py-2 text-xs text-green-600 hover:bg-green-50 rounded-lg transition-colors font-medium disabled:opacity-40">
                      Approve
                    </button>
                  )}
                  <button onClick={() => handleDelete(review)} disabled={removeReview.isPending} className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-400 hover:bg-red-50 rounded-lg transition-colors font-medium disabled:opacity-40">
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-[#7A7066]">No reviews found</div>
        )}
      </div>
    </AdminLayout>
  );
}
