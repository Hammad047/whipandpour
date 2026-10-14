const API_URL = import.meta.env.VITE_API_URL || '';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Uploads one image from the admin panel and returns its public URL. */
export async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please select an image file');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image must be smaller than 5MB');

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
  return result.url as string;
}
