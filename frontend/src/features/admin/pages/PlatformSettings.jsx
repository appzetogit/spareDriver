import { useState, useEffect, useCallback } from 'react';
import {
  Car,
  CheckSquare,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  Video,
  Headphones,
  FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import TrainingVideosTab from '../components/PlatformSettings/TrainingVideosTab';
import VehicleCatalogSettings from '../components/PlatformSettings/VehicleCatalogSettings';
import LegalPagesTab from '../components/PlatformSettings/LegalPagesTab';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import Toggle from '../../../components/Toggle';
import Modal from '../../../components/Modal';
import api from '../../../utils/api';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import { canManagePlatformSettings } from '../../../constants/staffRoles';

const EMPTY_SUPPORT_FORM = {
  supportPhone: '',
  supportWhatsapp: '',
  supportEmail: '',
  contactAddress: '',
  supportHours: '',
  androidAppUrl: '',
  iosAppUrl: '',
};

function normalizeSupportForm(data = {}) {
  return {
    supportPhone: data.supportPhone || '',
    supportWhatsapp: data.supportWhatsapp || '',
    supportEmail: data.supportEmail || '',
    contactAddress: data.contactAddress || '',
    supportHours: data.supportHours || '',
    androidAppUrl: data.androidAppUrl || '',
    iosAppUrl: data.iosAppUrl || '',
  };
}

const PlatformSettings = () => {
  const { admin } = useAdminAuthStore();
  const [systemConfig, setSystemConfig] = useState({
    allowNewRegistrations: true,
    autoAssignDrivers: false,
    maintenanceMode: false,
  });

  const [carTypes, setCarTypes] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [trainingVideos, setTrainingVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('vehicles');

  // Modals
  const [showCarModal, setShowCarModal] = useState(false);
  const [showConditionModal, setShowConditionModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form States
  const [carForm, setCarForm] = useState({ name: '', description: '', image: '', isActive: true });
  const [conditionForm, setConditionForm] = useState({ question: '', key: '', isRequired: false, isActive: true });
  const [supportForm, setSupportForm] = useState(EMPTY_SUPPORT_FORM);
  const [supportBaseline, setSupportBaseline] = useState(EMPTY_SUPPORT_FORM);
  const [supportSaving, setSupportSaving] = useState(false);

  const supportDirty =
    JSON.stringify(supportForm) !== JSON.stringify(supportBaseline);

  const fetchData = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const [carsRes, condRes, trainingRes, supportRes] = await Promise.all([
        api.get('/admin/settings/car-types'),
        api.get('/admin/settings/conditions'),
        api.get('/admin/settings/training-videos'),
        api.get('/admin/settings/support'),
      ]);
      setCarTypes(carsRes.data.data);
      setConditions(condRes.data.data);
      setTrainingVideos(trainingRes.data.data);
      const support = normalizeSupportForm(supportRes.data.data || {});
      setSupportForm(support);
      setSupportBaseline(support);
    } catch (err) {
      console.error('Failed to fetch platform data', err);
      if (!silent) {
        toast.error(
          err.response?.data?.message ||
            'Failed to load platform settings. Please log in again if your role was recently changed.',
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSystemToggle = (field) => (val) => {
    setSystemConfig(prev => ({ ...prev, [field]: val }));
  };

  const handleCarSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingItem) {
        await api.put(`/admin/settings/car-types/${editingItem._id}`, carForm);
      } else {
        await api.post('/admin/settings/car-types', carForm);
      }
      await fetchData({ silent: true });
      setShowCarModal(false);
      setEditingItem(null);
      toast.success(editingItem ? 'Car category updated' : 'Car category created');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConditionSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingItem) {
        await api.put(`/admin/settings/conditions/${editingItem._id}`, conditionForm);
      } else {
        await api.post('/admin/settings/conditions', conditionForm);
      }
      await fetchData({ silent: true });
      setShowConditionModal(false);
      setEditingItem(null);
      toast.success(editingItem ? 'Checklist item updated' : 'Checklist item created');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteCarType = async (id) => {
    if (!window.confirm('Delete this car type?')) return;
    try {
      await api.delete(`/admin/settings/car-types/${id}`);
      await fetchData({ silent: true });
      toast.success('Car category deleted');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const deleteCondition = async (id) => {
    if (!window.confirm('Delete this condition?')) return;
    try {
      await api.delete(`/admin/settings/conditions/${id}`);
      await fetchData({ silent: true });
      toast.success('Checklist item deleted');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleSupportSave = async (e) => {
    e.preventDefault();
    if (!supportDirty || supportSaving || loading) return;
    setSupportSaving(true);
    try {
      const res = await api.put('/admin/settings/support', supportForm);
      const saved = normalizeSupportForm(res.data?.data || supportForm);
      setSupportForm(saved);
      setSupportBaseline(saved);
      toast.success('Website & contact settings saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save support settings');
    } finally {
      setSupportSaving(false);
    }
  };

  if (!canManagePlatformSettings(admin?.role)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        You do not have permission to manage platform settings.
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-8 animate-fade-in-up pb-10 px-2 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Platform Settings</h2>
          <p className="text-sm text-slate-500 mt-1">Configure vehicle categories and registration checklists</p>
        </div>
      </div>

      {/* Tabs - Responsive Container */}
      <div className="overflow-x-auto pb-1 no-scrollbar">
        <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 rounded-2xl w-fit">
          {[
            { id: 'vehicles', label: 'Vehicle Catalog', icon: Car },
            { id: 'conditions', label: 'Registration Checklist', icon: CheckSquare },
            { id: 'training', label: 'Driver Training', icon: Video },
            { id: 'support', label: 'Website & Contact', icon: Headphones },
            { id: 'legal', label: 'Legal Pages', icon: FileText },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-yellow-400 text-black shadow-md' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <tab.icon className="w-4.5 h-4.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading platform data...</p>
        </div>
      ) : (
        <div className="space-y-8">
          {activeTab === 'vehicles' && (
            <VehicleCatalogSettings
              carTypes={carTypes}
              onRefresh={() => fetchData({ silent: true })}
              categoryModal={{
                openCreate: () => {
                  setEditingItem(null);
                  setCarForm({ name: '', description: '', image: '', isActive: true });
                  setShowCarModal(true);
                },
                openEdit: (car) => {
                  setEditingItem(car);
                  setCarForm({
                    name: car.name,
                    description: car.description,
                    image: car.image,
                    isActive: car.isActive,
                  });
                  setShowCarModal(true);
                },
                deleteCarType,
              }}
            />
          )}

          {activeTab === 'training' && (
            <TrainingVideosTab
              videos={trainingVideos}
              onRefresh={() => fetchData({ silent: true })}
              onCreate={(payload) => api.post('/admin/settings/training-videos', payload)}
              onUpdate={(id, payload) => api.put(`/admin/settings/training-videos/${id}`, payload)}
              onDelete={async (id) => {
                if (!window.confirm('Delete this training video?')) return;
                await api.delete(`/admin/settings/training-videos/${id}`);
                await fetchData({ silent: true });
              }}
            />
          )}

          {activeTab === 'support' && (
            <Card className="max-w-2xl space-y-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Website & Contact</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Contact details shown on the landing page / Contact Us, plus Android and iOS download links.
                </p>
              </div>
              <form onSubmit={handleSupportSave} className="space-y-4">
                <Input
                  label="Support Phone"
                  value={supportForm.supportPhone}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, supportPhone: e.target.value }))}
                  placeholder="+919876543210"
                  required
                />
                <Input
                  label="Support WhatsApp"
                  value={supportForm.supportWhatsapp}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, supportWhatsapp: e.target.value }))}
                  placeholder="+919876543210"
                  required
                />
                <Input
                  label="Support Email"
                  type="email"
                  value={supportForm.supportEmail}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, supportEmail: e.target.value }))}
                  placeholder="support@sparedriver.com"
                  required
                />
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Office Address</label>
                  <textarea
                    value={supportForm.contactAddress || ''}
                    onChange={(e) => setSupportForm((prev) => ({ ...prev, contactAddress: e.target.value }))}
                    rows={3}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-400/60"
                    placeholder="Full office address"
                  />
                </div>
                <Input
                  label="Support Hours"
                  value={supportForm.supportHours || ''}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, supportHours: e.target.value }))}
                  placeholder="Mon–Sat, 9:00 AM to 6:00 PM"
                />
                <Input
                  label="Android App Download URL"
                  value={supportForm.androidAppUrl || ''}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, androidAppUrl: e.target.value }))}
                  placeholder="https://play.google.com/store/apps/details?id=..."
                />
                <Input
                  label="iOS App Download URL"
                  value={supportForm.iosAppUrl || ''}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, iosAppUrl: e.target.value }))}
                  placeholder="https://apps.apple.com/app/..."
                />
                <Button
                  type="submit"
                  loading={supportSaving}
                  disabled={!supportDirty || loading || supportSaving}
                >
                  Save Website & Contact Settings
                </Button>
              </form>
            </Card>
          )}

          {activeTab === 'legal' && <LegalPagesTab />}

          {/* Checklist Tab */}
          {activeTab === 'conditions' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-800">Registration Checklist</h3>
                <Button 
                  onClick={() => {
                    setEditingItem(null);
                    setConditionForm({ question: '', key: '', isRequired: false, isActive: true });
                    setShowConditionModal(true);
                  }}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Add Question
                </Button>
              </div>

              <div className="space-y-3">
                {conditions.map((cond, idx) => (
                  <div 
                    key={cond._id} 
                    className="flex items-center justify-between p-5 bg-white rounded-2xl border border-slate-200 hover:border-primary/30 hover:shadow-sm transition-all duration-300"
                  >
                    <div className="flex items-center gap-4">
                      <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-400 border border-slate-200">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-semibold text-slate-900">{cond.question}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Key: {cond.key}</span>
                          {cond.isRequired && <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[10px] font-bold">REQUIRED</span>}
                          {!cond.isActive && <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-400 text-[10px] font-bold">DISABLED</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => {
                          setEditingItem(cond);
                          setConditionForm({ 
                            question: cond.question, 
                            key: cond.key, 
                            isRequired: cond.isRequired, 
                            isActive: cond.isActive 
                          });
                          setShowConditionModal(true);
                        }}
                        className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-all"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => deleteCondition(cond._id)}
                        className="p-2.5 hover:bg-rose-50 rounded-xl text-slate-400 hover:text-rose-600 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Car Type Modal */}
      <Modal
        isOpen={showCarModal}
        onClose={() => setShowCarModal(false)}
        title={editingItem ? 'Edit car category' : 'New car category'}
      >
        <form onSubmit={handleCarSubmit} className="space-y-4 p-2">
          <Input 
            label="Category Name" 
            placeholder="e.g. Sedan, SUV, Luxury"
            value={carForm.name}
            onChange={(e) => setCarForm({ ...carForm, name: e.target.value })}
            required
          />
          <Input 
            label="Short Description" 
            placeholder="Describe this vehicle category..."
            value={carForm.description}
            onChange={(e) => setCarForm({ ...carForm, description: e.target.value })}
          />
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
            <span className="text-sm font-semibold text-slate-700">Display this type to drivers</span>
            <Toggle 
              checked={carForm.isActive} 
              onChange={(val) => setCarForm({ ...carForm, isActive: val })} 
            />
          </div>
          <div className="pt-4 flex gap-3">
            <Button variant="outline" fullWidth type="button" onClick={() => setShowCarModal(false)}>Cancel</Button>
            <Button fullWidth type="submit" loading={submitting}>{editingItem ? 'Update Type' : 'Create Type'}</Button>
          </div>
        </form>
      </Modal>

      {/* Condition Modal */}
      <Modal
        isOpen={showConditionModal}
        onClose={() => setShowConditionModal(false)}
        title={editingItem ? 'Edit Question' : 'New Checklist Item'}
      >
        <form onSubmit={handleConditionSubmit} className="space-y-4 p-2">
          <Input 
            label="Registration Question" 
            placeholder="e.g. Do you have a working Dashcam?"
            value={conditionForm.question}
            onChange={(e) => setConditionForm({ ...conditionForm, question: e.target.value })}
            required
          />
          <Input 
            label="Internal Key (Unique)" 
            placeholder="e.g. has_dashcam"
            value={conditionForm.key}
            onChange={(e) => setConditionForm({ ...conditionForm, key: e.target.value })}
            required
            disabled={!!editingItem}
          />
          <div className="space-y-3 p-4 bg-slate-50 rounded-2xl">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">Required to Answer</span>
              <Toggle 
                checked={conditionForm.isRequired} 
                onChange={(val) => setConditionForm({ ...conditionForm, isRequired: val })} 
              />
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <span className="text-sm font-semibold text-slate-700">Enable in Registration</span>
              <Toggle 
                checked={conditionForm.isActive} 
                onChange={(val) => setConditionForm({ ...conditionForm, isActive: val })} 
              />
            </div>
          </div>
          <div className="pt-4 flex gap-3">
            <Button variant="outline" fullWidth type="button" onClick={() => setShowConditionModal(false)}>Cancel</Button>
            <Button fullWidth type="submit" loading={submitting}>{editingItem ? 'Update Question' : 'Create Question'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default PlatformSettings;
