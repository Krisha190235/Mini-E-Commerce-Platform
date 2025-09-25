FROM node:20-alpine

WORKDIR /app

# Install deps
COPY backend/package*.json ./backend/
RUN cd backend && npm ci

# Copy source
COPY backend ./backend

ENV PORT=3000
EXPOSE 3000

# Add a simple healthcheck for faster Monitoring feedback
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Start the API (NODE_ENV / MONGO_URL set at runtime)
CMD ["node", "backend/src/app.js"]