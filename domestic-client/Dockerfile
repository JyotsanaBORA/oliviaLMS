FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ARG REACT_APP_DOM_API_URL
ARG REACT_APP_INTERNATIONAL_URL
ENV REACT_APP_DOM_API_URL=$REACT_APP_DOM_API_URL
ENV REACT_APP_INTERNATIONAL_URL=$REACT_APP_INTERNATIONAL_URL
ENV PUBLIC_URL=/domestic
ENV DISABLE_ESLINT_PLUGIN=true

RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
RUN echo 'server { listen 3004; root /usr/share/nginx/html; location / { try_files $uri /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 3004
CMD ["nginx", "-g", "daemon off;"]
