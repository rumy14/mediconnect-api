import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma';
import { success } from '../utils/response';
import { AppError } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { validate, validateQuery } from '../middleware/validate';
import { createAppointmentSchema, appointmentQuerySchema } from '../validators/appointment';

export const appointmentRouter = Router();

// ─── Guest booking (no auth required) ───────────────────────────────────
// POST /api/appointments/guest — book an appointment without logging in
appointmentRouter.post('/guest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { patientName, patientPhone, doctorId, appointmentDate, startTime, reason } = req.body;

    // Validate required fields
    if (!patientName || typeof patientName !== 'string') {
      throw new AppError(400, 'Patient name is required.');
    }
    if (!patientPhone || typeof patientPhone !== 'string' || patientPhone.length < 6) {
      throw new AppError(400, 'Valid patient phone number is required.');
    }
    if (!doctorId || typeof doctorId !== 'string') {
      throw new AppError(400, 'Doctor ID is required.');
    }
    if (!appointmentDate || isNaN(Date.parse(appointmentDate))) {
      throw new AppError(400, 'Valid appointment date is required (YYYY-MM-DD).');
    }
    if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) {
      throw new AppError(400, 'Start time is required (HH:mm).');
    }

    const nameParts = patientName.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || 'Guest';

    // Check if a user with this phone already exists
    let user = await prisma.user.findFirst({ where: { phone: patientPhone, role: 'PATIENT' }, select: { id: true } });

    if (!user) {
      // Create a guest user account
      const guestEmail = `guest_${patientPhone.replace(/\D/g, '')}@mediconnect.guest`;
      const tempPassword = await bcrypt.hash('guest-temp-' + Date.now(), 6);

      user = await prisma.user.create({
        data: {
          email: guestEmail,
          passwordHash: tempPassword,
          firstName,
          lastName,
          phone: patientPhone,
          role: 'PATIENT',
        },
        select: { id: true },
      });
    }

    // Verify doctor exists
    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor || !doctor.isAvailable) {
      throw new AppError(404, 'Doctor not found or not available.');
    }

    const apptDate = new Date(appointmentDate);
    const dayOfWeek = apptDate.getDay();

    // Check slot exists and is free
    const slot = await prisma.availabilitySlot.findFirst({
      where: { doctorId, dayOfWeek, startTime, isBooked: false },
    });

    if (!slot) {
      throw new AppError(409, 'This time slot is not available. Please choose another.');
    }

    // Prevent double-booking on same date/time for this patient
    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        patientId: user.id,
        appointmentDate: apptDate,
        startTime,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
    });

    if (existingAppointment) {
      throw new AppError(409, 'You already have an appointment at this time.');
    }

    // Create appointment and mark slot as booked
    const [appointment] = await prisma.$transaction([
      prisma.appointment.create({
        data: {
          patientId: user.id,
          doctorId,
          slotId: slot.id,
          appointmentDate: apptDate,
          startTime,
          endTime: slot.endTime,
          reason: reason || null,
          status: 'PENDING',
        },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
          doctor: {
            select: {
              id: true,
              consultationFee: true,
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      }),
      prisma.availabilitySlot.update({
        where: { id: slot.id },
        data: { isBooked: true },
      }),
    ]);

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully! We will send a confirmation to your phone.',
      data: {
        appointmentId: appointment.id,
        doctorName: `Dr. ${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}`,
        date: appointmentDate,
        time: startTime,
        fee: appointment.doctor.consultationFee,
        status: appointment.status,
      },
    });
  } catch (error) {
    next(error);
  }
});

// All other appointment routes require authentication
appointmentRouter.use(authenticate);

// POST /api/appointments — book a new appointment
appointmentRouter.post('/', validate(createAppointmentSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { doctorId, appointmentDate, startTime, reason } = req.body;
    const patientId = req.user!.id;

    // Verify doctor exists
    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor || !doctor.isAvailable) {
      throw new AppError(404, 'Doctor not found or not available.');
    }

    const apptDate = new Date(appointmentDate);
    const dayOfWeek = apptDate.getDay();

    // Check slot exists and is free
    const slot = await prisma.availabilitySlot.findFirst({
      where: {
        doctorId,
        dayOfWeek,
        startTime,
        isBooked: false,
      },
    });

    if (!slot) {
      throw new AppError(409, 'This time slot is not available. Please choose another.');
    }

    // Prevent double-booking on same date/time for patient
    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        patientId,
        appointmentDate: apptDate,
        startTime,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
    });

    if (existingAppointment) {
      throw new AppError(409, 'You already have an appointment at this time.');
    }

    // Create appointment and mark slot as booked
    const [appointment] = await prisma.$transaction([
      prisma.appointment.create({
        data: {
          patientId,
          doctorId,
          slotId: slot.id,
          appointmentDate: apptDate,
          startTime,
          endTime: slot.endTime,
          reason,
          status: 'PENDING',
        },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          doctor: {
            select: {
              id: true,
              consultationFee: true,
              bio: true,
              user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
              specialties: {
                include: { specialty: { select: { id: true, name: true } } },
              },
            },
          },
        },
      }),
      prisma.availabilitySlot.update({
        where: { id: slot.id },
        data: { isBooked: true },
      }),
    ]);

    res.status(201).json(success(appointment, 'Appointment booked successfully'));
  } catch (error) {
    next(error);
  }
});

// GET /api/appointments — list user's appointments
appointmentRouter.get('/', validateQuery(appointmentQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, status } = req.query as any;
    const skip = (page - 1) * limit;
    const userId = req.user!.id;

    const where: any = {
      OR: [{ patientId: userId }, { doctor: { userId } }],
    };
    if (status) where.status = status;

    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { appointmentDate: 'desc' },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
          doctor: {
            select: {
              id: true,
              consultationFee: true,
              user: { select: { id: true, firstName: true, lastName: true } },
              specialties: {
                take: 1,
                include: { specialty: { select: { id: true, name: true } } },
              },
            },
          },
        },
      }),
      prisma.appointment.count({ where }),
    ]);

    res.json({
      success: true,
      data: appointments,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/appointments/:id — appointment details
appointmentRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        doctor: {
          select: {
            id: true,
            consultationFee: true,
            bio: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
            specialties: {
              include: { specialty: { select: { id: true, name: true, icon: true } } },
            },
          },
        },
      },
    });

    if (!appointment) {
      throw new AppError(404, 'Appointment not found.');
    }

    // Only the patient and the doctor can access
    if (appointment.patientId !== req.user!.id && appointment.doctor.userId !== req.user!.id) {
      throw new AppError(403, 'You do not have access to this appointment.');
    }

    res.json(success(appointment));
  } catch (error) {
    next(error);
  }
});

// PATCH /api/appointments/:id/cancel — cancel an appointment
appointmentRouter.patch('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
    });

    if (!appointment) {
      throw new AppError(404, 'Appointment not found.');
    }

    if (appointment.patientId !== req.user!.id && appointment.doctorId !== req.user!.id) {
      throw new AppError(403, 'You can only cancel your own appointments.');
    }

    if (appointment.status === 'CANCELLED' || appointment.status === 'COMPLETED') {
      throw new AppError(400, `Cannot cancel a ${appointment.status.toLowerCase()} appointment.`);
    }

    const [updatedAppointment] = await prisma.$transaction([
      prisma.appointment.update({
        where: { id: req.params.id },
        data: { status: 'CANCELLED' },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          doctor: {
            select: {
              id: true,
              consultationFee: true,
              bio: true,
              user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
              specialties: {
                include: { specialty: { select: { id: true, name: true } } },
              },
            },
          },
        },
      }),
      // Free up the slot if it exists
      ...(appointment.slotId
        ? [prisma.availabilitySlot.update({
            where: { id: appointment.slotId },
            data: { isBooked: false },
          })]
        : []),
    ]);

    res.json(success(updatedAppointment, 'Appointment cancelled successfully'));
  } catch (error) {
    next(error);
  }
});
