import * as dotenv from 'dotenv';
import { DuplicateChecker } from '../services/duplicate-checker';
import { createLogger } from '../utils';
import { getDatabaseService } from '../services/database';

// Load environment variables
dotenv.config();

const logger = createLogger('DuplicateChecker');

async function main(): Promise<void> {
  logger.info('Starting database duplicate verification check');
  
  const duplicateChecker = new DuplicateChecker();
  
  try {
    // Find potential duplicates based on business name and postal code
    const duplicates = await duplicateChecker.checkDuplicateBusinesses();
    
    // Print summary of duplicates
    logger.info(`Found ${duplicates.length} potential duplicate business entries`);
    
    // Print details for each duplicate group
    for (const dup of duplicates) {
      logger.info(`Business "${dup.business_name}" in postal code ${dup.postal_code} has ${dup.count} entries`);
      
      // Get detailed records for each duplicate
      const details = await duplicateChecker.getDuplicateDetails(dup.business_name, dup.postal_code);
      
      // Log each duplicate entry
      details.forEach((entry, i) => {
        logger.info(`  [${i+1}] ID: ${entry.id}, Address: ${entry.address}`);
      });
    }
  } finally {
    // Close database connection
    const dbService = getDatabaseService();
    await dbService.close();
  }
}

main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
