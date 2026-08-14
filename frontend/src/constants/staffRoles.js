export const STAFF_ROLES = Object.freeze({
  ADMIN: 'admin',
  SUB_ADMIN: 'sub_admin',
  TEAM_MEMBER: 'team_member',
});

export const DEVELOPER_ROLE = 'developer';

export const STAFF_ROLE_LABELS = {
  [STAFF_ROLES.ADMIN]: 'Super Admin',
  [STAFF_ROLES.SUB_ADMIN]: 'Sub Admin',
  [STAFF_ROLES.TEAM_MEMBER]: 'Team Member',
  [DEVELOPER_ROLE]: 'Developer',
};

export function isDeveloper(role) {
  return role === DEVELOPER_ROLE;
}

export function isSuperAdmin(role) {
  return role === STAFF_ROLES.ADMIN;
}

export function isSubAdmin(role) {
  return role === STAFF_ROLES.SUB_ADMIN;
}

export function isTeamMember(role) {
  return role === STAFF_ROLES.TEAM_MEMBER;
}

/** Super admin + sub admin */
export function hasOperationalAccess(role) {
  return isSuperAdmin(role) || isSubAdmin(role);
}

export function usesAssignedZoneScope(role) {
  return isSubAdmin(role) || isTeamMember(role);
}

/** Normalize assignedZones from auth/profile payloads to string ids. */
export function getAssignedZoneIds(admin) {
  if (!admin || isSuperAdmin(admin.role)) return null;
  if (!usesAssignedZoneScope(admin.role)) return [];
  return (admin.assignedZones || [])
    .map((z) => String(typeof z === 'object' && z?._id != null ? z._id : z))
    .filter(Boolean);
}

export function canAccessTeamManagement(role) {
  return isSuperAdmin(role);
}

export function canAccessPaymentSettings(role) {
  return isSuperAdmin(role);
}

export function canManageTaskAssignment(role) {
  return hasOperationalAccess(role);
}

export function canViewTaskActivityLog(role) {
  return isSuperAdmin(role);
}

export function canManagePlatformSettings(role) {
  return isSuperAdmin(role);
}

export function canViewPlatformSettings(role) {
  return hasOperationalAccess(role);
}

export function canManageKitsCatalog(role) {
  return isSuperAdmin(role);
}

export function canViewKitsCatalog(role) {
  return hasOperationalAccess(role);
}

export function canManageZones(role) {
  return isSuperAdmin(role);
}

export function canViewZones(role) {
  return hasOperationalAccess(role);
}

export function canManageServicePricing(role) {
  return isSuperAdmin(role);
}

export function canManageSubscriptionPlans(role) {
  return isSuperAdmin(role);
}

export function canManageCoupons(role) {
  return isSuperAdmin(role);
}

export function canAccessUsers(role) {
  return hasOperationalAccess(role);
}

/** Nav visibility helper */
export function roleCanAccess(roles, userRole) {
  if (!roles?.length) return true;
  return roles.includes(userRole);
}
