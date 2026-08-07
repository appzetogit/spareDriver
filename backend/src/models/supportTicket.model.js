import mongoose from 'mongoose';
import {
  SUPPORT_TICKET_STATUS,
  SUPPORT_TICKET_STATUS_LIST,
  SUPPORT_TICKET_CATEGORY_LIST,
  SUPPORT_SUBMITTER_TYPE,
} from '../constants/supportTicket.js';

const supportTicketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', default: null, index: true },
    submitterType: {
      type: String,
      enum: Object.values(SUPPORT_SUBMITTER_TYPE),
      required: true,
    },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    category: { type: String, enum: SUPPORT_TICKET_CATEGORY_LIST, required: true },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    screenshot: { type: String, default: '' },
    status: {
      type: String,
      enum: SUPPORT_TICKET_STATUS_LIST,
      default: SUPPORT_TICKET_STATUS.OPEN,
      index: true,
    },
    adminReply: { type: String, default: '', trim: true, maxlength: 5000 },
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
  },
  { timestamps: true },
);

supportTicketSchema.index({ createdAt: -1 });
supportTicketSchema.index({ assignedTo: 1, status: 1 });

const SupportTicket =
  mongoose.models.SupportTicket || mongoose.model('SupportTicket', supportTicketSchema);

export default SupportTicket;
