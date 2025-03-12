import pkg from 'pg';
const { Pool, PoolClient } = pkg;
import { Browser, BrowserContext, ElementHandle, Page, launch } from 'puppeteer';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { BusinessListing, Source } from '../types';
import { Logger } from '../utils/logger';

const logger = Logger('Scrape');

// Main execution for this script
export class Scraper {
    private browser: Browser | null;
    private context: BrowserContext | null;
    private defaultArgs: string[] = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--incognito',
        '--disable-features=IsolateOrigins,site-per-process',
    ]

    constructor(browserOptions: Record<string, any> = {}) {
        this.browser = await launch({
            headless: browserOptions.headless ?? true,
            args: browserOptions.args ?? this.defaultArgs,
        });
        logger.info('Creating browser context');
        this.context = await this.browser.createBrowserContext({
            downloadBehavior: { policy: 'deny' }
        });

        this.context.overridePermissions('https://iicrcnetforum.bullseyelocations.com', ['geolocation']);
    }
    
    async run(): Promise<void> {
        logger.info(`Starting scraping job for zip code: ${this.zipCode}`);


    try {

        logger.info('Opening new page');
        const page: Page = await context.newPage();

        // Example: Search for businesses in this zip code on a business directory site
        // You would customize this URL and extraction logic based on your target site
        await page.goto(`https://example-business-directory.com/search?zip=${zipCode}`);
        
        logger.info('Extracting business listings');
        
        // Extract business information (simplified example)
        const businesses = await page.evaluate(() => {
            const listings = document.querySelectorAll('.business-listing');
            
            return Array.from(listings).map(listing => {
                return {
                    businessName: listing.querySelector('.business-name')?.textContent?.trim() || 'Unknown',
                    address: listing.querySelector('.business-address')?.textContent?.trim() || 'Unknown',
                    city: listing.querySelector('.business-city')?.textContent?.trim() || 'Unknown',
                    state: listing.querySelector('.business-state')?.textContent?.trim() || 'Unknown',
                    postalCode: listing.querySelector('.business-postal')?.textContent?.trim() || 'Unknown',
                    phone: listing.querySelector('.business-phone')?.textContent?.trim() || 'Unknown',
                    website: listing.querySelector('.business-website')?.getAttribute('href') || '',
                    email: listing.querySelector('.business-email')?.textContent?.trim() || ''
                };
            });
        });
        
        // Create directory if it doesn't exist
        const outputDir = path.resolve(process.cwd(), 'data', 'businesses');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Save the results
        const outputFile = path.join(outputDir, `${zipCode}.json`);
        fs.writeFileSync(outputFile, JSON.stringify(businesses, null, 2));
        
        logger.info(`Successfully scraped ${businesses.length} businesses for zip code: ${zipCode}`);
        logger.info(`Data saved to: ${outputFile}`);

        process.exit(0);
    } catch (error) {
        logger.error(`Error scraping businesses for zip code ${zipCode}`, error as Error);
        process.exit(1);
    } finally {
        if (this.browser) {
            logger.info('Closing browser');
            await this.browser.close();
        }
    }
}