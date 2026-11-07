import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Link, useLocation, useNavigationType } from 'react-router-dom';

import { Search, SlidersHorizontal, Loader2, ChevronLeft, ChevronRight, X, LayoutGrid, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ProductCard } from '@/components/ProductCard';
import { useProducts, useCategories, useProductFilterOptions, useSections, ProductFilters } from '@/hooks/useProducts';
import { useLanguage } from '@/hooks/useLanguage';
import { useSEO } from '@/hooks/useSEO';
import { getPageSeo } from '@/lib/pageSeo';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useAuth } from '@/hooks/useAuth';
import { CatalogFilterSidebar, SidebarFilters } from '@/components/CatalogFilterSidebar';
import { ApiError, apiGet } from '@/integrations/api/client';
import { getTranslated } from '@shared/translate';

const PAGE_SIZE = 24;

type CatalogSetState = {
  id: string;
  status: 'ready' | 'not-found' | 'error';
  productIds?: string[];
  title?: { uz: string; ru: string; translations: Record<string, { title?: string }> | null };
  image?: string | null;
};

export default function Catalog() {
  const { language, t } = useLanguage();
  const catName = (c: { name_uz: string; name_ru: string; translations?: Record<string, { name?: string }> | null }) =>
    getTranslated(c.translations, language, 'name', language === 'ru' ? c.name_ru : c.name_uz);
  const { settings } = useSystemSettings();
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [catalogDrawerOpen, setCatalogDrawerOpen] = useState(false);
  const [drawerSectionId, setDrawerSectionId] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});
  
  const initialCategoryParam = searchParams.get('category') || 'all';
  const promoTileId = searchParams.get('promo') || '';
  const setId = searchParams.get('set') || '';
  const initialPage = parseInt(searchParams.get('page') || '1', 10);
  const sectionParam = searchParams.get('section') || '';
  const discountedParam = searchParams.get('discounted') === '1';

  const [setState, setSetState] = useState<CatalogSetState | null>(null);
  const [setRetry, setSetRetry] = useState(0);
  const currentSetState = setState?.id === setId ? setState : null;
  const setProductIds = currentSetState?.productIds ?? null;
  const setTitle = currentSetState?.title ?? null;
  const setImage = currentSetState?.image ?? null;
  const setLoading = !!setId && currentSetState === null;
  const setError = currentSetState?.status === 'error';
  const setNotFound = currentSetState?.status === 'not-found';
  
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(initialPage);

  const { options: filterOptions } = useProductFilterOptions();
  const { categories, loading: categoriesLoading, error: categoriesError, refetch: refetchCategories } = useCategories();
  const { sections, loading: sectionsLoading, error: sectionsError, refetch: refetchSections } = useSections();

  // Resolve slug to category ID for filtering - only return UUID or 'all'
  const resolvedCategoryId = useMemo(() => {
    if (initialCategoryParam === 'all') return 'all';
    const found = categories.find(c => c.slug === initialCategoryParam || c.id === initialCategoryParam);
    return found ? found.id : null;
  }, [initialCategoryParam, categories]);

  // Resolve section slug to section ID for filtering
  const resolvedSectionId = useMemo(() => {
    if (!sectionParam || !sections.length) return null;
    const found = sections.find(s => s.slug === sectionParam || s.id === sectionParam);
    return found ? found.id : null;
  }, [sectionParam, sections]);

  const categoryNotFound = !setId && initialCategoryParam !== 'all'
    && !categoriesLoading && !categoriesError && resolvedCategoryId === null;
  // An explicit category takes precedence over a section, as in the query below.
  const sectionNotFound = !setId && initialCategoryParam === 'all' && !!sectionParam
    && !sectionsLoading && !sectionsError && resolvedSectionId === null;
  const metadataLoading = !setId && (categoriesLoading || sectionsLoading);
  const metadataError = !setId && (categoriesError || sectionsError);

  const selectedSection = useMemo(() => sections.find(s => s.id === resolvedSectionId), [resolvedSectionId, sections]);
  const sectionName = selectedSection ? catName(selectedSection) : null;

  // The standalone "Furnitura va materiallar" section lives only on its own /materials
  // page (see Materials.tsx) — its products must never surface in the general catalog.
  const standaloneSection = useMemo(() => sections.find(s => s.show_in_main_nav === false), [sections]);
  const standaloneCategoryIds = useMemo(() => {
    if (!standaloneSection) return [] as string[];
    const ids = new Set<string>();
    const walk = (id: string) => {
      ids.add(id);
      categories.filter(c => c.parent_id === id).forEach(child => walk(child.id));
    };
    categories.filter(c => c.section_id === standaloneSection.id).forEach(c => walk(c.id));
    return Array.from(ids);
  }, [standaloneSection, categories]);

  // All category IDs belonging to the selected section (including descendants)
  const sectionCategoryIds = useMemo(() => {
    if (!resolvedSectionId) return [];
    const ids = new Set<string>();
    const walk = (id: string) => {
      ids.add(id);
      categories.filter(c => c.parent_id === id).forEach(child => walk(child.id));
    };
    categories.filter(c => c.section_id === resolvedSectionId).forEach(c => walk(c.id));
    return Array.from(ids);
  }, [resolvedSectionId, categories]);

  const [priceTouched, setPriceTouched] = useState(false);
  const [sidebarFilters, setSidebarFilters] = useState<SidebarFilters>({
    categoryId: 'all',
    priceMin: 0,
    priceMax: filterOptions.maxPrice,
    materials: [],
    colors: [],
    furLengths: [],
    applications: [],
    inStock: false,
    discounted: discountedParam,
  });

  // Sync price max with filter options until the user explicitly changes it
  useEffect(() => {
    if (!priceTouched) {
      setSidebarFilters(prev => ({ ...prev, priceMax: filterOptions.maxPrice }));
    }
  }, [filterOptions.maxPrice, priceTouched]);

  // Update category filter when URL slug changes (e.g., footer navigation)
  useEffect(() => {
    if (resolvedCategoryId !== null && resolvedCategoryId !== sidebarFilters.categoryId) {
      setSidebarFilters(prev => ({ ...prev, categoryId: resolvedCategoryId }));
      setCurrentPage(1);
    }
  }, [resolvedCategoryId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch set product_ids when ?set= is in URL
  useEffect(() => {
    setSetState(null);
    if (!setId) return;
    let cancelled = false;
    (async () => {
      try {
        const { item: data } = await apiGet<{ item: any }>(`/api/sets/${encodeURIComponent(setId)}`);
        if (cancelled) return;
        setSetState(data ? {
          id: setId,
          status: 'ready',
          productIds: (data.productIds as string[]) || [],
          title: { uz: data.titleUz, ru: data.titleRu, translations: data.translations },
          image: (data.image as string) || null,
        } : { id: setId, status: 'not-found' });
        setCurrentPage(1);
      } catch (err) {
        if (cancelled) return;
        setSetState({ id: setId, status: err instanceof ApiError && err.status === 404 ? 'not-found' : 'error' });
      }
    })();
    return () => { cancelled = true; };
  }, [setId, setRetry]);

  // Map sidebar filters to DB query filters
  const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  
  const filters: ProductFilters = useMemo(() => {
    const f: ProductFilters = { isActive: true };

    // When viewing a set, show ALL products in that set — ignore other filters
    if (setId) {
      // While the set is still loading, short-circuit to avoid fetching the full catalog
      f.productIds = setProductIds ?? [];
      if (debouncedSearch) f.search = debouncedSearch;
      return f;
    }

    // Category/section metadata also defines the material exclusions. Do not
    // request an unscoped catalog while those dependencies are unavailable.
    if (metadataLoading || metadataError || categoryNotFound || sectionNotFound) {
      f.productIds = [];
      return f;
    }

    if (debouncedSearch) f.search = debouncedSearch;
    // Only pass category if it's a valid UUID. If the selected category has
    // subcategories, include all descendants so parent view shows every product.
    // If both category and section exist in the URL, category must win.
    if (sidebarFilters.categoryId !== 'all' && isUUID(sidebarFilters.categoryId)) {
      const selectedId = sidebarFilters.categoryId;
      const childIds = categories.filter(c => c.parent_id === selectedId).map(c => c.id);
      if (childIds.length > 0) {
        f.categoryIds = [selectedId, ...childIds];
      } else {
        f.categoryId = selectedId;
      }
    } else if (resolvedSectionId) {
      if (sectionCategoryIds.length > 0) {
        f.categoryIds = sectionCategoryIds;
      } else {
        // Section has no categories — force empty result
        f.categoryIds = ['00000000-0000-0000-0000-000000000000'];
      }
    }
    if (priceTouched && sidebarFilters.priceMin > 0) f.priceMin = sidebarFilters.priceMin;
    if (priceTouched && sidebarFilters.priceMax < filterOptions.maxPrice) f.priceMax = sidebarFilters.priceMax;
    if (sidebarFilters.materials.length > 0) f.materials = sidebarFilters.materials;
    if (sidebarFilters.colors.length > 0) f.colors = sidebarFilters.colors;
    if (sidebarFilters.furLengths.length > 0) f.furLengths = sidebarFilters.furLengths;
    if (sidebarFilters.inStock) f.inStock = true;
    if (sidebarFilters.discounted || discountedParam) f.discounted = true;
    if (promoTileId) f.promoTileId = promoTileId;
    if (standaloneCategoryIds.length > 0) f.excludeCategoryIds = standaloneCategoryIds;

    return f;
  }, [debouncedSearch, sidebarFilters, filterOptions.maxPrice, promoTileId, discountedParam, setId, setProductIds, priceTouched, categories, resolvedSectionId, sectionCategoryIds, standaloneCategoryIds, metadataLoading, metadataError, categoryNotFound, sectionNotFound]);


  const { products, totalCount, totalPages, loading: productsLoading, error: productsError, refetch: refetchProducts } = useProducts(currentPage, filters, PAGE_SIZE);

  // Show the catalog sections overview when no filters/search/set are active and sections exist.
  const showSectionsOverview =
    !setTitle && !promoTileId && !discountedParam && !debouncedSearch && !sectionParam && sidebarFilters.categoryId === 'all' && sections.length > 0;

  // Treat as loading while the URL category slug hasn't synced into local filters yet
  // to avoid showing stale products from the previous category.
  const categorySyncing =
    !setId && resolvedCategoryId !== null && resolvedCategoryId !== sidebarFilters.categoryId;
  const catalogNotFound = categoryNotFound || sectionNotFound || setNotFound;
  const catalogError = metadataError || setError || productsError;
  const loading = metadataLoading || setLoading || (!catalogError && !catalogNotFound && (productsLoading || categorySyncing));

  // --- Scroll position preservation across product detail navigation ---
  const location = useLocation();
  const navigationType = useNavigationType();
  const scrollKey = `catalog-scroll:${location.pathname}${location.search}`;
  const restoredRef = useRef(false);

  // Continuously persist scroll position for this catalog URL
  useEffect(() => {
    restoredRef.current = false;
    const save = () => {
      sessionStorage.setItem(scrollKey, String(window.scrollY));
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      save();
      window.removeEventListener('scroll', save);
    };
  }, [scrollKey]);

  // Restore scroll on back/forward once products have finished loading
  useEffect(() => {
    if (navigationType !== 'POP') return;
    if (loading) return;
    if (restoredRef.current) return;
    const stored = sessionStorage.getItem(scrollKey);
    if (stored == null) return;
    restoredRef.current = true;
    const y = parseInt(stored, 10);
    if (Number.isNaN(y)) return;
    requestAnimationFrame(() => {
      window.scrollTo({ top: y, behavior: 'auto' });
    });
  }, [navigationType, loading, scrollKey, products.length]);

  const selectedCategory = categories.find(c => c.id === resolvedCategoryId);
  const categoryName = selectedCategory ? catName(selectedCategory) : sectionName;

  const catalogSeo = getPageSeo('catalog', language);
  const seoTitle = categoryName || catalogSeo.title;
  const seoDescription = selectedCategory
    ? getTranslated(
        selectedCategory.translations,
        language,
        'metaDescription',
        (language === 'uz' ? selectedCategory.meta_description_uz : selectedCategory.meta_description_ru) || ''
      ) || categoryName || catalogSeo.description
    : sectionName || catalogSeo.description;

  useSEO({
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    keywords: selectedCategory?.meta_keywords || undefined,
    // Match the sitemap's /catalog?category=<slug> URLs exactly (instead of the
    // useSEO fallback, which derives canonical from window.location.pathname and
    // silently drops the ?category= query string). Pagination isn't a distinct
    // indexable URL, so every page of a category canonicalizes to its first page.
    canonical: selectedCategory ? `/catalog?category=${selectedCategory.slug}` : '/catalog',
  });

  useEffect(() => {
    // Wait until the initial category slug has been resolved before
    // overwriting the URL — otherwise we wipe out ?category=... on mount.
    if (resolvedCategoryId === null) return;
    // Avoid race: skip until local state has caught up with the resolved URL slug.
    if (resolvedCategoryId !== sidebarFilters.categoryId) return;

    const params = new URLSearchParams();

    // Preserve section navigation while other filters change
    if (sectionParam) params.set('section', sectionParam);

    // When a set is active, only keep the set param (drop stale filters)
    if (setId) {
      params.set('set', setId);
      if (currentPage > 1) params.set('page', currentPage.toString());
      setSearchParams(params, { replace: true });
      return;
    }

    if (sidebarFilters.categoryId !== 'all') {
      // Write slug to URL for better readability
      const cat = categories.find(c => c.id === sidebarFilters.categoryId);
      params.set('category', cat?.slug || sidebarFilters.categoryId);
    }
    if (priceTouched && sidebarFilters.priceMin > 0) params.set('min_price', sidebarFilters.priceMin.toString());
    if (priceTouched && sidebarFilters.priceMax < filterOptions.maxPrice) params.set('max_price', sidebarFilters.priceMax.toString());
    if (sidebarFilters.materials.length > 0) params.set('material', sidebarFilters.materials.join(','));
    if (sidebarFilters.colors.length > 0) params.set('color', sidebarFilters.colors.join(','));
    if (sidebarFilters.furLengths.length > 0) params.set('fur_length', sidebarFilters.furLengths.join(','));
    if (sidebarFilters.applications.length > 0) params.set('application', sidebarFilters.applications.join(','));
    if (sidebarFilters.inStock) params.set('in_stock', '1');
    if (sidebarFilters.discounted) params.set('discount', '1');
    if (promoTileId) params.set('promo', promoTileId);
    if (currentPage > 1) params.set('page', currentPage.toString());
    setSearchParams(params, { replace: true });
  }, [sidebarFilters, currentPage, setSearchParams, filterOptions.maxPrice, resolvedCategoryId, promoTileId, setId, priceTouched, sectionParam]);



  const handleApplyFilters = useCallback((newFilters: SidebarFilters) => {
    setSidebarFilters(newFilters);
    setPriceTouched(true);
    setCurrentPage(1);
  }, []);

  const handleClearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    handleApplyFilters({
      categoryId: 'all', priceMin: 0, priceMax: filterOptions.maxPrice,
      materials: [], colors: [], furLengths: [], applications: [],
      inStock: false, discounted: false,
    });
    setPriceTouched(false);
    setSearchParams({});
  };

  const handleRetry = () => {
    if (categoriesError) void refetchCategories();
    if (sectionsError) void refetchSections();
    if (setError) {
      setSetState(null);
      setSetRetry((attempt) => attempt + 1);
    }
    if (productsError && !metadataError && !setError) void refetchProducts();
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getPaginationNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div id="hero" className="min-h-screen py-8">
      <div className="container mx-auto px-4">
        {setTitle && setImage ? (
          <div className="mb-8 relative rounded-[2rem] overflow-hidden aspect-[21/8] md:aspect-[21/7]">
            <img src={setImage} alt={getTranslated(setTitle.translations, language, 'title', language === 'ru' ? setTitle.ru : setTitle.uz)} width={1600} height={533} fetchpriority="high" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
            <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-12">
              <p className="text-media-foreground/80 text-sm md:text-base mb-2">
                {language === 'uz' ? 'Setlar to\'plami' : 'Набор сетов'}
              </p>
              <h1 className="font-serif text-3xl md:text-5xl font-bold text-media-foreground">
                {getTranslated(setTitle.translations, language, 'title', language === 'ru' ? setTitle.ru : setTitle.uz)}
              </h1>
            </div>
          </div>
        ) : (
          <div className="mb-8">
            <h1 className="font-serif text-3xl md:text-4xl font-bold mb-4">
              {categoryName || t.catalog.title}
            </h1>
            {(() => {
              // Show subcategory chips: children of currently selected top-level category,
              // or all top-level parents when viewing "all" categories.
              const selectedId = resolvedCategoryId;
              const currentCat = categories.find(c => c.id === selectedId);
              // If a subcategory is selected, show its siblings under the same parent.
              const parentId = currentCat?.parent_id || (currentCat ? currentCat.id : null);
              const chips = parentId
                ? categories.filter(c => c.parent_id === parentId)
                : [];
              if (chips.length === 0) return null;
              const parentCat = categories.find(c => c.id === parentId);
              return (
                <div className="flex flex-wrap gap-2 mt-2">
                  {parentCat && (
                    <Button
                      size="sm"
                      variant={selectedId === parentCat.id ? 'default' : 'outline'}
                      className="rounded-full"
                      onClick={() => setSearchParams(prev => {
                        const p = new URLSearchParams(prev);
                        p.set('category', parentCat.slug);
                        p.delete('page');
                        return p;
                      })}
                    >
                      {language === 'uz' ? 'Barchasi' : 'Все'}
                    </Button>
                  )}
                  {chips.map(sub => (
                    <Button
                      key={sub.id}
                      size="sm"
                      variant={selectedId === sub.id ? 'default' : 'outline'}
                      className="rounded-full"
                      onClick={() => setSearchParams(prev => {
                        const p = new URLSearchParams(prev);
                        p.set('category', sub.slug);
                        p.delete('page');
                        return p;
                      })}
                    >
                      {catName(sub)}
                    </Button>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch">
            <Sheet open={catalogDrawerOpen} onOpenChange={setCatalogDrawerOpen}>
              <SheetTrigger asChild>
                <Button
                  className="rounded-xl h-11 px-5 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                >
                  <LayoutGrid className="w-4 h-4" />
                  {language === 'uz' ? 'Katalog' : 'Каталог'}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[320px] sm:w-[340px] h-auto inset-y-4 left-4 p-0 flex flex-col rounded-3xl border shadow-2xl [&>button]:hidden">
                <SheetHeader className="px-5 pt-6 pb-4 space-y-0">
                  <SheetTitle className="text-lg flex items-center gap-3">
                    {drawerSectionId ? (
                      <button
                        onClick={() => setDrawerSectionId(null)}
                        className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-muted/70"
                        aria-label="back"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                        <LayoutGrid className="w-4 h-4" />
                      </span>
                    )}
                    <span className="font-semibold">
                      {drawerSectionId
                        ? (() => {
                            const s = sections.find((s) => s.id === drawerSectionId);
                            return s ? catName(s) : null;
                          })()
                        : (language === 'uz' ? 'Katalog' : 'Каталог')}
                    </span>
                  </SheetTitle>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto px-3 pb-3">
                  {!drawerSectionId ? (
                    <>
                      <button
                        onClick={() => {
                          setSearchParams(prev => {
                            const p = new URLSearchParams(prev);
                            p.delete('category');
                            p.delete('section');
                            p.delete('page');
                            return p;
                          });
                          setCatalogDrawerOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-muted text-foreground"
                      >
                        <LayoutGrid className="w-[18px] h-[18px]" strokeWidth={1.75} />
                        <span className="text-sm font-medium">
                          {language === 'uz' ? 'Barcha tovarlar' : 'Все товары'}
                        </span>
                      </button>

                      <div className="my-3 border-t border-border" />

                      <p className="px-3 mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {language === 'uz' ? "Bo'limlar" : 'Разделы'}
                      </p>
                      <ul className="space-y-0.5">
                        {[
                          ...sections.filter(s => s.show_in_main_nav !== false).map(s => ({
                            id: s.id,
                            name: catName(s),
                            parents: categories.filter(c => !c.parent_id && c.section_id === s.id),
                          })),
                          {
                            id: '__none__',
                            name: language === 'uz' ? 'Boshqa' : 'Другое',
                            parents: categories.filter(c => !c.parent_id && !c.section_id),
                          },
                        ]
                          .filter(sec => sec.parents.length > 0)
                          .map(section => (
                            <li key={section.id}>
                              <button
                                onClick={() => setDrawerSectionId(section.id)}
                                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left hover:bg-muted text-foreground"
                              >
                                <span className="text-sm font-medium">{section.name}</span>
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              </button>
                            </li>
                          ))}
                      </ul>
                    </>
                  ) : (
                    <ul className="space-y-0.5">
                      {(drawerSectionId === '__none__'
                        ? categories.filter(c => !c.parent_id && !c.section_id)
                        : categories.filter(c => !c.parent_id && c.section_id === drawerSectionId)
                      ).map(parent => {
                        const subs = categories.filter(c => c.parent_id === parent.id);
                        const isActive = sidebarFilters.categoryId === parent.id;
                        const isExpanded = expandedParents[parent.id] ?? isActive;
                        const hasSubs = subs.length > 0;
                        return (
                          <li key={parent.id}>
                            <div className={`group flex items-stretch rounded-xl overflow-hidden ${
                              isActive ? 'bg-muted' : 'hover:bg-muted/50'
                            }`}>
                              <button
                                onClick={() => {
                                  setSearchParams(prev => {
                                    const p = new URLSearchParams(prev);
                                    p.set('category', parent.slug);
                                    p.delete('section');
                                    p.delete('page');
                                    return p;
                                  });
                                  setCatalogDrawerOpen(false);
                                  setDrawerSectionId(null);
                                }}
                                className="flex-1 flex items-center gap-3 px-3 py-2.5 text-left min-w-0"
                              >
                                {parent.image ? (
                                  <img
                                    src={parent.image}
                                    alt=""
                                    width={36}
                                    height={36}
                                    loading="lazy"
                                    decoding="async"
                                    className="w-9 h-9 rounded-lg object-cover shrink-0"
                                  />
                                ) : (
                                  <span className="w-9 h-9 rounded-lg bg-muted shrink-0" />
                                )}
                                <span className="text-sm font-medium text-foreground truncate">
                                  {catName(parent)}
                                </span>
                              </button>
                              {hasSubs && (
                                <button
                                  onClick={() => setExpandedParents(prev => ({ ...prev, [parent.id]: !isExpanded }))}
                                  className="px-3 flex items-center text-muted-foreground hover:text-foreground"
                                  aria-label="toggle"
                                >
                                  <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>
                              )}
                            </div>
                            {hasSubs && isExpanded && (
                              <ul className="ml-12 mt-0.5 mb-1 border-l border-border pl-3">
                                {subs.map(sub => (
                                  <li key={sub.id}>
                                    <button
                                      onClick={() => {
                                        setSearchParams(prev => {
                                          const p = new URLSearchParams(prev);
                                          p.set('category', sub.slug);
                                          p.delete('section');
                                          p.delete('page');
                                          return p;
                                        });
                                        setCatalogDrawerOpen(false);
                                        setDrawerSectionId(null);
                                      }}
                                      className={`w-full text-left text-[13px] px-2 py-1.5 rounded-md transition-colors ${
                                        sidebarFilters.categoryId === sub.id
                                          ? 'text-primary font-medium'
                                          : 'text-muted-foreground hover:text-foreground'
                                      }`}
                                    >
                                      {catName(sub)}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="px-5 py-4 border-t border-border text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  {settings?.site_name || ''} · Mebel
                </div>
              </SheetContent>
            </Sheet>


            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder={t.catalog.search}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 rounded-xl h-11"
              />
            </div>
          </div>
        </div>




        <div className="flex gap-8">
          <div className="flex-1">
            {/* Products always render — sections overview removed per request */}
            <>

                <p className="text-sm text-muted-foreground mb-4" aria-live="polite">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {language === 'uz' ? 'Yuklanmoqda...' : 'Загрузка...'}
                    </span>
                  ) : !catalogError && !catalogNotFound ? (
                    <>
                      {t.catalog.showing} {products.length} {t.catalog.of} {totalCount} {t.catalog.products}
                    </>
                  ) : null}
                </p>

                {loading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="bg-card rounded-2xl overflow-hidden shadow-warm animate-pulse">
                        <div className="aspect-[4/3] bg-muted" />
                        <div className="p-4 space-y-3">
                          <div className="h-4 bg-muted rounded w-3/4" />
                          <div className="h-4 bg-muted rounded w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : catalogError ? (
                  <div className="text-center py-16 space-y-4" role="alert">
                    <h2 className="text-lg font-semibold">
                      {language === 'uz' ? 'Katalogni yuklab bo‘lmadi' : 'Не удалось загрузить каталог'}
                    </h2>
                    <p className="text-muted-foreground">
                      {language === 'uz' ? 'Ulanishni tekshirib, qayta urinib ko‘ring.' : 'Проверьте соединение и попробуйте ещё раз.'}
                    </p>
                    <Button variant="outline" onClick={handleRetry}>
                      {language === 'uz' ? 'Qayta urinish' : 'Попробовать снова'}
                    </Button>
                  </div>
                ) : catalogNotFound ? (
                  <div className="text-center py-16 space-y-4" role="status">
                    <h2 className="text-lg font-semibold">
                      {setNotFound
                        ? (language === 'uz' ? 'To‘plam topilmadi' : 'Подборка не найдена')
                        : (language === 'uz' ? 'Kategoriya topilmadi' : 'Категория не найдена')}
                    </h2>
                    <p className="text-muted-foreground">
                      {language === 'uz' ? 'Katalogdan boshqa kategoriya yoki mahsulotni tanlang.' : 'Выберите другую категорию или товар в каталоге.'}
                    </p>
                    <Button variant="outline" onClick={handleClearFilters}>
                      {language === 'uz' ? 'Katalogga qaytish' : 'Вернуться в каталог'}
                    </Button>
                  </div>
                ) : products.length > 0 ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {products.map(product => (
                        <ProductCard key={product.id} product={product} />
                      ))}
                    </div>

                    {totalPages > 1 && (
                      <div className="flex justify-center items-center gap-2 mt-8">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(currentPage - 1)}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        {getPaginationNumbers().map((page, idx) =>
                          page === 'ellipsis' ? (
                            <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">...</span>
                          ) : (
                            <Button
                              key={page}
                              variant={currentPage === page ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => handlePageChange(page)}
                            >
                              {page}
                            </Button>
                          )
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(currentPage + 1)}
                          disabled={currentPage === totalPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-16">
                    <p className="text-muted-foreground">{t.catalog.noProducts}</p>
                    <Button
                      variant="link"
                      onClick={handleClearFilters}
                    >
                      {t.catalog.clearFilters}
                    </Button>
                  </div>
                )}
              </>

          </div>
        </div>
      </div>
    </div>
  );
}
