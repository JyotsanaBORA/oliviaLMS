#!/bin/bash

###########################################
# Quick Update Script for olivialms.cloud
# Use this for fast updates without full redeployment
###########################################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_DIR="$HOME/LEADSYSTEM"
PM2_APP_NAME="lms-backend"
BUILD_DIR="$HOME/lms-build"

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log "Starting quick update..."

# Navigate to app directory
cd $APP_DIR

# Stash any local changes
log "Stashing local changes..."
git stash

# Pull latest changes
log "Pulling latest changes from GitHub..."
git pull origin main

# Install/update backend dependencies
log "Updating backend dependencies..."
cd server
npm install --production

# Install/update frontend dependencies
log "Updating frontend dependencies..."
cd ../client
npm install

# Build frontend
log "Building frontend..."
npm run build

# Copy to web root
log "Copying build to web root..."
mkdir -p $BUILD_DIR
cp -r build/* $BUILD_DIR/

# Restart backend with PM2
log "Restarting backend..."
pm2 restart $PM2_APP_NAME

# Reload Nginx
log "Reloading Nginx..."
sudo systemctl reload nginx

# Wait for app to start
sleep 3

# Health check
log "Performing health check..."
if curl -f -s http://localhost:5000/api/health > /dev/null; then
    log "✓ Health check passed!"
else
    warning "Health check failed. Check logs with: pm2 logs $PM2_APP_NAME"
fi

log "Update complete!"
log "View logs with: pm2 logs $PM2_APP_NAME"
