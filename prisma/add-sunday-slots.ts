import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

async function main() {
  const doctors = await prisma.doctor.findMany({ select: { id: true } });
  let added = 0;

  for (const doctor of doctors) {
    for (let hour = 9; hour < 14; hour++) {
      const start = pad(hour) + ':00';
      const end = pad(hour + 1) + ':00';
      const existing = await prisma.availabilitySlot.findUnique({
        where: {
          doctorId_dayOfWeek_startTime: {
            doctorId: doctor.id,
            dayOfWeek: 0,
            startTime: start,
          },
        },
      });
      if (!existing) {
        await prisma.availabilitySlot.create({
          data: {
            doctorId: doctor.id,
            dayOfWeek: 0,
            startTime: start,
            endTime: end,
            isBooked: false,
          },
        });
        added++;
      }
    }
  }

  console.log('Added ' + added + ' Sunday slots across ' + doctors.length + ' doctors');
}

main().catch(console.error).finally(() => prisma.$disconnect());
