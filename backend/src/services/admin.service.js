import mongoose from 'mongoose';
import { Driver } from '../models/driverModels/driver.model.js';
import User from '../models/user.model.js';
import Car from '../models/user/car.model.js';
import bcrypt from 'bcryptjs';
import { ApiError } from '../utils/apiError.js';
import { USER_ROLES } from '../constants/roles.js';
import { STAFF_ROLES } from '../constants/staffPermissions.js';
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

function staffDisplayName(staff) {
  return staff?.name || staff?.email || 'Staff';
}

function appendApprovalHistory(driver, { status, by, byName = '', note = '' }) {
  if (!Array.isArray(driver.approvalHistory)) {
    driver.approvalHistory = [];
  }
  driver.approvalHistory.push({
    status,
    note: (note || '').trim(),
    by: by || null,
    byName: byName || '',
    at: new Date(),
  });
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

export const loginStaffService = async (email, password) => {
  if (!email || !password) {
    throw new ApiError(400, 'Email and password required');
  }
  console.log("email and password is ", email, password);
  const staff = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!staff || !STAFF_ROLES.includes(staff.role)) {
    throw new ApiError(401, 'Invalid credentials or unauthorized');
  }

  if (!staff.isActive) {
    throw new ApiError(403, 'Your account has been deactivated. Please contact the administrator.');
  }

  const isMatch = await bcrypt.compare(password, staff.password);
  if (!isMatch) {
    console.log("password did not match");
    throw new ApiError(401, 'Invalid credentials');
  }

  staff.password = undefined;
  const payload = tokenPayloadFromUser(staff);

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    admin: staff,
  };
};

export const getStaffProfileService = async (staffId) => {
  const staff = await User.findById(staffId).select('-password');
  if (!staff || staff.isDeleted || !STAFF_ROLES.includes(staff.role)) {
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

  return {
    driver: doc,
    training,
    trainingComplete,
  };
};

export const updateDriverStatusService = async (staff, driverId, data) => {
  const { approvalStatus, approvalNote } = data;

  if (!['approved', 'rejected', 'suspended'].includes(approvalStatus)) {
    throw new ApiError(400, 'Invalid status');
  }

  const note = (approvalNote || '').trim();
  if (['approved', 'rejected'].includes(approvalStatus) && note.length < 10) {
    throw new ApiError(400, 'Approval note is required (minimum 10 characters) for approve or reject actions');
  }

  if (['approved', 'rejected'].includes(approvalStatus)) {
    await assertStaffCanActOnResource(staff, TASK_TYPE.DRIVER_REVIEW, driverId);
  }

  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  driver.approvalStatus = approvalStatus;
  driver.approvalNote = note;

  const actorName = staffDisplayName(staff);

  if (approvalStatus === 'approved') {
    driver.approvedAt = new Date();
    driver.approvedBy = staff._id;
    appendApprovalHistory(driver, {
      status: 'approved',
      by: staff._id,
      byName: actorName,
      note,
    });
  } else if (approvalStatus === 'rejected') {
    driver.approvedAt = null;
    driver.approvedBy = staff._id;
    appendApprovalHistory(driver, {
      status: 'rejected',
      by: staff._id,
      byName: actorName,
      note,
    });
  } else if (approvalStatus === 'suspended') {
    driver.isOnline = false;
    driver.isOnTrip = false;
    appendApprovalHistory(driver, {
      status: 'suspended',
      by: staff._id,
      byName: actorName,
      note,
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
  driver.approvalStatus = 'suspended';
  if (note) driver.approvalNote = note;
  driver.isOnline = false;
  driver.isOnTrip = false;

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
  appendApprovalHistory(driver, {
    status: 'unsuspended',
    by: staffId,
    byName,
    note: '',
  });

  await driver.save();
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
 * both create + update so the team_member zone-scoped emergency-pool
 * filter has a clean array to work with.
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
    // Only team_member uses `assignedZones`; admin + sub_admin see all
    // zones regardless. Empty array for other roles keeps schemas tidy.
    assignedZones:
      role === USER_ROLES.TEAM_MEMBER ? normalizeAssignedZones(assignedZones) : [],
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
  // Zone assignments only matter for team_members (the others see all
  // emergency-pool entries regardless). Switching a member off of
  // team_member clears the array so stale data doesn't linger.
  if (assignedZones !== undefined) {
    staff.assignedZones =
      staff.role === USER_ROLES.TEAM_MEMBER
        ? normalizeAssignedZones(assignedZones)
        : [];
  } else if (staff.role !== USER_ROLES.TEAM_MEMBER && staff.assignedZones?.length) {
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
