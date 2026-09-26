import { useState } from 'react';
import { useLocation } from 'wouter';
import { Plus, Edit2, Trash2, Search, X, Loader2, Upload } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { useAdmin } from '@/contexts/AdminContext';
import { trpc } from '@/lib/trpc';
import { CATEGORIES, categoryLabel, formatPrice, toNumber } from '@/const';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL;

/**
 * Admin → Products
 *
 * Every row here comes from `admin.products.list` and every change goes through
 * a mutation that writes to the database.
 *
 * This page previously held a hardcoded `initialProducts` array in `useState`
 * and mutated it locally. Nothing was ever sent to a server, so a product
 * "added" here existed only until the component unmounted — which is exactly
 * what navigating to another admin page does. That was the root cause of the
 * disappearing-product bug, not a refresh or caching problem.
 */

const emptyForm = {
  name: '',
  slug: '',
  category: CATEGORIES[0].value as string,
  price: '',
  price300: '',
  stock: '',
  description: '',
  scentNotes: '',
  burnTime: '',
  waxType: '',
  isFeatured: false,
  isBestseller: false,
  isLimitedEdition: false,
  images: ['', '', '', '', ''],
};

export default function AdminProducts() {
  const { isAdminAuthenticated, isCheckingSession } = useAdmin();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [uploadingImage, setUploadingImage] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: products = [], isLoading, isError, error } = trpc.admin.products.list.useQuery(
    undefined,
    { enabled: isAdminAuthenticated }
  );

  /**
   * After any write, invalidate both the admin list and the public storefront
   * queries. Skipping this leaves TanStack Query serving its cached list, which
   * looks identical to the data not having been saved.
   */
  const invalidateAll = () => {
    utils.admin.products.list.invalidate();
    utils.admin.stats.invalidate();
    utils.products.list.invalidate();
    utils.products.featured.invalidate();
    utils.products.bestsellers.invalidate();
  };

  const createProduct = trpc.admin.products.create.useMutation({
    onSuccess: (product: any) => {
      invalidateAll();
      setShowForm(false);
      toast.success(`“${product.name}” saved and published to the store`);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not save the product'),
  });

  const updateProduct = trpc.admin.products.update.useMutation({
    onSuccess: (product: any) => {
      invalidateAll();
      setShowForm(false);
      toast.success(`“${product.name}” updated`);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not update the product'),
  });

  const deleteProduct = trpc.admin.products.delete.useMutation({
    onSuccess: (result: any) => {
      invalidateAll();
      toast.success(result.message);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not delete the product'),
  });

  const isSaving = createProduct.isPending || updateProduct.isPending;

  if (isCheckingSession) {
    return (
      <AdminLayout title="Products">
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
  const filteredProducts = products.filter(
    (p: any) =>
      !term ||
      p.name.toLowerCase().includes(term) ||
      p.slug.toLowerCase().includes(term) ||
      categoryLabel(p.category).toLowerCase().includes(term)
  );

  const openAddForm = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setShowForm(true);
  };

  const openEditForm = (product: any) => {
    const sizeOptions = Array.isArray(product.sizeOptions) ? product.sizeOptions : [];
    const size300 = sizeOptions.find((s: any) => s?.size === '300ml');
    setEditingId(product.id);
    setFormData({
      name: product.name,
      slug: product.slug,
      category: product.category,
      price: String(toNumber(product.price)),
      price300: String(toNumber(size300?.price ?? toNumber(product.price) * 1.3)),
      stock: String(product.stock ?? 0),
      description: product.description ?? '',
      scentNotes: (product.scentNotes ?? []).join(', '),
      burnTime: product.burnTime ?? '',
      waxType: product.waxType ?? '',
      isFeatured: !!product.isFeatured,
      isBestseller: !!product.isBestseller,
      isLimitedEdition: !!product.isLimitedEdition,
      images: [...(product.images ?? []), '', '', '', '', ''].slice(0, 5),
    });
    setShowForm(true);
  };


  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    index: number
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      event.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be smaller than 5MB');
      event.target.value = '';
      return;
    }

    setUploadingImage(index);

    try {
      const body = new FormData();
      body.append('image', file);

      const response = await fetch(`${API_URL}/api/admin/upload/image`, {
        method: 'POST',
        credentials: 'include',
        body,
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.success || !result?.url) {
        throw new Error(result?.message || 'Image upload failed');
      }

      setFormData((current) => {
        const images = [...current.images];
        images[index] = result.url;
        return { ...current, images };
      });

      toast.success('Image uploaded');
    } catch (error: any) {
      toast.error(error?.message || 'Image upload failed');
    } finally {
      setUploadingImage(null);
      event.target.value = '';
    }
  };

  const handleSave = () => {
    // Frontend validation for fast feedback; the backend validates independently.
    if (!formData.name.trim()) return toast.error('Product name is required');
    if (!formData.description.trim()) return toast.error('Description is required');
    if (!formData.price || toNumber(formData.price) <= 0)
      return toast.error('Enter a 220ml price greater than zero');
    if (!formData.price300 || toNumber(formData.price300) <= 0)
      return toast.error('Enter a 300ml price greater than zero');
    if (formData.stock === '' || Number(formData.stock) < 0)
      return toast.error('Enter a stock quantity of zero or more');

    const images = formData.images.map((i) => i.trim()).filter(Boolean);
    const payload = {
      name: formData.name.trim(),
      slug: formData.slug.trim(),
      category: formData.category,
      price: formData.price,
      price300: formData.price300,
      stock: Number(formData.stock),
      description: formData.description.trim(),
      scentNotes: formData.scentNotes,
      burnTime: formData.burnTime.trim(),
      waxType: formData.waxType.trim(),
      isFeatured: formData.isFeatured,
      isBestseller: formData.isBestseller,
      isLimitedEdition: formData.isLimitedEdition,
      // Fall back to the category placeholder so a product always has artwork.
      images: images.length > 0 ? images : [`/images/products/${formData.category}-1.svg`],
    };

    if (editingId) updateProduct.mutate({ id: editingId, data: payload });
    else createProduct.mutate(payload);
  };

  const handleDelete = (product: any) => {
    const warning =
      product.orderItemCount > 0
        ? `“${product.name}” appears in ${product.orderItemCount} order item(s). It will be hidden from the store but kept for order history. Continue?`
        : `Delete “${product.name}”? This cannot be undone.`;
    if (!confirm(warning)) return;
    deleteProduct.mutate({ id: product.id });
  };

  return (
    <AdminLayout title="Products">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7066]" />
          <input
            type="text"
            placeholder="Search products by name or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-[#E8DDD0] rounded-xl bg-white text-sm text-[#2C2C2C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
          />
        </div>
        <button
          onClick={openAddForm}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#C9A84C] text-[#2C2C2C] rounded-xl font-semibold hover:bg-[#D4A5A5] transition-colors text-sm whitespace-nowrap"
        >
          <Plus size={16} />
          Add Product
        </button>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl border border-[#E8DDD0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#FAF7F2] border-b border-[#E8DDD0]">
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Product</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Category</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Price</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Stock</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Badges</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-[#7A7066] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="py-12 text-center text-[#7A7066]"><Loader2 className="animate-spin inline mr-2" size={16} />Loading products…</td></tr>
              ) : isError ? (
                <tr><td colSpan={6} className="py-12 text-center text-red-600">{(error as any)?.message ?? 'Could not load products'}</td></tr>
              ) : filteredProducts.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-[#7A7066]">No products found</td></tr>
              ) : filteredProducts.map((product: any) => (
                <tr key={product.id} className="border-t border-[#E8DDD0] hover:bg-[#FAF7F2] transition-colors">
                  {/* Thumbnail + Name */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#FAF7F2] border border-[#E8DDD0] flex-shrink-0">
                        {product.images[0] ? (
                          <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = `/images/products/${product.category}-1.svg`; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl">🕯️</div>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-[#2C2C2C]">{product.name}</p>
                        <p className="text-xs text-[#7A7066]">{product.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FAF7F2] border border-[#E8DDD0] text-[#2C2C2C] whitespace-nowrap">
                      {categoryLabel(product.category)}
                    </span>
                    {product.isActive === false && (
                      <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-200 text-gray-600">
                        Hidden
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 font-semibold text-[#C9A84C] whitespace-nowrap">{formatPrice(product.price)}</td>
                  <td className="px-5 py-4">
                    <span className={`font-semibold ${product.stock < 10 ? 'text-red-600' : 'text-green-600'}`}>
                      {product.stock}
                    </span>
                    {product.stock < 10 && <span className="ml-1 text-xs text-red-500">⚠ Low</span>}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-1 flex-wrap">
                      {product.isFeatured && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">Featured</span>}
                      {product.isBestseller && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">Bestseller</span>}
                      {product.isLimitedEdition && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">Limited</span>}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => openEditForm(product)} className="p-2 text-[#C9A84C] hover:bg-[#E8DDD0] rounded-lg transition-colors" title="Edit"><Edit2 size={15} /></button>
                      <button onClick={() => handleDelete(product)} disabled={deleteProduct.isPending} className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40" title="Delete"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl my-8 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-[#E8DDD0]">
              <h2 className="text-xl font-bold text-[#2C2C2C]">
                {editingId ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-[#E8DDD0] rounded-lg"><X size={18} /></button>
            </div>
            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">Product Name *</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                    className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">Slug</label>
                  <input type="text" value={formData.slug} onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">Category *</label>
                  <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]">
                    {CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>{cat.icon} {cat.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">220ml price (PKR) *</label>
                  <input type="number" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">300ml price (PKR) *</label>
                  <input type="number" value={formData.price300} onChange={(e) => setFormData({ ...formData, price300: e.target.value })}
                    className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">Stock *</label>
                  <input type="number" value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">Description *</label>
                  <textarea rows={3} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C] resize-none" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">Scent Notes (comma-separated)</label>
                  <input type="text" placeholder="Vanilla, Rose, Sandalwood" value={formData.scentNotes} onChange={(e) => setFormData({ ...formData, scentNotes: e.target.value })}
                    className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">Burn Time</label>
                  <input type="text" placeholder="40-50 hrs" value={formData.burnTime} onChange={(e) => setFormData({ ...formData, burnTime: e.target.value })}
                    className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">Wax Type</label>
                  <input type="text" placeholder="100% Soy Wax" value={formData.waxType} onChange={(e) => setFormData({ ...formData, waxType: e.target.value })}
                    className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]" />
                </div>
                {/* Flags */}
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-[#2C2C2C] mb-2">Flags</label>
                  <div className="flex gap-4 flex-wrap">
                    {(['isFeatured', 'isBestseller', 'isLimitedEdition'] as const).map((flag) => (
                      <label key={flag} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={formData[flag]} onChange={(e) => setFormData({ ...formData, [flag]: e.target.checked })}
                          className="w-4 h-4 accent-[#C9A84C]" />
                        <span className="text-sm text-[#2C2C2C] capitalize">{flag.replace('is', '')}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {/* 5 Product Images */}
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-[#2C2C2C] mb-1">
                    Product Images (up to 5)
                  </label>
                  <p className="text-xs text-[#7A7066] mb-3">
                    Upload images directly, or paste an image URL.
                  </p>

                  <div className="space-y-2">
                    {formData.images.map((img, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <span className="text-xs text-[#7A7066] w-14 flex-shrink-0">
                          Image {idx + 1}{idx === 0 ? ' *' : ''}
                        </span>

                        <input
                          type="url"
                          placeholder="https://... (image URL)"
                          value={img}
                          onChange={(e) => {
                            const imgs = [...formData.images];
                            imgs[idx] = e.target.value;
                            setFormData({ ...formData, images: imgs });
                          }}
                          className="flex-1 px-3 py-2 border border-[#E8DDD0] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                        />

                        <label
                          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap ${
                            uploadingImage === idx
                              ? 'bg-gray-100 text-gray-400 cursor-wait'
                              : 'bg-[#2C2C2C] text-white hover:bg-[#444] cursor-pointer'
                          }`}
                        >
                          <Upload size={14} />
                          {uploadingImage === idx ? 'Uploading...' : 'Upload'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingImage === idx}
                            onChange={(e) => handleImageUpload(e, idx)}
                          />
                        </label>

                        {img && (
                          <img
                            src={img}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover border border-[#E8DDD0]"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* Modal Footer */}
            <div className="p-6 border-t border-[#E8DDD0] flex gap-3">
              <button onClick={handleSave} disabled={isSaving} className="flex-1 py-2.5 bg-[#C9A84C] text-[#2C2C2C] rounded-xl font-bold hover:bg-[#D4A5A5] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {isSaving && <Loader2 size={15} className="animate-spin" />}
                {editingId ? 'Update Product' : 'Add Product'}
              </button>
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-[#E8DDD0] text-[#7A7066] rounded-xl font-semibold hover:bg-[#FAF7F2] transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
