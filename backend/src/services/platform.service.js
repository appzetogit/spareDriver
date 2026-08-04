import CarType from '../models/carType.model.js';
import PlatformCondition from '../models/platformCondition.model.js';
import TrainingVideo from '../models/trainingVideo.model.js';
import Bank from '../models/bank.model.js';
import { ApiError } from '../utils/apiError.js';
import { deleteFromCloudinary } from '../utils/cloudinary.js';

// ─── Car Types ────────────────────────────────────────────────────────────────

export const createCarTypeService = async (data) => {
  const { name, description, image } = data;
  if (!name) throw new ApiError(400, 'Car type name is required');
  
  const exists = await CarType.findOne({ name });
  if (exists) throw new ApiError(400, 'Car type already exists');

  return await CarType.create({ name, description, image });
};

export const getAllCarTypesService = async (onlyActive = false) => {
  const filter = onlyActive ? { isActive: true } : {};
  return await CarType.find(filter).sort({ name: 1 });
};

export const updateCarTypeService = async (id, data) => {
  const carType = await CarType.findByIdAndUpdate(id, data, { new: true });
  if (!carType) throw new ApiError(404, 'Car type not found');
  return carType;
};

export const deleteCarTypeService = async (id) => {
  const carType = await CarType.findByIdAndDelete(id);
  if (!carType) throw new ApiError(404, 'Car type not found');
  return { id };
};

// ─── Platform Conditions (Checklist) ──────────────────────────────────────────

export const createConditionService = async (data) => {
  const { question, key, isRequired } = data;
  if (!question || !key) throw new ApiError(400, 'Question and key are required');

  const exists = await PlatformCondition.findOne({ key: key.toLowerCase() });
  if (exists) throw new ApiError(400, 'Condition key already exists');

  return await PlatformCondition.create({ question, key: key.toLowerCase(), isRequired });
};

export const getAllConditionsService = async (onlyActive = false) => {
  const filter = onlyActive ? { isActive: true } : {};
  return await PlatformCondition.find(filter).sort({ createdAt: 1 });
};

export const updateConditionService = async (id, data) => {
  const condition = await PlatformCondition.findByIdAndUpdate(id, data, { new: true });
  if (!condition) throw new ApiError(404, 'Condition not found');
  return condition;
};

export const deleteConditionService = async (id) => {
  const condition = await PlatformCondition.findByIdAndDelete(id);
  if (!condition) throw new ApiError(404, 'Condition not found');
  return { id };
};

// ─── Driver training videos ───────────────────────────────────────────────────

export const createTrainingVideoService = async (data) => {
  const { title, description, videoUrl, cloudinaryPublicId, durationSeconds, isRequired, isActive, sortOrder } = data;

  if (!title || !videoUrl || !cloudinaryPublicId) {
    throw new ApiError(400, 'Title, video URL, and Cloudinary ID are required');
  }

  return TrainingVideo.create({
    title,
    description,
    videoUrl,
    cloudinaryPublicId,
    durationSeconds: durationSeconds || 0,
    isRequired: isRequired !== false,
    isActive: isActive !== false,
    sortOrder: sortOrder || 0,
  });
};

export const getAllTrainingVideosService = async (onlyActive = false) => {
  const filter = onlyActive ? { isActive: true } : {};
  return TrainingVideo.find(filter).sort({ sortOrder: 1, createdAt: 1 });
};

export const updateTrainingVideoService = async (id, data) => {
  const existing = await TrainingVideo.findById(id);
  if (!existing) throw new ApiError(404, 'Training video not found');

  const nextPublicId = data.cloudinaryPublicId || existing.cloudinaryPublicId;
  if (data.cloudinaryPublicId && data.cloudinaryPublicId !== existing.cloudinaryPublicId) {
    await deleteFromCloudinary(existing.cloudinaryPublicId, 'video');
  }

  existing.title = data.title ?? existing.title;
  existing.description = data.description ?? existing.description;
  existing.videoUrl = data.videoUrl ?? existing.videoUrl;
  existing.cloudinaryPublicId = nextPublicId;
  if (data.durationSeconds !== undefined) existing.durationSeconds = data.durationSeconds;
  if (data.isRequired !== undefined) existing.isRequired = data.isRequired;
  if (data.isActive !== undefined) existing.isActive = data.isActive;
  if (data.sortOrder !== undefined) existing.sortOrder = data.sortOrder;

  await existing.save();
  return existing;
};

export const deleteTrainingVideoService = async (id) => {
  const video = await TrainingVideo.findById(id);
  if (!video) throw new ApiError(404, 'Training video not found');

  await deleteFromCloudinary(video.cloudinaryPublicId, 'video');
  await TrainingVideo.findByIdAndDelete(id);
  return { id };
};

// ─── Banks (driver payout bank-name dropdown) ─────────────────────────────────

export const createBankService = async (data) => {
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name) throw new ApiError(400, 'Bank name is required');
  if (name.length < 2) throw new ApiError(400, 'Bank name must be at least 2 characters');

  const exists = await Bank.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (exists) throw new ApiError(400, 'Bank already exists');

  const sortOrder = Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0;
  return Bank.create({
    name,
    isActive: data.isActive !== false,
    sortOrder,
  });
};

export const getAllBanksService = async (onlyActive = false) => {
  const filter = onlyActive ? { isActive: true } : {};
  return Bank.find(filter).sort({ sortOrder: 1, name: 1 });
};

export const updateBankService = async (id, data) => {
  const bank = await Bank.findById(id);
  if (!bank) throw new ApiError(404, 'Bank not found');

  if (data.name !== undefined) {
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) throw new ApiError(400, 'Bank name is required');
    const clash = await Bank.findOne({
      _id: { $ne: id },
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });
    if (clash) throw new ApiError(400, 'Bank already exists');
    bank.name = name;
  }
  if (data.isActive !== undefined) bank.isActive = Boolean(data.isActive);
  if (data.sortOrder !== undefined) bank.sortOrder = Number(data.sortOrder) || 0;

  await bank.save();
  return bank;
};

export const deleteBankService = async (id) => {
  const bank = await Bank.findByIdAndDelete(id);
  if (!bank) throw new ApiError(404, 'Bank not found');
  return { id };
};

/** Returns true if an active bank with this exact name exists. */
export const isActiveBankName = async (bankName) => {
  if (!bankName || !String(bankName).trim()) return false;
  const bank = await Bank.findOne({
    name: String(bankName).trim(),
    isActive: true,
  }).select('_id').lean();
  return Boolean(bank);
};
