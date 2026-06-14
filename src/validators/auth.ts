import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  phone: z.string().optional(),
  role: z.enum(['PATIENT', 'DOCTOR']).optional().default('PATIENT'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const doctorRegistrationSchema = registerSchema.extend({
  licenseNumber: z.string().min(1, 'License number is required'),
  specialtyIds: z.array(z.string()).min(1, 'At least one specialty is required'),
  consultationFee: z.number().positive('Fee must be positive').optional(),
  bio: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type DoctorRegistrationInput = z.infer<typeof doctorRegistrationSchema>;
