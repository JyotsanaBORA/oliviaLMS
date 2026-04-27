FROM node:18-alpine

WORKDIR /app

# Install all deps (including nodemon)
COPY package*.json ./
RUN npm install

# Copy source (overridden at runtime by bind mount)
COPY . .

EXPOSE 5000

CMD ["npm", "run", "dev"]
