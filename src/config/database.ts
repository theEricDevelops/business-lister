// At the top of your database.ts file
console.log('ALL ENV VARS:', {
  DATABASE_URL: process.env.DATABASE_URL,
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_NAME: process.env.DB_NAME,
  DB_USER: process.env.DB_USER,
  NODE_ENV: process.env.NODE_ENV
});

import dotenv from 'dotenv';
import path from  'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../../.env');
console.log('ENV PATH:', envPath);

// Make sure environment variables are loaded
dotenv.config({path: envPath, debug: true, override: true, encoding: 'utf8'});

/**
 * Database configuration
 */0
export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: {
    rejectUnauthorized: boolean;
  };
}

export function getDbConfig(): DbConfig {
  console.log('Database config:', {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER
  });
  
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'iicrc_listings',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    // Only use SSL in production environment
    ...(process.env.NODE_ENV === 'production' && {
      ssl: {
        rejectUnauthorized: false
      }
    })
  };
}
