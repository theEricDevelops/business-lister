import pkg from 'pg';
const { Pool } = pkg;
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { BusinessListing, ListingsFile } from '../types';

// Load environment variables
dotenv.config();

async function main(): Promise<void> {
    console.log("Verifying database contents...");
    
    // Create database connection
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
        
        // Verify each table exists and has data
        const tables = ['businesses', 'zip_codes', 'categories'];
        for (const table of tables) {
            const result = await client.query(`
                SELECT COUNT(*) FROM ${table}
            `);
            
            const count = parseInt(result.rows[0].count);
            console.log(`Table ${table} contains ${count} records`);
            
            if (count === 0) {
                console.warn(`Warning: Table ${table} is empty`);
            }
        }
        
        // Check for orphaned records
        const orphanedCheck = await client.query(`
            SELECT COUNT(*) FROM businesses WHERE zip_code NOT IN (SELECT code FROM zip_codes)
        `);
        
        const orphanedCount = parseInt(orphanedCheck.rows[0].count);
        if (orphanedCount > 0) {
            console.warn(`Warning: Found ${orphanedCount} businesses with invalid ZIP codes`);
        } else {
            console.log("All businesses have valid ZIP codes");
        }
        
        // Release client
        client.release();
    } catch (err) {
        console.error('Error verifying database:', err);
    } finally {
        // Close pool
        await pool.end();
    }
}

main().catch(console.error);
