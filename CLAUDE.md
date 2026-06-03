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
│   │   └── migrations/          # SQL migration files
│   │       ├── 001_create_users_table.sql
│   │       ├── 002_create_classes_table.sql
│   │       ├── 003_create_schedules_table.sql
│   │       └── 004_create_enrollments_table.sql
│   │
│   ├── models/                  # Data models (business logic)
│   │   ├── User.js              # User model - authentication, CRUD
│   │   ├── Class.js             # Class model - courses/subjects
│   │   ├── Schedule.js          # Schedule model - class meeting times
│   │   └── Enrollment.js        # Enrollment model - student-class relationships
│   │
│   ├── routes/                  # Express route handlers
│   │   ├── index.js             # Route mounting
│   │   ├── auth.js              # Login, logout, get current user
│   │   ├── users.js             # User CRUD and admin functions
│   │   ├── classes.js           # Class CRUD
│   │   ├── schedules.js         # Schedule CRUD
│   │   └── enrollments.js       # Enrollment CRUD
│   │
│   ├── middleware/              # Express middleware
│   │   ├── auth.js              # JWT verification
│   │   ├── roleCheck.js         # Role-based access control
│   │   └── errorHandler.js      # Global error handling
│   │
│   └── utils/                   # Utility functions
│       ├── jwt.js               # JWT token generation/verification
│       ├── validators.js        # Input validation functions
│       └── errors.js            # Custom error classes
│
├── api/
│   └── index.js                 # Vercel serverless function entry point
│
├── tests/                       # Test files
│   ├── setup.js                # Test database setup/teardown
│   ├── auth.test.js            # Authentication tests
│   ├── users.test.js           # User management tests
│   ├── classes.test.js         # Class management tests
│   ├── schedules.test.js       # Schedule management tests
│   └── enrollments.test.js     # Enrollment management tests
│
├── jest.config.js              # Test runner configuration
├── .vercelignore               # Files to exclude from Vercel deployment
├── vercel.json                 # Vercel deployment configuration
├── package.json                # Dependencies and scripts
└── API.md                      # API documentation
```

---

## Database Schema

### users table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'instructor', 'student')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### classes table
```sql
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### schedules table
```sql
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  day_of_week VARCHAR(20) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### enrollments table
```sql
CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, class_id)
);
```

---

## API Endpoints

See `API.md` for complete API documentation.

Quick reference:
- **Auth**: POST /auth/login, GET /auth/me, POST /auth/logout
- **Users**: GET/POST /users, GET/PUT/DELETE /users/:id
- **Classes**: GET/POST /classes, GET/PUT/DELETE /classes/:id
- **Schedules**: GET/POST /schedules, GET/PUT/DELETE /schedules/:id
- **Enrollments**: GET/POST /enrollments, DELETE /enrollments/:id

---

## Models API Reference

### User Model

```javascript
import { User } from './src/models/User.js';

// Authenticate user with email and password
const user = await User.authenticate(email, password);

// Create new user
const newUser = await User.create(email, password, name, role);

// Find user by ID
const user = await User.findById(userId);

// List all users
const users = await User.list();

// Update user
const updated = await User.update(userId, { name, email });

// Delete user
await User.delete(userId);
```

### Class Model

```javascript
import { Class } from './src/models/Class.js';

// Create class
const cls = await Class.create(name, description, instructorId);

// Find class by ID
const cls = await Class.findById(classId);

// List all classes
const classes = await Class.list();

// Update class (checks instructor ownership)
const updated = await Class.update(classId, updates, userId, userRole);

// Delete class (checks instructor ownership)
await Class.delete(classId, userId, userRole);
```

### Schedule Model

```javascript
import { Schedule } from './src/models/Schedule.js';

// Create schedule
const sched = await Schedule.create(classId, dayOfWeek, startTime, endTime);

// Find schedule by ID
const sched = await Schedule.findById(scheduleId);

// List schedules for class
const scheds = await Schedule.listByClass(classId);

// List schedules for instructor
const scheds = await Schedule.listByInstructor(instructorId);

// Update schedule (checks ownership)
const updated = await Schedule.update(scheduleId, updates, userId, userRole);

// Delete schedule (checks ownership)
await Schedule.delete(scheduleId, userId, userRole);
```

### Enrollment Model

```javascript
import { Enrollment } from './src/models/Enrollment.js';

// Create enrollment
const enr = await Enrollment.create(studentId, classId);

// List enrollments for student
const enrs = await Enrollment.listByStudent(studentId);

// List enrollments for class
const enrs = await Enrollment.listByClass(classId);

// List all enrollments
const enrs = await Enrollment.listAll();

// Delete enrollment (checks authorization)
await Enrollment.delete(enrollmentId, userId, userRole);
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

- **Phase 1 Complete**: Core API endpoints implemented
- **Database**: PostgreSQL with migrations
- **Authentication**: JWT with role-based access control
- **Testing**: Comprehensive test coverage with Jest + Supertest
- **Frontend Integration**: Ready for frontend consumption via REST API

### Known Limitations

- No backend database integration yet (migrations prepared, running in-memory during development)
- No email notifications
- No audit logging
- No rate limiting
- No pagination on list endpoints

### Future Enhancements

- Email notifications for class updates
- Audit log for admin actions
- Rate limiting and request throttling
- Pagination for list endpoints
- File upload support (e.g., class materials)
- WebSocket support for real-time updates
- Caching layer for frequently accessed data

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
