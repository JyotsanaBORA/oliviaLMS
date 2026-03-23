#!/bin/bash

# Quick fix deployment for infinite loop issue
# This script deploys only the AdminDashboard fix without full rebuild

echo "================================================"
echo "Deploying AdminDashboard Infinite Loop Fix"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're on the server
if [ ! -d "/home/ubuntu" ]; then
    echo -e "${RED}Error: This script must be run on the server${NC}"
    exit 1
fi

# Navigate to project directory
cd ~/LEADSYSTEM || exit 1

echo -e "${YELLOW}Step 1: Pulling latest changes...${NC}"
git stash
git pull origin main
if [ $? -ne 0 ]; then
    echo -e "${RED}Git pull failed!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Latest changes pulled${NC}"
echo ""

echo -e "${YELLOW}Step 2: Installing client dependencies...${NC}"
cd client
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}npm install failed!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

echo -e "${YELLOW}Step 3: Building React app...${NC}"
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Build completed${NC}"
echo ""

echo -e "${YELLOW}Step 4: Deploying to production...${NC}"
# Backup current build
if [ -d ~/lms-build ]; then
    mv ~/lms-build ~/lms-build.backup.$(date +%Y%m%d_%H%M%S)
    echo -e "${GREEN}✓ Backed up current build${NC}"
fi

# Copy new build
cp -r build ~/lms-build
echo -e "${GREEN}✓ New build deployed to ~/lms-build${NC}"
echo ""

echo -e "${YELLOW}Step 5: Restarting backend...${NC}"
cd ~/LEADSYSTEM/server
pm2 restart lms-backend
sleep 3
echo -e "${GREEN}✓ Backend restarted${NC}"
echo ""

echo -e "${YELLOW}Step 6: Reloading Nginx...${NC}"
sudo nginx -t && sudo systemctl reload nginx
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Nginx reloaded${NC}"
else
    echo -e "${RED}Nginx configuration error!${NC}"
    exit 1
fi
echo ""

echo "================================================"
echo -e "${GREEN}Deployment Complete!${NC}"
echo "================================================"
echo ""
echo "Application Status:"
pm2 status lms-backend
echo ""
echo "Recent Backend Logs:"
pm2 logs lms-backend --lines 20 --nostream
echo ""
echo -e "${GREEN}✓ AdminDashboard infinite loop fix deployed${NC}"
echo -e "${YELLOW}Please test by:${NC}"
echo "  1. Opening https://olivialms.cloud"
echo "  2. Login as admin"
echo "  3. Click 'Show Leads'"
echo "  4. Check browser console - should show ONE fetch"
echo "  5. Monitor: pm2 logs lms-backend"
echo ""
