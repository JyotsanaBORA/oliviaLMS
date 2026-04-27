FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

# CRA uses PORT env var, set HOST so it binds to 0.0.0.0 inside Docker
ENV HOST=0.0.0.0
ENV PORT=3000

CMD ["npm", "start"]
