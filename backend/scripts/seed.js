/**
 * Seeds all platform data used in /admin/settings/platform and driver onboarding.
 *
 * Run from backend/:
 *   npm run seed           — upsert; keeps existing catalog docs
 *   npm run seed:fresh     — delete catalog data first, then seed
 *   node scripts/seed.js --fresh
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import FuelType from '../src/models/fuelType.model.js';
import CarBrand from '../src/models/carBrand.model.js';
import CarModel from '../src/models/carModel.model.js';
import CarType from '../src/models/carType.model.js';
import PlatformCondition from '../src/models/platformCondition.model.js';
import Bank from '../src/models/bank.model.js';
import { BRAND_MODELS, CATEGORIES, FUEL_TYPES } from './data/vehicleCatalog.data.js';
import { REGISTRATION_CONDITIONS } from './data/platformConditions.data.js';
import { BANKS } from './data/banks.data.js';
import { resolveCarBrandLogoUrl } from '../src/utils/carBrandLogo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const CLEAR_FLAGS = new Set(['--fresh', '--clear', '--reset']);

function wantsClearOldData(argv = process.argv.slice(2)) {
  return argv.some((arg) => CLEAR_FLAGS.has(arg));
}

async function connectDb() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.DB_NAME;

  if (!uri || !dbName) {
    throw new Error('MONGO_URI and DB_NAME must be set in backend/.env');
  }

  await mongoose.connect(uri, { dbName });
  console.log(`Connected to MongoDB (database: ${dbName})`);
}

async function disconnectDb() {
  await mongoose.disconnect();
}

/**
 * Removes previously seeded vehicle-catalog + registration-checklist docs.
 * Call this only when you want a clean slate before seeding.
 * Order matters: models first (they ref brands / categories).
 */
async function clearOldData() {
  const [models, brands, categories, fuels, conditions, banks] = await Promise.all([
    CarModel.deleteMany({}),
    CarBrand.deleteMany({}),
    CarType.deleteMany({}),
    FuelType.deleteMany({}),
    PlatformCondition.deleteMany({}),
    Bank.deleteMany({}),
  ]);

  return {
    models: models.deletedCount || 0,
    brands: brands.deletedCount || 0,
    categories: categories.deletedCount || 0,
    fuelTypes: fuels.deletedCount || 0,
    conditions: conditions.deletedCount || 0,
    banks: banks.deletedCount || 0,
  };
}

async function upsertCategory({ name, description, image }) {
  const key = String(name).trim().toUpperCase();
  const existing = await CarType.findOne({
    name: new RegExp(`^${escapeRegex(key)}$`, 'i'),
  });
  if (existing) {
    existing.name = key;
    existing.description = description || '';
    if (image) existing.image = image;
    existing.isActive = true;
    await existing.save();
    return existing;
  }
  return CarType.create({
    name: key,
    description: description || '',
    image: image || '',
    isActive: true,
  });
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function seedVehicleCatalog() {
  let fuelCount = 0;
  for (const fuel of FUEL_TYPES) {
    const fuelName = String(fuel.name).trim().toUpperCase();
    const existingFuel = await FuelType.findOne({
      name: new RegExp(`^${escapeRegex(fuelName)}$`, 'i'),
    });
    if (existingFuel) {
      existingFuel.name = fuelName;
      existingFuel.sortOrder = fuel.sortOrder ?? fuelCount;
      existingFuel.isActive = true;
      await existingFuel.save();
    } else {
      await FuelType.create({
        name: fuelName,
        sortOrder: fuel.sortOrder ?? fuelCount,
        isActive: true,
      });
    }
    fuelCount += 1;
  }

  const categoryMap = {};
  for (const cat of CATEGORIES) {
    const doc = await upsertCategory(cat);
    categoryMap[cat.name.toUpperCase()] = doc;
  }

  let brandCount = 0;
  let modelCount = 0;
  const brandNames = Object.keys(BRAND_MODELS);

  for (let i = 0; i < brandNames.length; i += 1) {
    const rawBrandName = brandNames[i];
    const brandName = String(rawBrandName).trim().toUpperCase();
    const logo = resolveCarBrandLogoUrl(rawBrandName);
    let brand = await CarBrand.findOne({
      name: new RegExp(`^${escapeRegex(brandName)}$`, 'i'),
    });
    if (brand) {
      brand.name = brandName;
      brand.logo = logo;
      brand.sortOrder = i;
      brand.isActive = true;
      await brand.save();
    } else {
      brand = await CarBrand.create({
        name: brandName,
        logo,
        sortOrder: i,
        isActive: true,
      });
    }
    brandCount += 1;

    const models = BRAND_MODELS[rawBrandName];
    for (let j = 0; j < models.length; j += 1) {
      const { name: rawModelName, category } = models[j];
      const modelName = String(rawModelName).trim().toUpperCase();
      const categoryKey = String(category || '').trim().toUpperCase();
      const carType = categoryMap[categoryKey] || categoryMap.SEDAN;

      let model = await CarModel.findOne({
        brandId: brand._id,
        name: new RegExp(`^${escapeRegex(modelName)}$`, 'i'),
      });
      if (model) {
        model.name = modelName;
        model.carTypeId = carType._id;
        model.sortOrder = j;
        model.isActive = true;
        await model.save();
      } else {
        await CarModel.create({
          name: modelName,
          brandId: brand._id,
          carTypeId: carType._id,
          sortOrder: j,
          isActive: true,
        });
      }
      modelCount += 1;
    }
  }

  return { categories: CATEGORIES.length, fuelTypes: fuelCount, brands: brandCount, models: modelCount };
}

async function seedRegistrationConditions() {
  let count = 0;
  for (const item of REGISTRATION_CONDITIONS) {
    await PlatformCondition.findOneAndUpdate(
      { key: item.key.toLowerCase() },
      {
        question: item.question,
        key: item.key.toLowerCase(),
        isRequired: item.isRequired ?? false,
        isActive: true,
      },
      { upsert: true },
    );
    count += 1;
  }
  return { conditions: count };
}

async function seedBanks() {
  let count = 0;
  for (let i = 0; i < BANKS.length; i += 1) {
    const name = BANKS[i];
    await Bank.findOneAndUpdate(
      { name },
      { name, sortOrder: i, isActive: true },
      { upsert: true },
    );
    count += 1;
  }
  return { banks: count };
}

async function main() {
  const clearFirst = wantsClearOldData();
  await connectDb();

  if (clearFirst) {
    console.log('\n▶ Clearing old seed data');
    const cleared = await clearOldData();
    console.log(`  Models: ${cleared.models}`);
    console.log(`  Brands: ${cleared.brands}`);
    console.log(`  Categories: ${cleared.categories}`);
    console.log(`  Fuel types: ${cleared.fuelTypes}`);
    console.log(`  Conditions: ${cleared.conditions}`);
    console.log(`  Banks: ${cleared.banks}`);
  } else {
    console.log('\n▶ Keeping existing data (upsert mode)');
  }

  console.log('\n▶ Vehicle catalog');
  const catalog = await seedVehicleCatalog();
  console.log(`  Categories: ${catalog.categories}`);
  console.log(`  Fuel types: ${catalog.fuelTypes}`);
  console.log(`  Brands: ${catalog.brands}`);
  console.log(`  Models: ${catalog.models}`);

  console.log('\n▶ Registration checklist');
  const checklist = await seedRegistrationConditions();
  console.log(`  Conditions: ${checklist.conditions}`);

  console.log('\n▶ Banks');
  const banks = await seedBanks();
  console.log(`  Banks: ${banks.banks}`);

  console.log('\nSeed complete.');
  await disconnectDb();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
