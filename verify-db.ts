import pkg from 'pg';
const { Pool } = pkg;
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface BusinessListing {
    businessName: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    phone: string;
    website: string;
    email: string;
}

interface ListingsFile {
    zipCode: string;
    location: string;
    businesses: BusinessListing[];
    count: number;
    scrapeDate: string;
}

async function main(): Promise<void> {
    console.log('Starting database verification test for listings_17201.json');
    
    // Create DB connection
    const dbConfig = {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
        user: process.env.DB_NAME || 'doadmin',
        password: process.env.DB_PASSWORD,
        ssl: {
            rejectUnauthorized: false
        }
    };
    
    console.log(`Connecting to database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
    const pool = new Pool(dbConfig);
    
    try {
        // Read the JSON file
        console.log('Reading listings_17201.json file');
        const fileData = fs.readFileSync('listings_17201.json', 'utf8');
        const listings: ListingsFile = JSON.parse(fileData);
        
        console.log(`Found ${listings.count} businesses in the JSON file`);
        
        // Check each business in the database
        console.log('Verifying database entries...');
        let matchCount = 0;
        let missingCount = 0;
        
        for (const business of listings.businesses) {
            const query = `
                SELECT * FROM businesses 
                WHERE business_name = $1 
                AND postal_code = $2
            `;
            
            const result = await pool.query(query, [
                business.businessName, 
                business.postalCode
            ]);
            
            if (result.rowCount === 0) {
                console.log(`❌ MISSING: ${business.businessName} in ${business.city}, ${business.state}`);
                missingCount++;
            } else {
                console.log(`✅ FOUND: ${business.businessName} in ${business.city}, ${business.state}`);
                matchCount++;
            }
        }
        
        // Print summary
        console.log('\n--- VERIFICATION SUMMARY ---');
        console.log(`Total businesses in JSON: ${listings.count}`);
        console.log(`Found in database: ${matchCount}`);
        console.log(`Missing from database: ${missingCount}`);
        
        if (missingCount === 0) {
            console.log('✅ SUCCESS: All businesses from listings_17201.json are present in the database!');
        } else {
            console.log('❌ FAILURE: Some businesses are missing from the database.');
        }
        
    } catch (error) {
        console.error('Error during verification:', error);
    } finally {
        console.log('Closing database connection');
        await pool.end();
    }
}

main().catch(console.error);