import { USER_ROLES } from './roles.js';

/** Roles that can use the admin panel API */
export const STAFF_ROLES = Object.freeze([
  USER_ROLES.ADMIN,
  USER_ROLES.SUB_ADMIN,
  USER_ROLES.TEAM_MEMBER,
]);

/** Route groups for restrictTo() */
export const ROUTE_ROLES = Object.freeze({
  ALL_STAFF: STAFF_ROLES,
  OPERATIONS: [USER_ROLES.ADMIN, USER_ROLES.SUB_ADMIN],
  SUPER_ADMIN: [USER_ROLES.ADMIN],
});

export function isSuperAdmin(staff) {
  return staff?.role === USER_ROLES.ADMIN;
}

export function isSubAdmin(staff) {
  return staff?.role === USER_ROLES.SUB_ADMIN;
}

export function isTeamMember(staff) {
  return staff?.role === USER_ROLES.TEAM_MEMBER;
}

/** Super admin + sub admin — operational actions (assign, tasks, etc.) */
export function hasOperationalStaffAccess(staff) {
  return isSuperAdmin(staff) || isSubAdmin(staff);
}

/**
 * Zone visibility for staff lists / maps / notifications.
 * - `null`  → platform-wide (super admin only)
 * - string[] → only these zone ids (sub_admin + team_member; may be empty)
 */
export function getStaffZoneScopeIds(staff) {
  if (!staff) return [];
  if (isSuperAdmin(staff)) return null;
  if (isSubAdmin(staff) || isTeamMember(staff)) {
    return (staff.assignedZones || []).map((id) => String(id)).filter(Boolean);
  }
  return [];
}

export function usesAssignedZoneScope(staff) {
  return isSubAdmin(staff) || isTeamMember(staff);
}

export function canManageTeam(staff) {
  return isSuperAdmin(staff);
}

export function canManagePaymentSettings(staff) {
  return isSuperAdmin(staff);
}

export function canManageTaskAssignment(staff) {
  return hasOperationalStaffAccess(staff);
}

export function canViewTaskActivityLog(staff) {
  return isSuperAdmin(staff);
}

/** Write access — platform config is super-admin only */
export function canManagePlatformSettings(staff) {
  return isSuperAdmin(staff);
}

export function canViewPlatformSettings(staff) {
  return hasOperationalStaffAccess(staff);
}

export function canManageKitsCatalog(staff) {
  return isSuperAdmin(staff);
}

export function canViewKitsCatalog(staff) {
  return hasOperationalStaffAccess(staff);
}

export function canManageZones(staff) {
  return isSuperAdmin(staff);
}

export function canViewZones(staff) {
  return hasOperationalStaffAccess(staff);
}

export function canManageServicePricing(staff) {
  return isSuperAdmin(staff);
}

export function canManageSubscriptionPlans(staff) {
  return isSuperAdmin(staff);
}

export function canManageCoupons(staff) {
  return isSuperAdmin(staff);
}
