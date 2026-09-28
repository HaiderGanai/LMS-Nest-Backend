import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017',
  dbName: process.env.MONGO_DB_NAME || 'tarteel_v2',
  maxPoolSize: Number(process.env.MONGO_MAX_POOL || 20),
}));
