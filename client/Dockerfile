FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ARG REACT_APP_API_URL
ARG REACT_APP_SOCKET_URL
ARG REACT_APP_CHAT_URL
ARG REACT_APP_DOMESTIC_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_SOCKET_URL=$REACT_APP_SOCKET_URL
ENV REACT_APP_CHAT_URL=$REACT_APP_CHAT_URL
ENV REACT_APP_DOMESTIC_URL=$REACT_APP_DOMESTIC_URL
ENV DISABLE_ESLINT_PLUGIN=true
ENV CI=false

RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
RUN echo 'server { listen 3000; root /usr/share/nginx/html; location / { try_files $uri /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
