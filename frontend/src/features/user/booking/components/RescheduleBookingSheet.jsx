import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarClock } from 'lucide-react';
import BottomSheet from '../../../../components/BottomSheet';
import Button from '../../../../components/Button';
import DateTimePickerField from '../../../../components/inputs/DateTimePickerField';
import {
  BOOKING_STATUS,
  BOOKING_TYPE,
  SCHEDULED_BOOKING,
  mergeScheduledDispatchConfig,
  readDispatchNumber,
} from '../../../../constants/bookingStatus';
import { SERVICE_TYPES } from '../../../../constants/serviceTypes';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useUserServicePricingsStore } from '../../../../store/user/useUserPricingStore';
import api from '../../../../utils/api';
import { addCalendarDays, startOfLocalDay } from '../../../../utils/outstationSchedule';

const EDITABLE_STATUSES = new Set([
  BOOKING_STATUS.PENDING_ASSIGNMENT,
  BOOKING_STATUS.SEARCHING,
  BOOKING_STATUS.IN_EMERGENCY_POOL,
  BOOKING_STATUS.NO_DRIVERS_FOUND,
]);

/** True when the customer may still change pickup before driver assign. */
export function canRescheduleBooking(booking) {
  if (!booking || booking.driverId) return false;
  if (!EDITABLE_STATUSES.has(booking.status)) return false;
  const isOutstation =
    booking.serviceType === SERVICE_TYPES.OUTSTATION
    || booking.bookingType === BOOKING_TYPE.OUTSTATION;
  const isScheduledHourly =
    booking.serviceType === SERVICE_TYPES.HOURLY
    && booking.bookingType === BOOKING_TYPE.SCHEDULED;
  return isOutstation || isScheduledHourly;
}

/**
 * Bottom sheet to change pickup time on scheduled / outstation bookings
 * before a driver is assigned. Outstation return shifts with pickup so
 * fare length stays intact.
 */
export default function RescheduleBookingSheet({
  open,
  booking,
  onClose,
  onSaved,
}) {
  if (!open || !booking) return null;
  return (
    <RescheduleBookingSheetBody
      booking={booking}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function RescheduleBookingSheetBody({ booking, onClose, onSaved }) {
  const isOutstation =
    booking.serviceType === SERVICE_TYPES.OUTSTATION
    || booking.bookingType === BOOKING_TYPE.OUTSTATION;

  const currentIso = isOutstation
    ? booking.outstation?.pickupAt || booking.outstation?.startDate
    : booking.hourly?.scheduledStartAt;

  const [value, setValue] = useState(() =>
    currentIso ? new Date(currentIso).toISOString() : null,
  );
  const [saving, setSaving] = useState(false);

  const cacheKey = buildCacheKey('user-services-active');
  const { data: pricingList, refetch } = useCachedQuery(
    useUserServicePricingsStore,
    cacheKey,
  );
  // Always re-pull pricing when the sheet opens so a just-changed admin
  // lead-time (incl. 0) isn't stuck behind the in-memory query cache.
  useEffect(() => {
    refetch?.();
  }, [refetch]);

  const pricing = useMemo(
    () =>
      (Array.isArray(pricingList)
        ? pricingList.find((p) => p.serviceType === booking.serviceType)
        : null),
    [pricingList, booking.serviceType],
  );
  const dispatchConfig = mergeScheduledDispatchConfig(pricing?.scheduledDispatch);
  // Admin may set lead to 0 (same-day). Do not use `|| default` — that
  // treats 0 as missing and snaps back to SCHEDULED_BOOKING (8 days).
  const minLeadHours = readDispatchNumber(
    dispatchConfig.MIN_SCHEDULED_LEAD_HOURS,
    SCHEDULED_BOOKING.MIN_SCHEDULED_LEAD_HOURS,
  );
  const minLeadDays = readDispatchNumber(
    dispatchConfig.MIN_OUTSTATION_LEAD_DAYS,
    SCHEDULED_BOOKING.MIN_OUTSTATION_LEAD_DAYS,
  );
  const minPickupDate = useMemo(() => {
    if (isOutstation) {
      return addCalendarDays(new Date(), minLeadDays) || startOfLocalDay(new Date());
    }
    return new Date(Date.now() + minLeadHours * 60 * 60 * 1000);
  }, [isOutstation, minLeadHours, minLeadDays]);

  const handleSave = async () => {
    if (!value || saving) return;
    setSaving(true);
    try {
      const payload = isOutstation
        ? { pickupAt: value }
        : { scheduledStartAt: value };
      const res = await api.post(
        `/auth/bookings/${booking._id}/reschedule`,
        payload,
      );
      const next = res?.data?.data?.booking || null;
      toast.success('Pickup time updated');
      onSaved?.(next);
      onClose?.();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err?.message || 'Could not update pickup time',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet isOpen onClose={saving ? undefined : onClose} title="Change pickup time">
      <div className="space-y-4 px-4 pb-6">
        <p className="text-xs text-text-muted leading-relaxed">
          You can change the pickup time until a driver is assigned.
          {isOutstation
            ? ' Your return time will move by the same amount so the trip length stays the same.'
            : ''}
        </p>

        <DateTimePickerField
          label="New pickup time"
          value={value}
          onChange={setValue}
          minDate={minPickupDate}
          placeholder="Tap to choose a date and time"
        />

        {(isOutstation ? minLeadDays > 0 : minLeadHours > 0) && (
          <p className="text-[11px] text-amber-700 flex items-start gap-1.5">
            <CalendarClock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {isOutstation
              ? `Pickups must be at least ${minLeadDays} day${minLeadDays === 1 ? '' : 's'} from today.`
              : `Pickups must be at least ${minLeadHours} hour${minLeadHours === 1 ? '' : 's'} from now.`}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            fullWidth
            variant="ghost"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            fullWidth
            disabled={!value || saving}
            loading={saving}
            onClick={handleSave}
          >
            Save
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
