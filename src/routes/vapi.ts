import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';

/**
 * VAPI server-tools endpoint.
 *
 * VAPI calls our webhook when the assistant invokes a "tool" (function call).
 * We resolve the doctor's name -> id, validate the slot, create the appointment
 * under the user's account, and respond with a result message that the
 * assistant speaks back to the user.
 *
 * Body shape (from VAPI):
 *   {
 *     message: { type: 'tool-calls', toolCalls: [
 *       { id, function: { name, arguments: '<JSON string>' } }
 *     ]},
 *     call: { id, customer: { number }, ... }
 *   }
 *
 * Response shape (VAPI expects):
 *   { results: [{ toolCallId, result: '<string summary>' }] }
 */
export const vapiRouter = Router();

interface VapiMessage {
  type: string;
  toolCalls?: Array<{
    id: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

interface VapiBody {
  message?: VapiMessage;
  call?: {
    id?: string;
    customer?: { number?: string };
    metadata?: Record<string, string>;
  };
}

/**
 * POST /api/vapi/tools
 *
 * VAPI "Server" tool endpoint. Looks up the user from the JWT (passed either
 * in Authorization header OR in call.metadata.jwt), processes the tool calls,
 * and returns the formatted results VAPI will surface to the assistant.
 */
vapiRouter.post('/tools', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as VapiBody;
    const toolCalls = body?.message?.toolCalls ?? [];
    if (toolCalls.length === 0) {
      throw new AppError(400, 'No tool calls present in VAPI payload.');
    }

    // Resolve user. Prefer the explicit Bearer token (forwarded from Android app),
    // else fall back to JWT embedded in VAPI call metadata.
    const userId = await resolveUserId(req, body);
    if (!userId) {
      return res.json(formatToolError(
        toolCalls[0].id,
        'I can only book for signed-in MediConnect users. Please open the app and try again.'
      ));
    }

    const results = await Promise.all(toolCalls.map(async (tc) => {
      try {
        const args = safeParseJson(tc.function.arguments) as Record<string, any>;
        switch (tc.function.name) {
          case 'bookAppointment':
            return { toolCallId: tc.id, result: await bookAppointment(userId, args) };
          case 'cancelAppointment':
            return { toolCallId: tc.id, result: await cancelAppointment(userId, args) };
          case 'listMyAppointments':
            return { toolCallId: tc.id, result: await listMyAppointments(userId) };
          case 'listDoctors':
            return { toolCallId: tc.id, result: await listDoctors(args) };
          case 'getDoctorSlots':
            return { toolCallId: tc.id, result: await getDoctorSlots(args) };
          default:
            return {
              toolCallId: tc.id,
              result: `Unknown tool: ${tc.function.name}`,
            };
        }
      } catch (err) {
        const msg = err instanceof AppError ? err.message : 'Tool failed unexpectedly.';
        return { toolCallId: tc.id, result: `Error: ${msg}` };
      }
    }));

    return res.json({ results });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/vapi/login-token — exchange a short-lived OTP-ish token for a real JWT.
 *
 * For voice-only callers (e.g. a phone call where there's no logged-in user),
 * VAPI's call.metadata can carry a phone number. We look up the user by phone
 * and mint a token, which the assistant can use in follow-up tool calls.
 * In the MediConnect Android flow, we always send the user's real JWT via the
 * Authorization header and never hit this endpoint.
 */
vapiRouter.post('/login-token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, guestName } = req.body ?? {};
    if (!phone || typeof phone !== 'string') {
      throw new AppError(400, 'Phone number is required.');
    }

    let user = await prisma.user.findFirst({
      where: { phone, role: 'PATIENT' },
    });

    if (!user) {
      if (!guestName || typeof guestName !== 'string') {
        throw new AppError(404, 'No account found for that phone. Provide guestName to create one.');
      }
      const parts = guestName.trim().split(/\s+/);
      const firstName = parts[0];
      const lastName = parts.slice(1).join(' ') || 'Guest';
      const guestEmail = `guest_${phone.replace(/\D/g, '')}@mediconnect.guest`;
      const tempPassword = await bcrypt.hash('guest-temp-' + Date.now(), 6);
      user = await prisma.user.create({
        data: {
          email: guestEmail,
          passwordHash: tempPassword,
          firstName,
          lastName,
          phone,
          role: 'PATIENT',
        },
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─── helpers ─────────────────────────────────────────────────────────────

async function resolveUserId(req: Request, body: VapiBody): Promise<string | null> {
  // 1. Bearer header (preferred for Android flow)
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(auth.slice(7), config.jwt.secret) as { id: string };
      const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: { id: true, isActive: true } });
      if (user?.isActive) return user.id;
    } catch {
      // fall through
    }
  }
  // 2. Metadata JWT (if the Android app injects it via the dial call)
  const meta = body.call?.metadata ?? {};
  if (meta.jwt) {
    try {
      const decoded = jwt.verify(meta.jwt, config.jwt.secret) as { id: string };
      const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: { id: true, isActive: true } });
      if (user?.isActive) return user.id;
    } catch {
      // fall through
    }
  }
  // 3. Phone lookup (last resort — phone calls without app session)
  const phone = body.call?.customer?.number ?? meta.phone;
  if (phone) {
    const user = await prisma.user.findFirst({
      where: { phone, role: 'PATIENT', isActive: true },
      select: { id: true },
    });
    if (user) return user.id;
  }
  return null;
}

function safeParseJson(s: string): Record<string, any> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function formatToolError(toolCallId: string, msg: string) {
  return { results: [{ toolCallId, result: `Error: ${msg}` }] };
}

/**
 * Book an appointment for the resolved patient.
 *
 * args: { doctorName?, doctorId?, appointmentDate (YYYY-MM-DD), startTime (HH:mm),
 *         reason?, preferredHour? }
 */
async function bookAppointment(userId: string, args: Record<string, any>): Promise<string> {
  const dateStr = (args.appointmentDate ?? args.date ?? '').toString().trim();
  const startTime = (args.startTime ?? args.time ?? '').toString().trim();

  if (!isValidYmd(dateStr)) {
    return 'I need the appointment date in YYYY-MM-DD format. Could you give me the date again?';
  }
  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    return 'I need the time in HH:MM 24-hour format. Could you give me the time again?';
  }

  // Resolve doctor. Prefer doctorId; else look up by name (fuzzy).
  type DoctorWithUser = {
    id: string;
    consultationFee: any;
    user: { firstName: string; lastName: string };
  };
  let doctor: DoctorWithUser | null = null;

  if (args.doctorId && typeof args.doctorId === 'string') {
    const fd = await prisma.doctor.findUnique({
      where: { id: args.doctorId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    doctor = fd as DoctorWithUser | null;
  }
  if (!doctor && args.doctorName && typeof args.doctorName === 'string') {
    const name = args.doctorName.toLowerCase().replace(/^dr\.?\s*/i, '').trim();
    const all = await prisma.doctor.findMany({
      where: { isAvailable: true },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    for (const d of all) {
      const doc = d as any;
      const full = `${doc.user.firstName} ${doc.user.lastName}`.toLowerCase();
      const last = doc.user.lastName.toLowerCase();
      if (full.includes(name) || last.includes(name) || name.includes(full)) {
        doctor = doc as DoctorWithUser;
        break;
      }
    }
  }
  if (!doctor) {
    return 'I could not find that doctor on our team. Could you pick one of: Dr. Sarah Chen, Dr. Michael Patel, Dr. James Khan, Dr. Emma Williams, or Dr. Lisa Rodriguez?';
  }

  const apptDate = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = apptDate.getUTCDay();

  // Find a free slot matching the requested startTime
  let slot = await prisma.availabilitySlot.findFirst({
    where: { doctorId: doctor.id, dayOfWeek, startTime, isBooked: false },
  });

  // If the requested time isn't available, find the next free slot the same day
  // and report that back so the assistant can offer it.
  let offeredTime = startTime;
  if (!slot) {
    const next = await prisma.availabilitySlot.findFirst({
      where: { doctorId: doctor.id, dayOfWeek, isBooked: false },
      orderBy: { startTime: 'asc' },
    });
    if (!next) {
      return `${doctor.user.firstName} ${doctor.user.lastName} has no availability on ${dateStr}. Want me to try a different day?`;
    }
    slot = next;
    offeredTime = next.startTime;
  }

  // Check we don't double-book this patient
  const dup = await prisma.appointment.findFirst({
    where: {
      patientId: userId,
      appointmentDate: apptDate,
      startTime: offeredTime,
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
    },
  });
  if (dup) {
    if (dup.doctorId === doctor.id) {
      return `You already have an appointment with ${doctor.user.firstName} ${doctor.user.lastName} at ${prettyTime(offeredTime)} on that day. Want a different time?`;
    }
    return `You already have another appointment at ${offeredTime} that day. Pick a different time?`;
  }

  const reason = (args.reason ?? '').toString().trim().slice(0, 500) || null;

  const [appointment] = await prisma.$transaction([
    prisma.appointment.create({
      data: {
        patientId: userId,
        doctorId: doctor.id,
        slotId: slot.id,
        appointmentDate: apptDate,
        startTime: offeredTime,
        endTime: slot.endTime,
        reason,
        status: 'PENDING',
      },
      include: {
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

  const doc = appointment.doctor as any;
  const fee = doc.consultationFee ?? 75;
  const docName = `${doc.user.firstName} ${doc.user.lastName}`;
  const dateLabel = formatHumanDate(dateStr);

  if (offeredTime !== startTime) {
    return `Booked! Your closest available time with ${docName} on ${dateLabel} is ${prettyTime(offeredTime)} — I put you down for that. The fee is $${fee}.`;
  }
  return `Booked! You're confirmed with ${docName} on ${dateLabel} at ${prettyTime(offeredTime)}. The fee is $${fee}. You can see it in your Appointments tab.`;
}

async function cancelAppointment(userId: string, args: Record<string, any>): Promise<string> {
  const appointmentId = (args.appointmentId ?? '').toString();
  const a = appointmentId
    ? await prisma.appointment.findFirst({ where: { id: appointmentId, patientId: userId } })
    : null;
  if (!a) {
    return "I couldn't find that appointment. Check the Appointments tab in the app.";
  }
  if (a.status === 'CANCELLED') return 'That appointment was already cancelled.';
  if (a.status === 'COMPLETED') return 'That appointment is already completed.';
  await prisma.appointment.update({ where: { id: a.id }, data: { status: 'CANCELLED' } });
  if (a.slotId) {
    await prisma.availabilitySlot.update({ where: { id: a.slotId }, data: { isBooked: false } });
  }
  return `Done. Your appointment on ${formatHumanDate(a.appointmentDate.toISOString())} at ${prettyTime(a.startTime)} is cancelled.`;
}

async function listMyAppointments(userId: string): Promise<string> {
  const upcoming = await prisma.appointment.findMany({
    where: {
      patientId: userId,
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      appointmentDate: { gte: new Date() },
    },
    orderBy: { appointmentDate: 'asc' },
    take: 5,
    include: {
      doctor: {
        select: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });
  if (upcoming.length === 0) return 'You have no upcoming appointments.';
  const lines = upcoming.map(a => {
    const dn = `${(a.doctor as any).user.firstName} ${(a.doctor as any).user.lastName}`;
    return `${dn} on ${formatHumanDate(a.appointmentDate.toISOString())} at ${prettyTime(a.startTime)}`;
  });
  return `You have ${upcoming.length} upcoming appointment${upcoming.length === 1 ? '' : 's'}: ${lines.join('; ')}.`;
}

function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00');
  return !isNaN(d.getTime());
}

function formatHumanDate(ymdOrIso: string): string {
  const d = ymdOrIso.length === 10 ? new Date(ymdOrIso + 'T00:00:00') : new Date(ymdOrIso);
  if (isNaN(d.getTime())) return ymdOrIso;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return 'today';
  if (same(d, tomorrow)) return 'tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function prettyTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * List doctors, optionally filtered by specialty.
 * args: { specialty? }
 */
async function listDoctors(args: Record<string, any>): Promise<string> {
  const specialtyFilter = (args.specialty ?? '').toString().trim();
  const where: any = { isAvailable: true };
  if (specialtyFilter) {
    where.specialties = { some: { specialty: { name: { contains: specialtyFilter, mode: 'insensitive' } } } };
  }
  const doctors = await prisma.doctor.findMany({
    where,
    include: {
      user: { select: { firstName: true, lastName: true } },
      specialties: { include: { specialty: { select: { name: true } } } },
    },
    orderBy: { user: { firstName: 'asc' } },
  });
  if (doctors.length === 0) return 'No doctors found.';
  const lines = doctors.map(d => {
    const specs = d.specialties.map(s => s.specialty.name).join(', ');
    return `${d.user.firstName} ${d.user.lastName} — ${specs} ($${d.consultationFee})`;
  });
  return lines.join('; ');
}

/**
 * Get available slots for a doctor on a given date.
 * args: { doctorName, date (YYYY-MM-DD) }
 */
async function getDoctorSlots(args: Record<string, any>): Promise<string> {
  const doctorName = (args.doctorName ?? '').toString().trim().toLowerCase().replace(/^dr\.?\s*/i, '');
  const dateStr = (args.date ?? args.appointmentDate ?? '').toString().trim();
  if (!isValidYmd(dateStr)) return 'I need a valid date in YYYY-MM-DD format.';

  const doctors = await prisma.doctor.findMany({
    where: { isAvailable: true },
    include: { user: { select: { firstName: true, lastName: true } } },
  });
  const doctor = doctors.find(d => {
    const full = `${d.user.firstName} ${d.user.lastName}`.toLowerCase();
    const last = d.user.lastName.toLowerCase();
    return full.includes(doctorName) || last.includes(doctorName);
  });
  if (!doctor) return 'Doctor not found.';

  const apptDate = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = apptDate.getUTCDay();
  const slots = await prisma.availabilitySlot.findMany({
    where: { doctorId: doctor.id, dayOfWeek, isBooked: false },
    orderBy: { startTime: 'asc' },
  });
  if (slots.length === 0) return `${doctor.user.firstName} ${doctor.user.lastName} has no available slots on ${dateStr}.`;
  const times = slots.map(s => prettyTime(s.startTime)).join(', ');
  const fee = (doctor as any).consultationFee ?? 75;
  return `${doctor.user.firstName} ${doctor.user.lastName} is available on ${dateStr} at: ${times}. Fee: $${fee}.`;
}
