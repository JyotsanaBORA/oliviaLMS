# Step-by-Step Deployment for Your Server

## Current Server Status
- ✅ Server: Ubuntu 22.04.5 LTS
- ✅ IP: 100.24.13.0
- ✅ DNS: olivialms.cloud → 100.24.13.0
- ✅ Repository: ~/LEADSYSTEM
- ✅ Nginx: Installed and running
- ✅ User: ubuntu

## What Needs to Be Done

### 1. Pull Latest Code
```bash
cd ~/LEADSYSTEM
git pull origin main
```

### 2. Install Missing Dependencies (if needed)

Check if MongoDB is installed:
```bash
systemctl status mongod
```

If NOT installed:
```bash
# Install MongoDB 7.0
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
   sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/mongodb-server-7.0.gpg

echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
   sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

Check if PM2 is installed:
```bash
pm2 --version
```

If NOT installed:
```bash
sudo npm install -g pm2
pm2 startup
# Follow the instructions it gives you
```

Install Certbot:
```bash
sudo apt-get install -y certbot python3-certbot-nginx
```

### 3. Setup Application

```bash
cd ~/LEADSYSTEM

# Install server dependencies
cd server
npm install

# Create environment file
cp .env.example .env
nano .env
```

**Edit .env file** - Update these values:
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://localhost:27017/lms-system
JWT_SECRET=<generate with: openssl rand -base64 32>
JWT_EXPIRE=7d
CORS_ORIGIN=https://olivialms.cloud
```

Save and exit (Ctrl+X, Y, Enter)

```bash
# Install client dependencies
cd ~/LEADSYSTEM/client
npm install

# Build frontend
npm run build

# Create build directory and copy files
mkdir -p ~/lms-build
cp -r build/* ~/lms-build/
```

### 4. Update Nginx Configuration

```bash
# Copy the new nginx config
sudo cp ~/LEADSYSTEM/nginx.conf /etc/nginx/sites-available/lms

# Test configuration
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx
```

### 5. Start Backend with PM2

```bash
cd ~/LEADSYSTEM

# Start the application
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Check status
pm2 status
```

### 6. Verify Everything Works

```bash
# Check backend
curl http://localhost:5000/api/health

# Check frontend
curl http://olivialms.cloud

# Check all services
chmod +x status.sh
./status.sh
```

### 7. Setup SSL Certificate (IMPORTANT!)

**First, make sure HTTP works:** Visit http://olivialms.cloud in your browser

Then setup SSL:
```bash
sudo certbot --nginx -d olivialms.cloud -d www.olivialms.cloud
```

Follow the prompts:
- Enter your email
- Agree to terms
- Choose whether to redirect HTTP to HTTPS (recommended: Yes)

**After SSL is configured:**

The nginx.conf file has a commented HTTPS section. You have two options:

**Option A: Let Certbot handle it (RECOMMENDED)**
- Certbot will automatically update your nginx config
- Just verify it works

**Option B: Manual configuration**
```bash
# Edit nginx config
sudo nano /etc/nginx/sites-available/lms

# Uncomment the HTTPS server block (lines starting with #)
# Uncomment the redirect line in HTTP block

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### 8. Final Verification

```bash
# Test HTTPS
curl https://olivialms.cloud

# Open in browser
# Visit: https://olivialms.cloud
```

## For Future Updates

Just run:
```bash
cd ~/LEADSYSTEM
chmod +x update.sh
./update.sh
```

Or manually:
```bash
cd ~/LEADSYSTEM
git pull origin main
cd server && npm install
cd ../client && npm install && npm run build
cp -r build/* ~/lms-build/
pm2 restart lms-backend
sudo systemctl reload nginx
```

## Troubleshooting

### Backend won't start
```bash
# Check logs
pm2 logs lms-backend

# Common issues:
# - MongoDB not running: sudo systemctl start mongod
# - .env file missing: cp server/.env.example server/.env
# - Port in use: pm2 delete all, then pm2 start ecosystem.config.js
```

### Frontend shows errors
```bash
# Check nginx logs
sudo tail -f /var/log/nginx/error.log

# Rebuild frontend
cd ~/LEADSYSTEM/client
npm run build
cp -r build/* ~/lms-build/
```

### Can't access website
```bash
# Check nginx status
sudo systemctl status nginx

# Check if port 80/443 are open
sudo ufw status

# Allow ports if needed
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

## Important Commands

```bash
# PM2
pm2 status                    # Check status
pm2 logs lms-backend          # View logs
pm2 restart lms-backend       # Restart
pm2 stop lms-backend          # Stop
pm2 delete lms-backend        # Remove

# Nginx
sudo nginx -t                 # Test config
sudo systemctl status nginx   # Check status
sudo systemctl restart nginx  # Restart
sudo systemctl reload nginx   # Reload config

# MongoDB
sudo systemctl status mongod  # Check status
sudo systemctl start mongod   # Start
sudo systemctl restart mongod # Restart
mongosh                       # Connect to shell

# Logs
pm2 logs lms-backend --lines 100
sudo tail -f /var/log/nginx/error.log
sudo journalctl -u mongod -f
```

## Files and Directories

```
/home/ubuntu/
├── LEADSYSTEM/              # Git repository
│   ├── client/
│   │   └── build/          # Built files (don't serve from here)
│   ├── server/
│   │   ├── .env            # Backend config (YOU CREATE THIS)
│   │   └── server.js
│   ├── nginx.conf          # Source nginx config
│   └── ecosystem.config.js # PM2 config
│
└── lms-build/              # Nginx serves from HERE
    └── (React build files)

/etc/nginx/sites-available/
└── lms                     # Nginx config (copied from nginx.conf)
```

## Security Checklist

- [ ] JWT_SECRET is strong and unique (not the example one!)
- [ ] SSL certificate installed
- [ ] Firewall configured (ports 22, 80, 443)
- [ ] MongoDB only accessible locally
- [ ] .env file is NOT committed to git
- [ ] PM2 logs are being rotated

## Next Steps

1. Commit and push your local changes
2. SSH to server: `ssh ubuntu@100.24.13.0`
3. Follow steps above
4. Access your app: https://olivialms.cloud

Good luck! 🚀
