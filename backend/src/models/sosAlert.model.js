import mongoose from 'mongoose';
import { SOS_STATUS, SOS_STATUS_LIST, SOS_TRIGGERED_BY_LIST } from '../constants/sos.js';

const locationPointSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
  },
  { _id: false },
);

const timelineEventSchema = new mongoose.Schema(
  {
    event: { type: String, required: true, trim: true },
    label: { type: String, default: '', trim: true },
    at: { type: Date, default: Date.now },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const sosAlertSchema = new mongoose.Schema(
  {
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },
    bookingNumber: { type: String, default: '', trim: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    passengerName: { type: String, default: '', trim: true },
    passengerPhone: { type: String, default: '', trim: true },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
      index: true,
    },
    driverName: { type: String, default: '', trim: true },
    driverPhone: { type: String, default: '', trim: true },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Car',
      default: null,
    },
    vehicleNumber: { type: String, default: '', trim: true, uppercase: true },
    startLocation: { type: String, default: '', trim: true },
    destination: { type: String, default: '', trim: true },
    currentLocation: {
      type: locationPointSchema,
      required: true,
    },
    status: {
      type: String,
      enum: SOS_STATUS_LIST,
      default: SOS_STATUS.ACTIVE,
      index: true,
    },
    triggeredBy: {
      type: String,
      enum: SOS_TRIGGERED_BY_LIST,
      required: true,
    },
    resolvedAt: { type: Date, default: null },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    assignedAt: { type: Date, default: null },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    timeline: { type: [timelineEventSchema], default: [] },
  },
  { timestamps: true },
);

sosAlertSchema.index(
  { tripId: 1 },
  { unique: true, partialFilterExpression: { status: SOS_STATUS.ACTIVE } },
);
sosAlertSchema.index({ status: 1, createdAt: -1 });
sosAlertSchema.index({ assignedTo: 1, status: 1 });

const SosAlert = mongoose.models.SosAlert || mongoose.model('SosAlert', sosAlertSchema);
export default SosAlert;
