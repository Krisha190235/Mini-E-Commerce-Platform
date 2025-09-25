FROM node:20-alpine

WORKDIR /app

# Install deps
COPY backend/package*.json ./backend/
RUN cd backend && npm ci

# Copy source
COPY backend ./backend

ENV PORT=3000
EXPOSE 3000

# Single healthcheck using Node.js (no wget dependency)
HEALTHCHECK --interval=5s --timeout=3s --retries=30 CMD node -e "\
require('http').get('http://localhost:3000/health', r => {\
  process.exitCode = (r.statusCode === 200) ? 0 : 1;\
}).on('error', () => process.exit(1));"

# Start the API (NODE_ENV / MONGO_URL set at runtime)
CMD ["node", "backend/src/app.js"]