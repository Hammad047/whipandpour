import { useState } from 'react';
import { useLocation } from 'wouter';
import { Plus, Edit2, Trash2, X, Loader2, Upload, Eye, EyeOff } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { useAdmin } from '@/contexts/AdminContext';
import { trpc } from '@/lib/trpc';
import { uploadImage } from '@/lib/uploadImage';
import { toast } from 'sonner';

type CollectionRow = {
  value: string;
  label: string;
  description: string | null;
  coverImage: string | null;
  isActive: boolean;
  productCount: number;
};

type FormState = {
  label: string;
  description: string;
  coverImage: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = { label: '', description: '', coverImage: '', isActive: true };
const NAME_MAX = 100;
const DESCRIPTION_MAX = 500;

function validateForm(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  const label = form.label.trim();
  if (!label) errors.label = 'Enter a collection name';
  else if (label.length > NAME_MAX) errors.label = `Keep the name under ${NAME_MAX} characters`;
  if (form.description.trim().length > DESCRIPTION_MAX) {
    errors.description = `Keep the description under ${DESCRIPTION_MAX} characters`;
  }
  const cover = form.coverImage.trim();
  if (cover && !/^(https?:\/\/|\/)/.test(cover)) {
    errors.coverImage = 'Upload an image, or paste a link that starts with https://';
  }
  return errors;
}

export default function AdminCollections() {
  const { isAdminAuthenticated, isCheckingSession } = useAdmin();
  const [, navigate] = useLocation();

  const [showForm, setShowForm] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [imageLink, setImageLink] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverBroken, setCoverBroken] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CollectionRow | null>(null);
  const [moveTo, setMoveTo] = useState('');

  const utils = trpc.useUtils();
  const { data: collections = [], isLoading, isError } = trpc.admin.collections.list.useQuery(undefined, {
    enabled: isAdminAuthenticated,
  });
  const rows = collections as CollectionRow[];

  const invalidateAll = () => {
    utils.admin.collections.list.invalidate();
    utils.products.categories.invalidate();
    utils.products.list.invalidate();
    utils.admin.products.list.invalidate();
  };

  const createMutation = trpc.admin.collections.create.useMutation({
    onSuccess: (collection: any) => {
      invalidateAll();
      closeForm();
      toast.success(`Collection “${collection.label}” created`);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not create the collection'),
  });

  const updateMutation = trpc.admin.collections.update.useMutation({
    onSuccess: (collection: any) => {
      invalidateAll();
      closeForm();
      toast.success(`“${collection.label}” saved`);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not save the collection'),
  });

  const deleteMutation = trpc.admin.collections.delete.useMutation({
    onSuccess: (result: any) => {
      invalidateAll();
      setDeleteTarget(null);
      toast.success(
        result.movedProducts > 0
          ? `Collection deleted. ${result.movedProducts} product${result.movedProducts === 1 ? '' : 's'} moved to “${
              rows.find((r) => r.value === result.movedTo)?.label ?? result.movedTo
            }”.`
          : 'Collection deleted'
      );
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not delete the collection'),
  });

  if (isCheckingSession) {
    return (
      <AdminLayout title="Collections">
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

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function openCreate() {
    setEditingSlug(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setImageLink('');
    setCoverBroken(false);
    setShowForm(true);
  }

  function openEdit(row: CollectionRow) {
    setEditingSlug(row.value);
    setForm({
      label: row.label,
      description: row.description ?? '',
      coverImage: row.coverImage ?? '',
      isActive: row.isActive,
    });
    setErrors({});
    setImageLink('');
    setCoverBroken(false);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingSlug(null);
  }

  async function handleCoverFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploadingCover(true);
    setErrors((e) => ({ ...e, coverImage: undefined }));
    try {
      const url = await uploadImage(file);
      setCoverBroken(false);
      setForm((f) => ({ ...f, coverImage: url }));
      toast.success('Cover image uploaded. Save the collection to keep it.');
    } catch (error: any) {
      setErrors((e) => ({ ...e, coverImage: error?.message || 'Image upload failed' }));
      toast.error(error?.message || 'Image upload failed');
    } finally {
      setUploadingCover(false);
    }
  }

  function handleSave() {
    const found = validateForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const payload = {
      label: form.label.trim(),
      description: form.description.trim(),
      coverImage: form.coverImage.trim(),
      isActive: form.isActive,
    };
    if (editingSlug) updateMutation.mutate({ slug: editingSlug, data: payload });
    else createMutation.mutate(payload);
  }

  function openDelete(row: CollectionRow) {
    setDeleteTarget(row);
    const other = rows.find((r) => r.value !== row.value);
    setMoveTo(other?.value ?? '');
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.productCount > 0 && !moveTo) {
      toast.error('Choose a collection to move the products into');
      return;
    }
    deleteMutation.mutate({
      slug: deleteTarget.value,
      moveTo: deleteTarget.productCount > 0 ? moveTo : undefined,
    });
  }

  function toggleActive(row: CollectionRow) {
    updateMutation.mutate(
      { slug: row.value, data: { isActive: !row.isActive } },
      {
        onSuccess: () =>
          toast.success(row.isActive ? `“${row.label}” is hidden from the store` : `“${row.label}” is live on the store`),
      }
    );
  }

  const deleteOptions = rows.filter((r) => r.value !== deleteTarget?.value);

  return (
    <AdminLayout title="Collections">
      <div className="flex items-center justify-between gap-4 mb-6">
        <p className="text-sm text-[#7A7066] max-w-2xl">
          Collections group your products on the website. Inactive collections are hidden from the store, and their
          products are kept.
        </p>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#C9A84C] text-[#2C2C2C] rounded-xl font-bold hover:bg-[#D4A5A5] transition-colors whitespace-nowrap"
        >
          <Plus size={16} /> Add New Collection
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[#E8DDD0] shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-[#7A7066]">
            <Loader2 className="animate-spin mr-2" size={18} /> Loading collections…
          </div>
        ) : isError ? (
          <p className="text-center py-16 text-sm text-red-600">Could not load collections. Refresh the page to try again.</p>
        ) : rows.length === 0 ? (
          <p className="text-center py-16 text-sm text-[#7A7066]">No collections yet. Add your first one.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#FAF7F2] text-left text-xs uppercase tracking-wider text-[#7A7066]">
              <tr>
                <th className="px-5 py-3 font-semibold">Cover</th>
                <th className="px-5 py-3 font-semibold">Collection</th>
                <th className="px-5 py-3 font-semibold">Products</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8DDD0]">
              {rows.map((row) => (
                <tr key={row.value} className="hover:bg-[#FAF7F2]/60">
                  <td className="px-5 py-3">
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-[#FAF7F2] border border-[#E8DDD0]">
                      {row.coverImage ? (
                        <img src={row.coverImage} alt="" className="w-full h-full object-cover" />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-semibold text-[#2C2C2C]">{row.label}</p>
                    <p className="text-xs text-[#7A7066] font-mono">{row.value}</p>
                    {row.description ? (
                      <p className="text-xs text-[#7A7066] mt-1 line-clamp-2 max-w-md">{row.description}</p>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-[#2C2C2C]">{row.productCount}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        row.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {row.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => toggleActive(row)}
                        disabled={updateMutation.isPending}
                        className="p-2 text-[#7A7066] hover:bg-[#E8DDD0] rounded-lg transition-colors disabled:opacity-40"
                        title={row.isActive ? 'Hide from store' : 'Show in store'}
                      >
                        {row.isActive ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                      <button
                        onClick={() => openEdit(row)}
                        className="p-2 text-[#C9A84C] hover:bg-[#E8DDD0] rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => openDelete(row)}
                        className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-[#E8DDD0]">
              <h2 className="text-lg font-bold text-[#2C2C2C]">
                {editingSlug ? 'Edit Collection' : 'Add New Collection'}
              </h2>
              <button onClick={closeForm} className="p-2 hover:bg-[#E8DDD0] rounded-lg" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto min-h-0">
              <div>
                <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">Collection name *</label>
                <input
                  type="text"
                  value={form.label}
                  maxLength={NAME_MAX + 20}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g. Ice Bath Candles"
                  className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                />
                {errors.label && <p className="text-xs text-red-600 mt-1">{errors.label}</p>}
                {editingSlug && (
                  <p className="text-xs text-[#7A7066] mt-1">
                    Web address stays <span className="font-mono">/collection/{editingSlug}</span> after renaming.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="A short line shown on the collection page (optional)"
                  className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C] resize-none"
                />
                <div className="flex justify-between text-xs mt-1">
                  {errors.description ? <span className="text-red-600">{errors.description}</span> : <span />}
                  <span className="text-[#7A7066]">
                    {form.description.trim().length}/{DESCRIPTION_MAX}
                  </span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-semibold text-[#2C2C2C]">Cover image</label>
                  <label
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap ${
                      uploadingCover
                        ? 'bg-gray-100 text-gray-400 cursor-wait'
                        : 'bg-[#2C2C2C] text-white hover:bg-[#444] cursor-pointer'
                    }`}
                  >
                    <Upload size={14} />
                    {uploadingCover ? 'Uploading...' : 'Upload image'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingCover}
                      onChange={handleCoverFile}
                    />
                  </label>
                </div>

                {form.coverImage ? (
                  <div className="flex items-start gap-3">
                    <div className="w-28 h-20 rounded-xl overflow-hidden border border-[#E8DDD0] bg-[#FAF7F2] flex-shrink-0">
                      {coverBroken ? null : (
                        <img
                          src={form.coverImage}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={() => setCoverBroken(true)}
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {coverBroken ? (
                        <p className="text-xs text-red-600 mb-2">
                          This image could not be loaded. Upload it again or replace it.
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setForm({ ...form, coverImage: '' });
                          setCoverBroken(false);
                        }}
                        className="text-xs font-semibold text-[#D4A5A5] hover:text-red-600"
                      >
                        Remove cover image
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[#7A7066] italic">No cover yet. The collection shows without an image.</p>
                )}

                <div className="flex gap-2 mt-3">
                  <input
                    type="url"
                    value={imageLink}
                    onChange={(e) => setImageLink(e.target.value)}
                    placeholder="Or paste an image link (https://...)"
                    className="flex-1 px-3 py-2 border border-[#E8DDD0] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                  />
                  <button
                    type="button"
                    disabled={!imageLink.trim()}
                    onClick={() => {
                      setForm({ ...form, coverImage: imageLink.trim() });
                      setCoverBroken(false);
                      setImageLink('');
                    }}
                    className="px-3 py-2 text-xs font-semibold bg-[#E8DDD0] text-[#2C2C2C] rounded-xl hover:bg-[#D4A5A5] transition-colors disabled:opacity-40"
                  >
                    Use link
                  </button>
                </div>
                {errors.coverImage && <p className="text-xs text-red-600 mt-1">{errors.coverImage}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">Status</label>
                <select
                  value={form.isActive ? 'active' : 'inactive'}
                  onChange={(e) => setForm({ ...form, isActive: e.target.value === 'active' })}
                  className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                >
                  <option value="active">Active: shown on the website</option>
                  <option value="inactive">Inactive: hidden from the website</option>
                </select>
              </div>
            </div>

            <div className="p-6 border-t border-[#E8DDD0] flex gap-3">
              <button
                onClick={handleSave}
                disabled={isSaving || uploadingCover}
                className="flex-1 py-2.5 bg-[#C9A84C] text-[#2C2C2C] rounded-xl font-bold hover:bg-[#D4A5A5] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isSaving && <Loader2 size={15} className="animate-spin" />}
                {editingSlug ? 'Save Changes' : 'Save Collection'}
              </button>
              <button
                onClick={closeForm}
                className="flex-1 py-2.5 border border-[#E8DDD0] text-[#7A7066] rounded-xl font-semibold hover:bg-[#FAF7F2] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-[#E8DDD0]">
              <h2 className="text-lg font-bold text-[#2C2C2C]">Delete “{deleteTarget.label}”?</h2>
            </div>
            <div className="p-6 space-y-4 text-sm text-[#2C2C2C]">
              {deleteTarget.productCount > 0 ? (
                <>
                  <p>
                    This collection has {deleteTarget.productCount} product
                    {deleteTarget.productCount === 1 ? '' : 's'}. Choose where to move{' '}
                    {deleteTarget.productCount === 1 ? 'it' : 'them'}. The products themselves are kept.
                  </p>
                  {deleteOptions.length > 0 ? (
                    <select
                      value={moveTo}
                      onChange={(e) => setMoveTo(e.target.value)}
                      className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                    >
                      {deleteOptions.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                          {r.isActive ? '' : ' (inactive)'}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-red-600">Add another collection first. Products need a collection to move into.</p>
                  )}
                </>
              ) : (
                <p className="text-[#7A7066]">This collection has no products. This cannot be undone.</p>
              )}
            </div>
            <div className="p-6 border-t border-[#E8DDD0] flex gap-3">
              <button
                onClick={confirmDelete}
                disabled={
                  deleteMutation.isPending || (deleteTarget.productCount > 0 && (!moveTo || deleteOptions.length === 0))
                }
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {deleteMutation.isPending && <Loader2 size={15} className="animate-spin" />}
                Delete collection
              </button>
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 border border-[#E8DDD0] text-[#7A7066] rounded-xl font-semibold hover:bg-[#FAF7F2] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
