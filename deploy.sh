#!/bin/bash

###########################################
# Auto Deployment Script for olivialms.cloud
# This script handles the complete deployment process
###########################################

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="lms-system"
APP_DIR="$HOME/LEADSYSTEM"
REPO_URL="https://github.com/lmslead/LEADSYSTEM.git"
BRANCH="main"
DOMAIN="olivialms.cloud"
NGINX_CONF="/etc/nginx/sites-available/lms"
PM2_APP_NAME="lms-backend"
BUILD_DIR="$HOME/lms-build"

# Log function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if running as regular user (not root)
check_permissions() {
    if [ "$EUID" -eq 0 ]; then
        error "Please run as regular user (ubuntu), not root. Use sudo only for specific commands when needed."
    fi
}

# Install system dependencies (first-time setup)
install_dependencies() {
    log "Installing system dependencies..."
    
    # Update package list
    sudo apt-get update
    
    # Install Node.js 18.x (LTS)
    if ! command -v node &> /dev/null; then
        log "Installing Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    
    # Install MongoDB
    if ! command -v mongod &> /dev/null; then
        log "Installing MongoDB..."
        curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
            sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/mongodb-server-7.0.gpg
        echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" | \
            sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
        sudo apt-get update
        sudo apt-get install -y mongodb-org
        sudo systemctl start mongod
        sudo systemctl enable mongod
    fi
    
    # Install Nginx (already installed, but check)
    if ! command -v nginx &> /dev/null; then
        log "Installing Nginx..."
        sudo apt-get install -y nginx
    fi
    
    # Install Certbot for SSL
    if ! command -v certbot &> /dev/null; then
        log "Installing Certbot..."
        sudo apt-get install -y certbot python3-certbot-nginx
    fi
    
    # Install PM2 globally
    if ! command -v pm2 &> /dev/null; then
        log "Installing PM2..."
        sudo npm install -g pm2
        pm2 startup systemd -u $USER --hp $HOME
    fi
    
    log "System dependencies installed successfully!"
}

# Setup SSL certificate
setup_ssl() {
    log "Setting up SSL certificate..."
    
    if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
        log "Obtaining SSL certificate for $DOMAIN..."
        certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN
    else
        log "SSL certificate already exists. Skipping..."
    fi
}

# Clone or update repository
setup_repository() {
    log "Setting up repository..."
    
    if [ ! -d "$APP_DIR" ]; then
        log "Cloning repository..."
        git clone $REPO_URL $APP_DIR
        cd $APP_DIR
        git checkout $BRANCH
    else
        log "Updating repository..."
        cd $APP_DIR
        
        # Stash any local changes
        git stash
        
        # Fetch and reset to latest
        git fetch origin
        git reset --hard origin/$BRANCH
        git clean -fd
    fi
    
    log "Repository setup complete!"
}

# Setup environment files
setup_environment() {
    log "Setting up environment files..."
    
    # Backend environment
    if [ ! -f "$APP_DIR/server/.env" ]; then
        log "Creating server .env file..."
        cat > "$APP_DIR/server/.env" << EOF
# Server Configuration
NODE_ENV=production
PORT=5000

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/lms-system

# JWT Configuration
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRE=7d

# CORS Configuration
CORS_ORIGIN=https://$DOMAIN

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100

# Timezone
TZ=America/New_York
EOF
        warning "Please update the MongoDB URI and other settings in $APP_DIR/server/.env"
    else
        log "Server .env file already exists. Skipping..."
    fi
    
    # Frontend environment
    if [ ! -f "$APP_DIR/client/.env.production" ]; then
        log "Creating client .env.production file..."
        cat > "$APP_DIR/client/.env.production" << EOF
# API Configuration
REACT_APP_API_URL=https://$DOMAIN
REACT_APP_SOCKET_URL=https://$DOMAIN
EOF
    else
        log "Client .env.production file already exists. Skipping..."
    fi
}

# Install application dependencies
install_app_dependencies() {
    log "Installing application dependencies..."
    
    cd $APP_DIR
    
    # Install server dependencies
    log "Installing server dependencies..."
    cd server
    npm install --production
    
    # Install client dependencies
    log "Installing client dependencies..."
    cd ../client
    npm install
    
    log "Application dependencies installed!"
}

# Build React application
build_frontend() {
    log "Building React frontend..."
    
    cd $APP_DIR/client
    npm run build
    
    log "Frontend build complete!"
}

# Setup Nginx configuration
setup_nginx() {
    log "Setting up Nginx configuration..."
    
    # Create build directory if it doesn't exist
    mkdir -p $BUILD_DIR
    
    # Copy nginx config
    sudo cp $APP_DIR/nginx.conf $NGINX_CONF
    
    # Create symlink if it doesn't exist
    if [ ! -L "/etc/nginx/sites-enabled/lms" ]; then
        sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/lms
    fi
    
    # Remove default site if exists
    if [ -L "/etc/nginx/sites-enabled/default" ]; then
        sudo rm /etc/nginx/sites-enabled/default
    fi
    
    # Copy built files to build directory
    cp -r $APP_DIR/client/build/* $BUILD_DIR/
    
    # Test nginx configuration
    sudo nginx -t || error "Nginx configuration test failed!"
    
    # Reload nginx
    sudo systemctl reload nginx
    
    log "Nginx configuration complete!"
}

# Setup PM2 ecosystem file
setup_pm2_config() {
    log "Setting up PM2 configuration..."
    
    cat > "$APP_DIR/ecosystem.config.js" << EOF
module.exports = {
  apps: [{
    name: '$PM2_APP_NAME',
    script: './server/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: '/var/log/pm2/$PM2_APP_NAME-error.log',
    out_file: '/var/log/pm2/$PM2_APP_NAME-out.log',
    log_file: '/var/log/pm2/$PM2_APP_NAME-combined.log',
    time: true,
    max_memory_restart: '1G',
    autorestart: true,
    watch: false,
    merge_logs: true,
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000
  }]
};
EOF
    
    # Create PM2 log directory
    mkdir -p /var/log/pm2
    
    log "PM2 configuration complete!"
}

# Start/Restart application with PM2
deploy_app() {
    log "Deploying application with PM2..."
    
    cd $APP_DIR
    
    # Check if app is already running
    if pm2 describe $PM2_APP_NAME &> /dev/null; then
        log "Application is running. Restarting..."
        pm2 reload ecosystem.config.js
    else
        log "Starting application..."
        pm2 start ecosystem.config.js
    fi
    
    # Save PM2 process list
    pm2 save
    
    log "Application deployed successfully!"
}

# Health check
health_check() {
    log "Performing health check..."
    
    sleep 5
    
    # Check if backend is responding
    if curl -f -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/health | grep -q "200"; then
        log "Backend health check passed!"
    else
        error "Backend health check failed!"
    fi
    
    # Check if frontend is accessible
    if curl -f -s -o /dev/null -w "%{http_code}" https://$DOMAIN | grep -q "200"; then
        log "Frontend health check passed!"
    else
        warning "Frontend health check failed. Please check SSL certificate and Nginx configuration."
    fi
}

# Setup firewall
setup_firewall() {
    log "Setting up firewall rules..."
    
    if command -v ufw &> /dev/null; then
        sudo ufw --force enable
        sudo ufw allow 22/tcp    # SSH
        sudo ufw allow 80/tcp    # HTTP
        sudo ufw allow 443/tcp   # HTTPS
        sudo ufw reload
        log "Firewall configured!"
    else
        warning "UFW not found. Please configure firewall manually."
    fi
}

# Display deployment info
show_info() {
    echo ""
    log "========================================="
    log "Deployment Complete!"
    log "========================================="
    log "Domain: https://$DOMAIN"
    log "Backend: http://localhost:5000"
    log "PM2 App: $PM2_APP_NAME"
    log ""
    log "Useful commands:"
    log "  - View PM2 logs: pm2 logs $PM2_APP_NAME"
    log "  - PM2 status: pm2 status"
    log "  - PM2 restart: pm2 restart $PM2_APP_NAME"
    log "  - PM2 stop: pm2 stop $PM2_APP_NAME"
    log "  - Nginx logs: tail -f /var/log/nginx/olivialms.cloud.access.log"
    log "  - Nginx error logs: tail -f /var/log/nginx/olivialms.cloud.error.log"
    log "  - Reload Nginx: sudo systemctl reload nginx"
    log "  - MongoDB status: sudo systemctl status mongod"
    log "========================================="
    echo ""
}

# Main deployment flow
main() {
    log "Starting deployment for $DOMAIN..."
    
    # Check if this is first-time setup
    if [ ! -d "$APP_DIR" ]; then
        log "First-time setup detected..."
        check_permissions
        install_dependencies
        setup_firewall
        setup_repository
        setup_environment
        install_app_dependencies
        build_frontend
        setup_nginx
        setup_ssl
        setup_nginx  # Run again after SSL to use HTTPS config
        setup_pm2_config
        deploy_app
    else
        log "Updating existing deployment..."
        setup_repository
        install_app_dependencies
        build_frontend
        setup_nginx
        deploy_app
    fi
    
    health_check
    show_info
}

# Run main function
main
