import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';
import { config } from '../config';
import { success } from '../utils/response';
import { AppError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { registerSchema, loginSchema } from '../validators/auth';
import { sendWelcomeEmail } from '../services/email';
import { triggerWelcomeCall } from '../services/vapi';

export const authRouter = Router();

// POST /api/auth/register
authRouter.post('/register', validate(registerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, firstName, lastName, phone, role } = req.body;

    // Check existing
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(409, 'An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(password, config.bcrypt.saltRounds);

    const user = await prisma.user.create({
      data: { email, passwordHash, firstName, lastName, phone, role },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, createdAt: true },
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Fire welcome email + call in background — don't block response
    Promise.all([
      sendWelcomeEmail(user.email, user.firstName),
      triggerWelcomeCall(user.phone!, user.firstName),
    ]).catch((err) => console.error('[SIGNUP] Background task error:', err));

    res.status(201).json(success({ user, token }, 'Registration successful'));
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login
authRouter.post('/login', validate(loginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, passwordHash: true, isActive: true, phone: true },
    });

    if (!user || !user.isActive) {
      throw new AppError(401, 'Invalid email or password.');
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      throw new AppError(401, 'Invalid email or password.');
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    const { passwordHash: _, ...safeUser } = user;
    res.json(success({ user: safeUser, token }, 'Login successful'));
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
authRouter.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, isActive: true, createdAt: true },
    });

    if (!user) {
      throw new AppError(404, 'User not found.');
    }

    res.json(success({ user }));
  } catch (error) {
    next(error);
  }
});
