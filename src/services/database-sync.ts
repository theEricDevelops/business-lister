import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { fileURLToPath } from 'url';
import Logger from '../utils/logger';
import { getDatabase } from './database';

const logger = new Logger('database-sync.log');
const db = getDatabase();

// Get current directory in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Path to JSON files
const JSON_DIR = path.resolve(__dirname, '../../output/json');

export async function syncDatabaseFromJsonFiles(): Promise<{ count: number, zipCodes: string[] }> {
  try {
    logger.info('Starting database sync from JSON files');
    
    // Find all JSON files matching the pattern
    const jsonFiles = await glob('listings_*.json', { cwd: JSON_DIR });
    logger.info(`Found ${jsonFiles.length} JSON files to process`);
    
    const zipCodes: string[] = [];
    let totalBusinesses = 0;
    
    // Process each file
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(JSON_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        if (data.zipCode && Array.isArray(data.businesses)) {
          zipCodes.push(data.zipCode);
          
          // Insert businesses into database
          for (const business of data.businesses) {
            // Handle different property naming conventions
            const businessName = business.businessName || business.name;
            
            if (!businessName) {
              logger.warning(`Skipping business with missing name in ${data.zipCode}`);
              continue;
            }
            
            try {
              await db.query(
                `INSERT INTO businesses 
                 (business_name, address, city, state, postal_code, phone, website, email, zip_code) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 ON CONFLICT (business_name, address, city, state) DO UPDATE SET
                 postal_code = $5, phone = $6, website = $7, email = $8, zip_code = $9`,
                [
                  businessName,
                  business.address,
                  business.city,
                  business.state,
                  business.postalCode,
                  business.phone,
                  business.website,
                  business.email,
                  data.zipCode
                ]
              );
              totalBusinesses++;
            } catch (insertError) {
              logger.error(`Failed to insert business: ${businessName}`, insertError as Error);
            }
          }
          
          logger.info(`Processed ${data.businesses.length} businesses from ${data.zipCode}`);
        }
      } catch (fileError) {
        logger.error(`Error processing file ${file}`, fileError as Error);
      }
    }
    
    logger.info(`Sync completed. Added ${totalBusinesses} businesses from ${zipCodes.length} zip codes`);
    return { count: totalBusinesses, zipCodes };
  } catch (error) {
    logger.error('Database sync failed', error as Error);
    throw error;
  }
}

export async function checkDatabaseEmpty(): Promise<boolean> {
  try {
    const result: any = await db.query('SELECT COUNT(*) as count FROM businesses');
    return result[0].count === '0';
  } catch (error) {
    logger.error('Error checking if database is empty', error as Error);
    return true; // Assume empty if error
  }
}