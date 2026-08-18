# Builds and runs the hidingsnake.io realtime server (Express + Socket.io + SQLite).
# The client is a static Vite build and is NOT served by this image — deploy client/dist
# separately to any static host (see README.md for the full deployment walkthrough).
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json

RUN npm install --workspaces --include-workspace-root

COPY shared shared
COPY server server

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/server/data/hidingsnake.sqlite

EXPOSE 3001
VOLUME ["/app/server/data"]

CMD ["npm", "run", "start", "-w", "server"]
