/**
 * Database configuration
 */
export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: {
    rejectUnauthorized: boolean;
  };
}

export function getDbConfig(): DbConfig {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'business_lister',
    user: process.env.DB_USER || 'doadmin',
    password: process.env.DB_PASSWORD || '',
    ssl: {
      rejectUnauthorized: false
    }
  };
}
