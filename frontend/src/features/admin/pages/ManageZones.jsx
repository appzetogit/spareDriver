import { useState } from 'react';
import { MapPin, Plus, Edit2, Trash2, Loader2, Circle, Pentagon } from 'lucide-react';
import { ZONE_SHAPE } from '../../../constants/zoneShapes';
import toast from 'react-hot-toast';
import Button from '../../../components/Button';
import api from '../../../utils/api';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminZonesStore } from '../../../store/admin/useAdminZonesStore';
import ZoneFormModal from '../components/ManageZones/ZoneFormModal';
import {
  emptyZoneForm,
  zoneToForm,
  formToZonePayload,
  validateZoneForm,
} from '../utils/zoneFormUtils';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import { canManageZones } from '../../../constants/staffRoles';

const ManageZones = () => {
  const { admin } = useAdminAuthStore();
  const canEdit = canManageZones(admin?.role);
  const cacheKey = buildCacheKey('admin-zones', {});
  const { data: zones = [], loading, refetch } = useCachedQuery(useAdminZonesStore, cacheKey, {});
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyZoneForm());
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyZoneForm());
    setShowModal(true);
  };

  const openEdit = (zone) => {
    setEditing(zone);
    setForm(zoneToForm(zone));
    setShowModal(true);
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleGeometryChange = (patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const handleDelete = async (zone) => {
    if (!window.confirm(`Delete zone "${zone.name}"? This cannot be undone.`)) return;

    setDeletingId(zone._id);
    try {
      await api.delete(`/admin/zones/${zone._id}`);
      toast.success('Zone deleted');
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete zone');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const error = validateZoneForm(form);
    if (error) {
      toast.error(error);
      return;
    }

    setSubmitting(true);
    try {
      const payload = formToZonePayload(form);
      if (editing) {
        await api.put(`/admin/zones/${editing._id}`, payload);
        toast.success('Zone updated');
      } else {
        await api.post('/admin/zones', payload);
        toast.success('Zone created');
      }
      setShowModal(false);
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save zone');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Service zones</h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Define geographic areas where online drivers can receive bookings. Draw a radius
            circle or a pentagon directly on the map.
          </p>
        </div>
        {canEdit && (
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="w-4 h-4 mr-2" />
            Add zone
          </Button>
        )}
      </div>

      {!canEdit && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          View only — only the super admin can edit service zones.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : zones.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-medium">No zones yet</p>
          <p className="text-sm text-slate-500 mt-1 mb-4">Create your first service zone to enable dispatch.</p>
          {canEdit && <Button onClick={openCreate}>Create zone</Button>}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {zones.map((zone) => (
            <div
              key={zone._id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-900 truncate">{zone.name}</h2>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{zone.code}</p>
                </div>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full shrink-0 ${
                    zone.isActive
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {zone.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {zone.city && (
                <p className="text-sm text-slate-600 mb-2 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  {zone.city}
                </p>
              )}

              <dl className="text-xs text-slate-600 space-y-1.5 flex-1">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Center</dt>
                  <dd className="font-mono text-slate-800 text-right">
                    {Number(zone.lat).toFixed(4)}, {Number(zone.lng).toFixed(4)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 items-center">
                  <dt className="text-slate-500">Shape</dt>
                  <dd className="flex items-center gap-1 font-medium text-slate-800">
                    {zone.shapeType === ZONE_SHAPE.POLYGON ? (
                      <>
                        <Pentagon className="w-3 h-3" /> Pentagon
                      </>
                    ) : (
                      <>
                        <Circle className="w-3 h-3" /> {zone.radiusKm} km radius
                      </>
                    )}
                  </dd>
                </div>
              </dl>

              {zone.description && (
                <p className="text-xs text-slate-500 mt-3 line-clamp-2">{zone.description}</p>
              )}

              {canEdit && (
                <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                  <Button variant="outline" size="sm" fullWidth onClick={() => openEdit(zone)}>
                    <Edit2 className="w-3.5 h-3.5 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    fullWidth
                    onClick={() => handleDelete(zone)}
                    loading={deletingId === zone._id}
                    className="text-rose-600 border-rose-200 hover:bg-rose-50"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Delete
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <ZoneFormModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          editing={editing}
          form={form}
          onChange={handleChange}
          onGeometryChange={handleGeometryChange}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      )}
    </div>
  );
};

export default ManageZones;
