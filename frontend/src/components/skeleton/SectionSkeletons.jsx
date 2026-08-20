import { useLocation } from 'react-router-dom';
import { Skeleton } from './Skeleton';

/** Compact wallet pill in the home header. */
export function WalletPillSkeleton() {
  return <Skeleton className="h-9 w-20 rounded-xl" />;
}

/** Nearby-drivers map card on user home. */
export function NearbyDriversMapSkeleton({ height } = {}) {
  return (
    <div
      className={`rounded-2xl overflow-hidden bg-gray-100 ${
        height == null ? 'h-48 sm:h-56 md:h-64' : ''
      }`}
      style={height != null ? { height } : undefined}
    >
      <Skeleton className="w-full h-full rounded-none" />
    </div>
  );
}

/** Single nearby-driver row (list / bottom sheet). */
export function DriverRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3">
      <Skeleton className="w-11 h-11 rounded-full shrink-0" />
      <div className="flex-1 space-y-2 min-w-0">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-3 w-10 shrink-0" />
    </div>
  );
}

export function NearbyDriversListSkeleton({ rows = 4 } = {}) {
  return (
    <div className="divide-y divide-border-light">
      {Array.from({ length: rows }, (_, i) => (
        <DriverRowSkeleton key={i} />
      ))}
    </div>
  );
}

/** Service tiles on home ("Book a driver"). */
export function ServiceCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4">
      <Skeleton className="h-36 md:h-40 rounded-2xl" />
      <Skeleton className="h-36 md:h-40 rounded-2xl" />
    </div>
  );
}

/** Promo / ads strip. */
export function AdsCarouselSkeleton() {
  return <Skeleton className="w-full aspect-video md:aspect-[21/9] rounded-2xl" />;
}

/** Trip history card on Activity. */
export function TripCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-4 md:p-5 shadow-card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-28 md:w-36" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <div className="flex items-center gap-3 pt-1">
        <Skeleton className="w-9 h-9 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
    </div>
  );
}

export function TripListSkeleton({ rows = 4 } = {}) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <TripCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Wallet balance + recent activity blocks. */
export function WalletBalanceSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-card space-y-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-10 w-full rounded-xl" />
    </div>
  );
}

export function WalletTxSkeleton({ rows = 5 } = {}) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-card divide-y divide-border-light">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="w-9 h-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-3.5 w-14 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Driver home earnings chip / summary cards. */
export function DriverSummarySkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-20 w-full rounded-2xl" />
    </div>
  );
}

/** Phone-column shell — matches MobileLayout (max-w-lg) on all sizes. */
function MobileRouteShellSkeleton() {
  return (
    <div className="w-full max-w-lg min-h-dvh bg-bg flex flex-col mx-auto">
      <div className="px-4 sm:px-6 pt-3.5 pb-3.5 rounded-b-3xl bg-surface/95 shadow-lg">
        <Skeleton className="h-3 w-20 mb-2" />
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-5 w-36 sm:w-44" />
          <Skeleton className="h-9 w-20 rounded-xl" />
        </div>
      </div>
      <div className="flex-1 p-4 sm:p-6 space-y-5">
        <NearbyDriversMapSkeleton />
        <div className="space-y-3">
          <Skeleton className="h-4 w-28" />
          <ServiceCardsSkeleton />
        </div>
        <AdsCarouselSkeleton />
      </div>
      <div className="h-16 border-t border-border-light bg-white shrink-0" />
    </div>
  );
}

/** Full-bleed marketing / landing Suspense shell. */
function LandingRouteShellSkeleton() {
  return (
    <div className="w-full min-h-dvh bg-[#FAFAF7] flex flex-col">
      <div className="h-20 md:h-24 border-b border-black/8 bg-white/90 px-6 flex items-center justify-between max-w-7xl mx-auto w-full">
        <Skeleton className="h-10 w-28 md:h-12 md:w-36 rounded-xl" />
        <div className="hidden md:flex items-center gap-6">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
        <Skeleton className="md:hidden h-6 w-6 rounded" />
      </div>
      <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-12 md:py-20 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 items-center">
        <div className="space-y-5 md:space-y-6">
          <Skeleton className="h-6 w-40 rounded-full" />
          <Skeleton className="h-10 md:h-14 w-full max-w-md" />
          <Skeleton className="h-10 md:h-14 w-3/4 max-w-sm" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-4 w-2/3 max-w-lg" />
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Skeleton className="h-12 w-full sm:w-40 rounded-full" />
            <Skeleton className="h-12 w-full sm:w-36 rounded-full" />
          </div>
        </div>
        <div className="flex justify-center">
          <Skeleton className="w-full max-w-sm md:max-w-md aspect-square rounded-3xl" />
        </div>
      </div>
    </div>
  );
}

/** Admin panel Suspense shell — sidebar from lg, stacked header on tablet. */
export function AdminShellSkeleton() {
  return (
    <div className="w-full flex h-dvh bg-bg overflow-hidden">
      <aside className="hidden lg:flex w-[260px] shrink-0 bg-dark flex-col">
        <div className="h-16 px-5 border-b border-white/10 flex items-center gap-2.5">
          <Skeleton className="h-8 w-8 rounded-md bg-white/20" />
          <Skeleton className="h-3 w-16 rounded bg-white/15" />
        </div>
        <div className="flex-1 py-4 px-3 space-y-2">
          <Skeleton className="h-2.5 w-16 mx-3 mb-3 rounded bg-white/10" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-xl bg-white/10" />
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="h-14 sm:h-16 px-4 lg:px-6 border-b border-slate-200 bg-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Skeleton className="lg:hidden h-8 w-8 rounded-lg shrink-0" />
            <Skeleton className="h-5 w-28 sm:w-40 md:w-52" />
          </div>
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-7 w-40 sm:w-56" />
              <Skeleton className="h-3 w-48 sm:w-72" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-10 w-24 rounded-xl" />
              <Skeleton className="h-10 w-32 rounded-xl hidden sm:block" />
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="flex gap-3 sm:gap-4 p-3 sm:p-4 border-b border-slate-100">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 flex-1 hidden sm:block" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 flex-1 hidden md:block" />
              <Skeleton className="h-4 flex-1 hidden lg:block" />
            </div>
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="flex gap-3 sm:gap-4 p-3 sm:p-4 border-b border-slate-50 items-center"
              >
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 flex-1 hidden sm:block" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 flex-1 hidden md:block" />
                <Skeleton className="h-4 flex-1 hidden lg:block" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Route-level Suspense fallback — layout chrome + section placeholders,
 * sized for the current route and viewport (phone / tablet / admin / landing).
 */
export function RouteShellSkeleton() {
  const { pathname } = useLocation();

  if (pathname.startsWith('/admin')) {
    return <AdminShellSkeleton />;
  }

  const isLanding =
    pathname === '/' ||
    pathname === '/contact-us' ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/terms') ||
    pathname.startsWith('/refund') ||
    pathname.startsWith('/pricing');

  if (isLanding) {
    return <LandingRouteShellSkeleton />;
  }

  return <MobileRouteShellSkeleton />;
}

/** Auth / guard bootstrap — keep chrome, avoid centered spinner only. */
export function BootstrapShellSkeleton() {
  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh w-full max-w-lg mx-auto">
      <div className="px-4 sm:px-6 pt-6 pb-4">
        <Skeleton className="h-4 w-24 mb-3" />
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-40 w-full rounded-2xl mb-4" />
        <Skeleton className="h-12 w-full rounded-xl mb-3" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}

/** Admin auth/session bootstrap — full-width shell for tablet/desktop. */
export function AdminBootstrapSkeleton() {
  return <AdminShellSkeleton />;
}
