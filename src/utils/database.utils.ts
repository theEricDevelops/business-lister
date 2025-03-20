import Logger from './logger';
import { getDatabase } from '../services/database';

const logger = new Logger('database-utils.log');
const db = getDatabase();

async function initializeDatabase() {
    try {
      logger.info(`Checking database tables...`);
  
      const businessesTableExists = await db.checkForTable('businesses');
  
      if (!businessesTableExists) {
        logger.warning(`Creating businesses table...`);
        
        await db.query(`
          CREATE TABLE IF NOT EXISTS businesses (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            address VARCHAR(255) NOT NULL,
            city VARCHAR(255) NOT NULL,
            state VARCHAR(2) NOT NULL,
            postalCode VARCHAR(10) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            website VARCHAR(255),
            email VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(name, address, city, state, postalCode, phone, website, email)
          )
        `);
  
        await db.query(`CREATE INDEX IF NOT EXISTS idx_businesses_postalCode ON businesses(postalCode)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_businesses_name ON businesses(name)`);
  
        logger.info(`Businesses table created.`);
      } else {
        logger.info(`Businesses table exists.`);
      }
  
      logger.info(`Database tables checked.`);
      return true;
    } catch (error) {
      logger.error(`Error initializing database: ${error.message}`);
      return false;
    }
}

async function createUniqueConstraintIfNeeded() {
  try {
    const constraintExists = await db.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'businesses'
      AND constraint_type = 'UNIQUE'
      AND constraint_name = 'businesses_unique_key'
      `);
  
    if (constraintExists.length === 0) {
      logger.info(`Adding unique constraint to businesses table...`);
      await db.query(`
        ALTER TABLE businesses
        ADD CONSTRAINT businesses_unique_key
        UNIQUE (name, address, city, state)
        `);
      logger.info(`Unique constraint added.`);
    }
  } catch (error) {
    logger.error(`Error adding unique constraint: ${error.message}`);
  }
}

export function initDB() {
  const db = initializeDatabase();
  createUniqueConstraintIfNeeded();
  return db;
}
