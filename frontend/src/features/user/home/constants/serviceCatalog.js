import { SERVICE_TYPES } from '../../../../constants/serviceTypes';

/**
 * Presentation metadata for the home + booking-entry tiles.
 *
 * The backend owns the substance (pricing, slabs, availability) — this file
 * just keeps the visual layer co-located so we never accidentally use a
 * different illustration between the home tile and the booking flow.
 *
 *   key:          backend serviceType enum value
 *   imageSrc:     public-path asset shown as the hero
 *   gradient:     Tailwind classes for the card background
 *   accent:       hex used for the "From ₹X" pill border + accent text
 *   tagline:      one-line value prop shown under the title
 *   priceLabel:   how the "From X" hint is phrased (varies by service)
 *   ctaHint:      small text under the CTA chevron
 */
export const SERVICE_CATALOG = Object.freeze({
  [SERVICE_TYPES.HOURLY]: {
    key: SERVICE_TYPES.HOURLY,
    title: 'Hourly',
    tagline: 'By the hour, on demand',
    imageSrc: '/images/user/clock.png',
    gradient: 'from-amber-50 via-amber-100 to-amber-50',
    accent: '#D97706',
    accentText: 'text-amber-950',
    priceLabel: (pricing) =>
      pricing?.slabs?.[0]?.price
        ? `From ₹${pricing.slabs[0].price}`
        : 'Quick errands',
    ctaHint: 'Book in seconds',
  },
  [SERVICE_TYPES.OUTSTATION]: {
    key: SERVICE_TYPES.OUTSTATION,
    title: 'Round trip',
    tagline: 'Multi-day trips, sorted',
    imageSrc: '/images/user/car.png',
    gradient: 'from-sky-50 via-blue-100 to-indigo-50',
    accent: '#2563EB',
    accentText: 'text-blue-950',
    priceLabel: (pricing) =>
      pricing?.outstation?.dailyRate
        ? `From ₹${pricing.outstation.dailyRate}/day`
        : 'Long journeys',
    ctaHint: 'Plan a trip',
  },
});

/** Helper used by `BookDriverSection` to walk both entries in display order. */
export const SERVICE_CATALOG_LIST = Object.freeze([
  SERVICE_CATALOG[SERVICE_TYPES.HOURLY],
  SERVICE_CATALOG[SERVICE_TYPES.OUTSTATION],
]);

export const SUBSCRIPTION_BANNER = Object.freeze({
  imageSrc: '/images/user/subscription.png',
  title: 'Get your own dedicated driver',
  tagline: 'Daily commutes, school runs, errands — all covered by one driver, one plan.',
  perks: ['Same driver every day', 'Up to 30% off extra rides', 'Priority dispatch'],
});
