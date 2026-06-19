import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Migration script: adds more doctors + extended availability slots.
 * Does NOT delete existing data — only inserts new records.
 */
const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('password123', 12);

  // Fetch existing specialties by name
  const specialties = await prisma.specialty.findMany();
  const specByName = Object.fromEntries(specialties.map((s) => [s.name, s]));

  // ─── New doctors to add ────────────────────────────────────────────────
  const newDoctors = [
    {
      email: 'robert@mediconnect.com',
      firstName: 'Robert',
      lastName: 'Kim',
      phone: '+1-555-0106',
      license: 'MD-1006',
      bio: 'Neurologist specializing in stroke prevention, epilepsy, and neurodegenerative disorders.',
      education: 'UCLA School of Medicine',
      experience: '11 years',
      fee: 160.00,
      specialties: ['Neurology'],
    },
    {
      email: 'maria@mediconnect.com',
      firstName: 'Maria',
      lastName: 'Garcia',
      phone: '+1-555-0107',
      license: 'MD-1007',
      bio: 'Ophthalmologist with expertise in cataract surgery, glaucoma, and LASIK.',
      education: 'Wilmer Eye Institute, Johns Hopkins',
      experience: '9 years',
      fee: 140.00,
      specialties: ['Ophthalmology'],
    },
    {
      email: 'david@mediconnect.com',
      firstName: 'David',
      lastName: 'Thompson',
      phone: '+1-555-0108',
      license: 'MD-1008',
      bio: 'Board-certified psychiatrist providing compassionate mental health care for adults and adolescents.',
      education: 'Yale School of Medicine',
      experience: '13 years',
      fee: 130.00,
      specialties: ['Psychiatry'],
    },
    {
      email: 'jennifer@mediconnect.com',
      firstName: 'Jennifer',
      lastName: 'Brown',
      phone: '+1-555-0109',
      license: 'MD-1009',
      bio: 'Family medicine physician focusing on preventive care and chronic disease management.',
      education: 'University of Michigan Medical School',
      experience: '7 years',
      fee: 80.00,
      specialties: ['General Medicine'],
    },
    {
      email: 'ahmed@mediconnect.com',
      firstName: 'Ahmed',
      lastName: 'Hassan',
      phone: '+1-555-0110',
      license: 'MD-1010',
      bio: 'Interventional cardiologist skilled in angioplasty, stent placement, and cardiac rehabilitation.',
      education: 'Cleveland Clinic Lerner College of Medicine',
      experience: '16 years',
      fee: 180.00,
      specialties: ['Cardiology'],
    },
    {
      email: 'sophia@mediconnect.com',
      firstName: 'Sophia',
      lastName: 'Martinez',
      phone: '+1-555-0111',
      license: 'MD-1011',
      bio: 'Pediatrician with a focus on adolescent medicine, vaccination programs, and childhood development.',
      education: 'Children\'s Hospital of Philadelphia',
      experience: '6 years',
      fee: 95.00,
      specialties: ['Pediatrics'],
    },
    {
      email: 'william@mediconnect.com',
      firstName: 'William',
      lastName: 'Turner',
      phone: '+1-555-0112',
      license: 'MD-1012',
      bio: 'Orthopedic surgeon specializing in minimally invasive joint replacement and sports injuries.',
      education: 'Hospital for Special Surgery (Cornell)',
      experience: '12 years',
      fee: 185.00,
      specialties: ['Orthopedics'],
    },
    {
      email: 'amy@mediconnect.com',
      firstName: 'Amy',
      lastName: 'Chen',
      phone: '+1-555-0113',
      license: 'MD-1013',
      bio: 'Dermatologist treating acne, eczema, psoriasis, and performing skin cancer screenings.',
      education: 'NYU Grossman School of Medicine',
      experience: '8 years',
      fee: 120.00,
      specialties: ['Dermatology'],
    },
  ];

  let created = 0;
  for (const doc of newDoctors) {
    // Skip if doctor already exists by email
    const existingUser = await prisma.user.findUnique({ where: { email: doc.email } });
    if (existingUser) {
      console.log(`⏭️  Skipping ${doc.firstName} ${doc.lastName} — already exists`);
      continue;
    }

    const user = await prisma.user.create({
      data: {
        email: doc.email,
        passwordHash: hash,
        firstName: doc.firstName,
        lastName: doc.lastName,
        phone: doc.phone,
        role: UserRole.DOCTOR,
      },
    });

    const doctor = await prisma.doctor.create({
      data: {
        userId: user.id,
        licenseNumber: doc.license,
        bio: doc.bio,
        education: doc.education,
        experience: doc.experience,
        consultationFee: doc.fee,
      },
    });

    // Link specialties
    for (const specName of doc.specialties) {
      const spec = specByName[specName];
      if (spec) {
        await prisma.doctorSpecialty.create({
          data: { doctorId: doctor.id, specialtyId: spec.id },
        });
      }
    }

    // ─── Slots: Monday–Friday 9AM–5PM + Saturday 9AM–2PM ──────
    const weekdays = [1, 2, 3, 4, 5]; // Mon–Fri
    for (const day of weekdays) {
      for (let hour = 9; hour < 12; hour++) {
        await prisma.availabilitySlot.create({
          data: { doctorId: doctor.id, dayOfWeek: day, startTime: `${hour.toString().padStart(2, '0')}:00`, endTime: `${(hour + 1).toString().padStart(2, '0')}:00`, isBooked: false },
        });
      }
      for (let hour = 13; hour < 17; hour++) {
        await prisma.availabilitySlot.create({
          data: { doctorId: doctor.id, dayOfWeek: day, startTime: `${hour.toString().padStart(2, '0')}:00`, endTime: `${(hour + 1).toString().padStart(2, '0')}:00`, isBooked: false },
        });
      }
    }

    // Saturday: 9AM–2PM
    for (let hour = 9; hour < 14; hour++) {
      await prisma.availabilitySlot.create({
        data: { doctorId: doctor.id, dayOfWeek: 6, startTime: `${hour.toString().padStart(2, '0')}:00`, endTime: `${(hour + 1).toString().padStart(2, '0')}:00`, isBooked: false },
      });
    }

    created++;
    console.log(`✅ Added Dr. ${doc.firstName} ${doc.lastName} (${doc.specialties.join(', ')})`);
  }

  // ─── Also add Saturday slots for EXISTING doctors ────────────
  const existingDoctors = await prisma.doctor.findMany({
    where: { NOT: { user: { email: { in: newDoctors.map((d) => d.email) } } } },
  });

  let satSlots = 0;
  for (const doctor of existingDoctors) {
    for (let hour = 9; hour < 14; hour++) {
      const start = `${hour.toString().padStart(2, '0')}:00`;
      const end = `${(hour + 1).toString().padStart(2, '0')}:00`;
      // Avoid duplicates
      const existing = await prisma.availabilitySlot.findUnique({
        where: { doctorId_dayOfWeek_startTime: { doctorId: doctor.id, dayOfWeek: 6, startTime: start } },
      });
      if (!existing) {
        await prisma.availabilitySlot.create({
          data: { doctorId: doctor.id, dayOfWeek: 6, startTime: start, endTime: end, isBooked: false },
        });
        satSlots++;
      }
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   New doctors added: ${created}`);
  console.log(`   Saturday slot rows added for existing doctors: ${satSlots}`);

  const total = await prisma.doctor.count();
  console.log(`   Total doctors now: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
