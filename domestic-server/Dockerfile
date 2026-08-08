FROM node:18-alpine

# Set timezone to IST (Indian Standard Time)
RUN apk add --no-cache tzdata
ENV TZ=Asia/Kolkata

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 5009

CMD ["node", "server.js"]
