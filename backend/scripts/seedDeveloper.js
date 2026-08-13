/**
 * Upserts the internal developer QA account for the admin dev booking test panel.
 *
 * Run from backend/:
 *   npm run seed:developer
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import User from '../src/models/user.model.js';
import { USER_ROLES } from '../src/constants/roles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const DEV_EMAIL = 'dev@sparedriver.com';
const DEV_PASSWORD = 'raj@dev123';
const DEV_NAME = 'Developer QA';

async function main() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.DB_NAME;
  if (!uri || !dbName) {
    throw new Error('MONGO_URI and DB_NAME must be set in backend/.env');
  }

  await mongoose.connect(uri, { dbName });
  console.log(`Connected to MongoDB (database: ${dbName})`);

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  const user = await User.findOneAndUpdate(
    { email: DEV_EMAIL },
    {
      $set: {
        name: DEV_NAME,
        email: DEV_EMAIL,
        password: passwordHash,
        phone_no: '+910999999999',
        role: USER_ROLES.DEVELOPER,
        isActive: true,
        isDeleted: false,
        authProvider: 'local',
        isEmailVerified: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  console.log(`Developer account ready: ${user.email} (role: ${user.role})`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
