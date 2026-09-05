import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useRazorpayCheckout } from './useRazorpayCheckout';
import useDriverAuthStore from '../store/useDriverAuthStore';
import { useDriverKitActiveStore, useDriverKitsListStore } from '../store/driver/useDriverKitStore';
import {
  useDriverOrdersStore,
  useDriverPaymentHistoryStore,
} from '../store/driver/useDriverHistoryStore';
import {
  useDriverOnlineStore,
  DRIVER_ONLINE_NAMESPACE,
} from '../store/driver/useDriverOnlineStore';

function invalidatePaymentCaches() {
  useDriverKitActiveStore.getState().invalidate('driver-kit-active');
  useDriverKitsListStore.getState().invalidate('driver-kits-list');
  useDriverOnlineStore.getState().invalidate(DRIVER_ONLINE_NAMESPACE);
  useDriverOrdersStore.getState().invalidate('driver-orders');
  useDriverPaymentHistoryStore.getState().invalidate('driver-payment-history');
}

export function useKitOrderPayment() {
  const driver = useDriverAuthStore((s) => s.driver);
  const { openCheckout, loading: checkoutLoading } = useRazorpayCheckout();
  const [paying, setPaying] = useState(false);

  const verifyPayment = useCallback(async (orderId, paymentResponse) => {
    await api.post('/driver/payments/verify', {
      orderId,
      razorpay_order_id: paymentResponse.razorpay_order_id,
      razorpay_payment_id: paymentResponse.razorpay_payment_id,
      razorpay_signature: paymentResponse.razorpay_signature,
    });
    invalidatePaymentCaches();
  }, []);

  const recordPaymentAttemptFailed = useCallback(async (orderId, note) => {
    try {
      await api.post(`/driver/kit-orders/${orderId}/payment-failed`, { note });
      invalidatePaymentCaches();
    } catch {
      /* non-blocking */
    }
  }, []);

  const runRazorpayCheckout = useCallback(
    async ({ order, razorpay }) => {
      const orderId = order?._id || order?.id;

      try {
        await openCheckout({
          razorpay,
          order,
          driver,
          onSuccess: async (paymentResponse) => {
            await verifyPayment(orderId, paymentResponse);
            toast.success('Payment successful! Awaiting admin approval.');
          },
          onDismiss: () => {
            toast('Payment window closed. Your order is saved — tap Pay now when ready.', {
              duration: 5000,
            });
          },
          onFailed: async (_response, failedOrderId) => {
            const id = failedOrderId || orderId;
            await recordPaymentAttemptFailed(
              id,
              'Card or UPI payment was declined or failed',
            );
          },
        });
        return { success: true, orderId };
      } catch (err) {
        if (err.message === 'Payment cancelled') {
          return { success: false, cancelled: true, orderId };
        }
        if (err.message === 'Payment failed') {
          await recordPaymentAttemptFailed(orderId, err.message);
          return { success: false, failed: true, orderId };
        }
        throw err;
      }
    },
    [driver, openCheckout, recordPaymentAttemptFailed, verifyPayment],
  );

  const payExistingOrder = useCallback(
    async (orderId) => {
      setPaying(true);
      try {
        const res = await api.post(`/driver/kit-orders/${orderId}/pay`);
        const payload = res.data?.data;
        if (!payload?.razorpay?.orderId) {
          throw new Error('Could not start payment');
        }
        return await runRazorpayCheckout(payload);
      } catch (err) {
        if (err.message !== 'Payment cancelled' && err.message !== 'Payment failed') {
          toast.error(err.response?.data?.message || err.message || 'Payment could not be completed');
        }
        return { success: false, error: err };
      } finally {
        setPaying(false);
      }
    },
    [runRazorpayCheckout],
  );

  const createAndPay = useCallback(
    async (orderBody) => {
      setPaying(true);
      let createdOrderId = null;
      try {
        const res = await api.post('/driver/kit-orders', orderBody);
        const payload = res.data?.data;
        if (!payload?.razorpay?.orderId) {
          throw new Error('Could not start payment');
        }
        createdOrderId = payload.order?._id || payload.order?.id;
        const result = await runRazorpayCheckout(payload);
        return { ...result, order: payload.order };
      } catch (err) {
        if (err.message === 'Payment cancelled') {
          return { success: false, cancelled: true, orderId: createdOrderId };
        }
        if (err.message === 'Payment failed') {
          return { success: false, failed: true, orderId: createdOrderId };
        }
        toast.error(err.response?.data?.message || err.message || 'Could not start payment');
        return { success: false, error: err, orderId: createdOrderId };
      } finally {
        setPaying(false);
      }
    },
    [runRazorpayCheckout],
  );

  return {
    createAndPay,
    payExistingOrder,
    paying: paying || checkoutLoading,
  };
}
