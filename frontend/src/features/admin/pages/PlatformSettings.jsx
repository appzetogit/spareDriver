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
  Building2,
  Receipt,
  ShieldCheck,
  CreditCard,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import TrainingVideosTab from '../components/PlatformSettings/TrainingVideosTab';
import VehicleCatalogSettings from '../components/PlatformSettings/VehicleCatalogSettings';
import LegalPagesTab from '../components/PlatformSettings/LegalPagesTab';
import BanksTab from '../components/PlatformSettings/BanksTab';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import Toggle from '../../../components/Toggle';
import Modal from '../../../components/Modal';
import api from '../../../utils/api';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import {
  canManagePlatformSettings,
  canViewPlatformSettings,
} from '../../../constants/staffRoles';

/**
 * One labelled toggle in a settings group. Module-level so it keeps its
 * identity across renders (a component defined inside PlatformSettings
 * would remount the Toggle on every keystroke elsewhere on the page).
 */
const ToggleRow = ({ title, description, checked, onChange, disabled }) => (
  <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 rounded-2xl">
    <div className="min-w-0">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
    </div>
    <Toggle checked={Boolean(checked)} onChange={onChange} disabled={disabled} />
  </div>
);

const EMPTY_SUPPORT_FORM = {
  supportPhone: '',
  supportWhatsapp: '',
  supportEmail: '',
  contactAddress: '',
  supportHours: '',
  androidAppUrl: '',
  iosAppUrl: '',
  instagramUrl: '',
  facebookUrl: '',
  twitterUrl: '',
  linkedinUrl: '',
  youtubeUrl: '',
};

const EMPTY_GST_FORM = {
  gstin: '',
  legalName: '',
  tradeName: '',
  address: '',
  state: '',
  stateCode: '',
  pan: '',
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
    instagramUrl: data.instagramUrl || '',
    facebookUrl: data.facebookUrl || '',
    twitterUrl: data.twitterUrl || '',
    linkedinUrl: data.linkedinUrl || '',
    youtubeUrl: data.youtubeUrl || '',
  };
}

function normalizeGstForm(data = {}) {
  return {
    gstin: data.gstin || '',
    legalName: data.legalName || '',
    tradeName: data.tradeName || '',
    address: data.address || '',
    state: data.state || '',
    stateCode: data.stateCode || '',
    pan: data.pan || '',
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
  const [banks, setBanks] = useState([]);
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
  const [gstForm, setGstForm] = useState(EMPTY_GST_FORM);
  const [gstBaseline, setGstBaseline] = useState(EMPTY_GST_FORM);
  const [gstSaving, setGstSaving] = useState(false);
  const [policeVerificationRequired, setPoliceVerificationRequired] = useState(false);
  const [policeVerificationBaseline, setPoliceVerificationBaseline] = useState(false);
  const [driverDocsSaving, setDriverDocsSaving] = useState(false);
  const [payments, setPayments] = useState(null);
  const [paymentsBaseline, setPaymentsBaseline] = useState(null);
  const [paymentsSaving, setPaymentsSaving] = useState(false);

  const supportDirty =
    JSON.stringify(supportForm) !== JSON.stringify(supportBaseline);
  const gstDirty = JSON.stringify(gstForm) !== JSON.stringify(gstBaseline);
  const driverDocsDirty = policeVerificationRequired !== policeVerificationBaseline;
  const paymentsDirty =
    JSON.stringify(payments) !== JSON.stringify(paymentsBaseline);

  const fetchData = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const [
        carsRes,
        condRes,
        trainingRes,
        supportRes,
        banksRes,
        gstRes,
        driverDocsRes,
        paymentsRes,
      ] = await Promise.all([
        api.get('/admin/settings/car-types'),
        api.get('/admin/settings/conditions'),
        api.get('/admin/settings/training-videos'),
        api.get('/admin/settings/support'),
        api.get('/admin/settings/banks'),
        api.get('/admin/settings/gst'),
        api.get('/admin/settings/driver-documents'),
        api.get('/admin/settings/payment-methods'),
      ]);
      setCarTypes(carsRes.data.data);
      setConditions(condRes.data.data);
      setTrainingVideos(trainingRes.data.data);
      setBanks(banksRes.data.data || []);
      const support = normalizeSupportForm(supportRes.data.data || {});
      setSupportForm(support);
      setSupportBaseline(support);
      const gst = normalizeGstForm(gstRes.data.data || {});
      setGstForm(gst);
      setGstBaseline(gst);
      const pvcRequired = Boolean(driverDocsRes.data?.data?.policeVerificationRequired);
      setPoliceVerificationRequired(pvcRequired);
      setPoliceVerificationBaseline(pvcRequired);
      const paymentCfg = paymentsRes.data?.data || null;
      setPayments(paymentCfg);
      setPaymentsBaseline(paymentCfg);
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

  const handleGstSave = async (e) => {
    e.preventDefault();
    if (!gstDirty || gstSaving || loading) return;
    setGstSaving(true);
    try {
      const res = await api.put('/admin/settings/gst', gstForm);
      const saved = normalizeGstForm(res.data?.data || gstForm);
      setGstForm(saved);
      setGstBaseline(saved);
      toast.success('GST details saved — they will appear on customer invoices');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save GST details');
    } finally {
      setGstSaving(false);
    }
  };

  const handleDriverDocsSave = async (e) => {
    e.preventDefault();
    if (!driverDocsDirty || driverDocsSaving || loading) return;
    setDriverDocsSaving(true);
    try {
      const res = await api.put('/admin/settings/driver-documents', {
        policeVerificationRequired,
      });
      const saved = Boolean(res.data?.data?.policeVerificationRequired);
      setPoliceVerificationRequired(saved);
      setPoliceVerificationBaseline(saved);
      toast.success('Driver document requirements saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save document requirements');
    } finally {
      setDriverDocsSaving(false);
    }
  };

  /** Flip a master rail switch (`razorpayEnabled` / `codEnabled`). */
  const setPaymentMaster = (key) => (val) =>
    setPayments((prev) => (prev ? { ...prev, [key]: val } : prev));

  /** Flip one rail on one checkout flow, e.g. flows.booking.cod. */
  const setPaymentFlow = (flow, rail) => (val) =>
    setPayments((prev) =>
      prev
        ? {
            ...prev,
            flows: {
              ...prev.flows,
              [flow]: { ...prev.flows?.[flow], [rail]: val },
            },
          }
        : prev,
    );

  /** Set a numeric knob under `cod`. Empty input means 0, not NaN. */
  const setCodNumber = (key) => (e) => {
    const raw = e.target.value;
    const n = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(n) || n < 0) return;
    setPayments((prev) => (prev ? { ...prev, cod: { ...prev.cod, [key]: n } } : prev));
  };

  const setCodBool = (key) => (val) =>
    setPayments((prev) => (prev ? { ...prev, cod: { ...prev.cod, [key]: val } } : prev));

  const handlePaymentsSave = async (e) => {
    e.preventDefault();
    if (!paymentsDirty || paymentsSaving || loading || !payments) return;
    setPaymentsSaving(true);
    try {
      const res = await api.put('/admin/settings/payment-methods', payments);
      const saved = res.data?.data || payments;
      setPayments(saved);
      setPaymentsBaseline(saved);
      toast.success('Payment methods saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save payment methods');
    } finally {
      setPaymentsSaving(false);
    }
  };

  if (!canViewPlatformSettings(admin?.role)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        You do not have permission to view platform settings.
      </div>
    );
  }

  const canEdit = canManagePlatformSettings(admin?.role);

  return (
    <div className="max-w-6xl space-y-8 animate-fade-in-up pb-10 px-2 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-3xl font-bold text-slate-900">Platform Settings</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-1">Configure vehicle categories and registration checklists</p>
        </div>
      </div>

      {!canEdit && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          View only — only the super admin can edit platform settings.
        </div>
      )}

      {/* Tabs - Responsive Container */}
      <div className="overflow-x-auto pb-1 no-scrollbar">
        <div className="flex items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 bg-slate-100 rounded-2xl w-max">
          {[
            { id: 'vehicles', label: 'Vehicles', icon: Car },
            { id: 'conditions', label: 'Checklist', icon: CheckSquare },
            { id: 'banks', label: 'Banks', icon: Building2 },
            { id: 'training', label: 'Driver Training', icon: Video },
            { id: 'driver-docs', label: 'Driver Docs', icon: ShieldCheck },
            { id: 'payments', label: 'Payments', icon: CreditCard },
            { id: 'support', label: 'Website & Contact', icon: Headphones },
            { id: 'gst', label: 'GST Details', icon: Receipt },
            { id: 'legal', label: 'Legal Pages', icon: FileText },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-yellow-400 text-black shadow-md' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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
              readOnly={!canEdit}
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
              readOnly={!canEdit}
              onCreate={(payload) => api.post('/admin/settings/training-videos', payload)}
              onUpdate={(id, payload) => api.put(`/admin/settings/training-videos/${id}`, payload)}
              onDelete={async (id) => {
                if (!window.confirm('Delete this training video?')) return;
                await api.delete(`/admin/settings/training-videos/${id}`);
                await fetchData({ silent: true });
              }}
            />
          )}

          {activeTab === 'banks' && (
            <BanksTab
              banks={banks}
              onRefresh={() => fetchData({ silent: true })}
              readOnly={!canEdit}
            />
          )}

          {activeTab === 'driver-docs' && (
            <Card className="max-w-2xl space-y-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Driver onboarding documents</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Control whether Police Verification / Yellow Board Certificate is required during
                  driver registration.
                </p>
              </div>
              <form onSubmit={handleDriverDocsSave} className="space-y-4">
                <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 rounded-2xl">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Police Verification Certificate / Yellow Board Certificate
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {policeVerificationRequired
                        ? 'Mandatory — drivers must upload this to continue'
                        : 'Optional — drivers can skip this upload'}
                    </p>
                  </div>
                  <Toggle
                    checked={policeVerificationRequired}
                    onChange={setPoliceVerificationRequired}
                    disabled={!canEdit}
                  />
                </div>
                {canEdit && (
                  <Button
                    type="submit"
                    loading={driverDocsSaving}
                    disabled={!driverDocsDirty || driverDocsSaving}
                  >
                    Save document requirements
                  </Button>
                )}
              </form>
            </Card>
          )}

          {activeTab === 'payments' && (
            <Card className="max-w-2xl space-y-5">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Payment methods</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Master switches for each payment rail, plus per-flow overrides. A flow can
                  only narrow its master switch — turning Razorpay off here hides it
                  everywhere, whatever the flow toggles say.
                </p>
              </div>

              {!payments ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                </div>
              ) : (
                <form onSubmit={handlePaymentsSave} className="space-y-6">
                  {/* Master rails */}
                  <div className="space-y-3">
                    <p className="text-[11px] uppercase tracking-wide font-bold text-slate-400">
                      Master rails
                    </p>
                    <ToggleRow
                      title="Razorpay"
                      description={
                        payments.razorpayEnabled
                          ? 'Online payments are live — wallet top-up, subscriptions and kit purchase all work.'
                          : 'Razorpay is hidden across both apps. Wallet top-up is disabled entirely.'
                      }
                      checked={payments.razorpayEnabled}
                      onChange={setPaymentMaster('razorpayEnabled')}
                      disabled={!canEdit}
                    />
                    <ToggleRow
                      title="Cash on delivery"
                      description={
                        payments.codEnabled
                          ? 'Customers can pay the driver in cash. Commission is recovered from the driver wallet.'
                          : 'Cash is not offered anywhere.'
                      }
                      checked={payments.codEnabled}
                      onChange={setPaymentMaster('codEnabled')}
                      disabled={!canEdit}
                    />

                    {!payments.razorpayEnabled && !payments.codEnabled && (
                      <div className="flex gap-3 p-3 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-800">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <p>
                          Both rails are off. Customers with an empty wallet will not be able
                          to book at all.
                        </p>
                      </div>
                    )}

                    {!payments.razorpayEnabled && payments.codEnabled && (
                      <div className="flex gap-3 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <p>
                          Cash-only mode. Wallet top-up is off, so existing wallet balances can
                          be spent but not refilled. Drivers clear cash dues by paying an admin.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Per-flow */}
                  <div className="space-y-3">
                    <p className="text-[11px] uppercase tracking-wide font-bold text-slate-400">
                      Per-flow overrides
                    </p>
                    <ToggleRow
                      title="Wallet top-up (Razorpay)"
                      description="The only way to fund a wallet. Dies with the Razorpay master switch."
                      checked={payments.flows?.walletTopup?.razorpay}
                      onChange={setPaymentFlow('walletTopup', 'razorpay')}
                      disabled={!canEdit || !payments.razorpayEnabled}
                    />
                    <ToggleRow
                      title="Booking — pay from wallet"
                      description="Fare is debited from the customer's wallet when the booking is created."
                      checked={payments.flows?.booking?.wallet}
                      onChange={setPaymentFlow('booking', 'wallet')}
                      disabled={!canEdit}
                    />
                    <ToggleRow
                      title="Booking — cash"
                      description="Hourly rides only. The driver collects cash and owes the platform its commission."
                      checked={payments.flows?.booking?.cod}
                      onChange={setPaymentFlow('booking', 'cod')}
                      disabled={!canEdit || !payments.codEnabled}
                    />
                    <ToggleRow
                      title="Subscription checkout — cash"
                      description="Plan stays unpaid until an admin records the cash."
                      checked={payments.flows?.subscriptionCheckout?.cod}
                      onChange={setPaymentFlow('subscriptionCheckout', 'cod')}
                      disabled={!canEdit || !payments.codEnabled}
                    />
                    <ToggleRow
                      title="Driver kit — cash on delivery"
                      description="Driver pays the delivery agent; an admin marks it collected."
                      checked={payments.flows?.driverKit?.cod}
                      onChange={setPaymentFlow('driverKit', 'cod')}
                      disabled={!canEdit || !payments.codEnabled}
                    />
                  </div>

                  {/* COD policy */}
                  <div className="space-y-3">
                    <p className="text-[11px] uppercase tracking-wide font-bold text-slate-400">
                      Cash policy
                    </p>
                    <ToggleRow
                      title="Allow on instant rides"
                      checked={payments.cod?.allowInstant}
                      onChange={setCodBool('allowInstant')}
                      disabled={!canEdit || !payments.codEnabled}
                    />
                    <ToggleRow
                      title="Allow on scheduled rides"
                      checked={payments.cod?.allowScheduled}
                      onChange={setCodBool('allowScheduled')}
                      disabled={!canEdit || !payments.codEnabled}
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        label="Max cash booking value (₹)"
                        helper="0 means no cap"
                        type="number"
                        min="0"
                        value={payments.cod?.maxBookingValueRupees ?? 0}
                        onChange={setCodNumber('maxBookingValueRupees')}
                        disabled={!canEdit || !payments.codEnabled}
                      />
                      <Input
                        label="Customer dues limit (₹)"
                        helper="Above this the customer cannot book on any rail"
                        type="number"
                        min="0"
                        value={payments.cod?.userMaxPendingDuesRupees ?? 0}
                        onChange={setCodNumber('userMaxPendingDuesRupees')}
                        disabled={!canEdit || !payments.codEnabled}
                      />
                      <Input
                        label="Driver dues warning (₹)"
                        helper="Driver is warned but can keep working"
                        type="number"
                        min="0"
                        value={payments.cod?.driverDuesWarnRupees ?? 0}
                        onChange={setCodNumber('driverDuesWarnRupees')}
                        disabled={!canEdit || !payments.codEnabled}
                      />
                      <Input
                        label="Driver dues block (₹)"
                        helper="Cannot go online or withdraw above this"
                        type="number"
                        min="0"
                        value={payments.cod?.driverDuesBlockRupees ?? 0}
                        onChange={setCodNumber('driverDuesBlockRupees')}
                        disabled={!canEdit || !payments.codEnabled}
                      />
                    </div>
                    {Number(payments.cod?.driverDuesWarnRupees) >
                      Number(payments.cod?.driverDuesBlockRupees) && (
                      <p className="text-xs font-semibold text-red-600">
                        The warning threshold must not be higher than the block threshold.
                      </p>
                    )}
                  </div>

                  {canEdit && (
                    <Button
                      type="submit"
                      loading={paymentsSaving}
                      disabled={!paymentsDirty || paymentsSaving}
                    >
                      Save payment methods
                    </Button>
                  )}
                </form>
              )}
            </Card>
          )}

          {activeTab === 'support' && (
            <Card className="max-w-2xl space-y-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Website & Contact</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Contact details shown on the landing page / Contact Us, plus app download and social links.
                </p>
              </div>
              <form onSubmit={handleSupportSave} className="space-y-4">
                <Input
                  label="Support Phone"
                  value={supportForm.supportPhone}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, supportPhone: e.target.value }))}
                  placeholder="+919876543210"
                  required
                  disabled={!canEdit}
                />
                <Input
                  label="Support WhatsApp"
                  value={supportForm.supportWhatsapp}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, supportWhatsapp: e.target.value }))}
                  placeholder="+919876543210"
                  required
                  disabled={!canEdit}
                />
                <Input
                  label="Support Email"
                  type="email"
                  value={supportForm.supportEmail}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, supportEmail: e.target.value }))}
                  placeholder="support@sparedriver.com"
                  required
                  disabled={!canEdit}
                />
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Office Address</label>
                  <textarea
                    value={supportForm.contactAddress || ''}
                    onChange={(e) => setSupportForm((prev) => ({ ...prev, contactAddress: e.target.value }))}
                    rows={3}
                    disabled={!canEdit}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-400/60 disabled:bg-slate-50 disabled:text-slate-500"
                    placeholder="Full office address"
                  />
                </div>
                <Input
                  label="Support Hours"
                  value={supportForm.supportHours || ''}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, supportHours: e.target.value }))}
                  placeholder="Mon–Sat, 9:00 AM to 6:00 PM"
                  disabled={!canEdit}
                />
                <Input
                  label="Android App Download URL"
                  value={supportForm.androidAppUrl || ''}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, androidAppUrl: e.target.value }))}
                  placeholder="https://play.google.com/store/apps/details?id=..."
                  disabled={!canEdit}
                />
                <Input
                  label="iOS App Download URL"
                  value={supportForm.iosAppUrl || ''}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, iosAppUrl: e.target.value }))}
                  placeholder="https://apps.apple.com/app/..."
                  disabled={!canEdit}
                />
                <Input
                  label="Instagram URL"
                  value={supportForm.instagramUrl || ''}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, instagramUrl: e.target.value }))}
                  placeholder="https://www.instagram.com/sparedriver"
                  disabled={!canEdit}
                />
                <Input
                  label="Facebook URL"
                  value={supportForm.facebookUrl || ''}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, facebookUrl: e.target.value }))}
                  placeholder="https://www.facebook.com/sparedriver"
                  disabled={!canEdit}
                />
                <Input
                  label="X (Twitter) URL"
                  value={supportForm.twitterUrl || ''}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, twitterUrl: e.target.value }))}
                  placeholder="https://x.com/sparedriver"
                  disabled={!canEdit}
                />
                <Input
                  label="LinkedIn URL"
                  value={supportForm.linkedinUrl || ''}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, linkedinUrl: e.target.value }))}
                  placeholder="https://www.linkedin.com/company/sparedriver"
                  disabled={!canEdit}
                />
                <Input
                  label="YouTube URL"
                  value={supportForm.youtubeUrl || ''}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, youtubeUrl: e.target.value }))}
                  placeholder="https://www.youtube.com/@sparedriver"
                  disabled={!canEdit}
                />
                {canEdit && (
                  <Button
                    type="submit"
                    loading={supportSaving}
                    disabled={!supportDirty || loading || supportSaving}
                  >
                    Save Website & Contact Settings
                  </Button>
                )}
              </form>
            </Card>
          )}

          {activeTab === 'gst' && (
            <Card className="max-w-2xl space-y-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">GST Details</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Business tax identity printed on customer trip invoices. Leave GSTIN blank to hide this
                  block from PDFs.
                </p>
              </div>
              <form onSubmit={handleGstSave} className="space-y-4">
                <Input
                  label="GSTIN"
                  value={gstForm.gstin}
                  onChange={(e) =>
                    setGstForm((prev) => ({
                      ...prev,
                      gstin: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="22AAAAA0000A1Z5"
                  maxLength={15}
                  disabled={!canEdit}
                />
                <Input
                  label="Legal / Registered Name"
                  value={gstForm.legalName}
                  onChange={(e) =>
                    setGstForm((prev) => ({ ...prev, legalName: e.target.value }))
                  }
                  placeholder="SpareDriver Private Limited"
                  disabled={!canEdit}
                />
                <Input
                  label="Trade Name (optional)"
                  value={gstForm.tradeName}
                  onChange={(e) =>
                    setGstForm((prev) => ({ ...prev, tradeName: e.target.value }))
                  }
                  placeholder="SpareDriver"
                  disabled={!canEdit}
                />
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">
                    Registered Address
                  </label>
                  <textarea
                    value={gstForm.address || ''}
                    onChange={(e) =>
                      setGstForm((prev) => ({ ...prev, address: e.target.value }))
                    }
                    rows={3}
                    disabled={!canEdit}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-400/60 disabled:bg-slate-50 disabled:text-slate-500"
                    placeholder="Full registered business address"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="State"
                    value={gstForm.state}
                    onChange={(e) =>
                      setGstForm((prev) => ({ ...prev, state: e.target.value }))
                    }
                    placeholder="Delhi"
                    disabled={!canEdit}
                  />
                  <Input
                    label="State Code"
                    value={gstForm.stateCode}
                    onChange={(e) =>
                      setGstForm((prev) => ({ ...prev, stateCode: e.target.value }))
                    }
                    placeholder="07"
                    maxLength={2}
                    disabled={!canEdit}
                  />
                </div>
                <Input
                  label="PAN (optional)"
                  value={gstForm.pan}
                  onChange={(e) =>
                    setGstForm((prev) => ({
                      ...prev,
                      pan: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="AAAAA0000A"
                  maxLength={10}
                  disabled={!canEdit}
                />
                {canEdit && (
                  <Button
                    type="submit"
                    loading={gstSaving}
                    disabled={!gstDirty || loading || gstSaving}
                  >
                    Save GST Details
                  </Button>
                )}
              </form>
            </Card>
          )}

          {activeTab === 'legal' && <LegalPagesTab readOnly={!canEdit} />}

          {activeTab === 'conditions' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-base sm:text-xl font-bold text-slate-800">Registration Checklist</h3>
                {canEdit && (
                  <Button 
                    onClick={() => {
                      setEditingItem(null);
                      setConditionForm({ question: '', key: '', isRequired: false, isActive: true });
                      setShowConditionModal(true);
                    }}
                    className="flex items-center gap-1.5 text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2"
                  >
                    <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Add Question</span><span className="sm:hidden">Add</span>
                  </Button>
                )}
              </div>

              <div className="space-y-2 sm:space-y-3">
                {conditions.map((cond, idx) => (
                  <div 
                    key={cond._id} 
                    className="flex items-center justify-between p-3 sm:p-5 bg-white rounded-xl sm:rounded-2xl border border-slate-200 hover:border-primary/30 hover:shadow-sm transition-all duration-300"
                  >
                    <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
                      <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-400 border border-slate-200 shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 text-sm truncate">{cond.question}</p>
                        <div className="flex items-center gap-2 sm:gap-3 mt-0.5 sm:mt-1 flex-wrap">
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider truncate">Key: {cond.key}</span>
                          {cond.isRequired && <span className="px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[10px] font-bold">REQ</span>}
                          {!cond.isActive && <span className="px-1.5 py-0.5 rounded-full bg-slate-50 text-slate-400 text-[10px] font-bold">OFF</span>}
                        </div>
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1 shrink-0">
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
                          className="p-2 sm:p-2.5 hover:bg-slate-100 rounded-lg sm:rounded-xl text-slate-400 hover:text-slate-600 transition-all"
                        >
                          <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                        <button 
                          onClick={() => deleteCondition(cond._id)}
                          className="p-2 sm:p-2.5 hover:bg-rose-50 rounded-lg sm:rounded-xl text-slate-400 hover:text-rose-600 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    )}
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
