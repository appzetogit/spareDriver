import { Skeleton } from './Skeleton';

/** Compact wallet pill in the home header. */
export function WalletPillSkeleton() {
  return <Skeleton className="h-9 w-20 rounded-xl" />;
}

/** Nearby-drivers map card on user home. */
export function NearbyDriversMapSkeleton({ height = 192 } = {}) {
  return (
    <div className="rounded-2xl overflow-hidden bg-gray-100" style={{ height }}>
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
    <div className="grid grid-cols-2 gap-3">
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-36 rounded-2xl" />
    </div>
  );
}

/** Promo / ads strip. */
export function AdsCarouselSkeleton() {
  return <Skeleton className="w-full aspect-video rounded-2xl" />;
}

/** Trip history card on Activity. */
export function TripCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-28" />
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

/**
 * Route-level Suspense fallback — layout chrome + section placeholders,
 * never a blank full-screen spinner.
 */
export function RouteShellSkeleton() {
  return (
    <div className="w-full max-w-lg min-h-dvh bg-bg flex flex-col mx-auto">
      <div className="px-4 pt-3.5 pb-3.5 rounded-b-3xl bg-surface/95 shadow-lg">
        <Skeleton className="h-3 w-20 mb-2" />
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-9 w-20 rounded-xl" />
        </div>
      </div>
      <div className="flex-1 p-4 space-y-5">
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

/** Auth / guard bootstrap — keep chrome, avoid centered spinner only. */
export function BootstrapShellSkeleton() {
  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <div className="px-4 pt-6 pb-4">
        <Skeleton className="h-4 w-24 mb-3" />
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-40 w-full rounded-2xl mb-4" />
        <Skeleton className="h-12 w-full rounded-xl mb-3" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}
