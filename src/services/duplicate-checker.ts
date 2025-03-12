import { createLogger } from '../utils';
import { getDatabaseService } from './database';

const logger = createLogger('DuplicateChecker');

/**
 * Service to check for duplicate businesses in the database
 */
export class DuplicateChecker {
  async checkDuplicateBusinesses(): Promise<any[]> {
    logger.info('Starting database duplicate verification check');
    
    const dbService = getDatabaseService();
    
    try {
      // Find potential duplicates based on business name and postal code
      logger.info('Checking for duplicate business entries...');
      
      const query = `
        SELECT business_name, postal_code, COUNT(*) as count
        FROM businesses
        GROUP BY business_name, postal_code
        HAVING COUNT(*) > 1
        ORDER BY count DESC
      `;
      
      const duplicates = await dbService.query(query);
      
      // Log summary of duplicates
      logger.info(`Found ${duplicates.length} potential duplicate business entries`);
      
      return duplicates;
    } catch (error) {
      logger.error('Error checking for duplicate businesses', error as Error);
      throw error;
    }
  }

  async getDuplicateDetails(businessName: string, postalCode: string): Promise<any[]> {
    const dbService = getDatabaseService();
    
    try {
      const query = `
        SELECT * FROM businesses
        WHERE business_name = $1 AND postal_code = $2
        ORDER BY id
      `;
      
      return await dbService.query(query, [businessName, postalCode]);
    } catch (error) {
      logger.error('Error getting duplicate details', error as Error);
      throw error;
    }
  }
}
