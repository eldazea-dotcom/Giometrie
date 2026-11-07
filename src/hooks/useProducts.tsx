import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiGet } from '@/integrations/api/client';

export interface ProductAttributeItem {
  id: string;
  icon: string;
  label_uz: string;
  label_ru: string;
  value_uz: string;
  value_ru: string;
}

export interface ProductFurnitureItem {
  id: string;
  name_uz: string;
  name_ru: string;
  slug: string | null;
  brand: string | null;
  model: string | null;
  article: string | null;
  image: string | null;
  description_uz: string | null;
  description_ru: string | null;
  category: { id: string; name_uz: string; name_ru: string } | null;
  quantity: number;
}

// A "material" used to build this product — itself just another Product (one that
// lives in the Materials section, e.g. an LDSP panel), linked via ProductMaterial.
export interface ProductMaterialItem {
  id: string;
  name_uz: string;
  name_ru: string;
  slug: string | null;
  images: string[];
  price: number | null;
  quantity: number;
}

export interface Product {
  id: string;
  name_uz: string;
  name_ru: string;
  translations: Record<string, { name?: string; description?: string; fullDescription?: string; metaTitle?: string; metaDescription?: string }> | null;
  slug: string | null;
  description_uz: string | null;
  description_ru: string | null;
  full_description_uz: string | null;
  full_description_ru: string | null;
  category_id: string | null;
  price: number | null;
  original_price: number | null;
  images: string[] | null;
  certificates: string[] | null;
  materials: string[] | null;
  sizes: string[] | null;
  colors: string[] | null;
  fur_length: string[] | null;
  application: string[] | null;
  is_negotiable: boolean | null;
  in_stock: boolean | null;
  is_featured: boolean | null;
  is_active: boolean | null;
  is_indexed: boolean | null;
  is_followed: boolean | null;
  meta_title_uz: string | null;
  meta_title_ru: string | null;
  meta_description_uz: string | null;
  meta_description_ru: string | null;
  meta_keywords: string | null;
  attributes: ProductAttributeItem[] | null;
  furniture: ProductFurnitureItem[] | null;
  material_products: ProductMaterialItem[] | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name_uz: string;
  name_ru: string;
  translations: Record<string, { name?: string; metaTitle?: string; metaDescription?: string }> | null;
  slug: string;
  icon: string | null;
  image: string | null;
  is_active: boolean | null;
  show_in_banner?: boolean | null;
  parent_id: string | null;
  section_id: string | null;
  meta_title_uz: string | null;
  meta_title_ru: string | null;
  meta_description_uz: string | null;
  meta_description_ru: string | null;
  meta_keywords: string | null;
}

export interface ProductFilters {
  search?: string;
  categoryId?: string;
  categoryIds?: string[];
  excludeCategoryIds?: string[];
  priceMin?: number;
  priceMax?: number;
  materials?: string[];
  colors?: string[];
  furLengths?: string[];
  applications?: string[];
  inStock?: boolean;
  isFeatured?: boolean;
  isActive?: boolean;
  discounted?: boolean;
  promoTileId?: string;
  productIds?: string[];
}

export interface ProductsResponse {
  products: Product[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
}

const PAGE_SIZE = 24;

// Maps a camelCase API product row onto the snake_case shape every page/component
// in this codebase already expects (kept as-is to avoid touching ~15 consumer files).
export function mapApiProduct(p: any): Product {
  return {
    id: p.id,
    name_uz: p.nameUz,
    name_ru: p.nameRu,
    translations: p.translations,
    slug: p.slug,
    description_uz: p.descriptionUz,
    description_ru: p.descriptionRu,
    full_description_uz: p.fullDescriptionUz,
    full_description_ru: p.fullDescriptionRu,
    category_id: p.categoryId,
    price: p.price,
    original_price: p.originalPrice,
    images: p.images,
    certificates: p.certificates || [],
    materials: p.materials,
    sizes: p.sizes,
    colors: p.colors,
    fur_length: p.furLength,
    application: p.application,
    is_negotiable: p.isNegotiable,
    in_stock: p.inStock,
    is_featured: p.isFeatured,
    is_active: p.isActive,
    is_indexed: p.isIndexed,
    is_followed: p.isFollowed,
    meta_title_uz: p.metaTitleUz,
    meta_title_ru: p.metaTitleRu,
    meta_description_uz: p.metaDescriptionUz,
    meta_description_ru: p.metaDescriptionRu,
    meta_keywords: p.metaKeywords,
    attributes: Array.isArray(p.attributes) ? p.attributes : null,
    furniture: Array.isArray(p.furniture)
      ? p.furniture.map((f: any) => ({
          id: f.id,
          name_uz: f.nameUz,
          name_ru: f.nameRu,
          slug: f.slug,
          brand: f.brand,
          model: f.model,
          article: f.article,
          image: f.image,
          description_uz: f.descriptionUz ?? null,
          description_ru: f.descriptionRu ?? null,
          category: f.category
            ? { id: f.category.id, name_uz: f.category.nameUz, name_ru: f.category.nameRu }
            : null,
          quantity: f.quantity,
        }))
      : null,
    material_products: Array.isArray(p.materialProducts)
      ? p.materialProducts.map((m: any) => ({
          id: m.id,
          name_uz: m.nameUz,
          name_ru: m.nameRu,
          slug: m.slug,
          images: m.images || [],
          price: m.price,
          quantity: m.quantity,
        }))
      : null,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

function mapCategory(c: any): Category {
  return {
    id: c.id,
    name_uz: c.nameUz,
    name_ru: c.nameRu,
    translations: c.translations,
    slug: c.slug,
    icon: c.icon,
    image: c.image,
    is_active: c.isActive,
    show_in_banner: c.showInBanner,
    parent_id: c.parentId,
    section_id: c.sectionId,
    meta_title_uz: c.metaTitleUz,
    meta_title_ru: c.metaTitleRu,
    meta_description_uz: c.metaDescriptionUz,
    meta_description_ru: c.metaDescriptionRu,
    meta_keywords: c.metaKeywords,
  };
}

export function useProducts(
  page: number = 1,
  filters: ProductFilters = {},
  pageSize: number = PAGE_SIZE
) {
  const filtersKey = JSON.stringify(filters);
  const requestKey = `${page}:${pageSize}:${filtersKey}`;
  const [data, setData] = useState<ProductsResponse>({
    products: [],
    totalCount: 0,
    totalPages: 0,
    currentPage: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [loadedRequestKey, setLoadedRequestKey] = useState('');
  const requestVersion = useRef(0);

  const fetchProducts = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);

    try {
      if (filters.productIds && filters.productIds.length === 0) {
        setData({ products: [], totalCount: 0, totalPages: 0, currentPage: page });
        setLoadedRequestKey(requestKey);
        setLoading(false);
        return;
      }

      const result = await apiGet<{ items: any[]; total: number }>('/api/products', {
        page,
        pageSize,
        search: filters.search,
        categoryId: filters.categoryId && filters.categoryId !== 'all' ? filters.categoryId : undefined,
        categoryIds: filters.categoryIds,
        excludeCategoryIds: filters.excludeCategoryIds,
        priceMin: filters.priceMin,
        priceMax: filters.priceMax,
        materials: filters.materials,
        colors: filters.colors,
        furLengths: filters.furLengths,
        applications: filters.applications,
        inStock: filters.inStock,
        isFeatured: filters.isFeatured,
        isActive: filters.isActive,
        discounted: filters.discounted,
        promoTileId: filters.promoTileId,
        productIds: filters.productIds,
      });
      if (version !== requestVersion.current) return;

      const products = result.items.map(mapApiProduct);
      const totalPages = Math.ceil(result.total / pageSize);

      setData({ products, totalCount: result.total, totalPages, currentPage: page });
      setLoadedRequestKey(requestKey);
    } catch (err) {
      if (version !== requestVersion.current) return;
      console.error('Error fetching products:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch products'));
      setLoadedRequestKey(requestKey);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [page, pageSize, filtersKey, requestKey]);

  useEffect(() => {
    fetchProducts();
    return () => { requestVersion.current += 1; };
  }, [fetchProducts]);

  return { ...data, loading: loading || loadedRequestKey !== requestKey, error: loadedRequestKey === requestKey ? error : null, refetch: fetchProducts };
}

export function useFeaturedProducts(limit: number = 8, enabled = true) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const fetchFeatured = async () => {
      try {
        const { items } = await apiGet<{ items: any[] }>('/api/products/featured');
        if (items.length > 0) {
          setProducts(items.slice(0, limit).map(mapApiProduct));
        } else {
          const all = await apiGet<{ items: any[] }>('/api/products', { pageSize: limit });
          setProducts(all.items.map(mapApiProduct));
        }
      } catch (err) {
        console.error('Error fetching featured products:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchFeatured();
  }, [limit, enabled]);

  return { products, loading };
}

export function useCategories(enabled = true) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const requestVersion = useRef(0);

  const fetchCategories = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!enabled) {
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { items } = await apiGet<{ items: any[] }>('/api/categories');
      if (version !== requestVersion.current) return;
      setCategories(items.map(mapCategory));
    } catch (err) {
      if (version !== requestVersion.current) return;
      console.error('Error fetching categories:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch categories'));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchCategories();
    return () => { requestVersion.current += 1; };
  }, [fetchCategories]);

  return { categories, loading, error, refetch: fetchCategories };
}

// Alias with explicit loaded flag for callers that need to distinguish
// "still loading" from "loaded and empty".
export function useCategoriesWithState(enabled = true) {
  const { categories, loading } = useCategories(enabled);
  return { categories, loading, loaded: !loading };
}

export function useSections(enabled = true) {
  const [sections, setSections] = useState<Array<{ id: string; name_uz: string; name_ru: string; translations: Record<string, { name?: string }> | null; slug: string; sort_order: number; is_active: boolean; show_in_main_nav: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const requestVersion = useRef(0);

  const fetchSections = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!enabled) {
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { items } = await apiGet<{ items: any[] }>('/api/sections');
      if (version !== requestVersion.current) return;
      setSections(
        items.map((s) => ({
          id: s.id,
          name_uz: s.nameUz,
          name_ru: s.nameRu,
          translations: s.translations,
          slug: s.slug,
          sort_order: s.sortOrder,
          is_active: s.isActive,
          show_in_main_nav: s.showInMainNav !== false,
        }))
      );
    } catch (err) {
      if (version !== requestVersion.current) return;
      console.error('Error fetching sections:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch sections'));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchSections();
    return () => { requestVersion.current += 1; };
  }, [fetchSections]);

  return { sections, loading, error, refetch: fetchSections };
}

// Admin hook for the "Materiallar" tab's picker (MaterialSelector): every product
// filed under the standalone "Materials" section (and its subcategories) — the same
// section /materials and /admin/materials scope to. `all=true` requires the caller to
// be an authenticated admin (see optionalAuth in products.routes.ts) so drafts show up too.
export function useAllMaterialProducts(filters?: { search?: string; categoryId?: string }) {
  const { sections, loading: sectionsLoading } = useSections();
  const { categories: allCategories, loading: categoriesLoading } = useCategories();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const materialsSection = useMemo(
    () => sections.find((s) => s.show_in_main_nav === false),
    [sections]
  );

  const categoryIds = useMemo(() => {
    if (!materialsSection) return [] as string[];
    const ids = new Set<string>();
    const walk = (id: string) => {
      ids.add(id);
      allCategories.filter((c) => c.parent_id === id).forEach((child) => walk(child.id));
    };
    allCategories.filter((c) => c.section_id === materialsSection.id).forEach((c) => walk(c.id));
    return Array.from(ids);
  }, [materialsSection, allCategories]);

  const categories = useMemo(
    () => allCategories.filter((c) => categoryIds.includes(c.id)),
    [allCategories, categoryIds]
  );

  const ready = !sectionsLoading && !categoriesLoading;
  const categoryIdsKey = categoryIds.join(',');

  useEffect(() => {
    if (!ready) return;
    if (categoryIds.length === 0) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const params: Record<string, unknown> = {
          categoryIds: filters?.categoryId ? filters.categoryId : categoryIdsKey,
          all: 'true',
          pageSize: 200,
        };
        if (filters?.search) params.search = filters.search;
        const data = await apiGet<{ items: any[] }>('/api/products', params);
        setProducts((data.items || []).map(mapApiProduct));
      } catch (err) {
        console.error('useAllMaterialProducts:', err);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, categoryIdsKey, filters?.categoryId, filters?.search]);

  return { products, categories, loading };
}

export function useProductBySlug(slug: string) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!slug) {
        setLoading(false);
        return;
      }

      try {
        const { item } = await apiGet<{ item: any }>(`/api/products/${encodeURIComponent(slug)}`);
        setProduct(item ? mapApiProduct(item) : null);
      } catch (err) {
        console.error('Error fetching product:', err);
        setError(err instanceof Error ? err : new Error('Failed to fetch product'));
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [slug]);

  return { product, loading, error };
}

export function useProductById(idOrSlug: string) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!idOrSlug) {
        setLoading(false);
        return;
      }

      try {
        const { item } = await apiGet<{ item: any }>(`/api/products/${encodeURIComponent(idOrSlug)}`);
        setProduct(item ? mapApiProduct(item) : null);
      } catch (err) {
        console.error('Error fetching product:', err);
        setError(err instanceof Error ? err : new Error('Failed to fetch product'));
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [idOrSlug]);

  return { product, loading, error };
}

// Hook to get unique filter values from all active products
export function useProductFilterOptions() {
  const [options, setOptions] = useState<{
    materials: string[];
    colors: string[];
    furLengths: string[];
    applications: string[];
    maxPrice: number;
  }>({
    materials: [],
    colors: [],
    furLengths: [],
    applications: [],
    maxPrice: 700000,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const data = await apiGet<{
          materials: string[];
          colors: string[];
          furLengths: string[];
          applications: string[];
          maxPrice: number;
        }>('/api/products/filter-options');

        setOptions({
          materials: [...data.materials].sort(),
          colors: [...data.colors].sort(),
          furLengths: [...data.furLengths].sort(),
          applications: [...data.applications].sort(),
          maxPrice: data.maxPrice || 700000,
        });
      } catch (err) {
        console.error('Error fetching filter options:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOptions();
  }, []);

  return { options, loading };
}

// Materials list for filtering (legacy)
export const MATERIALS = [
  { id: 'yog\'och', name_uz: "Yog'och", name_ru: "Дерево" },
  { id: 'mdf', name_uz: "MDF", name_ru: "МДФ" },
  { id: 'metall', name_uz: "Metall", name_ru: "Металл" },
  { id: 'mato', name_uz: "Mato", name_ru: "Ткань" },
  { id: 'teri', name_uz: "Teri", name_ru: "Кожа" },
  { id: 'oyna', name_uz: "Oyna", name_ru: "Стекло" },
];
