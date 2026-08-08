import { useAdminDriversStore } from '../../../store/admin/useAdminDriversStore';
import { useAdminDriverProfileStore } from '../../../store/admin/useAdminDriverProfileStore';

const STATUS_FIELDS = [
  'approvalStatus',
  'approvalNote',
  'isOnline',
  'isOnTrip',
  'canGoOnline',
  'approvedAt',
  'approvedBy',
  'approvalHistory',
  'revisionInProgress',
];

function pickStatusFields(driver) {
  const patch = {};
  STATUS_FIELDS.forEach((key) => {
    if (driver[key] !== undefined) patch[key] = driver[key];
  });
  return patch;
}

/**
 * Soft-update drivers list + profile caches after suspend/unsuspend (no refetch).
 */
export function softPatchDriverCaches(updatedDriver) {
  if (!updatedDriver?._id) return;

  const id = String(updatedDriver._id);
  const patch = pickStatusFields(updatedDriver);

  useAdminDriversStore.getState().patchMatching('admin-drivers:', (data, key) => {
    if (!data?.drivers?.length) return data;

    let drivers = data.drivers.map((d) =>
      String(d._id) === id ? { ...d, ...patch } : d,
    );

    try {
      const params = JSON.parse(key.slice('admin-drivers:'.length));
      if (params.status) {
        drivers = drivers.filter((d) => d.approvalStatus === params.status);
      }
    } catch {
      /* keep mapped list */
    }

    return { ...data, drivers };
  });

  useAdminDriverProfileStore.getState().patchMatching(
    (key) => key.startsWith('driver-profile:'),
    (data) => {
      if (!data?.driver || String(data.driver._id) !== id) return data;
      return {
        ...data,
        driver: { ...data.driver, ...patch },
      };
    },
  );
}
