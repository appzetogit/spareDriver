import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Share2, Gift, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../../../../components/Button';
import Card from '../../../../components/Card';
import Loader from '../../../../components/Loader';
import DriverScreenShell from '../../components/DriverScreenShell';
import api from '../../../../utils/api';
import { formatCurrency } from '../../../../utils/formatters';
import { shareText } from '../../../../utils/nativeShare';

const STATUS_LABEL = {
  pending: 'Pending',
  qualified: 'Qualified',
  rewarded: 'Rewarded',
  rejected: 'Rejected',
  expired: 'Expired',
};

function statusClass(status) {
  switch (status) {
    case 'rewarded':
      return 'bg-emerald-50 text-emerald-700';
    case 'qualified':
      return 'bg-blue-50 text-blue-700';
    case 'rejected':
      return 'bg-rose-50 text-rose-700';
    default:
      return 'bg-amber-50 text-amber-700';
  }
}

const DriverReferEarnPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchSummary = useCallback(async () => {
    const res = await api.get('/driver/referrals/summary');
    setSummary(res.data?.data || res.data);
  }, []);

  const fetchReferrals = useCallback(async (pageNum = 1) => {
    const res = await api.get(`/driver/referrals?page=${pageNum}&limit=${limit}`);
    const payload = res.data?.data || res.data;
    setReferrals(payload?.referrals || []);
    setTotal(payload?.total || 0);
    setPage(pageNum);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await Promise.all([fetchSummary(), fetchReferrals(1)]);
      } catch (err) {
        toast.error(err.response?.data?.message || 'Could not load referral data');
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchSummary, fetchReferrals]);

  const code = summary?.referralCode || '—';
  const stats = summary?.stats || {};
  const requiredTrips = summary?.settings?.requiredCompletedTrips || 5;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Referral code copied');
    } catch {
      toast.error('Could not copy code');
    }
  };

  const handleShare = async () => {
    const result = await shareText({
      title: 'Sparedriver',
      text: `Join Sparedriver as a driver using my referral code ${code}.`,
    });
    if (result.via === 'clipboard') toast.success('Share message copied');
    else if (!result.ok && result.reason === 'failed') toast.error('Could not share');
  };

  if (loading) {
    return (
      <DriverScreenShell title="Refer & Earn" onBack={() => navigate(-1)}>
        <div className="flex items-center justify-center py-16">
          <Loader />
        </div>
      </DriverScreenShell>
    );
  }

  return (
    <DriverScreenShell title="Refer & Earn" onBack={() => navigate(-1)}>
      <div className="space-y-4 pb-8">
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Gift className="w-5 h-5 text-text" />
            </div>
            <div>
              <p className="text-xs text-text-muted">Your Referral Code</p>
              <p className="text-2xl font-bold tracking-widest">{code}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" fullWidth onClick={handleCopy} className="gap-2">
              <Copy className="w-4 h-4" />
              Copy Code
            </Button>
            <Button variant="dark" fullWidth onClick={handleShare} className="gap-2">
              <Share2 className="w-4 h-4" />
              Share Code
            </Button>
          </div>
          <p className="text-xs text-text-secondary">
            Refer drivers and earn rewards. {requiredTrips} completed trips required after approval.
          </p>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3">
            <p className="text-xs text-text-muted">Successful Referrals</p>
            <p className="text-lg font-bold">{stats.successfulReferrals || 0}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-text-muted">Total Earned</p>
            <p className="text-lg font-bold">{formatCurrency(stats.totalEarned || 0)}</p>
          </Card>
          <Card className="p-3 col-span-2">
            <p className="text-xs text-text-muted">Pending</p>
            <p className="text-lg font-bold">{formatCurrency(stats.pending || 0)}</p>
          </Card>
        </div>

        <Card className="divide-y divide-border-light">
          <div className="px-4 py-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-text-muted" />
            <h2 className="text-sm font-semibold">Referral History</h2>
          </div>
          {referrals.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-muted text-center">No referrals yet</p>
          ) : (
            referrals.map((row) => (
              <div key={row.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{row.referredName}</p>
                  <p className="text-xs text-text-muted">
                    {row.rewardedAt
                      ? `Rewarded ${new Date(row.rewardedAt).toLocaleDateString('en-IN')}`
                      : `Joined ${new Date(row.createdAt).toLocaleDateString('en-IN')}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusClass(row.status)}`}>
                    {STATUS_LABEL[row.status] || row.status}
                  </span>
                  <p className="text-xs font-semibold mt-1">{formatCurrency(row.rewardRupees || 0)}</p>
                </div>
              </div>
            ))
          )}
          {total > referrals.length && (
            <div className="p-3">
              <Button
                variant="outline"
                fullWidth
                onClick={() => fetchReferrals(page + 1).catch(() => toast.error('Could not load more'))}
              >
                Load more
              </Button>
            </div>
          )}
        </Card>
      </div>
    </DriverScreenShell>
  );
};

export default DriverReferEarnPage;
