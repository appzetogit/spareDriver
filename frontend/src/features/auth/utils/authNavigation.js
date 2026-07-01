import { DRIVER_ONBOARDING_ROUTES, isApplicationSubmitted } from '../../../utils/driverOnboarding';

export function userNeedsPhone(user) {
  if (!user) return false;
  const phone = String(user.phone_no || '').trim();
  if (phone.length === 10) return false;
  return Boolean(user.needsPhone) || !phone;
}

export function userNeedsEmail(user) {
  if (!user) return false;
  if (Boolean(user.needsEmail)) return true;
  if (user.isEmailVerified && user.email && !user.email.endsWith('@phone.sparedriver.local')) {
    return false;
  }
  return !user.email || user.email.endsWith('@phone.sparedriver.local') || !user.isEmailVerified;
}

export function driverNeedsPhone(driver) {
  if (!driver) return false;
  const phone = String(driver.phone || '').trim();
  if (phone.length === 10) return false;
  return Boolean(driver.needsPhone) || !phone;
}

export function navigateDriverAfterAuth(navigate, driver, needsPhone) {
  if (needsPhone || driverNeedsPhone(driver)) {
    navigate('/driver/link-phone', { replace: true });
    return;
  }

  if (driver.approvalStatus === 'approved') {
    navigate('/driver/home', { replace: true });
    return;
  }

  if (driver.approvalStatus === 'rejected' || driver.approvalStatus === 'under_review') {
    navigate('/driver/register/approval', { replace: true });
    return;
  }

  if (isApplicationSubmitted(driver)) {
    navigate('/driver/register/approval', { replace: true });
    return;
  }

  const route = DRIVER_ONBOARDING_ROUTES[driver.onboardingStep];
  if (route) {
    navigate(route, { replace: true });
    return;
  }

  navigate('/driver/register/credentials', { replace: true });
}

export function navigateUserAfterAuth(navigate, user, needsPhone) {
  if (needsPhone || userNeedsPhone(user)) {
    navigate('/link-phone', { replace: true });
    return;
  }

  if (userNeedsEmail(user)) {
    navigate('/user/verify-email', { replace: true });
    return;
  }

  navigate('/user/home', { replace: true });
}
