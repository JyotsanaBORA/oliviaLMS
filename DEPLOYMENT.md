# LMS System Deployment Guide for olivialms.cloud

## Overview
This guide covers the deployment of the Lead Management System on olivialms.cloud using Ubuntu Server, Nginx, PM2, and MongoDB.

## Prerequisites
- Ubuntu Server (20.04 LTS or higher)
- Domain name: olivialms.cloud pointing to server IP: 100.24.13.0
- SSH access to the server
- Root or sudo privileges

## Quick Deployment

### 1. Initial Server Setup

SSH into your server:
```bash
ssh root@100.24.13.0
```

### 2. Clone Repository

```bash
cd /tmp
git clone https://github.com/lmslead/LEADSYSTEM.git
cd LEADSYSTEM
```

### 3. Run Deployment Script

```bash
chmod +x deploy.sh
sudo ./deploy.sh
```

The script will automatically:
- Install Node.js, MongoDB, Nginx, PM2, and Certbot
- Setup SSL certificate with Let's Encrypt
- Clone/update the repository
- Install dependencies
- Build the React frontend
- Configure Nginx
- Deploy the application with PM2
- Setup firewall rules

## Manual Deployment Steps

If you prefer to deploy manually or need to troubleshoot:

### 1. Install Dependencies

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install MongoDB 7.0
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
   sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/mongodb-server-7.0.gpg
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" | \
   sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# Install Nginx
sudo apt-get install -y nginx

# Install Certbot for SSL
sudo apt-get install -y certbot python3-certbot-nginx

# Install PM2
sudo npm install -g pm2

# Setup PM2 startup
pm2 startup systemd
```

### 2. Setup Application

```bash
# Create app directory
sudo mkdir -p /var/www/olivialms.cloud
cd /var/www/olivialms.cloud

# Clone repository
sudo git clone https://github.com/lmslead/LEADSYSTEM.git .

# Create environment files
sudo cp server/.env.example server/.env
sudo cp client/.env.example client/.env.production

# Edit environment files
sudo nano server/.env
# Update MONGODB_URI, JWT_SECRET, and other settings

# Install dependencies
cd server && npm install --production
cd ../client && npm install

# Build frontend
npm run build
```

### 3. Configure Nginx

```bash
# Copy nginx configuration
sudo cp /var/www/olivialms.cloud/nginx.conf /etc/nginx/sites-available/olivialms.cloud

# Create symlink
sudo ln -s /etc/nginx/sites-available/olivialms.cloud /etc/nginx/sites-enabled/

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Create web root
sudo mkdir -p /var/www/olivialms.cloud

# Copy built files
sudo cp -r /var/www/olivialms.cloud/client/build/* /var/www/olivialms.cloud/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### 4. Setup SSL Certificate

```bash
sudo certbot --nginx -d olivialms.cloud -d www.olivialms.cloud
```

### 5. Deploy with PM2

```bash
cd /var/www/olivialms.cloud

# Start application
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp /home/$USER
```

### 6. Configure Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Post-Deployment

### Verify Deployment

1. Check backend health:
```bash
curl http://localhost:5000/api/health
```

2. Check PM2 status:
```bash
pm2 status
pm2 logs lms-backend
```

3. Check Nginx:
```bash
sudo systemctl status nginx
```

4. Check MongoDB:
```bash
sudo systemctl status mongod
```

5. Access your application:
```
https://olivialms.cloud
```

## Environment Variables

### Server (.env)
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://localhost:27017/lms-system
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRE=7d
CORS_ORIGIN=https://olivialms.cloud
```

### Client (.env.production)
```env
REACT_APP_API_URL=https://olivialms.cloud
REACT_APP_SOCKET_URL=https://olivialms.cloud
```

## Useful Commands

### PM2 Commands
```bash
pm2 status                    # Check status
pm2 logs lms-backend          # View logs
pm2 restart lms-backend       # Restart app
pm2 stop lms-backend          # Stop app
pm2 delete lms-backend        # Delete app
pm2 monit                     # Monitor resources
```

### Nginx Commands
```bash
sudo systemctl status nginx   # Check status
sudo systemctl restart nginx  # Restart
sudo systemctl reload nginx   # Reload config
sudo nginx -t                 # Test configuration
tail -f /var/log/nginx/olivialms.cloud.access.log
tail -f /var/log/nginx/olivialms.cloud.error.log
```

### MongoDB Commands
```bash
sudo systemctl status mongod  # Check status
sudo systemctl start mongod   # Start
sudo systemctl stop mongod    # Stop
mongosh                       # Connect to MongoDB shell
```

### Git Commands
```bash
git pull origin main          # Update code
git status                    # Check status
git log --oneline -5          # View recent commits
```

## Updating the Application

### Quick Update
```bash
cd /var/www/olivialms.cloud
sudo ./deploy.sh
```

### Manual Update
```bash
cd /var/www/olivialms.cloud

# Pull latest changes
git pull origin main

# Install any new dependencies
cd server && npm install --production
cd ../client && npm install

# Rebuild frontend
npm run build

# Copy to web root
sudo cp -r build/* /var/www/olivialms.cloud/

# Restart backend
pm2 restart lms-backend

# Reload Nginx
sudo systemctl reload nginx
```

## Troubleshooting

### Application not starting
```bash
# Check PM2 logs
pm2 logs lms-backend --lines 100

# Check MongoDB
sudo systemctl status mongod
mongosh  # Test connection

# Check environment file
cat /var/www/olivialms.cloud/server/.env
```

### 502 Bad Gateway
```bash
# Check if backend is running
pm2 status
curl http://localhost:5000/api/health

# Check Nginx error logs
sudo tail -f /var/log/nginx/olivialms.cloud.error.log

# Restart services
pm2 restart lms-backend
sudo systemctl restart nginx
```

### SSL Certificate Issues
```bash
# Renew certificate
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run

# Check certificate status
sudo certbot certificates
```

### WebSocket Connection Issues
```bash
# Check Nginx configuration for WebSocket support
sudo nginx -t

# Verify socket.io endpoint
curl -I https://olivialms.cloud/socket.io/

# Check PM2 logs for socket errors
pm2 logs lms-backend | grep socket
```

## Monitoring

### Setup Monitoring
```bash
# Install PM2 monitoring
pm2 install pm2-logrotate

# Configure log rotation
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### Check Resources
```bash
# CPU and Memory
htop

# Disk usage
df -h

# PM2 monitoring
pm2 monit
```

## Backup

### Database Backup
```bash
# Create backup directory
sudo mkdir -p /var/backups/mongodb

# Backup MongoDB
sudo mongodump --out /var/backups/mongodb/$(date +%Y%m%d)

# Restore from backup
sudo mongorestore /var/backups/mongodb/20250107
```

### Application Backup
```bash
# Backup application files
sudo tar -czf /var/backups/lms-app-$(date +%Y%m%d).tar.gz /var/www/olivialms.cloud
```

## Security Checklist

- [x] SSL certificate installed
- [x] Firewall configured
- [x] MongoDB secured (localhost only)
- [x] Environment variables set
- [x] JWT secret changed from default
- [x] Rate limiting enabled
- [x] Security headers configured
- [x] PM2 running as non-root user (recommended)

## Support

For issues or questions:
- Check application logs: `pm2 logs lms-backend`
- Check Nginx logs: `/var/log/nginx/olivialms.cloud.error.log`
- Check MongoDB logs: `/var/log/mongodb/mongod.log`

## License
MIT
