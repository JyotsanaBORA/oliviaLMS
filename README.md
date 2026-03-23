# Lead Management System (LMS)

A comprehensive lead management system with real-time updates, role-based access control, and advanced analytics.

🌐 **Live at:** https://olivialms.cloud

## Features

- 🔐 **Role-Based Access Control** - Super Admin, Admin, Agent1, Agent2
- 📊 **Real-time Dashboard** - Live updates with Socket.IO
- 📈 **Analytics & Reports** - Comprehensive lead tracking and metrics
- 🔄 **Lead Assignment** - Automatic and manual lead distribution
- 📱 **Responsive Design** - Works on all devices
- 🔒 **Secure** - JWT authentication, rate limiting, data sanitization
- 📁 **CSV Import/Export** - Bulk lead management
- 🌍 **Multi-Organization** - Support for multiple organizations

## Tech Stack

### Frontend
- React 18
- React Router v6
- Tailwind CSS
- Socket.IO Client
- Axios
- React Hot Toast
- Recharts (Analytics)

### Backend
- Node.js with Express.js
- MongoDB with Mongoose
- Socket.IO for real-time communication
- JWT for authentication
- bcryptjs for password hashing
- Express Rate Limiting, Helmet, CORS for security

## Setup Instructions

### Quick Start (Recommended)

```bash
# Option 1: Use setup script
setup.bat

# Option 2: Use development start script
start-dev.bat

# Option 3: Use npm script
npm run dev
```

### Manual Setup

#### 1. Install Dependencies

```bash
# Install all dependencies
npm run install-all

# Or install individually:
cd server && npm install
cd ../client && npm install
```

#### 2. Environment Configuration

**Server (.env)**:
```
MONGODB_URI=mongodb+srv://rglms10:RGLMS123@lmsdatabase.jo25hav.mongodb.net/LMSdata
JWT_SECRET=LMSSECRETKEY
PORT=5000
NODE_ENV=development
```

**Client (.env)**:
```
REACT_APP_API_URL=http://localhost:5000
```

#### 3. Database Setup

```bash
# Seed database with admin users
cd server
npm run seed
```

#### 4. Start Development Servers

```bash
# Start both frontend and backend
npm run dev

# Or start individually:
npm run server  # Backend only
npm run client  # Frontend only
```

## Development URLs

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000/api
- **API Documentation**: See API_DOCS.md

## Default Login Credentials

**SuperAdmin:**
- Email: vishal@lms.com
- Password: @dm!n123

**SuperAdmin 2:**
- Email: jitin@lms.com  
- Password: @dm!n123
JWT_SECRET=your_jwt_secret_key
PORT=5000
NODE_ENV=development
```

### 3. Initialize Database

Run the superadmin seed to create initial superadmin accounts:

```bash
# From the server directory
node seeds/newSuperAdminSeed.js
```

This will create two superadmin accounts:
- vishal@lms.com (Password: @dm!n123)
- jitin@lms.com (Password: @dm!n123)

### 4. Start the Application

```bash
# Start backend server (from server directory)
npm run dev

# Start frontend (from client directory)  
npm start
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## User Roles

### Agent 1 (Lead Generator)
- Add new leads with contact information and budget
- Leads are automatically categorized based on data completeness:
  - **Hot** (Red): 80%+ fields completed
  - **Warm** (Yellow): 50-79% fields completed  
  - **Cold** (Blue): <50% fields completed

### Agent 2 (Lead Follower)
- View all leads in real-time
- Update lead status: Interested, Not Interested, Successful, Follow Up
- Schedule follow-up appointments with calendar integration

### Admin
- Real-time dashboard with metrics:
  - Total leads added
  - Total leads processed
  - Conversion rate
  - Success metrics
- Auto-refreshing dashboard (every 10 seconds)

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Leads
- `GET /api/leads` - Get all leads (with pagination)
- `POST /api/leads` - Create new lead (Agent 1)
- `PUT /api/leads/:id` - Update lead status (Agent 2)
- `GET /api/leads/stats` - Get dashboard statistics (Admin)

## Security Features

- JWT token-based authentication
- Password hashing with bcrypt
- Input validation and sanitization
- Rate limiting on API endpoints
- CORS protection
- Security headers with Helmet
- Protected routes based on user roles

## Deployment

### Backend (Heroku/Render)
1. Set environment variables in your hosting platform
2. Deploy the server directory
3. Ensure MongoDB Atlas whitelist includes your hosting IP

### Frontend (Vercel/Netlify)
1. Build the React application: `npm run build`
2. Deploy the build directory
3. Update API base URL for production

## Default SuperAdmin Credentials

Two superadmin accounts are available after running the seed:
- Email: vishal@lms.com, Password: @dm!n123
- Email: jitin@lms.com, Password: @dm!n123

Use these accounts to create organizations and manage the system.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License
