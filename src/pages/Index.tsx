import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Search, SlidersHorizontal } from 'lucide-react';
import { ProductCard } from '@/components/ProductCard';
import { HeroBento } from '@/components/home/HeroBento';
import { FeatureStrip } from '@/components/home/HomeSections';
import { useActiveSets } from '@/hooks/useSets';
import { useLanguage } from '@/hooks/useLanguage';
import { useSEO } from '@/hooks/useSEO';
import { getPageSeo } from '@/lib/pageSeo';

export default function Index() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const homeSeo = getPageSeo('home', language);
  useSEO({ title: homeSeo.title, description: homeSeo.description, ogTitle: homeSeo.title, ogDescription: homeSeo.description });

  const { sets, productsBySet, loading } = useActiveSets();
  const projects = Array.from(new Map(
    sets.flatMap(set => (productsBySet[set.id] ?? []).map(product => [product.id, product] as const)),
  ).values());

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 lg:px-8 pt-5 lg:pt-8">
        <h1 className="font-serif text-2xl lg:text-3xl font-bold text-foreground leading-tight">
          {language === 'ru' ? 'Мебель на заказ в Ташкенте' : 'Toshkentda buyurtma asosida mebel'}
        </h1>
        <p className="mt-2 text-sm lg:text-base text-muted-foreground">
          {language === 'ru' ? 'Шкафы, кухни, мебель для офиса и спальни по вашим размерам.' : 'Shkaf, oshxona, ofis va yotoqxona mebellari — sizning o‘lchamlaringiz bo‘yicha.'}
        </p>
      </div>

      <div className="md:hidden container mx-auto px-4 pt-4 pb-1">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const query = String(new FormData(e.currentTarget).get('q') ?? '').trim();
            navigate(query ? `/catalog?search=${encodeURIComponent(query)}` : '/catalog');
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              name="q"
              type="search"
              aria-label={language === 'ru' ? 'Поиск по каталогу' : 'Katalog bo‘yicha qidirish'}
              placeholder={language === 'ru' ? 'Поиск...' : 'Qidirish...'}
              className="w-full h-11 pl-11 pr-4 rounded-full border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <Link
            to="/catalog"
            aria-label={language === 'ru' ? 'Фильтры' : 'Filtrlar'}
            className="shrink-0 w-11 h-11 rounded-full border border-border bg-card flex items-center justify-center"
          >
            <SlidersHorizontal className="w-4 h-4 text-foreground" />
          </Link>
        </form>
      </div>

      <HeroBento sets={sets} loading={loading} language={language} />

      {projects.length > 0 && (
        <section aria-labelledby="home-projects" className="container mx-auto px-4 lg:px-8 mt-12 lg:mt-16">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 mb-5 sm:mb-7">
            <h2 id="home-projects" className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground tracking-tight">
              {language === 'ru' ? 'Примеры мебели' : 'Mebel namunalari'}
            </h2>
            <Link to="/catalog" className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary">
              {language === 'ru' ? 'Весь каталог' : 'Barcha namunalar'}
              <ArrowRight className="w-4 h-4 shrink-0" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
            {projects.map(product => <ProductCard key={product.id} product={product} />)}
          </div>
        </section>
      )}

      <FeatureStrip language={language} />
    </div>
  );
}
