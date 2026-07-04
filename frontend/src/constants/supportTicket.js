export const SUPPORT_CATEGORIES = [
  { value: 'booking_issue', label: 'Booking Issue' },
  { value: 'payment_issue', label: 'Payment Issue' },
  { value: 'driver_issue', label: 'Driver Issue' },
  { value: 'app_issue', label: 'App Issue' },
  { value: 'other', label: 'Other' },
];

export const SUPPORT_STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};

export const FAQ_ITEMS = [
  {
    question: 'How do I cancel my booking?',
    answer:
      'Open your active booking from Activity, tap Cancel, and confirm. Cancellation fees may apply depending on how close you are to pickup time.',
  },
  {
    question: 'My payment failed, what should I do?',
    answer:
      'Check your UPI/card balance and retry payment from the booking screen. If money was debited but the booking did not confirm, raise a complaint under Payment Issue with your transaction details.',
  },
  {
    question: 'Driver did not arrive.',
    answer:
      'Wait a few minutes and try calling the driver from the trip screen. If they still do not show up, use Raise Complaint and select Driver Issue so our team can help.',
  },
  {
    question: 'How do I get a refund?',
    answer:
      'Eligible refunds are processed automatically after cancellation. For payment disputes, submit a complaint with your booking ID and payment screenshot.',
  },
  {
    question: 'How do I contact support?',
    answer:
      'Use the Call, WhatsApp, or Email options on this page, or submit a complaint form below and our team will reach out to you.',
  },
];
