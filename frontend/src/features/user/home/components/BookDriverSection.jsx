import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ServiceCard from './ServiceCard';
import SubscriptionBanner from './SubscriptionBanner';
import { SERVICE_CATALOG_LIST } from '../constants/serviceCatalog';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { useAfterPaint } from '../../../../hooks/useAfterPaint';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import {
  useUserServicePricingsStore,
  useUserSubscriptionPlansStore,
} from '../../../../store/user/useUserPricingStore';
import useBookingDraftStore from '../../../../store/user/useBookingDraftStore';
import { SERVICE_TYPES } from '../../../../constants/serviceTypes';

/**
 * "Book a driver" home section.
 *
 * Service pricing is critical for the "From ₹X" labels — fetch immediately.
 * Subscription plans only feed the banner — defer until after first paint.
 */
const BookDriverSection = () => {
  const navigate = useNavigate();
  const setServiceType = useBookingDraftStore((s) => s.setServiceType);
  const plansReady = useAfterPaint({ delayMs: 200 });

  const { data: pricingData } = useCachedQuery(
    useUserServicePricingsStore,
    buildCacheKey('user-services-active'),
  );
  const { data: planData } = useCachedQuery(
    useUserSubscriptionPlansStore,
    buildCacheKey('user-subscriptions-active'),
    undefined,
    { enabled: plansReady },
  );

  const pricingByType = useMemo(() => {
    const list = Array.isArray(pricingData) ? pricingData : [];
    return list.reduce((acc, row) => {
      acc[row.serviceType] = row;
      return acc;
    }, {});
  }, [pricingData]);

  const startingPlanPrice = useMemo(() => {
    const list = Array.isArray(planData) ? planData : [];
    if (!list.length) return null;
    return list
      .filter((p) => p?.isActive !== false && typeof p.price === 'number')
      .reduce((min, p) => (min == null || p.price < min ? p.price : min), null);
  }, [planData]);

  const handleServiceTap = (serviceType) => {
    setServiceType(serviceType);
    if (serviceType === SERVICE_TYPES.HOURLY) {
      navigate('/user/book/hourly/type');
    } else {
      navigate('/user/book/variants');
    }
  };

  return (
    <section className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
      <header className="flex items-baseline justify-between mb-3">
        <div>
          <h2 className="text-base font-extrabold text-text leading-tight">Book a driver</h2>
          <p className="text-xs text-text-muted mt-0.5">Choose what fits your day.</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {SERVICE_CATALOG_LIST.map((catalog, idx) => {
          const pricing = pricingByType[catalog.key];
          const title = pricing?.name?.trim() || catalog.title;
          return (
            <ServiceCard
              key={catalog.key}
              title={title}
              tagline={pricing?.description?.trim() || catalog.tagline}
              priceLabel={catalog.priceLabel(pricing)}
              ctaHint={catalog.ctaHint}
              imageSrc={catalog.imageSrc}
              imageAlt={`${title} service`}
              gradient={catalog.gradient}
              accent={catalog.accent}
              accentText={catalog.accentText}
              onClick={() => handleServiceTap(catalog.key)}
              style={{ animationDelay: `${0.1 + idx * 0.05}s` }}
            />
          );
        })}
      </div>

      <div className="mt-4">
        <SubscriptionBanner
          startingPrice={startingPlanPrice}
          onClick={() => navigate('/user/subscriptions')}
        />
      </div>
    </section>
  );
};

export default BookDriverSection;
