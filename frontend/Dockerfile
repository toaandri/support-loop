FROM node:24-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN --mount=type=cache,id=support-loop-npm,target=/root/.npm npm ci --no-audit --no-fund --fetch-timeout=60000 --fetch-retries=2
COPY frontend/ ./
RUN npm run build
FROM nginx:1.28-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s CMD wget -q -O /dev/null http://127.0.0.1/
