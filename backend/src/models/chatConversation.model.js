import mongoose from 'mongoose';

/**
 * One conversation per booking. Participants are derived from the booking
 * (customer + assigned driver); staff join as observers/participants via role.
 */
const chatConversationSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      index: true,
    },
    lastMessage: {
      text: { type: String, default: '' },
      senderId: { type: mongoose.Schema.Types.ObjectId, default: null },
      senderRole: { type: String, default: null },
      createdAt: { type: Date, default: null },
    },
    lastMessageAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

const ChatConversation =
  mongoose.models.ChatConversation ||
  mongoose.model('ChatConversation', chatConversationSchema);

export default ChatConversation;
