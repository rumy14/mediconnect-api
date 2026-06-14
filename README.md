# MediConnect API — Doctor Appointment Booking System

REST API backend for a medical consultancy firm's doctor appointment booking system.

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Auth:** JWT (bcryptjs + jsonwebtoken)
- **Validation:** Zod

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- npm or yarn

### Setup

```bash
# Clone & install
git clone https://github.com/rumy14/mediconnect-api.git
cd mediconnect-api
npm install

# Environment
cp .env.example .env
# Edit .env with your database URL and JWT secret

# Database
npm run db:migrate
npm run db:seed

# Run
npm run dev
```

### Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Start production server |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:push` | Push schema to DB |
| `npm run db:seed` | Seed sample data |
| `npm run db:studio` | Open Prisma Studio |
| `npm test` | Run tests |

## API Endpoints

### Auth
- `POST /api/auth/register` — Register new user
- `POST /api/auth/login` — Login
- `GET /api/auth/me` — Get current user profile

### Specialties
- `GET /api/specialties` — List all specialties
- `POST /api/specialties` — Create specialty (admin)

### Doctors
- `GET /api/doctors` — List doctors (filter by specialty)
- `GET /api/doctors/:id` — Get doctor profile
- `GET /api/doctors/:id/slots` — Get available time slots

### Appointments
- `POST /api/appointments` — Book appointment
- `GET /api/appointments` — List user's appointments
- `GET /api/appointments/:id` — Get appointment details
- `PATCH /api/appointments/:id/cancel` — Cancel appointment

## Database Schema

```
users           → patients & doctors
doctors         → doctor profiles & specialties
specialties     → medical specialties
appointments    → booking records
availability    → doctor time slots
notifications   → push notification queue
```

## Project Structure

```
src/
├── index.ts          # App entry point
├── config/           # Environment config
├── routes/           # Express route definitions
├── controllers/      # Request handlers
├── services/         # Business logic
├── middleware/       # Auth, validation, error handling
├── validators/       # Zod request schemas
├── types/            # TypeScript types
└── utils/            # Helpers & constants
prisma/
├── schema.prisma     # Database schema
└── seed.ts           # Sample data seeder
```
