import * as fs from 'fs';
import * as cheerio from 'cheerio';
import axios from 'axios';

// Define interfaces for the JSON structure
interface Business {
    businessName: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    phone: string;
    website: string;
    email: string;
}

interface BusinessData {
    zipCode: string;
    location: string;
    businesses: Business[];
    count: number;
    scrapeDate: string;
}

// Function to validate URL
function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

// Function to extract email from website content
async function findEmailOnWebsite(website: string): Promise<string | null> {
    try {
        // Skip invalid or placeholder URLs
        if (!isValidUrl(website) || website === 'https://n/A') {
            return null;
        }

        const response = await axios.get(website, {
            timeout: 5000, // 5 second timeout
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const bodyText = $('body').text();
        
        // Simple email regex - might need refinement based on your needs
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        const match = bodyText.match(emailRegex);
        
        return match ? match[0] : null;
    } catch (error: any) {
        console.error(`Error fetching ${website}:`, error.message);
        return null;
    }
}

// Main function to process the JSON file
async function processBusinessData(filePath: string, zipCode: string): Promise<void> {
    console.log(`Processing data for zip code: ${zipCode}`);
    try {
        // Read and parse JSON file
        const rawData = fs.readFileSync(filePath, 'utf-8');
        const data: BusinessData = JSON.parse(rawData);

        // Filter businesses with website but no email
        const targetBusinesses = data.businesses.filter(business => 
            business.website.trim() !== '' && 
            business.email.trim() === ''
        );

        console.log(`Found ${targetBusinesses.length} businesses with websites but no emails`);

        // Process each business
        const updatedBusinesses: Business[] = [];
        for (const business of targetBusinesses) {
            console.log(`Processing: ${business.businessName} - ${business.website}`);
            
            const foundEmail = await findEmailOnWebsite(business.website);
            
            if (foundEmail) {
                console.log(`Found email: ${foundEmail}`);
                updatedBusinesses.push({
                    ...business,
                    email: foundEmail
                });
            } else {
                console.log('No email found');
                updatedBusinesses.push(business);
            }

            // Add delay between requests to avoid overwhelming servers
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Create updated data object
        const updatedData: BusinessData = {
            ...data,
            businesses: data.businesses.map(business => {
                const updated = updatedBusinesses.find(ub => 
                    ub.businessName === business.businessName &&
                    ub.website === business.website
                );
                return updated || business;
            })
        };

        // Save updated JSON
        fs.writeFileSync(
            `./output/json/updated_listings_${zipCode}.json`,
            JSON.stringify(updatedData, null, 2),
            'utf-8'
        );
        
        console.log('Updated data saved to updated_businesses.json');

    } catch (error: any) {
        console.error('Error processing data:', error.message);
    }
}

// Get the zip codes from the files in the ./output/json/ directory
const files: string[] = fs.readdirSync('./output/json/');
const zipCodes = files.map(file => file.replace('.json', '').replace('listings_', ''));
console.log('Found zip codes:', zipCodes);

// Iterate over each zip code and process the data
for (const zipCode of zipCodes) {
    processBusinessData(`./output/json/listings_${zipCode}.json`, zipCode)
        .then(() => console.log(`Processing for ${zipCode} complete`))
        .catch(error => console.error(`Error processing ${zipCode}:`, error));
}