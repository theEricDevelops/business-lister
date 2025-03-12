import pkg from 'pg';
const { Pool } = pkg;
import { DbConfig, getDbConfig } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('DatabaseService');

/**
 * Service for database operations
 */
export class DatabaseService {
  private pool: pkg.Pool;
  
  constructor(config?: DbConfig) {
    this.pool = new Pool(config || getDbConfig());
    logger.info(`Database connection initialized to: ${config?.host || getDbConfig().host}`);
  }
  
  async getClient(): Promise<pkg.PoolClient> {
    try {
      const client = await this.pool.connect();
      logger.debug('Got database client from pool');
      return client;
    } catch (error) {
      logger.error('Failed to get client from pool', error as Error);
      throw error;
    }
  }
  
  async query<T>(text: string, params: any[] = []): Promise<T[]> {
    const client = await this.getClient();
    try {
      const result = await client.query(text, params);
      return result.rows as T[];
    } finally {
      client.release();
    }
  }
  
  async checkForTable(tableName: string): Promise<boolean> {
    try {
      const result = await this.query<{exists: boolean}>(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        );`, 
        [tableName]
      );
      return result[0]?.exists || false;
    } catch (error) {
      logger.error(`Failed to check for table: ${tableName}`, error as Error);
      throw error;
    }
  }
  
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database connection pool closed');
  }
}

// Singleton instance
let dbService: DatabaseService | null = null;

/**
 * Gets or creates the database service instance
 */
export function getDatabaseService(): DatabaseService {
  if (!dbService) {
    dbService = new DatabaseService();
  }
  return dbService;
}
