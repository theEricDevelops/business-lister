import pkg from 'pg';
const { Pool, PoolClient } = pkg;
import { Browser, BrowserContext, Page, launch } from 'puppeteer';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

let pool: InstanceType<typeof Pool>;

// Load the .env file into process.env
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

async function waitFor(page: Page, duration: number = 1000, timeout: number = 30000): Promise<void> {
    const start = Date.now();
    let lastMutationTime = start;

    await page.evaluate((duration: number) => {
        (window as any)._lastMutationTime = Date.now();

        const observer = new MutationObserver(() => {
            (window as any)._lastMutationTime = Date.now();
        });

        observer.observe(document.documentElement, {
            attributes: true,
            childList: true,
            subtree: true,
            characterData: true
        });

        (window as any)._mutationObserver = observer;
    }, duration);

    while (Date.now() - start < timeout) {
        await new Promise(resolve => setTimeout(resolve, 100));

        lastMutationTime = await page.evaluate(() => (window as any)._lastMutationTime);

        if (Date.now() - lastMutationTime >= duration) {
            await page.evaluate(() => {
                if ((window as any)._mutationObserver) {
                    (window as any)._mutationObserver.disconnect();
                    delete (window as any)._mutationObserver;
                    delete (window as any)._lastMutationTime;
                }
            });
            return;
        }
    }

    await page.evaluate(() => {
        if ((window as any)._mutationObserver) {
            (window as any)._mutationObserver.disconnect();
            delete (window as any)._mutationObserver;
            delete (window as any)._lastMutationTime;
        }
    });

    throw new Error('Timeout');
}

// Create a function that opens the database connection based on the .env file
// This function will be called in the main function to open the connection
// and then close it after the main function has completed
async function openDatabaseConnection(): Promise<void> {
    pool = new Pool({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
        user: process.env.DB_NAME || 'doadmin',
        password: process.env.DB_PASSWORD,
        ssl: {
            rejectUnauthorized: false
        }
    });

    console.log('Opening database connection...');

    try {
        const client: InstanceType<typeof PoolClient> = await pool.connect();
        console.log('Database connection opened');
        return client;
    } catch (error) {
        console.error('Error opening database connection:', error);
        throw error;
    }
}

async function closeDatabaseConnection(): Promise<void> {
    if(pool) {
        console.log('Closing database connection pool...');
        await pool.end();
        console.log('Database connection pool closed');
    }
}

async function checkForTable(client: InstanceType<typeof PoolClient>, table: string): Promise<void> {
    console.log(`Checking for table ${table}...`);

    try {
        await client.query(
            `CREATE TABLE IF NOT EXISTS ${table} (
                id SERIAL PRIMARY KEY,
                business_name VARCHAR(255) NOT NULL,
                address VARCHAR(255) NOT NULL,
                city VARCHAR(255) NOT NULL,
                state VARCHAR(255) NOT NULL,
                postal_code VARCHAR(10) NOT NULL,
                phone VARCHAR(15) NOT NULL,
                website VARCHAR(255),
                email VARCHAR(255),
                scrape_date TIMESTAMP NOT NULL,
                UNIQUE(business_name, postal_code)
            )`
        );

        console.log(`Table ${table} exists or was created successfully`);
    } catch (error) {
        console.error(`Error creating table ${table}:`, error);
        throw error;
    }
}

(async (): Promise<void> => {
    let dbClient: InstanceType<typeof PoolClient> | null = null;
    const browser: Browser = await launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--incognito'
        ]
    });

    const context: BrowserContext = await browser.createBrowserContext({
        downloadBehavior: { policy: 'deny' }
    });

    context.overridePermissions('https://iicrcnetforum.bullseyelocations.com', ['geolocation']);

    const page: Page = await context.newPage();

    // Read the ziplist/covering_zipcodes.json file and parse it for zip codes
    /* It's in the format: [
        {
            "zip": "17201",
            "location": "Chambersburg, PA",
            "coordinates": [
            39.9313,
            -77.6579
            ]
        },
        {
            "zip": "47948",
            "location": "Goodland, IN",
            "coordinates": [
            40.7669,
            -87.2999
            ]
        }]*/

    const zipCodes: string[] = JSON.parse(fs.readFileSync('ziplist/covering_zipcodes.json', 'utf8'));


    try {
        dbClient = await openDatabaseConnection();
        checkForTable(dbClient, 'businesses');

        await page.evaluateOnNewDocument(() => {
            const mockGeolocation = {
                getCurrentPosition: (success: PositionCallback, error?: PositionErrorCallback) => {
                    success({
                        coords: {
                            latitude: -33.9249,
                            longitude: 18.4241,
                            accuracy: 10,
                            altitude: null,
                            altitudeAccuracy: null,
                            heading: null,
                            speed: null
                        },
                        timestamp: Date.now()
                    } as GeolocationPosition);
                    if (error) {
                        error({
                            code: 1,
                            message: 'User denied Geolocation'
                        } as GeolocationPositionError);
                    }
                },
                watchPosition: (success: PositionCallback, error?: PositionErrorCallback) => {
                    success({
                        coords: {
                            latitude: -33.9249,
                            longitude: 18.4241,
                            accuracy: 10,
                            altitude: null,
                            altitudeAccuracy: null,
                            heading: null,
                            speed: null
                        },
                        timestamp: Date.now()
                    } as GeolocationPosition);
                    if (error) {
                        error({
                            code: 1,
                            message: 'User denied Geolocation'
                        } as GeolocationPositionError);
                    }
                    return 0;
                },
                clearWatch: () => {}
            };

            Object.defineProperty(navigator, 'geolocation', {
                value: mockGeolocation,
                configurable: true
            });

            Object.defineProperty(Intl, 'DateTimeFormat', {
                value: function() {
                    return {
                        resolvedOptions: () => ({
                            timeZone: 'Africa/Johannesburg',
                            hour12: true,
                            locale: 'en-US'
                        })
                    };
                },
                writable: true
            });
        });

        await page.setGeolocation({ latitude: -33.9249, longitude: 18.4241 });

        const screenrecorder = await page.screencast({
            path: 'screencasts/screenrecorder.webm'
        });

        await page.goto('https://iicrcnetforum.bullseyelocations.com/pages/iicrc-netforum?f=1', {
            waitUntil: 'networkidle2'
        });

        await waitFor(page, 2000, 30000);

        await page.waitForSelector('select[id="ContentPlaceHolder1_radiusList"]');
        await page.select('select[id="ContentPlaceHolder1_radiusList"]', '250');

        await waitFor(page, 2000, 30000);

        await page.waitForSelector('input[id="txtCityStateZip"]', {visible: true});
        await page.locator('input[id="txtCityStateZip"]').click({clickCount: 3});
        await page.keyboard.press('Backspace');
        await page.type('input[id="txtCityStateZip"]', '32566', {delay: 100});

        await page.waitForSelector('input[id="ContentPlaceHolder1_searchButton2"]',
            {visible: true}
        );
        await page.click('input[id="ContentPlaceHolder1_searchButton2"]');

        await page.waitForNavigation({
            waitUntil: 'networkidle2'
        }).catch(() => {});

        await waitFor(page, 2000, 30000);

        await page.screenshot({
            path: 'screenshots/search-results.png',
            fullPage: true
        });

        const listings = await page.$$('div.resultsDetails');

        if (listings.length === 0) {
            console.log('No listings found');
            await page.screenshot({path: 'screenshots/no-listings-found.png'});
        } else {
            console.log(`Found ${listings.length} listings`);
            let listingsData: BusinessListing[] = [];

            for (const listing of listings) {
                const businessName = await listing.$eval('h3[itemprop="name"]', (el: Element) => el.textContent?.trim());
                const address = await listing.$eval('address span[itemprop="streetAddress"]', (el: Element) => el.textContent?.trim());
                const city = await listing.$eval('address span[itemprop="addressLocality"]', (el: Element) => el.textContent?.trim());
                const state = await listing.$eval('address span[itemprop="addressRegion"]', (el: Element) => el.textContent?.trim());
                const postalCode = await listing.$eval('address span[itemprop="postalCode"]', (el: Element) => el.textContent?.trim());
                const phone = await listing.$eval('span[itemprop="telephone"]', (el: Element) => {
                    const phoneText = el.textContent?.trim() || '';
                    // Extract only the digits from the phone number
                    const digits = phoneText.replace(/\D/g, '');
                    // If US number with country code (11 digits starting with 1), remove the 1
                    if (digits.length === 11 && digits.startsWith('1')) {
                        return digits.substring(1);
                    }
                    // Return just the digits (should be 10 for US numbers)
                    return digits;
                });
                const website = await listing.$eval('a#website', (el: Element) => {
                    const href = el.getAttribute('href')?.trim() || '';
                    // Normalize URL to ensure it has a protocol
                    if (!href) return '';
                    try {
                        // Use URL constructor to parse and normalize the URL
                        const url = new URL(href, 'https://example.com');
                        // Return the full URL with protocol
                        return url.protocol.startsWith('http') ? url.toString() : `https://${href}`;
                    } catch (e) {
                        // If URL is invalid, try adding https:// prefix
                        return href.match(/^https?:\/\//) ? href : `https://${href}`;
                    }
                });
                const email = await listing.$eval('a#emailContact', (el: Element) => {
                    const href = el.getAttribute('href')?.trim() || '';
                    return href.startsWith('mailto:') ? href.substring(7) : href;
                });

                await dbClient.query(
                    `INSERT INTO businesses(
                        business_name,
                        address,
                        city,
                        state,
                        postal_code,
                        phone,
                        website,
                        email,
                        scrape_date
                    ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9,
                     [
                        businessName,
                        address,
                        city,
                        state,
                        postalCode,
                        phone,
                        website,
                        email,
                        new Date().toISOString()
                    ])`
                );
                console.log(`Inserted ${businessName} into the database`);

                // Log to console
                console.log('Business Name:', businessName);
                console.log('Address:', address);
                console.log('City:', city);
                console.log('State:', state);
                console.log('Postal Code:', postalCode);
                console.log('Phone:', phone);
                console.log('Website:', website);
                console.log('Email:', email);
                console.log('--------------------------------------');

                // Create business object for JSON
                const businessData: BusinessListing = {
                    businessName: businessName || '',
                    address: address || '',
                    city: city || '',
                    state: state || '',
                    postalCode: postalCode || '',
                    phone: phone || '',
                    website: website || '',
                    email: email || ''
                };

                // Add to listings array for JSON file
                listingsData.push(businessData);

                // Append to text file
                const txtEntry = `Business Name: ${businessName || 'N/A'}\n` +
                    `Address: ${address || 'N/A'}\n` +
                    `City: ${city || 'N/A'}\n` +
                    `State: ${state || 'N/A'}\n` +
                    `Postal Code: ${postalCode || 'N/A'}\n` +
                    `Phone: ${phone || 'N/A'}\n` +
                    `Website: ${website || 'N/A'}\n` +
                    `Email: ${email || 'N/A'}\n` +
                    '--------------------------------------\n';

                // Append to txt file
                fs.appendFileSync('listings.txt', txtEntry);
            }

            const jsonOutput = {
                businesses: listingsData,
                count: listingsData.length,
                scrapeDate: new Date().toISOString()
            }

            // Save all listings to JSON file
            fs.writeFileSync('listings.json', JSON.stringify(jsonOutput, null, 2));
            console.log(`Saved ${listingsData.length} listings to listings.json and listings.txt`);
        }

        await screenrecorder.stop();
        await page.close();
    } catch (error) {
        console.error("An error occurred: ", error);
    } finally {
        if (dbClient) {
            await dbClient.release();
            await closeDatabaseConnection();
        }

        await browser.close();
    }
})();