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
  { name: 'HATCHBACK', description: 'Compact hatchback cars' },
  { name: 'SEDAN', description: 'Sedan / saloon cars' },
  { name: 'SUV', description: 'SUV and crossovers' },
  { name: 'MUV', description: 'MUV / MPV family vehicles' },
  { name: 'LUXURY', description: 'Luxury segment' },
];

/** @type {{ name: string, sortOrder?: number }[]} */
export const FUEL_TYPES = [
  { name: 'PETROL', sortOrder: 0 },
  { name: 'DIESEL', sortOrder: 1 },
  { name: 'CNG', sortOrder: 2 },
  { name: 'ELECTRIC', sortOrder: 3 },
  { name: 'HYBRID', sortOrder: 4 },
];

/**
 * brand name → models for that brand.
 * `category` is matched case-insensitively to CATEGORIES[].name (stored uppercase).
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
      "name": "Fronx",
      "category": "suv / compact suv"
    },
    {
      "name": "Brezza",
      "category": "suv / compact suv"
    },
    {
      "name": "Grand Vitara",
      "category": "suv / compact suv"
    },
    {
      "name": "Jimny",
      "category": "suv / compact suv"
    },
    {
      "name": "Ertiga",
      "category": "mpv"
    },
    {
      "name": "XL6",
      "category": "mpv"
    },
    {
      "name": "Invicto",
      "category": "mpv"
    },
    {
      "name": "Eeco",
      "category": "vans"
    },
    {
      "name": "Super Carry",
      "category": "vans"
    }
  ],
  "Tata Motors": [
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
      "name": "Punch",
      "category": "compact suv"
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
      "name": "Tiago EV",
      "category": "electric vehicles"
    },
    {
      "name": "Tigor EV",
      "category": "electric vehicles"
    },
    {
      "name": "Punch EV",
      "category": "electric vehicles"
    },
    {
      "name": "Nexon EV",
      "category": "electric vehicles"
    },
    {
      "name": "Curvv EV",
      "category": "electric vehicles"
    },
    {
      "name": "Harrier EV",
      "category": "electric vehicles"
    },
    {
      "name": "Yodha",
      "category": "pickup / commercial"
    },
    {
      "name": "Ace",
      "category": "pickup / commercial"
    },
    {
      "name": "Intra",
      "category": "pickup / commercial"
    }
  ],
  "Mahindra": [
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
      "category": "pickup"
    },
    {
      "name": "Bolero Camper",
      "category": "pickup"
    },
    {
      "name": "Jeeto",
      "category": "pickup"
    },
    {
      "name": "Supro",
      "category": "pickup"
    },
    {
      "name": "Imperio",
      "category": "pickup"
    },
    {
      "name": "XUV400 EV",
      "category": "electric"
    },
    {
      "name": "BE 6",
      "category": "electric"
    },
    {
      "name": "XEV 9e",
      "category": "electric"
    }
  ],
  "Hindustan Motors": [
    {
      "name": "Ambassador",
      "category": "sedan"
    },
    {
      "name": "Trekker",
      "category": "utility vehicle"
    }
  ],
  "Force Motors": [
    {
      "name": "Gurkha",
      "category": "suv"
    },
    {
      "name": "Gurkha 5 Door",
      "category": "suv"
    },
    {
      "name": "Traveller",
      "category": "van"
    },
    {
      "name": "Urbania",
      "category": "van"
    },
    {
      "name": "Force Ambulance",
      "category": "ambulance"
    },
    {
      "name": "Trax",
      "category": "commercial"
    },
    {
      "name": "Trump",
      "category": "commercial"
    }
  ],
  "Premier Automobiles": [
    {
      "name": "Rio",
      "category": "hatchback"
    },
    {
      "name": "118NE",
      "category": "sedan"
    },
    {
      "name": "Premier Padmini",
      "category": "classic"
    }
  ],
  "Ashok Leyland (Passenger Vehicles)": [
    {
      "name": "Lynx",
      "category": "bus"
    },
    {
      "name": "Oyster",
      "category": "bus"
    },
    {
      "name": "Sunshine",
      "category": "bus"
    },
    {
      "name": "Falcon",
      "category": "bus"
    },
    {
      "name": "Viking",
      "category": "bus"
    },
    {
      "name": "MiTR Bus",
      "category": "staff bus"
    },
    {
      "name": "Sunshine School Bus",
      "category": "school bus"
    },
    {
      "name": "Dost Van",
      "category": "commercial passenger"
    }
  ],
  "EKA Mobility": [
    {
      "name": "E9 Bus",
      "category": "electric bus"
    },
    {
      "name": "E12 Bus",
      "category": "electric bus"
    },
    {
      "name": "Light Commercial EV",
      "category": "electric truck"
    },
    {
      "name": "Medium Commercial EV",
      "category": "electric truck"
    }
  ],
  "Pravaig": [
    {
      "name": "DEFY",
      "category": "luxury electric sedan"
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
      "name": "Exter",
      "category": "compact suv"
    },
    {
      "name": "Venue",
      "category": "compact suv"
    },
    {
      "name": "Kona",
      "category": "compact suv"
    },
    {
      "name": "Bayon",
      "category": "compact suv"
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
      "name": "Stargazer",
      "category": "mpv / muv"
    },
    {
      "name": "Staria",
      "category": "mpv / muv"
    },
    {
      "name": "H-1",
      "category": "mpv / muv"
    },
    {
      "name": "Creta Electric",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Kona Electric",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Ioniq 5",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Ioniq 6",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Ioniq 9",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Inster",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Tucson Hybrid",
      "category": "hybrid"
    },
    {
      "name": "Santa Fe Hybrid",
      "category": "hybrid"
    },
    {
      "name": "Sonata Hybrid",
      "category": "hybrid"
    },
    {
      "name": "Santa Cruz",
      "category": "pickup truck"
    },
    {
      "name": "i20 N",
      "category": "performance (n series)"
    },
    {
      "name": "i30 N",
      "category": "performance (n series)"
    },
    {
      "name": "Elantra N",
      "category": "performance (n series)"
    },
    {
      "name": "Kona N",
      "category": "performance (n series)"
    },
    {
      "name": "Ioniq 5 N",
      "category": "performance (n series)"
    }
  ],
  "Kia": [
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
      "category": "compact suv"
    },
    {
      "name": "Seltos",
      "category": "compact suv"
    },
    {
      "name": "Niro",
      "category": "compact suv"
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
      "category": "mpv / muv"
    },
    {
      "name": "Carnival",
      "category": "mpv / muv"
    },
    {
      "name": "EV3",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "EV4",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "EV5",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "EV6",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "EV9",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Niro EV",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Niro Hybrid",
      "category": "hybrid"
    },
    {
      "name": "Sportage Hybrid",
      "category": "hybrid"
    },
    {
      "name": "Sorento Hybrid",
      "category": "hybrid"
    },
    {
      "name": "Tasman",
      "category": "pickup truck"
    }
  ],
  "Genesis (Luxury Division of Hyundai)": [
    {
      "name": "G70",
      "category": "luxury sedan"
    },
    {
      "name": "G80",
      "category": "luxury sedan"
    },
    {
      "name": "G90",
      "category": "luxury sedan"
    },
    {
      "name": "G70 Shooting Brake",
      "category": "luxury wagon"
    },
    {
      "name": "GV60",
      "category": "luxury suv"
    },
    {
      "name": "GV70",
      "category": "luxury suv"
    },
    {
      "name": "GV80",
      "category": "luxury suv"
    },
    {
      "name": "Genesis X Concept",
      "category": "coupe"
    },
    {
      "name": "Electrified G80",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Electrified GV70",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "GV60",
      "category": "electric vehicle (ev)"
    }
  ],
  "SsangYong (Now KGM)": [
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
      "category": "pickup truck"
    },
    {
      "name": "Musso Grand",
      "category": "pickup truck"
    },
    {
      "name": "Torres EVX",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Rodius (Stavic)",
      "category": "mpv"
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
      "name": "Raize",
      "category": "compact suv"
    },
    {
      "name": "Urban Cruiser",
      "category": "compact suv"
    },
    {
      "name": "Corolla Cross",
      "category": "compact suv"
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
      "name": "Rumion",
      "category": "mpv / muv"
    },
    {
      "name": "Innova Crysta",
      "category": "mpv / muv"
    },
    {
      "name": "Innova Hycross",
      "category": "mpv / muv"
    },
    {
      "name": "Alphard",
      "category": "mpv / muv"
    },
    {
      "name": "Vellfire",
      "category": "mpv / muv"
    },
    {
      "name": "Sienna",
      "category": "mpv / muv"
    },
    {
      "name": "HiAce",
      "category": "mpv / muv"
    },
    {
      "name": "Hilux",
      "category": "pickup truck"
    },
    {
      "name": "Tacoma",
      "category": "pickup truck"
    },
    {
      "name": "Tundra",
      "category": "pickup truck"
    },
    {
      "name": "GR86",
      "category": "sports car"
    },
    {
      "name": "GR Supra",
      "category": "sports car"
    },
    {
      "name": "GR Yaris",
      "category": "sports car"
    },
    {
      "name": "GR Corolla",
      "category": "sports car"
    },
    {
      "name": "bZ4X",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Urban Cruiser EV",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Prius",
      "category": "hybrid"
    },
    {
      "name": "Camry Hybrid",
      "category": "hybrid"
    },
    {
      "name": "Corolla Hybrid",
      "category": "hybrid"
    },
    {
      "name": "Hycross Hybrid",
      "category": "hybrid"
    }
  ],
  "Honda": [
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
      "category": "mpv"
    },
    {
      "name": "Odyssey",
      "category": "mpv"
    },
    {
      "name": "StepWGN",
      "category": "mpv"
    },
    {
      "name": "Civic Type R",
      "category": "sports"
    },
    {
      "name": "NSX",
      "category": "sports"
    },
    {
      "name": "Honda e",
      "category": "electric"
    },
    {
      "name": "Prologue",
      "category": "electric"
    },
    {
      "name": "City e:HEV",
      "category": "hybrid"
    },
    {
      "name": "Accord Hybrid",
      "category": "hybrid"
    },
    {
      "name": "CR-V Hybrid",
      "category": "hybrid"
    }
  ],
  "Nissan": [
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
      "category": "pickup"
    },
    {
      "name": "Frontier",
      "category": "pickup"
    },
    {
      "name": "Titan",
      "category": "pickup"
    },
    {
      "name": "GT-R",
      "category": "sports"
    },
    {
      "name": "Z",
      "category": "sports"
    },
    {
      "name": "Leaf",
      "category": "electric"
    },
    {
      "name": "Ariya",
      "category": "electric"
    }
  ],
  "Mitsubishi": [
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
      "category": "pickup"
    },
    {
      "name": "Xpander",
      "category": "mpv"
    },
    {
      "name": "Outlander PHEV",
      "category": "electric / hybrid"
    }
  ],
  "Mazda": [
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
      "category": "sports"
    },
    {
      "name": "RX-8",
      "category": "sports"
    },
    {
      "name": "BT-50",
      "category": "pickup"
    },
    {
      "name": "MX-30 EV",
      "category": "electric"
    }
  ],
  "Suzuki": [
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
      "category": "mpv"
    },
    {
      "name": "XL6",
      "category": "mpv"
    },
    {
      "name": "Invicto",
      "category": "mpv"
    },
    {
      "name": "Eeco",
      "category": "van"
    },
    {
      "name": "Super Carry",
      "category": "pickup"
    },
    {
      "name": "Grand Vitara Hybrid",
      "category": "hybrid"
    },
    {
      "name": "Invicto Hybrid",
      "category": "hybrid"
    }
  ],
  "Subaru": [
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
      "category": "sports"
    },
    {
      "name": "Solterra",
      "category": "electric"
    }
  ],
  "Lexus": [
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
      "category": "coupe"
    },
    {
      "name": "LC",
      "category": "coupe"
    },
    {
      "name": "LM",
      "category": "mpv"
    },
    {
      "name": "RZ",
      "category": "electric"
    },
    {
      "name": "ES Hybrid",
      "category": "hybrid"
    },
    {
      "name": "NX Hybrid",
      "category": "hybrid"
    },
    {
      "name": "RX Hybrid",
      "category": "hybrid"
    },
    {
      "name": "LS Hybrid",
      "category": "hybrid"
    }
  ],
  "Infiniti": [
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
      "category": "coupe"
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
      "category": "electric"
    }
  ],
  "Daihatsu": [
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
      "category": "mpv"
    },
    {
      "name": "Luxio",
      "category": "mpv"
    },
    {
      "name": "Hijet",
      "category": "mini truck"
    },
    {
      "name": "Gran Max",
      "category": "van"
    }
  ],
  "Isuzu": [
    {
      "name": "MU-X",
      "category": "suv"
    },
    {
      "name": "D-Max",
      "category": "pickup"
    },
    {
      "name": "V-Cross",
      "category": "pickup"
    },
    {
      "name": "N-Series",
      "category": "commercial"
    },
    {
      "name": "F-Series",
      "category": "commercial"
    },
    {
      "name": "ELF Trucks",
      "category": "commercial"
    }
  ],
  "Acura": [
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
      "name": "NSX",
      "category": "sports"
    },
    {
      "name": "ZDX EV",
      "category": "electric"
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
      "category": "coupe"
    },
    {
      "name": "CLE Coupe",
      "category": "coupe"
    },
    {
      "name": "AMG GT Coupe",
      "category": "coupe"
    },
    {
      "name": "CLE Cabriolet",
      "category": "convertible / cabriolet"
    },
    {
      "name": "AMG SL Roadster",
      "category": "convertible / cabriolet"
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
      "name": "GLC Coupe",
      "category": "coupe suv"
    },
    {
      "name": "GLE Coupe",
      "category": "coupe suv"
    },
    {
      "name": "V-Class",
      "category": "mpv / van"
    },
    {
      "name": "EQV",
      "category": "mpv / van"
    },
    {
      "name": "Sprinter",
      "category": "mpv / van"
    },
    {
      "name": "Vito",
      "category": "mpv / van"
    },
    {
      "name": "X-Class",
      "category": "pickup"
    },
    {
      "name": "EQA",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "EQB",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "EQE SUV",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "EQS SUV",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "EQV",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "AMG A45",
      "category": "performance (amg)"
    },
    {
      "name": "AMG C63",
      "category": "performance (amg)"
    },
    {
      "name": "AMG E53",
      "category": "performance (amg)"
    },
    {
      "name": "AMG GT",
      "category": "performance (amg)"
    },
    {
      "name": "AMG G63",
      "category": "performance (amg)"
    }
  ],
  "BMW": [
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
      "category": "coupe"
    },
    {
      "name": "4 Series Coupe",
      "category": "coupe"
    },
    {
      "name": "8 Series Coupe",
      "category": "coupe"
    },
    {
      "name": "M2",
      "category": "coupe"
    },
    {
      "name": "M4",
      "category": "coupe"
    },
    {
      "name": "M8",
      "category": "coupe"
    },
    {
      "name": "Z4 Roadster",
      "category": "convertible"
    },
    {
      "name": "4 Series Convertible",
      "category": "convertible"
    },
    {
      "name": "8 Series Convertible",
      "category": "convertible"
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
      "name": "iX1",
      "category": "electric suv"
    },
    {
      "name": "iX2",
      "category": "electric suv"
    },
    {
      "name": "iX3",
      "category": "electric suv"
    },
    {
      "name": "iX",
      "category": "electric suv"
    },
    {
      "name": "3 Series Touring",
      "category": "wagon / touring"
    },
    {
      "name": "5 Series Touring",
      "category": "wagon / touring"
    },
    {
      "name": "M2",
      "category": "performance (m)"
    },
    {
      "name": "M3",
      "category": "performance (m)"
    },
    {
      "name": "M4",
      "category": "performance (m)"
    },
    {
      "name": "M5",
      "category": "performance (m)"
    },
    {
      "name": "XM",
      "category": "performance (m)"
    }
  ],
  "Audi": [
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
      "category": "coupe"
    },
    {
      "name": "R8 Coupe",
      "category": "coupe"
    },
    {
      "name": "A5 Cabriolet",
      "category": "convertible"
    },
    {
      "name": "TT Roadster",
      "category": "convertible"
    },
    {
      "name": "R8 Spyder",
      "category": "convertible"
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
      "category": "electric suv"
    },
    {
      "name": "Q6 e-tron",
      "category": "electric suv"
    },
    {
      "name": "Q8 e-tron",
      "category": "electric suv"
    },
    {
      "name": "A4 Avant",
      "category": "wagon"
    },
    {
      "name": "A6 Avant",
      "category": "wagon"
    },
    {
      "name": "RS6 Avant",
      "category": "wagon"
    },
    {
      "name": "RS3",
      "category": "performance (rs)"
    },
    {
      "name": "RS4",
      "category": "performance (rs)"
    },
    {
      "name": "RS5",
      "category": "performance (rs)"
    },
    {
      "name": "RS6",
      "category": "performance (rs)"
    },
    {
      "name": "RS7",
      "category": "performance (rs)"
    },
    {
      "name": "RS Q8",
      "category": "performance (rs)"
    }
  ],
  "Volkswagen": [
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
      "category": "mpv"
    },
    {
      "name": "Multivan",
      "category": "mpv"
    },
    {
      "name": "Transporter",
      "category": "van"
    },
    {
      "name": "Caddy",
      "category": "van"
    },
    {
      "name": "Crafter",
      "category": "van"
    },
    {
      "name": "Amarok",
      "category": "pickup"
    },
    {
      "name": "ID.3",
      "category": "electric"
    },
    {
      "name": "ID.4",
      "category": "electric"
    },
    {
      "name": "ID.5",
      "category": "electric"
    },
    {
      "name": "ID.7",
      "category": "electric"
    },
    {
      "name": "ID.Buzz",
      "category": "electric"
    },
    {
      "name": "Golf GTI",
      "category": "performance (gti/r)"
    },
    {
      "name": "Golf R",
      "category": "performance (gti/r)"
    }
  ],
  "Porsche": [
    {
      "name": "718 Cayman",
      "category": "sports coupe"
    },
    {
      "name": "911",
      "category": "sports coupe"
    },
    {
      "name": "718 Boxster",
      "category": "convertible"
    },
    {
      "name": "911 Cabriolet",
      "category": "convertible"
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
      "name": "Taycan",
      "category": "electric"
    },
    {
      "name": "Macan Electric",
      "category": "electric"
    }
  ],
  "Opel": [
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
      "category": "wagon"
    },
    {
      "name": "Insignia Sports Tourer",
      "category": "wagon"
    },
    {
      "name": "Combo",
      "category": "van"
    },
    {
      "name": "Vivaro",
      "category": "van"
    },
    {
      "name": "Movano",
      "category": "van"
    },
    {
      "name": "Corsa Electric",
      "category": "electric"
    },
    {
      "name": "Astra Electric",
      "category": "electric"
    },
    {
      "name": "Mokka Electric",
      "category": "electric"
    }
  ],
  "MINI": [
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
      "category": "convertible"
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
      "category": "electric"
    },
    {
      "name": "Countryman Electric",
      "category": "electric"
    },
    {
      "name": "Aceman Electric",
      "category": "electric"
    },
    {
      "name": "JCW Hatch",
      "category": "performance (john cooper works)"
    },
    {
      "name": "JCW Countryman",
      "category": "performance (john cooper works)"
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
      "category": "convertible"
    },
    {
      "name": "Countryman",
      "category": "suv / crossover"
    },
    {
      "name": "Aceman",
      "category": "suv / crossover"
    },
    {
      "name": "Cooper Electric",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Countryman Electric",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Aceman Electric",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "JCW Hatch",
      "category": "performance (john cooper works)"
    },
    {
      "name": "JCW Countryman",
      "category": "performance (john cooper works)"
    }
  ],
  "Smart": [
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
      "category": "electric"
    },
    {
      "name": "#1",
      "category": "electric"
    },
    {
      "name": "#3",
      "category": "electric"
    },
    {
      "name": "#5",
      "category": "electric"
    }
  ],
  "Maybach": [
    {
      "name": "Mercedes-Maybach S-Class",
      "category": "luxury sedan"
    },
    {
      "name": "Mercedes-Maybach GLS",
      "category": "luxury suv"
    },
    {
      "name": "Mercedes-Maybach EQS SUV",
      "category": "electric luxury"
    }
  ],
  "Alpina": [
    {
      "name": "B3",
      "category": "luxury sedan"
    },
    {
      "name": "B5",
      "category": "luxury sedan"
    },
    {
      "name": "B7",
      "category": "luxury sedan"
    },
    {
      "name": "B3 Touring",
      "category": "luxury wagon"
    },
    {
      "name": "D3 Touring",
      "category": "luxury wagon"
    },
    {
      "name": "XB7",
      "category": "luxury suv"
    },
    {
      "name": "XD3",
      "category": "luxury suv"
    }
  ],
  "MAN": [
    {
      "name": "MAN TGE",
      "category": "van"
    },
    {
      "name": "TGL",
      "category": "truck"
    },
    {
      "name": "TGM",
      "category": "truck"
    },
    {
      "name": "TGS",
      "category": "truck"
    },
    {
      "name": "TGX",
      "category": "truck"
    },
    {
      "name": "Lion's Coach",
      "category": "bus"
    },
    {
      "name": "Lion's City",
      "category": "bus"
    },
    {
      "name": "Lion's Intercity",
      "category": "bus"
    },
    {
      "name": "eTGE",
      "category": "electric commercial"
    },
    {
      "name": "eTruck",
      "category": "electric commercial"
    },
    {
      "name": "Electric Bus",
      "category": "electric commercial"
    }
  ],
  "Borgward": [
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
      "category": "electric suv"
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
      "name": "Maverick",
      "category": "pickup truck"
    },
    {
      "name": "Ranger",
      "category": "pickup truck"
    },
    {
      "name": "F-150",
      "category": "pickup truck"
    },
    {
      "name": "F-250",
      "category": "pickup truck"
    },
    {
      "name": "F-350",
      "category": "pickup truck"
    },
    {
      "name": "F-450",
      "category": "pickup truck"
    },
    {
      "name": "Mustang",
      "category": "sports car"
    },
    {
      "name": "Mustang Dark Horse",
      "category": "sports car"
    },
    {
      "name": "GT",
      "category": "sports car"
    },
    {
      "name": "Transit",
      "category": "van"
    },
    {
      "name": "Transit Connect",
      "category": "van"
    },
    {
      "name": "E-Series",
      "category": "van"
    },
    {
      "name": "Mustang Mach-E",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "F-150 Lightning",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "E-Transit",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Escape Hybrid",
      "category": "hybrid"
    },
    {
      "name": "Maverick Hybrid",
      "category": "hybrid"
    },
    {
      "name": "F-150 Hybrid",
      "category": "hybrid"
    }
  ],
  "Chevrolet": [
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
      "category": "pickup truck"
    },
    {
      "name": "Silverado 1500",
      "category": "pickup truck"
    },
    {
      "name": "Silverado HD",
      "category": "pickup truck"
    },
    {
      "name": "Camaro",
      "category": "sports car"
    },
    {
      "name": "Corvette",
      "category": "sports car"
    },
    {
      "name": "Express Cargo",
      "category": "van"
    },
    {
      "name": "Express Passenger",
      "category": "van"
    },
    {
      "name": "Bolt EUV",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Equinox EV",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Blazer EV",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Silverado EV",
      "category": "electric vehicle (ev)"
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
      "name": "Cybertruck",
      "category": "pickup truck"
    },
    {
      "name": "Roadster (Upcoming)",
      "category": "sports car"
    },
    {
      "name": "Entire Tesla lineup",
      "category": "electric vehicle (ev)"
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
      "category": "pickup truck"
    },
    {
      "name": "Roadster (Upcoming)",
      "category": "sports car"
    },
    {
      "name": "Entire Tesla lineup",
      "category": "electric vehicle (ev)"
    }
  ],
  "Jeep": [
    {
      "name": "Renegade",
      "category": "compact suv"
    },
    {
      "name": "Compass",
      "category": "compact suv"
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
      "category": "pickup truck"
    },
    {
      "name": "Wrangler 4xe",
      "category": "electric / hybrid"
    },
    {
      "name": "Grand Cherokee 4xe",
      "category": "electric / hybrid"
    },
    {
      "name": "Wagoneer S EV",
      "category": "electric / hybrid"
    }
  ],
  "Dodge": [
    {
      "name": "Charger",
      "category": "sedan"
    },
    {
      "name": "Challenger",
      "category": "coupe"
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
      "name": "Challenger SRT",
      "category": "muscle car"
    },
    {
      "name": "Charger SRT",
      "category": "muscle car"
    },
    {
      "name": "Charger Daytona EV",
      "category": "electric"
    }
  ],
  "Chrysler": [
    {
      "name": "300",
      "category": "sedan"
    },
    {
      "name": "Pacifica",
      "category": "mpv / minivan"
    },
    {
      "name": "Voyager",
      "category": "mpv / minivan"
    },
    {
      "name": "Pacifica Plug-in Hybrid",
      "category": "hybrid"
    }
  ],
  "Cadillac": [
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
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Optiq",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Vistiq",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Escalade IQ",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Celestiq",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "CT4-V",
      "category": "performance"
    },
    {
      "name": "CT5-V Blackwing",
      "category": "performance"
    }
  ],
  "GMC": [
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
      "category": "pickup truck"
    },
    {
      "name": "Sierra 1500",
      "category": "pickup truck"
    },
    {
      "name": "Sierra HD",
      "category": "pickup truck"
    },
    {
      "name": "Savana",
      "category": "van"
    },
    {
      "name": "Sierra EV",
      "category": "electric"
    },
    {
      "name": "Hummer EV SUV",
      "category": "electric"
    },
    {
      "name": "Hummer EV Pickup",
      "category": "electric"
    }
  ],
  "Lincoln": [
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
      "category": "hybrid"
    }
  ],
  "Buick": [
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
      "name": "Regal TourX",
      "category": "wagon"
    }
  ],
  "RAM": [
    {
      "name": "RAM 1500",
      "category": "pickup truck"
    },
    {
      "name": "RAM 2500",
      "category": "pickup truck"
    },
    {
      "name": "RAM 3500",
      "category": "pickup truck"
    },
    {
      "name": "RAM Chassis Cab",
      "category": "pickup truck"
    },
    {
      "name": "ProMaster",
      "category": "van"
    },
    {
      "name": "ProMaster City",
      "category": "van"
    },
    {
      "name": "RAM 1500 REV",
      "category": "electric"
    }
  ],
  "Rivian": [
    {
      "name": "R1S",
      "category": "suv"
    },
    {
      "name": "R1T",
      "category": "pickup truck"
    },
    {
      "name": "Entire Rivian lineup",
      "category": "electric vehicle"
    },
    {
      "name": "EDV (Electric Delivery Van)",
      "category": "commercial van"
    },
    {
      "name": "R1S",
      "category": "suv"
    },
    {
      "name": "R1T",
      "category": "pickup truck"
    },
    {
      "name": "Electric Delivery Van (EDV)",
      "category": "commercial van"
    },
    {
      "name": "Entire Rivian lineup",
      "category": "electric vehicle (ev)"
    }
  ],
  "Lucid Motors": [
    {
      "name": "Lucid Air",
      "category": "luxury sedan"
    },
    {
      "name": "Lucid Gravity",
      "category": "luxury suv"
    },
    {
      "name": "Entire Lucid lineup",
      "category": "electric vehicle"
    }
  ],
  "Fisker": [
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
      "category": "pickup truck"
    },
    {
      "name": "Entire Fisker lineup",
      "category": "electric vehicle"
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
      "category": "pickup truck"
    },
    {
      "name": "Entire Fisker lineup",
      "category": "electric vehicle (ev)"
    }
  ],
  "Hummer": [
    {
      "name": "Hummer EV SUV",
      "category": "suv"
    },
    {
      "name": "Hummer EV Pickup",
      "category": "pickup truck"
    },
    {
      "name": "Entire Hummer EV lineup",
      "category": "electric vehicle"
    }
  ],
  "Pontiac": [
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
      "category": "coupe"
    },
    {
      "name": "Firebird",
      "category": "sports car"
    },
    {
      "name": "Solstice",
      "category": "sports car"
    },
    {
      "name": "Torrent",
      "category": "suv"
    }
  ],
  "Saturn": [
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
      "category": "coupe"
    }
  ],
  "Mercury": [
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
      "category": "coupe"
    },
    {
      "name": "Villager",
      "category": "wagon"
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
      "category": "sports sedan"
    },
    {
      "name": "XJR",
      "category": "sports sedan"
    },
    {
      "name": "F-Type Coupe",
      "category": "coupe"
    },
    {
      "name": "F-Type Convertible",
      "category": "convertible"
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
      "name": "I-PACE",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "F-Type R",
      "category": "sports car"
    }
  ],
  "Land Rover": [
    {
      "name": "Discovery Sport",
      "category": "compact suv"
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
      "category": "luxury suv"
    },
    {
      "name": "Range Rover Sport",
      "category": "luxury suv"
    },
    {
      "name": "Range Rover",
      "category": "luxury suv"
    },
    {
      "name": "Range Rover SV",
      "category": "luxury suv"
    },
    {
      "name": "Defender Hard Top",
      "category": "commercial suv"
    },
    {
      "name": "Defender PHEV",
      "category": "hybrid"
    },
    {
      "name": "Discovery PHEV",
      "category": "hybrid"
    }
  ],
  "Range Rover": [
    {
      "name": "Range Rover",
      "category": "luxury suv"
    },
    {
      "name": "Range Rover Sport",
      "category": "luxury suv"
    },
    {
      "name": "Range Rover Velar",
      "category": "luxury suv"
    },
    {
      "name": "Range Rover Evoque",
      "category": "luxury suv"
    },
    {
      "name": "Range Rover SV",
      "category": "performance suv"
    },
    {
      "name": "Sport SV",
      "category": "performance suv"
    },
    {
      "name": "Range Rover PHEV",
      "category": "hybrid"
    },
    {
      "name": "Sport PHEV",
      "category": "hybrid"
    },
    {
      "name": "Range Rover Electric",
      "category": "electric vehicle (upcoming)"
    }
  ],
  "Rolls-Royce": [
    {
      "name": "Ghost",
      "category": "luxury sedan"
    },
    {
      "name": "Phantom",
      "category": "luxury sedan"
    },
    {
      "name": "Wraith",
      "category": "luxury coupe"
    },
    {
      "name": "Spectre",
      "category": "luxury coupe"
    },
    {
      "name": "Dawn",
      "category": "luxury convertible"
    },
    {
      "name": "Cullinan",
      "category": "luxury suv"
    },
    {
      "name": "Spectre",
      "category": "electric vehicle (ev)"
    }
  ],
  "Bentley": [
    {
      "name": "Flying Spur",
      "category": "luxury sedan"
    },
    {
      "name": "Continental GT",
      "category": "luxury coupe"
    },
    {
      "name": "Continental GTC",
      "category": "luxury convertible"
    },
    {
      "name": "Bentayga",
      "category": "luxury suv"
    },
    {
      "name": "Bentayga Hybrid",
      "category": "hybrid"
    },
    {
      "name": "Flying Spur Hybrid",
      "category": "hybrid"
    }
  ],
  "Aston Martin": [
    {
      "name": "Vantage Coupe",
      "category": "sports coupe"
    },
    {
      "name": "DB12 Coupe",
      "category": "sports coupe"
    },
    {
      "name": "DBS Coupe",
      "category": "sports coupe"
    },
    {
      "name": "Vantage Roadster",
      "category": "sports convertible"
    },
    {
      "name": "DB12 Volante",
      "category": "sports convertible"
    },
    {
      "name": "DBX",
      "category": "luxury suv"
    },
    {
      "name": "DBX707",
      "category": "luxury suv"
    },
    {
      "name": "Valkyrie",
      "category": "hypercar"
    },
    {
      "name": "Valhalla",
      "category": "hypercar"
    }
  ],
  "Lotus": [
    {
      "name": "Emira",
      "category": "sports coupe"
    },
    {
      "name": "Elise",
      "category": "sports car"
    },
    {
      "name": "Exige",
      "category": "sports car"
    },
    {
      "name": "Evora",
      "category": "sports car"
    },
    {
      "name": "Eletre",
      "category": "electric suv"
    },
    {
      "name": "Emeya",
      "category": "electric sedan"
    },
    {
      "name": "Evija",
      "category": "hypercar"
    }
  ],
  "McLaren": [
    {
      "name": "GT",
      "category": "sports coupe"
    },
    {
      "name": "570S",
      "category": "sports coupe"
    },
    {
      "name": "720S",
      "category": "sports coupe"
    },
    {
      "name": "750S",
      "category": "sports coupe"
    },
    {
      "name": "570S Spider",
      "category": "convertible"
    },
    {
      "name": "750S Spider",
      "category": "convertible"
    },
    {
      "name": "Artura Spider",
      "category": "convertible"
    },
    {
      "name": "Artura",
      "category": "supercar"
    },
    {
      "name": "765LT",
      "category": "supercar"
    },
    {
      "name": "P1",
      "category": "hypercar"
    },
    {
      "name": "Senna",
      "category": "hypercar"
    },
    {
      "name": "Speedtail",
      "category": "hypercar"
    },
    {
      "name": "W1",
      "category": "hypercar"
    },
    {
      "name": "Artura",
      "category": "hybrid"
    },
    {
      "name": "P1",
      "category": "hybrid"
    }
  ],
  "MG (Morris Garages)": [
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
      "category": "compact suv"
    },
    {
      "name": "ZS",
      "category": "compact suv"
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
      "name": "Comet EV",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "ZS EV",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "MG4 EV",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Cyberster",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Cyberster",
      "category": "sports car"
    }
  ],
  "Vauxhall": [
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
      "name": "Astra Sports Tourer",
      "category": "wagon"
    },
    {
      "name": "Insignia Sports Tourer",
      "category": "wagon"
    },
    {
      "name": "Combo",
      "category": "van"
    },
    {
      "name": "Vivaro",
      "category": "van"
    },
    {
      "name": "Movano",
      "category": "van"
    },
    {
      "name": "Corsa Electric",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Mokka Electric",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Astra Electric",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Vivaro Electric",
      "category": "electric vehicle (ev)"
    }
  ],
  "Ferrari": [
    {
      "name": "Roma",
      "category": "sports coupe"
    },
    {
      "name": "296 GTB",
      "category": "sports coupe"
    },
    {
      "name": "F8 Tributo",
      "category": "sports coupe"
    },
    {
      "name": "SF90 Stradale",
      "category": "sports coupe"
    },
    {
      "name": "12Cilindri Coupe",
      "category": "sports coupe"
    },
    {
      "name": "Roma Spider",
      "category": "sports convertible"
    },
    {
      "name": "296 GTS",
      "category": "sports convertible"
    },
    {
      "name": "SF90 Spider",
      "category": "sports convertible"
    },
    {
      "name": "12Cilindri Spider",
      "category": "sports convertible"
    },
    {
      "name": "GTC4Lusso",
      "category": "grand tourer (gt)"
    },
    {
      "name": "Purosangue",
      "category": "suv"
    },
    {
      "name": "LaFerrari",
      "category": "hypercar"
    },
    {
      "name": "F80",
      "category": "hypercar"
    },
    {
      "name": "SF90 Stradale",
      "category": "hybrid"
    },
    {
      "name": "SF90 Spider",
      "category": "hybrid"
    },
    {
      "name": "296 GTB",
      "category": "hybrid"
    },
    {
      "name": "296 GTS",
      "category": "hybrid"
    }
  ],
  "Lamborghini": [
    {
      "name": "Huracán",
      "category": "sports coupe"
    },
    {
      "name": "Temerario",
      "category": "sports coupe"
    },
    {
      "name": "Revuelto",
      "category": "sports coupe"
    },
    {
      "name": "Huracán Spyder",
      "category": "sports convertible"
    },
    {
      "name": "Revuelto Roadster (Upcoming)",
      "category": "sports convertible"
    },
    {
      "name": "Aventador",
      "category": "supercar"
    },
    {
      "name": "Revuelto",
      "category": "supercar"
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
      "name": "Sián",
      "category": "hypercar"
    },
    {
      "name": "Centenario",
      "category": "hypercar"
    },
    {
      "name": "Veneno",
      "category": "hypercar"
    },
    {
      "name": "Revuelto",
      "category": "hybrid"
    },
    {
      "name": "Urus SE",
      "category": "hybrid"
    }
  ],
  "Maserati": [
    {
      "name": "Ghibli",
      "category": "luxury sedan"
    },
    {
      "name": "Quattroporte",
      "category": "luxury sedan"
    },
    {
      "name": "Grecale",
      "category": "luxury suv"
    },
    {
      "name": "Levante",
      "category": "luxury suv"
    },
    {
      "name": "GranTurismo",
      "category": "sports coupe"
    },
    {
      "name": "GranCabrio",
      "category": "sports convertible"
    },
    {
      "name": "MC20",
      "category": "supercar"
    },
    {
      "name": "MC20 Cielo",
      "category": "supercar"
    },
    {
      "name": "GranTurismo Folgore",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "GranCabrio Folgore",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Grecale Folgore",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Ghibli Hybrid",
      "category": "hybrid"
    },
    {
      "name": "Grecale Hybrid",
      "category": "hybrid"
    }
  ],
  "Fiat": [
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
      "name": "Tipo Station Wagon",
      "category": "wagon"
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
      "category": "mpv"
    },
    {
      "name": "Ulysse",
      "category": "mpv"
    },
    {
      "name": "Fiorino",
      "category": "van"
    },
    {
      "name": "Ducato",
      "category": "van"
    },
    {
      "name": "Scudo",
      "category": "van"
    },
    {
      "name": "Strada",
      "category": "pickup truck"
    },
    {
      "name": "Toro",
      "category": "pickup truck"
    },
    {
      "name": "500e",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "E-Ducato",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Topolino",
      "category": "electric vehicle (ev)"
    }
  ],
  "Alfa Romeo": [
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
      "category": "sports coupe"
    },
    {
      "name": "8C Competizione",
      "category": "sports coupe"
    },
    {
      "name": "4C Spider",
      "category": "sports convertible"
    },
    {
      "name": "8C Spider",
      "category": "sports convertible"
    },
    {
      "name": "33 Stradale",
      "category": "supercar"
    },
    {
      "name": "Junior Elettrica",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Tonale Hybrid",
      "category": "hybrid"
    }
  ],
  "Lancia": [
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
      "category": "wagon"
    },
    {
      "name": "New Ypsilon EV",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Ypsilon Hybrid",
      "category": "hybrid"
    }
  ],
  "Pagani": [
    {
      "name": "Zonda",
      "category": "hypercar"
    },
    {
      "name": "Huayra",
      "category": "hypercar"
    },
    {
      "name": "Utopia",
      "category": "hypercar"
    },
    {
      "name": "Huayra Roadster",
      "category": "roadster"
    },
    {
      "name": "Zonda Roadster",
      "category": "roadster"
    },
    {
      "name": "Huayra Coupe",
      "category": "coupe"
    },
    {
      "name": "Utopia Coupe",
      "category": "coupe"
    }
  ],
  "Abarth": [
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
      "name": "Abarth Punto",
      "category": "sports hatchback"
    },
    {
      "name": "Abarth 500e",
      "category": "electric hatchback"
    },
    {
      "name": "Abarth 600e",
      "category": "electric hatchback"
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
      "name": "Kiger",
      "category": "compact suv"
    },
    {
      "name": "Captur",
      "category": "compact suv"
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
      "category": "mpv"
    },
    {
      "name": "Scenic",
      "category": "mpv"
    },
    {
      "name": "Kangoo",
      "category": "van"
    },
    {
      "name": "Trafic",
      "category": "van"
    },
    {
      "name": "Master",
      "category": "van"
    },
    {
      "name": "Alaskan",
      "category": "pickup truck"
    },
    {
      "name": "Oroch",
      "category": "pickup truck"
    },
    {
      "name": "Zoe",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Megane E-Tech",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Scenic E-Tech",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Renault 5 E-Tech",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Kangoo E-Tech",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Clio E-Tech",
      "category": "hybrid"
    },
    {
      "name": "Captur E-Tech",
      "category": "hybrid"
    },
    {
      "name": "Austral E-Tech",
      "category": "hybrid"
    },
    {
      "name": "Rafale E-Tech",
      "category": "hybrid"
    }
  ],
  "Peugeot": [
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
      "name": "308 SW",
      "category": "wagon"
    },
    {
      "name": "508 SW",
      "category": "wagon"
    },
    {
      "name": "2008",
      "category": "compact suv"
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
      "category": "mpv"
    },
    {
      "name": "Traveller",
      "category": "mpv"
    },
    {
      "name": "Partner",
      "category": "van"
    },
    {
      "name": "Expert",
      "category": "van"
    },
    {
      "name": "Boxer",
      "category": "van"
    },
    {
      "name": "Landtrek",
      "category": "pickup truck"
    },
    {
      "name": "e-208",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "e-2008",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "e-3008",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "e-308",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "e-5008",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "3008 Hybrid",
      "category": "hybrid"
    },
    {
      "name": "408 Hybrid",
      "category": "hybrid"
    },
    {
      "name": "508 Hybrid",
      "category": "hybrid"
    }
  ],
  "Citroën": [
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
      "name": "C-Elysée",
      "category": "sedan"
    },
    {
      "name": "C5 X",
      "category": "sedan"
    },
    {
      "name": "C3 Aircross",
      "category": "compact suv"
    },
    {
      "name": "C5 Aircross",
      "category": "suv"
    },
    {
      "name": "Berlingo",
      "category": "mpv"
    },
    {
      "name": "SpaceTourer",
      "category": "mpv"
    },
    {
      "name": "Berlingo Van",
      "category": "van"
    },
    {
      "name": "Jumpy",
      "category": "van"
    },
    {
      "name": "Jumper",
      "category": "van"
    },
    {
      "name": "e-C3",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "e-C4",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "e-Berlingo",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "e-SpaceTourer",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "C5 Aircross Hybrid",
      "category": "hybrid"
    },
    {
      "name": "C5 X Hybrid",
      "category": "hybrid"
    }
  ],
  "Bugatti": [
    {
      "name": "Veyron",
      "category": "hypercar"
    },
    {
      "name": "Chiron",
      "category": "hypercar"
    },
    {
      "name": "Tourbillon",
      "category": "hypercar"
    },
    {
      "name": "Chiron Coupe",
      "category": "coupe"
    },
    {
      "name": "Tourbillon Coupe",
      "category": "coupe"
    },
    {
      "name": "W16 Mistral",
      "category": "roadster"
    },
    {
      "name": "Chiron Super Sport",
      "category": "super sport"
    }
  ],
  "DS Automobiles": [
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
      "category": "compact suv"
    },
    {
      "name": "DS 7",
      "category": "suv"
    },
    {
      "name": "DS N°8",
      "category": "suv"
    },
    {
      "name": "DS 3 E-Tense",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "DS N°8",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "DS 4 Plug-in Hybrid",
      "category": "plug-in hybrid (phev)"
    },
    {
      "name": "DS 7 Plug-in Hybrid",
      "category": "plug-in hybrid (phev)"
    },
    {
      "name": "DS 9 Plug-in Hybrid",
      "category": "plug-in hybrid (phev)"
    }
  ],
  "Alpine": [
    {
      "name": "A110",
      "category": "sports coupe"
    },
    {
      "name": "A110 Roadster (limited editions)",
      "category": "convertible"
    },
    {
      "name": "A110 GT",
      "category": "sports car"
    },
    {
      "name": "A110 R",
      "category": "sports car"
    },
    {
      "name": "A290",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "A390 (Upcoming)",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Alpine A290",
      "category": "performance ev"
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
      "name": "V60",
      "category": "wagon / estate"
    },
    {
      "name": "V90",
      "category": "wagon / estate"
    },
    {
      "name": "EX30",
      "category": "compact suv"
    },
    {
      "name": "XC40",
      "category": "compact suv"
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
      "name": "EX30",
      "category": "electric suv"
    },
    {
      "name": "EX40",
      "category": "electric suv"
    },
    {
      "name": "EC40",
      "category": "electric suv"
    },
    {
      "name": "EX90",
      "category": "electric suv"
    },
    {
      "name": "ES90",
      "category": "electric sedan"
    },
    {
      "name": "EM90",
      "category": "mpv"
    },
    {
      "name": "XC60 Recharge",
      "category": "hybrid"
    },
    {
      "name": "XC90 Recharge",
      "category": "hybrid"
    },
    {
      "name": "S60 Recharge",
      "category": "hybrid"
    },
    {
      "name": "S90 Recharge",
      "category": "hybrid"
    },
    {
      "name": "V60 Recharge",
      "category": "hybrid"
    },
    {
      "name": "S60 Polestar Engineered",
      "category": "performance (polestar engineered)"
    },
    {
      "name": "V60 Polestar Engineered",
      "category": "performance (polestar engineered)"
    },
    {
      "name": "XC60 Polestar Engineered",
      "category": "performance (polestar engineered)"
    }
  ],
  "Polestar": [
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
      "name": "Polestar 1",
      "category": "grand tourer (gt)"
    },
    {
      "name": "Polestar 5 (Upcoming)",
      "category": "luxury sedan"
    },
    {
      "name": "Polestar 6 (Upcoming)",
      "category": "roadster"
    },
    {
      "name": "Entire Polestar lineup",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Polestar 1",
      "category": "grand tourer (gt)"
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
      "name": "Polestar 6 (Upcoming)",
      "category": "roadster"
    },
    {
      "name": "Entire Polestar lineup",
      "category": "electric vehicle (ev)"
    }
  ],
  "Koenigsegg": [
    {
      "name": "Jesko",
      "category": "hypercar"
    },
    {
      "name": "Gemera",
      "category": "hypercar"
    },
    {
      "name": "Regera",
      "category": "hypercar"
    },
    {
      "name": "Agera",
      "category": "hypercar"
    },
    {
      "name": "CC850",
      "category": "hypercar"
    },
    {
      "name": "Jesko Absolut",
      "category": "coupe"
    },
    {
      "name": "Agera RS",
      "category": "coupe"
    },
    {
      "name": "Gemera",
      "category": "grand tourer (gt)"
    },
    {
      "name": "Regera",
      "category": "hybrid hypercar"
    },
    {
      "name": "Gemera",
      "category": "hybrid hypercar"
    }
  ],
  "Saab": [
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
      "category": "wagon / estate"
    },
    {
      "name": "9-5 SportCombi",
      "category": "wagon / estate"
    },
    {
      "name": "9-3 Convertible",
      "category": "convertible"
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
      "name": "Atto 2",
      "category": "compact suv"
    },
    {
      "name": "Yuan Plus (Atto 3)",
      "category": "compact suv"
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
      "category": "mpv"
    },
    {
      "name": "M6",
      "category": "mpv"
    },
    {
      "name": "Shark",
      "category": "pickup truck"
    },
    {
      "name": "Dolphin",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Seal",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Atto 3",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Seagull",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Sea Lion",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Song DM-i",
      "category": "plug-in hybrid (phev)"
    },
    {
      "name": "Qin Plus DM-i",
      "category": "plug-in hybrid (phev)"
    },
    {
      "name": "Tang DM-i",
      "category": "plug-in hybrid (phev)"
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
      "name": "Atto 2",
      "category": "compact suv"
    },
    {
      "name": "Atto 3 (Yuan Plus)",
      "category": "compact suv"
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
      "category": "mpv"
    },
    {
      "name": "M6",
      "category": "mpv"
    },
    {
      "name": "Shark",
      "category": "pickup truck"
    },
    {
      "name": "Entire EV lineup",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Song DM-i",
      "category": "plug-in hybrid (phev)"
    },
    {
      "name": "Qin DM-i",
      "category": "plug-in hybrid (phev)"
    },
    {
      "name": "Tang DM-i",
      "category": "plug-in hybrid (phev)"
    }
  ],
  "MG Motor": [
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
      "category": "compact suv"
    },
    {
      "name": "ZS",
      "category": "compact suv"
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
      "name": "Comet EV",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "ZS EV",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "MG4 EV",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Cyberster",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Cyberster",
      "category": "sports car"
    }
  ],
  "Chery": [
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
      "category": "compact suv"
    },
    {
      "name": "Tiggo 4",
      "category": "compact suv"
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
      "category": "electric vehicle (ev)"
    },
    {
      "name": "eQ7",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Tiggo Hybrid",
      "category": "hybrid"
    }
  ],
  "Geely": [
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
      "category": "mpv"
    },
    {
      "name": "Geometry C",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Galaxy E8",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Galaxy L7",
      "category": "hybrid"
    },
    {
      "name": "Monjaro Hybrid",
      "category": "hybrid"
    }
  ],
  "Great Wall Motors (GWM)": [
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
      "category": "pickup truck"
    },
    {
      "name": "Cannon",
      "category": "pickup truck"
    },
    {
      "name": "Ora lineup (sub-brand)",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Tank Hybrid",
      "category": "hybrid"
    }
  ],
  "Haval": [
    {
      "name": "Jolion",
      "category": "compact suv"
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
      "category": "hybrid"
    },
    {
      "name": "Jolion Hybrid",
      "category": "hybrid"
    }
  ],
  "NIO": [
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
      "name": "ET5 Touring",
      "category": "wagon"
    },
    {
      "name": "Entire NIO lineup",
      "category": "electric vehicle (ev)"
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
      "name": "ET5 Touring",
      "category": "wagon"
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
      "category": "electric vehicle (ev)"
    }
  ],
  "XPeng": [
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
      "category": "mpv"
    },
    {
      "name": "Entire XPeng lineup",
      "category": "electric vehicle (ev)"
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
      "category": "mpv"
    },
    {
      "name": "Entire XPeng lineup",
      "category": "electric vehicle (ev)"
    }
  ],
  "Li Auto": [
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
      "category": "mpv"
    },
    {
      "name": "Entire Li Auto lineup",
      "category": "extended-range electric vehicle (erev)"
    }
  ],
  "Zeekr": [
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
      "category": "mpv"
    },
    {
      "name": "Entire Zeekr lineup",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Zeekr 001",
      "category": "hatchback / shooting brake"
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
      "category": "mpv"
    },
    {
      "name": "Entire Zeekr lineup",
      "category": "electric vehicle (ev)"
    }
  ],
  "Hongqi": [
    {
      "name": "H5",
      "category": "sedan"
    },
    {
      "name": "H9",
      "category": "sedan"
    },
    {
      "name": "L5",
      "category": "luxury sedan"
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
      "category": "mpv"
    },
    {
      "name": "E-QM5",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "E-HS9",
      "category": "electric vehicle (ev)"
    }
  ],
  "JAC Motors": [
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
      "category": "pickup truck"
    },
    {
      "name": "T8",
      "category": "pickup truck"
    },
    {
      "name": "T9",
      "category": "pickup truck"
    },
    {
      "name": "Sunray",
      "category": "van"
    },
    {
      "name": "iEV Series",
      "category": "electric vehicle (ev)"
    }
  ],
  "BAIC": [
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
      "category": "pickup truck"
    },
    {
      "name": "EU5",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "EX5",
      "category": "electric vehicle (ev)"
    }
  ],
  "Dongfeng": [
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
      "category": "pickup truck"
    },
    {
      "name": "Forthing",
      "category": "mpv"
    },
    {
      "name": "Nammi EV",
      "category": "electric vehicle (ev)"
    }
  ],
  "FAW": [
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
      "category": "mpv"
    },
    {
      "name": "Bestune Pony",
      "category": "electric vehicle (ev)"
    }
  ],
  "GAC": [
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
      "category": "mpv"
    },
    {
      "name": "Aion S",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Aion Y",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Hyper GT",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "GS8 Hybrid",
      "category": "hybrid"
    }
  ],
  "Leapmotor": [
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
      "category": "electric vehicle (ev)"
    },
    {
      "name": "C10 EREV",
      "category": "extended-range ev"
    },
    {
      "name": "C11 EREV",
      "category": "extended-range ev"
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
      "name": "Entire EV lineup",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "C10 EREV",
      "category": "extended-range electric vehicle (erev)"
    },
    {
      "name": "C11 EREV",
      "category": "extended-range electric vehicle (erev)"
    }
  ],
  "Ora": [
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
      "category": "electric vehicle (ev)"
    }
  ],
  "Wuling": [
    {
      "name": "Bingo",
      "category": "hatchback"
    },
    {
      "name": "Hongguang",
      "category": "mpv"
    },
    {
      "name": "Hongguang Mini EV",
      "category": "mpv"
    },
    {
      "name": "Rongguang",
      "category": "van"
    },
    {
      "name": "Zhengtu",
      "category": "pickup truck"
    },
    {
      "name": "Mini EV",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Bingo EV",
      "category": "electric vehicle (ev)"
    },
    {
      "name": "Air EV",
      "category": "electric vehicle (ev)"
    }
  ],
  "Lucid": [
    {
      "name": "Lucid Air",
      "category": "luxury sedan"
    },
    {
      "name": "Lucid Gravity",
      "category": "luxury suv"
    },
    {
      "name": "Entire Lucid lineup",
      "category": "electric vehicle (ev)"
    }
  ],
  "VinFast": [
    {
      "name": "VF e34",
      "category": "hatchback"
    },
    {
      "name": "VF 6",
      "category": "compact suv"
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
      "category": "pickup truck"
    },
    {
      "name": "Entire VinFast lineup",
      "category": "electric vehicle (ev)"
    }
  ]
}