import { trpc } from '@/lib/trpc';
import { CATEGORIES, type CollectionOption, getCollectionOptions, setCollectionOptions } from '@/const';

const iconFor = (value: string) =>
  CATEGORIES.find((c) => c.value === value)?.icon ?? '✨';

/**
 * Every collection from the API, active and inactive. Mirrors the list into the
 * registry that categoryLabel() reads, so labels render correctly everywhere.
 */
export function useCollections(): CollectionOption[] {
  const { data } = trpc.products.categories.useQuery(undefined, { staleTime: 60_000 });
  if (data) {
    setCollectionOptions(
      (data as CollectionOption[]).map((c) => ({ ...c, icon: iconFor(c.value) }))
    );
  }
  return getCollectionOptions();
}

/** Collections the storefront should show. */
export function useActiveCollections(): CollectionOption[] {
  return useCollections().filter((c) => c.isActive !== false);
}
