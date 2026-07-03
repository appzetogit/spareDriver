import { z } from 'zod';

const latSchema = z.number().min(-90).max(90);
const lngSchema = z.number().min(-180).max(180);

export const createSosSchema = z.object({
  tripId: z.string().min(1, 'tripId is required'),
  latitude: latSchema,
  longitude: lngSchema,
});

export const updateSosLocationSchema = z.object({
  sosId: z.string().min(1, 'sosId is required'),
  latitude: latSchema,
  longitude: lngSchema,
});

export const createEmergencyContactSchema = z.object({
  name: z.string().trim().min(1).max(80),
  phoneNumber: z.string().regex(/^[0-9]{10}$/, 'Phone must be 10 digits'),
  relationship: z.string().trim().max(40).optional().default(''),
  isPrimary: z.boolean().optional().default(false),
});

export const updateEmergencyContactSchema = createEmergencyContactSchema.partial();

export const listAdminSosSchema = z.object({
  status: z.enum(['ACTIVE', 'RESOLVED', '']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().optional(),
});
