import { useState } from 'react';
import { useLocation } from 'wouter';
import { Plus, Edit2, Trash2, X, Tag, Loader2 } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { useAdmin } from '@/contexts/AdminContext';
import { trpc } from '@/lib/trpc';
import { CATEGORIES, formatPrice, toNumber } from '@/const';
import { toast } from 'sonner';

/**
 * Admin → Promo Codes
 *
 * These are the codes shoppers type at checkout. Every row is a `promoCodes`
 * row, so creating or deactivating one here immediately changes what
 * `promos.validate` accepts and what the checkout will discount.
 *
 * Previously this page held a hardcoded `initialPromos` array and edited it in
 * React state, which meant the codes shown to staff had no relationship to the
 * codes the store actually honoured.
 */

const emptyForm = {
  code: '',
  discountType: 'percent' as 'percent' | 'flat',
  value: '',
  usageLimit: '',
  expiryDate: '',
  applicableCategory: 'all',
  minOrderAmount: '',
  isActive: true,
  firstOrderOnly: false,
};

export default function AdminPromos() {
  const { isAdminAuthenticated, isCheckingSession } = useAdmin();
  const [, navigate] = useLocation();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  const utils = trpc.useUtils();
  const { data: promos = [], isLoading, isError, error } = trpc.admin.promos.list.useQuery(
    undefined,
    { enabled: isAdminAuthenticated }
  );

  const invalidate = () => {
    utils.admin.promos.list.invalidate();
    utils.promos.validate.invalidate();
  };

  const createPromo = trpc.admin.promos.create.useMutation({
    onSuccess: (p: any) => { invalidate(); setShowForm(false); toast.success(`${p.code} created`); },
    onError: (e: any) => toast.error(e?.message ?? 'Could not create the promo code'),
  });
  const updatePromo = trpc.admin.promos.update.useMutation({
    onSuccess: (p: any) => { invalidate(); setShowForm(false); toast.success(`${p.code} updated`); },
    onError: (e: any) => toast.error(e?.message ?? 'Could not update the promo code'),
  });
  const deletePromo = trpc.admin.promos.delete.useMutation({
    onSuccess: (r: any) => { invalidate(); toast.success(r.message); },
    onError: (e: any) => toast.error(e?.message ?? 'Could not delete the promo code'),
  });

  if (isCheckingSession) {
    return (
      <AdminLayout title="Promo Codes">
        <div className="flex items-center justify-center py-20 text-[#7A7066]">
          <Loader2 className="animate-spin mr-2" size={20} /> Checking your session…
        </div>
      </AdminLayout>
    );
  }

  if (!isAdminAuthenticated) { navigate('/admin/login'); return null; }

  const openAdd = () => { setEditingId(null); setFormData(emptyForm); setShowForm(true); };

  const openEdit = (p: any) => {
    setEditingId(p.id);
    setFormData({
      code: p.code,
      discountType: p.discountType,
      value: String(toNumber(p.value)),
      usageLimit: p.usageLimit ? String(p.usageLimit) : '',
      expiryDate: p.expiryDate ? String(p.expiryDate).slice(0, 10) : '',
      applicableCategory: p.applicableCategory ?? 'all',
      minOrderAmount: String(toNumber(p.minOrderAmount)),
      isActive: p.isActive,
      firstOrderOnly: !!p.firstOrderOnly,
    });
    setShowForm(true);
  };

  const buildPayload = () => ({
    code: formData.code.trim().toUpperCase(),
    discountType: formData.discountType,
    value: formData.value,
    usageLimit: formData.usageLimit ? Number(formData.usageLimit) : null,
    expiryDate: formData.expiryDate || null,
    applicableCategory: formData.applicableCategory,
    minOrderAmount: formData.minOrderAmount || 0,
    isActive: formData.isActive,
    firstOrderOnly: formData.firstOrderOnly,
  });

  const handleSave = () => {
    if (!formData.code.trim()) return toast.error('A code is required');
    if (!formData.value || toNumber(formData.value) <= 0)
      return toast.error('Enter a discount value greater than zero');
    if (formData.discountType === 'percent' && toNumber(formData.value) > 100)
      return toast.error('A percentage discount cannot exceed 100');

    if (editingId) updatePromo.mutate({ id: editingId, data: buildPayload() });
    else createPromo.mutate(buildPayload());
  };

  const handleDelete = (p: any) => {
    if (!confirm(`Delete promo code ${p.code}? Shoppers will no longer be able to use it.`)) return;
    deletePromo.mutate({ id: p.id });
  };

  /** Deactivating is the safe alternative to deleting a code that is in use. */
  const toggleActive = (p: any) => {
    updatePromo.mutate({
      id: p.id,
      data: {
        code: p.code,
        discountType: p.discountType,
        value: p.value,
        usageLimit: p.usageLimit,
        expiryDate: p.expiryDate ? String(p.expiryDate).slice(0, 10) : null,
        applicableCategory: p.applicableCategory,
        minOrderAmount: p.minOrderAmount,
        isActive: !p.isActive,
        firstOrderOnly: p.firstOrderOnly,
      },
    });
  };

  const isSaving = createPromo.isPending || updatePromo.isPending;

  return (
    <AdminLayout title="Promo Codes">
      <div className="flex justify-end mb-6">
        <button onClick={openAdd} className="flex items-center gap-2 px-5 py-2.5 bg-[#C9A84C] text-[#2C2C2C] rounded-xl font-semibold hover:bg-[#D4A5A5] transition-colors text-sm">
          <Plus size={16} /> Create Promo Code
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-[#7A7066]">
          <Loader2 className="animate-spin mr-2" size={18} /> Loading promo codes…
        </div>
      )}
      {isError && (
        <div className="py-16 text-center text-red-600">
          {(error as any)?.message ?? 'Could not load promo codes'}
        </div>
      )}
      {!isLoading && !isError && promos.length === 0 && (
        <div className="py-16 text-center text-[#7A7066]">
          No promo codes yet. Create one to start offering discounts at checkout.
        </div>
      )}

      {/* Promos Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {promos.map((promo: any) => {
          const usagePercent = promo.usageLimit
            ? Math.min(100, (promo.usedCount / promo.usageLimit) * 100)
            : 0;
          const isExpired = promo.expiryDate ? new Date(promo.expiryDate) < new Date() : false;
          return (
            <div key={promo.id} className={`bg-white rounded-xl border ${promo.isActive && !isExpired ? 'border-[#E8DDD0]' : 'border-gray-200 opacity-70'} p-5 shadow-sm`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Tag size={14} className="text-[#C9A84C]" />
                    <span className="font-bold text-[#2C2C2C] text-lg tracking-widest">{promo.code}</span>
                  </div>
                  <p className="text-xs text-[#7A7066]">
                    {promo.applicableCategory === 'all'
                      ? 'All products'
                      : CATEGORIES.find((c) => c.value === promo.applicableCategory)?.label ?? promo.applicableCategory}
                    {toNumber(promo.minOrderAmount) > 0 && ` · min ${formatPrice(promo.minOrderAmount)}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(promo)} className="p-1.5 text-[#C9A84C] hover:bg-[#E8DDD0] rounded-lg"><Edit2 size={13} /></button>
                  <button onClick={() => handleDelete(promo)} disabled={deletePromo.isPending} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg disabled:opacity-40"><Trash2 size={13} /></button>
                </div>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <span className={`text-2xl font-bold ${promo.discountType === 'percent' ? 'text-[#C9A84C]' : 'text-[#D4A5A5]'}`}>
                  {promo.discountType === 'percent' ? `${toNumber(promo.value)}% OFF` : `${formatPrice(promo.value)} OFF`}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${promo.discountType === 'percent' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-600'}`}>
                  {promo.discountType}
                </span>
                {promo.firstOrderOnly && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#2C2C2C] text-[#FAF7F2]">
                    First order only
                  </span>
                )}
              </div>

              {/* Usage Bar */}
              <div className="mb-3">
                <div className="flex justify-between text-xs text-[#7A7066] mb-1">
                  <span>Usage: {promo.usedCount}/{promo.usageLimit ?? '∞'}</span>
                  <span>{usagePercent.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 bg-[#E8DDD0] rounded-full overflow-hidden">
                  <div className="h-full bg-[#C9A84C] rounded-full transition-all" style={{ width: `${usagePercent}%` }} />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className={`${isExpired ? 'text-red-500' : 'text-[#7A7066]'}`}>
                  {promo.expiryDate ? `Expires: ${String(promo.expiryDate).slice(0, 10)}` : 'No expiry'}
                  {isExpired && ' (Expired)'}
                </span>
                <button
                  onClick={() => toggleActive(promo)}
                  disabled={updatePromo.isPending}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${promo.isActive ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700' : 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700'}`}
                >
                  {promo.isActive ? 'Active' : 'Inactive'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-[#E8DDD0]">
              <h2 className="text-lg font-bold text-[#2C2C2C]">{editingId ? 'Edit Promo Code' : 'Create Promo Code'}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-[#E8DDD0] rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">Code *</label>
                <input type="text" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })} disabled={!!editingId}
                  placeholder="e.g. SAVE20" className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C] uppercase font-semibold tracking-wider" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">Discount Type *</label>
                  <select value={formData.discountType} onChange={e => setFormData({ ...formData, discountType: e.target.value as 'percent' | 'flat' })}
                    className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]">
                    <option value="percent">Percentage (%)</option>
                    <option value="flat">Flat Amount (PKR)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">Value *</label>
                  <input type="number" value={formData.value} onChange={e => setFormData({ ...formData, value: e.target.value })}
                    placeholder={formData.discountType === 'percent' ? '10' : '500'} className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">Usage Limit</label>
                  <input type="number" value={formData.usageLimit} onChange={e => setFormData({ ...formData, usageLimit: e.target.value })}
                    placeholder="100" className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">Expiry Date *</label>
                  <input type="date" value={formData.expiryDate} onChange={e => setFormData({ ...formData, expiryDate: e.target.value })}
                    className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">Minimum order (PKR)</label>
                <input type="number" value={formData.minOrderAmount} onChange={e => setFormData({ ...formData, minOrderAmount: e.target.value })} placeholder="0"
                    data-field="minOrderAmount"
                  className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">Applies to</label>
                <select value={formData.applicableCategory} onChange={e => setFormData({ ...formData, applicableCategory: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]">
                  <option value="all">All products</option>
                  {CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formData.isActive} onChange={e => setFormData({ ...formData, isActive: e.target.checked })} className="w-4 h-4 accent-[#C9A84C]" />
                <span className="text-sm font-semibold text-[#2C2C2C]">Active</span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={formData.firstOrderOnly} onChange={e => setFormData({ ...formData, firstOrderOnly: e.target.checked })} className="w-4 h-4 mt-0.5 accent-[#C9A84C]" />
                <span>
                  <span className="block text-sm font-semibold text-[#2C2C2C]">First order only</span>
                  <span className="block text-xs text-[#7A7066]">Rejected at checkout if this email has any past order</span>
                </span>
              </label>
            </div>
            <div className="p-6 border-t border-[#E8DDD0] flex gap-3">
              <button onClick={handleSave} disabled={isSaving} className="flex-1 py-2.5 bg-[#C9A84C] text-[#2C2C2C] rounded-xl font-bold hover:bg-[#D4A5A5] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {isSaving && <Loader2 size={15} className="animate-spin" />}
                {editingId ? 'Update' : 'Create'}
              </button>
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-[#E8DDD0] text-[#7A7066] rounded-xl font-semibold hover:bg-[#FAF7F2] transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
