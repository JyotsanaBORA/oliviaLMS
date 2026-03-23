# Deployment Checklist for olivialms.cloud

## Pre-Deployment (On Your Local Machine)

- [ ] All code changes committed to GitHub
- [ ] Environment files configured (.env.example files ready)
- [ ] All deployment scripts are executable permissions will be set on server
- [ ] Domain DNS pointing to server IP (100.24.13.0)
  - A record: olivialms.cloud → 100.24.13.0
  - A record: www.olivialms.cloud → 100.24.13.0

## Server Access

- [ ] SSH access to server: `ssh root@100.24.13.0`
- [ ] Server is Ubuntu (20.04+ recommended)
- [ ] Root or sudo access available

## Deployment Steps

### 1. Initial Setup (First Time Only)

```bash
# SSH to server
ssh root@100.24.13.0

# Update system
apt-get update && apt-get upgrade -y

# Clone repository
git clone https://github.com/lmslead/LEADSYSTEM.git /var/www/olivialms.cloud
cd /var/www/olivialms.cloud

# Make scripts executable
chmod +x deploy.sh update.sh status.sh

# Run deployment
./deploy.sh
```

- [ ] All dependencies installed (Node.js, MongoDB, Nginx, PM2, Certbot)
- [ ] Repository cloned to `/var/www/olivialms.cloud`
- [ ] Deployment script executed successfully

### 2. Environment Configuration

- [ ] Server .env file created and configured:
  ```bash
  cd /var/www/olivialms.cloud/server
  nano .env
  ```
  
  Required variables:
  - [ ] `MONGODB_URI` - Set to correct MongoDB connection string
  - [ ] `JWT_SECRET` - Changed from default (use: `openssl rand -base64 32`)
  - [ ] `NODE_ENV=production`
  - [ ] `PORT=5000`
  - [ ] `CORS_ORIGIN=https://olivialms.cloud`

- [ ] Client environment configured (already in .env.production)

### 3. SSL Certificate

- [ ] SSL certificate obtained for olivialms.cloud and www.olivialms.cloud
- [ ] Certificate auto-renewal configured (certbot)
- [ ] Test certificate: `sudo certbot certificates`

### 4. Services Running

- [ ] MongoDB running: `sudo systemctl status mongod`
- [ ] Nginx running: `sudo systemctl status nginx`
- [ ] PM2 application running: `pm2 status`
- [ ] PM2 startup configured: `pm2 startup` and `pm2 save`

### 5. Nginx Configuration

- [ ] Nginx config file in `/etc/nginx/sites-available/olivialms.cloud`
- [ ] Symlink created in `/etc/nginx/sites-enabled/`
- [ ] Default site removed from sites-enabled
- [ ] Nginx configuration tested: `sudo nginx -t`
- [ ] Nginx reloaded: `sudo systemctl reload nginx`

### 6. Firewall

- [ ] UFW enabled
- [ ] Port 22 (SSH) allowed
- [ ] Port 80 (HTTP) allowed
- [ ] Port 443 (HTTPS) allowed
- [ ] Firewall status checked: `sudo ufw status`

### 7. Application Verification

- [ ] Backend health check passes: `curl http://localhost:5000/api/health`
- [ ] Frontend accessible: `curl https://olivialms.cloud`
- [ ] Can login to application
- [ ] WebSocket connections working
- [ ] Real-time updates functioning

### 8. Database Setup

- [ ] MongoDB accessible locally
- [ ] Database created: `lms-system`
- [ ] Super admin account created (if needed)
- [ ] Database backup configured

### 9. Monitoring & Logs

- [ ] PM2 logs accessible: `pm2 logs lms-backend`
- [ ] Nginx access logs: `/var/log/nginx/olivialms.cloud.access.log`
- [ ] Nginx error logs: `/var/log/nginx/olivialms.cloud.error.log`
- [ ] MongoDB logs: `/var/log/mongodb/mongod.log`
- [ ] Log rotation configured

## Post-Deployment Verification

### Functional Tests

- [ ] Open https://olivialms.cloud in browser
- [ ] No SSL certificate warnings
- [ ] Login page loads correctly
- [ ] Can register/login as user
- [ ] Dashboard loads after login
- [ ] Can create a lead
- [ ] Real-time updates work (open in two browsers)
- [ ] CSV import works
- [ ] All user roles work correctly

### Performance Tests

- [ ] Page load time < 3 seconds
- [ ] API response time < 500ms
- [ ] No console errors in browser
- [ ] WebSocket connects successfully
- [ ] No memory leaks (check `pm2 monit`)

### Security Tests

- [ ] HTTPS working (no HTTP access except redirect)
- [ ] Security headers present (check browser DevTools)
- [ ] JWT tokens expire correctly
- [ ] Rate limiting working
- [ ] No sensitive data in logs
- [ ] MongoDB only accessible locally

## Maintenance Setup

### Automated Backups

- [ ] Database backup script created
- [ ] Backup cron job configured
  ```bash
  # Add to crontab
  0 2 * * * /usr/bin/mongodump --out /var/backups/mongodb/$(date +\%Y\%m\%d)
  ```
- [ ] Backup retention policy set

### Monitoring

- [ ] PM2 monitoring setup: `pm2 install pm2-logrotate`
- [ ] Log rotation configured
- [ ] Disk space monitoring
- [ ] Uptime monitoring (optional: UptimeRobot, etc.)

### Update Procedure

- [ ] Update script tested: `./update.sh`
- [ ] Git pull works correctly
- [ ] Zero-downtime deployment working

## Useful Commands Reference

### PM2
```bash
pm2 status                    # Check status
pm2 logs lms-backend          # View logs
pm2 restart lms-backend       # Restart
pm2 monit                     # Monitor resources
pm2 save                      # Save process list
```

### Nginx
```bash
sudo nginx -t                 # Test config
sudo systemctl reload nginx   # Reload
sudo systemctl status nginx   # Check status
```

### MongoDB
```bash
sudo systemctl status mongod  # Check status
mongosh                       # Connect to shell
```

### System
```bash
./status.sh                   # Check all services
./update.sh                   # Update application
df -h                         # Disk usage
free -h                       # Memory usage
htop                          # System monitor
```

## Troubleshooting Common Issues

### Application Won't Start
- [ ] Check PM2 logs: `pm2 logs lms-backend --lines 50`
- [ ] Check MongoDB running: `sudo systemctl status mongod`
- [ ] Check .env file exists and is correct
- [ ] Check Node.js version: `node --version` (should be 18.x)

### 502 Bad Gateway
- [ ] Backend running: `pm2 status`
- [ ] Port 5000 accessible: `curl http://localhost:5000/api/health`
- [ ] Check Nginx error logs
- [ ] Restart services: `pm2 restart lms-backend && sudo systemctl reload nginx`

### SSL Certificate Issues
- [ ] Check certificate: `sudo certbot certificates`
- [ ] Renew certificate: `sudo certbot renew`
- [ ] Check Nginx SSL config paths

### WebSocket Not Connecting
- [ ] Check Nginx config has WebSocket support
- [ ] Check browser console for errors
- [ ] Verify Socket.IO endpoint: `curl -I https://olivialms.cloud/socket.io/`

## Emergency Procedures

### Rollback to Previous Version
```bash
cd /var/www/olivialms.cloud
git log --oneline -10  # Find commit to rollback to
git reset --hard <commit-hash>
./update.sh
```

### Restart All Services
```bash
pm2 restart lms-backend
sudo systemctl restart nginx
sudo systemctl restart mongod
```

### Restore from Backup
```bash
# Restore MongoDB
sudo mongorestore /var/backups/mongodb/20250107

# Restore application
sudo tar -xzf /var/backups/lms-app-20250107.tar.gz -C /
```

## Success Criteria

✅ Application accessible at https://olivialms.cloud  
✅ No SSL warnings  
✅ All features working  
✅ Real-time updates functioning  
✅ Logs clean with no errors  
✅ Backups configured  
✅ Monitoring in place  
✅ Update procedure tested  

## Contact Information

- **Domain:** olivialms.cloud
- **Server IP:** 100.24.13.0
- **Repository:** https://github.com/lmslead/LEADSYSTEM
- **PM2 App Name:** lms-backend

---

**Deployment Date:** _____________  
**Deployed By:** _____________  
**Notes:** _____________
