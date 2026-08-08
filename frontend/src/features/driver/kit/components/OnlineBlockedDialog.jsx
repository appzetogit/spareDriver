import { useNavigate } from 'react-router-dom';
import Modal from '../../../../components/Modal';
import Button from '../../../../components/Button';
import { Package, GraduationCap, AlertCircle } from 'lucide-react';

const OnlineBlockedDialog = ({ open, onClose, blocked, onGoToKit }) => {
  const navigate = useNavigate();
  if (!open || !blocked) return null;

  const code = blocked.code || '';
  const reasons = Array.from(
    new Set((blocked.reasons || []).map((r) => String(r || '').trim()).filter(Boolean)),
  );
  const needsKit =
    code === 'KIT_REQUIRED' ||
    code === 'KIT_AND_TRAINING_REQUIRED' ||
    reasons.some((r) => r.toLowerCase().includes('kit'));
  const needsTraining =
    code === 'TRAINING_REQUIRED' ||
    code === 'KIT_AND_TRAINING_REQUIRED' ||
    reasons.some((r) => r.toLowerCase().includes('training'));

  const handleKitAction = () => {
    onClose();
    if (onGoToKit) {
      onGoToKit();
    } else {
      navigate('/driver/kit');
    }
  };

  const handleTrainingAction = () => {
    onClose();
    navigate('/driver/register/training');
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Cannot go online">
      <div className="p-2 space-y-4">
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Finish the items below before going online
            </p>
            {reasons.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {reasons.map((reason) => (
                  <li key={reason} className="text-xs text-amber-800">
                    • {reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-amber-800">
                {blocked.message || 'You are not eligible to go online yet.'}
              </p>
            )}
          </div>
        </div>

        {needsTraining && (
          <Button
            fullWidth
            onClick={handleTrainingAction}
            className="flex items-center justify-center gap-2"
          >
            <GraduationCap className="w-4 h-4" />
            Complete training
          </Button>
        )}
        {needsKit && (
          <Button
            fullWidth
            variant={needsTraining ? 'outline' : 'primary'}
            onClick={handleKitAction}
            className="flex items-center justify-center gap-2"
          >
            <Package className="w-4 h-4" />
            {onGoToKit ? 'View kit options' : 'Get driver kit'}
          </Button>
        )}
        <Button variant="outline" fullWidth onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
};

export default OnlineBlockedDialog;
