/**
 * Vehicle catalog seed data — mirrors what admin creates under
 * Platform Settings → Vehicle catalog (categories, fuel, brands, models).
 *
 * Seed order (dependencies):
 *   1. categories  → CarType
 *   2. fuelTypes   → FuelType
 *   3. brands      → CarBrand (from BRAND_MODELS keys)
 *   4. models      → CarModel (brand + category ref)
 *
 * Driver onboarding (/driver/register/credentials) reads these via /common/* APIs.
 * Each vehicle row needs: carTypeId, brandId, modelId, fuelTypeId, transmission.
 * Transmission is not seeded — it is manual/automatic on the driver form.
 */

/** @type {{ name: string, description?: string, image?: string }[]} */
export const CATEGORIES = [
  { name: 'hatchback', description: 'Compact hatchback cars' },
  { name: 'sedan', description: 'Sedan / saloon cars' },
  { name: 'suv', description: 'SUV and crossovers' },
  { name: 'muv', description: 'MUV / MPV family vehicles' },
  { name: 'luxury', description: 'Luxury segment' },
];

/** @type {{ name: string, sortOrder?: number }[]} */
export const FUEL_TYPES = [
  { name: 'Petrol', sortOrder: 0 },
  { name: 'Diesel', sortOrder: 1 },
  { name: 'CNG', sortOrder: 2 },
  { name: 'Electric', sortOrder: 3 },
  { name: 'Hybrid', sortOrder: 4 },
];

/**
 * brand name → models for that brand.
 * `category` must match a CATEGORIES[].name (lowercase slug).
 *
 * @type {Record<string, { name: string, category: string }[]>}
 */
export const BRAND_MODELS = {
  'Maruti Suzuki': [
    { name: 'Alto K10', category: 'hatchback' },
    { name: 'S-Presso', category: 'hatchback' },
    { name: 'Celerio', category: 'hatchback' },
    { name: 'Wagon R', category: 'hatchback' },
    { name: 'Swift', category: 'hatchback' },
    { name: 'Baleno', category: 'hatchback' },
    { name: 'Ignis', category: 'hatchback' },
    { name: 'Dzire', category: 'sedan' },
    { name: 'Ciaz', category: 'sedan' },
    { name: 'Brezza', category: 'suv' },
    { name: 'Grand Vitara', category: 'suv' },
    { name: 'Jimny', category: 'suv' },
    { name: 'Ertiga', category: 'muv' },
    { name: 'XL6', category: 'muv' },
    { name: 'Invicto', category: 'muv' },
    { name: 'Fronx', category: 'suv' },
  ],

  Hyundai: [
    { name: 'Grand i10 Nios', category: 'hatchback' },
    { name: 'i20', category: 'hatchback' },
    { name: 'i20 N Line', category: 'hatchback' },
    { name: 'Aura', category: 'sedan' },
    { name: 'Verna', category: 'sedan' },
    { name: 'Exter', category: 'suv' },
    { name: 'Venue', category: 'suv' },
    { name: 'Venue N Line', category: 'suv' },
    { name: 'Creta', category: 'suv' },
    { name: 'Creta N Line', category: 'suv' },
    { name: 'Alcazar', category: 'muv' },
    { name: 'Tucson', category: 'suv' },
    { name: 'IONIQ 5', category: 'luxury' },
  ],

  Tata: [
    { name: 'Tiago', category: 'hatchback' },
    { name: 'Tiago EV', category: 'hatchback' },
    { name: 'Altroz', category: 'hatchback' },
    { name: 'Altroz Racer', category: 'hatchback' },
    { name: 'Tigor', category: 'sedan' },
    { name: 'Tigor EV', category: 'sedan' },
    { name: 'Punch', category: 'suv' },
    { name: 'Punch EV', category: 'suv' },
    { name: 'Nexon', category: 'suv' },
    { name: 'Nexon EV', category: 'suv' },
    { name: 'Curvv', category: 'suv' },
    { name: 'Curvv EV', category: 'suv' },
    { name: 'Harrier', category: 'suv' },
    { name: 'Safari', category: 'suv' },
  ],

  Mahindra: [
    { name: 'Bolero', category: 'muv' },
    { name: 'Bolero Neo', category: 'muv' },
    { name: 'Thar', category: 'suv' },
    { name: 'Thar Roxx', category: 'suv' },
    { name: 'XUV 3XO', category: 'suv' },
    { name: 'Scorpio Classic', category: 'suv' },
    { name: 'Scorpio N', category: 'suv' },
    { name: 'XUV700', category: 'suv' },
    { name: 'XUV400 EV', category: 'suv' },
    { name: 'BE 6', category: 'suv' },
    { name: 'XEV 9e', category: 'suv' },
    { name: 'Marazzo', category: 'muv' },
  ],

  Toyota: [
    { name: 'Glanza', category: 'hatchback' },
    { name: 'Taisor', category: 'suv' },
    { name: 'Urban Cruiser Hyryder', category: 'suv' },
    { name: 'Innova Crysta', category: 'muv' },
    { name: 'Innova Hycross', category: 'muv' },
    { name: 'Fortuner', category: 'suv' },
    { name: 'Fortuner Legender', category: 'luxury' },
    { name: 'Hilux', category: 'suv' },
    { name: 'Camry', category: 'luxury' },
    { name: 'Vellfire', category: 'luxury' },
    { name: 'Land Cruiser 300', category: 'luxury' },
  ],

  Kia: [
    { name: 'Sonet', category: 'suv' },
    { name: 'Seltos', category: 'suv' },
    { name: 'Carens', category: 'muv' },
    { name: 'Carnival', category: 'luxury' },
    { name: 'EV6', category: 'luxury' },
    { name: 'Syros', category: 'suv' },
  ],

  Honda: [
    { name: 'Amaze', category: 'sedan' },
    { name: 'City', category: 'sedan' },
    { name: 'City Hybrid', category: 'sedan' },
    { name: 'Elevate', category: 'suv' },
  ],

  Volkswagen: [
    { name: 'Virtus', category: 'sedan' },
    { name: 'Taigun', category: 'suv' },
    { name: 'Tiguan', category: 'luxury' },
  ],

  Skoda: [
    { name: 'Slavia', category: 'sedan' },
    { name: 'Kushaq', category: 'suv' },
    { name: 'Kodiaq', category: 'luxury' },
    { name: 'Superb', category: 'luxury' },
  ],

  MG: [
    { name: 'Comet EV', category: 'hatchback' },
    { name: 'Astor', category: 'suv' },
    { name: 'Hector', category: 'suv' },
    { name: 'Hector Plus', category: 'suv' },
    { name: 'ZS EV', category: 'suv' },
    { name: 'Gloster', category: 'luxury' },
    { name: 'Windsor EV', category: 'suv' },
  ],

  Renault: [
    { name: 'Kwid', category: 'hatchback' },
    { name: 'Kiger', category: 'suv' },
    { name: 'Triber', category: 'muv' },
  ],

  Nissan: [
    { name: 'Magnite', category: 'suv' },
    { name: 'X-Trail', category: 'luxury' },
  ],

  Citroen: [
    { name: 'C3', category: 'hatchback' },
    { name: 'eC3', category: 'hatchback' },
    { name: 'C3 Aircross', category: 'suv' },
    { name: 'Basalt', category: 'suv' },
  ],

  Jeep: [
    { name: 'Compass', category: 'suv' },
    { name: 'Meridian', category: 'suv' },
    { name: 'Wrangler', category: 'luxury' },
    { name: 'Grand Cherokee', category: 'luxury' },
  ],

  BMW: [
    { name: '2 Series Gran Coupe', category: 'luxury' },
    { name: '3 Series', category: 'luxury' },
    { name: '5 Series', category: 'luxury' },
    { name: '7 Series', category: 'luxury' },
    { name: 'X1', category: 'luxury' },
    { name: 'X3', category: 'luxury' },
    { name: 'X5', category: 'luxury' },
    { name: 'i4', category: 'luxury' },
    { name: 'iX', category: 'luxury' },
  ],

  Mercedes: [
    { name: 'A-Class Limousine', category: 'luxury' },
    { name: 'C-Class', category: 'luxury' },
    { name: 'E-Class', category: 'luxury' },
    { name: 'S-Class', category: 'luxury' },
    { name: 'GLA', category: 'luxury' },
    { name: 'GLB', category: 'luxury' },
    { name: 'GLE', category: 'luxury' },
    { name: 'GLS', category: 'luxury' },
    { name: 'EQB', category: 'luxury' },
    { name: 'EQS', category: 'luxury' },
  ],

  Audi: [
    { name: 'A4', category: 'luxury' },
    { name: 'A6', category: 'luxury' },
    { name: 'Q3', category: 'luxury' },
    { name: 'Q5', category: 'luxury' },
    { name: 'Q7', category: 'luxury' },
    { name: 'Q8', category: 'luxury' },
    { name: 'e-tron GT', category: 'luxury' },
  ],

  Volvo: [
    { name: 'XC40 Recharge', category: 'luxury' },
    { name: 'XC60', category: 'luxury' },
    { name: 'XC90', category: 'luxury' },
    { name: 'C40 Recharge', category: 'luxury' },
  ],

  Lexus: [
    { name: 'ES', category: 'luxury' },
    { name: 'NX', category: 'luxury' },
    { name: 'RX', category: 'luxury' },
    { name: 'LM', category: 'luxury' },
  ],

  BYD: [
    { name: 'Atto 3', category: 'suv' },
    { name: 'Seal', category: 'luxury' },
    { name: 'eMAX 7', category: 'muv' },
  ],

  Mini: [
    { name: 'Cooper S', category: 'luxury' },
    { name: 'Countryman', category: 'luxury' },
  ],

  Porsche: [
    { name: 'Macan', category: 'luxury' },
    { name: 'Cayenne', category: 'luxury' },
    { name: 'Panamera', category: 'luxury' },
    { name: 'Taycan', category: 'luxury' },
  ],

  LandRover: [
    { name: 'Range Rover Evoque', category: 'luxury' },
    { name: 'Range Rover Velar', category: 'luxury' },
    { name: 'Range Rover Sport', category: 'luxury' },
    { name: 'Defender', category: 'luxury' },
    { name: 'Discovery Sport', category: 'luxury' },
  ],
};
