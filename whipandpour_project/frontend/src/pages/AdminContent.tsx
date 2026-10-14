import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Loader2, Upload } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { useAdmin } from '@/contexts/AdminContext';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { uploadImage } from '@/lib/uploadImage';

/**
 * Admin → Site Content
 *
 * Edits the homepage hero + brand-story section (the only part of the site
 * that was hardcoded with a stock photo that didn't match the business).
 * Scoped to this one section deliberately — a full page-by-page content
 * editor is a much larger feature than what was actually broken.
 */

const FIELDS: { key: string; label: string; type: 'text' | 'textarea' | 'image' }[] = [
  { key: 'heroImage', label: 'Hero background image (full-screen, top of page)', type: 'image' },
  { key: 'heroEyebrow', label: 'Hero small label', type: 'text' },
  { key: 'heroHeading', label: 'Hero heading', type: 'text' },
  { key: 'heroParagraph', label: 'Hero paragraph', type: 'textarea' },
  { key: 'storyImage', label: 'Brand story image', type: 'image' },
  { key: 'storyHeading', label: 'Brand story heading', type: 'text' },
  { key: 'storyParagraph1', label: 'Brand story paragraph 1', type: 'textarea' },
  { key: 'storyParagraph2', label: 'Brand story paragraph 2', type: 'textarea' },
  { key: 'badgeNumber', label: 'Badge number (e.g. "100%")', type: 'text' },
  { key: 'badgeLabel', label: 'Badge label (e.g. "Natural Soy Wax")', type: 'text' },
];

export default function AdminContent() {
  const { isAdminAuthenticated, isCheckingSession } = useAdmin();
  const [, navigate] = useLocation();
  const [form, setForm] = useState<Record<string, string>>({});
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [brokenFields, setBrokenFields] = useState<string[]>([]);

  const utils = trpc.useUtils();
  const { data: content, isLoading } = trpc.content.homepage.useQuery();

  useEffect(() => {
    if (content) setForm(content);
  }, [content]);

  const saveMutation = trpc.admin.content.updateHomepage.useMutation({
    onSuccess: (saved: any) => {
      setForm(saved);
      utils.content.homepage.invalidate();
      toast.success('Homepage content updated');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not save content'),
  });

  if (isCheckingSession) {
    return (
      <AdminLayout title="Site Content">
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

  const handleImageUpload = async (field: string, file: File) => {
    setUploadingField(field);
    try {
      const url = await uploadImage(file);
      setForm((prev) => ({ ...prev, [field]: url }));
      toast.success('Image uploaded — click Save to publish it');
    } catch (error: any) {
      toast.error(error?.message || 'Image upload failed');
    } finally {
      setUploadingField(null);
    }
  };

  const handleSave = () => {
    saveMutation.mutate(form);
  };

  return (
    <AdminLayout title="Site Content">
      <div className="max-w-3xl">
        <p className="text-sm text-[#7A7066] mb-6">
          Edits the homepage hero and brand-story section — the image and text visitors see
          first. Changes go live as soon as you save.
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-[#7A7066]">
            <Loader2 className="animate-spin mr-2" size={18} /> Loading current content…
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[#E8DDD0] p-6 space-y-5">
            {FIELDS.map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-semibold text-[#2C2C2C] mb-1.5">
                  {field.label}
                </label>

                {field.type === 'textarea' && (
                  <textarea
                    rows={3}
                    value={form[field.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C] resize-none"
                  />
                )}

                {field.type === 'text' && (
                  <input
                    type="text"
                    value={form[field.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    className="w-full px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                  />
                )}

                {field.type === 'image' && (
                  <div className="flex gap-2 items-center">
                    <input
                      type="url"
                      placeholder="Or paste an image link (https://...)"
                      value={form[field.key] ?? ''}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                      className="flex-1 px-3 py-2.5 border border-[#E8DDD0] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                    />
                    <label
                      className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium whitespace-nowrap ${
                        uploadingField === field.key
                          ? 'bg-gray-100 text-gray-400 cursor-wait'
                          : 'bg-[#2C2C2C] text-white hover:bg-[#444] cursor-pointer'
                      }`}
                    >
                      <Upload size={14} />
                      {uploadingField === field.key ? 'Uploading...' : 'Upload image'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingField === field.key}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(field.key, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {form[field.key] && (
                      <img
                        src={form[field.key]}
                        alt=""
                        className="w-12 h-12 rounded-lg object-cover border border-[#E8DDD0]"
                        onError={() =>
                          setBrokenFields((list) => (list.includes(field.key) ? list : [...list, field.key]))
                        }
                      />
                    )}
                    {form[field.key] && brokenFields.includes(field.key) && (
                      <p className="text-xs text-red-600">Failed to load. Upload it again.</p>
                    )}
                    {form[field.key] && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, [field.key]: '' })}
                        className="text-xs font-semibold text-[#D4A5A5] hover:text-red-600 transition-colors whitespace-nowrap"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            <button
              onClick={handleSave}
              disabled={saveMutation.isPending || !content}
              className="w-full py-3 bg-[#C9A84C] text-[#2C2C2C] rounded-xl font-bold hover:bg-[#D4A5A5] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saveMutation.isPending && <Loader2 size={16} className="animate-spin" />}
              Save Changes
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
