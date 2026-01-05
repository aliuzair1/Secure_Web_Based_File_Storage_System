# Secure Cloud-Based File Storage System

**One-line summary:** A Node.js/Express application that provides authenticated, role-aware file storage with PostgreSQL-backed user/session management and AWS S3 file storage, delivering secure uploads, downloads, quota enforcement, and admin reporting.

## Overview

**Purpose:** Provide a secure, production-oriented web service for storing and managing user files with authentication, session management, storage quotas, and administrative reporting.

**Real-world use case:** SaaS-style personal or team file storage where files are uploaded to AWS S3, access is governed by JWT-based authentication and database sessions, and administrators can monitor usage and users.

**Target users:** Backend engineers, technical reviewers, or hiring managers assessing the candidate's experience building REST APIs, cloud storage integrations, authentication, and relational database usage.

## Key Features

- JWT-based authentication with server-side session tracking and invalidation.
- Registered user flows: register, login, token verification, logout.
- Secure password hashing (bcrypt) and JWT token expiry.
- File upload to AWS S3 with multer-s3 and server-side validation (storage quota check).
- S3 pre-signed URLs for secure, time-limited downloads.
- File metadata stored in PostgreSQL (file records, types, sizes, timestamps).
- Storage quota enforcement and automatic cleanup on failures (S3 deletion on DB errors).
- Admin APIs providing dashboard metrics and paginated user listings with search.
- Activity logging (activity_logs) for key user actions (register/login/upload/download/delete).
- EJS-based simple front-end views for login, user dashboard, and admin dashboard.
- Middleware for authentication and role-based admin checks.
- Secure unique file naming using UUIDs and timestamp suffixes.

## Tech Stack

### Programming Languages

- JavaScript (Node.js)

### Frameworks & Libraries

- Express
- EJS (templating)
- multer, multer-s3 (file upload)
- bcrypt (password hashing)
- jsonwebtoken (JWT)
- uuid

### Databases

- PostgreSQL (pg client)

### Tools & Platforms

- npm (package management)
- nodemon (development)

### Cloud / DevOps

- AWS S3 (object storage)

## Project Architecture / Structure

- `server.js` — Application entrypoint, route mounting, view engine, static assets, global error handling.
- `pg.js` — PostgreSQL client initialization using environment variables.
- `routes/`
  - `auth.js` — Registration, login, verify token, logout endpoints; session creation and logging.
  - `files.js` — File listing, storage-info, upload (S3), download (pre-signed URL), delete, search endpoints and quota checks.
  - `admin.js` — Admin-only endpoints for system metrics and user listings with pagination and search.
- `middlewares/`
  - `auth.js` — JWT verification, session validation, user lookup; supports token in Authorization header or query string (for downloads).
- `views/` — EJS templates (login, user-dashboard, admin-dashboard) served by server.js.
- `public/` — Static assets (CSS/JS/images) served by server.js.
- `uploads/` — Local uploads directory referenced in code (mkdir created when needed; S3 is primary store).
- `package.json` / `package-lock.json` — Dependencies and scripts.

### Database objects referenced in code (required):

- users
- files
- file_types
- subscription_plans
- activity_logs
- user_sessions

**Note:** application comments indicate database triggers exist to automatically update storage_used when files are inserted/deleted.

## Installation & Setup

### Prerequisites

- Node.js (v16+ recommended)
- npm
- PostgreSQL database
- AWS account with S3 bucket and programmatic credentials

### Clone repository

```bash
git clone https://github.com/aliuzair1/Secure_Cloud_Based_File_Storage_System.git
cd Secure_Cloud_Based_File_Storage_System
```

### Install dependencies

```bash
npm install
```

### Create a .env file in project root with required environment variables:

```env
PORT=3000
DB_USER=your_db_user
DB_HOST=your_db_host
DB_NAME=your_db_name
DB_PORT=5432
DB_PASSWORD=your_db_password

# JWT secret for signing tokens
JWT_SECRET=your_jwt_secret

# AWS S3 configuration
AWS_REGION=your_aws_region
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET_NAME=your_bucket_name
```

### Prepare PostgreSQL schema

Create the tables referenced in the routes: users, files, file_types, subscription_plans, activity_logs, user_sessions.

Ensure any triggers required to maintain storage_used are in place (code expects triggers to auto-update user.storage_used on files insert/delete, as indicated in comments).

### Start the application

```bash
npm start
# or for development with auto-reload:
npx nodemon server.js
```

The server will run on PORT defined in .env.

## Usage

### Authentication

- **Register:** `POST /api/auth/register`
  - Body: `{ "fullname": "...", "email": "...", "password": "..." }`
- **Login:** `POST /api/auth/login`
  - Body: `{ "username": "<username|email>", "password": "..." }`
  - Returns: `{ token, user, redirect }`

### Token verification & logout

- **Verify:** `GET /api/auth/verify` (Authorization: Bearer <token>)
- **Logout:** `POST /api/auth/logout` (Authorization: Bearer <token>)

### File APIs (Authorization: Bearer <token>)

- **List files:** `GET /api/files`
- **Storage info:** `GET /api/files/storage-info`
- **Upload file (multipart):** `POST /api/files/upload`
  - Form field: `file` (multipart/form-data)
- **Download file:** `GET /api/files/download/:id`
  - Generates pre-signed S3 URL and redirects to it (token may be accepted via query param for direct links)
- **Delete file:** `DELETE /api/files/:id`
- **Search files:** `GET /api/files/search?q=search-term`

### Admin APIs (requires admin user; Authorization: Bearer <token>)

- **Dashboard stats:** `GET /api/admin/dashboard`
- **Users list & search:** `GET /api/admin/users?page=1&search=term`

### Example curl (login + list files):

```bash
# login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"password"}'

# use token returned as $TOKEN
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/files
```

### Upload example (multipart):

```bash
curl -X POST http://localhost:3000/api/files/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./path/to/file.pdf"
```

## Implementation Highlights

### Authentication & Session Management

Implemented JWT-based tokens combined with server-side session records (user_sessions) to allow server-controlled session invalidation and 24-hour expiration.

Token verification middleware supports tokens in header or query string for secure download links.

### Secure Storage & Robustness

Files stored on AWS S3 via multer-s3; pre-signed URLs generated using @aws-sdk/s3-request-presigner for secure, time-limited downloads.

Unique file naming using uuidv4 + timestamp to prevent collisions; original file names preserved in DB for user-friendly downloads.

Defensive error handling: database failures during upload trigger deletion of the S3 object to prevent orphaned storage and unexpected billing.

### Quota & Data Integrity

Server verifies user storage usage against subscription_plans.storage_limit before finalizing uploads.

Database triggers (not in codebase) are relied upon to automatically adjust user.storage_used on file insert/delete for atomic storage accounting.

### Observability & Admin Controls

Activity logging for register/login/upload/download/delete to activity_logs for auditability.

Admin endpoints aggregate system metrics (total users, total files, total storage, premium users) and provide paginated user lists with search.

### Design Choices & Patterns

Thin route controllers with SQL prepared statements (parameterized queries) to prevent SQL injection.

Separation of concerns: dedicated PostgreSQL client module, authentication middleware, route modules, and S3-specific upload logic.

Use of dotenv for configurable environment variables enabling 12-factor app deployment practices.

## Notes & Next Steps

Database schema/migrations are not included; reviewers should check and create the referenced tables and triggers before running the app.

Security recommendations: rotate AWS credentials, use IAM roles for production (EC2/ECS/Lambda), store JWT secrets and DB credentials in a secrets manager for production deployments.

The codebase is ready for containerization and CI/CD integration.
