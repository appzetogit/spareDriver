import bcrypt from 'bcryptjs';
import User from '../models/user.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  generateAccessToken,
  generateRefreshToken,
  tokenPayloadFromUser,
} from '../utils/jwt.util.js';
import { USER_ROLES } from '../constants/roles.js';

function sanitizeUser(doc) {
  const o = doc.toObject();
  delete o.password;
  o.needsPhone = !o.phone_no || !o.isPhoneVerified;
  return o;
}

import { OTP } from '../models/otp.model.js';
import { sendSmsOtp } from '../utils/otpService.js';

export const sendUserOtpService = async (phone) => {
  if (!phone || phone.length !== 10) {
    throw new ApiError(400, 'Valid 10-digit phone number required');
  }

  const existingUser = await User.findOne({ phone_no: phone });
  if (existingUser) {
    throw new ApiError(400, 'Number already exists, please login');
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await OTP.findOneAndUpdate({ phone }, { otp, expiresAt }, { upsert: true, new: true });

  await sendSmsOtp(phone, otp);
  return { message: 'OTP sent successfully' };
};

export const verifyUserOtpAndRegisterService = async ({ name, phone, password, otp }) => {
  if (!name || !phone || !password || !otp) {
    throw new ApiError(400, 'All fields are required');
  }

  const otpRecord = await OTP.findOne({ phone, otp });
  if (!otpRecord) {
    throw new ApiError(400, 'Invalid or expired OTP');
  }

  await OTP.deleteOne({ _id: otpRecord._id });

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const user = await User.create({
    name,
    email: `${phone}@phone.sparedriver.local`,
    phone_no: phone,
    password: hashedPassword,
    role: USER_ROLES.USER,
    authProvider: 'local',
    isPhoneVerified: true,
  });

  const payload = tokenPayloadFromUser(user);
  return {
    user: sanitizeUser(user),
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
};

export const loginUserService = async (phone, password) => {
  if (!phone || !password) {
    throw new ApiError(400, 'Phone and password required');
  }

  const user = await User.findOne({ phone_no: phone }).select('+password');
  if (!user || user.isDeleted) {
    throw new ApiError(401, 'Invalid credentials');
  }

  if (user.role !== USER_ROLES.USER) {
    throw new ApiError(401, 'Use the correct sign-in page for your account type');
  }

  if (user.authProvider === 'google') {
    throw new ApiError(401, 'This account uses Google sign-in');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid credentials');
  }

  const safeUser = await User.findById(user._id).select('-password');
  const payload = tokenPayloadFromUser(safeUser);
  return {
    user: sanitizeUser(safeUser),
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
};

import Car from '../models/user/car.model.js';
import PlatformCondition from '../models/platformCondition.model.js';
import { validateCarCatalogRefs } from './vehicleCatalog.service.js';

// ... (existing sanitize, etc.)

// ─── User Onboarding & Vehicle Services ──────────────────────────────────────

function buildConditionAnswerMap(conditions) {
  return new Map(
    (conditions || []).map((c) => [
      String(c.conditionId?._id ?? c.conditionId),
      c.value,
    ]),
  );
}

function isConditionSetComplete(activeConditions, answerMap) {
  if (!activeConditions.length) return true;

  const allAnswered = activeConditions.every(
    (c) => answerMap.get(String(c._id)) === true || answerMap.get(String(c._id)) === false,
  );
  const requiredMet = activeConditions
    .filter((c) => c.isRequired)
    .every((c) => answerMap.get(String(c._id)) === true);

  return allAnswered && requiredMet;
}

function validateAndNormalizeConditionsPayload(activeConditions, conditionsPayload) {
  if (!activeConditions.length) return [];

  const payloadMap = buildConditionAnswerMap(conditionsPayload);
  if (!isConditionSetComplete(activeConditions, payloadMap)) {
    throw new ApiError(400, 'Please answer all safety checklist questions and accept required items');
  }

  return activeConditions.map((c) => ({
    conditionId: c._id,
    value: payloadMap.get(String(c._id)),
  }));
}

function isCarChecklistComplete(car, activeConditions, legacyUserConditions) {
  const source = car.conditions?.length ? car.conditions : legacyUserConditions;
  return isConditionSetComplete(activeConditions, buildConditionAnswerMap(source));
}

/** Copy legacy user-level answers onto cars that predate per-car checklists. */
async function migrateUserConditionsToCars(user, cars) {
  if (!user.conditions?.length) return cars;

  const stale = cars.filter((c) => !c.conditions?.length);
  if (!stale.length) return cars;

  const snapshot = user.conditions.map((c) => ({
    conditionId: c.conditionId,
    value: c.value,
  }));

  await Promise.all(
    stale.map(async (car) => {
      car.conditions = snapshot;
      await car.save();
    }),
  );

  return Car.find({ userId: user._id, isActive: true })
    .populate('carTypeId', 'name')
    .populate('brandId', 'name')
    .populate('modelId', 'name')
    .populate('fuelTypeId', 'name')
    .sort({ createdAt: -1 });
}

async function isOnboardingComplete(user, cars) {
  if (!cars.length) return false;

  const activeConditions = await PlatformCondition.find({ isActive: true }).lean();
  return cars.every((car) => isCarChecklistComplete(car, activeConditions, user.conditions));
}

function buildChecklistView(activeConditions, answerMap) {
  return activeConditions.map((c) => ({
    _id: c._id,
    question: c.question,
    isRequired: c.isRequired,
    value: answerMap.get(String(c._id)) ?? null,
  }));
}

export const getUserProfileService = async (userId) => {
  const user = await User.findById(userId);
  if (!user || user.isDeleted || user.role !== USER_ROLES.USER) {
    throw new ApiError(404, 'User not found');
  }

  let cars = await Car.find({ userId, isActive: true })
    .populate('carTypeId', 'name')
    .populate('brandId', 'name')
    .populate('modelId', 'name')
    .populate('fuelTypeId', 'name')
    .populate('conditions.conditionId')
    .sort({ createdAt: -1 });

  cars = await migrateUserConditionsToCars(user, cars);

  const activeConditions = await PlatformCondition.find({ isActive: true }).lean();
  const carsWithChecklist = cars.map((car) => {
    const answerMap = buildConditionAnswerMap(
      car.conditions?.length ? car.conditions : user.conditions,
    );
    return {
      ...car.toObject(),
      checklist: buildChecklistView(activeConditions, answerMap),
      hasChecklist: isCarChecklistComplete(car, activeConditions, user.conditions),
    };
  });

  return {
    user: sanitizeUser(user),
    cars: carsWithChecklist,
    carsCount: carsWithChecklist.length,
    hasChecklist: await isOnboardingComplete(user, cars),
  };
};

export const getRegistrationStatusService = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');

  let cars = await Car.find({ userId, isActive: true });
  cars = await migrateUserConditionsToCars(user, cars);
  const carCount = cars.length;

  return {
    hasCar: carCount > 0,
    hasChecklist: await isOnboardingComplete(user, cars),
    carCount,
    needsPhone: !user.phone_no || !user.isPhoneVerified,
    user: sanitizeUser(user),
  };
};

export const updateUserOnboardingStepService = async (userId, data) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');

  await user.save();
  return sanitizeUser(user);
};

export const addCarService = async (userId, carData) => {
  const {
    carTypeId,
    brandId,
    modelId,
    fuelTypeId,
    vehicleNumber,
    transmission,
    image,
    conditions: conditionsPayload,
  } = carData;

  if (!carTypeId || !brandId || !modelId || !fuelTypeId || !vehicleNumber || !transmission) {
    throw new ApiError(400, 'All vehicle details are required');
  }

  await validateCarCatalogRefs({ carTypeId, brandId, modelId, fuelTypeId });

  const activeConditions = await PlatformCondition.find({ isActive: true }).lean();
  const normalizedConditions = validateAndNormalizeConditionsPayload(
    activeConditions,
    conditionsPayload,
  );

  const existingCount = await Car.countDocuments({ userId, isActive: true });
  if (existingCount >= 5) {
    throw new ApiError(400, 'You can only register up to 5 vehicles');
  }

  const exists = await Car.findOne({ vehicleNumber: vehicleNumber.toUpperCase(), isActive: true });
  if (exists) {
    throw new ApiError(400, 'This vehicle number is already registered');
  }

  const car = await Car.create({
    userId,
    carTypeId,
    brandId,
    modelId,
    fuelTypeId,
    vehicleNumber: vehicleNumber.toUpperCase(),
    transmission: String(transmission).toLowerCase(),
    image: image || '',
    conditions: normalizedConditions,
  });

  const populated = await Car.findById(car._id)
    .populate('carTypeId', 'name')
    .populate('brandId', 'name')
    .populate('modelId', 'name')
    .populate('fuelTypeId', 'name');

  const user = await User.findById(userId);
  const carCount = await Car.countDocuments({ userId, isActive: true });
  const allCars = await Car.find({ userId, isActive: true });
  return {
    car: populated,
    carCount,
    hasChecklist: await isOnboardingComplete(user, allCars),
  };
};

export const getUserCarsService = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');

  const cars = await Car.find({ userId, isActive: true });
  await migrateUserConditionsToCars(user, cars);

  return Car.find({ userId, isActive: true })
    .populate('carTypeId', 'name')
    .populate('brandId', 'name')
    .populate('modelId', 'name')
    .populate('fuelTypeId', 'name')
    .populate('conditions.conditionId', 'question description isRequired')
    .sort({ createdAt: -1 });
};

export const deleteUserCarService = async (userId, carId) => {
  const car = await Car.findOne({ _id: carId, userId });
  if (!car) throw new ApiError(404, 'Car not found');

  car.isActive = false;
  await car.save();
  return { id: carId };
};

export const updateCarService = async (userId, carId, carData) => {
  const {
    carTypeId,
    brandId,
    modelId,
    fuelTypeId,
    vehicleNumber,
    transmission,
    image,
    conditions: conditionsPayload,
  } = carData;

  if (!carTypeId || !brandId || !modelId || !fuelTypeId || !vehicleNumber || !transmission) {
    throw new ApiError(400, 'All vehicle details are required');
  }

  const car = await Car.findOne({ _id: carId, userId, isActive: true });
  if (!car) {
    throw new ApiError(404, 'Car not found');
  }

  await validateCarCatalogRefs({ carTypeId, brandId, modelId, fuelTypeId });

  const activeConditions = await PlatformCondition.find({ isActive: true }).lean();
  const normalizedConditions = validateAndNormalizeConditionsPayload(
    activeConditions,
    conditionsPayload,
  );

  if (vehicleNumber.toUpperCase() !== car.vehicleNumber) {
    const exists = await Car.findOne({ vehicleNumber: vehicleNumber.toUpperCase(), isActive: true });
    if (exists) {
      throw new ApiError(400, 'This vehicle number is already registered');
    }
  }

  car.carTypeId = carTypeId;
  car.brandId = brandId;
  car.modelId = modelId;
  car.fuelTypeId = fuelTypeId;
  car.vehicleNumber = vehicleNumber.toUpperCase();
  car.transmission = String(transmission).toLowerCase();
  car.image = image || '';
  car.conditions = normalizedConditions;

  await car.save();

  const populated = await Car.findById(car._id)
    .populate('carTypeId', 'name')
    .populate('brandId', 'name')
    .populate('modelId', 'name')
    .populate('fuelTypeId', 'name');

  const user = await User.findById(userId);
  const allCars = await Car.find({ userId, isActive: true });
  return {
    car: populated,
    carCount: allCars.length,
    hasChecklist: await isOnboardingComplete(user, allCars),
  };
};

// ─── Saved (favourite) locations ─────────────────────────────────────────────

const MAX_SAVED_LOCATIONS = 20;

function normalizeSavedLocationInput(payload = {}) {
  const lat = Number(payload.lat);
  const lng = Number(payload.lng);
  const address = typeof payload.address === 'string' ? payload.address.trim() : '';
  const label = typeof payload.label === 'string' ? payload.label.trim().slice(0, 60) : '';
  const city = typeof payload.city === 'string' ? payload.city.trim().slice(0, 120) : '';

  if (!address) throw new ApiError(400, 'Address is required');
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new ApiError(400, 'Invalid latitude');
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new ApiError(400, 'Invalid longitude');

  return { label, address: address.slice(0, 300), city, lat, lng };
}

export const listSavedLocationsService = async (userId) => {
  const user = await User.findById(userId).select('savedLocations');
  if (!user) throw new ApiError(404, 'User not found');
  // Newest first
  return [...(user.savedLocations || [])].sort(
    (a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0),
  );
};

export const addSavedLocationService = async (userId, payload) => {
  const next = normalizeSavedLocationInput(payload);

  const user = await User.findById(userId).select('savedLocations');
  if (!user) throw new ApiError(404, 'User not found');

  if ((user.savedLocations?.length || 0) >= MAX_SAVED_LOCATIONS) {
    throw new ApiError(400, `You can save up to ${MAX_SAVED_LOCATIONS} favourite locations`);
  }

  // De-dup on coords + label (rounded ~10m) so accidental double-taps don't
  // pile up identical entries.
  const dupe = (user.savedLocations || []).find(
    (loc) =>
      loc.label?.toLowerCase() === next.label.toLowerCase() &&
      Math.abs(loc.lat - next.lat) < 0.0001 &&
      Math.abs(loc.lng - next.lng) < 0.0001,
  );
  if (dupe) return dupe;

  user.savedLocations.push(next);
  await user.save();
  return user.savedLocations[user.savedLocations.length - 1];
};

export const deleteSavedLocationService = async (userId, locationId) => {
  const user = await User.findById(userId).select('savedLocations');
  if (!user) throw new ApiError(404, 'User not found');

  const before = user.savedLocations?.length || 0;
  user.savedLocations = (user.savedLocations || []).filter(
    (loc) => String(loc._id) !== String(locationId),
  );
  if (user.savedLocations.length === before) {
    throw new ApiError(404, 'Saved location not found');
  }
  await user.save();
  return { id: locationId };
};
