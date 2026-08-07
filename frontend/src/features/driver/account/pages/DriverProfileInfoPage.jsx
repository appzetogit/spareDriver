import { useNavigate } from 'react-router-dom';
import { Phone, Mail, User, Calendar } from 'lucide-react';
import Card from '../../../../components/Card';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import { formatPhone, formatDate } from '../../../../utils/formatters';
import DriverAccountSubPage from '../components/DriverAccountSubPage';

const capitalise = (str) => (str ? str.charAt(0).toUpperCase() + str.slice(1) : '');

const DriverProfileInfoPage = () => {
  const navigate = useNavigate();
  const profileKey = buildCacheKey('driver-profile', {});
  const { data: driver } = useCachedQuery(useDriverProfileStore, profileKey, {});

  const rows = [
    { icon: Phone, label: 'Phone', value: formatPhone(driver?.phone || '') || '—' },
    { icon: Mail, label: 'Email', value: driver?.email || 'Not added' },
    driver?.gender && { icon: User, label: 'Gender', value: capitalise(driver.gender) },
    driver?.dateOfBirth && {
      icon: Calendar,
      label: 'Date of birth',
      value: formatDate(driver.dateOfBirth),
    },
  ].filter(Boolean);

  return (
    <DriverAccountSubPage
      title="Profile Info"
      onBack={() => navigate('/driver/account')}
    >
      <p className="text-xs text-text-muted px-1">
        Personal details from your registration. Contact support to update these.
      </p>
      <Card padding="p-0">
        <ul className="divide-y divide-border-light">
          {rows.map((row) => (
            <li key={row.label} className="flex items-start gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-lg bg-bg flex items-center justify-center shrink-0 mt-0.5">
                <row.icon className="w-4 h-4 text-text-secondary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-text-muted">{row.label}</p>
                <p className="text-sm font-semibold text-text break-words">{row.value}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </DriverAccountSubPage>
  );
};

export default DriverProfileInfoPage;
