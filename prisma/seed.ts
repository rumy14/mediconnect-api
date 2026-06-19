import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Clean existing data
  await prisma.notification.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.availabilitySlot.deleteMany();
  await prisma.doctorSpecialty.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.specialty.deleteMany();
  await prisma.user.deleteMany();

  const hash = await bcrypt.hash('password123', 12);

  // --- Specialties ---
  const specialties = await Promise.all([
    prisma.specialty.create({ data: { name: 'General Medicine', icon: '🩺', description: 'Primary care and general health consultations' } }),
    prisma.specialty.create({ data: { name: 'Cardiology', icon: '❤️', description: 'Heart and cardiovascular system' } }),
    prisma.specialty.create({ data: { name: 'Dermatology', icon: '🧴', description: 'Skin, hair, and nail conditions' } }),
    prisma.specialty.create({ data: { name: 'Pediatrics', icon: '👶', description: 'Child healthcare from birth to adolescence' } }),
    prisma.specialty.create({ data: { name: 'Orthopedics', icon: '🦴', description: 'Bones, joints, and musculoskeletal system' } }),
    prisma.specialty.create({ data: { name: 'Neurology', icon: '🧠', description: 'Brain, spine, and nervous system' } }),
    prisma.specialty.create({ data: { name: 'Ophthalmology', icon: '👁️', description: 'Eye and vision care' } }),
    prisma.specialty.create({ data: { name: 'Psychiatry', icon: '💚', description: 'Mental health and emotional well-being' } }),
  ]);

  // --- Patient ---
  const patient = await prisma.user.create({
    data: {
      email: 'john@example.com',
      passwordHash: hash,
      firstName: 'John',
      lastName: 'Doe',
      phone: '+1-555-0100',
      role: UserRole.PATIENT,
    },
  });

  // --- Doctor Users + Profiles ---
  const doctorData = [
    { email: 'sarah@mediconnect.com', firstName: 'Sarah', lastName: 'Chen', phone: '+1-555-0101', license: 'MD-1001', bio: 'Experienced general physician with 12 years in primary care.', education: 'Harvard Medical School', experience: '12 years', fee: 75.00, specialties: ['General Medicine'] },
    { email: 'mike@mediconnect.com', firstName: 'Michael', lastName: 'Patel', phone: '+1-555-0102', license: 'MD-1002', bio: 'Board-certified cardiologist specializing in preventive heart health.', education: 'Johns Hopkins University', experience: '15 years', fee: 150.00, specialties: ['Cardiology'] },
    { email: 'emma@mediconnect.com', firstName: 'Emma', lastName: 'Williams', phone: '+1-555-0103', license: 'MD-1003', bio: 'Pediatrician dedicated to compassionate care for children.', education: 'Stanford Medical School', experience: '8 years', fee: 100.00, specialties: ['Pediatrics'] },
    { email: 'james@mediconnect.com', firstName: 'James', lastName: 'Khan', phone: '+1-555-0104', license: 'MD-1004', bio: 'Dermatologist with expertise in medical and cosmetic dermatology.', education: 'UCSF School of Medicine', experience: '10 years', fee: 125.00, specialties: ['Dermatology'] },
    { email: 'lisa@mediconnect.com', firstName: 'Lisa', lastName: 'Rodriguez', phone: '+1-555-0105', license: 'MD-1005', bio: 'Orthopedic surgeon specializing in sports medicine and joint replacement.', education: 'Mayo Clinic Alix School of Medicine', experience: '14 years', fee: 175.00, specialties: ['Orthopedics'] },
    // --- Additional doctors ---
    { email: 'robert@mediconnect.com', firstName: 'Robert', lastName: 'Kim', phone: '+1-555-0106', license: 'MD-1006', bio: 'Neurologist specializing in stroke prevention, epilepsy, and neurodegenerative disorders.', education: 'UCLA School of Medicine', experience: '11 years', fee: 160.00, specialties: ['Neurology'] },
    { email: 'maria@mediconnect.com', firstName: 'Maria', lastName: 'Garcia', phone: '+1-555-0107', license: 'MD-1007', bio: 'Ophthalmologist with expertise in cataract surgery, glaucoma, and LASIK.', education: 'Wilmer Eye Institute, Johns Hopkins', experience: '9 years', fee: 140.00, specialties: ['Ophthalmology'] },
    { email: 'david@mediconnect.com', firstName: 'David', lastName: 'Thompson', phone: '+1-555-0108', license: 'MD-1008', bio: 'Board-certified psychiatrist providing compassionate mental health care for adults and adolescents.', education: 'Yale School of Medicine', experience: '13 years', fee: 130.00, specialties: ['Psychiatry'] },
    { email: 'jennifer@mediconnect.com', firstName: 'Jennifer', lastName: 'Brown', phone: '+1-555-0109', license: 'MD-1009', bio: 'Family medicine physician focusing on preventive care and chronic disease management.', education: 'University of Michigan Medical School', experience: '7 years', fee: 80.00, specialties: ['General Medicine'] },
    { email: 'ahmed@mediconnect.com', firstName: 'Ahmed', lastName: 'Hassan', phone: '+1-555-0110', license: 'MD-1010', bio: 'Interventional cardiologist skilled in angioplasty, stent placement, and cardiac rehabilitation.', education: 'Cleveland Clinic Lerner College of Medicine', experience: '16 years', fee: 180.00, specialties: ['Cardiology'] },
    { email: 'sophia@mediconnect.com', firstName: 'Sophia', lastName: 'Martinez', phone: '+1-555-0111', license: 'MD-1011', bio: 'Pediatrician with a focus on adolescent medicine, vaccination programs, and childhood development.', education: 'Children\'s Hospital of Philadelphia', experience: '6 years', fee: 95.00, specialties: ['Pediatrics'] },
    { email: 'william@mediconnect.com', firstName: 'William', lastName: 'Turner', phone: '+1-555-0112', license: 'MD-1012', bio: 'Orthopedic surgeon specializing in minimally invasive joint replacement and sports injuries.', education: 'Hospital for Special Surgery (Cornell)', experience: '12 years', fee: 185.00, specialties: ['Orthopedics'] },
    { email: 'amy@mediconnect.com', firstName: 'Amy', lastName: 'Chen', phone: '+1-555-0113', license: 'MD-1013', bio: 'Dermatologist treating acne, eczema, psoriasis, and performing skin cancer screenings.', education: 'NYU Grossman School of Medicine', experience: '8 years', fee: 120.00, specialties: ['Dermatology'] },
  ];

  for (const doc of doctorData) {
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
      const spec = specialties.find((s) => s.name === specName);
      if (spec) {
        await prisma.doctorSpecialty.create({
          data: { doctorId: doctor.id, specialtyId: spec.id },
        });
      }
    }

    // Create availability slots (Mon-Fri 9 AM - 5 PM, Sat 9 AM - 2 PM)
    const weekdays = [1, 2, 3, 4, 5]; // Monday to Friday
    for (const day of weekdays) {
      // Morning slots (9:00 - 12:00)
      for (let hour = 9; hour < 12; hour++) {
        const start = `${hour.toString().padStart(2, '0')}:00`;
        const end = `${(hour + 1).toString().padStart(2, '0')}:00`;
        await prisma.availabilitySlot.create({
          data: { doctorId: doctor.id, dayOfWeek: day, startTime: start, endTime: end, isBooked: false },
        });
      }
      // Afternoon slots (13:00 - 17:00)
      for (let hour = 13; hour < 17; hour++) {
        const start = `${hour.toString().padStart(2, '0')}:00`;
        const end = `${(hour + 1).toString().padStart(2, '0')}:00`;
        await prisma.availabilitySlot.create({
          data: { doctorId: doctor.id, dayOfWeek: day, startTime: start, endTime: end, isBooked: false },
        });
      }
    }
    // Saturday: 9 AM - 2 PM
    for (let hour = 9; hour < 14; hour++) {
      const start = `${hour.toString().padStart(2, '0')}:00`;
      const end = `${(hour + 1).toString().padStart(2, '0')}:00`;
      await prisma.availabilitySlot.create({
        data: { doctorId: doctor.id, dayOfWeek: 6, startTime: start, endTime: end, isBooked: false },
      });
    }
  }

  console.log('✅ Database seeded successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
