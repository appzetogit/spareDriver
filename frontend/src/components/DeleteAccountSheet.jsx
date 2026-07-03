import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Loader2, QrCode } from 'lucide-react';
import BottomSheet from './BottomSheet';
import Button from './Button';
import Badge from './Badge';
import { formatCurrency } from '../utils/formatters';
import { ACCOUNT_DELETION_STATUS_LABELS } from '../constants/withdrawal';

const statusVariant = {
  pending: 'warning',
  in_progress: 'info',
  completed: 'success',
  rejected: 'danger',
};

const DeleteAccountSheet = ({
  isOpen,
  onClose,
  audience,
  walletBalance = 0,
  existingRequest,
  onSubmit,
  submitting = false,
  loading = false,
}) => {
  const fileRef = useRef(null);
  const [reason, setReason] = useState('');
  const [qrPreview, setQrPreview] = useState('');
  const [qrFile, setQrFile] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setReason('');
      setQrPreview('');
      setQrFile(null);
    }
  }, [isOpen]);

  const isDriver = audience === 'driver';
  const hasWallet = walletBalance > 0;
  const isPending =
    existingRequest &&
    ['pending', 'in_progress'].includes(existingRequest.status);

  const onQrChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrFile(file);
    setQrPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!reason.trim() || reason.trim().length < 3) {
      toast.error('Please provide a reason (at least 3 characters)');
      return;
    }
    try {
      await onSubmit({
        reason: reason.trim(),
        withdrawAmount: isDriver && hasWallet ? walletBalance : undefined,
        qrFile: isDriver && hasWallet ? qrFile : undefined,
      });
      toast.success('Deletion request submitted. Our team will review it.');
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Could not submit request');
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Delete account">
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      ) : existingRequest ? (
        <div className="space-y-3 pb-4">
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant[existingRequest.status] || 'default'}>
              {ACCOUNT_DELETION_STATUS_LABELS[existingRequest.status] || existingRequest.status}
            </Badge>
          </div>
          <p className="text-sm text-text-secondary">
            Submitted {new Date(existingRequest.createdAt).toLocaleString('en-IN')}
          </p>
          {existingRequest.reason && (
            <p className="text-sm text-text">
              <span className="text-text-muted">Reason: </span>
              {existingRequest.reason}
            </p>
          )}
          {existingRequest.rejectionReason && (
            <p className="text-sm text-danger">{existingRequest.rejectionReason}</p>
          )}
          {isPending ? (
            <p className="text-xs text-text-muted">
              An admin will settle your wallet to ₹0, resolve any active trips or subscriptions,
              then delete your account manually.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4 pb-4">
          <div className="flex gap-3 p-3 rounded-xl bg-amber-50 text-amber-900 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p>
              Account deletion is reviewed by our team.{' '}
              {hasWallet
                ? `Your wallet balance of ${formatCurrency(walletBalance)} will be settled before deletion.`
                : 'Your account will be deactivated after review.'}
            </p>
          </div>

          <label className="block text-sm font-medium text-text">
            Why are you leaving?
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-border-light px-3 py-2.5 text-sm resize-none"
              placeholder="Tell us briefly..."
            />
          </label>

          {isDriver && hasWallet && (
            <div>
              <p className="text-sm font-medium text-text mb-1">
                Full wallet settlement — {formatCurrency(walletBalance)}
              </p>
              <p className="text-xs text-text-muted mb-2">
                Upload your UPI/bank QR so admin can transfer your full balance.
              </p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-border-light hover:bg-gray-50 text-left"
              >
                {qrPreview ? (
                  <img src={qrPreview} alt="QR" className="w-12 h-12 rounded-lg object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-bg flex items-center justify-center">
                    <QrCode className="w-5 h-5 text-text-muted" />
                  </div>
                )}
                <span className="text-sm text-text">{qrFile ? qrFile.name : 'Upload QR code'}</span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onQrChange} />
            </div>
          )}

          <Button fullWidth onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit deletion request'}
          </Button>
        </div>
      )}
    </BottomSheet>
  );
};

export default DeleteAccountSheet;
