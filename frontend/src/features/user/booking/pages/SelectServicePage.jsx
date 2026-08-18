import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import ServiceCard from '../../home/components/ServiceCard';
import { SERVICE_CATALOG } from '../../home/constants/serviceCatalog';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useUserServicePricingsStore } from '../../../../store/user/useUserPricingStore';
import useBookingDraftStore from '../../../../store/user/useBookingDraftStore';
import { SERVICE_TYPES } from '../../../../constants/serviceTypes';

const SelectServicePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const setServiceType = useBookingDraftStore((s) => s.setServiceType);
  const currentServiceType = useBookingDraftStore((s) => s.serviceType);
  const [fromNoDriversFound] = useState(!!location.state?.noDriversFound);

  const { data, loading, error } = useCachedQuery(
    useUserServicePricingsStore,
    buildCacheKey('user-services-active'),
  );
  const services = Array.isArray(data) ? data : [];

  // Users with multiple cars are allowed to spin up parallel bookings,
  // so we DON'T redirect into an existing active booking here anymore.
  // Resume access lives on the home page + Activity tab; this screen is
  // strictly the entry point for *starting a new ride*.

  const handleSelect = (serviceType) => {
    setServiceType(serviceType);
    if (serviceType === SERVICE_TYPES.HOURLY) {
      navigate('/user/book/hourly/type');
    } else {
      navigate('/user/book/variants');
    }
  };

  const handleBack = () => {
    if (fromNoDriversFound) {
      navigate('/user/home', { replace: true });
      return;
    }
    navigate(-1);
  };

  // Keep the currently-selected ring as a subtle visual indicator without
  // adding any logic here — the same accent already lives in the catalog.
  void currentServiceType;

  return (
    <div className="flex-1 flex flex-col bg-bg">
      <div className="bg-white px-4 pt-4 pb-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="p-2 -ml-2 rounded-xl hover:bg-gray-100"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-text" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-text">Choose a service</h1>
            <p className="text-xs text-text-muted">What kind of ride do you need?</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-3">
        {loading && services.length === 0 && (
          <div className="flex items-center justify-center py-12 text-text-muted">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}

        {error && (
          <div className="text-sm text-danger bg-danger/10 rounded-xl px-4 py-3">
            Couldn't load services right now. Please try again.
          </div>
        )}

        <div className="grid grid-cols-1 gap-3">
          {services
            .filter((s) => s.isActive)
            .map((service, idx) => {
              const catalog = SERVICE_CATALOG[service.serviceType];
              if (!catalog) return null;
              return (
                <ServiceCard
                  key={service._id}
                  title={catalog.title}
                  tagline={catalog.tagline}
                  priceLabel={catalog.priceLabel(service)}
                  ctaHint={catalog.ctaHint}
                  imageSrc={catalog.imageSrc}
                  imageAlt={`${catalog.title} service`}
                  gradient={catalog.gradient}
                  accent={catalog.accent}
                  accentText={catalog.accentText}
                  onClick={() => handleSelect(service.serviceType)}
                  style={{ animationDelay: `${idx * 0.06}s` }}
                />
              );
            })}
        </div>

        {!loading && services.length === 0 && (
          <div className="text-sm text-text-muted text-center py-12">
            No services are available right now. Please check back soon.
          </div>
        )}
      </div>
    </div>
  );
};

export default SelectServicePage;
