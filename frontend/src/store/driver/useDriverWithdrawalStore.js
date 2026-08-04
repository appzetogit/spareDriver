import { create } from 'zustand';
import api from '../../utils/api';

const useDriverWithdrawalStore = create((set, get) => ({
  limits: null,
  withdrawals: [],
  total: 0,
  loading: false,
  submitting: false,
  error: null,

  async fetchLimits() {
    const res = await api.get('/driver/withdrawals/limits');
    const limits = res?.data?.data || null;
    set({ limits });
    return limits;
  },

  async fetchWithdrawals({ page = 1, limit = 20 } = {}) {
    set({ loading: true, error: null });
    try {
      const res = await api.get('/driver/withdrawals', { params: { page, limit } });
      const data = res?.data?.data || {};
      set({
        withdrawals: data.withdrawals || [],
        total: data.total || 0,
        loading: false,
      });
      return data;
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Failed to load withdrawals';
      set({ error: message, loading: false });
      throw err;
    }
  },

  async submitWithdrawal({
    amount,
    payoutMethod = 'qr',
    qrFile,
    bankDetails = null,
    isFullSettlement = false,
  }) {
    set({ submitting: true, error: null });
    try {
      const formData = new FormData();
      formData.append('amount', String(amount));
      formData.append('payoutMethod', payoutMethod);
      if (isFullSettlement) formData.append('isFullSettlement', 'true');
      if (payoutMethod === 'qr' && qrFile) {
        formData.append('qrImage', qrFile);
      }
      if (payoutMethod === 'bank' && bankDetails) {
        formData.append('accountHolderName', bankDetails.accountHolderName || '');
        formData.append('accountNumber', bankDetails.accountNumber || '');
        formData.append('ifscCode', bankDetails.ifscCode || '');
        formData.append('bankName', bankDetails.bankName || '');
        formData.append('upiId', bankDetails.upiId || '');
      }

      const res = await api.post('/driver/withdrawals', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const withdrawal = res?.data?.data?.withdrawal;
      await get().fetchLimits();
      await get().fetchWithdrawals();
      set({ submitting: false });
      return withdrawal;
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Failed to submit withdrawal';
      set({ error: message, submitting: false });
      throw err;
    }
  },
}));

export default useDriverWithdrawalStore;
