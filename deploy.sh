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
  -t olivialms-frontend ./client

echo ">> Stopping old containers..."
docker stop lms-backend 2>/dev/null || true
docker rm lms-backend 2>/dev/null || true
docker stop lms-frontend 2>/dev/null || true
docker rm lms-frontend 2>/dev/null || true

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

echo ">> Cleaning up old images..."
docker image prune -f

echo ">> LMS deployed successfully!"
docker logs --tail 5 lms-backend
