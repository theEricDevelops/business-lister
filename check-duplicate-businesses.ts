import pkg from 'pg';
const { Pool } = pkg;
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main(): Promise<void> {
    console.log('Starting database duplicate verification check');
    
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
        // Find potential duplicates based on business name and postal code
        console.log('Checking for duplicate business entries...');
        
        const query = `
            SELECT business_name, postal_code, COUNT(*) as count
            FROM businesses
            GROUP BY business_name, postal_code
            HAVING COUNT(*) > 1
            ORDER BY count DESC
        `;
        
        const result = await pool.query(query);
        
        // Print summary of duplicates
        console.log('\n--- DUPLICATE VERIFICATION RESULTS ---');
        
        if (result.rowCount === 0) {
            console.log('✅ SUCCESS: No duplicates found in the database!');
        } else {
            console.log(`❌ FOUND ${result.rowCount} sets of duplicate entries:`);
            
            for (const row of result.rows) {
                console.log(`- "${row.business_name}" in ${row.postal_code}: ${row.count} occurrences`);
                
                // Get details of the duplicates
                const detailsQuery = `
                    SELECT id, business_name, address, city, state, postal_code
                    FROM businesses
                    WHERE business_name = $1 AND postal_code = $2
                `;
                
                const details = await pool.query(detailsQuery, [row.business_name, row.postal_code]);
                
                for (const detail of details.rows) {
                    console.log(`  ID ${detail.id}: ${detail.business_name}, ${detail.address}, ${detail.city}, ${detail.state} ${detail.postal_code}`);
                }
                
                console.log(''); // Empty line for readability
            }
        }
        
    } catch (error) {
        console.error('Error during verification:', error);
    } finally {
        console.log('Closing database connection');
        await pool.end();
    }
}

main().catch(console.error);