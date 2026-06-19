import { z } from 'zod';

export const createAppointmentSchema = z.object({
  doctorId: z.string().min(1, 'Doctor ID is required'),
  appointmentDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:mm format'),
  reason: z.string().max(500).optional(),
});

export const cancelAppointmentSchema = z.object({
  reason: z.string().max(300).optional(),
});

export const appointmentQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(10),
  status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type AppointmentQueryInput = z.infer<typeof appointmentQuerySchema>;
