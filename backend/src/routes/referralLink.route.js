import { Router } from 'express';

const router = Router();

const CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Per-app store targets. Driver app falls back to the user app when unset. */
function storeConfig(role) {
  const isDriver = role === 'driver';
  const pick = (driverKey, userKey) =>
    (isDriver ? process.env[driverKey] : '') || process.env[userKey] || '';
  return {
    playPackage: pick('REFERRAL_PLAY_PACKAGE_DRIVER', 'REFERRAL_PLAY_PACKAGE'),
    appStoreUrl: pick('REFERRAL_APP_STORE_URL_DRIVER', 'REFERRAL_APP_STORE_URL'),
    webUrl: process.env.REFERRAL_WEB_URL || process.env.FRONTEND_URL?.split(',')[0]?.trim() || '',
  };
}

function playUrl(pkg, code, role) {
  const referrer = `ref=${code}&role=${role}`;
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}&referrer=${encodeURIComponent(referrer)}`;
}

/**
 * Shareable referral link: GET /r/:code[?role=driver]
 *  - Android -> Play Store with install referrer (read by the Flutter app)
 *  - iOS     -> App Store (code is copied to clipboard on the landing page)
 *  - Other   -> landing page with store buttons / web signup
 */
router.get('/:code', (req, res) => {
  const { code } = req.params;
  if (!CODE_RE.test(code)) return res.status(404).send('Invalid referral link');

  const role = req.query.role === 'driver' ? 'driver' : 'user';
  const upper = code.toUpperCase();
  const cfg = storeConfig(role);
  const ua = String(req.get('user-agent') || '');
  const isAndroid = /android/i.test(ua);
  const isIos = /iphone|ipad|ipod/i.test(ua);

  const play = cfg.playPackage ? playUrl(cfg.playPackage, upper, role) : '';
  const webSignup = cfg.webUrl
    ? `${cfg.webUrl.replace(/\/$/, '')}${role === 'driver' ? '/driver/register/identity' : '/register'}?ref=${encodeURIComponent(upper)}`
    : '';

  res.set('Cache-Control', 'no-store');
  if (isAndroid && play) return res.redirect(302, play);

  // iOS and desktop get a page so the code can be copied / shown.
  const iosTarget = cfg.appStoreUrl;
  const autoRedirect = isIos && iosTarget ? iosTarget : '';
  const button = (href, label) =>
    href ? `<a class="btn" href="${esc(href)}">${esc(label)}</a>` : '';

  res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Join SpareDriver</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6f6f6;color:#111}
.card{background:#fff;border-radius:16px;padding:28px 24px;max-width:360px;width:90%;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.08)}
.code{font-size:28px;letter-spacing:4px;font-weight:700;margin:8px 0 18px}
.btn{display:block;margin:10px 0;padding:14px;border-radius:12px;background:#111;color:#fff;text-decoration:none;font-weight:600}
.btn.alt{background:#fff;color:#111;border:1px solid #ccc}
small{color:#666}
</style></head><body><div class="card">
<h2>You're invited to SpareDriver</h2>
<small>Use this referral code when you sign up</small>
<div class="code" id="code">${esc(upper)}</div>
${button(play, 'Get it on Google Play')}
${button(iosTarget, 'Download on the App Store')}
${button(webSignup, 'Continue on web').replace('class="btn"', 'class="btn alt"')}
</div>
<script>
try{navigator.clipboard&&navigator.clipboard.writeText(${JSON.stringify(upper)});}catch(e){}
${autoRedirect ? `setTimeout(function(){location.href=${JSON.stringify(autoRedirect)}},400);` : ''}
</script></body></html>`);
});

export default router;
