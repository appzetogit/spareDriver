/**
 * Seeds all platform data used in /admin/settings/platform and driver onboarding.
 *
 * Run from backend/: npm run seed
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
import { BRAND_MODELS, CATEGORIES, FUEL_TYPES } from './data/vehicleCatalog.data.js';
import { REGISTRATION_CONDITIONS } from './data/platformConditions.data.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

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

async function upsertCategory({ name, description, image }) {
  const key = name.toLowerCase().trim();
  return CarType.findOneAndUpdate(
    { name: key },
    { name: key, description: description || '', image: image || '', isActive: true },
    { upsert: true, new: true },
  );
}

async function seedVehicleCatalog() {
  let fuelCount = 0;
  for (const fuel of FUEL_TYPES) {
    await FuelType.findOneAndUpdate(
      { name: fuel.name },
      { name: fuel.name, sortOrder: fuel.sortOrder ?? fuelCount, isActive: true },
      { upsert: true },
    );
    fuelCount += 1;
  }

  const categoryMap = {};
  for (const cat of CATEGORIES) {
    const doc = await upsertCategory(cat);
    categoryMap[cat.name] = doc;
  }

  let brandCount = 0;
  let modelCount = 0;
  const brandNames = Object.keys(BRAND_MODELS);

  for (let i = 0; i < brandNames.length; i += 1) {
    const brandName = brandNames[i];
    const brand = await CarBrand.findOneAndUpdate(
      { name: brandName },
      { name: brandName, sortOrder: i, isActive: true },
      { upsert: true, new: true },
    );
    brandCount += 1;

    const models = BRAND_MODELS[brandName];
    for (let j = 0; j < models.length; j += 1) {
      const { name: modelName, category } = models[j];
      const carType = categoryMap[category] || categoryMap.sedan;

      await CarModel.findOneAndUpdate(
        { brandId: brand._id, name: modelName },
        {
          name: modelName,
          brandId: brand._id,
          carTypeId: carType._id,
          sortOrder: j,
          isActive: true,
        },
        { upsert: true },
      );
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

async function main() {
  await connectDb();

  console.log('\n▶ Vehicle catalog');
  const catalog = await seedVehicleCatalog();
  console.log(`  Categories: ${catalog.categories}`);
  console.log(`  Fuel types: ${catalog.fuelTypes}`);
  console.log(`  Brands: ${catalog.brands}`);
  console.log(`  Models: ${catalog.models}`);

  console.log('\n▶ Registration checklist');
  const checklist = await seedRegistrationConditions();
  console.log(`  Conditions: ${checklist.conditions}`);

  console.log('\nSeed complete.');
  await disconnectDb();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
