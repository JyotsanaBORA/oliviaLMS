#!/bin/bash
set -e

cd /root/Olivialms

echo ">> Pulling latest code..."
git reset --hard HEAD
git pull origin main

echo ">> Building LMS backend..."
docker build -t olivialms-backend ./server

echo ">> Building LMS frontend..."
docker build \
  --build-arg REACT_APP_API_URL=https://olivialms.cloud \
  --build-arg REACT_APP_SOCKET_URL=https://olivialms.cloud \
  --build-arg REACT_APP_CHAT_URL=https://rgstaffhub.reddingtonglobal.com \
  --build-arg REACT_APP_DOMESTIC_URL=https://olivialms.cloud/domestic \
  -t olivialms-frontend ./client

echo ">> Building Domestic LMS backend..."
docker build -t domestic-backend ./domestic-server

echo ">> Building Domestic LMS frontend..."
docker build \
  --build-arg REACT_APP_DOM_API_URL=https://olivialms.cloud \
  --build-arg REACT_APP_INTERNATIONAL_URL=https://olivialms.cloud \
  -t domestic-frontend ./domestic-client

echo ">> Stopping old containers..."
docker stop lms-backend 2>/dev/null || true
docker rm lms-backend 2>/dev/null || true
docker stop lms-frontend 2>/dev/null || true
docker rm lms-frontend 2>/dev/null || true
docker stop domestic-backend 2>/dev/null || true
docker rm domestic-backend 2>/dev/null || true
docker stop domestic-frontend 2>/dev/null || true
docker rm domestic-frontend 2>/dev/null || true

echo ">> Starting LMS backend..."
docker run -d --network host \
  --env-file ./server/.env \
  --name lms-backend \
  --restart unless-stopped \
  --memory=8g \
  -e CLUSTER_WORKERS=4 \
  olivialms-backend

echo ">> Starting LMS frontend..."
docker run -d --network host \
  --name lms-frontend \
  --restart unless-stopped \
  olivialms-frontend

echo ">> Starting Domestic LMS backend..."
docker run -d --network host \
  --env-file ./domestic-server/.env \
  --name domestic-backend \
  --restart unless-stopped \
  domestic-backend

echo ">> Starting Domestic LMS frontend..."
docker run -d --network host \
  --name domestic-frontend \
  --restart unless-stopped \
  domestic-frontend

echo ">> Cleaning up old images..."
docker image prune -f

echo ">> All services deployed successfully!"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
