export const SITE_LEGAL_PAGES = [
  {
    type: 'privacy',
    path: '/privacy-policy',
    label: 'Privacy Policy',
    titleFallback: 'Privacy Policy',
    description:
      'Read the SpareDriver Privacy Policy to understand how we collect, protect, and use your personal information.',
  },
  {
    type: 'terms',
    path: '/terms-and-conditions',
    label: 'Terms & Conditions',
    titleFallback: 'Terms & Conditions',
    description: 'SpareDriver user agreement, platform guidelines, and service terms.',
  },
  {
    type: 'refund_cancellation',
    path: '/refund-and-cancellation-policy',
    label: 'Refund & Cancellation Policy',
    titleFallback: 'Refund & Cancellation Policy',
    description: 'SpareDriver refund, cancellation, and booking adjustment policy.',
  },
  {
    type: 'pricing_shipping',
    path: '/pricing-and-shipping-policy',
    label: 'Pricing & Shipping Policy',
    titleFallback: 'Pricing & Shipping Policy',
    description: 'SpareDriver pricing, fees, and shipping policy for kits and related products.',
  },
];

export function getLegalPageMeta(type) {
  return SITE_LEGAL_PAGES.find((p) => p.type === type) || null;
}
