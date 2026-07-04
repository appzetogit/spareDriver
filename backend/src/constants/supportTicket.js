export const SUPPORT_TICKET_STATUS = Object.freeze({
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
});

export const SUPPORT_TICKET_STATUS_LIST = Object.values(SUPPORT_TICKET_STATUS);

export const SUPPORT_TICKET_CATEGORY = Object.freeze({
  BOOKING: 'booking_issue',
  PAYMENT: 'payment_issue',
  DRIVER: 'driver_issue',
  APP: 'app_issue',
  OTHER: 'other',
});

export const SUPPORT_TICKET_CATEGORY_LIST = Object.values(SUPPORT_TICKET_CATEGORY);

export const SUPPORT_SUBMITTER_TYPE = Object.freeze({
  USER: 'user',
  DRIVER: 'driver',
});
