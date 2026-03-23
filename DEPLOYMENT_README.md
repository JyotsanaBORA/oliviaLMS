# LMS System - Deployment Files

This directory contains all the necessary configuration files for deploying the Lead Management System to olivialms.cloud.

## Files Overview

### Main Deployment Files

1. **deploy.sh** - Complete automated deployment script
   - Installs all dependencies (Node.js, MongoDB, Nginx, PM2)
   - Sets up SSL with Let's Encrypt
   - Configures and deploys the application
   - Run with: `sudo ./deploy.sh`

2. **update.sh** - Quick update script for code changes
   - Pulls latest code from GitHub
   - Rebuilds and redeploys
   - Faster than full deployment
   - Run with: `./update.sh`

3. **status.sh** - System status checker
   - Checks all services (PM2, Nginx, MongoDB)
   - Performs health checks
   - Shows resource usage
   - Run with: `./status.sh`

### Configuration Files

4. **nginx.conf** - Nginx reverse proxy configuration
   - Handles SSL/HTTPS
   - Proxies API requests to backend
   - Serves static frontend files
   - WebSocket support for Socket.IO

5. **ecosystem.config.js** - PM2 process manager configuration
   - Cluster mode for high availability
   - Auto-restart on crashes
   - Log management
   - Memory limits

6. **server/.env.example** - Backend environment template
   - MongoDB connection string
   - JWT configuration
   - CORS settings
   - Copy to `.env` and customize

7. **client/.env.production** - Frontend environment for production
   - API URL configuration
   - Socket.IO URL
   - Already configured for olivialms.cloud

## Quick Start

### First-Time Deployment

```bash
# On your local machine
git clone https://github.com/lmslead/LEADSYSTEM.git
cd LEADSYSTEM

# Commit all configuration files
git add .
git commit -m "Add deployment configuration"
git push origin main

# On your server (100.24.13.0)
ssh root@100.24.13.0
cd /tmp
git clone https://github.com/lmslead/LEADSYSTEM.git
cd LEADSYSTEM
chmod +x deploy.sh update.sh status.sh
sudo ./deploy.sh
```

### Updating Application

```bash
# On your local machine - make changes and push
git add .
git commit -m "Your changes"
git push origin main

# On server - pull and update
ssh root@100.24.13.0
cd /var/www/olivialms.cloud
./update.sh
```

### Check System Status

```bash
ssh root@100.24.13.0
cd /var/www/olivialms.cloud
./status.sh
```

## File Permissions

After cloning on the server, make scripts executable:
```bash
chmod +x deploy.sh update.sh status.sh
```

## Environment Variables

### Required Server Environment Variables (server/.env)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens (change from default!)
- `CORS_ORIGIN` - Allowed CORS origin (already set to https://olivialms.cloud)

### Frontend Environment Variables (client/.env.production)
- `REACT_APP_API_URL` - Backend API URL (already set)
- `REACT_APP_SOCKET_URL` - WebSocket URL (already set)

## Deployment Workflow

1. **Develop locally** - Make changes on your development machine
2. **Test locally** - Run `npm run dev` to test
3. **Commit & Push** - Push changes to GitHub
4. **Update server** - Run `./update.sh` on server
5. **Verify** - Run `./status.sh` to check everything is working

## Important Notes

- The deployment script (`deploy.sh`) should only be run once for initial setup
- Use `update.sh` for subsequent updates (much faster)
- Always ensure MongoDB is running before deploying
- SSL certificates auto-renew via certbot
- PM2 will auto-restart the app if it crashes
- Logs are stored in `/var/log/pm2/` and `/var/log/nginx/`

## Troubleshooting

If something goes wrong:

```bash
# Check PM2 logs
pm2 logs lms-backend

# Check Nginx logs
sudo tail -f /var/log/nginx/olivialms.cloud.error.log

# Check MongoDB
sudo systemctl status mongod

# Restart everything
pm2 restart lms-backend
sudo systemctl restart nginx
sudo systemctl restart mongod
```

## Security Checklist

Before going live:
- [ ] Change JWT_SECRET in server/.env
- [ ] Configure MongoDB authentication
- [ ] Review and adjust rate limits
- [ ] Setup automated backups
- [ ] Configure SSL certificate auto-renewal
- [ ] Review Nginx security headers
- [ ] Setup monitoring and alerts

## Support

For detailed deployment instructions, see `DEPLOYMENT.md`
