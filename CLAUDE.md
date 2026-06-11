# CFC Digital Backend - Development Guide

## Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL 12+ (for local development)
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Create .env.local file with database configuration
cp .env.example .env.local

# Edit .env.local with your settings:
# DATABASE_URL=postgresql://user:password@localhost:5432/cfc_digital_dev
# NODE_ENV=development
# JWT_SECRET=your-secret-key (generated for development)
# PORT=3001
```

### Development Server

```bash
# Start development server with auto-reload
npm run dev

# Server starts at http://localhost:3001
# Health check: GET http://localhost:3001/health
```

### Testing

```bash
# Run all tests
npm test

# Run tests with coverage report
npm test -- --coverage

# Run tests in watch mode
npm run test:watch
```

### Building for Production

The backend is configured for deployment to Vercel. See `vercel.json` for deployment configuration.

---

## Architecture Overview

### Core Technologies

- **Runtime**: Node.js (JavaScript ES modules)
- **Framework**: Express.js 5.x - HTTP server and routing
- **Database**: PostgreSQL with node-pg driver
- **Authentication**: JWT (JSON Web Tokens) for stateless auth
- **Password Hashing**: bcrypt for secure password storage
- **Testing**: Jest for unit/integration tests
- **HTTP Testing**: Supertest for API endpoint testing

### Key Design Patterns

#### Stateless Authentication
- JWT tokens issued on login, valid for 24 hours
- Token contains userId, email, and role (admin/instructor/student)
- Clients store token in localStorage and include in Authorization header
- No server-side session storage needed
- Token is invalidated client-side by removing from storage

#### Role-Based Access Control (RBAC)
- Three roles: `admin`, `instructor`, `student`
- Each route enforces role requirements via middleware
- Fine-grained permissions (e.g., students can only enroll themselves)

#### Data Validation
- Input validation on all endpoints
- Email format, password strength, required fields
- Business logic validation (e.g., end time > start time for schedules)

---

## Project Structure

```
cfc-digital-backend/
├── src/                          # Source code
│   ├── index.js                 # App factory and server startup
│   ├── config.js                # Configuration from environment
│   ├── constants.js             # Application constants (roles, etc)
│   │
│   ├── db/
│   │   ├── pool.js              # PostgreSQL connection pool management
│   │   └── init.js              # Database migrations runner
│   │   └── migrations/          # SQL migration files (001-020)
│   │
│   ├── models/                  # Data models (business logic)
│   │   ├── User.js              # User authentication, CRUD
│   │   ├── Vehicle.js           # Vehicle registry
│   │   ├── InstructorVehicle.js # Instructor-vehicle associations
│   │   ├── InstructorAvailability.js # Instructor available hours/days
│   │   ├── AvailableSlot.js     # Computed available lesson slots
│   │   ├── LessonSlot.js        # Booked lessons (student-instructor-vehicle-date-time)
│   │   ├── ExamResult.js        # Practical exam pass/fail per student per class
│   │   ├── Notification.js      # Notifications (cron-sent, read status)
│   │   └── NotificationPreference.js # User notification preferences
│   │
│   ├── routes/                  # Express route handlers
│   │   ├── index.js             # Route mounting
│   │   ├── auth.js              # Login, get current user
│   │   ├── users.js             # User CRUD (admin), self-profile (student/instructor)
│   │   ├── vehicles.js          # Vehicle CRUD (admin)
│   │   ├── instructors.js       # Instructor availability management
│   │   ├── slots.js             # Available slots query
│   │   ├── lessonSlots.js       # Lesson booking, status update
│   │   ├── examResults.js       # Exam result recording
│   │   ├── notifications.js     # Notification preferences + listing
│   │   └── cron.js              # Reminder sending (Vercel Cron)
│   │
│   ├── middleware/              # Express middleware
│   │   ├── auth.js              # JWT verification
│   │   ├── roleCheck.js         # Role-based access control
│   │   ├── errorHandler.js      # Global error handling
│   │   ├── requestLogger.js     # Structured logging
│   │   └── rateLimiter.js       # Rate limiting
│   │
│   └── utils/                   # Utility functions
│       ├── jwt.js               # JWT token generation/verification
│       ├── validators.js        # Input validation
│       ├── paginate.js          # Pagination helper
│       ├── logger.js            # Pino logger
│       └── whatsapp.js          # Z-API WhatsApp integration
│
├── api/
│   └── index.js                 # Vercel serverless function entry point
│
├── tests/                       # Test files (13 suites, 144 tests)
│   ├── setup.js                 # Test database setup/teardown
│   ├── auth.test.js
│   ├── users.test.js
│   ├── vehicles.test.js
│   ├── instructors.test.js
│   ├── slots.test.js
│   ├── lessonSlots.test.js
│   ├── examResults.test.js
│   ├── notifications.test.js
│   └── cron.test.js
│
├── jest.config.js              # Test runner configuration
├── .vercelignore               # Files to exclude from Vercel deployment
├── vercel.json                 # Vercel deployment configuration
├── package.json                # Dependencies and scripts
└── API.md                      # API documentation
```

---

## Database Schema

### Core tables (lesson-slot model)

**users**: Authentication, profiles, roles
- id, email, password_hash, name, role (admin/instructor/student)
- phone_number, license_number, license_expiry, preferred_vehicle_class

**vehicles**: Fleet registry
- id, plate, make, model, year, vehicle_class (auto/manual), status

**instructor_vehicles**: Instructor qualifications per vehicle
- id, instructor_id FK, vehicle_id FK

**instructor_availability**: Instructor available hours
- id, instructor_id FK, day_of_week, start_time, end_time

**lesson_slots**: Booked lessons (core transactional table)
- id, student_id FK, instructor_id FK, vehicle_id FK
- scheduled_date, start_time, status (scheduled/completed/cancelled/no_show/absent_valid/absent_charged)
- plate_at_checkin, validated_by FK, validated_at
- absence_declared_at, cancellation_reason, cancelled_by FK, cancelled_at
- created_at

**exam_results**: Practical exam outcomes
- id, student_id FK, class_category (A/B/B+/C/D/E), exam_date, result (pass/fail)

### Notification system tables

**notification_preferences**: User notification settings
- id, user_id FK, minutes_before (default 60), notify_via_email/sms/whatsapp

**notifications**: Sent notifications log
- id, user_id FK, lesson_slot_id FK, type, title, body, read, created_at

### Legacy tables (kept for backward compatibility, unused in new flow)

- classes, schedules, enrollments (from Phase 1)
- assignments, grades, attendance_records (from Phase 2A)
- schedule_cancellations, student_absences (from Phase 2C)

---

## API Endpoints

See `API.md` for complete documentation. Quick reference:

**Auth** (public)
- POST /api/auth/login
- GET /api/auth/me (requires JWT)

**Users** (admin: full CRUD; student/instructor: read/update self)
- GET /api/users (admin)
- POST /api/users (admin)
- GET /api/users/:id
- PUT /api/users/:id
- DELETE /api/users/:id (admin)

**Vehicles** (admin)
- GET /api/vehicles
- POST /api/vehicles
- GET /api/vehicles/:id
- PUT /api/vehicles/:id
- DELETE /api/vehicles/:id

**Instructors**
- GET /api/instructors/:instructorId/availability
- POST /api/instructors/:instructorId/availability
- DELETE /api/instructors/:instructorId/availability/:availabilityId

**Available Slots**
- GET /api/slots?instructorId=...&vehicleClass=...&fromDate=...&toDate=...

**Lesson Slots** (core booking)
- GET /api/lesson-slots (filters: studentId, instructorId, status, date range)
- POST /api/lesson-slots (student books lesson)
- PUT /api/lesson-slots/:id/status (instructor validates/cancels)
- PUT /api/lesson-slots/:id/absence (student declares absence)

**Exam Results**
- GET /api/exam-results (filters: studentId, classCategory)
- POST /api/exam-results (instructor records result)

**Notifications**
- GET /api/notifications/preferences (student/instructor)
- PUT /api/notifications/preferences (student/instructor)
- GET /api/notifications (paginated)
- PUT /api/notifications/:id/read
- PUT /api/notifications/read-all

**Cron** (internal, Vercel Cron)
- POST /api/cron/send-reminders (CRON_SECRET auth)

---

## Models API Reference

### User Model

```javascript
import User from './src/models/User.js';

// Authenticate user
const user = await User.authenticate(email, password);

// Create user (admin)
const newUser = await User.create({email, password, name, role, phoneNumber, ...});

// Find user
const user = await User.findById(userId);

// List users (admin)
const users = await User.list();

// Update user
const updated = await User.update(userId, updates);

// Delete user (admin)
await User.delete(userId);
```

### Vehicle Model

```javascript
import Vehicle from './src/models/Vehicle.js';

// Create vehicle (admin)
const vehicle = await Vehicle.create({plate, make, model, year, vehicleClass});

// Find vehicle
const vehicle = await Vehicle.findById(vehicleId);

// List all vehicles
const vehicles = await Vehicle.list();

// Update vehicle (admin)
const updated = await Vehicle.update(vehicleId, updates);

// Delete vehicle (admin)
await Vehicle.delete(vehicleId);
```

### LessonSlot Model

```javascript
import LessonSlot from './src/models/LessonSlot.js';

// Book lesson (student)
const slot = await LessonSlot.create({studentId, instructorId, vehicleId, scheduledDate, startTime});

// List lessons
const slots = await LessonSlot.list({studentId, instructorId, status, fromDate, toDate});

// Update status (instructor validates/cancels)
const updated = await LessonSlot.updateStatus(slotId, status, {validatedBy, cancellationReason, ...});

// Declare absence (student)
const updated = await LessonSlot.declareAbsence(slotId, studentId);
```

### InstructorAvailability Model

```javascript
import InstructorAvailability from './src/models/InstructorAvailability.js';

// Add availability (instructor)
const avail = await InstructorAvailability.create(instructorId, {dayOfWeek, startTime, endTime});

// List instructor availability
const avails = await InstructorAvailability.listByInstructor(instructorId);

// Delete availability (instructor)
await InstructorAvailability.delete(availabilityId);
```

### AvailableSlot Model

```javascript
import AvailableSlot from './src/models/AvailableSlot.js';

// Compute available slots (student booking UI)
const slots = await AvailableSlot.query({instructorId, vehicleClass, fromDate, toDate});
// Returns holes in instructor's calendar (factoring in existing lessons, availability)
```

### ExamResult Model

```javascript
import ExamResult from './src/models/ExamResult.js';

// Record exam result (instructor)
const result = await ExamResult.create({studentId, classCategory, examDate, result});

// List results (filters: studentId, classCategory)
const results = await ExamResult.list({studentId, classCategory});
```

### Notification Model

```javascript
import Notification from './src/models/Notification.js';

// Send notification (cron)
const notif = await Notification.create({userId, lessonSlotId, type, title, body});

// List user notifications
const notifs = await Notification.listByUser(userId, {limit, offset, read});

// Mark as read
await Notification.markRead(notificationId);

// Mark all as read
await Notification.markAllRead(userId);
```

---

## Development Workflow

### Adding a New Endpoint

1. **Create model method** (if needed) in `src/models/[Entity].js`
   - Add database query
   - Add validation
   - Add error handling

2. **Create route handler** in `src/routes/[entity].js`
   - Add Express route
   - Add authentication middleware
   - Call model method
   - Return response

3. **Test the endpoint** in `tests/[entity].test.js`
   - Test successful case
   - Test validation errors
   - Test authorization failures

4. **Document the endpoint** in `API.md`
   - Method and path
   - Authentication requirement
   - Request body example
   - Response examples (200, 400, 401, 403, 404)

### Example: Adding Delete User Endpoint

**Model** (src/models/User.js):
```javascript
static async delete(userId) {
  if (!userId) throw new Error('User ID is required');
  
  const result = await query(
    'DELETE FROM users WHERE id = $1',
    [userId]
  );
  
  if (result.rowCount === 0) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }
}
```

**Route** (src/routes/users.js):
```javascript
router.delete('/:id', authMiddleware, requireRole(USER_ROLES.ADMIN), async (req, res) => {
  try {
    await User.delete(req.params.id);
    res.status(200).json({ message: 'User deleted' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: error.message, statusCode });
  }
});
```

**Test** (tests/users.test.js):
```javascript
test('DELETE /users/:id - admin can delete user', async () => {
  const res = await request(app)
    .delete(`/users/${userId}`)
    .set('Authorization', `Bearer ${adminToken}`);
  
  expect(res.status).toBe(200);
  expect(res.body.message).toBe('User deleted');
});
```

---

## Error Handling

### Custom Error Classes

Use custom errors with status codes in models:

```javascript
// Not found error
const error = new Error('Resource not found');
error.statusCode = 404;
throw error;

// Validation error
const error = new Error('Invalid email format');
error.statusCode = 400;
throw error;

// Authorization error
const error = new Error('Forbidden');
error.statusCode = 403;
throw error;
```

Routes catch errors and return appropriate HTTP responses:

```javascript
try {
  // Do something
} catch (error) {
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    error: error.message,
    statusCode
  });
}
```

### Common Status Codes

- **200**: Success
- **201**: Created
- **204**: No Content
- **400**: Bad Request (validation error)
- **401**: Unauthorized (missing/invalid token)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found
- **409**: Conflict (duplicate entry)
- **500**: Server Error

---

## Authentication & Authorization

### JWT Tokens

Tokens are generated on login and include:
```javascript
{
  userId: 'user-uuid',
  email: 'user@example.com',
  role: 'student',
  iat: 1234567890,
  exp: 1234654290
}
```

### Middleware

**authMiddleware**: Verifies JWT token and adds user to request:
```javascript
req.user = {
  userId: '...',
  email: '...',
  role: '...'
}
```

**requireRole(...roles)**: Checks if user has one of the specified roles:
```javascript
router.delete('/:id', authMiddleware, requireRole(USER_ROLES.ADMIN), async (req, res) => {
  // Only admins can reach this route
});
```

---

## Testing Strategy

### Test Structure

- **Setup**: Database initialization and cleanup per test
- **Arrange**: Create test data (users, classes, etc)
- **Act**: Call API endpoint
- **Assert**: Check response status, data, and side effects

### Example Test

```javascript
test('GET /classes - should list all classes', async () => {
  // Arrange
  const teacher = await User.create('teacher@example.com', 'Pass123!', 'Teacher', 'instructor');
  const token = generateToken({ userId: teacher.id, role: teacher.role });
  const cls = await Class.create('Math 101', 'Math', teacher.id);

  // Act
  const res = await request(app)
    .get('/classes')
    .set('Authorization', `Bearer ${token}`);

  // Assert
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body[0].id).toBe(cls.id);
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/auth.test.js

# Run with coverage
npm test -- --coverage

# Watch mode
npm run test:watch
```

---

## Deployment

### Vercel Deployment

The backend is configured for serverless deployment on Vercel:

1. **Function**: `api/index.js` is the serverless function entry point
2. **Configuration**: `vercel.json` sets up routing and environment
3. **Ignoring**: `.vercelignore` excludes unnecessary files

To deploy:
```bash
npm run vercel:deploy
```

Or push to main branch if configured with Git integration.

### Environment Variables

Set in Vercel dashboard:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for signing JWTs
- `NODE_ENV` - Should be 'production'
- `PORT` - Server port (default 3000)

### Production Checklist

- [ ] DATABASE_URL points to production database
- [ ] JWT_SECRET is set and strong (32+ characters)
- [ ] NODE_ENV=production
- [ ] All tests passing
- [ ] API.md documentation is current
- [ ] Error logging is configured
- [ ] CORS is configured if needed
- [ ] Rate limiting is enabled (future)

---

## Development Notes

### Current State

- **Lesson-Slot Model**: Driving lessons (student-instructor-vehicle-date-time booking)
- **Core Features**: User auth (JWT), vehicle fleet, instructor availability, lesson booking
- **Notifications**: Cron-driven reminders via email/SMS/WhatsApp (Z-API integration)
- **Exam Tracking**: Practical exam result recording per student per vehicle class
- **Database**: PostgreSQL (20 migrations, auto-run on server start)
- **Authentication**: JWT with role-based access control (admin/instructor/student)
- **Testing**: 144 tests across 13 suites, all passing
- **Rate Limiting**: 10/15min on login, 100/min on all /api/*
- **Pagination**: Standard { data, meta } envelope on all list endpoints

### Known Limitations

- No refresh tokens (future enhancement)
- No audit logging of admin actions
- Limited email template customization for WhatsApp
- No SMS carrier integration (fire-and-forget via Z-API only)

### Future Enhancements

- Refresh token mechanism for improved security
- Audit log for all admin/instructor actions
- SMS delivery integration (currently WhatsApp only)
- Payment/subscription tracking
- Student progress analytics and reporting
- Instructor performance metrics

---

## Useful Commands

```bash
# Development
npm run dev                      # Start dev server with auto-reload
npm test                        # Run tests
npm test -- --coverage         # Run tests with coverage report

# Database
npm run db:migrate             # Run migrations (auto on server start)

# Code Quality
npm run lint                   # Lint code (not yet configured)

# Deployment
npm run vercel:deploy          # Deploy to Vercel
```

---

## Troubleshooting

### Tests Failing with Database Connection Error

The tests require a PostgreSQL database. Set `TEST_DATABASE_URL` environment variable or create local test database:

```bash
createdb cfc_digital_test
```

### JWT Token Errors

If you get "invalid token" errors:
1. Ensure token is in format: `Authorization: Bearer <token>`
2. Check JWT_SECRET matches between token generation and verification
3. Verify token hasn't expired (24 hour expiration)

### Port Already in Use

Change PORT environment variable:
```bash
PORT=3002 npm run dev
```

### Database Migration Errors

Migrations run automatically on server start. Check migration files in `src/db/migrations/` and ensure PostgreSQL is running.

---

## Additional Resources

- [Express.js Documentation](https://expressjs.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [JWT Introduction](https://jwt.io/introduction)
- [Jest Testing Framework](https://jestjs.io/)
- [API Documentation](./API.md)

---

## Contact & Support

For questions about the CFC Digital Backend project, refer to the project documentation or contact the development team.

Last Updated: June 2024
