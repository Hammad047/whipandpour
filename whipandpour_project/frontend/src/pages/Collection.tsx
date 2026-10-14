import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import NotFound from '@/pages/NotFound';
import { trpc } from '@/lib/trpc';
import { useSEO } from '@/hooks/useSEO';

export default function Collection({ params }: { params: { slug: string } }) {
  const slug = params?.slug ?? '';
  const { data: collections, isLoading: loadingCollections } = trpc.products.categories.useQuery(undefined, {
    staleTime: 60_000,
  });
  const { data: products = [], isLoading: loadingProducts } = trpc.products.list.useQuery({
    category: slug,
    limit: 200,
    offset: 0,
  });

  const collection = (collections as any[] | undefined)?.find((c) => c.value === slug);

  useSEO({
    title: collection ? `${collection.label} — Whip & Pour` : 'Collection',
    description:
      collection?.description ??
      (collection ? `Shop ${collection.label} — handcrafted candles with nationwide delivery in Pakistan.` : ''),
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (loadingCollections) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center text-[#7A7066]">
        <Loader2 className="animate-spin mr-2" size={20} /> Loading collection…
      </div>
    );
  }

  if (!collection || collection.isActive === false) return <NotFound />;

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <section className="relative bg-[#2C2C2C] text-white">
        {collection.coverImage ? (
          <img
            src={collection.coverImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-40"
          />
        ) : null}
        <div className="relative container mx-auto px-4 md:px-8 max-w-7xl py-20 md:py-28 text-center">
          <p className="text-xs font-bold tracking-[0.3em] text-[#C9A84C] uppercase mb-3">— Collection —</p>
          <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
            {collection.label}
          </h1>
          {collection.description ? (
            <p className="text-lg text-white/80 max-w-2xl mx-auto whitespace-pre-line">{collection.description}</p>
          ) : null}
        </div>
      </section>

      <section className="container mx-auto px-4 md:px-8 max-w-7xl py-16">
        {loadingProducts ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg h-96 animate-pulse border border-[#E8DDD0]" />
            ))}
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.map((product: any) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <p className="text-center text-[#7A7066] py-16">No products in this collection yet.</p>
        )}
      </section>
    </div>
  );
}
