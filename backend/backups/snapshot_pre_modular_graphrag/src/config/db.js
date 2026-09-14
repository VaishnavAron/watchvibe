import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import mongoose from 'mongoose';

const MONGODB_URI = process.env.db_connection_string;
if (!MONGODB_URI) throw new Error('db_connection_string not defined');

export default async function connectDB() {
  await mongoose.connect(MONGODB_URI);
  // mongoose.set('autoIndex', false);
  console.log('✅ MongoDB connected');
  return mongoose;
}

