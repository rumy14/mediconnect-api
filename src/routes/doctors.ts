import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { success } from '../utils/response';
import { AppError } from '../middleware/errorHandler';

export const doctorRouter = Router();

// GET /api/doctors — list doctors (optional specialty filter)
doctorRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { specialty, page: pageStr, limit: limitStr } = req.query;
    const page = Math.max(1, parseInt(pageStr as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(limitStr as string) || 20));
    const skip = (page - 1) * limit;

    const where: any = { isAvailable: true };
    if (specialty) {
      where.specialties = { some: { specialty: { name: { equals: specialty as string, mode: 'insensitive' } } } };
    }

    const [doctors, total] = await Promise.all([
      prisma.doctor.findMany({
        where,
        skip,
        take: limit,
        orderBy: { averageRating: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          specialties: {
            include: { specialty: { select: { id: true, name: true, icon: true } } },
          },
          _count: { select: { appointments: true } },
        },
      }),
      prisma.doctor.count({ where }),
    ]);

    res.json({
      success: true,
      data: doctors,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/doctors/:id — doctor profile
doctorRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doctor = await prisma.doctor.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        specialties: {
          include: { specialty: { select: { id: true, name: true, icon: true, description: true } } },
        },
      },
    });

    if (!doctor) {
      throw new AppError(404, 'Doctor not found.');
    }

    res.json(success(doctor));
  } catch (error) {
    next(error);
  }
});

// GET /api/doctors/:id/slots — available time slots
// If authenticated, also filters out slots where the user already has an appointment on the same date
doctorRouter.get('/:id/slots', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = req.query;

    if (!date || typeof date !== 'string') {
      throw new AppError(400, 'Date query parameter is required (YYYY-MM-DD).');
    }

    const appointmentDate = new Date(date);
    const dayOfWeek = appointmentDate.getDay(); // 0=Sun

    const slots = await prisma.availabilitySlot.findMany({
      where: { doctorId: req.params.id, dayOfWeek, isBooked: false },
      orderBy: { startTime: 'asc' },
    });

    // If authenticated, filter out slots where user already has an appointment
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const { config } = require('../config');
        const decoded = jwt.verify(token, config.jwt.secret);

        const existingAppointments = await prisma.appointment.findMany({
          where: {
            patientId: decoded.id,
            appointmentDate,
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          },
          select: { startTime: true },
        });

        const conflictingTimes = new Set(existingAppointments.map(a => a.startTime));
        const filtered = slots.filter(s => !conflictingTimes.has(s.startTime));

        res.json(success(filtered));
        return;
      } catch {
        // If token validation fails, just return all available slots
      }
    }

    res.json(success(slots));
  } catch (error) {
    next(error);
  }
});
