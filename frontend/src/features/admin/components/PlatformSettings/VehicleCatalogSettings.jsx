import { useCallback, useEffect, useMemo, useState } from 'react';
import { Car, Fuel, Tag, Layers } from 'lucide-react';
import api from '../../../../utils/api';
import CatalogManagerTab from './CatalogManagerTab';
import {
  CatalogPanel,
  CatalogSubNav,
  CatalogSectionHeader,
  CatalogToolbar,
  CatalogTable,
  CatalogRow,
  CatalogCell,
  CatalogStatusBadge,
  CatalogRowActions,
  CatalogLoading,
  CatalogEmpty,
  CatalogAddButton,
} from './catalogUi';

const vehicleTabs = [
  { id: 'categories', label: 'CAR CATEGORY', icon: Layers },
  { id: 'fuel', label: 'FUEL TYPE', icon: Fuel },
  { id: 'brands', label: 'CAR BRAND', icon: Tag },
  { id: 'models', label: 'CAR MODEL', icon: Car },
];

const SUB_TAB_STORAGE_KEY = 'admin-vehicle-catalog-subtab';

const TAB_COPY = {
  categories: {
    title: 'CAR CATEGORY',
    description:
      'Body types such as sedan, SUV, or hatchback. Used to match drivers with customer vehicles.',
  },
  fuel: {
    title: 'FUEL TYPE',
    description: 'Fuel options shown when users and drivers register a vehicle.',
  },
  brands: {
    title: 'CAR BRAND',
    description:
      'Manufacturers available during vehicle registration. Each brand can use a jsDelivr logo or a custom upload.',
  },
  models: {
    title: 'CAR MODEL',
    description: 'Models linked to a brand and optional category. Filter by brand to manage faster.',
  },
};

function CategoriesSection({ carTypes, categoryModal, search, readOnly = false }) {
  const { openCreate, openEdit, deleteCarType } = categoryModal;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return carTypes;
    return carTypes.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q),
    );
  }, [carTypes, search]);

  const columns = [
    { key: 'name', label: 'Category' },
    { key: 'description', label: 'Description' },
    { key: 'status', label: 'Status', className: 'w-28' },
    { key: 'actions', label: '', className: 'w-24 text-right' },
  ];

  if (!carTypes?.length) {
    return (
      <CatalogEmpty
        title="No categories yet"
        description="Create categories so drivers and customers can describe their vehicles."
        actionLabel={!readOnly ? 'Add category' : undefined}
        onAction={!readOnly ? openCreate : undefined}
      />
    );
  }

  if (!filtered.length) {
    return (
      <CatalogEmpty
        title="No matches found"
        description="Try a different search term."
      />
    );
  }

  return (
    <>
      <CatalogTable columns={columns}>
        {filtered.map((car) => (
          <CatalogRow key={car._id} muted={!car.isActive}>
            <CatalogCell>
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4 text-slate-500" />
                </span>
                <span className="font-semibold text-slate-900 capitalize">{car.name}</span>
              </div>
            </CatalogCell>
            <CatalogCell className="text-slate-500 max-w-xs">
              <span className="line-clamp-2">{car.description || '—'}</span>
            </CatalogCell>
            <CatalogCell>
              <CatalogStatusBadge active={car.isActive !== false} />
            </CatalogCell>
            <CatalogCell className="text-right">
              {!readOnly && (
                <CatalogRowActions
                  onEdit={() => openEdit(car)}
                  onDelete={() => deleteCarType(car._id)}
                />
              )}
            </CatalogCell>
          </CatalogRow>
        ))}
      </CatalogTable>
      <p className="px-5 sm:px-6 py-3 text-xs text-slate-400 border-t border-slate-100 bg-slate-50/50">
        Showing {filtered.length} of {carTypes.length} categories
      </p>
    </>
  );
}

const VehicleCatalogSettings = ({ carTypes, onRefresh, categoryModal, readOnly = false }) => {
  const [subTab, setSubTab] = useState(() => {
    const saved = sessionStorage.getItem(SUB_TAB_STORAGE_KEY);
    return ['categories', 'fuel', 'brands', 'models'].includes(saved) ? saved : 'categories';
  });
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState({});
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState(carTypes || []);
  const [loadingCounts, setLoadingCounts] = useState(true);

  const loadMeta = useCallback(async () => {
    setLoadingCounts(true);
    try {
      const [fuelRes, brandRes, modelRes, catRes] = await Promise.all([
        api.get('/admin/settings/fuel-types'),
        api.get('/admin/settings/car-brands'),
        api.get('/admin/settings/car-models'),
        api.get('/admin/settings/car-types'),
      ]);
      setCounts({
        categories: (catRes.data.data || []).length,
        fuel: (fuelRes.data.data || []).length,
        brands: (brandRes.data.data || []).length,
        models: (modelRes.data.data || []).length,
      });
      setBrands(brandRes.data.data || []);
      setCategories(catRes.data.data || []);
    } catch (err) {
      console.error('Failed to load catalog counts', err);
    } finally {
      setLoadingCounts(false);
    }
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta, carTypes]);

  useEffect(() => {
    setSearch('');
  }, [subTab]);

  const handleCatalogMutate = () => {
    loadMeta();
    if (subTab === 'categories') {
      onRefresh?.();
    }
  };

  const handleSubTabChange = (id) => {
    setSubTab(id);
    sessionStorage.setItem(SUB_TAB_STORAGE_KEY, id);
    if (id === 'models') loadMeta();
  };

  const copy = TAB_COPY[subTab];

  return (
    <CatalogPanel>
      <div className="px-5 sm:px-6 pt-5 pb-1">
        <p className="text-sm text-slate-600 leading-relaxed">
          Manage the vehicle data used in driver onboarding and customer car registration.
          Drivers are matched to users by <strong className="font-semibold text-slate-800">category</strong>.
        </p>
      </div>

      <CatalogSubNav
        tabs={vehicleTabs}
        activeId={subTab}
        onChange={handleSubTabChange}
        counts={loadingCounts ? {} : counts}
      />

      {subTab === 'categories' && (
        <>
          <CatalogSectionHeader
            title={copy.title}
            description={copy.description}
            action={
              !readOnly ? (
                <CatalogAddButton label="Add category" onClick={categoryModal.openCreate} />
              ) : null
            }
          />
          <CatalogToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search categories..."
          />
          <CategoriesSection
            carTypes={carTypes}
            categoryModal={categoryModal}
            search={search}
            readOnly={readOnly}
          />
        </>
      )}

      {subTab === 'fuel' && (
        <CatalogManagerTab
          resource="fuel-types"
          title={copy.title}
          description={copy.description}
          itemLabel="Fuel type"
          formType="simple"
          onMutate={handleCatalogMutate}
          readOnly={readOnly}
        />
      )}

      {subTab === 'brands' && (
        <CatalogManagerTab
          resource="car-brands"
          title={copy.title}
          description={copy.description}
          itemLabel="Brand"
          formType="simple"
          onMutate={handleCatalogMutate}
          readOnly={readOnly}
        />
      )}

      {subTab === 'models' && (
        <CatalogManagerTab
          resource="car-models"
          title={copy.title}
          description={copy.description}
          itemLabel="Model"
          formType="model"
          categories={categories}
          brands={brands}
          onMutate={handleCatalogMutate}
          brandFilter
          readOnly={readOnly}
        />
      )}

      <div className="h-2" />
    </CatalogPanel>
  );
};

export default VehicleCatalogSettings;
