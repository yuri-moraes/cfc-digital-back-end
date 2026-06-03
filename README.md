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
