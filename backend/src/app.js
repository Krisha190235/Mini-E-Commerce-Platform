import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

const app = express();
app.use(cors());
app.use(express.json());

// --- Health ---
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

// --- Placeholder root ---
app.get('/', (_req, res) => res.json({ message: 'E-commerce API running' }));

// --- Mongo connection + server start (skip during tests) ---
const isTest = process.env.NODE_ENV === 'test';
const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/ecom';

async function start() {
  if (!isTest) {
    try {
      // Connect only outside tests
      await mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 5000 });
      console.log('Mongo connected');

      app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    } catch (err) {
      console.error('Mongo connection error:', err?.message || err);
      process.exit(1);
    }
  }
}
start();

export default app;