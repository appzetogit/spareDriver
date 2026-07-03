import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SERVICE_TYPES } from '../../constants/serviceTypes';
import { BOOKING_TYPE } from '../../constants/bookingStatus';

/**
 * Holds the user's in-progress booking selections as they walk through the
 * hourly / outstation flows. Persisted to sessionStorage so a refresh mid-flow
 * doesn't kick them back to step 1.
 *
 *   Hourly:     type → details (pickup + drop + car) → slab → confirm
 *   Outstation: variants (pickup + drop + time + car) → confirm
 *
 * Note: the previous "review" step has been merged into the confirm
 * page. /user/book/review redirects to /user/book/confirm at the
 * router level for backwards compatibility.
 *
 * Reset is the responsibility of the success/cancel pages — never auto-reset
 * on mount.
 */

const DEFAULT_STATE = {
  serviceType: null,
  /** 'instant', 'scheduled', or 'outstation' — picked/derived by booking flow. */
  bookingType: null,
  pickup: null, // { address, city, lat, lng }
  dropoff: null, // { address, city, lat, lng }
  carId: null,
  hourly: {
    scheduledStartAt: null,
    durationHours: null,
    slabId: null,
    isCustomDuration: false,
    // Hourly food allowance never adds a charge — the threshold instead
    // gates a mandatory acknowledgement checkbox: "I'll feed the driver".
    // `foodAcknowledged` defaults to `false`; the slab page sets it to
    // `true` once the customer ticks the box. The confirm screen blocks
    // payment until this is true (when the threshold is crossed).
    foodAcknowledged: false,
    // Back-compat — always forwarded as `true` to the backend so older
    // pricing engines don't bill for hourly food.
    foodProvided: null,
    // `null` = user hasn't decided yet (server defaults to `true`,
    // i.e. stay allowance ON). Surfaced as a toggle on the slab page
    // only when the booked duration crosses the admin threshold.
    stayProvided: null,
  },
  outstation: {
    destinationAddress: '',
    destinationLat: null,
    destinationLng: null,
    // Exact pickup / expected-return datetimes the customer chose.
    // `startDate` / `endDate` mirror these for back-compat with the
    // older payload shape — both pairs are sent to the backend.
    pickupAt: null,
    expectedReturnAt: null,
    startDate: null,
    endDate: null,
    days: null,
    nights: null,
    // Today the customer UI flips both flags together via a single
    // "I'll arrange the driver's food and stay" toggle. The two
    // booleans are kept on the draft (and forwarded to the backend)
    // because the fare engine ANDs them — both must be exactly `true`
    // for the customer to skip the per-night allowance.
    //
    // Convention:
    //   `true`  = "this need is arranged by the customer" → no allowance
    //   `false` = "platform must charge an allowance for this need"
    //
    // Default `false` so first-time bookings get the allowance billed
    // (matches the customer-side default toggle position of OFF).
    needsStay: false,
    needsFood: false,
  },
  fareEstimate: null,
  couponCode: null,
};

const useBookingDraftStore = create(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      setServiceType(serviceType) {
        if (![SERVICE_TYPES.HOURLY, SERVICE_TYPES.OUTSTATION].includes(serviceType)) return;
        // Switching service types nukes the type-specific fields so we don't
        // submit hourly + outstation data together.
        set({
          serviceType,
          bookingType: null,
          hourly: { ...DEFAULT_STATE.hourly },
          outstation: { ...DEFAULT_STATE.outstation },
          dropoff: null,
          fareEstimate: null,
        });
      },

      setBookingType(bookingType) {
        if (![BOOKING_TYPE.INSTANT, BOOKING_TYPE.SCHEDULED, BOOKING_TYPE.OUTSTATION].includes(bookingType)) return;
        set({ bookingType });
      },

      setPickup(pickup) {
        set({ pickup, fareEstimate: null });
      },

      setDropoff(dropoff) {
        // Mirror into outstation.destinationAddress so the create payload keeps
        // working without a backend change.
        const next = { dropoff, fareEstimate: null };
        if (get().serviceType === SERVICE_TYPES.OUTSTATION) {
          next.outstation = {
            ...get().outstation,
            destinationAddress: dropoff?.address || '',
            destinationLat: dropoff?.lat ?? null,
            destinationLng: dropoff?.lng ?? null,
          };
        }
        set(next);
      },

      setCarId(carId) {
        set({ carId: carId || null });
      },

      setHourly(patch) {
        set({ hourly: { ...get().hourly, ...patch }, fareEstimate: null });
      },

      setOutstation(patch) {
        set({ outstation: { ...get().outstation, ...patch }, fareEstimate: null });
      },

      setFareEstimate(fareEstimate) {
        set({ fareEstimate });
      },

      setCouponCode(couponCode) {
        set({ couponCode: couponCode || null, fareEstimate: null });
      },

      reset() {
        set({ ...DEFAULT_STATE });
      },

      /** Build the payload the booking-create endpoint expects. */
      buildCreatePayload() {
        const s = get();
        const pickupPayload = s.pickup
          ? {
              address: s.pickup.address,
              city: s.pickup.city || '',
              location: {
                type: 'Point',
                coordinates: [s.pickup.lng, s.pickup.lat],
              },
            }
          : null;

        // Hourly today defaults dropoff to pickup. Outstation keeps a real
        // dropoff. Either way we send a `dropoff` block so the backend can
        // persist it.
        const dropPoint = s.dropoff || (s.serviceType === SERVICE_TYPES.HOURLY ? s.pickup : null);
        const dropoffPayload = dropPoint
          ? {
              address: dropPoint.address,
              city: dropPoint.city || '',
              location: {
                type: 'Point',
                coordinates: [dropPoint.lng, dropPoint.lat],
              },
            }
          : null;

        const payload = {
          serviceType: s.serviceType,
          // For outstation always send the outstation booking type —
          // the backend also enforces this override, but sending it
          // from the client keeps both sides consistent.
          bookingType:
            s.serviceType === SERVICE_TYPES.OUTSTATION
              ? BOOKING_TYPE.OUTSTATION
              : s.bookingType || BOOKING_TYPE.INSTANT,
          carId: s.carId || null,
          pickup: pickupPayload,
          dropoff: dropoffPayload,
        };

        if (s.serviceType === SERVICE_TYPES.HOURLY) {
          payload.hourly = {
            scheduledStartAt: s.hourly.scheduledStartAt,
            durationHours: s.hourly.durationHours,
            slabId: s.hourly.isCustomDuration ? null : s.hourly.slabId,
            isCustomDuration: !!s.hourly.isCustomDuration,
            // Only forward overrides the user explicitly set. `null`
            // means "use the admin/default behaviour" — the backend
            // treats undefined as `true` (allowance on).
            ...(s.hourly.foodProvided != null
              ? { foodProvided: !!s.hourly.foodProvided }
              : {}),
            ...(s.hourly.stayProvided != null
              ? { stayProvided: !!s.hourly.stayProvided }
              : {}),
          };
        }
        if (s.serviceType === SERVICE_TYPES.OUTSTATION) {
          // Prefer `pickupAt` / `expectedReturnAt` but fall back to the
          // legacy `startDate` / `endDate` if the draft was set by an
          // older flow. The backend accepts either pair (see
          // validateCreateInput in booking.service.js).
          const pickupAt = s.outstation.pickupAt || s.outstation.startDate;
          const expectedReturnAt =
            s.outstation.expectedReturnAt || s.outstation.endDate;
          payload.outstation = {
            destinationAddress: s.outstation.destinationAddress,
            pickupAt,
            expectedReturnAt,
            startDate: pickupAt,
            endDate: expectedReturnAt,
            days: s.outstation.days,
            nights: s.outstation.nights,
            needsStay: s.outstation.needsStay,
            needsFood: s.outstation.needsFood,
          };
        }
        if (s.couponCode) payload.couponCode = s.couponCode;
        return payload;
      },
    }),
    {
      name: 'spareDriver.bookingDraft',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

export default useBookingDraftStore;
