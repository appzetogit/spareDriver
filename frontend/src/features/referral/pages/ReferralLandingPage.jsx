import { useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  isAndroidDevice,
  isIosDevice,
  isNativeWebView,
  isValidReferralCode,
  recordReferralClick,
  savePendingReferral,
} from '../../../utils/referralLink';

const env = import.meta.env;

function storeTargets(role) {
  const driver = role === 'driver';
  const pkg = (driver && env.VITE_PLAY_PACKAGE_DRIVER) || env.VITE_PLAY_PACKAGE || '';
  const ios = (driver && env.VITE_APP_STORE_URL_DRIVER) || env.VITE_APP_STORE_URL || '';
  return { pkg, ios };
}

function playStoreUrl(pkg, code, role) {
  const referrer = `utm_source=referral&utm_medium=invite&ref=${code}&role=${role}`;
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}&referrer=${encodeURIComponent(referrer)}`;
}

/**
 * /r/:code
 *  - inside the app          -> signup with the code pre-filled
 *  - Android browser         -> Play Store (code travels in the install referrer)
 *  - iOS Safari              -> record a fingerprint, then App Store (code recovered on first launch)
 *  - desktop / no store URL  -> web signup with the code pre-filled
 * When the app is installed, Android App Links / iOS Universal Links open it
 * before this page is ever shown (see public/.well-known).
 */
export default function ReferralLandingPage() {
  const { code: rawCode } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const role = params.get('role') === 'driver' ? 'driver' : 'user';
  const code = String(rawCode || '').toUpperCase();
  const valid = isValidReferralCode(code);
  const storeHref = useMemo(() => {
    if (!valid || isNativeWebView()) return '';
    const { pkg, ios } = storeTargets(role);
    if (isAndroidDevice() && pkg) return playStoreUrl(pkg, code, role);
    if (isIosDevice() && ios) return ios;
    return '';
  }, [valid, code, role]);

  const webSignup = useMemo(
    () => `${role === 'driver' ? '/driver/register/identity' : '/register'}?ref=${encodeURIComponent(code)}`,
    [role, code],
  );

  useEffect(() => {
    if (!valid) {
      navigate('/', { replace: true });
      return undefined;
    }
    savePendingReferral(code, role);

    if (isNativeWebView()) {
      navigate(webSignup, { replace: true });
      return undefined;
    }

    let timer;
    let cancelled = false;
    if (storeHref && isAndroidDevice()) {
      timer = setTimeout(() => window.location.replace(storeHref), 300);
    } else if (storeHref && isIosDevice()) {
      recordReferralClick(code, role).finally(() => {
        if (!cancelled) timer = setTimeout(() => window.location.replace(storeHref), 200);
      });
    } else {
      navigate(webSignup, { replace: true });
    }
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [valid, code, role, navigate, webSignup, storeHref]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Code copied');
    } catch {
      toast.error('Could not copy code');
    }
  };

  if (!valid) return null;

  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm space-y-4">
        <h1 className="text-lg font-bold">You&apos;re invited to Sparedriver</h1>
        <p className="text-xs text-text-muted">Your referral code</p>
        <p className="text-2xl font-bold tracking-widest">{code}</p>
        <p className="text-sm text-text-secondary">Taking you to the app store…</p>
        {storeHref && (
          <a
            href={storeHref}
            onClick={copyCode}
            className="block rounded-xl bg-text py-3 text-sm font-semibold text-white"
          >
            Copy code &amp; get the app
          </a>
        )}
        <a href={webSignup} className="block text-sm text-text-secondary underline">
          Continue on web instead
        </a>
      </div>
    </div>
  );
}
