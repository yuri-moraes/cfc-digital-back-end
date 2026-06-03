# CFC Digital Backend

Learning management system API built with Node.js, Express, and PostgreSQL.

## Development

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Start dev server (requires PostgreSQL running)
npm run dev

# Run tests
npm test

# Watch mode
npm run test:watch
```

## Deployment to Vercel

### Prerequisites
- Vercel account (https://vercel.com)
- GitHub repository (for CI/CD integration)
- PostgreSQL database (e.g., Neon, Railway, AWS RDS)
- Generated JWT secret key

### Backend Deployment Steps

1. Create a new project in Vercel:
   - Link to the `cfc-digital-backend` GitHub repository
   - Vercel will auto-detect Node.js project

2. Configure environment variables in Vercel dashboard:
   - `DATABASE_URL`: PostgreSQL connection string
     - Example: `postgresql://user:password@host:5432/cfc_digital`
   - `JWT_SECRET`: Long random secret key (use `openssl rand -base64 32` to generate)
   - `NODE_ENV`: Set to `production`
   - `PORT`: Set to `3001` (Vercel will override with dynamic port)

3. Deploy:
   - Push to main branch or use Vercel dashboard's deploy button
   - Vercel will run `npm install` and start the server
   - Backend URL will be provided (e.g., `https://cfc-digital-backend.vercel.app`)

### Frontend Deployment Steps

1. Create a new Vercel project for `cfc-digital`:
   - Link to the `cfc-digital` GitHub repository
   - Vercel auto-detects Next.js

2. Configure environment variables:
   - `NEXT_PUBLIC_API_URL`: Backend URL (e.g., `https://cfc-digital-backend.vercel.app/api`)
   - Deploy after backend is deployed to get the correct URL

3. Deploy:
   - Push to main or use Vercel dashboard
   - Frontend will be available at Vercel's provided URL

### Notes
- `.vercelignore` excludes unnecessary files from deployment bundle
- `vercel.json` references environment variables using `@` prefix (Vercel's secret reference syntax)
- Both projects need separate Vercel projects for independent deployment
- API communication uses `NEXT_PUBLIC_API_URL` environment variable (frontend → backend)
- Ensure database is accessible from Vercel (check security groups/firewalls)

## API

Base URL: `http://localhost:3001/api`

### Authentication

POST `/auth/login` - Login with email/password, receive JWT token

### Users

GET `/users` - List all users (admin only)
POST `/users` - Create user (admin only)
GET `/users/:id` - Get user details
PUT `/users/:id` - Update user
DELETE `/users/:id` - Delete user (admin only)

### Classes

GET `/classes` - List classes
POST `/classes` - Create class (admin/instructor)
GET `/classes/:id` - Get class details
PUT `/classes/:id` - Update class
DELETE `/classes/:id` - Delete class

### Schedules

GET `/schedules` - List schedules
POST `/schedules` - Create schedule
PUT `/schedules/:id` - Update schedule
DELETE `/schedules/:id` - Delete schedule

### Enrollments

GET `/enrollments` - List enrollments
POST `/enrollments` - Enroll in class
DELETE `/enrollments/:id` - Drop enrollment
