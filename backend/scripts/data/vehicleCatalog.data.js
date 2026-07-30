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
// export const BRAND_MODELS = {
//   'Maruti Suzuki': [
//     { name: 'Alto K10', category: 'hatchback' },
//     { name: 'S-Presso', category: 'hatchback' },
//     { name: 'Celerio', category: 'hatchback' },
//     { name: 'Wagon R', category: 'hatchback' },
//     { name: 'Swift', category: 'hatchback' },
//     { name: 'Baleno', category: 'hatchback' },
//     { name: 'Ignis', category: 'hatchback' },
//     { name: 'Dzire', category: 'sedan' },
//     { name: 'Ciaz', category: 'sedan' },
//     { name: 'Brezza', category: 'suv' },
//     { name: 'Grand Vitara', category: 'suv' },
//     { name: 'Jimny', category: 'suv' },
//     { name: 'Ertiga', category: 'muv' },
//     { name: 'XL6', category: 'muv' },
//     { name: 'Invicto', category: 'muv' },
//     { name: 'Fronx', category: 'suv' },
//   ],

//   Hyundai: [
//     { name: 'Grand i10 Nios', category: 'hatchback' },
//     { name: 'i20', category: 'hatchback' },
//     { name: 'i20 N Line', category: 'hatchback' },
//     { name: 'Aura', category: 'sedan' },
//     { name: 'Verna', category: 'sedan' },
//     { name: 'Exter', category: 'suv' },
//     { name: 'Venue', category: 'suv' },
//     { name: 'Venue N Line', category: 'suv' },
//     { name: 'Creta', category: 'suv' },
//     { name: 'Creta N Line', category: 'suv' },
//     { name: 'Alcazar', category: 'muv' },
//     { name: 'Tucson', category: 'suv' },
//     { name: 'IONIQ 5', category: 'luxury' },
//   ],

//   Tata: [
//     { name: 'Tiago', category: 'hatchback' },
//     { name: 'Tiago EV', category: 'hatchback' },
//     { name: 'Altroz', category: 'hatchback' },
//     { name: 'Altroz Racer', category: 'hatchback' },
//     { name: 'Tigor', category: 'sedan' },
//     { name: 'Tigor EV', category: 'sedan' },
//     { name: 'Punch', category: 'suv' },
//     { name: 'Punch EV', category: 'suv' },
//     { name: 'Nexon', category: 'suv' },
//     { name: 'Nexon EV', category: 'suv' },
//     { name: 'Curvv', category: 'suv' },
//     { name: 'Curvv EV', category: 'suv' },
//     { name: 'Harrier', category: 'suv' },
//     { name: 'Safari', category: 'suv' },
//   ],

//   Mahindra: [
//     { name: 'Bolero', category: 'muv' },
//     { name: 'Bolero Neo', category: 'muv' },
//     { name: 'Thar', category: 'suv' },
//     { name: 'Thar Roxx', category: 'suv' },
//     { name: 'XUV 3XO', category: 'suv' },
//     { name: 'Scorpio Classic', category: 'suv' },
//     { name: 'Scorpio N', category: 'suv' },
//     { name: 'XUV700', category: 'suv' },
//     { name: 'XUV400 EV', category: 'suv' },
//     { name: 'BE 6', category: 'suv' },
//     { name: 'XEV 9e', category: 'suv' },
//     { name: 'Marazzo', category: 'muv' },
//   ],

//   Toyota: [
//     { name: 'Glanza', category: 'hatchback' },
//     { name: 'Taisor', category: 'suv' },
//     { name: 'Urban Cruiser Hyryder', category: 'suv' },
//     { name: 'Innova Crysta', category: 'muv' },
//     { name: 'Innova Hycross', category: 'muv' },
//     { name: 'Fortuner', category: 'suv' },
//     { name: 'Fortuner Legender', category: 'luxury' },
//     { name: 'Hilux', category: 'suv' },
//     { name: 'Camry', category: 'luxury' },
//     { name: 'Vellfire', category: 'luxury' },
//     { name: 'Land Cruiser 300', category: 'luxury' },
//   ],

//   Kia: [
//     { name: 'Sonet', category: 'suv' },
//     { name: 'Seltos', category: 'suv' },
//     { name: 'Carens', category: 'muv' },
//     { name: 'Carnival', category: 'luxury' },
//     { name: 'EV6', category: 'luxury' },
//     { name: 'Syros', category: 'suv' },
//   ],

//   Honda: [
//     { name: 'Amaze', category: 'sedan' },
//     { name: 'City', category: 'sedan' },
//     { name: 'City Hybrid', category: 'sedan' },
//     { name: 'Elevate', category: 'suv' },
//   ],

//   Volkswagen: [
//     { name: 'Virtus', category: 'sedan' },
//     { name: 'Taigun', category: 'suv' },
//     { name: 'Tiguan', category: 'luxury' },
//   ],

//   Skoda: [
//     { name: 'Slavia', category: 'sedan' },
//     { name: 'Kushaq', category: 'suv' },
//     { name: 'Kodiaq', category: 'luxury' },
//     { name: 'Superb', category: 'luxury' },
//   ],

//   MG: [
//     { name: 'Comet EV', category: 'hatchback' },
//     { name: 'Astor', category: 'suv' },
//     { name: 'Hector', category: 'suv' },
//     { name: 'Hector Plus', category: 'suv' },
//     { name: 'ZS EV', category: 'suv' },
//     { name: 'Gloster', category: 'luxury' },
//     { name: 'Windsor EV', category: 'suv' },
//   ],

//   Renault: [
//     { name: 'Kwid', category: 'hatchback' },
//     { name: 'Kiger', category: 'suv' },
//     { name: 'Triber', category: 'muv' },
//   ],

//   Nissan: [
//     { name: 'Magnite', category: 'suv' },
//     { name: 'X-Trail', category: 'luxury' },
//   ],

//   Citroen: [
//     { name: 'C3', category: 'hatchback' },
//     { name: 'eC3', category: 'hatchback' },
//     { name: 'C3 Aircross', category: 'suv' },
//     { name: 'Basalt', category: 'suv' },
//   ],

//   Jeep: [
//     { name: 'Compass', category: 'suv' },
//     { name: 'Meridian', category: 'suv' },
//     { name: 'Wrangler', category: 'luxury' },
//     { name: 'Grand Cherokee', category: 'luxury' },
//   ],

//   BMW: [
//     { name: '2 Series Gran Coupe', category: 'luxury' },
//     { name: '3 Series', category: 'luxury' },
//     { name: '5 Series', category: 'luxury' },
//     { name: '7 Series', category: 'luxury' },
//     { name: 'X1', category: 'luxury' },
//     { name: 'X3', category: 'luxury' },
//     { name: 'X5', category: 'luxury' },
//     { name: 'i4', category: 'luxury' },
//     { name: 'iX', category: 'luxury' },
//   ],

//   Mercedes: [
//     { name: 'A-Class Limousine', category: 'luxury' },
//     { name: 'C-Class', category: 'luxury' },
//     { name: 'E-Class', category: 'luxury' },
//     { name: 'S-Class', category: 'luxury' },
//     { name: 'GLA', category: 'luxury' },
//     { name: 'GLB', category: 'luxury' },
//     { name: 'GLE', category: 'luxury' },
//     { name: 'GLS', category: 'luxury' },
//     { name: 'EQB', category: 'luxury' },
//     { name: 'EQS', category: 'luxury' },
//   ],

//   Audi: [
//     { name: 'A4', category: 'luxury' },
//     { name: 'A6', category: 'luxury' },
//     { name: 'Q3', category: 'luxury' },
//     { name: 'Q5', category: 'luxury' },
//     { name: 'Q7', category: 'luxury' },
//     { name: 'Q8', category: 'luxury' },
//     { name: 'e-tron GT', category: 'luxury' },
//   ],

//   Volvo: [
//     { name: 'XC40 Recharge', category: 'luxury' },
//     { name: 'XC60', category: 'luxury' },
//     { name: 'XC90', category: 'luxury' },
//     { name: 'C40 Recharge', category: 'luxury' },
//   ],

//   Lexus: [
//     { name: 'ES', category: 'luxury' },
//     { name: 'NX', category: 'luxury' },
//     { name: 'RX', category: 'luxury' },
//     { name: 'LM', category: 'luxury' },
//   ],

//   BYD: [
//     { name: 'Atto 3', category: 'suv' },
//     { name: 'Seal', category: 'luxury' },
//     { name: 'eMAX 7', category: 'muv' },
//   ],

//   Mini: [
//     { name: 'Cooper S', category: 'luxury' },
//     { name: 'Countryman', category: 'luxury' },
//   ],

//   Porsche: [
//     { name: 'Macan', category: 'luxury' },
//     { name: 'Cayenne', category: 'luxury' },
//     { name: 'Panamera', category: 'luxury' },
//     { name: 'Taycan', category: 'luxury' },
//   ],

//   LandRover: [
//     { name: 'Range Rover Evoque', category: 'luxury' },
//     { name: 'Range Rover Velar', category: 'luxury' },
//     { name: 'Range Rover Sport', category: 'luxury' },
//     { name: 'Defender', category: 'luxury' },
//     { name: 'Discovery Sport', category: 'luxury' },
//   ],
// };

export const BRAND_MODELS = {
  "Maruti Suzuki": [
    {
      "name": "Alto K10",
      "category": "hatchback"
    },
    {
      "name": "S-Presso",
      "category": "hatchback"
    },
    {
      "name": "Celerio",
      "category": "hatchback"
    },
    {
      "name": "WagonR",
      "category": "hatchback"
    },
    {
      "name": "Swift",
      "category": "hatchback"
    },
    {
      "name": "Baleno",
      "category": "hatchback"
    },
    {
      "name": "Ignis",
      "category": "hatchback"
    },
    {
      "name": "Dzire",
      "category": "sedan"
    },
    {
      "name": "Ciaz",
      "category": "sedan"
    },
    {
      "name": "SUV / Compact SUV",
      "category": "sedan"
    },
    {
      "name": "Fronx",
      "category": "sedan"
    },
    {
      "name": "Brezza",
      "category": "sedan"
    },
    {
      "name": "Grand Vitara",
      "category": "sedan"
    },
    {
      "name": "Jimny",
      "category": "sedan"
    },
    {
      "name": "Ertiga",
      "category": "muv"
    },
    {
      "name": "XL6",
      "category": "muv"
    },
    {
      "name": "Invicto",
      "category": "muv"
    },
    {
      "name": "Vans",
      "category": "muv"
    },
    {
      "name": "Eeco",
      "category": "muv"
    },
    {
      "name": "Super Carry",
      "category": "muv"
    },
    {
      "name": "2. Tata Motors",
      "category": "muv"
    },
    {
      "name": "Tiago",
      "category": "hatchback"
    },
    {
      "name": "Altroz",
      "category": "hatchback"
    },
    {
      "name": "Tigor",
      "category": "sedan"
    },
    {
      "name": "Compact SUV",
      "category": "sedan"
    },
    {
      "name": "Punch",
      "category": "sedan"
    },
    {
      "name": "Nexon",
      "category": "suv"
    },
    {
      "name": "Curvv",
      "category": "suv"
    },
    {
      "name": "Harrier",
      "category": "suv"
    },
    {
      "name": "Safari",
      "category": "suv"
    },
    {
      "name": "Electric Vehicles",
      "category": "suv"
    },
    {
      "name": "Tiago EV",
      "category": "suv"
    },
    {
      "name": "Tigor EV",
      "category": "suv"
    },
    {
      "name": "Punch EV",
      "category": "suv"
    },
    {
      "name": "Nexon EV",
      "category": "suv"
    },
    {
      "name": "Curvv EV",
      "category": "suv"
    },
    {
      "name": "Harrier EV",
      "category": "suv"
    },
    {
      "name": "Pickup / Commercial",
      "category": "suv"
    },
    {
      "name": "Yodha",
      "category": "suv"
    },
    {
      "name": "Ace",
      "category": "suv"
    },
    {
      "name": "Intra",
      "category": "suv"
    },
    {
      "name": "3. Mahindra",
      "category": "suv"
    },
    {
      "name": "Bolero",
      "category": "suv"
    },
    {
      "name": "Bolero Neo",
      "category": "suv"
    },
    {
      "name": "Thar",
      "category": "suv"
    },
    {
      "name": "XUV 3XO",
      "category": "suv"
    },
    {
      "name": "XUV700",
      "category": "suv"
    },
    {
      "name": "Scorpio Classic",
      "category": "suv"
    },
    {
      "name": "Scorpio N",
      "category": "suv"
    },
    {
      "name": "XUV.e8 (Upcoming)",
      "category": "suv"
    },
    {
      "name": "BE 6",
      "category": "suv"
    },
    {
      "name": "XEV 9e",
      "category": "suv"
    },
    {
      "name": "Bolero Pickup",
      "category": "suv"
    },
    {
      "name": "Bolero Camper",
      "category": "suv"
    },
    {
      "name": "Jeeto",
      "category": "suv"
    },
    {
      "name": "Supro",
      "category": "suv"
    },
    {
      "name": "Imperio",
      "category": "suv"
    },
    {
      "name": "Electric",
      "category": "suv"
    },
    {
      "name": "XUV400 EV",
      "category": "suv"
    },
    {
      "name": "4. Hindustan Motors",
      "category": "suv"
    },
    {
      "name": "Ambassador",
      "category": "sedan"
    },
    {
      "name": "Utility Vehicle",
      "category": "sedan"
    },
    {
      "name": "Trekker",
      "category": "sedan"
    },
    {
      "name": "5. Force Motors",
      "category": "sedan"
    },
    {
      "name": "Gurkha",
      "category": "suv"
    },
    {
      "name": "Gurkha 5 Door",
      "category": "suv"
    },
    {
      "name": "Van",
      "category": "suv"
    },
    {
      "name": "Traveller",
      "category": "suv"
    },
    {
      "name": "Urbania",
      "category": "suv"
    },
    {
      "name": "Ambulance",
      "category": "suv"
    },
    {
      "name": "Force Ambulance",
      "category": "suv"
    },
    {
      "name": "Commercial",
      "category": "suv"
    },
    {
      "name": "Trax",
      "category": "suv"
    },
    {
      "name": "Trump",
      "category": "suv"
    },
    {
      "name": "6. Premier Automobiles",
      "category": "suv"
    },
    {
      "name": "Rio",
      "category": "hatchback"
    },
    {
      "name": "118NE",
      "category": "sedan"
    },
    {
      "name": "Classic",
      "category": "sedan"
    },
    {
      "name": "Premier Padmini",
      "category": "sedan"
    },
    {
      "name": "7. Ashok Leyland (Passenger Vehicles)",
      "category": "sedan"
    },
    {
      "name": "Bus",
      "category": "sedan"
    },
    {
      "name": "Lynx",
      "category": "sedan"
    },
    {
      "name": "Oyster",
      "category": "sedan"
    },
    {
      "name": "Sunshine",
      "category": "sedan"
    },
    {
      "name": "Falcon",
      "category": "sedan"
    },
    {
      "name": "Viking",
      "category": "sedan"
    },
    {
      "name": "Staff Bus",
      "category": "sedan"
    },
    {
      "name": "MiTR Bus",
      "category": "sedan"
    },
    {
      "name": "School Bus",
      "category": "sedan"
    },
    {
      "name": "Sunshine School Bus",
      "category": "sedan"
    },
    {
      "name": "Commercial Passenger",
      "category": "sedan"
    },
    {
      "name": "Dost Van",
      "category": "sedan"
    },
    {
      "name": "8. EKA Mobility",
      "category": "sedan"
    },
    {
      "name": "Electric Bus",
      "category": "sedan"
    },
    {
      "name": "E9 Bus",
      "category": "sedan"
    },
    {
      "name": "E12 Bus",
      "category": "sedan"
    },
    {
      "name": "Electric Truck",
      "category": "sedan"
    },
    {
      "name": "Light Commercial EV",
      "category": "sedan"
    },
    {
      "name": "Medium Commercial EV",
      "category": "sedan"
    },
    {
      "name": "9. Pravaig",
      "category": "sedan"
    },
    {
      "name": "Luxury Electric Sedan",
      "category": "sedan"
    },
    {
      "name": "DEFY",
      "category": "sedan"
    }
  ],
  "Hyundai": [
    {
      "name": "Grand i10 NIOS",
      "category": "hatchback"
    },
    {
      "name": "i10",
      "category": "hatchback"
    },
    {
      "name": "i20",
      "category": "hatchback"
    },
    {
      "name": "i30",
      "category": "hatchback"
    },
    {
      "name": "i20 N",
      "category": "hatchback"
    },
    {
      "name": "Aura",
      "category": "sedan"
    },
    {
      "name": "Verna",
      "category": "sedan"
    },
    {
      "name": "Elantra",
      "category": "sedan"
    },
    {
      "name": "Sonata",
      "category": "sedan"
    },
    {
      "name": "Azera",
      "category": "sedan"
    },
    {
      "name": "Ioniq 6",
      "category": "sedan"
    },
    {
      "name": "Compact SUV",
      "category": "sedan"
    },
    {
      "name": "Exter",
      "category": "sedan"
    },
    {
      "name": "Venue",
      "category": "sedan"
    },
    {
      "name": "Kona",
      "category": "sedan"
    },
    {
      "name": "Bayon",
      "category": "sedan"
    },
    {
      "name": "Creta",
      "category": "suv"
    },
    {
      "name": "Alcazar",
      "category": "suv"
    },
    {
      "name": "Tucson",
      "category": "suv"
    },
    {
      "name": "Santa Fe",
      "category": "suv"
    },
    {
      "name": "Palisade",
      "category": "suv"
    },
    {
      "name": "Nexo",
      "category": "suv"
    },
    {
      "name": "MPV / MUV",
      "category": "suv"
    },
    {
      "name": "Stargazer",
      "category": "suv"
    },
    {
      "name": "Staria",
      "category": "suv"
    },
    {
      "name": "H-1",
      "category": "suv"
    },
    {
      "name": "Electric Vehicle (EV)",
      "category": "suv"
    },
    {
      "name": "Creta Electric",
      "category": "suv"
    },
    {
      "name": "Kona Electric",
      "category": "suv"
    },
    {
      "name": "Ioniq 5",
      "category": "suv"
    },
    {
      "name": "Ioniq 9",
      "category": "suv"
    },
    {
      "name": "Inster",
      "category": "suv"
    },
    {
      "name": "Hybrid",
      "category": "suv"
    },
    {
      "name": "Tucson Hybrid",
      "category": "suv"
    },
    {
      "name": "Santa Fe Hybrid",
      "category": "suv"
    },
    {
      "name": "Sonata Hybrid",
      "category": "suv"
    },
    {
      "name": "Pickup Truck",
      "category": "suv"
    },
    {
      "name": "Santa Cruz",
      "category": "suv"
    },
    {
      "name": "Performance (N Series)",
      "category": "suv"
    },
    {
      "name": "i30 N",
      "category": "suv"
    },
    {
      "name": "Elantra N",
      "category": "suv"
    },
    {
      "name": "Kona N",
      "category": "suv"
    },
    {
      "name": "Ioniq 5 N",
      "category": "suv"
    },
    {
      "name": "2. Kia",
      "category": "suv"
    },
    {
      "name": "Picanto",
      "category": "hatchback"
    },
    {
      "name": "Rio",
      "category": "hatchback"
    },
    {
      "name": "Ceed",
      "category": "hatchback"
    },
    {
      "name": "K4",
      "category": "sedan"
    },
    {
      "name": "K5",
      "category": "sedan"
    },
    {
      "name": "K8",
      "category": "sedan"
    },
    {
      "name": "K9",
      "category": "sedan"
    },
    {
      "name": "Sonet",
      "category": "sedan"
    },
    {
      "name": "Seltos",
      "category": "sedan"
    },
    {
      "name": "Niro",
      "category": "sedan"
    },
    {
      "name": "Carens Clavis",
      "category": "suv"
    },
    {
      "name": "Sportage",
      "category": "suv"
    },
    {
      "name": "Sorento",
      "category": "suv"
    },
    {
      "name": "Telluride",
      "category": "suv"
    },
    {
      "name": "EV9",
      "category": "suv"
    },
    {
      "name": "Carens",
      "category": "suv"
    },
    {
      "name": "Carnival",
      "category": "suv"
    },
    {
      "name": "EV3",
      "category": "suv"
    },
    {
      "name": "EV4",
      "category": "suv"
    },
    {
      "name": "EV5",
      "category": "suv"
    },
    {
      "name": "EV6",
      "category": "suv"
    },
    {
      "name": "Niro EV",
      "category": "suv"
    },
    {
      "name": "Niro Hybrid",
      "category": "suv"
    },
    {
      "name": "Sportage Hybrid",
      "category": "suv"
    },
    {
      "name": "Sorento Hybrid",
      "category": "suv"
    },
    {
      "name": "Tasman",
      "category": "suv"
    },
    {
      "name": "3. Genesis (Luxury Division of Hyundai)",
      "category": "suv"
    },
    {
      "name": "G70",
      "category": "luxury"
    },
    {
      "name": "G80",
      "category": "luxury"
    },
    {
      "name": "G90",
      "category": "luxury"
    },
    {
      "name": "Luxury Wagon",
      "category": "luxury"
    },
    {
      "name": "G70 Shooting Brake",
      "category": "luxury"
    },
    {
      "name": "GV60",
      "category": "luxury"
    },
    {
      "name": "GV70",
      "category": "luxury"
    },
    {
      "name": "GV80",
      "category": "luxury"
    },
    {
      "name": "Genesis X Concept",
      "category": "luxury"
    },
    {
      "name": "Electrified G80",
      "category": "luxury"
    },
    {
      "name": "Electrified GV70",
      "category": "luxury"
    },
    {
      "name": "4. SsangYong (Now KGM)",
      "category": "luxury"
    },
    {
      "name": "Tivoli",
      "category": "suv"
    },
    {
      "name": "Korando",
      "category": "suv"
    },
    {
      "name": "Torres",
      "category": "suv"
    },
    {
      "name": "Rexton",
      "category": "suv"
    },
    {
      "name": "Musso",
      "category": "suv"
    },
    {
      "name": "Musso Grand",
      "category": "suv"
    },
    {
      "name": "Torres EVX",
      "category": "suv"
    },
    {
      "name": "Rodius (Stavic)",
      "category": "muv"
    }
  ],
  "Toyota": [
    {
      "name": "Glanza",
      "category": "hatchback"
    },
    {
      "name": "Aqua",
      "category": "hatchback"
    },
    {
      "name": "Yaris Hatchback",
      "category": "hatchback"
    },
    {
      "name": "Prius C",
      "category": "hatchback"
    },
    {
      "name": "Yaris",
      "category": "sedan"
    },
    {
      "name": "Corolla",
      "category": "sedan"
    },
    {
      "name": "Corolla Altis",
      "category": "sedan"
    },
    {
      "name": "Camry",
      "category": "sedan"
    },
    {
      "name": "Crown",
      "category": "sedan"
    },
    {
      "name": "Mirai",
      "category": "sedan"
    },
    {
      "name": "Compact SUV",
      "category": "sedan"
    },
    {
      "name": "Raize",
      "category": "sedan"
    },
    {
      "name": "Urban Cruiser",
      "category": "sedan"
    },
    {
      "name": "Corolla Cross",
      "category": "sedan"
    },
    {
      "name": "Hyryder",
      "category": "suv"
    },
    {
      "name": "RAV4",
      "category": "suv"
    },
    {
      "name": "Fortuner",
      "category": "suv"
    },
    {
      "name": "Land Cruiser Prado",
      "category": "suv"
    },
    {
      "name": "Land Cruiser 300",
      "category": "suv"
    },
    {
      "name": "Sequoia",
      "category": "suv"
    },
    {
      "name": "4Runner",
      "category": "suv"
    },
    {
      "name": "MPV / MUV",
      "category": "suv"
    },
    {
      "name": "Rumion",
      "category": "suv"
    },
    {
      "name": "Innova Crysta",
      "category": "suv"
    },
    {
      "name": "Innova Hycross",
      "category": "suv"
    },
    {
      "name": "Alphard",
      "category": "suv"
    },
    {
      "name": "Vellfire",
      "category": "suv"
    },
    {
      "name": "Sienna",
      "category": "suv"
    },
    {
      "name": "HiAce",
      "category": "suv"
    },
    {
      "name": "Pickup Truck",
      "category": "suv"
    },
    {
      "name": "Hilux",
      "category": "suv"
    },
    {
      "name": "Tacoma",
      "category": "suv"
    },
    {
      "name": "Tundra",
      "category": "suv"
    },
    {
      "name": "Sports Car",
      "category": "suv"
    },
    {
      "name": "GR86",
      "category": "suv"
    },
    {
      "name": "GR Supra",
      "category": "suv"
    },
    {
      "name": "GR Yaris",
      "category": "suv"
    },
    {
      "name": "GR Corolla",
      "category": "suv"
    },
    {
      "name": "Electric Vehicle (EV)",
      "category": "suv"
    },
    {
      "name": "bZ4X",
      "category": "suv"
    },
    {
      "name": "Urban Cruiser EV",
      "category": "suv"
    },
    {
      "name": "Hybrid",
      "category": "suv"
    },
    {
      "name": "Prius",
      "category": "suv"
    },
    {
      "name": "Camry Hybrid",
      "category": "suv"
    },
    {
      "name": "Corolla Hybrid",
      "category": "suv"
    },
    {
      "name": "Hycross Hybrid",
      "category": "suv"
    },
    {
      "name": "2. Honda",
      "category": "suv"
    },
    {
      "name": "Brio",
      "category": "hatchback"
    },
    {
      "name": "Jazz (Fit)",
      "category": "hatchback"
    },
    {
      "name": "Civic Hatchback",
      "category": "hatchback"
    },
    {
      "name": "Amaze",
      "category": "sedan"
    },
    {
      "name": "City",
      "category": "sedan"
    },
    {
      "name": "Civic",
      "category": "sedan"
    },
    {
      "name": "Accord",
      "category": "sedan"
    },
    {
      "name": "Elevate",
      "category": "suv"
    },
    {
      "name": "WR-V",
      "category": "suv"
    },
    {
      "name": "BR-V",
      "category": "suv"
    },
    {
      "name": "CR-V",
      "category": "suv"
    },
    {
      "name": "HR-V",
      "category": "suv"
    },
    {
      "name": "Pilot",
      "category": "suv"
    },
    {
      "name": "Passport",
      "category": "suv"
    },
    {
      "name": "Mobilio",
      "category": "muv"
    },
    {
      "name": "Odyssey",
      "category": "muv"
    },
    {
      "name": "StepWGN",
      "category": "muv"
    },
    {
      "name": "Sports",
      "category": "muv"
    },
    {
      "name": "Civic Type R",
      "category": "muv"
    },
    {
      "name": "NSX",
      "category": "muv"
    },
    {
      "name": "Electric",
      "category": "muv"
    },
    {
      "name": "Honda e",
      "category": "muv"
    },
    {
      "name": "Prologue",
      "category": "muv"
    },
    {
      "name": "City e:HEV",
      "category": "muv"
    },
    {
      "name": "Accord Hybrid",
      "category": "muv"
    },
    {
      "name": "CR-V Hybrid",
      "category": "muv"
    },
    {
      "name": "3. Nissan",
      "category": "muv"
    },
    {
      "name": "Micra",
      "category": "hatchback"
    },
    {
      "name": "Note",
      "category": "hatchback"
    },
    {
      "name": "Leaf",
      "category": "hatchback"
    },
    {
      "name": "Sunny",
      "category": "sedan"
    },
    {
      "name": "Versa",
      "category": "sedan"
    },
    {
      "name": "Sentra",
      "category": "sedan"
    },
    {
      "name": "Altima",
      "category": "sedan"
    },
    {
      "name": "Maxima",
      "category": "sedan"
    },
    {
      "name": "Magnite",
      "category": "suv"
    },
    {
      "name": "Kicks",
      "category": "suv"
    },
    {
      "name": "X-Trail",
      "category": "suv"
    },
    {
      "name": "Rogue",
      "category": "suv"
    },
    {
      "name": "Pathfinder",
      "category": "suv"
    },
    {
      "name": "Patrol",
      "category": "suv"
    },
    {
      "name": "Armada",
      "category": "suv"
    },
    {
      "name": "Navara",
      "category": "suv"
    },
    {
      "name": "Frontier",
      "category": "suv"
    },
    {
      "name": "Titan",
      "category": "suv"
    },
    {
      "name": "GT-R",
      "category": "suv"
    },
    {
      "name": "Z",
      "category": "suv"
    },
    {
      "name": "Ariya",
      "category": "suv"
    },
    {
      "name": "4. Mitsubishi",
      "category": "suv"
    },
    {
      "name": "Mirage",
      "category": "hatchback"
    },
    {
      "name": "Lancer",
      "category": "sedan"
    },
    {
      "name": "Attrage",
      "category": "sedan"
    },
    {
      "name": "ASX",
      "category": "suv"
    },
    {
      "name": "Eclipse Cross",
      "category": "suv"
    },
    {
      "name": "Outlander",
      "category": "suv"
    },
    {
      "name": "Pajero Sport",
      "category": "suv"
    },
    {
      "name": "Montero",
      "category": "suv"
    },
    {
      "name": "Triton (L200)",
      "category": "suv"
    },
    {
      "name": "Xpander",
      "category": "muv"
    },
    {
      "name": "Electric / Hybrid",
      "category": "muv"
    },
    {
      "name": "Outlander PHEV",
      "category": "muv"
    },
    {
      "name": "5. Mazda",
      "category": "muv"
    },
    {
      "name": "Mazda2",
      "category": "hatchback"
    },
    {
      "name": "Mazda3",
      "category": "hatchback"
    },
    {
      "name": "Mazda3 Sedan",
      "category": "sedan"
    },
    {
      "name": "Mazda6",
      "category": "sedan"
    },
    {
      "name": "CX-3",
      "category": "suv"
    },
    {
      "name": "CX-30",
      "category": "suv"
    },
    {
      "name": "CX-5",
      "category": "suv"
    },
    {
      "name": "CX-50",
      "category": "suv"
    },
    {
      "name": "CX-60",
      "category": "suv"
    },
    {
      "name": "CX-70",
      "category": "suv"
    },
    {
      "name": "CX-80",
      "category": "suv"
    },
    {
      "name": "CX-90",
      "category": "suv"
    },
    {
      "name": "MX-5 Miata",
      "category": "suv"
    },
    {
      "name": "RX-8",
      "category": "suv"
    },
    {
      "name": "BT-50",
      "category": "suv"
    },
    {
      "name": "MX-30 EV",
      "category": "suv"
    },
    {
      "name": "6. Suzuki",
      "category": "suv"
    },
    {
      "name": "Alto",
      "category": "hatchback"
    },
    {
      "name": "Celerio",
      "category": "hatchback"
    },
    {
      "name": "Wagon R",
      "category": "hatchback"
    },
    {
      "name": "Swift",
      "category": "hatchback"
    },
    {
      "name": "Baleno",
      "category": "hatchback"
    },
    {
      "name": "Ignis",
      "category": "hatchback"
    },
    {
      "name": "S-Presso",
      "category": "hatchback"
    },
    {
      "name": "Dzire",
      "category": "sedan"
    },
    {
      "name": "Ciaz",
      "category": "sedan"
    },
    {
      "name": "Brezza",
      "category": "suv"
    },
    {
      "name": "Fronx",
      "category": "suv"
    },
    {
      "name": "Grand Vitara",
      "category": "suv"
    },
    {
      "name": "Jimny",
      "category": "suv"
    },
    {
      "name": "Vitara",
      "category": "suv"
    },
    {
      "name": "Ertiga",
      "category": "muv"
    },
    {
      "name": "XL6",
      "category": "muv"
    },
    {
      "name": "Invicto",
      "category": "muv"
    },
    {
      "name": "Van",
      "category": "muv"
    },
    {
      "name": "Eeco",
      "category": "muv"
    },
    {
      "name": "Super Carry",
      "category": "suv"
    },
    {
      "name": "Grand Vitara Hybrid",
      "category": "suv"
    },
    {
      "name": "Invicto Hybrid",
      "category": "suv"
    },
    {
      "name": "7. Subaru",
      "category": "suv"
    },
    {
      "name": "Legacy",
      "category": "sedan"
    },
    {
      "name": "WRX",
      "category": "sedan"
    },
    {
      "name": "Impreza",
      "category": "hatchback"
    },
    {
      "name": "Crosstrek",
      "category": "suv"
    },
    {
      "name": "Forester",
      "category": "suv"
    },
    {
      "name": "Outback",
      "category": "suv"
    },
    {
      "name": "Ascent",
      "category": "suv"
    },
    {
      "name": "Solterra",
      "category": "suv"
    },
    {
      "name": "BRZ",
      "category": "suv"
    },
    {
      "name": "8. Lexus",
      "category": "suv"
    },
    {
      "name": "ES",
      "category": "sedan"
    },
    {
      "name": "IS",
      "category": "sedan"
    },
    {
      "name": "LS",
      "category": "sedan"
    },
    {
      "name": "UX",
      "category": "suv"
    },
    {
      "name": "NX",
      "category": "suv"
    },
    {
      "name": "RX",
      "category": "suv"
    },
    {
      "name": "GX",
      "category": "suv"
    },
    {
      "name": "LX",
      "category": "suv"
    },
    {
      "name": "TX",
      "category": "suv"
    },
    {
      "name": "RC",
      "category": "luxury"
    },
    {
      "name": "LC",
      "category": "luxury"
    },
    {
      "name": "LM",
      "category": "muv"
    },
    {
      "name": "RZ",
      "category": "muv"
    },
    {
      "name": "ES Hybrid",
      "category": "muv"
    },
    {
      "name": "NX Hybrid",
      "category": "muv"
    },
    {
      "name": "RX Hybrid",
      "category": "muv"
    },
    {
      "name": "LS Hybrid",
      "category": "muv"
    },
    {
      "name": "9. Infiniti",
      "category": "muv"
    },
    {
      "name": "Q50",
      "category": "sedan"
    },
    {
      "name": "Q70",
      "category": "sedan"
    },
    {
      "name": "Q60",
      "category": "luxury"
    },
    {
      "name": "QX50",
      "category": "suv"
    },
    {
      "name": "QX55",
      "category": "suv"
    },
    {
      "name": "QX60",
      "category": "suv"
    },
    {
      "name": "QX80",
      "category": "suv"
    },
    {
      "name": "Upcoming EV lineup",
      "category": "suv"
    },
    {
      "name": "10. Daihatsu",
      "category": "suv"
    },
    {
      "name": "Ayla",
      "category": "hatchback"
    },
    {
      "name": "Sirion",
      "category": "hatchback"
    },
    {
      "name": "Mira",
      "category": "hatchback"
    },
    {
      "name": "Rocky",
      "category": "suv"
    },
    {
      "name": "Terios",
      "category": "suv"
    },
    {
      "name": "Sigra",
      "category": "muv"
    },
    {
      "name": "Luxio",
      "category": "muv"
    },
    {
      "name": "Mini Truck",
      "category": "muv"
    },
    {
      "name": "Hijet",
      "category": "muv"
    },
    {
      "name": "Gran Max",
      "category": "muv"
    },
    {
      "name": "11. Isuzu",
      "category": "muv"
    },
    {
      "name": "MU-X",
      "category": "suv"
    },
    {
      "name": "D-Max",
      "category": "suv"
    },
    {
      "name": "V-Cross",
      "category": "suv"
    },
    {
      "name": "Commercial",
      "category": "suv"
    },
    {
      "name": "N-Series",
      "category": "suv"
    },
    {
      "name": "F-Series",
      "category": "suv"
    },
    {
      "name": "ELF Trucks",
      "category": "suv"
    },
    {
      "name": "12. Acura",
      "category": "suv"
    },
    {
      "name": "Integra",
      "category": "sedan"
    },
    {
      "name": "TLX",
      "category": "sedan"
    },
    {
      "name": "RDX",
      "category": "suv"
    },
    {
      "name": "MDX",
      "category": "suv"
    },
    {
      "name": "ZDX",
      "category": "suv"
    },
    {
      "name": "ZDX EV",
      "category": "suv"
    }
  ],
  "Mercedes-Benz": [
    {
      "name": "A-Class",
      "category": "hatchback"
    },
    {
      "name": "B-Class",
      "category": "hatchback"
    },
    {
      "name": "A-Class Sedan",
      "category": "sedan"
    },
    {
      "name": "C-Class",
      "category": "sedan"
    },
    {
      "name": "E-Class",
      "category": "sedan"
    },
    {
      "name": "S-Class",
      "category": "sedan"
    },
    {
      "name": "CLA",
      "category": "sedan"
    },
    {
      "name": "EQE Sedan",
      "category": "sedan"
    },
    {
      "name": "EQS Sedan",
      "category": "sedan"
    },
    {
      "name": "CLA Coupe",
      "category": "luxury"
    },
    {
      "name": "CLE Coupe",
      "category": "luxury"
    },
    {
      "name": "AMG GT Coupe",
      "category": "luxury"
    },
    {
      "name": "Convertible / Cabriolet",
      "category": "luxury"
    },
    {
      "name": "CLE Cabriolet",
      "category": "luxury"
    },
    {
      "name": "AMG SL Roadster",
      "category": "luxury"
    },
    {
      "name": "GLA",
      "category": "suv"
    },
    {
      "name": "GLB",
      "category": "suv"
    },
    {
      "name": "GLC",
      "category": "suv"
    },
    {
      "name": "GLE",
      "category": "suv"
    },
    {
      "name": "GLS",
      "category": "suv"
    },
    {
      "name": "G-Class",
      "category": "suv"
    },
    {
      "name": "Coupe SUV",
      "category": "suv"
    },
    {
      "name": "GLC Coupe",
      "category": "suv"
    },
    {
      "name": "GLE Coupe",
      "category": "suv"
    },
    {
      "name": "MPV / Van",
      "category": "suv"
    },
    {
      "name": "V-Class",
      "category": "suv"
    },
    {
      "name": "EQV",
      "category": "suv"
    },
    {
      "name": "Sprinter",
      "category": "suv"
    },
    {
      "name": "Vito",
      "category": "suv"
    },
    {
      "name": "X-Class",
      "category": "suv"
    },
    {
      "name": "Electric Vehicle (EV)",
      "category": "suv"
    },
    {
      "name": "EQA",
      "category": "suv"
    },
    {
      "name": "EQB",
      "category": "suv"
    },
    {
      "name": "EQE SUV",
      "category": "suv"
    },
    {
      "name": "EQS SUV",
      "category": "suv"
    },
    {
      "name": "Performance (AMG)",
      "category": "suv"
    },
    {
      "name": "AMG A45",
      "category": "suv"
    },
    {
      "name": "AMG C63",
      "category": "suv"
    },
    {
      "name": "AMG E53",
      "category": "suv"
    },
    {
      "name": "AMG GT",
      "category": "suv"
    },
    {
      "name": "AMG G63",
      "category": "suv"
    },
    {
      "name": "2. BMW",
      "category": "suv"
    },
    {
      "name": "1 Series",
      "category": "hatchback"
    },
    {
      "name": "2 Series Gran Coupe",
      "category": "sedan"
    },
    {
      "name": "3 Series",
      "category": "sedan"
    },
    {
      "name": "5 Series",
      "category": "sedan"
    },
    {
      "name": "7 Series",
      "category": "sedan"
    },
    {
      "name": "i4",
      "category": "sedan"
    },
    {
      "name": "i5",
      "category": "sedan"
    },
    {
      "name": "i7",
      "category": "sedan"
    },
    {
      "name": "2 Series Coupe",
      "category": "luxury"
    },
    {
      "name": "4 Series Coupe",
      "category": "luxury"
    },
    {
      "name": "8 Series Coupe",
      "category": "luxury"
    },
    {
      "name": "M2",
      "category": "luxury"
    },
    {
      "name": "M4",
      "category": "luxury"
    },
    {
      "name": "M8",
      "category": "luxury"
    },
    {
      "name": "Z4 Roadster",
      "category": "luxury"
    },
    {
      "name": "4 Series Convertible",
      "category": "luxury"
    },
    {
      "name": "8 Series Convertible",
      "category": "luxury"
    },
    {
      "name": "X1",
      "category": "suv"
    },
    {
      "name": "X2",
      "category": "suv"
    },
    {
      "name": "X3",
      "category": "suv"
    },
    {
      "name": "X4",
      "category": "suv"
    },
    {
      "name": "X5",
      "category": "suv"
    },
    {
      "name": "X6",
      "category": "suv"
    },
    {
      "name": "X7",
      "category": "suv"
    },
    {
      "name": "Electric SUV",
      "category": "suv"
    },
    {
      "name": "iX1",
      "category": "suv"
    },
    {
      "name": "iX2",
      "category": "suv"
    },
    {
      "name": "iX3",
      "category": "suv"
    },
    {
      "name": "iX",
      "category": "suv"
    },
    {
      "name": "Wagon / Touring",
      "category": "suv"
    },
    {
      "name": "3 Series Touring",
      "category": "suv"
    },
    {
      "name": "5 Series Touring",
      "category": "suv"
    },
    {
      "name": "Performance (M)",
      "category": "suv"
    },
    {
      "name": "M3",
      "category": "suv"
    },
    {
      "name": "M5",
      "category": "suv"
    },
    {
      "name": "XM",
      "category": "suv"
    },
    {
      "name": "3. Audi",
      "category": "suv"
    },
    {
      "name": "A1",
      "category": "hatchback"
    },
    {
      "name": "A3 Sportback",
      "category": "hatchback"
    },
    {
      "name": "A3 Sedan",
      "category": "sedan"
    },
    {
      "name": "A4",
      "category": "sedan"
    },
    {
      "name": "A5",
      "category": "sedan"
    },
    {
      "name": "A6",
      "category": "sedan"
    },
    {
      "name": "A7",
      "category": "sedan"
    },
    {
      "name": "A8",
      "category": "sedan"
    },
    {
      "name": "e-tron GT",
      "category": "sedan"
    },
    {
      "name": "TT Coupe",
      "category": "luxury"
    },
    {
      "name": "R8 Coupe",
      "category": "luxury"
    },
    {
      "name": "A5 Cabriolet",
      "category": "luxury"
    },
    {
      "name": "TT Roadster",
      "category": "luxury"
    },
    {
      "name": "R8 Spyder",
      "category": "luxury"
    },
    {
      "name": "Q2",
      "category": "suv"
    },
    {
      "name": "Q3",
      "category": "suv"
    },
    {
      "name": "Q5",
      "category": "suv"
    },
    {
      "name": "Q7",
      "category": "suv"
    },
    {
      "name": "Q8",
      "category": "suv"
    },
    {
      "name": "Q4 e-tron",
      "category": "suv"
    },
    {
      "name": "Q6 e-tron",
      "category": "suv"
    },
    {
      "name": "Q8 e-tron",
      "category": "suv"
    },
    {
      "name": "Wagon",
      "category": "suv"
    },
    {
      "name": "A4 Avant",
      "category": "suv"
    },
    {
      "name": "A6 Avant",
      "category": "suv"
    },
    {
      "name": "RS6 Avant",
      "category": "suv"
    },
    {
      "name": "Performance (RS)",
      "category": "suv"
    },
    {
      "name": "RS3",
      "category": "suv"
    },
    {
      "name": "RS4",
      "category": "suv"
    },
    {
      "name": "RS5",
      "category": "suv"
    },
    {
      "name": "RS6",
      "category": "suv"
    },
    {
      "name": "RS7",
      "category": "suv"
    },
    {
      "name": "RS Q8",
      "category": "suv"
    },
    {
      "name": "4. Volkswagen",
      "category": "suv"
    },
    {
      "name": "Polo",
      "category": "hatchback"
    },
    {
      "name": "Golf",
      "category": "hatchback"
    },
    {
      "name": "ID.3",
      "category": "hatchback"
    },
    {
      "name": "Up",
      "category": "hatchback"
    },
    {
      "name": "Virtus",
      "category": "sedan"
    },
    {
      "name": "Jetta",
      "category": "sedan"
    },
    {
      "name": "Passat",
      "category": "sedan"
    },
    {
      "name": "Arteon",
      "category": "sedan"
    },
    {
      "name": "Taigun",
      "category": "suv"
    },
    {
      "name": "Tiguan",
      "category": "suv"
    },
    {
      "name": "Touareg",
      "category": "suv"
    },
    {
      "name": "T-Roc",
      "category": "suv"
    },
    {
      "name": "Atlas",
      "category": "suv"
    },
    {
      "name": "Touran",
      "category": "muv"
    },
    {
      "name": "Multivan",
      "category": "muv"
    },
    {
      "name": "Van",
      "category": "muv"
    },
    {
      "name": "Transporter",
      "category": "muv"
    },
    {
      "name": "Caddy",
      "category": "muv"
    },
    {
      "name": "Crafter",
      "category": "muv"
    },
    {
      "name": "Amarok",
      "category": "suv"
    },
    {
      "name": "Electric",
      "category": "suv"
    },
    {
      "name": "ID.4",
      "category": "suv"
    },
    {
      "name": "ID.5",
      "category": "suv"
    },
    {
      "name": "ID.7",
      "category": "suv"
    },
    {
      "name": "ID.Buzz",
      "category": "suv"
    },
    {
      "name": "Performance (GTI/R)",
      "category": "suv"
    },
    {
      "name": "Golf GTI",
      "category": "suv"
    },
    {
      "name": "Golf R",
      "category": "suv"
    },
    {
      "name": "5. Porsche",
      "category": "suv"
    },
    {
      "name": "718 Cayman",
      "category": "luxury"
    },
    {
      "name": "911",
      "category": "luxury"
    },
    {
      "name": "718 Boxster",
      "category": "luxury"
    },
    {
      "name": "911 Cabriolet",
      "category": "luxury"
    },
    {
      "name": "Panamera",
      "category": "sedan"
    },
    {
      "name": "Taycan",
      "category": "sedan"
    },
    {
      "name": "Macan",
      "category": "suv"
    },
    {
      "name": "Cayenne",
      "category": "suv"
    },
    {
      "name": "Macan Electric",
      "category": "suv"
    },
    {
      "name": "6. Opel",
      "category": "suv"
    },
    {
      "name": "Corsa",
      "category": "hatchback"
    },
    {
      "name": "Astra",
      "category": "hatchback"
    },
    {
      "name": "Astra Sedan",
      "category": "sedan"
    },
    {
      "name": "Insignia",
      "category": "sedan"
    },
    {
      "name": "Mokka",
      "category": "suv"
    },
    {
      "name": "Grandland",
      "category": "suv"
    },
    {
      "name": "Crossland",
      "category": "suv"
    },
    {
      "name": "Astra Sports Tourer",
      "category": "suv"
    },
    {
      "name": "Insignia Sports Tourer",
      "category": "suv"
    },
    {
      "name": "Combo",
      "category": "suv"
    },
    {
      "name": "Vivaro",
      "category": "suv"
    },
    {
      "name": "Movano",
      "category": "suv"
    },
    {
      "name": "Corsa Electric",
      "category": "suv"
    },
    {
      "name": "Astra Electric",
      "category": "suv"
    },
    {
      "name": "Mokka Electric",
      "category": "suv"
    },
    {
      "name": "7. MINI",
      "category": "suv"
    },
    {
      "name": "Cooper 3 Door",
      "category": "hatchback"
    },
    {
      "name": "Cooper 5 Door",
      "category": "hatchback"
    },
    {
      "name": "MINI Convertible",
      "category": "luxury"
    },
    {
      "name": "Countryman",
      "category": "suv"
    },
    {
      "name": "Aceman",
      "category": "suv"
    },
    {
      "name": "Cooper Electric",
      "category": "suv"
    },
    {
      "name": "Countryman Electric",
      "category": "suv"
    },
    {
      "name": "Aceman Electric",
      "category": "suv"
    },
    {
      "name": "Performance (John Cooper Works)",
      "category": "suv"
    },
    {
      "name": "JCW Hatch",
      "category": "suv"
    },
    {
      "name": "JCW Countryman",
      "category": "suv"
    },
    {
      "name": "8. Smart",
      "category": "suv"
    },
    {
      "name": "Fortwo",
      "category": "hatchback"
    },
    {
      "name": "Smart #1",
      "category": "suv"
    },
    {
      "name": "Smart #3",
      "category": "suv"
    },
    {
      "name": "Smart #5",
      "category": "suv"
    },
    {
      "name": "Fortwo Electric",
      "category": "suv"
    },
    {
      "name": "#1",
      "category": "suv"
    },
    {
      "name": "#3",
      "category": "suv"
    },
    {
      "name": "#5",
      "category": "suv"
    },
    {
      "name": "9. Maybach",
      "category": "suv"
    },
    {
      "name": "Mercedes-Maybach S-Class",
      "category": "luxury"
    },
    {
      "name": "Mercedes-Maybach GLS",
      "category": "luxury"
    },
    {
      "name": "Electric Luxury",
      "category": "luxury"
    },
    {
      "name": "Mercedes-Maybach EQS SUV",
      "category": "luxury"
    },
    {
      "name": "10. Alpina",
      "category": "luxury"
    },
    {
      "name": "B3",
      "category": "luxury"
    },
    {
      "name": "B5",
      "category": "luxury"
    },
    {
      "name": "B7",
      "category": "luxury"
    },
    {
      "name": "Luxury Wagon",
      "category": "luxury"
    },
    {
      "name": "B3 Touring",
      "category": "luxury"
    },
    {
      "name": "D3 Touring",
      "category": "luxury"
    },
    {
      "name": "XB7",
      "category": "luxury"
    },
    {
      "name": "XD3",
      "category": "luxury"
    },
    {
      "name": "11. MAN",
      "category": "luxury"
    },
    {
      "name": "MAN TGE",
      "category": "luxury"
    },
    {
      "name": "TGL",
      "category": "suv"
    },
    {
      "name": "TGM",
      "category": "suv"
    },
    {
      "name": "TGS",
      "category": "suv"
    },
    {
      "name": "TGX",
      "category": "suv"
    },
    {
      "name": "Bus",
      "category": "suv"
    },
    {
      "name": "Lion's Coach",
      "category": "suv"
    },
    {
      "name": "Lion's City",
      "category": "suv"
    },
    {
      "name": "Lion's Intercity",
      "category": "suv"
    },
    {
      "name": "Electric Commercial",
      "category": "suv"
    },
    {
      "name": "eTGE",
      "category": "suv"
    },
    {
      "name": "eTruck",
      "category": "suv"
    },
    {
      "name": "Electric Bus",
      "category": "suv"
    },
    {
      "name": "12. Borgward",
      "category": "suv"
    },
    {
      "name": "BX3",
      "category": "suv"
    },
    {
      "name": "BX5",
      "category": "suv"
    },
    {
      "name": "BX7",
      "category": "suv"
    },
    {
      "name": "BXi7",
      "category": "suv"
    }
  ],
  "Ford": [
    {
      "name": "Fiesta",
      "category": "hatchback"
    },
    {
      "name": "Focus",
      "category": "hatchback"
    },
    {
      "name": "Aspire",
      "category": "sedan"
    },
    {
      "name": "Fusion",
      "category": "sedan"
    },
    {
      "name": "Taurus",
      "category": "sedan"
    },
    {
      "name": "EcoSport",
      "category": "suv"
    },
    {
      "name": "Escape",
      "category": "suv"
    },
    {
      "name": "Edge",
      "category": "suv"
    },
    {
      "name": "Explorer",
      "category": "suv"
    },
    {
      "name": "Expedition",
      "category": "suv"
    },
    {
      "name": "Bronco",
      "category": "suv"
    },
    {
      "name": "Bronco Sport",
      "category": "suv"
    },
    {
      "name": "Pickup Truck",
      "category": "suv"
    },
    {
      "name": "Maverick",
      "category": "suv"
    },
    {
      "name": "Ranger",
      "category": "suv"
    },
    {
      "name": "F-150",
      "category": "suv"
    },
    {
      "name": "F-250",
      "category": "suv"
    },
    {
      "name": "F-350",
      "category": "suv"
    },
    {
      "name": "F-450",
      "category": "suv"
    },
    {
      "name": "Sports Car",
      "category": "suv"
    },
    {
      "name": "Mustang",
      "category": "suv"
    },
    {
      "name": "Mustang Dark Horse",
      "category": "suv"
    },
    {
      "name": "GT",
      "category": "suv"
    },
    {
      "name": "Van",
      "category": "suv"
    },
    {
      "name": "Transit",
      "category": "suv"
    },
    {
      "name": "Transit Connect",
      "category": "suv"
    },
    {
      "name": "E-Series",
      "category": "suv"
    },
    {
      "name": "Electric Vehicle (EV)",
      "category": "suv"
    },
    {
      "name": "Mustang Mach-E",
      "category": "suv"
    },
    {
      "name": "F-150 Lightning",
      "category": "suv"
    },
    {
      "name": "E-Transit",
      "category": "suv"
    },
    {
      "name": "Hybrid",
      "category": "suv"
    },
    {
      "name": "Escape Hybrid",
      "category": "suv"
    },
    {
      "name": "Maverick Hybrid",
      "category": "suv"
    },
    {
      "name": "F-150 Hybrid",
      "category": "suv"
    },
    {
      "name": "2. Chevrolet",
      "category": "suv"
    },
    {
      "name": "Spark",
      "category": "hatchback"
    },
    {
      "name": "Bolt EV",
      "category": "hatchback"
    },
    {
      "name": "Aveo",
      "category": "sedan"
    },
    {
      "name": "Cruze",
      "category": "sedan"
    },
    {
      "name": "Malibu",
      "category": "sedan"
    },
    {
      "name": "Trax",
      "category": "suv"
    },
    {
      "name": "Trailblazer",
      "category": "suv"
    },
    {
      "name": "Equinox",
      "category": "suv"
    },
    {
      "name": "Blazer",
      "category": "suv"
    },
    {
      "name": "Traverse",
      "category": "suv"
    },
    {
      "name": "Tahoe",
      "category": "suv"
    },
    {
      "name": "Suburban",
      "category": "suv"
    },
    {
      "name": "Colorado",
      "category": "suv"
    },
    {
      "name": "Silverado 1500",
      "category": "suv"
    },
    {
      "name": "Silverado HD",
      "category": "suv"
    },
    {
      "name": "Camaro",
      "category": "suv"
    },
    {
      "name": "Corvette",
      "category": "suv"
    },
    {
      "name": "Express Cargo",
      "category": "suv"
    },
    {
      "name": "Express Passenger",
      "category": "suv"
    },
    {
      "name": "Bolt EUV",
      "category": "suv"
    },
    {
      "name": "Equinox EV",
      "category": "suv"
    },
    {
      "name": "Blazer EV",
      "category": "suv"
    },
    {
      "name": "Silverado EV",
      "category": "suv"
    },
    {
      "name": "3. Tesla",
      "category": "suv"
    },
    {
      "name": "Model 3",
      "category": "sedan"
    },
    {
      "name": "Model S",
      "category": "sedan"
    },
    {
      "name": "Model Y",
      "category": "suv"
    },
    {
      "name": "Model X",
      "category": "suv"
    },
    {
      "name": "Cybertruck",
      "category": "suv"
    },
    {
      "name": "Roadster (Upcoming)",
      "category": "suv"
    },
    {
      "name": "Entire Tesla lineup",
      "category": "suv"
    },
    {
      "name": "4. Jeep",
      "category": "suv"
    },
    {
      "name": "Compact SUV",
      "category": "suv"
    },
    {
      "name": "Renegade",
      "category": "suv"
    },
    {
      "name": "Compass",
      "category": "suv"
    },
    {
      "name": "Cherokee",
      "category": "suv"
    },
    {
      "name": "Grand Cherokee",
      "category": "suv"
    },
    {
      "name": "Wrangler",
      "category": "suv"
    },
    {
      "name": "Wagoneer",
      "category": "suv"
    },
    {
      "name": "Grand Wagoneer",
      "category": "suv"
    },
    {
      "name": "Gladiator SUV",
      "category": "suv"
    },
    {
      "name": "Gladiator",
      "category": "suv"
    },
    {
      "name": "Electric / Hybrid",
      "category": "suv"
    },
    {
      "name": "Wrangler 4xe",
      "category": "suv"
    },
    {
      "name": "Grand Cherokee 4xe",
      "category": "suv"
    },
    {
      "name": "Wagoneer S EV",
      "category": "suv"
    },
    {
      "name": "5. Dodge",
      "category": "suv"
    },
    {
      "name": "Charger",
      "category": "sedan"
    },
    {
      "name": "Challenger",
      "category": "luxury"
    },
    {
      "name": "Durango",
      "category": "suv"
    },
    {
      "name": "Hornet",
      "category": "suv"
    },
    {
      "name": "Muscle Car",
      "category": "suv"
    },
    {
      "name": "Challenger SRT",
      "category": "suv"
    },
    {
      "name": "Charger SRT",
      "category": "suv"
    },
    {
      "name": "Electric",
      "category": "suv"
    },
    {
      "name": "Charger Daytona EV",
      "category": "suv"
    },
    {
      "name": "6. Chrysler",
      "category": "suv"
    },
    {
      "name": "300",
      "category": "sedan"
    },
    {
      "name": "MPV / Minivan",
      "category": "sedan"
    },
    {
      "name": "Pacifica",
      "category": "sedan"
    },
    {
      "name": "Voyager",
      "category": "sedan"
    },
    {
      "name": "Pacifica Plug-in Hybrid",
      "category": "sedan"
    },
    {
      "name": "7. Cadillac",
      "category": "sedan"
    },
    {
      "name": "CT4",
      "category": "sedan"
    },
    {
      "name": "CT5",
      "category": "sedan"
    },
    {
      "name": "Celestiq",
      "category": "sedan"
    },
    {
      "name": "XT4",
      "category": "suv"
    },
    {
      "name": "XT5",
      "category": "suv"
    },
    {
      "name": "XT6",
      "category": "suv"
    },
    {
      "name": "Escalade",
      "category": "suv"
    },
    {
      "name": "Escalade IQ",
      "category": "suv"
    },
    {
      "name": "Lyriq",
      "category": "suv"
    },
    {
      "name": "Optiq",
      "category": "suv"
    },
    {
      "name": "Vistiq",
      "category": "suv"
    },
    {
      "name": "Performance",
      "category": "suv"
    },
    {
      "name": "CT4-V",
      "category": "suv"
    },
    {
      "name": "CT5-V Blackwing",
      "category": "suv"
    },
    {
      "name": "8. GMC",
      "category": "suv"
    },
    {
      "name": "Terrain",
      "category": "suv"
    },
    {
      "name": "Acadia",
      "category": "suv"
    },
    {
      "name": "Yukon",
      "category": "suv"
    },
    {
      "name": "Canyon",
      "category": "suv"
    },
    {
      "name": "Sierra 1500",
      "category": "suv"
    },
    {
      "name": "Sierra HD",
      "category": "suv"
    },
    {
      "name": "Savana",
      "category": "suv"
    },
    {
      "name": "Sierra EV",
      "category": "suv"
    },
    {
      "name": "Hummer EV SUV",
      "category": "suv"
    },
    {
      "name": "Hummer EV Pickup",
      "category": "suv"
    },
    {
      "name": "9. Lincoln",
      "category": "suv"
    },
    {
      "name": "Continental",
      "category": "sedan"
    },
    {
      "name": "Corsair",
      "category": "suv"
    },
    {
      "name": "Nautilus",
      "category": "suv"
    },
    {
      "name": "Aviator",
      "category": "suv"
    },
    {
      "name": "Navigator",
      "category": "suv"
    },
    {
      "name": "Corsair Grand Touring",
      "category": "suv"
    },
    {
      "name": "10. Buick",
      "category": "suv"
    },
    {
      "name": "LaCrosse",
      "category": "sedan"
    },
    {
      "name": "Regal",
      "category": "sedan"
    },
    {
      "name": "Encore GX",
      "category": "suv"
    },
    {
      "name": "Envista",
      "category": "suv"
    },
    {
      "name": "Envision",
      "category": "suv"
    },
    {
      "name": "Enclave",
      "category": "suv"
    },
    {
      "name": "Wagon",
      "category": "suv"
    },
    {
      "name": "Regal TourX",
      "category": "suv"
    },
    {
      "name": "11. RAM",
      "category": "suv"
    },
    {
      "name": "RAM 1500",
      "category": "suv"
    },
    {
      "name": "RAM 2500",
      "category": "suv"
    },
    {
      "name": "RAM 3500",
      "category": "suv"
    },
    {
      "name": "RAM Chassis Cab",
      "category": "suv"
    },
    {
      "name": "ProMaster",
      "category": "suv"
    },
    {
      "name": "ProMaster City",
      "category": "suv"
    },
    {
      "name": "RAM 1500 REV",
      "category": "suv"
    },
    {
      "name": "12. Rivian",
      "category": "suv"
    },
    {
      "name": "R1S",
      "category": "suv"
    },
    {
      "name": "R1T",
      "category": "suv"
    },
    {
      "name": "Electric Vehicle",
      "category": "suv"
    },
    {
      "name": "Entire Rivian lineup",
      "category": "suv"
    },
    {
      "name": "Commercial Van",
      "category": "suv"
    },
    {
      "name": "EDV (Electric Delivery Van)",
      "category": "suv"
    },
    {
      "name": "13. Lucid Motors",
      "category": "suv"
    },
    {
      "name": "Lucid Air",
      "category": "luxury"
    },
    {
      "name": "Lucid Gravity",
      "category": "luxury"
    },
    {
      "name": "Entire Lucid lineup",
      "category": "luxury"
    },
    {
      "name": "14. Fisker",
      "category": "luxury"
    },
    {
      "name": "Fisker Ocean",
      "category": "suv"
    },
    {
      "name": "Fisker Pear",
      "category": "suv"
    },
    {
      "name": "Fisker Alaska",
      "category": "suv"
    },
    {
      "name": "Alaska",
      "category": "suv"
    },
    {
      "name": "Entire Fisker lineup",
      "category": "suv"
    },
    {
      "name": "15. Hummer",
      "category": "suv"
    },
    {
      "name": "Entire Hummer EV lineup",
      "category": "suv"
    },
    {
      "name": "16. Pontiac",
      "category": "suv"
    },
    {
      "name": "Vibe",
      "category": "hatchback"
    },
    {
      "name": "G6",
      "category": "sedan"
    },
    {
      "name": "G8",
      "category": "sedan"
    },
    {
      "name": "GTO",
      "category": "luxury"
    },
    {
      "name": "Firebird",
      "category": "luxury"
    },
    {
      "name": "Solstice",
      "category": "luxury"
    },
    {
      "name": "Torrent",
      "category": "suv"
    },
    {
      "name": "17. Saturn",
      "category": "suv"
    },
    {
      "name": "Aura",
      "category": "sedan"
    },
    {
      "name": "Ion",
      "category": "sedan"
    },
    {
      "name": "Astra",
      "category": "hatchback"
    },
    {
      "name": "Vue",
      "category": "suv"
    },
    {
      "name": "Outlook",
      "category": "suv"
    },
    {
      "name": "SC",
      "category": "luxury"
    },
    {
      "name": "18. Mercury",
      "category": "luxury"
    },
    {
      "name": "Milan",
      "category": "sedan"
    },
    {
      "name": "Grand Marquis",
      "category": "sedan"
    },
    {
      "name": "Sable",
      "category": "sedan"
    },
    {
      "name": "Mariner",
      "category": "suv"
    },
    {
      "name": "Mountaineer",
      "category": "suv"
    },
    {
      "name": "Cougar",
      "category": "luxury"
    },
    {
      "name": "Villager",
      "category": "luxury"
    }
  ],
  "Jaguar": [
    {
      "name": "XE",
      "category": "sedan"
    },
    {
      "name": "XF",
      "category": "sedan"
    },
    {
      "name": "XJ",
      "category": "sedan"
    },
    {
      "name": "XFR",
      "category": "luxury"
    },
    {
      "name": "XJR",
      "category": "luxury"
    },
    {
      "name": "F-Type Coupe",
      "category": "luxury"
    },
    {
      "name": "F-Type Convertible",
      "category": "luxury"
    },
    {
      "name": "E-PACE",
      "category": "suv"
    },
    {
      "name": "F-PACE",
      "category": "suv"
    },
    {
      "name": "I-PACE",
      "category": "suv"
    },
    {
      "name": "Electric Vehicle (EV)",
      "category": "suv"
    },
    {
      "name": "Sports Car",
      "category": "suv"
    },
    {
      "name": "F-Type R",
      "category": "suv"
    },
    {
      "name": "2. Land Rover",
      "category": "suv"
    },
    {
      "name": "Compact SUV",
      "category": "suv"
    },
    {
      "name": "Discovery Sport",
      "category": "suv"
    },
    {
      "name": "Defender 90",
      "category": "suv"
    },
    {
      "name": "Defender 110",
      "category": "suv"
    },
    {
      "name": "Defender 130",
      "category": "suv"
    },
    {
      "name": "Discovery",
      "category": "suv"
    },
    {
      "name": "Range Rover Velar",
      "category": "luxury"
    },
    {
      "name": "Range Rover Sport",
      "category": "luxury"
    },
    {
      "name": "Range Rover",
      "category": "luxury"
    },
    {
      "name": "Range Rover SV",
      "category": "luxury"
    },
    {
      "name": "Commercial SUV",
      "category": "luxury"
    },
    {
      "name": "Defender Hard Top",
      "category": "luxury"
    },
    {
      "name": "Hybrid",
      "category": "luxury"
    },
    {
      "name": "Defender PHEV",
      "category": "luxury"
    },
    {
      "name": "Discovery PHEV",
      "category": "luxury"
    },
    {
      "name": "3. Range Rover",
      "category": "luxury"
    },
    {
      "name": "Range Rover Evoque",
      "category": "luxury"
    },
    {
      "name": "Performance SUV",
      "category": "luxury"
    },
    {
      "name": "Sport SV",
      "category": "luxury"
    },
    {
      "name": "Range Rover PHEV",
      "category": "luxury"
    },
    {
      "name": "Sport PHEV",
      "category": "luxury"
    },
    {
      "name": "Electric Vehicle (Upcoming)",
      "category": "luxury"
    },
    {
      "name": "Range Rover Electric",
      "category": "luxury"
    },
    {
      "name": "4. Rolls-Royce",
      "category": "luxury"
    },
    {
      "name": "Ghost",
      "category": "luxury"
    },
    {
      "name": "Phantom",
      "category": "luxury"
    },
    {
      "name": "Luxury Coupe",
      "category": "luxury"
    },
    {
      "name": "Wraith",
      "category": "luxury"
    },
    {
      "name": "Spectre",
      "category": "luxury"
    },
    {
      "name": "Luxury Convertible",
      "category": "luxury"
    },
    {
      "name": "Dawn",
      "category": "luxury"
    },
    {
      "name": "Cullinan",
      "category": "luxury"
    },
    {
      "name": "5. Bentley",
      "category": "luxury"
    },
    {
      "name": "Flying Spur",
      "category": "luxury"
    },
    {
      "name": "Continental GT",
      "category": "luxury"
    },
    {
      "name": "Continental GTC",
      "category": "luxury"
    },
    {
      "name": "Bentayga",
      "category": "luxury"
    },
    {
      "name": "Bentayga Hybrid",
      "category": "luxury"
    },
    {
      "name": "Flying Spur Hybrid",
      "category": "luxury"
    },
    {
      "name": "6. Aston Martin",
      "category": "luxury"
    },
    {
      "name": "Vantage Coupe",
      "category": "luxury"
    },
    {
      "name": "DB12 Coupe",
      "category": "luxury"
    },
    {
      "name": "DBS Coupe",
      "category": "luxury"
    },
    {
      "name": "Sports Convertible",
      "category": "luxury"
    },
    {
      "name": "Vantage Roadster",
      "category": "luxury"
    },
    {
      "name": "DB12 Volante",
      "category": "luxury"
    },
    {
      "name": "DBX",
      "category": "luxury"
    },
    {
      "name": "DBX707",
      "category": "luxury"
    },
    {
      "name": "Hypercar",
      "category": "luxury"
    },
    {
      "name": "Valkyrie",
      "category": "luxury"
    },
    {
      "name": "Valhalla",
      "category": "luxury"
    },
    {
      "name": "7. Lotus",
      "category": "luxury"
    },
    {
      "name": "Emira",
      "category": "luxury"
    },
    {
      "name": "Elise",
      "category": "luxury"
    },
    {
      "name": "Exige",
      "category": "luxury"
    },
    {
      "name": "Evora",
      "category": "luxury"
    },
    {
      "name": "Electric SUV",
      "category": "luxury"
    },
    {
      "name": "Eletre",
      "category": "luxury"
    },
    {
      "name": "Electric Sedan",
      "category": "luxury"
    },
    {
      "name": "Emeya",
      "category": "luxury"
    },
    {
      "name": "Evija",
      "category": "luxury"
    },
    {
      "name": "8. McLaren",
      "category": "luxury"
    },
    {
      "name": "GT",
      "category": "luxury"
    },
    {
      "name": "570S",
      "category": "luxury"
    },
    {
      "name": "720S",
      "category": "luxury"
    },
    {
      "name": "750S",
      "category": "luxury"
    },
    {
      "name": "570S Spider",
      "category": "luxury"
    },
    {
      "name": "750S Spider",
      "category": "luxury"
    },
    {
      "name": "Artura Spider",
      "category": "luxury"
    },
    {
      "name": "Supercar",
      "category": "luxury"
    },
    {
      "name": "Artura",
      "category": "luxury"
    },
    {
      "name": "765LT",
      "category": "luxury"
    },
    {
      "name": "P1",
      "category": "luxury"
    },
    {
      "name": "Senna",
      "category": "luxury"
    },
    {
      "name": "Speedtail",
      "category": "luxury"
    },
    {
      "name": "W1",
      "category": "luxury"
    },
    {
      "name": "9. MINI",
      "category": "luxury"
    },
    {
      "name": "Cooper 3 Door",
      "category": "hatchback"
    },
    {
      "name": "Cooper 5 Door",
      "category": "hatchback"
    },
    {
      "name": "MINI Convertible",
      "category": "luxury"
    },
    {
      "name": "SUV / Crossover",
      "category": "luxury"
    },
    {
      "name": "Countryman",
      "category": "luxury"
    },
    {
      "name": "Aceman",
      "category": "luxury"
    },
    {
      "name": "Cooper Electric",
      "category": "luxury"
    },
    {
      "name": "Countryman Electric",
      "category": "luxury"
    },
    {
      "name": "Aceman Electric",
      "category": "luxury"
    },
    {
      "name": "Performance (John Cooper Works)",
      "category": "luxury"
    },
    {
      "name": "JCW Hatch",
      "category": "luxury"
    },
    {
      "name": "JCW Countryman",
      "category": "luxury"
    },
    {
      "name": "10. MG (Morris Garages)",
      "category": "luxury"
    },
    {
      "name": "MG3",
      "category": "hatchback"
    },
    {
      "name": "Comet EV",
      "category": "hatchback"
    },
    {
      "name": "MG5",
      "category": "sedan"
    },
    {
      "name": "Astor",
      "category": "sedan"
    },
    {
      "name": "ZS",
      "category": "sedan"
    },
    {
      "name": "Hector",
      "category": "suv"
    },
    {
      "name": "Hector Plus",
      "category": "suv"
    },
    {
      "name": "Gloster",
      "category": "suv"
    },
    {
      "name": "HS",
      "category": "suv"
    },
    {
      "name": "ZS EV",
      "category": "suv"
    },
    {
      "name": "MG4 EV",
      "category": "suv"
    },
    {
      "name": "Cyberster",
      "category": "suv"
    },
    {
      "name": "11. Vauxhall",
      "category": "suv"
    },
    {
      "name": "Corsa",
      "category": "hatchback"
    },
    {
      "name": "Astra",
      "category": "hatchback"
    },
    {
      "name": "Insignia",
      "category": "sedan"
    },
    {
      "name": "Mokka",
      "category": "suv"
    },
    {
      "name": "Crossland",
      "category": "suv"
    },
    {
      "name": "Grandland",
      "category": "suv"
    },
    {
      "name": "Wagon",
      "category": "suv"
    },
    {
      "name": "Astra Sports Tourer",
      "category": "suv"
    },
    {
      "name": "Insignia Sports Tourer",
      "category": "suv"
    },
    {
      "name": "Van",
      "category": "suv"
    },
    {
      "name": "Combo",
      "category": "suv"
    },
    {
      "name": "Vivaro",
      "category": "suv"
    },
    {
      "name": "Movano",
      "category": "suv"
    },
    {
      "name": "Corsa Electric",
      "category": "suv"
    },
    {
      "name": "Mokka Electric",
      "category": "suv"
    },
    {
      "name": "Astra Electric",
      "category": "suv"
    },
    {
      "name": "Vivaro Electric",
      "category": "suv"
    }
  ],
  "Ferrari": [
    {
      "name": "Roma",
      "category": "luxury"
    },
    {
      "name": "296 GTB",
      "category": "luxury"
    },
    {
      "name": "F8 Tributo",
      "category": "luxury"
    },
    {
      "name": "SF90 Stradale",
      "category": "luxury"
    },
    {
      "name": "12Cilindri Coupe",
      "category": "luxury"
    },
    {
      "name": "Sports Convertible",
      "category": "luxury"
    },
    {
      "name": "Roma Spider",
      "category": "luxury"
    },
    {
      "name": "296 GTS",
      "category": "luxury"
    },
    {
      "name": "SF90 Spider",
      "category": "luxury"
    },
    {
      "name": "12Cilindri Spider",
      "category": "luxury"
    },
    {
      "name": "Grand Tourer (GT)",
      "category": "luxury"
    },
    {
      "name": "GTC4Lusso",
      "category": "luxury"
    },
    {
      "name": "Purosangue",
      "category": "suv"
    },
    {
      "name": "Hypercar",
      "category": "suv"
    },
    {
      "name": "LaFerrari",
      "category": "suv"
    },
    {
      "name": "F80",
      "category": "suv"
    },
    {
      "name": "Hybrid",
      "category": "suv"
    },
    {
      "name": "2. Lamborghini",
      "category": "suv"
    },
    {
      "name": "Hurac\u00e1n",
      "category": "luxury"
    },
    {
      "name": "Temerario",
      "category": "luxury"
    },
    {
      "name": "Revuelto",
      "category": "luxury"
    },
    {
      "name": "Hurac\u00e1n Spyder",
      "category": "luxury"
    },
    {
      "name": "Revuelto Roadster (Upcoming)",
      "category": "luxury"
    },
    {
      "name": "Supercar",
      "category": "luxury"
    },
    {
      "name": "Aventador",
      "category": "luxury"
    },
    {
      "name": "Urus",
      "category": "suv"
    },
    {
      "name": "Urus Performante",
      "category": "suv"
    },
    {
      "name": "Urus SE",
      "category": "suv"
    },
    {
      "name": "Si\u00e1n",
      "category": "suv"
    },
    {
      "name": "Centenario",
      "category": "suv"
    },
    {
      "name": "Veneno",
      "category": "suv"
    },
    {
      "name": "3. Maserati",
      "category": "suv"
    },
    {
      "name": "Ghibli",
      "category": "luxury"
    },
    {
      "name": "Quattroporte",
      "category": "luxury"
    },
    {
      "name": "Grecale",
      "category": "luxury"
    },
    {
      "name": "Levante",
      "category": "luxury"
    },
    {
      "name": "GranTurismo",
      "category": "luxury"
    },
    {
      "name": "GranCabrio",
      "category": "luxury"
    },
    {
      "name": "MC20",
      "category": "luxury"
    },
    {
      "name": "MC20 Cielo",
      "category": "luxury"
    },
    {
      "name": "Electric Vehicle (EV)",
      "category": "luxury"
    },
    {
      "name": "GranTurismo Folgore",
      "category": "luxury"
    },
    {
      "name": "GranCabrio Folgore",
      "category": "luxury"
    },
    {
      "name": "Grecale Folgore",
      "category": "luxury"
    },
    {
      "name": "Ghibli Hybrid",
      "category": "luxury"
    },
    {
      "name": "Grecale Hybrid",
      "category": "luxury"
    },
    {
      "name": "4. Fiat",
      "category": "luxury"
    },
    {
      "name": "Panda",
      "category": "hatchback"
    },
    {
      "name": "Punto",
      "category": "hatchback"
    },
    {
      "name": "500",
      "category": "hatchback"
    },
    {
      "name": "Tipo Hatchback",
      "category": "hatchback"
    },
    {
      "name": "Tipo Sedan",
      "category": "sedan"
    },
    {
      "name": "Linea",
      "category": "sedan"
    },
    {
      "name": "Cronos",
      "category": "sedan"
    },
    {
      "name": "Wagon",
      "category": "sedan"
    },
    {
      "name": "Tipo Station Wagon",
      "category": "sedan"
    },
    {
      "name": "Pulse",
      "category": "suv"
    },
    {
      "name": "Fastback",
      "category": "suv"
    },
    {
      "name": "600",
      "category": "suv"
    },
    {
      "name": "Freemont",
      "category": "suv"
    },
    {
      "name": "Doblo",
      "category": "muv"
    },
    {
      "name": "Ulysse",
      "category": "muv"
    },
    {
      "name": "Van",
      "category": "muv"
    },
    {
      "name": "Fiorino",
      "category": "muv"
    },
    {
      "name": "Ducato",
      "category": "muv"
    },
    {
      "name": "Scudo",
      "category": "muv"
    },
    {
      "name": "Pickup Truck",
      "category": "muv"
    },
    {
      "name": "Strada",
      "category": "muv"
    },
    {
      "name": "Toro",
      "category": "muv"
    },
    {
      "name": "500e",
      "category": "muv"
    },
    {
      "name": "E-Ducato",
      "category": "muv"
    },
    {
      "name": "Topolino",
      "category": "muv"
    },
    {
      "name": "5. Alfa Romeo",
      "category": "muv"
    },
    {
      "name": "Giulia",
      "category": "sedan"
    },
    {
      "name": "Tonale",
      "category": "suv"
    },
    {
      "name": "Stelvio",
      "category": "suv"
    },
    {
      "name": "4C Coupe",
      "category": "luxury"
    },
    {
      "name": "8C Competizione",
      "category": "luxury"
    },
    {
      "name": "4C Spider",
      "category": "luxury"
    },
    {
      "name": "8C Spider",
      "category": "luxury"
    },
    {
      "name": "33 Stradale",
      "category": "luxury"
    },
    {
      "name": "Junior Elettrica",
      "category": "luxury"
    },
    {
      "name": "Tonale Hybrid",
      "category": "luxury"
    },
    {
      "name": "6. Lancia",
      "category": "luxury"
    },
    {
      "name": "Ypsilon",
      "category": "hatchback"
    },
    {
      "name": "Thema",
      "category": "sedan"
    },
    {
      "name": "Delta",
      "category": "sedan"
    },
    {
      "name": "New Ypsilon EV",
      "category": "sedan"
    },
    {
      "name": "Ypsilon Hybrid",
      "category": "sedan"
    },
    {
      "name": "7. Pagani",
      "category": "sedan"
    },
    {
      "name": "Zonda",
      "category": "sedan"
    },
    {
      "name": "Huayra",
      "category": "sedan"
    },
    {
      "name": "Utopia",
      "category": "sedan"
    },
    {
      "name": "Roadster",
      "category": "sedan"
    },
    {
      "name": "Huayra Roadster",
      "category": "sedan"
    },
    {
      "name": "Zonda Roadster",
      "category": "sedan"
    },
    {
      "name": "Huayra Coupe",
      "category": "luxury"
    },
    {
      "name": "Utopia Coupe",
      "category": "luxury"
    },
    {
      "name": "8. Abarth",
      "category": "luxury"
    },
    {
      "name": "Abarth 500",
      "category": "hatchback"
    },
    {
      "name": "Abarth 595",
      "category": "hatchback"
    },
    {
      "name": "Abarth 695",
      "category": "hatchback"
    },
    {
      "name": "Sports Hatchback",
      "category": "hatchback"
    },
    {
      "name": "Abarth Punto",
      "category": "hatchback"
    },
    {
      "name": "Electric Hatchback",
      "category": "hatchback"
    },
    {
      "name": "Abarth 500e",
      "category": "hatchback"
    },
    {
      "name": "Abarth 600e",
      "category": "hatchback"
    }
  ],
  "Renault": [
    {
      "name": "Kwid",
      "category": "hatchback"
    },
    {
      "name": "Clio",
      "category": "hatchback"
    },
    {
      "name": "Megane",
      "category": "hatchback"
    },
    {
      "name": "Sandero (in some markets)",
      "category": "hatchback"
    },
    {
      "name": "Zoe",
      "category": "hatchback"
    },
    {
      "name": "Taliant",
      "category": "sedan"
    },
    {
      "name": "Megane Sedan",
      "category": "sedan"
    },
    {
      "name": "Fluence",
      "category": "sedan"
    },
    {
      "name": "Compact SUV",
      "category": "sedan"
    },
    {
      "name": "Kiger",
      "category": "sedan"
    },
    {
      "name": "Captur",
      "category": "sedan"
    },
    {
      "name": "Duster",
      "category": "suv"
    },
    {
      "name": "Arkana",
      "category": "suv"
    },
    {
      "name": "Koleos",
      "category": "suv"
    },
    {
      "name": "Austral",
      "category": "suv"
    },
    {
      "name": "Rafale",
      "category": "suv"
    },
    {
      "name": "Espace",
      "category": "suv"
    },
    {
      "name": "Triber",
      "category": "muv"
    },
    {
      "name": "Scenic",
      "category": "muv"
    },
    {
      "name": "Van",
      "category": "muv"
    },
    {
      "name": "Kangoo",
      "category": "muv"
    },
    {
      "name": "Trafic",
      "category": "muv"
    },
    {
      "name": "Master",
      "category": "muv"
    },
    {
      "name": "Pickup Truck",
      "category": "muv"
    },
    {
      "name": "Alaskan",
      "category": "muv"
    },
    {
      "name": "Oroch",
      "category": "muv"
    },
    {
      "name": "Electric Vehicle (EV)",
      "category": "muv"
    },
    {
      "name": "Megane E-Tech",
      "category": "muv"
    },
    {
      "name": "Scenic E-Tech",
      "category": "muv"
    },
    {
      "name": "Renault 5 E-Tech",
      "category": "muv"
    },
    {
      "name": "Kangoo E-Tech",
      "category": "muv"
    },
    {
      "name": "Hybrid",
      "category": "muv"
    },
    {
      "name": "Clio E-Tech",
      "category": "muv"
    },
    {
      "name": "Captur E-Tech",
      "category": "muv"
    },
    {
      "name": "Austral E-Tech",
      "category": "muv"
    },
    {
      "name": "Rafale E-Tech",
      "category": "muv"
    },
    {
      "name": "2. Peugeot",
      "category": "muv"
    },
    {
      "name": "108",
      "category": "hatchback"
    },
    {
      "name": "208",
      "category": "hatchback"
    },
    {
      "name": "308",
      "category": "hatchback"
    },
    {
      "name": "301",
      "category": "sedan"
    },
    {
      "name": "408",
      "category": "sedan"
    },
    {
      "name": "508",
      "category": "sedan"
    },
    {
      "name": "Wagon",
      "category": "sedan"
    },
    {
      "name": "308 SW",
      "category": "sedan"
    },
    {
      "name": "508 SW",
      "category": "sedan"
    },
    {
      "name": "2008",
      "category": "sedan"
    },
    {
      "name": "3008",
      "category": "suv"
    },
    {
      "name": "4008",
      "category": "suv"
    },
    {
      "name": "5008",
      "category": "suv"
    },
    {
      "name": "Rifter",
      "category": "muv"
    },
    {
      "name": "Traveller",
      "category": "muv"
    },
    {
      "name": "Partner",
      "category": "muv"
    },
    {
      "name": "Expert",
      "category": "muv"
    },
    {
      "name": "Boxer",
      "category": "muv"
    },
    {
      "name": "Landtrek",
      "category": "muv"
    },
    {
      "name": "e-208",
      "category": "muv"
    },
    {
      "name": "e-2008",
      "category": "muv"
    },
    {
      "name": "e-3008",
      "category": "muv"
    },
    {
      "name": "e-308",
      "category": "muv"
    },
    {
      "name": "e-5008",
      "category": "muv"
    },
    {
      "name": "3008 Hybrid",
      "category": "muv"
    },
    {
      "name": "408 Hybrid",
      "category": "muv"
    },
    {
      "name": "508 Hybrid",
      "category": "muv"
    },
    {
      "name": "3. Citro\u00ebn",
      "category": "muv"
    },
    {
      "name": "C1",
      "category": "hatchback"
    },
    {
      "name": "C3",
      "category": "hatchback"
    },
    {
      "name": "C4",
      "category": "hatchback"
    },
    {
      "name": "C-Elys\u00e9e",
      "category": "sedan"
    },
    {
      "name": "C5 X",
      "category": "sedan"
    },
    {
      "name": "C3 Aircross",
      "category": "sedan"
    },
    {
      "name": "C5 Aircross",
      "category": "suv"
    },
    {
      "name": "Berlingo",
      "category": "muv"
    },
    {
      "name": "SpaceTourer",
      "category": "muv"
    },
    {
      "name": "Berlingo Van",
      "category": "muv"
    },
    {
      "name": "Jumpy",
      "category": "muv"
    },
    {
      "name": "Jumper",
      "category": "muv"
    },
    {
      "name": "e-C3",
      "category": "muv"
    },
    {
      "name": "e-C4",
      "category": "muv"
    },
    {
      "name": "e-Berlingo",
      "category": "muv"
    },
    {
      "name": "e-SpaceTourer",
      "category": "muv"
    },
    {
      "name": "C5 Aircross Hybrid",
      "category": "muv"
    },
    {
      "name": "C5 X Hybrid",
      "category": "muv"
    },
    {
      "name": "4. Bugatti",
      "category": "muv"
    },
    {
      "name": "Hypercar",
      "category": "muv"
    },
    {
      "name": "Veyron",
      "category": "muv"
    },
    {
      "name": "Chiron",
      "category": "muv"
    },
    {
      "name": "Tourbillon",
      "category": "muv"
    },
    {
      "name": "Chiron Coupe",
      "category": "luxury"
    },
    {
      "name": "Tourbillon Coupe",
      "category": "luxury"
    },
    {
      "name": "Roadster",
      "category": "luxury"
    },
    {
      "name": "W16 Mistral",
      "category": "luxury"
    },
    {
      "name": "Super Sport",
      "category": "luxury"
    },
    {
      "name": "Chiron Super Sport",
      "category": "luxury"
    },
    {
      "name": "5. DS Automobiles",
      "category": "luxury"
    },
    {
      "name": "DS 3",
      "category": "hatchback"
    },
    {
      "name": "DS 4",
      "category": "sedan"
    },
    {
      "name": "DS 9",
      "category": "sedan"
    },
    {
      "name": "DS 3 Crossback",
      "category": "sedan"
    },
    {
      "name": "DS 7",
      "category": "suv"
    },
    {
      "name": "DS N\u00b08",
      "category": "suv"
    },
    {
      "name": "DS 3 E-Tense",
      "category": "suv"
    },
    {
      "name": "Plug-in Hybrid (PHEV)",
      "category": "suv"
    },
    {
      "name": "DS 4 Plug-in Hybrid",
      "category": "suv"
    },
    {
      "name": "DS 7 Plug-in Hybrid",
      "category": "suv"
    },
    {
      "name": "DS 9 Plug-in Hybrid",
      "category": "suv"
    },
    {
      "name": "6. Alpine",
      "category": "suv"
    },
    {
      "name": "A110",
      "category": "luxury"
    },
    {
      "name": "A110 Roadster (limited editions)",
      "category": "luxury"
    },
    {
      "name": "Sports Car",
      "category": "luxury"
    },
    {
      "name": "A110 GT",
      "category": "luxury"
    },
    {
      "name": "A110 R",
      "category": "luxury"
    },
    {
      "name": "A290",
      "category": "luxury"
    },
    {
      "name": "A390 (Upcoming)",
      "category": "luxury"
    },
    {
      "name": "Performance EV",
      "category": "luxury"
    },
    {
      "name": "Alpine A290",
      "category": "luxury"
    }
  ],
  "Volvo": [
    {
      "name": "C30",
      "category": "hatchback"
    },
    {
      "name": "V40",
      "category": "hatchback"
    },
    {
      "name": "S60",
      "category": "sedan"
    },
    {
      "name": "S90",
      "category": "sedan"
    },
    {
      "name": "Wagon / Estate",
      "category": "sedan"
    },
    {
      "name": "V60",
      "category": "sedan"
    },
    {
      "name": "V90",
      "category": "sedan"
    },
    {
      "name": "Compact SUV",
      "category": "sedan"
    },
    {
      "name": "EX30",
      "category": "sedan"
    },
    {
      "name": "XC40",
      "category": "sedan"
    },
    {
      "name": "XC60",
      "category": "suv"
    },
    {
      "name": "XC90",
      "category": "suv"
    },
    {
      "name": "Electric SUV",
      "category": "suv"
    },
    {
      "name": "EX40",
      "category": "suv"
    },
    {
      "name": "EC40",
      "category": "suv"
    },
    {
      "name": "EX90",
      "category": "suv"
    },
    {
      "name": "Electric Sedan",
      "category": "suv"
    },
    {
      "name": "ES90",
      "category": "suv"
    },
    {
      "name": "EM90",
      "category": "muv"
    },
    {
      "name": "Hybrid",
      "category": "muv"
    },
    {
      "name": "XC60 Recharge",
      "category": "muv"
    },
    {
      "name": "XC90 Recharge",
      "category": "muv"
    },
    {
      "name": "S60 Recharge",
      "category": "muv"
    },
    {
      "name": "S90 Recharge",
      "category": "muv"
    },
    {
      "name": "V60 Recharge",
      "category": "muv"
    },
    {
      "name": "Performance (Polestar Engineered)",
      "category": "muv"
    },
    {
      "name": "S60 Polestar Engineered",
      "category": "muv"
    },
    {
      "name": "V60 Polestar Engineered",
      "category": "muv"
    },
    {
      "name": "XC60 Polestar Engineered",
      "category": "muv"
    },
    {
      "name": "2. Polestar",
      "category": "muv"
    },
    {
      "name": "Polestar 2",
      "category": "sedan"
    },
    {
      "name": "Polestar 3",
      "category": "suv"
    },
    {
      "name": "Polestar 4",
      "category": "suv"
    },
    {
      "name": "Polestar 7 (Upcoming)",
      "category": "suv"
    },
    {
      "name": "Grand Tourer (GT)",
      "category": "suv"
    },
    {
      "name": "Polestar 1",
      "category": "suv"
    },
    {
      "name": "Polestar 5 (Upcoming)",
      "category": "luxury"
    },
    {
      "name": "Roadster",
      "category": "luxury"
    },
    {
      "name": "Polestar 6 (Upcoming)",
      "category": "luxury"
    },
    {
      "name": "Electric Vehicle (EV)",
      "category": "luxury"
    },
    {
      "name": "Entire Polestar lineup",
      "category": "luxury"
    },
    {
      "name": "3. Koenigsegg",
      "category": "luxury"
    },
    {
      "name": "Hypercar",
      "category": "luxury"
    },
    {
      "name": "Jesko",
      "category": "luxury"
    },
    {
      "name": "Gemera",
      "category": "luxury"
    },
    {
      "name": "Regera",
      "category": "luxury"
    },
    {
      "name": "Agera",
      "category": "luxury"
    },
    {
      "name": "CC850",
      "category": "luxury"
    },
    {
      "name": "Jesko Absolut",
      "category": "luxury"
    },
    {
      "name": "Agera RS",
      "category": "luxury"
    },
    {
      "name": "Hybrid Hypercar",
      "category": "luxury"
    },
    {
      "name": "4. Saab",
      "category": "luxury"
    },
    {
      "name": "9-3 Hatchback",
      "category": "hatchback"
    },
    {
      "name": "900",
      "category": "hatchback"
    },
    {
      "name": "9-3 Sedan",
      "category": "sedan"
    },
    {
      "name": "9-5 Sedan",
      "category": "sedan"
    },
    {
      "name": "9-3 SportCombi",
      "category": "sedan"
    },
    {
      "name": "9-5 SportCombi",
      "category": "sedan"
    },
    {
      "name": "9-3 Convertible",
      "category": "luxury"
    },
    {
      "name": "9-4X",
      "category": "suv"
    },
    {
      "name": "9-7X",
      "category": "suv"
    }
  ],
  "BYD": [
    {
      "name": "Dolphin",
      "category": "hatchback"
    },
    {
      "name": "Seagull",
      "category": "hatchback"
    },
    {
      "name": "Seal",
      "category": "sedan"
    },
    {
      "name": "Han",
      "category": "sedan"
    },
    {
      "name": "Qin",
      "category": "sedan"
    },
    {
      "name": "Destroyer 05",
      "category": "sedan"
    },
    {
      "name": "Compact SUV",
      "category": "sedan"
    },
    {
      "name": "Atto 2",
      "category": "sedan"
    },
    {
      "name": "Yuan Plus (Atto 3)",
      "category": "sedan"
    },
    {
      "name": "Atto 3",
      "category": "suv"
    },
    {
      "name": "Song Plus",
      "category": "suv"
    },
    {
      "name": "Tang",
      "category": "suv"
    },
    {
      "name": "Sea Lion 07",
      "category": "suv"
    },
    {
      "name": "Denza N7",
      "category": "suv"
    },
    {
      "name": "D9",
      "category": "muv"
    },
    {
      "name": "M6",
      "category": "muv"
    },
    {
      "name": "Pickup Truck",
      "category": "muv"
    },
    {
      "name": "Shark",
      "category": "muv"
    },
    {
      "name": "Electric Vehicle (EV)",
      "category": "muv"
    },
    {
      "name": "Sea Lion",
      "category": "muv"
    },
    {
      "name": "Plug-in Hybrid (PHEV)",
      "category": "muv"
    },
    {
      "name": "Song DM-i",
      "category": "muv"
    },
    {
      "name": "Qin Plus DM-i",
      "category": "muv"
    },
    {
      "name": "Tang DM-i",
      "category": "muv"
    },
    {
      "name": "2. MG Motor",
      "category": "muv"
    },
    {
      "name": "MG3",
      "category": "hatchback"
    },
    {
      "name": "Comet EV",
      "category": "hatchback"
    },
    {
      "name": "MG5",
      "category": "sedan"
    },
    {
      "name": "Astor",
      "category": "sedan"
    },
    {
      "name": "ZS",
      "category": "sedan"
    },
    {
      "name": "Hector",
      "category": "suv"
    },
    {
      "name": "Hector Plus",
      "category": "suv"
    },
    {
      "name": "Gloster",
      "category": "suv"
    },
    {
      "name": "HS",
      "category": "suv"
    },
    {
      "name": "ZS EV",
      "category": "suv"
    },
    {
      "name": "MG4 EV",
      "category": "suv"
    },
    {
      "name": "Cyberster",
      "category": "suv"
    },
    {
      "name": "Sports Car",
      "category": "suv"
    },
    {
      "name": "3. Chery",
      "category": "suv"
    },
    {
      "name": "QQ",
      "category": "hatchback"
    },
    {
      "name": "Arrizo Hatch",
      "category": "hatchback"
    },
    {
      "name": "Arrizo 5",
      "category": "sedan"
    },
    {
      "name": "Arrizo 8",
      "category": "sedan"
    },
    {
      "name": "Tiggo 2",
      "category": "sedan"
    },
    {
      "name": "Tiggo 4",
      "category": "sedan"
    },
    {
      "name": "Tiggo 7",
      "category": "suv"
    },
    {
      "name": "Tiggo 8",
      "category": "suv"
    },
    {
      "name": "Omoda C5",
      "category": "suv"
    },
    {
      "name": "eQ1",
      "category": "suv"
    },
    {
      "name": "eQ7",
      "category": "suv"
    },
    {
      "name": "Hybrid",
      "category": "suv"
    },
    {
      "name": "Tiggo Hybrid",
      "category": "suv"
    },
    {
      "name": "4. Geely",
      "category": "suv"
    },
    {
      "name": "Emgrand GS",
      "category": "hatchback"
    },
    {
      "name": "Panda Mini",
      "category": "hatchback"
    },
    {
      "name": "Emgrand",
      "category": "sedan"
    },
    {
      "name": "Preface",
      "category": "sedan"
    },
    {
      "name": "Coolray",
      "category": "suv"
    },
    {
      "name": "Atlas",
      "category": "suv"
    },
    {
      "name": "Monjaro",
      "category": "suv"
    },
    {
      "name": "Galaxy E5",
      "category": "suv"
    },
    {
      "name": "Jiaji",
      "category": "muv"
    },
    {
      "name": "Geometry C",
      "category": "muv"
    },
    {
      "name": "Galaxy E8",
      "category": "muv"
    },
    {
      "name": "Galaxy L7",
      "category": "muv"
    },
    {
      "name": "Monjaro Hybrid",
      "category": "muv"
    },
    {
      "name": "5. Great Wall Motors (GWM)",
      "category": "muv"
    },
    {
      "name": "Tank 300",
      "category": "suv"
    },
    {
      "name": "Tank 500",
      "category": "suv"
    },
    {
      "name": "Poer",
      "category": "suv"
    },
    {
      "name": "Cannon",
      "category": "suv"
    },
    {
      "name": "Ora lineup (sub-brand)",
      "category": "suv"
    },
    {
      "name": "Tank Hybrid",
      "category": "suv"
    },
    {
      "name": "6. Haval",
      "category": "suv"
    },
    {
      "name": "Jolion",
      "category": "suv"
    },
    {
      "name": "H6",
      "category": "suv"
    },
    {
      "name": "H9",
      "category": "suv"
    },
    {
      "name": "Big Dog",
      "category": "suv"
    },
    {
      "name": "Dargo",
      "category": "suv"
    },
    {
      "name": "H6 Hybrid",
      "category": "suv"
    },
    {
      "name": "Jolion Hybrid",
      "category": "suv"
    },
    {
      "name": "7. NIO",
      "category": "suv"
    },
    {
      "name": "ET5",
      "category": "sedan"
    },
    {
      "name": "ET7",
      "category": "sedan"
    },
    {
      "name": "ES6",
      "category": "suv"
    },
    {
      "name": "ES7",
      "category": "suv"
    },
    {
      "name": "ES8",
      "category": "suv"
    },
    {
      "name": "EC6",
      "category": "suv"
    },
    {
      "name": "Wagon",
      "category": "suv"
    },
    {
      "name": "ET5 Touring",
      "category": "suv"
    },
    {
      "name": "Entire NIO lineup",
      "category": "suv"
    },
    {
      "name": "8. XPeng",
      "category": "suv"
    },
    {
      "name": "P5",
      "category": "sedan"
    },
    {
      "name": "P7",
      "category": "sedan"
    },
    {
      "name": "P7+",
      "category": "sedan"
    },
    {
      "name": "G3",
      "category": "suv"
    },
    {
      "name": "G6",
      "category": "suv"
    },
    {
      "name": "G9",
      "category": "suv"
    },
    {
      "name": "X9",
      "category": "muv"
    },
    {
      "name": "Entire XPeng lineup",
      "category": "muv"
    },
    {
      "name": "9. Li Auto",
      "category": "muv"
    },
    {
      "name": "L6",
      "category": "suv"
    },
    {
      "name": "L7",
      "category": "suv"
    },
    {
      "name": "L8",
      "category": "suv"
    },
    {
      "name": "L9",
      "category": "suv"
    },
    {
      "name": "Mega",
      "category": "muv"
    },
    {
      "name": "Extended-Range Electric Vehicle (EREV)",
      "category": "muv"
    },
    {
      "name": "Entire Li Auto lineup",
      "category": "muv"
    },
    {
      "name": "10. Zeekr",
      "category": "muv"
    },
    {
      "name": "001 Shooting Brake",
      "category": "hatchback"
    },
    {
      "name": "7",
      "category": "sedan"
    },
    {
      "name": "X",
      "category": "suv"
    },
    {
      "name": "7X",
      "category": "suv"
    },
    {
      "name": "9",
      "category": "muv"
    },
    {
      "name": "Entire Zeekr lineup",
      "category": "muv"
    },
    {
      "name": "11. Hongqi",
      "category": "muv"
    },
    {
      "name": "H5",
      "category": "sedan"
    },
    {
      "name": "L5",
      "category": "luxury"
    },
    {
      "name": "HS3",
      "category": "suv"
    },
    {
      "name": "HS5",
      "category": "suv"
    },
    {
      "name": "HS7",
      "category": "suv"
    },
    {
      "name": "E-HS9",
      "category": "suv"
    },
    {
      "name": "HQ9",
      "category": "muv"
    },
    {
      "name": "E-QM5",
      "category": "muv"
    },
    {
      "name": "12. JAC Motors",
      "category": "muv"
    },
    {
      "name": "J2",
      "category": "hatchback"
    },
    {
      "name": "J4",
      "category": "sedan"
    },
    {
      "name": "A5",
      "category": "sedan"
    },
    {
      "name": "JS4",
      "category": "suv"
    },
    {
      "name": "JS6",
      "category": "suv"
    },
    {
      "name": "S7",
      "category": "suv"
    },
    {
      "name": "T6",
      "category": "suv"
    },
    {
      "name": "T8",
      "category": "suv"
    },
    {
      "name": "T9",
      "category": "suv"
    },
    {
      "name": "Van",
      "category": "suv"
    },
    {
      "name": "Sunray",
      "category": "suv"
    },
    {
      "name": "iEV Series",
      "category": "suv"
    },
    {
      "name": "13. BAIC",
      "category": "suv"
    },
    {
      "name": "U5",
      "category": "sedan"
    },
    {
      "name": "X35",
      "category": "suv"
    },
    {
      "name": "X55",
      "category": "suv"
    },
    {
      "name": "BJ40",
      "category": "suv"
    },
    {
      "name": "BJ60",
      "category": "suv"
    },
    {
      "name": "F40",
      "category": "suv"
    },
    {
      "name": "EU5",
      "category": "suv"
    },
    {
      "name": "EX5",
      "category": "suv"
    },
    {
      "name": "14. Dongfeng",
      "category": "suv"
    },
    {
      "name": "Nammi",
      "category": "hatchback"
    },
    {
      "name": "Aeolus Yixuan",
      "category": "sedan"
    },
    {
      "name": "Aeolus AX7",
      "category": "suv"
    },
    {
      "name": "Mage",
      "category": "suv"
    },
    {
      "name": "Rich",
      "category": "suv"
    },
    {
      "name": "Forthing",
      "category": "muv"
    },
    {
      "name": "Nammi EV",
      "category": "muv"
    },
    {
      "name": "15. FAW",
      "category": "muv"
    },
    {
      "name": "Bestune B70",
      "category": "sedan"
    },
    {
      "name": "Bestune T77",
      "category": "suv"
    },
    {
      "name": "T99",
      "category": "suv"
    },
    {
      "name": "Bestune M9",
      "category": "muv"
    },
    {
      "name": "Bestune Pony",
      "category": "muv"
    },
    {
      "name": "16. GAC",
      "category": "muv"
    },
    {
      "name": "Empow",
      "category": "sedan"
    },
    {
      "name": "GS3",
      "category": "suv"
    },
    {
      "name": "GS4",
      "category": "suv"
    },
    {
      "name": "GS8",
      "category": "suv"
    },
    {
      "name": "M8",
      "category": "muv"
    },
    {
      "name": "Aion S",
      "category": "muv"
    },
    {
      "name": "Aion Y",
      "category": "muv"
    },
    {
      "name": "Hyper GT",
      "category": "muv"
    },
    {
      "name": "GS8 Hybrid",
      "category": "muv"
    },
    {
      "name": "17. Leapmotor",
      "category": "muv"
    },
    {
      "name": "T03",
      "category": "hatchback"
    },
    {
      "name": "C01",
      "category": "sedan"
    },
    {
      "name": "C10",
      "category": "suv"
    },
    {
      "name": "C11",
      "category": "suv"
    },
    {
      "name": "B10",
      "category": "suv"
    },
    {
      "name": "Entire Leapmotor lineup",
      "category": "suv"
    },
    {
      "name": "Extended-Range EV",
      "category": "suv"
    },
    {
      "name": "C10 EREV",
      "category": "suv"
    },
    {
      "name": "C11 EREV",
      "category": "suv"
    },
    {
      "name": "18. Ora",
      "category": "suv"
    },
    {
      "name": "Good Cat",
      "category": "hatchback"
    },
    {
      "name": "Ballet Cat",
      "category": "hatchback"
    },
    {
      "name": "Lightning Cat",
      "category": "sedan"
    },
    {
      "name": "Entire Ora lineup",
      "category": "sedan"
    },
    {
      "name": "19. Wuling",
      "category": "sedan"
    },
    {
      "name": "Bingo",
      "category": "hatchback"
    },
    {
      "name": "Hongguang",
      "category": "muv"
    },
    {
      "name": "Hongguang Mini EV",
      "category": "muv"
    },
    {
      "name": "Rongguang",
      "category": "muv"
    },
    {
      "name": "Zhengtu",
      "category": "muv"
    },
    {
      "name": "Mini EV",
      "category": "muv"
    },
    {
      "name": "Bingo EV",
      "category": "muv"
    },
    {
      "name": "Air EV",
      "category": "muv"
    }
  ],
  "Tesla": [
    {
      "name": "Model 3",
      "category": "sedan"
    },
    {
      "name": "Model S",
      "category": "sedan"
    },
    {
      "name": "Model Y",
      "category": "suv"
    },
    {
      "name": "Model X",
      "category": "suv"
    },
    {
      "name": "Pickup Truck",
      "category": "suv"
    },
    {
      "name": "Cybertruck",
      "category": "suv"
    },
    {
      "name": "Sports Car",
      "category": "suv"
    },
    {
      "name": "Roadster (Upcoming)",
      "category": "suv"
    },
    {
      "name": "Electric Vehicle (EV)",
      "category": "suv"
    },
    {
      "name": "Entire Tesla lineup",
      "category": "suv"
    },
    {
      "name": "2. BYD",
      "category": "suv"
    },
    {
      "name": "Dolphin",
      "category": "hatchback"
    },
    {
      "name": "Seagull",
      "category": "hatchback"
    },
    {
      "name": "Seal",
      "category": "sedan"
    },
    {
      "name": "Han",
      "category": "sedan"
    },
    {
      "name": "Qin",
      "category": "sedan"
    },
    {
      "name": "Compact SUV",
      "category": "sedan"
    },
    {
      "name": "Atto 2",
      "category": "sedan"
    },
    {
      "name": "Atto 3 (Yuan Plus)",
      "category": "sedan"
    },
    {
      "name": "Song",
      "category": "suv"
    },
    {
      "name": "Tang",
      "category": "suv"
    },
    {
      "name": "Sea Lion",
      "category": "suv"
    },
    {
      "name": "D9",
      "category": "muv"
    },
    {
      "name": "M6",
      "category": "muv"
    },
    {
      "name": "Shark",
      "category": "muv"
    },
    {
      "name": "Entire EV lineup",
      "category": "muv"
    },
    {
      "name": "Plug-in Hybrid (PHEV)",
      "category": "muv"
    },
    {
      "name": "Song DM-i",
      "category": "muv"
    },
    {
      "name": "Qin DM-i",
      "category": "muv"
    },
    {
      "name": "Tang DM-i",
      "category": "muv"
    },
    {
      "name": "3. Rivian",
      "category": "muv"
    },
    {
      "name": "R1S",
      "category": "suv"
    },
    {
      "name": "R1T",
      "category": "suv"
    },
    {
      "name": "Commercial Van",
      "category": "suv"
    },
    {
      "name": "Electric Delivery Van (EDV)",
      "category": "suv"
    },
    {
      "name": "Entire Rivian lineup",
      "category": "suv"
    },
    {
      "name": "4. Lucid",
      "category": "suv"
    },
    {
      "name": "Lucid Air",
      "category": "luxury"
    },
    {
      "name": "Lucid Gravity",
      "category": "luxury"
    },
    {
      "name": "Entire Lucid lineup",
      "category": "luxury"
    },
    {
      "name": "5. VinFast",
      "category": "luxury"
    },
    {
      "name": "VF e34",
      "category": "hatchback"
    },
    {
      "name": "VF 6",
      "category": "hatchback"
    },
    {
      "name": "VF 7",
      "category": "suv"
    },
    {
      "name": "VF 8",
      "category": "suv"
    },
    {
      "name": "VF 9",
      "category": "suv"
    },
    {
      "name": "VF Wild (Concept)",
      "category": "suv"
    },
    {
      "name": "Entire VinFast lineup",
      "category": "suv"
    },
    {
      "name": "6. NIO",
      "category": "suv"
    },
    {
      "name": "ET5",
      "category": "sedan"
    },
    {
      "name": "ET7",
      "category": "sedan"
    },
    {
      "name": "Wagon",
      "category": "sedan"
    },
    {
      "name": "ET5 Touring",
      "category": "sedan"
    },
    {
      "name": "ES6",
      "category": "suv"
    },
    {
      "name": "ES7",
      "category": "suv"
    },
    {
      "name": "ES8",
      "category": "suv"
    },
    {
      "name": "EC6",
      "category": "suv"
    },
    {
      "name": "Entire NIO lineup",
      "category": "suv"
    },
    {
      "name": "7. XPeng",
      "category": "suv"
    },
    {
      "name": "P5",
      "category": "sedan"
    },
    {
      "name": "P7",
      "category": "sedan"
    },
    {
      "name": "P7+",
      "category": "sedan"
    },
    {
      "name": "G3",
      "category": "suv"
    },
    {
      "name": "G6",
      "category": "suv"
    },
    {
      "name": "G9",
      "category": "suv"
    },
    {
      "name": "X9",
      "category": "muv"
    },
    {
      "name": "Entire XPeng lineup",
      "category": "muv"
    },
    {
      "name": "8. Polestar",
      "category": "muv"
    },
    {
      "name": "Grand Tourer (GT)",
      "category": "muv"
    },
    {
      "name": "Polestar 1",
      "category": "muv"
    },
    {
      "name": "Polestar 2",
      "category": "sedan"
    },
    {
      "name": "Polestar 5 (Upcoming)",
      "category": "sedan"
    },
    {
      "name": "Polestar 3",
      "category": "suv"
    },
    {
      "name": "Polestar 4",
      "category": "suv"
    },
    {
      "name": "Polestar 7 (Upcoming)",
      "category": "suv"
    },
    {
      "name": "Roadster",
      "category": "suv"
    },
    {
      "name": "Polestar 6 (Upcoming)",
      "category": "suv"
    },
    {
      "name": "Entire Polestar lineup",
      "category": "suv"
    },
    {
      "name": "9. Fisker",
      "category": "suv"
    },
    {
      "name": "Ocean",
      "category": "suv"
    },
    {
      "name": "Pear",
      "category": "suv"
    },
    {
      "name": "Alaska",
      "category": "suv"
    },
    {
      "name": "Entire Fisker lineup",
      "category": "suv"
    },
    {
      "name": "10. Leapmotor",
      "category": "suv"
    },
    {
      "name": "T03",
      "category": "hatchback"
    },
    {
      "name": "C01",
      "category": "sedan"
    },
    {
      "name": "C10",
      "category": "suv"
    },
    {
      "name": "C11",
      "category": "suv"
    },
    {
      "name": "B10",
      "category": "suv"
    },
    {
      "name": "Extended-Range Electric Vehicle (EREV)",
      "category": "suv"
    },
    {
      "name": "C10 EREV",
      "category": "suv"
    },
    {
      "name": "C11 EREV",
      "category": "suv"
    },
    {
      "name": "11. Zeekr",
      "category": "suv"
    },
    {
      "name": "Hatchback / Shooting Brake",
      "category": "suv"
    },
    {
      "name": "Zeekr 001",
      "category": "suv"
    },
    {
      "name": "Zeekr 007",
      "category": "sedan"
    },
    {
      "name": "Zeekr X",
      "category": "suv"
    },
    {
      "name": "Zeekr 7X",
      "category": "suv"
    },
    {
      "name": "Zeekr 009",
      "category": "muv"
    },
    {
      "name": "Entire Zeekr lineup",
      "category": "muv"
    }
  ]
}