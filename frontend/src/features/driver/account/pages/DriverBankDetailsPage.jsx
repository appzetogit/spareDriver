import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import Card from '../../../../components/Card';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import DriverAccountSubPage from '../components/DriverAccountSubPage';

const maskAccount = (num) => {
  const s = String(num);
  if (s.length <= 4) return s;
  return `•••• ${s.slice(-4)}`;
};

const DriverBankDetailsPage = () => {
  const navigate = useNavigate();
  const profileKey = buildCacheKey('driver-profile', {});
  const { data: driver } = useCachedQuery(useDriverProfileStore, profileKey, {});

  const bank = driver?.bankDetails || {};
  const hasBank = Boolean(bank.accountNumber);

  const rows = hasBank
    ? [
        { label: 'Account holder', value: bank.accountHolderName || '—' },
        { label: 'Account number', value: maskAccount(bank.accountNumber) },
        { label: 'IFSC', value: bank.ifscCode || '—' },
        { label: 'Bank name', value: bank.bankName || '—' },
        bank.upiId && { label: 'UPI ID', value: bank.upiId },
      ].filter(Boolean)
    : [];

  return (
    <DriverAccountSubPage
      title="Bank Details"
      onBack={() => navigate('/driver/account')}
    >
      <p className="text-xs text-text-muted px-1">
        Payout account on file. Contact support to update bank details.
      </p>
      {hasBank ? (
        <Card padding="p-0">
          <ul className="divide-y divide-border-light">
            {rows.map((row) => (
              <li key={row.label} className="flex items-start gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-bg flex items-center justify-center shrink-0 mt-0.5">
                  <Building2 className="w-4 h-4 text-text-secondary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-text-muted">{row.label}</p>
                  <p className="text-sm font-semibold text-text break-words">{row.value}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card padding="p-6" className="text-center text-sm text-text-muted">
          No bank details on file yet.
        </Card>
      )}
    </DriverAccountSubPage>
  );
};

export default DriverBankDetailsPage;
