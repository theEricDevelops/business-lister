import pkg from 'pg';
const { Pool, PoolClient } = pkg;
import { Browser, BrowserContext, ElementHandle, Page, launch } from 'puppeteer';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Set up logging
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

    error(message: string, error?: Error): Error {
        let formattedMessage = this.formatMessage(logLevels.ERROR, message);
        if (error) {
            formattedMessage += `\n${error.stack || error.message}`;
        }
        this.log(formattedMessage);
        return Error(formattedMessage);
    }

    warning(message: string): void {
        const formattedMessage = this.formatMessage(logLevels.WARNING, message);
        this.log(formattedMessage);
    }

    debug(message: string): void {
        const formattedMessage = this.formatMessage(logLevels.DEBUG, message);
        debug_logger.log(formattedMessage);
    }

    pageError(message: string, error?: Error): void {
        let formattedMessage = this.formatMessage(logLevels.ERROR, `PAGE ERROR: ${message}`);
        if (error) {
            formattedMessage += `\n${error.stack || error.message}`;
        }
        // Write directly to file without console output
        fs.appendFileSync(this.logFilePath, formattedMessage + '\n');
    }

    private log(message: string): void {
        const logLevel = typeof this.consoleOutput === 'string' ? 
            logLevels[this.consoleOutput] : this.consoleOutput;
            
        // Extract the level from the message for comparison
        // Format is [timestamp] [LEVEL] message...
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
const logger = new Logger('iicrc-scrape.log', 'INFO');
const debug_logger = new Logger('iicrc-scrape-debug.log', 'INFO');

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
    logger.debug(`Waiting for page mutations to stop for ${duration}ms with a timeout of ${timeout}ms`);
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
            logger.debug('Page mutations stopped, continuing');
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

    logger.error('Wait for timeout occurred');
    throw new Error('Timeout');
}

async function openDatabaseConnection(): Promise<InstanceType<typeof PoolClient>> {
    logger.info(`Opening database connection to ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

    // Create DB connection pool with masked credentials for logging
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

    // Log connection details with password masked
    const maskedConfig = {...dbConfig, password: '*'.repeat(dbConfig.password?.length || 0)};
    logger.info(`Database config: ${JSON.stringify(maskedConfig)}`);

    pool = new Pool(dbConfig);

    try {
        const client = await pool.connect();
        logger.info('Database connection successfully established');
        return client;
    } catch (error) {
        logger.error('Failed to connect to database', error as Error);
        throw error;
    }
}

async function closeDatabaseConnection(): Promise<void> {
    if (pool) {
        logger.info('Closing database connection pool...');
        await pool.end();
        logger.info('Database connection pool closed');
    }
}

async function checkForTable(client: InstanceType<typeof PoolClient>, table: string): Promise<void> {
    logger.info(`Checking for table ${table}...`);

    try {
        const query = `
            CREATE TABLE IF NOT EXISTS ${table} (
                id SERIAL PRIMARY KEY,
                business_name VARCHAR(255) NOT NULL,
                address VARCHAR(255) NOT NULL,
                city VARCHAR(255) NOT NULL,
                state VARCHAR(255) NOT NULL,
                postal_code VARCHAR(5) NOT NULL,
                phone VARCHAR(10) NOT NULL,
                website VARCHAR(255),
                email VARCHAR(255),
                scrape_date TIMESTAMP NOT NULL,
                UNIQUE(business_name, postal_code)
            )
        `;

        logger.debug(`SQL: ${query}`);
        await client.query(query);
        logger.info(`Table ${table} exists or was created successfully`);
    } catch (error) {
        logger.error(`Error creating table ${table}`, error as Error);
        throw error;
    }
}

// Function to execute and log SQL queries
async function executeQuery(client: InstanceType<typeof PoolClient>, query: string, values: any[] = [], description?: string): Promise<any> {
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
        const result = await client.query(query, values);
        logger.debug(`Query completed: ${result.rowCount} rows affected`);
        return result;
    } catch (error) {
        logger.error(`Query failed: ${description || query}`, error as Error);
        throw error;
    }
}

// Add this to your existing code after creating the page
function setupNetworkIdleTracking(page: Page): void {
    let pendingRequests = 0;
    let networkIdleTimeout: NodeJS.Timeout | null = null;

    const updateNetworkIdle = () => {
        if (networkIdleTimeout) {
            clearTimeout(networkIdleTimeout);
            networkIdleTimeout = null;
        }

        if (pendingRequests === 0) {
            networkIdleTimeout = setTimeout(() => {
                logger.debug('Network became idle (no pending requests)');
                networkIdleTimeout = null;
            }, 500);
            
        }
    };

    page.on('request', () => {
        pendingRequests++;
        updateNetworkIdle();
    });

    page.on('requestfinished', () => {
        pendingRequests = Math.max(0, pendingRequests - 1);
        updateNetworkIdle();
    });

    page.on('requestfailed', () => {
        pendingRequests = Math.max(0, pendingRequests - 1);
        updateNetworkIdle();
    });
}

// Add this new function to set the geolocation based on zip code data
async function setGeolocationForZip(page: Page, zipData: any): Promise<void> {
    if (!zipData || !zipData.coordinates || zipData.coordinates.length !== 2) {
        logger.warning(`Invalid coordinate data for zip ${zipData?.zip || 'unknown'}, using default location`);
        await page.setGeolocation({ latitude: -33.9249, longitude: 18.4241 });
        return;
    }

    const [latitude, longitude] = zipData.coordinates;
    logger.info(`Setting geolocation to match zip ${zipData.zip}: ${latitude}, ${longitude} (${zipData.location})`);
    
    try {
        // Determine appropriate timezone based on coordinates
        // This is a simplified approach - for more accuracy you might want to use a timezone lookup library
        const timezone = getTimezoneFromCoordinates(latitude, longitude);
        
        // Set the geolocation in the browser
        await page.setGeolocation({ latitude, longitude });
        
        // Set the timezone via JavaScript in the page
        await page.evaluateOnNewDocument((timezone) => {
            // Override timezone
            Object.defineProperty(Intl, 'DateTimeFormat', {
                value: function() {
                    return {
                        resolvedOptions: () => ({
                            timeZone: timezone,
                            hour12: true,
                            locale: 'en-US'
                        })
                    };
                },
                writable: true
            });
        }, timezone);
        
        logger.info(`Set timezone to ${timezone}`);
    } catch (error) {
        logger.error(`Failed to set geolocation for zip ${zipData.zip}`, error as Error);
        throw error;
    }
}

// Helper function to determine timezone from coordinates
function getTimezoneFromCoordinates(latitude: number, longitude: number): string {
    // This is a simplified approach that uses longitude to guess the timezone
    // For more accuracy, you would use a proper timezone database lookup
    
    // Continental US timezones based on rough longitude boundaries
    if (longitude <= -67.0 && longitude >= -125.0 && latitude >= 24.0 && latitude <= 49.0) {
        if (longitude <= -67.0 && longitude >= -75.0) return 'America/New_York';       // Eastern
        if (longitude <= -75.0 && longitude >= -87.0) return 'America/Chicago';        // Central
        if (longitude <= -87.0 && longitude >= -105.0) return 'America/Denver';        // Mountain
        if (longitude <= -105.0 && longitude >= -125.0) return 'America/Los_Angeles';  // Pacific
    }
    
    // Alaska
    if (latitude >= 51.0 && latitude <= 72.0 && longitude >= -173.0 && longitude <= -130.0) {
        return 'America/Anchorage';
    }
    
    // Hawaii
    if (latitude >= 18.0 && latitude <= 23.0 && longitude >= -160.0 && longitude <= -154.0) {
        return 'Pacific/Honolulu';
    }
    
    // Default to Eastern time if we can't determine
    logger.warning(`Could not determine timezone for coordinates ${latitude}, ${longitude}, defaulting to Eastern`);
    return 'America/New_York';
}

// Updated function to add mock geolocation for a specific location
async function setupGeolocationMocking(page: Page, latitude: number, longitude: number): Promise<void> {
    logger.info(`Setting up geolocation mocking for coordinates: ${latitude}, ${longitude}`);
    
    await page.evaluateOnNewDocument((lat, lng) => {
        const mockGeolocation = {
            getCurrentPosition: (success: PositionCallback, error?: PositionErrorCallback) => {
                success({
                    coords: {
                        latitude: lat,
                        longitude: lng,
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
                        latitude: lat,
                        longitude: lng,
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
    }, latitude, longitude);
}

function setupPuppeteerLogging(page: Page): void {
    // Enable request interception to block Google Analytics
    page.setRequestInterception(true).catch(e => logger.error('Failed to set request interception', e));
    
    // Block Google Analytics requests without logging warnings
    page.on('request', (request) => {
        const url = request.url().toLowerCase();
        
        // Don't block the main page itself
        if (url === 'https://iicrcnetforum.bullseyelocations.com/pages/iicrc-netforum?f=1') {
            request.continue().catch(() => {});
            return;
        }
        
        // More comprehensive list of analytics domains to block
        if (url.includes('google-analytics') || 
            url.includes('analytics.google') || 
            url.includes('googletagmanager') ||
            url.includes('gtm.js') ||
            url.includes('ga.js') ||
            (url.includes('analytics') && !url.includes('iicrcnetforum')) ||
            url.includes('collect?v=')) {
            // Silently abort analytics requests without logging warnings
            request.abort('blockedbyclient').catch(() => {});
            return;
        }
        
        // Continue with non-analytics requests
        request.continue().catch(() => {});
    });

    // Log all console messages from the browser
    page.on('console', message => {
        const type = message.type().toUpperCase();
        const text = message.text();
        logger.debug(`Browser console [${type}]: ${text}`);
    });

    // Log all errors from the browser
    page.on('error', error => {
        logger.error('Browser error:', error);
    });

    // Log page errors to file only (not console)
    page.on('pageerror', error => {
        logger.pageError('Page JavaScript error', error as Error);
    });

    // Log request events
    page.on('request', (request) => {
        logger.debug(`Request started: ${request.method()} ${request.url()}`);
    });

    // Log response events
    page.on('response', (response) => {
        const status = response.status();
        const statusText = status >= 400 ? `⚠️ ${status}` : status;
        logger.debug(`Response received: ${statusText} for ${response.url()}`);
    });

    // Log request failures - but ignore blocked analytics requests
    page.on('requestfailed', request => {
        const url = request.url().toLowerCase();
        const errorText = request.failure()?.errorText || 'Unknown error';
        
        // Don't log warnings for analytics requests we intentionally blocked
        if ((url.includes('analytics') || url.includes('googletagmanager')) && 
            errorText.includes('ERR_BLOCKED_BY_CLIENT')) {
            return;
        }
        
        logger.warning(`Request failed: ${url} - ${errorText}`);
    });

    // Log navigation events
    page.on('framenavigated', frame => {
        if (frame === page.mainFrame()) {
            logger.info(`Navigation completed to: ${frame.url()}`);
        }
    });

    // Log dialog events (alerts, confirms, prompts)
    page.on('dialog', dialog => {
        logger.warning(`Dialog appeared: ${dialog.type()} with message: ${dialog.message()}`);
        // Automatically dismiss dialogs to prevent hanging
        dialog.dismiss().catch(e => logger.error('Failed to dismiss dialog', e));
    });

    setupNetworkIdleTracking(page);
}

// Monitor navigation progress
async function trackNavigation(page: Page, url: string, options?: any): Promise<void> {
    logger.info(`Navigating to: ${url}`);

    const navigationStart = Date.now();

    // Create a promise that will resolve when the load event fires
    const loadPromise = page.waitForNavigation({
        waitUntil: 'load',
        ...options
    }).catch(e => {
        logger.warning(`Load event timeout: ${e.message}`);
        return null;
    });

    // Create a promise that will resolve when the network is idle
    const networkIdlePromise = page.waitForNavigation({
        waitUntil: 'networkidle2',
        ...options
    }).catch(e => {
        logger.warning(`NetworkIdle2 timeout: ${e.message}`);
        return null;
    });

    // Create a promise that will resolve when the DOM content is loaded
    const domContentLoadedPromise = page.waitForNavigation({
        waitUntil: 'domcontentloaded',
        ...options
    }).catch(e => {
        logger.warning(`DOMContentLoaded timeout: ${e.message}`);
        return null;
    });

    // Start the navigation - using regular goto with networkidle2 (no 'commit')
    try {
        logger.debug('Starting navigation...');
        await page.goto(url, { waitUntil: 'networkidle2', ...options });
        logger.info('Initial navigation completed (networkidle2)');
    } catch (e) {
        logger.error(`Navigation failed: ${(e as Error).message}`);
        throw e;
    }

    try {
        // Wait for the load event to fire
        await loadPromise;
        logger.info(`Load event fired after ${Date.now() - navigationStart}ms`);

        // Wait for the network to be idle
        await networkIdlePromise;
        logger.info(`Network idle after ${Date.now() - navigationStart}ms`);

        logger.info(`Navigation to ${url} completed in ${Date.now() - navigationStart}ms`);
    } catch (error) {
        logger.warning(`Could not wait for all navigation events: ${(error as Error).message}`);
        // We still continue since the initial navigation succeeded
    }
}

// Track element interactions
async function trackClick(page: Page, selector: string, description: string = 'element'): Promise<void> {
    logger.info(`Clicking on ${description} (${selector})`);

    try {
        // Wait for the element to be visible
        await page.waitForSelector(selector, { visible: true });
        logger.debug(`${description} is now visible`);

        // Get element information before clicking
        const elementInfo = await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            if (!element) return null;

            const rect = element.getBoundingClientRect();
            return {
                tag: element.tagName,
                text: element.textContent?.trim().substring(0, 50) || '',
                visible: rect.width > 0 && rect.height > 0,
                position: {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                }
            };
        }, selector);

        if (elementInfo) {
            logger.debug(`Clicking ${elementInfo.tag} with text "${elementInfo.text}" at position (${elementInfo.position.x}, ${elementInfo.position.y})`);
        }

        // Perform the click
        await page.click(selector);
        logger.info(`Clicked on ${description} successfully`);
    } catch (error) {
        logger.error(`Failed to click on ${description}`, error as Error);

        // Take a screenshot to help debug the issue
        await page.screenshot({
            path: `screenshots/click-error-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
            fullPage: true
        });

        throw error;
    }
}

// Track form input
async function trackInput(page: Page, selector: string, value: string, description: string = 'input field'): Promise<void> {
    const displayValue = value.includes('@') ? '[EMAIL MASKED]' : value;
    logger.info(`Typing into ${description} (${selector}): ${displayValue}`);

    try {
        await page.waitForNetworkIdle();

        // Wait for the element to be visible
        await page.waitForSelector(selector, { visible: true });
        logger.debug(`${description} is now visible`);

        // Click to focus (with triple click to select all existing text)
        /*await page.click(selector, { clickCount: 3 });
        logger.debug(`Focused on ${description} and selected all text`);

        // Clear the field using keyboard shortcut
        await page.keyboard.press('Backspace');
        logger.debug(`Cleared ${description}`);

        // Type the value
        await page.type(selector, value, { delay: 100 });
        logger.info(`Typed value into ${description}`);*/

        await waitFor(page, 500, 30000);

        await page.locator(selector).fill(value)

        const inputBox = await page.$(selector);
        const inputValue = inputBox ? await (await inputBox.getProperty('value')).jsonValue() as string : '';

        if (inputValue === value) {
            logger.info(`Value successfully entered into ${description}`);

            await page.screenshot({ path: `screenshots/zip-entry-${value}.png`, fullPage: false });

        } else {
            logger.error(`Input value mismatch: expected ${value}, got ${inputValue}`);
            await page.screenshot({ path: `screenshots/input-mismatch-${new Date().toISOString().replace(/[:.]/g, '-')}.png`, fullPage: true });
        }
    } catch (error) {
        logger.error(`Failed to type into ${description}`, error as Error);

        // Take a screenshot to help debug the issue
        await page.screenshot({
            path: `screenshots/input-error-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
            fullPage: true
        });

        throw error;
    }
}

// Check page performance and stats
async function logPageMetrics(page: Page, description: string = 'Current page'): Promise<void> {
    try {
        const metrics = await page.metrics();
        const performanceTiming = await page.evaluate(() => JSON.stringify(performance.timing));

        logger.debug(`Page Metrics for ${description}:`);
        logger.debug(`- JS Heap Size: ${Math.round((metrics.JSHeapUsedSize ?? 0) / 1024 / 1024)}MB of ${Math.round((metrics.JSHeapTotalSize ?? 0) / 1024 / 1024)}MB`);
        logger.debug(`- DOM Nodes: ${metrics.Nodes}`);
        logger.debug(`- Documents: ${metrics.Documents}`);
        logger.debug(`- Performance Timing: ${performanceTiming}`);
    } catch (error) {
        logger.warning(`Failed to collect page metrics: ${(error as Error).message}`);
    }
}

function validatePhone(el: Element): string {
    const phoneData = el.getAttribute('data-content')?.trim() || '';
    const digits = phoneData.replace(/\D/g, '');

    if (digits.length == 11 && digits.startsWith('1')) {
        return digits.substring(1);
    } else if (digits.length !== 10) {
        logger.warning(`Invalid phone number: ${phoneData}`);
        return '';
    };

    return digits;
}

function validateWebsite(el: Element): string {
    const href = el.getAttribute('href')?.trim() || '';
    if (!href) return '';
    try {
        const url = new URL(href, 'https://example.com');
        return url.protocol.startsWith('http') ? url.toString() : `https://${href}`;
    } catch (e) {
        return href.match(/^https?:\/\//) ? href : `https://${href}`;
    }
}

function validateEmail(el: Element): string {
        const href = el.getAttribute('href')?.trim() || '';
        return href.startsWith('mailto:') ? href.substring(7) : href;
}

async function performSearch(page: Page, zipCode: string): Promise<void> {
    logger.info('Starting search');
    
    // Click the search button
    await trackClick(page, 'input[id="ContentPlaceHolder1_searchButton2"]', 'Search button');
    
    // Wait for search to complete using content selectors rather than navigation
    logger.info('Waiting for search results to load...');
    
    try {
        // Wait for at least one search result or no-results message
        await Promise.race([
            page.waitForSelector('div.resultsDetails', { timeout: 20000 }),
            page.waitForSelector('div.noResults', { timeout: 20000 })
        ]);
        
        logger.info('Search results detected');
        
        // Wait a bit longer for any pending resources
        await waitFor(page, 2000, 10000);
        
    } catch (error) {
        logger.warning(`Timed out waiting for search results: ${(error as Error).message}`);
        await page.screenshot({
            path: `screenshots/search-timeout-${zipCode}-${Date.now()}.png`,
            fullPage: true
        });
    }
    
    // One last wait for network to stabilize
    await page.waitForNetworkIdle({ idleTime: 2000, timeout: 5000 })
        .catch(() => logger.warning('Network never went fully idle after search'));
}

(async (): Promise<void> => {
    logger.info('Starting IICRC scraping job');
    let dbClient: InstanceType<typeof PoolClient> | null = null;
    let browser: Browser | null = null;

    try {
        logger.info('Launching browser');
        browser = await launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--incognito',
                '--disable-features=IsolateOrigins,site-per-process', // Needed for request interception
                '--disable-site-isolation-trials'
            ]
        });

        logger.info('Creating browser context');
        const context: BrowserContext = await browser.createBrowserContext({
            downloadBehavior: { policy: 'deny' }
        });

        context.overridePermissions('https://iicrcnetforum.bullseyelocations.com', ['geolocation']);

        
        // Read the ziplist file
        logger.info('Reading zip code list');
        const zipCodes = JSON.parse(fs.readFileSync('ziplist/covering_zipcodes.json', 'utf8'));
        logger.info(`Loaded ${zipCodes.length} zip codes`);

        // Connect to database
        logger.info('Connecting to database');
        dbClient = await openDatabaseConnection();
        await checkForTable(dbClient, 'businesses');
        
        let i = 0;
        while (i <= zipCodes.length) {
            const zipData = zipCodes[i];
            const zipCode = zipData.zip;
            
            logger.info(`===Processing zip code ${zipCode} (${zipData.location})===`);
            try {

            logger.info('Opening new page');
            const page: Page = await context.newPage();

            setupPuppeteerLogging(page);

            const [latitude, longitude] = zipData.coordinates;
            await setupGeolocationMocking(page, latitude, longitude);
            await page.setGeolocation({ latitude, longitude });

            logger.info(`Set geolocation to ${latitude}, ${longitude} for ${zipData.location}`);

            logger.info('Starting screen recording');
            const screenrecorder = await page.screencast({
                path: `screencasts/screenrecorder_${zipCode}.webm`
            });

            // Use the enhanced navigation function
            await trackNavigation(page, 'https://iicrcnetforum.bullseyelocations.com/pages/iicrc-netforum?f=1');
            await waitFor(page, 2000, 30000);

            // Log page metrics after navigation
            await logPageMetrics(page, `IICRC search page for ${zipCode}`);

            // Use enhanced input tracking
            await trackInput(
                page,
                'input[id="txtCityStateZip"]',
                zipCode,
                `Zip code input for ${zipCode}`
            );

            logger.info('Setting search radius to 250 miles');
            await page.waitForSelector('select[id="ContentPlaceHolder1_radiusList"]');
            await page.select('select[id="ContentPlaceHolder1_radiusList"]', '250');

            await waitFor(page, 2000, 30000);

            // Use enhanced search handling
            await performSearch(page, zipCode);

            // Log metrics after search results are loaded
            await logPageMetrics(page, `Search results for ${zipCode}`);

            logger.info(`Taking screenshot of search results for ${zipCode}`);
            await page.screenshot({
                path: `screenshots/search-results_${zipCode}_${Date.now()}.png`,
                fullPage: true
            });

            logger.info('Extracting business listings');
            const listings = await page.$$('div.resultsDetails');

            if (listings.length === 0) {
                logger.warning(`No listings found for ${zipCode}`);
                await page.screenshot({path: `screenshots/no-listings-found_${zipCode}.png`});
            } else {
                logger.info(`Found ${listings.length} listings`);
                let listingsData: BusinessListing[] = [];

                for (let j = 0; j < listings.length; j++) {
                    try {
                        const listing = listings[j];
                        logger.info(`Processing listing ${j+1} of ${listings.length}`);

                        // For each attr/prop of the BusinessListing object, extract the text content

                        // Initialize an empty BusinessListing object
                        const businessListing = {} as BusinessListing;

                        // Define selectors for each property
                        const selectors = {
                            businessName: 'h3[itemprop="name"]',
                            address: 'address span[itemprop="streetAddress"]',
                            city: 'address span[itemprop="addressLocality"]',
                            state: 'address span[itemprop="addressRegion"]',
                            postalCode: 'address span[itemprop="postalCode"]',
                            phone: 'span[itemprop="telephone"]',
                            website: 'a#website',
                            email: 'a#emailContact'
                        };

                        // Iterate through each property and extract its value
                        for (const [key, selector] of Object.entries(selectors)) {
                            try {
                                if (key === 'phone') {
                                    businessListing.phone = await listing.$eval(
                                        selector,
                                        (el) => {
                                            const phoneData = el.getAttribute('data-content')?.trim() || '';
                                            const digits = phoneData.replace(/\D/g, '');
                                            
                                            if (digits.length == 11 && digits.startsWith('1')) {
                                                return digits.substring(1);
                                            } else if (digits.length !== 10) {
                                                return '';
                                            }
                                            return digits;
                                        }
                                    );
                                } else if (key === 'website') {
                                    businessListing.website = await listing.$eval(
                                        selector,
                                        (el) => {
                                            const href = el.getAttribute('href')?.trim() || '';
                                            if (!href) return '';
                                            try {
                                                const url = new URL(href, 'https://example.com');
                                                return url.protocol.startsWith('http') ? url.toString() : `https://${href}`;
                                            } catch (e) {
                                                return href.match(/^https?:\/\//) ? href : `https://${href}`;
                                            }
                                        }
                                    );
                                } else if (key === 'email') {
                                    businessListing.email = await listing.$eval(
                                        selector,
                                        (el) => {
                                            const href = el.getAttribute('href')?.trim() || '';
                                            return href.startsWith('mailto:') ? href.substring(7) : href;
                                        }
                                    );
                                } else {
                                    businessListing[key as keyof BusinessListing] = await listing.$eval(
                                        selector,
                                        (el) => el.textContent?.trim() || ''
                                    );
                                }
                            } catch (e) {
                                logger.warning(`Could not extract ${key}: ${e}`);
                                // Keep the default value set in the initialization
                                businessListing[key as keyof BusinessListing] = businessListing[key as keyof BusinessListing] || '';
                            }
                        }

                        // Destructure the businessListing object for compatibility with the rest of the code
                        const { businessName, address, city, state, postalCode, phone, website, email } = businessListing;
                    
                        logger.info(`Found business: ${businessName} in ${city}, ${state}`);

                        try {
                            // Insert into database
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

                            await executeQuery(dbClient, query, values, `Inserting/updating ${businessName}`);
                            logger.info(`Inserted/updated business ${businessName} in database`);
                        } catch (dbError) {
                            logger.error(`Failed to insert/update business ${businessName} in database`, dbError as Error);
                            continue;
                        }

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
                        try {
                            fs.appendFileSync(`listings-${zipCode}.txt`, txtEntry);
                        } catch (listingError) {
                            logger.error(`Failed to write listing to text file:`, listingError as Error);
                        }
                    } catch (error) {
                        logger.error(`An error occurred while processing listing ${j+1} for ${zipCode}`, error as Error);
                        continue;
                    }
                }

                logger.info('Saving all listings to JSON file')
                const jsonOutput = {
                    zipCode,
                    location: zipData.location,
                    businesses: listingsData,
                    count: listingsData.length,
                    scrapeDate: new Date().toISOString()
                }

                // Save all listings to JSON file
                fs.writeFileSync(`listings_${zipCode}.json`, JSON.stringify(jsonOutput, null, 2));
                logger.info(`Saved ${listingsData.length} listings to listings_${zipCode}.json and listings-${zipCode}.txt`);
            }

            i++;

            logger.info('Stopping screen recording');
            await screenrecorder.stop();

            logger.info('Closing page');
            await page.close();
            i++;
        } catch (error) {
            logger.error(`An error occurred while processing zip code ${zipCode}`, error as Error);

            i++;

            logger.info('Waiting 5 seconds before trying the next zip code');
            await new Promise(resolve => setTimeout(resolve, 5000));
        } 
        }

    } catch (error) {
        logger.error("An error occurred during scraping", error as Error);
    } finally {
        logger.info('Cleanup phase');
        if (dbClient) {
            logger.info('Releasing database client');
            await dbClient.release();
            await closeDatabaseConnection();
        }

        browser?.close();
        logger.info('Scraping job completed');
    }
})();