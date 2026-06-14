import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { success } from '../utils/response';
import { authenticate, authorize } from '../middleware/auth';

export const specialtyRouter = Router();

// GET /api/specialties
specialtyRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const specialties = await prisma.specialty.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { doctors: true } } },
    });

    res.json(success(specialties));
  } catch (error) {
    next(error);
  }
});

// POST /api/specialties (admin only)
specialtyRouter.post('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, icon, description } = req.body;

    const specialty = await prisma.specialty.create({
      data: { name, icon, description },
    });

    res.status(201).json(success(specialty, 'Specialty created'));
  } catch (error) {
    next(error);
  }
});
