import { useState } from 'react';
import type { CollectionOption } from '@/const';

/**
 * A collection's photo as a small inline thumbnail, with its emoji icon as the
 * fallback.
 *
 * The fallback is not decoration: `image` comes from the newest active product
 * in the collection, so a collection with no products yet — or one whose
 * products carry no image — genuinely has no photo to show. An emoji is a
 * better answer there than a broken frame, and the same applies when the URL
 * itself fails to load.
 */
export default function CollectionThumb({
  collection,
  size = 26,
}: {
  collection: CollectionOption;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = collection.image || collection.coverImage || null;

  if (!src || failed) {
    return (
      <span aria-hidden="true" style={{ fontSize: size * 0.72, lineHeight: 1 }}>
        {collection.icon ?? '✨'}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="rounded-md object-cover bg-[#FAF7F2] shrink-0"
      style={{ width: size, height: size }}
    />
  );
}
