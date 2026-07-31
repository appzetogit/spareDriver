import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import { toSelectOptions } from '../utils/vehicleCatalog';

// ─── Module-level cache ───────────────────────────────────────────────────────
// Categories, fuel types, brands, and conditions are static within a session.
// Caching them here means every component that uses useVehicleCatalog shares
// the same fetched data — no repeat network calls when the edit modal opens.

const BASE_CACHE = {
  categories: null,
  fuelTypes: null,
  brands: null,
  conditions: null,
  promise: null,
};

async function fetchBaseCatalog(activeQuery) {
  if (BASE_CACHE.categories) {
    return {
      categories: BASE_CACHE.categories,
      fuelTypes: BASE_CACHE.fuelTypes,
      brands: BASE_CACHE.brands,
      conditions: BASE_CACHE.conditions,
    };
  }

  if (!BASE_CACHE.promise) {
    BASE_CACHE.promise = api
      .get(`/common/vehicle-catalog${activeQuery}`)
      .then((res) => {
        const data = res.data.data || {};
        BASE_CACHE.categories = data.carTypes || [];
        BASE_CACHE.fuelTypes = data.fuelTypes || [];
        BASE_CACHE.brands = data.carBrands || [];
        BASE_CACHE.conditions = data.conditions || [];
        return {
          categories: BASE_CACHE.categories,
          fuelTypes: BASE_CACHE.fuelTypes,
          brands: BASE_CACHE.brands,
          conditions: BASE_CACHE.conditions,
        };
      });
  }

  return BASE_CACHE.promise;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches vehicle catalog data (categories, fuel, brands, models, conditions).
 * Base catalog is cached module-wide — only fetched once per page session.
 * Brand models refetch when brandId changes; category options are limited to
 * categories that have at least one model for the selected brand.
 */
export function useVehicleCatalog({ activeOnly = true, brandId = '', carTypeId = '' } = {}) {
  const [categories, setCategories] = useState(BASE_CACHE.categories || []);
  const [fuelTypes, setFuelTypes] = useState(BASE_CACHE.fuelTypes || []);
  const [brands, setBrands] = useState(BASE_CACHE.brands || []);
  const [conditions, setConditions] = useState(BASE_CACHE.conditions || []);
  const [brandModels, setBrandModels] = useState([]);
  const [loading, setLoading] = useState(!BASE_CACHE.categories);
  // Start loading when a brand is already selected (edit / preferences hydrate)
  // so callers don't treat empty category lists as "invalid" before fetch.
  const [modelsLoading, setModelsLoading] = useState(() => Boolean(brandId));
  const [error, setError] = useState('');

  const activeQuery = activeOnly ? '?active=true' : '';

  const loadBaseCatalog = useCallback(async () => {
    if (BASE_CACHE.categories) {
      setCategories(BASE_CACHE.categories);
      setFuelTypes(BASE_CACHE.fuelTypes);
      setBrands(BASE_CACHE.brands);
      setConditions(BASE_CACHE.conditions || []);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await fetchBaseCatalog(activeQuery);
      setCategories(data.categories);
      setFuelTypes(data.fuelTypes);
      setBrands(data.brands);
      setConditions(data.conditions || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load vehicle options');
    } finally {
      setLoading(false);
    }
  }, [activeQuery]);

  // All models for the selected brand (not filtered by category) — used to
  // drive both category options and the model list.
  const loadBrandModels = useCallback(async () => {
    if (!brandId) {
      setBrandModels([]);
      setModelsLoading(false);
      return;
    }
    setModelsLoading(true);
    setBrandModels([]);
    try {
      const params = new URLSearchParams();
      if (activeOnly) params.set('active', 'true');
      params.set('brandId', brandId);
      const res = await api.get(`/common/car-models?${params.toString()}`);
      setBrandModels(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load car models');
      setBrandModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, [activeOnly, brandId]);

  useEffect(() => {
    loadBaseCatalog();
  }, [loadBaseCatalog]);

  useEffect(() => {
    loadBrandModels();
  }, [loadBrandModels]);

  const availableCategories = useMemo(() => {
    if (!brandId) return [];
    const typeIds = new Set(
      brandModels
        .map((m) => String(m.carTypeId?._id || m.carTypeId || ''))
        .filter(Boolean),
    );
    return categories.filter((c) => typeIds.has(String(c._id)));
  }, [brandId, brandModels, categories]);

  const models = useMemo(() => {
    if (!carTypeId) return brandModels;
    const selected = String(carTypeId);
    return brandModels.filter((m) => {
      const id = String(m.carTypeId?._id || m.carTypeId || '');
      // null/empty carTypeId = model available for any category
      return !id || id === selected;
    });
  }, [brandModels, carTypeId]);

  return {
    categories: availableCategories,
    fuelTypes,
    brands,
    models,
    conditions,
    categoryOptions: toSelectOptions(availableCategories),
    fuelOptions: toSelectOptions(fuelTypes),
    brandOptions: toSelectOptions(brands),
    modelOptions: toSelectOptions(models),
    loading,
    modelsLoading,
    error,
    reload: loadBaseCatalog,
  };
}
