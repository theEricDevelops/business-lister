import pkg from 'pg';
const { Pool } = pkg;
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main(): Promise<void> {
    console.log("Checking for duplicate businesses in database...");
    
    // Database connection
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: {
            rejectUnauthorized: false
        }
    });
    
    try {
        // Connect to database
        const client = await pool.connect();
        console.log("Connected to database");
        
        // Identify potential duplicates based on similar business names
        const result = await client.query(`
            SELECT 
                b1.id as id1, 
                b2.id as id2, 
                b1.business_name as name1, 
                b2.business_name as name2,
                b1.address as address1,
                b2.address as address2,
                similarity(b1.business_name, b2.business_name) as name_similarity
            FROM 
                businesses b1
            JOIN 
                businesses b2 ON b1.id < b2.id
            WHERE 
                similarity(b1.business_name, b2.business_name) > 0.7
            ORDER BY 
                name_similarity DESC
            LIMIT 100
        `);
        
        console.log(`Found ${result.rowCount} potential duplicates`);
        
        result.rows.forEach(row => {
            console.log(`Similarity: ${row.name_similarity.toFixed(2)}`);
            console.log(`ID ${row.id1}: ${row.name1}`);
            console.log(`ID ${row.id2}: ${row.name2}`);
            console.log(`Address 1: ${row.address1}`);
            console.log(`Address 2: ${row.address2}`);
            console.log('---');
        });
        
        // Release client
        client.release();
    } catch (err) {
        console.error('Error checking duplicates:', err);
    } finally {
        // Close pool
        await pool.end();
    }
}

main().catch(console.error);
