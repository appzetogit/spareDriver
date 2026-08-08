import { Driver } from '../models/driverModels/driver.model.js';
import DriverKit from '../models/driverKit.model.js';
import KitOrder from '../models/kitOrder.model.js';
import { PAYMENT_STATUS, KIT_ADMIN_STATUS } from '../constants/kitStatus.js';
import { isDriverTrainingComplete } from './driverTraining.util.js';

export async function getActiveKits() {
  return DriverKit.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }).lean();
}

function eligibilityCode(reasons, { hasKitGap = false, trainingComplete = true, noKits = false } = {}) {
  if (!reasons.length) return noKits ? 'NO_KIT_REQUIRED' : 'ELIGIBLE';
  const onlyTraining =
    reasons.length === 1 && reasons[0].toLowerCase().includes('training');
  if (onlyTraining) return 'TRAINING_REQUIRED';
  if (hasKitGap && !trainingComplete) return 'KIT_AND_TRAINING_REQUIRED';
  if (hasKitGap) return 'KIT_REQUIRED';
  return 'NOT_ELIGIBLE';
}

export async function getDriverKitEligibility(driverId) {
  const driver = await Driver.findById(driverId).lean();
  if (!driver) {
    return { allowed: false, code: 'DRIVER_NOT_FOUND', reasons: ['Driver not found'] };
  }

  const reasons = [];

  if (driver.approvalStatus !== 'approved') {
    reasons.push('Driver account is not approved yet');
  }
  if ((driver.onboardingStep || 0) < 6) {
    reasons.push('Complete onboarding before going online');
  }
  if (driver.approvalStatus === 'suspended') {
    reasons.push('Your account is suspended');
  }

  const trainingComplete = await isDriverTrainingComplete(driver);
  if (!trainingComplete) {
    reasons.push('Complete all required training videos before going online');
  }

  const activeKits = await getActiveKits();
  if (!activeKits.length) {
    return {
      allowed: reasons.length === 0,
      code: eligibilityCode(reasons, { trainingComplete, noKits: true }),
      reasons,
      activeKits: [],
      activeOrder: null,
      trainingComplete,
    };
  }

  const kitIds = activeKits.map((k) => k._id);

  const approvedOrder = await KitOrder.findOne({
    driverId,
    kitId: { $in: kitIds },
    paymentStatus: PAYMENT_STATUS.PAID,
    adminStatus: KIT_ADMIN_STATUS.APPROVED,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (approvedOrder) {
    return {
      allowed: reasons.length === 0,
      code: eligibilityCode(reasons, { trainingComplete }),
      reasons,
      activeKits,
      activeOrder: approvedOrder,
      trainingComplete,
    };
  }

  const pendingOrder = await KitOrder.findOne({
    driverId,
    kitId: { $in: kitIds },
    paymentStatus: { $in: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.PAID] },
    adminStatus: { $in: [KIT_ADMIN_STATUS.PENDING, KIT_ADMIN_STATUS.APPROVED] },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (pendingOrder?.paymentStatus === PAYMENT_STATUS.PENDING) {
    reasons.push('Complete payment for your selected kit');
  } else if (
    pendingOrder?.paymentStatus === PAYMENT_STATUS.PAID &&
    pendingOrder?.adminStatus === KIT_ADMIN_STATUS.PENDING
  ) {
    reasons.push('Your kit purchase is awaiting admin approval');
  } else {
    reasons.push('Purchase a driver kit to go online');
  }

  return {
    allowed: false,
    code: eligibilityCode(reasons, { hasKitGap: true, trainingComplete }),
    reasons,
    activeKits,
    activeOrder: pendingOrder,
    trainingComplete,
  };
}

export async function syncDriverKitEligibility(driverId) {
  const eligibility = await getDriverKitEligibility(driverId);
  await Driver.findByIdAndUpdate(driverId, {
    canGoOnline: eligibility.allowed,
    activeKitOrderId: eligibility.activeOrder?._id || null,
    kitEligibilityCheckedAt: new Date(),
  });
  return eligibility;
}
