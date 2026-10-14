import { trpc } from '@/lib/trpc';
import { CATEGORIES, type CollectionOption, getCollectionOptions, setCollectionOptions } from '@/const';

const iconFor = (value: string) =>
  CATEGORIES.find((c) => c.value === value)?.icon ?? '✨';

/**
 * Admin-managed collections from the API. Mirrors the list into the shared
 * registry that categoryLabel() reads, so labels render correctly everywhere,
 * not only in components that call this hook.
 */
export function useCollections(): CollectionOption[] {
  const { data } = trpc.products.categories.useQuery(undefined, { staleTime: 60_000 });
  if (data) {
    setCollectionOptions(
      (data as { value: string; label: string }[]).map((c) => ({ ...c, icon: iconFor(c.value) }))
    );
  }
  return getCollectionOptions();
}
