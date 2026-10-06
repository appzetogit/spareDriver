import Button from '../../../../components/Button';
import { useKitOrderPayment } from '../../../../hooks/useKitOrderPayment';
import usePaymentConfigStore, {
  selectDriverKitRails,
} from '../../../../store/usePaymentConfigStore';

const PayNowButton = ({ orderId, fullWidth = true, className = '', onPaid, label = 'Pay now' }) => {
  const { payExistingOrder, paying } = useKitOrderPayment();
  const rails = usePaymentConfigStore(selectDriverKitRails);

  const handlePay = async (e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    const result = await payExistingOrder(orderId);
    if (result?.success) onPaid?.();
  };

  // Kit checkout is Razorpay-only until cash-on-delivery for kits ships.
  // Gating here rather than at each of the five call sites means an
  // admin switching the rail off cannot leave a live Pay button behind.
  if (!rails.razorpay) {
    return (
      <p className={`text-xs text-slate-500 text-center ${className}`}>
        Online payment is temporarily unavailable. Our team will contact you to
        arrange payment for this order.
      </p>
    );
  }

  return (
    <Button
      variant="driver"
      size="md"
      fullWidth={fullWidth}
      loading={paying}
      onClick={handlePay}
      className={`rounded-full ${className}`}
    >
      {label}
    </Button>
  );
};

export default PayNowButton;
