import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | { [key: string]: any };
  max?: number;
  idleTimeoutMillis?: number;
}

export function getDbConfig(): DbConfig {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'business_lister',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: parseInt(process.env.DB_POOL_SIZE || '20', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10)
  };
}

export interface ScraperConfig {
  timeout: number;
  headless: boolean;
  retries: number;
}

export function getScraperConfig(): ScraperConfig {
  return {
    timeout: parseInt(process.env.SCRAPER_TIMEOUT || '60000', 10),
    headless: process.env.SCRAPER_HEADLESS !== 'false',
    retries: parseInt(process.env.SCRAPER_RETRIES || '3', 10)
  };
}
