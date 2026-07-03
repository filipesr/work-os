# NAS PoC agent — runs on the Asustor NAS (arm64) via Docker Engine + Portainer.
# Multi-stage: build TS -> run compiled JS on a slim runtime.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
# No lockfile committed for the PoC; install then build.
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
# NAS_ROOT is a mounted volume (e.g. /volume1/WorkOS-PoC -> /data).
# Ports: 8080 = LAN listener, 8081 = tunnel listener (bind to localhost on the host).
EXPOSE 8080 8081
# Run as an arbitrary uid/gid set by `user:` in docker-compose to match the NAS ACL owner.
CMD ["node", "dist/server.js"]
