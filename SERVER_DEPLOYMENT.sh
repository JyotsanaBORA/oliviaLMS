#!/bin/bash

###########################################
# SERVER-SPECIFIC DEPLOYMENT GUIDE
# For Ubuntu Server at olivialms.cloud
###########################################

cat << 'EOF'

╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   DEPLOYMENT GUIDE FOR YOUR UBUNTU SERVER                    ║
║   olivialms.cloud (100.24.13.0)                              ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

📋 YOUR SERVER STRUCTURE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  • Application: ~/LEADSYSTEM
  • Build Output: ~/lms-build
  • Nginx Config: /etc/nginx/sites-available/lms
  • User: ubuntu
  • DNS: olivialms.cloud → 100.24.13.0 ✓

🚀 DEPLOYMENT STEPS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1: Update Your Code (on server)
───────────────────────────────────────────────────────────────
  cd ~/LEADSYSTEM
  git pull origin main

STEP 2: Install/Update Dependencies
───────────────────────────────────────────────────────────────
  # Backend
  cd ~/LEADSYSTEM/server
  npm install

  # Frontend
  cd ~/LEADSYSTEM/client
  npm install

STEP 3: Build Frontend
───────────────────────────────────────────────────────────────
  cd ~/LEADSYSTEM/client
  npm run build

STEP 4: Deploy Build
───────────────────────────────────────────────────────────────
  mkdir -p ~/lms-build
  cp -r ~/LEADSYSTEM/client/build/* ~/lms-build/

STEP 5: Update Nginx Configuration
───────────────────────────────────────────────────────────────
  sudo cp ~/LEADSYSTEM/nginx.conf /etc/nginx/sites-available/lms
  sudo nginx -t
  sudo systemctl reload nginx

STEP 6: Setup Environment (FIRST TIME ONLY)
───────────────────────────────────────────────────────────────
  cd ~/LEADSYSTEM/server
  cp .env.example .env
  nano .env
  
  # Update these values:
  JWT_SECRET=$(openssl rand -base64 32)
  MONGODB_URI=mongodb://localhost:27017/lms-system

STEP 7: Start/Restart Backend
───────────────────────────────────────────────────────────────
  cd ~/LEADSYSTEM
  
  # First time: Start with PM2
  pm2 start ecosystem.config.js
  pm2 save
  
  # Updates: Just restart
  pm2 restart lms-backend

STEP 8: Setup SSL (FIRST TIME ONLY - IMPORTANT!)
───────────────────────────────────────────────────────────────
  sudo certbot --nginx -d olivialms.cloud -d www.olivialms.cloud
  
  # After SSL is setup, enable HTTPS in nginx.conf:
  # 1. Uncomment the HTTPS server block
  # 2. Uncomment the redirect in HTTP server block
  # 3. Test and reload:
  sudo nginx -t
  sudo systemctl reload nginx

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚡ QUICK UPDATE (For Code Changes):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  cd ~/LEADSYSTEM
  ./update.sh

  OR manually:
  
  cd ~/LEADSYSTEM
  git pull
  cd client && npm install && npm run build
  mkdir -p ~/lms-build && cp -r build/* ~/lms-build/
  cd ../server && npm install
  pm2 restart lms-backend
  sudo systemctl reload nginx

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔧 INSTALL MISSING DEPENDENCIES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If you don't have these installed:

# MongoDB
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
   sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/mongodb-server-7.0.gpg
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
   sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# PM2
sudo npm install -g pm2
pm2 startup

# Certbot
sudo apt-get install -y certbot python3-certbot-nginx

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📁 DIRECTORY STRUCTURE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/home/ubuntu/
├── LEADSYSTEM/              # Your git repository
│   ├── client/
│   │   ├── build/          # React build output
│   │   └── src/
│   ├── server/
│   │   ├── .env            # Backend config (create this!)
│   │   └── server.js
│   ├── nginx.conf          # Nginx config file
│   ├── ecosystem.config.js # PM2 config
│   └── deploy.sh           # Deployment scripts
│
└── lms-build/              # Nginx serves from here
    ├── index.html
    ├── static/
    └── ...

/etc/nginx/
└── sites-available/
    └── lms                 # Nginx config (copy from nginx.conf)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ VERIFICATION CHECKLIST:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  □ DNS resolves: nslookup olivialms.cloud (should show 100.24.13.0)
  □ MongoDB running: sudo systemctl status mongod
  □ Backend running: pm2 status (should show lms-backend)
  □ Nginx running: sudo systemctl status nginx
  □ Backend health: curl http://localhost:5000/api/health
  □ Frontend accessible: curl http://olivialms.cloud
  □ SSL working (after certbot): https://olivialms.cloud

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🛠️ USEFUL COMMANDS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  # Check all services
  ./status.sh

  # View logs
  pm2 logs lms-backend
  sudo tail -f /var/log/nginx/error.log
  sudo journalctl -u mongod -f

  # Restart services
  pm2 restart lms-backend
  sudo systemctl restart nginx
  sudo systemctl restart mongod

  # Nginx
  sudo nginx -t                # Test config
  sudo systemctl reload nginx  # Reload

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ IMPORTANT NOTES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. SSL Setup: Run certbot AFTER the HTTP site is working
2. Environment: Create server/.env with strong JWT_SECRET
3. Permissions: ~/lms-build must be readable by nginx (www-data)
4. PM2: Save PM2 process list: pm2 save
5. Firewall: Ensure ports 80, 443 are open

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 QUICK START (If everything is ready):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cd ~/LEADSYSTEM
git pull
chmod +x update.sh status.sh
./update.sh

Then visit: http://olivialms.cloud

After SSL: https://olivialms.cloud

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
