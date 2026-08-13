import mongoose from 'mongoose';
import { Driver } from '../models/driverModels/driver.model.js';
import User from '../models/user.model.js';
import Car from '../models/user/car.model.js';
import Booking from '../models/booking.model.js';
import bcrypt from 'bcryptjs';
import { ApiError } from '../utils/apiError.js';
import { USER_ROLES } from '../constants/roles.js';
import {
  STAFF_ROLES,
  PANEL_ROLES,
  getStaffZoneScopeIds,
  usesAssignedZoneScope,
} from '../constants/staffPermissions.js';
import { dedupeDocumentsByType } from '../utils/driverDocuments.util.js';
import {
  getActiveTrainingVideos,
  mergeTrainingProgress,
  isDriverTrainingComplete,
} from '../utils/driverTraining.util.js';
import {
  generateAccessToken,
  generateRefreshToken,
  tokenPayloadFromUser,
} from '../utils/jwt.util.js';
import {
  attachReviewTasks,
  assertStaffCanActOnResource,
  assertStaffCanAccessResource,
  completeTaskForResource,
  upsertDriverReviewTask,
  getResourceIdScopeForStaff,
} from './adminTask.service.js';
import { TASK_TYPE } from '../constants/adminTask.js';
import AdminTask from '../models/adminTask.model.js';
import { resolveAuthFcm } from './fcmToken.service.js';
import {
  DRIVER_REVIEW_STEPS,
  DRIVER_REVIEW_STEP_STATUS,
  DRIVER_REVIEW_STEP_LABELS,
  areAllReviewStepsApproved,
  createEmptyStepReviews,
} from '../constants/driverOnboarding.js';
import {
  notifyDriverAccountApproved,
  notifyDriverAccountRejected,
  notifyDriverAccountSuspended,
  notifyDriverAccountUnsuspended,
} from '../utils/notificationDispatch.js';

function staffDisplayName(staff) {
  return staff?.name || staff?.email || 'Staff';
}

function appendApprovalHistory(driver, { status, by, byName = '', note = '', stepReviews = null, submissionAttempt = null }) {
  if (!Array.isArray(driver.approvalHistory)) {
    driver.approvalHistory = [];
  }
  const entry = {
    status,
    note: (note || '').trim(),
    by: by || null,
    byName: byName || '',
    at: new Date(),
  };
  if (submissionAttempt != null) {
    entry.submissionAttempt = submissionAttempt;
  }
  if (stepReviews) {
    entry.stepReviews = stepReviews;
  }
  driver.approvalHistory.push(entry);
}

function ensureStepReviews(driver) {
  if (!driver.onboardingStepReviews) {
    driver.onboardingStepReviews = createEmptyStepReviews();
    return;
  }
  for (const key of DRIVER_REVIEW_STEPS) {
    if (!driver.onboardingStepReviews[key]) {
      driver.onboardingStepReviews[key] = {
        status: DRIVER_REVIEW_STEP_STATUS.PENDING,
        note: '',
        reviewedBy: null,
        reviewedByName: '',
        reviewedAt: null,
      };
    }
  }
}

/** If history was never written, surface the current approvedBy stamp once. */
function ensureLegacyApprovalHistory(doc) {
  if (Array.isArray(doc.approvalHistory) && doc.approvalHistory.length) {
    return doc;
  }
  const by = doc.approvedBy;
  if (!by && !doc.approvedAt) return doc;

  const status =
    doc.approvalStatus === 'rejected'
      ? 'rejected'
      : doc.approvalStatus === 'suspended'
        ? 'suspended'
        : 'approved';

  doc.approvalHistory = [
    {
      status,
      note: doc.approvalNote || '',
      by: by || null,
      byName:
        (typeof by === 'object' && (by.name || by.email)) || '',
      at: doc.approvedAt || doc.updatedAt || null,
    },
  ];
  return doc;
}

export const loginStaffService = async (email, password, fcmInput = {}) => {
  if (!email || !password) {
    throw new ApiError(400, 'Email and password required');
  }
  const staff = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!staff || !PANEL_ROLES.includes(staff.role)) {
    throw new ApiError(401, 'Invalid credentials or unauthorized');
  }

  if (!staff.isActive) {
    throw new ApiError(403, 'Your account has been deactivated. Please contact the administrator.');
  }

  const isMatch = await bcrypt.compare(password, staff.password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid credentials');
  }

  staff.password = undefined;
  const payload = tokenPayloadFromUser(staff);
  // Staff share the User document — reuse user FCM fields.
  const fcm = await resolveAuthFcm('user', staff._id, staff, fcmInput);

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    admin: staff,
    fcm,
  };
};

export const getStaffProfileService = async (staffId) => {
  const staff = await User.findById(staffId).select('-password');
  if (!staff || staff.isDeleted || !PANEL_ROLES.includes(staff.role)) {
    throw new ApiError(404, 'Profile not found');
  }
  return staff;
};

export const getCustomersService = async (query) => {
  const { search, page = 1, limit = 10 } = query;

  const filter = { role: USER_ROLES.USER, isDeleted: false };
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone_no: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const total = await User.countDocuments(filter);
  const users = await User.find(filter)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10));

  const userIds = users.map((u) => u._id);
  const carCounts = userIds.length
    ? await Car.aggregate([
        { $match: { userId: { $in: userIds }, isActive: true } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ])
    : [];

  const countMap = new Map(carCounts.map((c) => [String(c._id), c.count]));

  const data = users.map((u) => {
    const doc = u.toObject();
    doc.carsCount = countMap.get(String(u._id)) || 0;
    return doc;
  });

  return {
    data,
    pagination: {
      total,
      page: parseInt(page, 10),
      pages: Math.ceil(total / parseInt(limit, 10)) || 1,
    },
  };
};

export const getDriversService = async (staff, query) => {
  const { status, search, assigneeId, page = 1, limit = 10 } = query;

  const scope = await getResourceIdScopeForStaff(
    staff,
    TASK_TYPE.DRIVER_REVIEW,
    assigneeId,
    page,
    limit,
  );
  if (scope?.empty) {
    return { data: [], pagination: scope.pagination };
  }

  const filter = {};
  if (status) filter.approvalStatus = status;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }
  if (scope?.resourceIds) {
    filter._id = { $in: scope.resourceIds };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const total = await Driver.countDocuments(filter);
  const data = await Driver.find(filter)
    .populate('carTypeExperience', 'name')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const normalized = data.map((driver) => {
    const doc = driver.toObject();
    doc.documents = dedupeDocumentsByType(doc.documents);
    return doc;
  });

  const withTasks = await attachReviewTasks(staff, normalized, TASK_TYPE.DRIVER_REVIEW);

  return {
    data: withTasks,
    pagination: {
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    },
  };
};

export const getDriverByIdService = async (staff, driverId) => {
  await assertStaffCanAccessResource(staff, AdminTask, TASK_TYPE.DRIVER_REVIEW, driverId);

  const driver = await Driver.findById(driverId)
    .populate('carTypeExperience', 'name image')
    .populate('vehicleExperience.carTypeId', 'name')
    .populate('vehicleExperience.brandId', 'name')
    .populate('vehicleExperience.modelId', 'name')
    .populate('vehicleExperience.fuelTypeId', 'name')
    .populate('approvedBy', 'name email')
    .populate('approvalHistory.by', 'name email');

  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  const doc = ensureLegacyApprovalHistory(driver.toObject());
  doc.documents = dedupeDocumentsByType(doc.documents);
  if (Array.isArray(doc.approvalHistory)) {
    doc.approvalHistory = [...doc.approvalHistory].sort(
      (a, b) => new Date(b.at || 0) - new Date(a.at || 0),
    );
  }

  const videos = await getActiveTrainingVideos();
  const training = mergeTrainingProgress(videos, doc.trainingProgress);
  const trainingComplete = await isDriverTrainingComplete(driver);
  const allStepsApproved = areAllReviewStepsApproved(doc.onboardingStepReviews);

  return {
    driver: doc,
    training,
    trainingComplete,
    allStepsApproved,
    reviewSteps: DRIVER_REVIEW_STEPS.map((key) => ({
      key,
      label: DRIVER_REVIEW_STEP_LABELS[key],
      ...(doc.onboardingStepReviews?.[key] || { status: 'pending' }),
    })),
  };
};

export const updateDriverStepReviewService = async (staff, driverId, data) => {
  const { step, status, note = '' } = data || {};

  if (!DRIVER_REVIEW_STEPS.includes(step)) {
    throw new ApiError(400, 'Invalid review step');
  }
  if (![DRIVER_REVIEW_STEP_STATUS.APPROVED, DRIVER_REVIEW_STEP_STATUS.REJECTED].includes(status)) {
    throw new ApiError(400, 'Step status must be approved or rejected');
  }

  const trimmedNote = String(note || '').trim();
  if (status === DRIVER_REVIEW_STEP_STATUS.REJECTED && trimmedNote.length < 10) {
    throw new ApiError(400, 'A note (minimum 10 characters) is required when rejecting a step');
  }

  await assertStaffCanActOnResource(staff, TASK_TYPE.DRIVER_REVIEW, driverId);

  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  if (!['pending', 'under_review'].includes(driver.approvalStatus)) {
    throw new ApiError(400, 'Only applications under review can have steps verified');
  }

  ensureStepReviews(driver);

  const actorName = staffDisplayName(staff);
  driver.onboardingStepReviews[step] = {
    status,
    note: trimmedNote,
    reviewedBy: staff._id,
    reviewedByName: actorName,
    reviewedAt: new Date(),
  };
  driver.markModified('onboardingStepReviews');

  if (driver.approvalStatus === 'pending') {
    driver.approvalStatus = 'under_review';
  }

  await driver.save();

  return {
    step,
    label: DRIVER_REVIEW_STEP_LABELS[step],
    review: driver.onboardingStepReviews[step],
    allStepsApproved: areAllReviewStepsApproved(driver.onboardingStepReviews),
    onboardingStepReviews: driver.onboardingStepReviews,
    approvalStatus: driver.approvalStatus,
  };
};

export const updateDriverStatusService = async (staff, driverId, data) => {
  const { approvalStatus, approvalNote } = data;

  if (!['approved', 'rejected', 'suspended'].includes(approvalStatus)) {
    throw new ApiError(400, 'Invalid status');
  }

  const note = (approvalNote || '').trim();
  if (['approved', 'rejected', 'suspended'].includes(approvalStatus) && note.length < 10) {
    throw new ApiError(400, 'Approval note is required (minimum 10 characters) for approve, reject, or suspend actions');
  }

  if (['approved', 'rejected'].includes(approvalStatus)) {
    await assertStaffCanActOnResource(staff, TASK_TYPE.DRIVER_REVIEW, driverId);
  }

  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  if (approvalStatus === 'approved') {
    ensureStepReviews(driver);
    if (!areAllReviewStepsApproved(driver.onboardingStepReviews)) {
      throw new ApiError(
        400,
        'Verify and approve all onboarding steps before final approval',
      );
    }
  }

  driver.approvalStatus = approvalStatus;
  driver.approvalNote = note;

  const actorName = staffDisplayName(staff);

  if (approvalStatus === 'approved') {
    driver.approvedAt = new Date();
    driver.approvedBy = staff._id;
    driver.revisionInProgress = false;
    appendApprovalHistory(driver, {
      status: 'approved',
      by: staff._id,
      byName: actorName,
      note,
      submissionAttempt: driver.submissionCount || null,
      stepReviews: driver.onboardingStepReviews
        ? JSON.parse(JSON.stringify(driver.onboardingStepReviews))
        : null,
    });
  } else if (approvalStatus === 'rejected') {
    driver.approvedAt = null;
    driver.approvedBy = staff._id;
    driver.revisionInProgress = false;
    appendApprovalHistory(driver, {
      status: 'rejected',
      by: staff._id,
      byName: actorName,
      note,
      submissionAttempt: driver.submissionCount || null,
      stepReviews: driver.onboardingStepReviews
        ? JSON.parse(JSON.stringify(driver.onboardingStepReviews))
        : null,
    });
  } else if (approvalStatus === 'suspended') {
    driver.isOnline = false;
    driver.isOnTrip = false;
    appendApprovalHistory(driver, {
      status: 'suspended',
      by: staff._id,
      byName: actorName,
      note,
      submissionAttempt: driver.submissionCount || null,
    });
  }

  await driver.save();

  if (['approved', 'rejected'].includes(approvalStatus)) {
    await completeTaskForResource(staff, TASK_TYPE.DRIVER_REVIEW, driverId, {
      action: approvalStatus,
      note,
    });
  } else if (approvalStatus === 'suspended') {
    await upsertDriverReviewTask(driver);
  }

  if (approvalStatus === 'approved') {
    const { syncDriverKitEligibility } = await import('../utils/kitEligibility.util.js');
    await syncDriverKitEligibility(driverId);
  }

  const driverIdStr = String(driver._id);
  if (approvalStatus === 'approved') {
    notifyDriverAccountApproved(driverIdStr, { note }).catch(() => null);
  } else if (approvalStatus === 'rejected') {
    notifyDriverAccountRejected(driverIdStr, { note }).catch(() => null);
  } else if (approvalStatus === 'suspended') {
    notifyDriverAccountSuspended(driverIdStr, { note }).catch(() => null);
  }

  return driver;
};

export const suspendDriverService = async (staffOrId, driverId, data = {}) => {
  const staffId = staffOrId?._id || staffOrId;
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  if (driver.approvalStatus === 'suspended') {
    throw new ApiError(400, 'Driver is already suspended');
  }

  if (driver.approvalStatus !== 'approved') {
    throw new ApiError(400, 'Only approved drivers can be suspended');
  }

  const note = (data.note || data.approvalNote || '').trim();
  if (note.length < 10) {
    throw new ApiError(400, 'Suspension reason is required (minimum 10 characters)');
  }

  driver.approvalStatus = 'suspended';
  driver.approvalNote = note;
  driver.isOnline = false;
  driver.isOnTrip = false;
  driver.canGoOnline = false;

  let byName = staffOrId?.name || staffOrId?.email || '';
  if (!byName && staffId) {
    const actor = await User.findById(staffId).select('name email');
    byName = staffDisplayName(actor);
  }
  appendApprovalHistory(driver, {
    status: 'suspended',
    by: staffId,
    byName,
    note,
  });

  await driver.save();
  notifyDriverAccountSuspended(String(driver._id), { note }).catch(() => null);
  return driver;
};

export const unsuspendDriverService = async (staffOrId, driverId) => {
  const staffId = staffOrId?._id || staffOrId;
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  if (driver.approvalStatus !== 'suspended') {
    throw new ApiError(400, 'Driver is not suspended');
  }

  let byName = staffOrId?.name || staffOrId?.email || '';
  if (!byName && staffId) {
    const actor = await User.findById(staffId).select('name email');
    byName = staffDisplayName(actor);
  }

  driver.approvalStatus = 'approved';
  driver.approvedAt = new Date();
  driver.approvedBy = staffId;
  driver.approvalNote = '';
  appendApprovalHistory(driver, {
    status: 'unsuspended',
    by: staffId,
    byName,
    note: '',
  });

  await driver.save();
  notifyDriverAccountUnsuspended(String(driver._id)).catch(() => null);
  return driver;
};

async function assertSingleSuperAdmin(role, excludeUserId = null) {
  if (role !== USER_ROLES.ADMIN) return;

  const filter = { role: USER_ROLES.ADMIN, isDeleted: false };
  if (excludeUserId) filter._id = { $ne: excludeUserId };

  const count = await User.countDocuments(filter);
  if (count >= 1) {
    throw new ApiError(400, 'Only one super admin is allowed in the application');
  }
}

/**
 * Normalise an `assignedZones` payload into an array of valid ObjectIds.
 * Drops `null`/`undefined` and anything that can't be coerced. Used for
 * both create + update so zone-scoped staff (sub_admin + team_member)
 * filters have a clean array to work with.
 */
function normalizeAssignedZones(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((id) => {
      try {
        return new mongoose.Types.ObjectId(String(id));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export const addAdminMemberService = async (data) => {
  const {
    name,
    email,
    phone_no,
    password,
    role: requestedRole,
    assignedZones,
  } = data;

  if (!name || !email || !phone_no || !password) {
    throw new ApiError(400, 'Missing required fields');
  }

  const role =
    requestedRole && [USER_ROLES.SUB_ADMIN, USER_ROLES.TEAM_MEMBER].includes(requestedRole)
      ? requestedRole
      : USER_ROLES.TEAM_MEMBER;

  await assertSingleSuperAdmin(role);

  const existingUser = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { phone_no }],
  });
  if (existingUser) {
    if (existingUser.email?.toLowerCase() === email.toLowerCase()) {
      throw new ApiError(400, 'A team member with this email already exists');
    }
    if (existingUser.phone_no === phone_no) {
      throw new ApiError(400, 'A user with this phone number already exists');
    }
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const newAdmin = new User({
    name,
    email,
    phone_no,
    password: hashedPassword,
    role,
    // sub_admin + team_member are zone-scoped; super admin ignores this.
    assignedZones: usesAssignedZoneScope({ role })
      ? normalizeAssignedZones(assignedZones)
      : [],
  });

  await newAdmin.save();
  newAdmin.password = undefined;
  return newAdmin;
};

export const getAdminTeamService = async (query) => {
  const { search, page = 1, limit = 10 } = query;
  
  const filter = {
    role: { $in: [USER_ROLES.ADMIN, USER_ROLES.SUB_ADMIN, USER_ROLES.TEAM_MEMBER] },
  };

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  const total = await User.countDocuments(filter);
  const data = await User.find(filter)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  return {
    data,
    pagination: {
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    }
  };
};

export const updateAdminMemberService = async (id, data) => {
  const { name, email, phone_no, role, isActive, assignedZones } = data;
  const staff = await User.findById(id);
  
  if (!staff || !STAFF_ROLES.includes(staff.role)) {
    throw new ApiError(404, 'Staff member not found');
  }

  if (email || phone_no) {
    const orConditions = [];
    if (email) orConditions.push({ email: email.toLowerCase() });
    if (phone_no) orConditions.push({ phone_no });

    if (orConditions.length > 0) {
      const existingUser = await User.findOne({
        _id: { $ne: id },
        $or: orConditions,
      });
      if (existingUser) {
        if (email && existingUser.email?.toLowerCase() === email.toLowerCase()) {
          throw new ApiError(400, 'A team member with this email already exists');
        }
        if (phone_no && existingUser.phone_no === phone_no) {
          throw new ApiError(400, 'A user with this phone number already exists');
        }
      }
    }
  }

  if (name) staff.name = name;
  if (email) staff.email = email;
  if (phone_no) staff.phone_no = phone_no;
  if (role && STAFF_ROLES.includes(role)) {
    if (role === USER_ROLES.ADMIN) {
      await assertSingleSuperAdmin(role, staff._id);
    }
    if (staff.role === USER_ROLES.ADMIN && role !== USER_ROLES.ADMIN) {
      throw new ApiError(400, 'The super admin role cannot be changed');
    }
    staff.role = role;
  }
  if (isActive !== undefined) staff.isActive = isActive;
  // Zone assignments for sub_admin + team_member. Switching off those
  // roles clears the array so stale data doesn't linger.
  if (assignedZones !== undefined) {
    staff.assignedZones = usesAssignedZoneScope(staff)
      ? normalizeAssignedZones(assignedZones)
      : [];
  } else if (!usesAssignedZoneScope(staff) && staff.assignedZones?.length) {
    staff.assignedZones = [];
  }

  await staff.save();
  staff.password = undefined;
  return staff;
};

export const deleteAdminMemberService = async (id) => {
  const staff = await User.findById(id);
  if (!staff || !STAFF_ROLES.includes(staff.role)) {
    throw new ApiError(404, 'Staff member not found');
  }

  if (staff.role === USER_ROLES.ADMIN) {
    throw new ApiError(400, 'The super admin account cannot be deleted');
  }

  await User.findByIdAndDelete(id);
  return { id };
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Global admin header search — light results across users, drivers, bookings.
 * Min query length is enforced by the controller; this assumes a trimmed q.
 */
export const adminGlobalSearchService = async (staff, query = {}) => {
  const q = String(query.q || '').trim();
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 5, 1), 10);

  if (!q || q.length < 2) {
    return { users: [], drivers: [], bookings: [] };
  }

  const escaped = escapeRegex(q);
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(q);

  const userFilter = {
    role: USER_ROLES.USER,
    isDeleted: false,
    $or: [
      { name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
      { phone_no: { $regex: escaped, $options: 'i' } },
      ...(isObjectId ? [{ _id: q }] : []),
    ],
  };

  const driverFilter = {
    isDeleted: { $ne: true },
    $or: [
      { name: { $regex: escaped, $options: 'i' } },
      { phone: { $regex: escaped, $options: 'i' } },
      ...(isObjectId ? [{ _id: q }] : []),
    ],
  };

  const bookingFilter = { isDeleted: false };
  const zoneScope = getStaffZoneScopeIds(staff);
  let bookingsPromise = Promise.resolve([]);

  if (zoneScope !== null && !zoneScope.length) {
    bookingsPromise = Promise.resolve([]);
  } else {
    if (zoneScope !== null) {
      bookingFilter.zoneIds = { $in: zoneScope };
    }

    const bookingOr = [{ bookingNumber: { $regex: escaped, $options: 'i' } }];
    if (isObjectId) bookingOr.push({ _id: q });

    const [matchingUsersForBookings, matchingDriversForBookings] = await Promise.all([
      User.find({
        role: USER_ROLES.USER,
        isDeleted: false,
        $or: [
          { name: { $regex: escaped, $options: 'i' } },
          { phone_no: { $regex: escaped, $options: 'i' } },
        ],
      })
        .select('_id')
        .limit(50)
        .lean(),
      Driver.find({
        isDeleted: { $ne: true },
        $or: [
          { name: { $regex: escaped, $options: 'i' } },
          { phone: { $regex: escaped, $options: 'i' } },
        ],
      })
        .select('_id')
        .limit(50)
        .lean(),
    ]);

    if (matchingUsersForBookings.length) {
      bookingOr.push({ userId: { $in: matchingUsersForBookings.map((u) => u._id) } });
    }
    if (matchingDriversForBookings.length) {
      bookingOr.push({ driverId: { $in: matchingDriversForBookings.map((d) => d._id) } });
    }

    bookingFilter.$or = bookingOr;
    bookingsPromise = Booking.find(bookingFilter)
      .select('bookingNumber status serviceType bookingType userId driverId createdAt')
      .populate('userId', 'name phone_no')
      .populate('driverId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  const [users, drivers, bookings] = await Promise.all([
    User.find(userFilter)
      .select('name email phone_no profilePicture')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    Driver.find(driverFilter)
      .select('name phone approvalStatus profilePicture')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    bookingsPromise,
  ]);

  return {
    users: users.map((u) => ({
      _id: u._id,
      name: u.name || '',
      email: u.email || '',
      phone: u.phone_no || '',
      profilePicture: u.profilePicture || null,
    })),
    drivers: drivers.map((d) => ({
      _id: d._id,
      name: d.name || '',
      phone: d.phone || '',
      approvalStatus: d.approvalStatus || '',
      profilePicture: d.profilePicture || null,
    })),
    bookings: bookings.map((b) => ({
      _id: b._id,
      bookingNumber: b.bookingNumber || '',
      status: b.status || '',
      serviceType: b.serviceType || '',
      bookingType: b.bookingType || '',
      customerName: b.userId?.name || '',
      customerPhone: b.userId?.phone_no || '',
      driverName: b.driverId?.name || '',
    })),
  };
};
