#!/bin/bash

###########################################
# Server Status Check Script
###########################################

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  LMS System Status Check${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check PM2
echo -e "${YELLOW}PM2 Status:${NC}"
pm2 status

echo ""

# Check Nginx
echo -e "${YELLOW}Nginx Status:${NC}"
sudo systemctl status nginx --no-pager | head -n 10

echo ""

# Check MongoDB
echo -e "${YELLOW}MongoDB Status:${NC}"
sudo systemctl status mongod --no-pager | head -n 10

echo ""

# Check Backend Health
echo -e "${YELLOW}Backend Health Check:${NC}"
if curl -f -s http://localhost:5000/api/health > /dev/null; then
    echo -e "${GREEN}✓ Backend is healthy${NC}"
    curl -s http://localhost:5000/api/health | jq '.' 2>/dev/null || curl -s http://localhost:5000/api/health
else
    echo -e "${RED}✗ Backend health check failed${NC}"
fi

echo ""

# Check Frontend
echo -e "${YELLOW}Frontend Check:${NC}"
if curl -f -s https://olivialms.cloud > /dev/null; then
    echo -e "${GREEN}✓ Frontend is accessible${NC}"
else
    echo -e "${RED}✗ Frontend is not accessible${NC}"
fi

echo ""

# Disk Usage
echo -e "${YELLOW}Disk Usage:${NC}"
df -h / | grep -v Filesystem

echo ""

# Memory Usage
echo -e "${YELLOW}Memory Usage:${NC}"
free -h

echo ""

# Recent PM2 Logs
echo -e "${YELLOW}Recent PM2 Logs (last 10 lines):${NC}"
pm2 logs lms-backend --lines 10 --nostream

echo ""
echo -e "${BLUE}========================================${NC}"
