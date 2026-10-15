import mongoose from 'mongoose';

/**
 * iOS has no Play-style install referrer, so the invite landing page records
 * a fingerprint of the visitor before sending them to the App Store. On first
 * launch the app asks the backend to match its own fingerprint against recent
 * clicks and recovers the referral code. Rows expire after 24 hours.
 */
const deferredReferralClickSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    role: { type: String, enum: ['user', 'driver'], default: 'user' },
    /** IPv4 address, or the /64 prefix for IPv6 (clients rotate the suffix). */
    ipKey: { type: String, required: true, index: true },
    screen: { type: String, default: '' },
    tzOffset: { type: Number, default: null },
    language: { type: String, default: '' },
    osVersion: { type: String, default: '' },
    claimed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now, expires: 24 * 60 * 60 },
  },
  { versionKey: false },
);

deferredReferralClickSchema.index({ ipKey: 1, claimed: 1, createdAt: -1 });

export default mongoose.model('DeferredReferralClick', deferredReferralClickSchema);
