import pkg from 'pg';
const { Pool, PoolClient } = pkg;
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
// Load environment variables
dotenv.config();

// Set up logging - Create our own Logger class rather than importing it
const logLevels: { [key: string]: number } = {
    INFO: 10,
    WARNING: 20,
    ERROR: 30,
    DEBUG: 0
};

class Logger {
    private logFilePath: string;
    private consoleOutput: number;

    constructor(logFilePath: string = 'app.log', consoleOutput: string | number = 'INFO') {
        this.logFilePath = logFilePath;
        typeof(consoleOutput) === 'string' ?
            this.consoleOutput = logLevels[consoleOutput] :
            this.consoleOutput = consoleOutput;

        // Initialize log file with a header
        fs.writeFileSync(this.logFilePath, `--- Log started at ${new Date().toISOString()} ---\n`);
    }

    private getLevelName(level: number): string {
        for (const [name, value] of Object.entries(logLevels)) {
            if (value === level) return name;
        }
        return 'UNKNOWN';
    }

    private formatMessage(level: number, message: string): string {
        const timestamp = new Date().toISOString();
        const levelName = this.getLevelName(level);
        return `[${timestamp}] [${levelName}] ${message}`;
    }

    info(message: string): void {
        const formattedMessage = this.formatMessage(logLevels.INFO, message);
        this.log(formattedMessage);
    }

    error(message: string, error?: Error): void {
        let formattedMessage = this.formatMessage(logLevels.ERROR, message);
        if (error) {
            formattedMessage += `\n${error.stack || error.message}`;
        }
        this.log(formattedMessage);
    }

    warning(message: string): void {
        const formattedMessage = this.formatMessage(logLevels.WARNING, message);
        this.log(formattedMessage);
    }

    debug(message: string): void {
        const formattedMessage = this.formatMessage(logLevels.DEBUG, message);
        this.log(formattedMessage);
    }

    private log(message: string): void {
        const logLevel = typeof this.consoleOutput === 'string' ?
            logLevels[this.consoleOutput] : this.consoleOutput;

        // Extract the level from the message for comparison
        const levelMatch = message.match(/\[\d{4}-\d{2}-\d{2}.*?\] \[([A-Z]+)\]/);
        const messageLevel = levelMatch ? logLevels[levelMatch[1]] : logLevels.INFO;

        // Log to console if message level is >= configured console level
        if (messageLevel >= logLevel) {
            console.log(message);
        }
        fs.appendFileSync(this.logFilePath, message + '\n');
    }
}

// Set the console output level to display all messages by default
const logger = new Logger('db-update.log', 'INFO');

// Define the BusinessListing interface to match the JSON structure
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

// Database connection functions
async function openDatabaseConnection(): Promise<pkg.Pool> {
    logger.info(`Opening database connection to ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

    const dbConfig = {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
        user: process.env.DB_USER || process.env.DB_NAME || 'doadmin',
        password: process.env.DB_PASSWORD,
        ssl: {
            rejectUnauthorized: false
        }
    };

    // Log connection details with password masked
    const maskedConfig = {...dbConfig, password: '*'.repeat(dbConfig.password?.length || 0)};
    logger.info(`Database config: ${JSON.stringify(maskedConfig)}`);

    return new Pool(dbConfig);
}

// Function to execute and log SQL queries
async function executeQuery(pool: pkg.Pool, query: string, values: any[] = [], description?: string): Promise<any> {
    if (description) {
        logger.info(`Executing: ${description}`);
    }

    // For logging, mask any sensitive values
    const maskedValues = values.map(val =>
        typeof val === 'string' && val.includes('@') ? 'EMAIL_MASKED' : val
    );

    logger.debug(`SQL: ${query}`);
    logger.debug(`Parameters: ${JSON.stringify(maskedValues)}`);

    try {
        const result = await pool.query(query, values);
        logger.debug(`Query completed: ${result.rowCount} rows affected`);
        return result;
    } catch (error) {
        logger.error(`Query failed: ${description || query}`, error as Error);
        throw error;
    }
}

// Function to update the database with business listings from a JSON file
async function updateDatabaseFromJson(pool: pkg.Pool, filePath: string): Promise<void> {
    logger.info(`Processing file: ${filePath}`);

    try {
        // Read and parse the JSON file
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(fileContent);

        const zipCode = jsonData.zipCode;
        const businesses = jsonData.businesses;

        logger.info(`Found ${businesses.length} businesses for zip code ${zipCode}`);

        // Process each business in the file
        for (const business of businesses) {
            const {
                businessName,
                address,
                city,
                state,
                postalCode,
                phone,
                website,
                email
            } = business;

            if (!businessName) {
                logger.warning(`Skipping business with no name in zip code ${zipCode}`);
                continue;
            }

            logger.info(`Processing business: ${businessName}`);

            // Insert or update business in the database
            const query = `
                INSERT INTO businesses(
                    business_name,
                    address,
                    city,
                    state,
                    postal_code,
                    phone,
                    website,
                    email,
                    scrape_date
                ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (business_name, postal_code)
                DO UPDATE SET
                    address = $2,
                    city = $3,
                    state = $4,
                    phone = $6,
                    website = $7,
                    email = $8,
                    scrape_date = $9
            `;

            const values = [
                businessName || '',
                address || 'Unknown',
                city || '',
                state || '',
                postalCode || '',
                phone || '',
                website || '',
                email || '',
                new Date().toISOString()
            ];

            await executeQuery(pool, query, values, `Inserting/updating ${businessName}`);
            logger.info(`Successfully updated/inserted business: ${businessName}`);
        }

        // Move processed file to a 'processed' directory
        const processedDir = path.join(path.dirname(filePath), 'processed');
        if (!fs.existsSync(processedDir)) {
            fs.mkdirSync(processedDir, { recursive: true });
        }

        const fileName = path.basename(filePath);
        const newPath = path.join(processedDir, fileName);
        fs.renameSync(filePath, newPath);
        logger.info(`Moved ${fileName} to processed directory`);

    } catch (error) {
        logger.error(`Error processing file ${filePath}`, error as Error);
        // Continue with next file rather than stopping the entire process
    }
}

// Main function
async function main(): Promise<void> {
    logger.info('Starting database update process');

    let pool: pkg.Pool | null = null;
    try {
        // Establish database connection
        pool = await openDatabaseConnection();
        // Check for the 'businesses' table
        const tableQuery = `
            CREATE TABLE IF NOT EXISTS businesses (
                id SERIAL PRIMARY KEY,
                business_name VARCHAR(255) NOT NULL,
                address VARCHAR(255) NOT NULL,
                city VARCHAR(255) NOT NULL,
                state VARCHAR(255) NOT NULL,
                postal_code VARCHAR(10) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                website VARCHAR(255),
                email VARCHAR(255),
                scrape_date TIMESTAMP NOT NULL,
                UNIQUE(business_name, postal_code)
            )
        `;

        await executeQuery(pool, tableQuery, [], 'Checking for businesses table');

        // Get list of all JSON files in the output/json directory
        const outputDir = path.join(process.cwd(), 'output', 'json');
        if (!fs.existsSync(outputDir)) {
            logger.warning(`Output directory ${outputDir} does not exist, creating it`);
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Get all *listings_*.json files (not just updated_listings_*.json)
        const files = fs.readdirSync(outputDir)
            .filter((file: any) => file.includes('listings_') && file.endsWith('.json') && !file.startsWith('processed'))
            .map((file: any) => path.join(outputDir, file));

        logger.info(`Found ${files.length} listings files to process`);

        // Process each file
        for (const file of files) {
            await updateDatabaseFromJson(pool, file);
        }

        logger.info('All files processed successfully');

    } catch (error) {
        logger.error('Failed to update database', error as Error);
    } finally {
        // Clean up resources
        if (pool) {
            await pool.end();
            logger.info('Database connection closed');
        }

        logger.info('Database update process completed');
    }
}

// Run the main function
main().catch(error => {
    logger.error('Unhandled error in main function', error as Error);
    process.exit(1);
});