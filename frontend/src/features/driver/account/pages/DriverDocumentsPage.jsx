import { useNavigate } from 'react-router-dom';
import { IdCard, Briefcase, Calendar } from 'lucide-react';
import Card from '../../../../components/Card';
import DocumentGallery from '../../../admin/components/DocumentGallery';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import { formatDate } from '../../../../utils/formatters';
import DriverAccountSubPage from '../components/DriverAccountSubPage';

const capitalise = (str) => (str ? str.charAt(0).toUpperCase() + str.slice(1) : '');

const availabilityLabel = (value) => {
  switch (value) {
    case 'full-time':
      return 'Full time';
    case 'part-time':
      return 'Part time';
    case 'weekends-only':
      return 'Weekends only';
    default:
      return capitalise(value);
  }
};

const DriverDocumentsPage = () => {
  const navigate = useNavigate();
  const profileKey = buildCacheKey('driver-profile', {});
  const { data: driver } = useCachedQuery(useDriverProfileStore, profileKey, {});

  const license = driver?.drivingLicense || {};
  const credentialRows = [
    license.number && {
      icon: IdCard,
      label: 'Driving license',
      value: license.number,
      sub: license.expiryDate ? `Expires ${formatDate(license.expiryDate)}` : null,
    },
    typeof driver?.experienceYears === 'number' && {
      icon: Briefcase,
      label: 'Experience',
      value: `${driver.experienceYears} year${driver.experienceYears === 1 ? '' : 's'}`,
    },
    driver?.availability && {
      icon: Calendar,
      label: 'Availability',
      value: availabilityLabel(driver.availability),
    },
  ].filter(Boolean);

  return (
    <DriverAccountSubPage
      title="Profile & Documents"
      onBack={() => navigate('/driver/account')}
    >
      {credentialRows.length > 0 && (
        <div>
          <p className="px-1 mb-2 text-[11px] uppercase tracking-wide font-semibold text-text-muted">
            Driving credentials
          </p>
          <Card padding="p-0">
            <ul className="divide-y divide-border-light">
              {credentialRows.map((row) => (
                <li key={row.label} className="flex items-start gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-bg flex items-center justify-center shrink-0 mt-0.5">
                    <row.icon className="w-4 h-4 text-text-secondary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-text-muted">{row.label}</p>
                    <p className="text-sm font-semibold text-text break-words">{row.value}</p>
                    {row.sub && (
                      <p className="text-[11px] text-text-muted mt-0.5">{row.sub}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <div>
        <p className="px-1 mb-2 text-[11px] uppercase tracking-wide font-semibold text-text-muted">
          Uploaded documents
        </p>
        <Card padding="p-4">
          <DocumentGallery
            documents={driver?.documents || []}
            emptyMessage="No documents uploaded yet"
          />
        </Card>
      </div>
    </DriverAccountSubPage>
  );
};

export default DriverDocumentsPage;
