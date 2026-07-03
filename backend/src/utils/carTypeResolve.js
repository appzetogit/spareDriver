import mongoose from 'mongoose';
import CarType from '../models/carType.model.js';

function isValidObjectId(value) {
  if (!value) return false;
  const str = String(value);
  return mongoose.Types.ObjectId.isValid(str) && String(new mongoose.Types.ObjectId(str)) === str;
}

/**
 * Normalises a car-type reference that may be an ObjectId, populated doc,
 * or legacy name string (e.g. "sedan") into a CarType ObjectId or null.
 */
export async function resolveCarTypeObjectId(ref) {
  if (!ref) return null;
  if (typeof ref === 'object' && ref._id) {
    return isValidObjectId(ref._id) ? new mongoose.Types.ObjectId(String(ref._id)) : null;
  }
  const str = String(ref).trim();
  if (!str) return null;
  if (isValidObjectId(str)) {
    return new mongoose.Types.ObjectId(str);
  }
  const byName = await CarType.findOne({
    name: { $regex: new RegExp(`^${str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  })
    .select('_id')
    .lean();
  return byName?._id ? new mongoose.Types.ObjectId(String(byName._id)) : null;
}
