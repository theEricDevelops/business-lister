import { Pool, PoolClient } from 'pg';
import { DbConfig, getDbConfig } from '../config/database';
import Logger from '../utils/logger';
import { BusinessListing } from '../types/business';

const logger = new Logger('database-service.log');

// Use a module-level variable for the singleton instance
let instance: DatabaseService | null = null;

/**
 * Service for database operations - implemented as a true singleton
 */
export class DatabaseService {
  private pool: Pool;
  
  // Private constructor prevents direct instantiation
  private constructor() {
    const dbConfig = getDbConfig();
    logger.info(`Initializing database connection to: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
    this.pool = new Pool(dbConfig);
    
    // Test the connection
    this.pool.query('SELECT NOW()')
      .then(() => logger.info('Connected to PostgreSQL database successfully'))
      .catch(err => logger.error('Database connection test failed', err));
  }
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): DatabaseService {
    if (!instance) {
      instance = new DatabaseService();
    }
    return instance;
  }
  
  async getClient(): Promise<PoolClient> {
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

  // Add method to fetch businesses
  async getBusinesses(): Promise<BusinessListing[]> {
    try {
      logger.info('Fetching all businesses from database');

      const tableInfo = await this.query(
        `SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'businesses'`
      );

      logger.info(`Table columns: ${tableInfo.map((c: any) => c.column_name).join(', ')}`);

      const businesses = await this.query<BusinessListing>(
        'SELECT id, name, address, city, state, postalcode, phone, website, email, category, source FROM businesses ORDER BY name'
      );
      logger.info(`Retrieved ${businesses.length} businesses`);
      return businesses;
    } catch (error) {
      logger.error('Error fetching businesses:', error as Error);
      return [];
    }
  }
  
  // Get business by ID
  async getBusinessById(id: number): Promise<BusinessListing | null> {
    try {
      const businesses = await this.query<BusinessListing>(
        'SELECT id, name, address, city, state, postalcode, phone, website, email, category, source FROM businesses WHERE id = $1',
        [id]
      );
      return businesses[0] || null;
    } catch (error) {
      logger.error(`Error fetching business with ID ${id}:`, error as Error);
      return null;
    }
  }
}

// Export the singleton getter method
export const getDatabase = DatabaseService.getInstance;

// For backwards compatibility, also export a default instance
const dbService = DatabaseService.getInstance();
export default dbService;

// Helper functions
export async function getBusinesses(): Promise<BusinessListing[]> {
  return dbService.getBusinesses();
}

export async function getBusinessById(id: number): Promise<BusinessListing | null> {
  return dbService.getBusinessById(id);
}
