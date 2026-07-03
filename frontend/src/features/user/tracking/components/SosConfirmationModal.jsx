import Modal from '../../../../components/Modal';
import Button from '../../../../components/Button';

const SosConfirmationModal = ({ isOpen, onClose, onSendSos, onCallEmergency, loading }) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Emergency Assistance" size="md">
    <div className="p-5 space-y-5">
      <p className="text-sm text-text-secondary leading-relaxed">
        Do you need immediate help? Your live location and trip details will be shared with your
        emergency contacts and our support team.
      </p>

      <div className="space-y-3">
        <a href="tel:112" className="block">
          <Button fullWidth variant="danger" type="button" onClick={onCallEmergency}>
            Call Emergency (112)
          </Button>
        </a>
        <Button fullWidth variant="dark" loading={loading} onClick={onSendSos}>
          Send SOS
        </Button>
        <Button fullWidth variant="ghost" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
      </div>
    </div>
  </Modal>
);

export default SosConfirmationModal;
