import { useRef, useState } from 'react';
import { Camera, Mail, Phone, User, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Avatar from '../../../../components/Avatar';
import Button from '../../../../components/Button';
import Input from '../../../../components/Input';
import api from '../../../../utils/api';
import { uploadImage } from '../../../../utils/upload';
import useUserAuthStore from '../../../../store/useUserAuthStore';

const isRealEmail = (email) => Boolean(email) && !email.includes('@placeholder');

/**
 * Edit name, photo and alternate phone (saved together), and change the email
 * through the existing email-OTP flow so the new address is verified.
 * The primary phone is the login ID and is shown read-only.
 */
const EditProfileForm = ({ user, onDone }) => {
  const setAuth = useUserAuthStore((s) => s.setAuth);
  const fileRef = useRef(null);

  const [name, setName] = useState(user?.name || '');
  const [alternatePhone, setAlternatePhone] = useState(user?.alternatePhone || '');
  const [photo, setPhoto] = useState(user?.profilePicture || '');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const currentEmail = isRealEmail(user?.email) ? user.email : '';
  const [email, setEmail] = useState(currentEmail);
  const [emailStep, setEmailStep] = useState('idle'); // idle | otp
  const [otp, setOtp] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const emailChanged = email.trim().toLowerCase() !== currentEmail.toLowerCase();

  const merge = (patch) => setAuth({ ...useUserAuthStore.getState().user, ...patch });

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setPhotoBusy(true);
      const { url } = await uploadImage(file);
      setPhoto(url);
    } catch (err) {
      toast.error(err.message || 'Photo upload failed');
    } finally {
      setPhotoBusy(false);
    }
  };

  const validate = () => {
    const next = {};
    if (name.trim().length < 2) next.name = 'Name must be at least 2 characters';
    if (alternatePhone && !/^[0-9]{10}$/.test(alternatePhone)) {
      next.alternatePhone = 'Enter a valid 10-digit number';
    } else if (alternatePhone && alternatePhone === user?.phone_no) {
      next.alternatePhone = 'Must differ from your primary number';
    }
    setErrors(next);
    return !Object.keys(next).length;
  };

  const dirty =
    name.trim() !== (user?.name || '') ||
    alternatePhone !== (user?.alternatePhone || '') ||
    photo !== (user?.profilePicture || '');

  const handleSave = async () => {
    if (!validate()) return;
    try {
      setSaving(true);
      const res = await api.put('/auth/profile', {
        name: name.trim(),
        alternatePhone,
        profilePicture: photo,
      });
      merge(res.data?.data || {});
      toast.success('Profile updated');
      onDone?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const sendEmailOtp = async () => {
    try {
      setEmailBusy(true);
      await api.post('/auth/onboarding/email/send-otp', { email: email.trim() });
      setEmailStep('otp');
      setOtp('');
      toast.success('Verification code sent to your email');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send code');
    } finally {
      setEmailBusy(false);
    }
  };

  const verifyEmailOtp = async () => {
    try {
      setEmailBusy(true);
      const res = await api.post('/auth/onboarding/email/verify', { email: email.trim(), otp });
      merge(res.data?.data?.user || {});
      setEmailStep('idle');
      toast.success('Email updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid or expired code');
    } finally {
      setEmailBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={photoBusy || saving}
          className="relative rounded-full"
          aria-label="Change photo"
        >
          <Avatar src={photo || undefined} name={name || 'User'} size="xl" />
          <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center ring-2 ring-white">
            <Camera className="w-4 h-4" />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
        <p className="text-xs text-slate-400">{photoBusy ? 'Uploading…' : 'Tap to change photo'}</p>
      </div>

      <Input
        label="Full name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        icon={User}
        disabled={saving}
      />
      <Input
        label="Mobile number"
        value={user?.phone_no ? `+91 ${user.phone_no}` : ''}
        icon={Phone}
        disabled
        readOnly
        helper="Your login number can't be changed here."
      />
      <Input
        label="Alternate mobile (optional)"
        type="tel"
        inputMode="numeric"
        placeholder="10-digit number"
        value={alternatePhone}
        onChange={(e) => setAlternatePhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
        error={errors.alternatePhone}
        icon={Phone}
        disabled={saving}
      />

      <Button
        type="button"
        fullWidth
        loading={saving}
        disabled={!dirty || photoBusy}
        onClick={handleSave}
        className="rounded-xl"
      >
        Save changes
      </Button>

      <div className="pt-3 border-t border-slate-100 space-y-3">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailStep('idle');
          }}
          icon={Mail}
          disabled={emailBusy}
          helper={
            emailChanged
              ? 'We will email a code to verify the new address.'
              : user?.isEmailVerified
                ? 'Verified'
                : undefined
          }
        />
        {emailStep === 'idle' && emailChanged && (
          <Button
            type="button"
            variant="secondary"
            fullWidth
            loading={emailBusy}
            disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
            onClick={sendEmailOtp}
            className="rounded-xl"
          >
            Send verification code
          </Button>
        )}
        {emailStep === 'otp' && (
          <>
            <input
              type="text"
              inputMode="numeric"
              placeholder="6-digit code"
              value={otp}
              maxLength={6}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full h-12 bg-white border border-slate-200 rounded-xl text-center text-lg font-bold tracking-[0.4em] text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <Button
              type="button"
              fullWidth
              loading={emailBusy}
              disabled={otp.length !== 6}
              onClick={verifyEmailOtp}
              className="rounded-xl"
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Verify &amp; update email
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default EditProfileForm;
