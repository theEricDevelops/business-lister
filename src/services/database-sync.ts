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

let syncInProgress = false;
let syncProgress = {
  processed: 0,
  total: 0,
  currentZipCode: '',
  completedZipCodes: 0,
  totalZipCodes: 0,
  lastUpdated: new Date()
};

export function getSyncProgress() {
  return {
    ...syncProgress,
    inProgress: syncInProgress
  };
}

export async function syncDatabaseFromJsonFiles(): Promise<{ count: number, zipCodes: string[] }> {
  try {
    syncProgress = {
      processed: 0,
      total: 0,
      currentZipCode: '',
      completedZipCodes: 0,
      totalZipCodes: 0,
      lastUpdated: new Date()
    }
    syncInProgress = true;

    logger.info('Starting database sync from JSON files');
    
    // Find all JSON files matching the pattern
    const jsonFiles = await glob('updated_listings_*.json', { cwd: JSON_DIR });
    logger.info(`Found ${jsonFiles.length} JSON files to process`);

    syncProgress.totalZipCodes = jsonFiles.length;
    
    const zipCodes: string[] = [];
    let totalBusinesses = 0;
    
    let businessCount = 0;
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(JSON_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (data.businesses && Array.isArray(data.businesses)) {
          businessCount += data.businesses.length;
        }
      } catch (fileError) {
        logger.error(`Error processing file ${file}`, fileError as Error);
      }
    }

    syncProgress.total = businessCount;

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(JSON_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        if (data.zipCode && Array.isArray(data.businesses)) {
          zipCodes.push(data.zipCode);
          syncProgress.currentZipCode = data.zipCode;
          
          // Insert businesses into database
          for (const business of data.businesses) {
                   
            if (!business.businessName) {
              logger.warning(`Skipping business with missing name in ${data.zipCode}`);
              continue;
            }
            
            try {
              await db.query(
                `INSERT INTO businesses 
                 (name, address, city, state, postalcode, phone, website, email) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (name, address, city, state) DO UPDATE SET
                 postalcode = $5, phone = $6, website = $7, email = $8`,
                [
                  business.businessName,
                  business.address,
                  business.city,
                  business.state,
                  business.postalCode,
                  business.phone,
                  business.website,
                  business.email
                ]
              );
              totalBusinesses++;

              syncProgress.processed++;
              syncProgress.lastUpdated = new Date();
            } catch (insertError) {
              logger.error(`Failed to insert business: ${business.businessName}`, insertError as Error);
            }
          }
          
          syncProgress.completedZipCodes++;
          logger.info(`Processed ${data.businesses.length} businesses from ${data.zipCode}`);
        }
      } catch (fileError) {
        logger.error(`Error processing file ${file}`, fileError as Error);
      }
    }
    
    logger.info(`Sync completed. Added ${totalBusinesses} businesses from ${zipCodes.length} zip codes`);

    syncInProgress = false;
    return { count: totalBusinesses, zipCodes };
  } catch (error) {
    logger.error('Database sync failed', error as Error);
    syncInProgress = false;
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