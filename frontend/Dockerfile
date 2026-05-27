# Frontend build image. Produces the static SPA at /app/dist. Your server's
# global nginx serves these files (see deploy/nginx.conf); the "frontend-build"
# service in docker-compose.prod.yml copies dist into the host webroot.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
