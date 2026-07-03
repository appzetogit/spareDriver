const FIELDS = [
  { key: 'mode', label: 'Payment mode', placeholder: 'UPI / NEFT / IMPS' },
  { key: 'transactionId', label: 'Transaction ID', placeholder: 'Gateway / bank txn id' },
  { key: 'utr', label: 'UTR', placeholder: 'UTR number' },
  { key: 'referenceNumber', label: 'Reference', placeholder: 'Optional reference' },
];

const AdminTransactionFields = ({ value, onChange, requireTxn = true }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {FIELDS.map((field) => (
        <label key={field.key} className="block text-xs font-medium text-text">
          {field.label}
          {requireTxn && (field.key === 'transactionId' || field.key === 'utr') && (
            <span className="text-text-muted font-normal"> (one required)</span>
          )}
          <input
            value={value[field.key] || ''}
            onChange={(e) => onChange({ ...value, [field.key]: e.target.value })}
            placeholder={field.placeholder}
            className="mt-1 w-full rounded-xl border border-border-light px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
      ))}
    </div>
    <label className="block text-xs font-medium text-text">
      Notes
      <textarea
        value={value.notes || ''}
        onChange={(e) => onChange({ ...value, notes: e.target.value })}
        rows={2}
        placeholder="Optional settlement notes"
        className="mt-1 w-full rounded-xl border border-border-light px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </label>
  </div>
);

export const EMPTY_TXN_FORM = {
  mode: '',
  transactionId: '',
  utr: '',
  referenceNumber: '',
  notes: '',
};

export default AdminTransactionFields;
