// Patch Prisma Decimal to serialize as number (default: string)
try {
  const { Decimal } = require('@prisma/client');
  if (Decimal?.prototype?.toJSON) {
    Decimal.prototype.toJSON = function () { return Number(this); };
  }
} catch { /* prisma not yet available */ }

import { createApp } from './app';
import { config } from './config';
import { prisma } from './utils/prisma';

async function main() {
  // Verify database connection
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }

  const app = createApp();

  app.listen(config.port, () => {
    console.log(`🚀 MediConnect API running on http://localhost:${config.port}`);
    console.log(`📋 Environment: ${config.nodeEnv}`);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
