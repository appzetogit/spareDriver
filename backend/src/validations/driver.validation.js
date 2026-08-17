import { z } from 'zod';

const optionalFinite = z.preprocess(
  (v) => (v === '' || v === undefined ? undefined : v),
  z.coerce.number().finite().nullable().optional(),
);

export const driverLocationUpdateSchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
  accuracy: optionalFinite,
  heading: optionalFinite,
  speed: optionalFinite,
});
