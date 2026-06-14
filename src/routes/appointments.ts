import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { success } from '../utils/response';
import { AppError } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { validate, validateQuery } from '../middleware/validate';
import { createAppointmentSchema, appointmentQuerySchema } from '../validators/appointment';

export const appointmentRouter = Router();

// All appointment routes require authentication
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
          patient: { select: { id: true, firstName: true, lastName: true } },
          doctor: {
            select: {
              id: true,
              consultationFee: true,
              user: { select: { firstName: true, lastName: true } },
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
              user: { select: { firstName: true, lastName: true } },
              specialties: {
                take: 1,
                include: { specialty: { select: { name: true } } },
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
            user: { select: { firstName: true, lastName: true, email: true } },
            specialties: {
              include: { specialty: { select: { name: true, icon: true } } },
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
          patient: { select: { id: true, firstName: true, lastName: true } },
          doctor: {
            select: { id: true, user: { select: { firstName: true, lastName: true } } },
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
