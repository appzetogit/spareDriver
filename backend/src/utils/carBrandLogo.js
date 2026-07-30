/**
 * Resolves car brand logos from the vehiclespecs/brand-logos set on jsDelivr.
 * https://cdn.jsdelivr.net/gh/vehiclespecs/brand-logos@v1.0.0/{file}
 *
 * Filenames come from brands.json in that repo. Aliases cover seed names that
 * don't match the CDN keys 1:1 (e.g. "Maruti Suzuki" → maruti-logo.svg).
 */

export const CAR_BRAND_LOGO_CDN =
  'https://cdn.jsdelivr.net/gh/vehiclespecs/brand-logos@v1.0.0';

/** Lowercased brand name / alias → filename in the CDN package. */
const BRAND_LOGO_FILES = {
  'maruti suzuki': 'maruti-logo.svg',
  maruti: 'maruti-logo.svg',
  hyundai: 'hyundai-logo.svg',
  tata: 'tata-logo.png',
  mahindra: 'mahindra-logo.png',
  toyota: 'toyota-logo.svg',
  kia: 'kia-logo.svg',
  honda: 'honda-logo.png',
  volkswagen: 'volkswagen-logo.svg',
  skoda: 'skoda-logo.svg',
  mg: 'mg-logo.png',
  renault: 'renault-logo.svg',
  nissan: 'nissan-logo.svg',
  citroen: 'citroen-logo.svg',
  jeep: 'jeep-logo.svg',
  bmw: 'bmw-logo.svg',
  mercedes: 'mercedes-benz-logo.svg',
  'mercedes-benz': 'mercedes-benz-logo.svg',
  audi: 'audi-logo.svg',
  volvo: 'volvo-logo.svg',
  lexus: 'lexus-logo.png',
  byd: 'byd-logo.svg',
  mini: 'mini-logo.svg',
  porsche: 'porsche-logo.svg',
  landrover: 'land-rover-logo.svg',
  'land rover': 'land-rover-logo.svg',
  ford: 'ford-logo.png',
  chevrolet: 'chevrolet-logo.png',
  suzuki: 'suzuki-logo.svg',
  tesla: 'tesla-logo.svg',
  fiat: 'fiat-logo.svg',
  mazda: 'mazda-logo.svg',
  mitsubishi: 'mitsubishi-logo.svg',
  isuzu: 'isuzu-logo.svg',
  jaguar: 'jaguar-logo.svg',
};

/**
 * @param {string} brandName
 * @returns {string} Absolute CDN URL, or '' if unknown
 */
export function resolveCarBrandLogoUrl(brandName) {
  const key = String(brandName || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!key) return '';

  const file = BRAND_LOGO_FILES[key];
  if (file) return `${CAR_BRAND_LOGO_CDN}/${file}`;

  // Generic slug fallback (e.g. "Alfa Romeo" → alfa-romeo-logo.svg)
  const slug = key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) return '';
  return `${CAR_BRAND_LOGO_CDN}/${slug}-logo.svg`;
}
