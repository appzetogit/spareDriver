import { useCallback, useEffect, useState } from 'react';
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
 * Models refetch when brandId or carTypeId changes.
 */
export function useVehicleCatalog({ activeOnly = true, brandId = '', carTypeId = '' } = {}) {
  const [categories, setCategories] = useState(BASE_CACHE.categories || []);
  const [fuelTypes, setFuelTypes] = useState(BASE_CACHE.fuelTypes || []);
  const [brands, setBrands] = useState(BASE_CACHE.brands || []);
  const [conditions, setConditions] = useState(BASE_CACHE.conditions || []);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(!BASE_CACHE.categories);
  const [modelsLoading, setModelsLoading] = useState(false);
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

  const loadModels = useCallback(async () => {
    if (!brandId) {
      setModels([]);
      return;
    }
    setModelsLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeOnly) params.set('active', 'true');
      params.set('brandId', brandId);
      if (carTypeId) params.set('carTypeId', carTypeId);
      const res = await api.get(`/common/car-models?${params.toString()}`);
      setModels(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load car models');
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, [activeOnly, brandId, carTypeId]);

  useEffect(() => {
    loadBaseCatalog();
  }, [loadBaseCatalog]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  return {
    categories,
    fuelTypes,
    brands,
    models,
    conditions,
    categoryOptions: toSelectOptions(categories),
    fuelOptions: toSelectOptions(fuelTypes),
    brandOptions: toSelectOptions(brands),
    modelOptions: toSelectOptions(models),
    loading,
    modelsLoading,
    error,
    reload: loadBaseCatalog,
  };
}
