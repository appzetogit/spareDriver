import { useCallback, useEffect, useRef, useState } from 'react';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { useWhenVisible } from '../hooks/useWhenVisible';
import { buildCacheKey } from '../store/lib/buildCacheKey';
import { useAdsStore } from '../store/user/useAdsStore';
import { AdsCarouselSkeleton } from './skeleton/SectionSkeletons';

/**
 * Horizontally-scrolling ad carousel rendered on the user home screen.
 *
 * Ads are optional / below the fold — fetch only once the strip is near
 * the viewport so home startup is not competing with critical APIs.
 */
const ADS_CACHE_KEY = buildCacheKey('common-ads');

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
  const scrollerRef = useRef(null);
  const interactingRef = useRef(false);

  const scrollToIndex = useCallback((idx) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.children?.[idx];
    if (!card) return;
    el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (ads.length < 2) return undefined;
    const tick = setInterval(() => {
      if (interactingRef.current) return;
      setActiveIdx((prev) => {
        const next = (prev + 1) % ads.length;
        scrollToIndex(next);
        return next;
      });
    }, 5000);
    return () => clearInterval(tick);
  }, [ads.length, scrollToIndex]);

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const children = Array.from(el.children);
    if (!children.length) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let bestIdx = 0;
    let bestDist = Infinity;
    children.forEach((child, idx) => {
      const childCenter = child.offsetLeft + child.clientWidth / 2 - el.offsetLeft;
      const dist = Math.abs(childCenter - center);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    });
    setActiveIdx(bestIdx);
  }, []);

  const handleAdClick = (ad) => {
    if (!ad.linkUrl) return;
    // Always `_blank` + `noopener,noreferrer` per the spec — keeps the
    // PWA host page secure even if the destination is an ad partner.
    window.open(ad.linkUrl, '_blank', 'noopener,noreferrer');
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
    // Reserve an observation target so IntersectionObserver can fire.
    return <section ref={sectionRef} aria-hidden className="h-1" />;
  }

  return (
    <section
      ref={sectionRef}
      className="animate-fade-in-up"
      style={{ animationDelay: '0.1s' }}
      aria-label="Promotions"
    >
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        onTouchStart={() => {
          interactingRef.current = true;
        }}
        onTouchEnd={() => {
          interactingRef.current = false;
        }}
        onMouseEnter={() => {
          interactingRef.current = true;
        }}
        onMouseLeave={() => {
          interactingRef.current = false;
        }}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4 scroll-smooth"
      >
        {ads.map((ad) => (
          <AdCard key={ad._id} ad={ad} onClick={() => handleAdClick(ad)} />
        ))}
      </div>
      {ads.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2">
          {ads.map((ad, idx) => (
            <button
              key={ad._id}
              type="button"
              onClick={() => {
                setActiveIdx(idx);
                scrollToIndex(idx);
              }}
              aria-label={`Show ad ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all ${idx === activeIdx ? 'w-5 bg-primary' : 'w-1.5 bg-gray-300'
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
  const clickable = !!ad.linkUrl;
  const Tag = clickable ? 'button' : 'div';
  return (
    <Tag
      type={clickable ? 'button' : undefined}
      onClick={clickable ? onClick : undefined}
      aria-label={ad.title ? `Open: ${ad.title}` : 'Open ad'}
      className={`snap-start shrink-0 w-[88%] max-w-[420px] rounded-2xl overflow-hidden bg-slate-900 shadow-card relative ${clickable ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''
        }`}
    >
      <div className="aspect-[16/9] w-full">
        {isVideo ? (
          <video
            src={ad.mediaUrl}
            className="w-full h-full object-cover"
            muted
            playsInline
            autoPlay
            loop
          />
        ) : (
          <img
            src={ad.mediaUrl}
            alt={ad.title || 'Promotional banner'}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
      </div>
      {ad.title && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pt-6 pb-2 text-left">
          <p className="text-white text-sm font-semibold truncate">{ad.title}</p>
        </div>
      )}
    </Tag>
  );
}

export default AdsCarousel;
