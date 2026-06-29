import Modal from '../../../../components/Modal';
import AddCarForm from '../../onboarding/components/AddCarForm';

/**
 * Wraps `AddCarForm` in a popup so the user can register a new vehicle from
 * inside the booking flow without losing their place. On success we forward
 * the new car (and total count) to the caller so it can auto-select it.
 *
 *   props:
 *     - open          boolean
 *     - onClose       () => void
 *     - onCarAdded    ({ car, carCount }) => void
 */
const AddCarModal = ({ open, onClose, onCarAdded }) => {
  const handleSuccess = (payload) => {
    onCarAdded?.(payload);
    onClose?.();
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Add a vehicle" size="xl">
      <div className="px-5 py-5">
        <AddCarForm
          onSuccess={handleSuccess}
          onCancel={onClose}
          submitLabel="Save vehicle"
          cancelLabel="Cancel"
          compact
        />
      </div>
    </Modal>
  );
};

export default AddCarModal;
