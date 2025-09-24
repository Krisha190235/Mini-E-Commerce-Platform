FROM node:20-alpine

WORKDIR /app

# Install deps
COPY backend/package*.json ./backend/
RUN cd backend && npm ci

# Copy source
COPY backend ./backend

ENV PORT=3000
EXPOSE 3000

# Start the API (NODE_ENV can be overridden in deployment)
CMD ["node", "backend/src/app.js"]