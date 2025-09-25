# build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ARG VITE_API_URL=http://localhost:8082
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# serve static files with nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# a tiny health endpoint
RUN printf 'server { listen 80; location = /health { return 200 "ok\n"; } location / { try_files $uri /index.html; } }' > /etc/nginx/conf.d/default.conf