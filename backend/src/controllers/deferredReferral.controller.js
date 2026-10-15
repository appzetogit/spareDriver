import DeferredReferralClick from '../models/deferredReferralClick.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';

const CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;
const MATCH_WINDOW_MS = 24 * 60 * 60 * 1000;
/** screen + timezone must both agree; a lone language/OS hit is not enough. */
const MIN_SCORE = 4;

/** IPv4 as-is; IPv6 collapsed to its /64 so privacy-address rotation still matches. */
export function ipKeyFromRequest(req) {
  let ip = String(req.ip || '').trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (!ip.includes(':')) return ip;
  const groups = ip.split(':');
  const gap = groups.indexOf('');
  let full = groups;
  if (gap !== -1) {
    const head = groups.slice(0, gap).filter(Boolean);
    const tail = groups.slice(gap + 1).filter(Boolean);
    full = [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail];
  }
  return `${full.slice(0, 4).map((g) => g || '0').join(':')}::/64`;
}

const cleanStr = (v, max = 40) => String(v ?? '').trim().slice(0, max);
const osMajor = (v) => cleanStr(v).split(/[._]/)[0];

function signals(body = {}) {
  const tz = Number(body.tzOffset);
  return {
    screen: cleanStr(body.screen),
    tzOffset: Number.isFinite(tz) ? tz : null,
    language: cleanStr(body.language, 16).toLowerCase(),
    osVersion: cleanStr(body.osVersion),
  };
}

export const recordDeferredReferralClick = asyncHandler(async (req, res) => {
  const code = cleanStr(req.body?.code, 32);
  if (!CODE_RE.test(code)) {
    return res.status(400).json(new ApiResponse(400, null, 'Invalid referral code'));
  }
  await DeferredReferralClick.create({
    code: code.toUpperCase(),
    role: req.body?.role === 'driver' ? 'driver' : 'user',
    ipKey: ipKeyFromRequest(req),
    ...signals(req.body),
  });
  return res.status(201).json(new ApiResponse(201, { recorded: true }, 'Recorded'));
});

export const matchDeferredReferral = asyncHandler(async (req, res) => {
  const s = signals(req.body);
  const candidates = await DeferredReferralClick.find({
    ipKey: ipKeyFromRequest(req),
    claimed: false,
    createdAt: { $gte: new Date(Date.now() - MATCH_WINDOW_MS) },
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  let best = null;
  for (const c of candidates) {
    let score = 0;
    if (s.screen && c.screen === s.screen) score += 2;
    if (s.tzOffset != null && c.tzOffset === s.tzOffset) score += 2;
    if (s.language && c.language === s.language) score += 1;
    if (osMajor(s.osVersion) && osMajor(c.osVersion) === osMajor(s.osVersion)) score += 1;
    // `candidates` is newest-first, so strict `>` keeps the most recent on ties.
    if (score >= MIN_SCORE && (!best || score > best.score)) best = { score, doc: c };
  }

  if (best) {
    const claimed = await DeferredReferralClick.findOneAndUpdate(
      { _id: best.doc._id, claimed: false },
      { $set: { claimed: true } },
    ).lean();
    if (claimed) {
      return res.status(200).json(new ApiResponse(200, { code: best.doc.code, role: best.doc.role }, 'Referral recovered'));
    }
  }
  return res.status(200).json(new ApiResponse(200, { code: null }, 'No match'));
});
