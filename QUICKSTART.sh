#!/bin/bash

# Quick Start Guide Script
# This will display deployment instructions

cat << 'EOF'

╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║         LMS SYSTEM DEPLOYMENT TO OLIVIALMS.CLOUD              ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

📋 PREREQUISITES CHECKLIST:

  ✓ Server: Ubuntu 20.04+ at IP 100.24.13.0
  ✓ SSH access: ssh root@100.24.13.0
  ✓ DNS configured: olivialms.cloud → 100.24.13.0
  ✓ DNS configured: www.olivialms.cloud → 100.24.13.0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 DEPLOYMENT STEPS:

STEP 1: Commit and Push (ON YOUR LOCAL MACHINE)
───────────────────────────────────────────────────────────────
  git add .
  git commit -m "Configure deployment for olivialms.cloud"
  git push origin main

STEP 2: SSH to Server
───────────────────────────────────────────────────────────────
  ssh root@100.24.13.0

STEP 3: Clone Repository (ON SERVER)
───────────────────────────────────────────────────────────────
  git clone https://github.com/lmslead/LEADSYSTEM.git /var/www/olivialms.cloud
  cd /var/www/olivialms.cloud

STEP 4: Run Deployment
───────────────────────────────────────────────────────────────
  chmod +x deploy.sh update.sh status.sh
  sudo ./deploy.sh

  ⏱️  This will take 10-15 minutes on first run.

STEP 5: Configure Environment
───────────────────────────────────────────────────────────────
  cd /var/www/olivialms.cloud/server
  nano .env

  📝 Important: Update these values:
     - JWT_SECRET (generate: openssl rand -base64 32)
     - MONGODB_URI (if using external MongoDB)

  Then restart:
  pm2 restart lms-backend

STEP 6: Verify Deployment
───────────────────────────────────────────────────────────────
  ./status.sh

  Or manually check:
  - pm2 status
  - sudo systemctl status nginx
  - sudo systemctl status mongod

STEP 7: Access Application
───────────────────────────────────────────────────────────────
  🌐 Open: https://olivialms.cloud

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔄 UPDATING YOUR APPLICATION (After Initial Deployment):

  On your local machine:
  ─────────────────────────
  git add .
  git commit -m "Your changes"
  git push origin main

  On server:
  ─────────────────────────
  ssh root@100.24.13.0
  cd /var/www/olivialms.cloud
  ./update.sh

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📚 DOCUMENTATION FILES:

  • DEPLOYMENT_SUMMARY.md    → Overview of all deployment files
  • DEPLOYMENT.md            → Comprehensive deployment guide
  • DEPLOYMENT_CHECKLIST.md  → Step-by-step checklist
  • DEPLOYMENT_README.md     → Quick reference

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🛠️  USEFUL COMMANDS:

  Application:
    pm2 status                  # Check status
    pm2 logs lms-backend        # View logs
    pm2 restart lms-backend     # Restart app
    ./status.sh                 # Check all services

  Nginx:
    sudo systemctl reload nginx    # Reload config
    sudo nginx -t                  # Test config

  MongoDB:
    sudo systemctl status mongod   # Check status
    mongosh                        # Connect to DB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  IMPORTANT NOTES:

  1. MUST change JWT_SECRET in server/.env before production
  2. Ensure DNS is pointing to 100.24.13.0
  3. First deployment requires sudo/root access
  4. SSL certificate setup will ask for your email

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ SUCCESS CRITERIA:

  ✓ https://olivialms.cloud loads without SSL warnings
  ✓ Can login to application
  ✓ Real-time updates working
  ✓ pm2 status shows app running
  ✓ No errors in logs

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Need help? Read DEPLOYMENT.md for detailed instructions.

EOF
