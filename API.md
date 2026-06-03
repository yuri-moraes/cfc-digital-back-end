# CFC Digital Backend API Documentation

## Base URLs

- **Development**: `http://localhost:3000/api`
- **Production**: `https://cfc-digital-backend.vercel.app/api`

## Authentication

All endpoints except `/auth/login` require Bearer token authentication via the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

The JWT token is obtained from the `/auth/login` endpoint and must be included in all subsequent requests.

---

## Authentication Endpoints

### POST /auth/login

Login with email and password to receive a JWT token.

**Authentication Required**: No

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "Password123!"
}
```

**Response 200 (Success)**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "student"
  }
}
```

**Response 400 (Validation Error)**:
```json
{
  "error": "Invalid email format",
  "statusCode": 400
}
```

**Response 401 (Invalid Credentials)**:
```json
{
  "error": "Invalid email or password",
  "statusCode": 401
}
```

---

### GET /auth/me

Get the current authenticated user's information.

**Authentication Required**: Yes

**Response 200 (Success)**:
```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "student",
  "createdAt": "2024-06-01T10:00:00Z"
}
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

---

### POST /auth/logout

Logout the current user (invalidate token client-side by removing from localStorage).

**Authentication Required**: Yes

**Response 200 (Success)**:
```json
{
  "message": "Logged out"
}
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

---

## User Management Endpoints

### GET /users

List all users in the system.

**Authentication Required**: Yes

**Role Requirements**: Admin only

**Response 200 (Success)**:
```json
[
  {
    "id": "user-uuid-1",
    "email": "admin@example.com",
    "name": "Admin User",
    "role": "admin",
    "createdAt": "2024-06-01T10:00:00Z"
  },
  {
    "id": "user-uuid-2",
    "email": "instructor@example.com",
    "name": "Instructor User",
    "role": "instructor",
    "createdAt": "2024-06-02T10:00:00Z"
  }
]
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

**Response 403 (Forbidden)**:
```json
{
  "error": "Insufficient permissions",
  "statusCode": 403
}
```

---

### POST /users

Create a new user.

**Authentication Required**: Yes

**Role Requirements**: Admin only

**Request Body**:
```json
{
  "email": "newuser@example.com",
  "password": "Password123!",
  "name": "New User",
  "role": "student"
}
```

**Role Options**: `admin`, `instructor`, `student`

**Response 201 (Created)**:
```json
{
  "id": "user-uuid-3",
  "email": "newuser@example.com",
  "name": "New User",
  "role": "student",
  "createdAt": "2024-06-03T10:00:00Z"
}
```

**Response 400 (Validation Error)**:
```json
{
  "error": "Email is already in use",
  "statusCode": 400
}
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

**Response 403 (Forbidden)**:
```json
{
  "error": "Insufficient permissions",
  "statusCode": 403
}
```

---

### GET /users/:id

Get a specific user's details.

**Authentication Required**: Yes

**Notes**: Users can only view their own profile unless they are an admin.

**Response 200 (Success)**:
```json
{
  "id": "user-uuid-1",
  "email": "user@example.com",
  "name": "User Name",
  "role": "student",
  "createdAt": "2024-06-01T10:00:00Z"
}
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

**Response 403 (Forbidden)**:
```json
{
  "error": "Forbidden",
  "statusCode": 403
}
```

**Response 404 (Not Found)**:
```json
{
  "error": "User not found",
  "statusCode": 404
}
```

---

### PUT /users/:id

Update a user's information.

**Authentication Required**: Yes

**Notes**: Users can only update their own profile unless they are an admin. Only `name` and `email` can be updated.

**Request Body**:
```json
{
  "name": "Updated Name",
  "email": "newemail@example.com"
}
```

**Response 200 (Success)**:
```json
{
  "id": "user-uuid-1",
  "email": "newemail@example.com",
  "name": "Updated Name",
  "role": "student",
  "createdAt": "2024-06-01T10:00:00Z"
}
```

**Response 400 (Validation Error)**:
```json
{
  "error": "Email is already in use",
  "statusCode": 400
}
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

**Response 403 (Forbidden)**:
```json
{
  "error": "Forbidden",
  "statusCode": 403
}
```

**Response 404 (Not Found)**:
```json
{
  "error": "User not found",
  "statusCode": 404
}
```

---

### DELETE /users/:id

Delete a user from the system.

**Authentication Required**: Yes

**Role Requirements**: Admin only

**Response 200 (Success)**:
```json
{
  "message": "User deleted successfully"
}
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

**Response 403 (Forbidden)**:
```json
{
  "error": "Insufficient permissions",
  "statusCode": 403
}
```

**Response 404 (Not Found)**:
```json
{
  "error": "User not found",
  "statusCode": 404
}
```

---

## Class Management Endpoints

### GET /classes

List all classes.

**Authentication Required**: Yes

**Response 200 (Success)**:
```json
[
  {
    "id": "class-uuid-1",
    "name": "Math 101",
    "description": "Introduction to Mathematics",
    "instructorId": "user-uuid-1",
    "createdAt": "2024-06-01T10:00:00Z"
  }
]
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

---

### POST /classes

Create a new class.

**Authentication Required**: Yes

**Role Requirements**: Admin or Instructor

**Notes**: The current authenticated user is set as the instructor.

**Request Body**:
```json
{
  "name": "Math 101",
  "description": "Introduction to Mathematics"
}
```

**Response 201 (Created)**:
```json
{
  "id": "class-uuid-2",
  "name": "Math 101",
  "description": "Introduction to Mathematics",
  "instructorId": "user-uuid-1",
  "createdAt": "2024-06-03T10:00:00Z"
}
```

**Response 400 (Validation Error)**:
```json
{
  "error": "Class name is required",
  "statusCode": 400
}
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

**Response 403 (Forbidden)**:
```json
{
  "error": "Insufficient permissions",
  "statusCode": 403
}
```

---

### GET /classes/:id

Get a specific class's details.

**Authentication Required**: Yes

**Response 200 (Success)**:
```json
{
  "id": "class-uuid-1",
  "name": "Math 101",
  "description": "Introduction to Mathematics",
  "instructorId": "user-uuid-1",
  "createdAt": "2024-06-01T10:00:00Z"
}
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

**Response 404 (Not Found)**:
```json
{
  "error": "Class not found",
  "statusCode": 404
}
```

---

### PUT /classes/:id

Update a class's information.

**Authentication Required**: Yes

**Role Requirements**: Admin or Instructor (owner only)

**Notes**: Only the class instructor or an admin can update the class.

**Request Body**:
```json
{
  "name": "Advanced Math 101",
  "description": "Advanced Introduction to Mathematics"
}
```

**Response 200 (Success)**:
```json
{
  "id": "class-uuid-1",
  "name": "Advanced Math 101",
  "description": "Advanced Introduction to Mathematics",
  "instructorId": "user-uuid-1",
  "createdAt": "2024-06-01T10:00:00Z"
}
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

**Response 403 (Forbidden)**:
```json
{
  "error": "Insufficient permissions",
  "statusCode": 403
}
```

**Response 404 (Not Found)**:
```json
{
  "error": "Class not found",
  "statusCode": 404
}
```

---

### DELETE /classes/:id

Delete a class.

**Authentication Required**: Yes

**Role Requirements**: Admin or Instructor (owner only)

**Notes**: Only the class instructor or an admin can delete the class.

**Response 204 (No Content)**:
```
(empty response body)
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

**Response 403 (Forbidden)**:
```json
{
  "error": "Insufficient permissions",
  "statusCode": 403
}
```

**Response 404 (Not Found)**:
```json
{
  "error": "Class not found",
  "statusCode": 404
}
```

---

## Schedule Management Endpoints

### GET /schedules

List schedules with optional filtering.

**Authentication Required**: Yes

**Query Parameters**:
- `classId` - Filter by class ID
- `instructorId` - Filter by instructor ID

**Notes**: If no query parameters are provided, returns an empty list.

**Response 200 (Success)**:
```json
[
  {
    "id": "schedule-uuid-1",
    "classId": "class-uuid-1",
    "dayOfWeek": "Monday",
    "startTime": "09:00",
    "endTime": "10:30",
    "createdAt": "2024-06-01T10:00:00Z"
  }
]
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

---

### POST /schedules

Create a new schedule for a class.

**Authentication Required**: Yes

**Role Requirements**: Admin or Instructor

**Request Body**:
```json
{
  "classId": "class-uuid-1",
  "dayOfWeek": "Monday",
  "startTime": "09:00",
  "endTime": "10:30"
}
```

**Day of Week Options**: `Monday`, `Tuesday`, `Wednesday`, `Thursday`, `Friday`, `Saturday`, `Sunday`

**Time Format**: HH:MM (24-hour format)

**Response 201 (Created)**:
```json
{
  "id": "schedule-uuid-2",
  "classId": "class-uuid-1",
  "dayOfWeek": "Monday",
  "startTime": "09:00",
  "endTime": "10:30",
  "createdAt": "2024-06-03T10:00:00Z"
}
```

**Response 400 (Validation Error)**:
```json
{
  "error": "End time must be after start time",
  "statusCode": 400
}
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

**Response 403 (Forbidden)**:
```json
{
  "error": "Insufficient permissions",
  "statusCode": 403
}
```

**Response 404 (Not Found)**:
```json
{
  "error": "Class not found",
  "statusCode": 404
}
```

---

### GET /schedules/:id

Get a specific schedule's details.

**Authentication Required**: Yes

**Response 200 (Success)**:
```json
{
  "id": "schedule-uuid-1",
  "classId": "class-uuid-1",
  "dayOfWeek": "Monday",
  "startTime": "09:00",
  "endTime": "10:30",
  "createdAt": "2024-06-01T10:00:00Z"
}
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

**Response 404 (Not Found)**:
```json
{
  "error": "Schedule not found",
  "statusCode": 404
}
```

---

### PUT /schedules/:id

Update a schedule's information.

**Authentication Required**: Yes

**Role Requirements**: Admin or Instructor (owner only)

**Notes**: Only the class instructor or an admin can update the schedule.

**Request Body** (all fields optional):
```json
{
  "dayOfWeek": "Tuesday",
  "startTime": "10:00",
  "endTime": "11:30"
}
```

**Response 200 (Success)**:
```json
{
  "id": "schedule-uuid-1",
  "classId": "class-uuid-1",
  "dayOfWeek": "Tuesday",
  "startTime": "10:00",
  "endTime": "11:30",
  "createdAt": "2024-06-01T10:00:00Z"
}
```

**Response 400 (Validation Error)**:
```json
{
  "error": "Invalid day of week",
  "statusCode": 400
}
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

**Response 403 (Forbidden)**:
```json
{
  "error": "Insufficient permissions",
  "statusCode": 403
}
```

**Response 404 (Not Found)**:
```json
{
  "error": "Schedule not found",
  "statusCode": 404
}
```

---

### DELETE /schedules/:id

Delete a schedule.

**Authentication Required**: Yes

**Role Requirements**: Admin or Instructor (owner only)

**Notes**: Only the class instructor or an admin can delete the schedule.

**Response 204 (No Content)**:
```
(empty response body)
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

**Response 403 (Forbidden)**:
```json
{
  "error": "Insufficient permissions",
  "statusCode": 403
}
```

**Response 404 (Not Found)**:
```json
{
  "error": "Schedule not found",
  "statusCode": 404
}
```

---

## Enrollment Management Endpoints

### GET /enrollments

List enrollments with optional filtering.

**Authentication Required**: Yes

**Query Parameters**:
- `studentId` - Filter by student ID
- `classId` - Filter by class ID

**Authorization**:
- Students can only view their own enrollments
- Instructors can view enrollments in their classes
- Admins can view all enrollments
- Without filters, only admins can list all enrollments

**Response 200 (Success)**:
```json
[
  {
    "id": "enrollment-uuid-1",
    "studentId": "user-uuid-2",
    "classId": "class-uuid-1",
    "enrolledAt": "2024-06-01T10:00:00Z"
  }
]
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

**Response 403 (Forbidden)**:
```json
{
  "error": "Forbidden",
  "statusCode": 403
}
```

---

### POST /enrollments

Enroll a student in a class.

**Authentication Required**: Yes

**Role Requirements**: Admin or Student

**Notes**: Students can only enroll themselves. Admins can enroll any student.

**Request Body**:
```json
{
  "studentId": "user-uuid-2",
  "classId": "class-uuid-1"
}
```

**Response 201 (Created)**:
```json
{
  "id": "enrollment-uuid-2",
  "studentId": "user-uuid-2",
  "classId": "class-uuid-1",
  "enrolledAt": "2024-06-03T10:00:00Z"
}
```

**Response 400 (Validation Error)**:
```json
{
  "error": "Student ID is required",
  "statusCode": 400
}
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

**Response 403 (Forbidden)**:
```json
{
  "error": "Students can only enroll themselves",
  "statusCode": 403
}
```

**Response 409 (Conflict)**:
```json
{
  "error": "Student is already enrolled in this class",
  "statusCode": 409
}
```

---

### DELETE /enrollments/:id

Drop an enrollment (remove student from class).

**Authentication Required**: Yes

**Role Requirements**: Admin, Student, or Instructor

**Authorization**:
- Students can only drop their own enrollments
- Instructors can drop enrollments from their classes
- Admins can drop any enrollment

**Response 200 (Success)**:
```json
{
  "message": "Enrollment deleted successfully"
}
```

**Response 401 (Unauthorized)**:
```json
{
  "error": "Missing or invalid token",
  "statusCode": 401
}
```

**Response 403 (Forbidden)**:
```json
{
  "error": "Forbidden",
  "statusCode": 403
}
```

**Response 404 (Not Found)**:
```json
{
  "error": "Enrollment not found",
  "statusCode": 404
}
```

---

## Error Handling

All error responses follow a consistent format:

```json
{
  "error": "Error message describing what went wrong",
  "statusCode": 400
}
```

### Common Status Codes

- **200 OK**: Request successful
- **201 Created**: Resource created successfully
- **204 No Content**: Request successful, no content to return
- **400 Bad Request**: Validation error or missing required fields
- **401 Unauthorized**: Missing or invalid authentication token
- **403 Forbidden**: Authenticated but lacks required permissions
- **404 Not Found**: Resource not found
- **409 Conflict**: Resource already exists (e.g., duplicate enrollment)
- **500 Internal Server Error**: Unexpected server error

---

## Validation Rules

### Email
- Must be a valid email format
- Must be unique in the system

### Password
- Minimum 8 characters
- Must contain uppercase letter
- Must contain lowercase letter
- Must contain number
- Must contain special character (!@#$%^&*)

### User Roles
- `admin` - Full system access
- `instructor` - Can create and manage classes and schedules
- `student` - Can view classes and enroll in courses

### Day of Week (Schedules)
- Must be one of: `Monday`, `Tuesday`, `Wednesday`, `Thursday`, `Friday`, `Saturday`, `Sunday`

### Time Format (Schedules)
- Must be in HH:MM format (24-hour)
- End time must be after start time

---

## Rate Limiting

No rate limiting is currently implemented. Production deployments should consider adding rate limiting to prevent abuse.

---

## Pagination

Pagination is not currently implemented. All list endpoints return all results. Future versions may implement pagination with limit and offset parameters.

---

## Version

This documentation is for API version 1.0.0.

Last updated: June 2024
