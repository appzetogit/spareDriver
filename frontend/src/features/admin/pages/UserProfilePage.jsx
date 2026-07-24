import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Car, Loader2, Mail, Phone, RefreshCw, History, BarChart3 } from 'lucide-react';
import Avatar from '../../../components/Avatar';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminUserProfileStore } from '../../../store/admin/useAdminUserProfileStore';
import { SectionCard, InfoGrid } from '../components/DetailBlocks';
import {
  getCarBrandName,
  getCarModelName,
  getCarFuelName,
  getCarCategoryName,
} from '../../../utils/vehicleCatalog';

const formatDate = (date) => {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const UserProfilePage = () => {
  const { userId } = useParams();

  const queryParams = useMemo(() => ({ userId }), [userId]);
  const cacheKey = buildCacheKey('user-profile', queryParams);

  const { data: profile, loading, error, refetch } = useCachedQuery(
    useAdminUserProfileStore,
    cacheKey,
    queryParams,
    { enabled: Boolean(userId) },
  );

  if (loading && !profile) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-sm text-slate-500">Loading profile...</p>
      </div>
    );
  }

  if (error || !profile?.user) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error || 'User not found'}</div>
      </div>
    );
  }

  const { user, cars, hasChecklist, carsCount } = profile;

  return (
    <div className="space-y-6 animate-fade-in-up pb-8">
      <div className="flex items-center justify-between gap-4">
        <BackLink />
        <div className="flex items-center gap-2">
          <Link
            to={`/admin/users/${userId}/analytics`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark"
          >
            <BarChart3 className="w-4 h-4" />
            Analytics
          </Link>
          <Link
            to={`/admin/users/${userId}/history`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
          >
            <History className="w-4 h-4" />
            Trip & Subscription History
          </Link>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <Avatar name={user.name} size="lg" src={user.profilePicture} className="ring-2 ring-white shadow-md" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-slate-900">{user.name}</h1>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {user.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5"><Phone className="w-4 h-4" />{user.phone_no}</span>
              <span className="inline-flex items-center gap-1.5"><Mail className="w-4 h-4" />{user.email}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Account details">
          <InfoGrid
            items={[
              { label: 'User ID', value: user._id },
              { label: 'Joined', value: formatDate(user.createdAt) },
              { label: 'Phone verified', value: user.isPhoneVerified ? 'Yes' : 'No' },
              { label: 'Email verified', value: user.isEmailVerified ? 'Yes' : 'No' },
              { label: 'Vehicles', value: String(carsCount) },
              {
                label: 'Safety checklist',
                value: hasChecklist ? 'Complete for all vehicles' : 'Incomplete',
              },
            ]}
          />
        </SectionCard>
      </div>

      <SectionCard title={`Registered vehicles (${cars?.length || 0})`}>
        {!cars?.length ? (
          <p className="text-sm text-slate-500">No vehicles registered.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {cars.map((car) => (
              <div key={car._id} className="p-4 rounded-xl border border-slate-100 bg-slate-50 space-y-4">
                <div className="flex gap-4">
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-white border border-slate-200 shrink-0">
                    {car.image ? (
                      <img src={car.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Car className="w-8 h-8 text-slate-300" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-bold text-slate-900">
                        {getCarBrandName(car)} {getCarModelName(car)}
                      </p>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                          car.isActive === false
                            ? 'text-slate-600 bg-slate-200'
                            : car.hasChecklist
                              ? 'text-emerald-700 bg-emerald-50'
                              : 'text-amber-700 bg-amber-50'
                        }`}
                      >
                        {car.isActive === false
                          ? 'Removed from garage'
                          : car.hasChecklist
                            ? 'Checklist complete'
                            : 'Checklist incomplete'}
                      </span>
                    </div>
                    <p className="text-xs font-mono font-semibold text-slate-700 mt-1 uppercase">{car.vehicleNumber}</p>
                    <InfoGrid
                      columns={1}
                      items={[
                        { label: 'Category', value: getCarCategoryName(car) },
                        {
                          label: 'Fuel / Transmission',
                          value: `${getCarFuelName(car)} · ${car.transmission}`,
                          capitalize: true,
                        },
                        { label: 'Insurance expiry', value: formatDate(car.insuranceExpiry) },
                        { label: 'PUC expiry', value: formatDate(car.pucExpiry) },
                      ]}
                    />
                  </div>
                </div>

                {!car.checklist?.length ? (
                  <p className="text-sm text-slate-500">No checklist items configured.</p>
                ) : (
                  <ul className="space-y-2 border-t border-slate-200 pt-3">
                    {car.checklist.map((item) => {
                      const answerLabel =
                        item.value === true ? 'Yes' : item.value === false ? 'No' : 'Unanswered';
                      const answerClass =
                        item.value === true
                          ? 'text-emerald-700 bg-emerald-50'
                          : item.value === false
                            ? 'text-slate-700 bg-slate-100'
                            : 'text-amber-700 bg-amber-50';
                      return (
                        <li key={item._id} className="flex items-start justify-between gap-3 text-sm">
                          <div>
                            <p className="font-medium text-slate-800">{item.question}</p>
                            {item.isRequired && (
                              <span className="text-[10px] font-bold uppercase text-rose-600">Required</span>
                            )}
                          </div>
                          <span
                            className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full shrink-0 ${answerClass}`}
                          >
                            {answerLabel}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
};

function BackLink() {
  return (
    <Link
      to="/admin/users"
      className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
    >
      <ArrowLeft className="w-4 h-4" />
      Back to users
    </Link>
  );
}

export default UserProfilePage;
