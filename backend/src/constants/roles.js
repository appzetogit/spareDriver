/** App roles stored on User documents */
export const USER_ROLES = Object.freeze({
  USER: 'user',
  /** Single super admin per app — team, payment, full control */
  ADMIN: 'admin',
  /** Operational lead — tasks, platform, drivers, kits; not team/payment */
  SUB_ADMIN: 'sub_admin',
  TEAM_MEMBER: 'team_member',
  /** Internal QA — admin panel dev tools only; not staff ops */
  DEVELOPER: 'developer',
  DRIVER: 'driver',
});

/** JWT: principal stored in User collection */
export const ACCOUNT_USER = 'user';

/** JWT: principal stored in Driver collection */
export const ACCOUNT_DRIVER = 'driver';
