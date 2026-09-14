import mongoose from 'mongoose';
import { config } from './index.js';

let isConnected = false;

export async function connectDB() {
  if (isConnected) {
    return mongoose.connection;
  }

  const uri = config.mongodbUri;
  const isDefaultLocal = !process.env.MONGODB_URI;

  if (isDefaultLocal && config.nodeEnv === 'production') {
    console.warn(
      '⚠️ [MongoDB Notice] MONGODB_URI environment variable is not defined in production.\n' +
      '   Falling back to localhost (127.0.0.1:27017). If you are deploying on Render,\n' +
      '   please add your MongoDB Atlas connection string to Render Environment Variables as MONGODB_URI.'
    );
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });

    isConnected = true;
    console.log(`🍃 MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.warn(`⚠️ MongoDB Connection Error: ${error.message}. Backend running in memory-standby mode.`);
    isConnected = false;
    return null;
  }
}

mongoose.connection.on('connected', () => {
  isConnected = true;
  console.log('🍃 MongoDB connection established');
});

mongoose.connection.on('error', (err) => {
  isConnected = false;
  console.error('❌ MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.warn('⚠️ MongoDB disconnected');
});

export function isDBConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}
