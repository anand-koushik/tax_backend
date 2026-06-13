import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure data directory exists for JSON fallback
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let isLocalFallback = false;

export const connectDB = async () => {
  const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/tax_planner_v2';
  try {
    mongoose.set('strictQuery', false);
    console.log(`Attempting to connect to MongoDB at: ${mongoURI}...`);
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 2000 // Quick timeout to fall back fast
    });
    console.log('✅ MongoDB Connected Successfully');
    isLocalFallback = false;
  } catch (error) {
    console.log(`❌ MongoDB Connection Failed: ${error.message}`);
    console.log('⚠️ Switch active: Using Local JSON Database Fallback in backend/data/');
    isLocalFallback = true;
  }
};

export const isLocalMode = () => isLocalFallback;
