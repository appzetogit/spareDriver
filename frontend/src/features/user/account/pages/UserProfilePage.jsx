import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  Lock,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useUserAuthStore from '../../../../store/useUserAuthStore';
import Avatar from '../../../../components/Avatar';
import Button from '../../../../components/Button';
import Input from '../../../../components/Input';
import Modal from '../../../../components/Modal';
import OtpResendRow from '../../../../components/OtpResendRow';
import api from '../../../../utils/api';
import { useOtpResendCooldown } from '../../../../hooks/useOtpResendCooldown';

const STEP = { IDLE: 'idle', OTP_SENT: 'otp_sent', SET_PASSWORD: 'set_password', DONE: 'done' };

function InfoRow({ icon: Icon, label, value, verified }) {
  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-gray-50 last:border-0">
      <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
        <Icon className="w-[18px] h-[18px] text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-sm font-semibold text-slate-800 truncate">{value || '—'}</p>
      </div>
      {verified !== undefined && (
        verified
          ? <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">
              <CheckCircle2 className="w-3 h-3" /> Verified
            </span>
          : <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">Not verified</span>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   ChangePasswordWidget
   Props:
     prefillPhone  – pre-filled phone number (read-only when readOnly=true)
     prefillEmail  – pre-filled email address (read-only when readOnly=true)
     readOnly      – if true, identifier fields are read-only (profile page)
                     if false/undefined, user can type (forgot-password page)
     onSuccess     – called after password change
     onCancel      – called on close / done button
   ───────────────────────────────────────────────────────────────────────── */
export function ChangePasswordWidget({
  prefillPhone = '',
  prefillEmail = '',
  readOnly = false,
  phoneOnly = false,
  apiPrefix = '/auth/forgot-password',
  onSuccess,
  onCancel,
}) {
  const defaultMode = phoneOnly ? 'phone' : (prefillPhone ? 'phone' : 'email');
  const [mode, setMode] = useState(defaultMode);
  const [step, setStep] = useState(STEP.IDLE);

  // For editable (forgot-password) mode, track typed value separately
  const [typedPhone, setTypedPhone] = useState('');
  const [typedEmail, setTypedEmail] = useState('');

  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const otpCooldown = useOtpResendCooldown();

  // The actual identifier used for API calls
  const identifier = readOnly
    ? (mode === 'phone' ? prefillPhone : prefillEmail)
    : (mode === 'phone' ? typedPhone : typedEmail);

  const canSend = readOnly
    ? identifier.length > 0
    : mode === 'phone'
      ? typedPhone.length === 10
      : typedEmail.includes('@') && typedEmail.includes('.');

  const reset = () => {
    setStep(STEP.IDLE);
    setOtp('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setLoading(false);
    otpCooldown.reset();
  };

  const handleSendOtp = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = mode === 'phone' ? { phone: identifier } : { email: identifier };
      await api.post(`${apiPrefix}/send-otp`, payload);
      setStep(STEP.OTP_SENT);
      setOtp('');
      otpCooldown.start();
      toast.success(mode === 'phone' ? 'OTP sent to your mobile' : 'OTP sent to your email');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  // ── Real OTP verification via API before going to password step ──
  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { setError('Enter the 6-digit OTP'); return; }
    setLoading(true);
    setError('');
    try {
      const payload = mode === 'phone'
        ? { phone: identifier, otp }
        : { email: identifier, otp };
      await api.post(`${apiPrefix}/verify-otp`, payload);
      setStep(STEP.SET_PASSWORD);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    setError('');
    try {
      const payload = mode === 'phone'
        ? { phone: identifier, otp, newPassword }
        : { email: identifier, otp, newPassword };
      await api.post(`${apiPrefix}/reset`, payload);
      setStep(STEP.DONE);
      toast.success('Password changed successfully!');
      onSuccess?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  /* ── Done ── */
  if (step === STEP.DONE) {
    return (
      <div className="flex flex-col items-center text-center py-6 px-2 animate-fade-in-up">
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <p className="text-base font-bold text-slate-800 mb-1">Password Changed!</p>
        <p className="text-sm text-slate-500 mb-6">
          Your new password is active. Use it the next time you log in.
        </p>
        <Button variant="secondary" onClick={onCancel} className="w-full rounded-xl">
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 px-1">

      {/* ── Step: IDLE ── */}
      {step === STEP.IDLE && (
        <>
          {/* Mode toggle */}
          {!phoneOnly && (
          <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-1 gap-1">
            {['phone', 'email'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError('');
                  if (!readOnly) { setTypedPhone(''); setTypedEmail(''); }
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  mode === m ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {m === 'phone' ? <Smartphone className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                {m === 'phone' ? 'Mobile OTP' : 'Email OTP'}
              </button>
            ))}
          </div>
          )}

          {/* Identifier field */}
          {mode === 'phone' ? (
            readOnly ? (
              /* ── Read-only pre-filled phone ── */
              <div>
                <p className="text-sm font-medium text-slate-700 mb-1.5">Registered Mobile Number</p>
                <div className="flex items-center gap-3 w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 cursor-not-allowed">
                  <Smartphone className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-sm font-semibold text-slate-700 tracking-wide">
                    +91 {prefillPhone}
                  </span>
                  <span className="ml-auto text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    Registered
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">OTP will be sent to this number</p>
              </div>
            ) : (
              <Input
                label="Mobile Number"
                type="tel"
                inputMode="numeric"
                placeholder="10-digit mobile number"
                value={typedPhone}
                onChange={(e) => { setTypedPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(''); }}
                icon={Smartphone}
              />
            )
          ) : (
            readOnly ? (
              /* ── Read-only pre-filled email ── */
              <div>
                <p className="text-sm font-medium text-slate-700 mb-1.5">Registered Email Address</p>
                <div className="flex items-center gap-3 w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 cursor-not-allowed">
                  <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-sm font-semibold text-slate-700 truncate">
                    {prefillEmail || '—'}
                  </span>
                  {prefillEmail && (
                    <span className="ml-auto text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                      Registered
                    </span>
                  )}
                </div>
                {!prefillEmail && (
                  <p className="text-xs text-amber-500 mt-1.5">No email linked to this account. Use Mobile OTP instead.</p>
                )}
                {prefillEmail && <p className="text-xs text-slate-400 mt-1.5">OTP will be sent to this email</p>}
              </div>
            ) : (
              <Input
                label="Email Address"
                type="email"
                placeholder="your@email.com"
                value={typedEmail}
                onChange={(e) => { setTypedEmail(e.target.value); setError(''); }}
                icon={Mail}
              />
            )
          )}

          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

          <Button
            fullWidth
            loading={loading}
            onClick={handleSendOtp}
            disabled={!canSend || (readOnly && mode === 'email' && !prefillEmail)}
            className="rounded-xl"
          >
            Send OTP
          </Button>
        </>
      )}

      {/* ── Step: OTP_SENT ── */}
      {step === STEP.OTP_SENT && (
        <>
          <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-600">
            OTP sent to{' '}
            <span className="font-bold text-slate-800">
              {mode === 'phone' ? `+91 ${identifier}` : identifier}
            </span>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Enter 6-digit OTP</p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="• • • • • •"
              value={otp}
              maxLength={6}
              onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              className="w-full h-14 bg-white border border-slate-200 rounded-xl text-center text-2xl font-bold tracking-[0.5em] text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>

          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

          <Button
            fullWidth
            loading={loading}
            onClick={handleVerifyOtp}
            disabled={otp.length !== 6}
            className="rounded-xl"
          >
            Verify OTP
          </Button>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={reset}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
            >
              ← Go back
            </button>
            <OtpResendRow
              align="end"
              canResend={otpCooldown.canResend}
              remaining={otpCooldown.remaining}
              onResend={handleSendOtp}
              loading={loading}
            />
          </div>
        </>
      )}

      {/* ── Step: SET_PASSWORD ── */}
      {step === STEP.SET_PASSWORD && (
        <>
          <div className="bg-emerald-50 rounded-xl px-4 py-3 flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-700 font-medium">OTP verified successfully</p>
          </div>

          <Input
            label="New Password"
            type="password"
            placeholder="Min 6 characters"
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
          />
          <Input
            label="Confirm Password"
            type="password"
            placeholder="Repeat new password"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
          />

          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

          <Button fullWidth loading={loading} onClick={handleResetPassword} className="rounded-xl">
            Save New Password
          </Button>
        </>
      )}
    </div>
  );
}

/* ─── Profile Page ───────────────────────────────────────────────────────────── */
const UserProfilePage = () => {
  const navigate = useNavigate();
  const user = useUserAuthStore((s) => s.user);
  const [modalOpen, setModalOpen] = useState(false);

  const phone = user?.phone_no || '';
  const email = (user?.email && !user.email.includes('@placeholder') && user.isEmailVerified)
    ? user.email
    : '';

  return (
    <div className="flex-1 flex flex-col bg-[#F8FAFC] min-h-dvh">
      {/* ── Header ── */}
      <div className="bg-white px-4 pt-4 pb-5 shadow-sm border-b border-slate-100">
        <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-slate-50 mb-2">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex items-center gap-4 mt-1">
          <Avatar name={user?.name || 'User'} size="xl" />
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-slate-900 truncate">{user?.name || 'My Profile'}</h1>
            {phone && <p className="text-sm text-slate-500 mt-0.5">+91 {phone}</p>}
            {email && <p className="text-xs text-slate-400 mt-0.5 truncate">{email}</p>}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 p-4 space-y-4">
        {/* Profile Details Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-1">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest pt-3 pb-2">Profile Details</h2>
          <InfoRow icon={User} label="Full Name" value={user?.name} />
          <InfoRow icon={Phone} label="Mobile Number" value={phone ? `+91 ${phone}` : null} verified={user?.isPhoneVerified} />
          <InfoRow
            icon={Mail}
            label="Email Address"
            value={user?.email && !user.email.includes('@placeholder') ? user.email : null}
            verified={user?.isEmailVerified}
          />
        </div>

        {/* Account Security Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-1">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest pt-3 pb-2">Account Security</h2>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="w-full flex items-center gap-3 py-3.5 border-b border-gray-50 hover:bg-slate-50 -mx-4 px-4 rounded-xl transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-slate-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-slate-800">Change Password</p>
              <p className="text-xs text-slate-400 mt-0.5">Via mobile OTP or email OTP</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
          </button>
          <div className="flex items-center gap-3 py-3.5">
            <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-slate-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">Auth Provider</p>
              <p className="text-xs text-slate-400 mt-0.5 capitalize">{user?.authProvider || 'Phone / Password'}</p>
            </div>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Active</span>
          </div>
        </div>
      </div>

      {/* ── Change Password Modal ── */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Change Password">
        <div className="px-5 pb-6 pt-3">
          <ChangePasswordWidget
            prefillPhone={phone}
            prefillEmail={email}
            readOnly
            onSuccess={() => {}}
            onCancel={() => setModalOpen(false)}
          />
        </div>
      </Modal>
    </div>
  );
};

export default UserProfilePage;
