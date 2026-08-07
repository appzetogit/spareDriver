import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Button from '../../../../components/Button';
import Input from '../../../../components/Input';
import Toggle from '../../../../components/Toggle';
import Modal from '../../../../components/Modal';
import Select from '../../../../components/Select';
import api from '../../../../utils/api';
import { uploadImage } from '../../../../utils/upload';
import { toSelectOptions } from '../../../../utils/vehicleCatalog';
import { resolveCarBrandLogoUrl } from '../../../../utils/carBrandLogo';
import {
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

const emptyForm = { name: '', logo: '', sortOrder: 0, isActive: true, brandId: '', carTypeId: '' };

const CatalogManagerTab = ({
  resource,
  title,
  description,
  itemLabel,
  formType = 'simple',
  categories = [],
  brands = [],
  onMutate,
  brandFilter = false,
  embedded = false,
  readOnly = false,
}) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterBrandId, setFilterBrandId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  const isBrandResource = resource === 'car-brands';
  const basePath = `/admin/settings/${resource}`;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = formType === 'model' && filterBrandId ? `?brandId=${filterBrandId}` : '';
      const res = await api.get(`${basePath}${params}`);
      setItems(res.data.data || []);
    } catch (err) {
      console.error(`Failed to load ${resource}`, err);
    } finally {
      setLoading(false);
    }
  }, [basePath, resource, formType, filterBrandId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const name = item.name?.toLowerCase() || '';
      const brand = item.brandId?.name?.toLowerCase() || '';
      const cat = item.carTypeId?.name?.toLowerCase() || '';
      return name.includes(q) || brand.includes(q) || cat.includes(q);
    });
  }, [items, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      brandId: filterBrandId || '',
    });
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      name: item.name,
      logo: item.logo || '',
      sortOrder: item.sortOrder || 0,
      isActive: item.isActive !== false,
      brandId: item.brandId?._id || item.brandId || '',
      carTypeId: item.carTypeId?._id || item.carTypeId || '',
    });
    setShowModal(true);
  };

  const handleLogoUpload = async (file) => {
    if (!file) return;
    setLogoUploading(true);
    try {
      const result = await uploadImage(file);
      setForm((p) => ({ ...p, logo: result.url || '' }));
      toast.success('Logo uploaded');
    } catch (err) {
      toast.error(err.message || 'Logo upload failed');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleUseCdnLogo = () => {
    const url = resolveCarBrandLogoUrl(form.name);
    if (!url) {
      toast.error('Enter a brand name first');
      return;
    }
    setForm((p) => ({ ...p, logo: url }));
    toast.success('CDN logo applied');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (formType === 'model' && !form.brandId) {
      toast.error('Please select a brand');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      };
      if (isBrandResource) {
        payload.logo = form.logo?.trim() || resolveCarBrandLogoUrl(form.name.trim());
      }
      if (formType === 'model') {
        payload.brandId = form.brandId;
        payload.carTypeId = form.carTypeId || null;
      }

      if (editing) {
        await api.put(`${basePath}/${editing._id}`, payload);
      } else {
        await api.post(basePath, payload);
      }
      setShowModal(false);
      await fetchItems();
      onMutate?.();
      toast.success(editing ? `${itemLabel} updated` : `${itemLabel} created`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`Delete this ${itemLabel.toLowerCase()}?`)) return;
    try {
      await api.delete(`${basePath}/${id}`);
      await fetchItems();
      onMutate?.();
      toast.success(`${itemLabel} deleted`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const columns =
    formType === 'model'
      ? [
          { key: 'name', label: 'Model' },
          { key: 'brand', label: 'Brand' },
          { key: 'category', label: 'Category' },
          { key: 'order', label: 'Order', className: 'w-20' },
          { key: 'status', label: 'Status', className: 'w-28' },
          { key: 'actions', label: '', className: 'w-24 text-right' },
        ]
      : isBrandResource
        ? [
            { key: 'name', label: 'Brand' },
            { key: 'order', label: 'Order', className: 'w-20' },
            { key: 'status', label: 'Status', className: 'w-28' },
            { key: 'actions', label: '', className: 'w-24 text-right' },
          ]
        : [
            { key: 'name', label: 'Name' },
            { key: 'order', label: 'Order', className: 'w-20' },
            { key: 'status', label: 'Status', className: 'w-28' },
            { key: 'actions', label: '', className: 'w-24 text-right' },
          ];

  return (
    <>
      {!embedded && (
        <CatalogSectionHeader
          title={title}
          description={description}
          action={
            !readOnly ? (
              <CatalogAddButton label={`Add ${itemLabel}`} onClick={openCreate} />
            ) : null
          }
        />
      )}

      <CatalogToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search ${itemLabel.toLowerCase()}s...`}
      >
        {brandFilter && brands.length > 0 && (
          <div className="w-full sm:w-48">
            <Select
              options={[{ value: '', label: 'All brands' }, ...toSelectOptions(brands)]}
              value={filterBrandId}
              onChange={setFilterBrandId}
              placeholder="Filter brand"
            />
          </div>
        )}
      </CatalogToolbar>

      {loading ? (
        <CatalogLoading />
      ) : filtered.length === 0 ? (
        <CatalogEmpty
          title={items.length === 0 ? `No ${itemLabel.toLowerCase()}s yet` : 'No matches found'}
          description={
            items.length === 0
              ? `Add your first ${itemLabel.toLowerCase()} for driver and user onboarding.`
              : 'Try a different search term or clear filters.'
          }
          actionLabel={!readOnly && items.length === 0 ? `Add ${itemLabel}` : undefined}
          onAction={!readOnly && items.length === 0 ? openCreate : undefined}
        />
      ) : (
        <CatalogTable columns={columns} empty={false}>
          {filtered.map((item) => (
            <CatalogRow key={item._id} muted={!item.isActive}>
              <CatalogCell>
                <div className="flex items-center gap-3">
                  {isBrandResource && (
                    <span className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                      {item.logo ? (
                        <img
                          src={item.logo}
                          alt=""
                          className="w-7 h-7 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <span className="text-[10px] text-slate-400">—</span>
                      )}
                    </span>
                  )}
                  <span className="font-semibold text-slate-900 capitalize">{item.name}</span>
                </div>
              </CatalogCell>
              {formType === 'model' && (
                <>
                  <CatalogCell className="text-slate-600 capitalize">
                    {item.brandId?.name || '—'}
                  </CatalogCell>
                  <CatalogCell className="text-slate-600 capitalize">
                    {item.carTypeId?.name || 'Any'}
                  </CatalogCell>
                </>
              )}
              <CatalogCell className="text-slate-500 tabular-nums">{item.sortOrder ?? 0}</CatalogCell>
              <CatalogCell>
                <CatalogStatusBadge active={item.isActive !== false} />
              </CatalogCell>
              <CatalogCell className="text-right">
                {!readOnly && (
                  <CatalogRowActions
                    onEdit={() => openEdit(item)}
                    onDelete={() => handleDelete(item._id)}
                  />
                )}
              </CatalogCell>
            </CatalogRow>
          ))}
        </CatalogTable>
      )}

      {!loading && filtered.length > 0 && (
        <p className="px-5 sm:px-6 py-3 text-xs text-slate-400 border-t border-slate-100 bg-slate-50/50">
          Showing {filtered.length} of {items.length} {itemLabel.toLowerCase()}
          {itemLabel.endsWith('s') ? '' : 's'}
        </p>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? `Edit ${itemLabel}` : `New ${itemLabel}`}
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-1">
          {formType === 'model' && (
            <>
              <Select
                label="Brand"
                options={toSelectOptions(brands)}
                value={form.brandId}
                onChange={(val) => setForm((p) => ({ ...p, brandId: val }))}
                placeholder="Select brand"
                searchable
              />
              <Select
                label="Category (optional)"
                options={toSelectOptions(categories)}
                value={form.carTypeId}
                onChange={(val) => setForm((p) => ({ ...p, carTypeId: val }))}
                placeholder="Any category"
                searchable
              />
            </>
          )}
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            required
          />
          {isBrandResource && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Brand logo</label>
              <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
                <span className="w-14 h-14 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                  {form.logo ? (
                    <img src={form.logo} alt="" className="w-12 h-12 object-contain" />
                  ) : (
                    <span className="text-[10px] text-slate-400 px-1 text-center">No logo</span>
                  )}
                </span>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex">
                      <span className="sr-only">Upload logo</span>
                      <input
                        type="file"
                        accept="image/*,.svg"
                        className="hidden"
                        disabled={logoUploading || submitting}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          handleLogoUpload(file);
                        }}
                      />
                      <span className="inline-flex items-center justify-center h-9 px-3 rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer hover:bg-slate-800">
                        {logoUploading ? 'Uploading…' : 'Upload'}
                      </span>
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 px-3 text-xs"
                      onClick={handleUseCdnLogo}
                      disabled={submitting || !form.name.trim()}
                    >
                      Use CDN logo
                    </Button>
                    {form.logo && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 px-3 text-xs text-rose-600 border-rose-200"
                        onClick={() => setForm((p) => ({ ...p, logo: '' }))}
                        disabled={submitting}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Defaults to jsDelivr brand logos when empty. Upload to override.
                  </p>
                </div>
              </div>
            </div>
          )}
          <Input
            label="Sort order"
            type="number"
            value={form.sortOrder}
            onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))}
          />
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div>
              <span className="text-sm font-semibold text-slate-800">Visible in app</span>
              <p className="text-xs text-slate-500 mt-0.5">Inactive items are hidden from onboarding</p>
            </div>
            <Toggle
              checked={form.isActive}
              onChange={(val) => setForm((p) => ({ ...p, isActive: val }))}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" fullWidth type="button" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button variant="admin" fullWidth type="submit" loading={submitting || logoUploading}>
              {editing ? 'Save changes' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};

export default CatalogManagerTab;
