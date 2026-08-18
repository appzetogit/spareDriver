import { useEffect, useRef, useState } from 'react';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { useWhenVisible } from '../hooks/useWhenVisible';
import { buildCacheKey } from '../store/lib/buildCacheKey';
import { useAdsStore } from '../store/user/useAdsStore';
import { normalizeExternalUrl, openExternalUrl } from '../utils/openExternalUrl';
import { AdsCarouselSkeleton } from './skeleton/SectionSkeletons';

/**
 * Single promo banner on the user home screen.
 * Rotates active ads one-by-one in place (no horizontal scroll).
 * Clicks open the destination in the system browser, not the Flutter WebView.
 */
const ADS_CACHE_KEY = buildCacheKey('common-ads');
const ROTATE_MS = 5000;

const AdsCarousel = () => {
  const sectionRef = useRef(null);
  const visible = useWhenVisible(sectionRef, { rootMargin: '240px 0px' });
  const { data, isFetched, loading } = useCachedQuery(
    useAdsStore,
    ADS_CACHE_KEY,
    undefined,
    { enabled: visible },
  );
  const ads = Array.isArray(data) ? data : [];
  const [activeIdx, setActiveIdx] = useState(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (activeIdx >= ads.length) setActiveIdx(0);
  }, [ads.length, activeIdx]);

  useEffect(() => {
    if (ads.length < 2) return undefined;
    const tick = setInterval(() => {
      if (pausedRef.current) return;
      setActiveIdx((prev) => (prev + 1) % ads.length);
    }, ROTATE_MS);
    return () => clearInterval(tick);
  }, [ads.length]);

  const handleAdClick = (event, ad) => {
    const href = normalizeExternalUrl(ad?.linkUrl);
    if (!href) return;
    event?.preventDefault?.();
    openExternalUrl(href);
  };

  if (visible && loading && !isFetched) {
    return (
      <section ref={sectionRef} aria-label="Promotions" className="animate-fade-in-up">
        <AdsCarouselSkeleton />
      </section>
    );
  }

  if (isFetched && ads.length === 0) {
    return <section ref={sectionRef} aria-hidden className="h-0 overflow-hidden" />;
  }

  if (!isFetched) {
    return <section ref={sectionRef} aria-hidden className="h-1" />;
  }

  const ad = ads[Math.min(activeIdx, ads.length - 1)];

  return (
    <section
      ref={sectionRef}
      className="animate-fade-in-up"
      style={{ animationDelay: '0.1s' }}
      aria-label="Promotions"
      aria-live="polite"
      onMouseEnter={() => {
        pausedRef.current = true;
      }}
      onMouseLeave={() => {
        pausedRef.current = false;
      }}
      onTouchStart={() => {
        pausedRef.current = true;
      }}
      onTouchEnd={() => {
        pausedRef.current = false;
      }}
    >
      <AdCard key={ad._id} ad={ad} onClick={(event) => handleAdClick(event, ad)} />
      {ads.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2">
          {ads.map((item, idx) => (
            <button
              key={item._id}
              type="button"
              onClick={() => setActiveIdx(idx)}
              aria-label={`Show ad ${idx + 1}`}
              aria-current={idx === activeIdx ? 'true' : undefined}
              className={`h-1.5 rounded-full transition-all ${
                idx === activeIdx ? 'w-5 bg-primary' : 'w-1.5 bg-gray-300'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
};

function AdCard({ ad, onClick }) {
  const isVideo = ad.mediaType === 'video';
  const href = normalizeExternalUrl(ad.linkUrl);
  return (
    <div className="w-full rounded-2xl overflow-hidden bg-slate-900 shadow-card relative">
      <div className="aspect-[16/9] w-full">
        {isVideo ? (
          <video
            src={ad.mediaUrl}
            className="w-full h-full object-cover pointer-events-none"
            muted
            playsInline
            autoPlay
            loop
          />
        ) : (
          <img
            src={ad.mediaUrl}
            alt={ad.title || 'Promotional banner'}
            className="w-full h-full object-cover pointer-events-none"
            loading="lazy"
          />
        )}
      </div>
      {ad.title && (
        <div className="absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pt-6 pb-2 text-left pointer-events-none">
          <p className="text-white text-sm font-semibold truncate">{ad.title}</p>
        </div>
      )}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={ad.title ? `Open: ${ad.title}` : 'Open ad'}
          onClick={onClick}
          className="absolute inset-0 z-10 cursor-pointer active:scale-[0.98] transition-transform"
        />
      ) : null}
    </div>
  );
}

export default AdsCarousel;
