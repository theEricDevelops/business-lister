import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';

interface ZipCode {
  zip: string;
  latitude: number;
  longitude: number;
  placeName: string;
  state: string;
}

// Based on the sample data, we know the column names
interface ZipCodeCsvRow {
    [key: string]: string | undefined;
}

/**
 * Calculate distance between two points in kilometers using the Haversine formula
 */
function haversine(lon1: number, lat1: number, lon2: number, lat2: number): number {
  // Convert decimal degrees to radians
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  lon1 = toRadians(lon1);
  lat1 = toRadians(lat1);
  lon2 = toRadians(lon2);
  lat2 = toRadians(lat2);

  // Haversine formula
  const dlon = lon2 - lon1;
  const dlat = lat2 - lat1;
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
  const c = 2 * Math.asin(Math.sqrt(a));

  // Radius of Earth in kilometers
  const r = 6371;
  return c * r;
}

/**
 * Parse CSV data using a more robust custom CSV Parser
 */
function parseCSV(csvData: string): ZipCodeCsvRow[] {
  // Split into lines but handle potential issues with line endings
  const lines = csvData.split(/\r?\n/);
  
  // Check if we have data
  if (lines.length === 0) {
    console.error("CSV data is empty or malformed");
    return [];
  }
  
  // Log the first few lines for debugging
  console.log("First line of CSV:");
  console.log(lines[0]);
  
  if (lines.length > 1) {
    console.log("Second line of CSV (sample data):");
    console.log(lines[1]);
  }
  
  // Get headers, trim whitespace
  const headers = lines[0].split(',').map(h => h.trim());
  console.log("Parsed headers:", headers);
  
  const results: ZipCodeCsvRow[] = [];

  // Process data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines
    
    // Split the line by comma
    const values = line.split(',');
    
    // Ensure we have same number of values as headers
    if (values.length !== headers.length) {
      console.warn(`Line ${i} has ${values.length} values but expected ${headers.length}. Skipping.`);
      continue;
    }

    const row: ZipCodeCsvRow = {};
    
    // Create object with header keys and row values
    headers.forEach((header, index) => {
      row[header] = values[index] ? values[index].trim() : undefined;
    });

    results.push(row);
  }

  console.log(`Parsed ${results.length} rows from CSV`);
  if (results.length > 0) {
    console.log("Sample row after parsing:", results[0]);
  }

  return results;
}

/**
 * Process zip code data from a ZIP archive
 */
function processZipArchive(zipFilePath: string): ZipCode[] {
  console.log(`Processing ZIP archive: ${zipFilePath}`);

  // Check if the file exists
  if (!fs.existsSync(zipFilePath)) {
    throw new Error(`ZIP file not found: ${zipFilePath}`);
  }

  try {
    // Read the ZIP file
    const zip = new AdmZip(zipFilePath);
    const zipEntries = zip.getEntries();

    console.log(`Found ${zipEntries.length} entries in ZIP file`);

    // Find a CSV file in the ZIP
    const csvEntry = zipEntries.find((entry): boolean =>
      entry.entryName.endsWith('.csv') || entry.entryName.endsWith('.CSV')
    );

    if (!csvEntry) {
      throw new Error('No CSV file found in the ZIP archive');
    }

    console.log(`Found CSV file: ${csvEntry.entryName}`);

    // Extract and read the CSV file
    const csvData = csvEntry.getData().toString('utf8');
    
    // Check data size
    console.log(`CSV data size: ${csvData.length} bytes`);
    
    // Parse CSV data
    const results = parseCSV(csvData);

    // Check if we have any data
    if (results.length === 0) {
      console.error("No data rows were parsed from the CSV");
      return [];
    }

    // Now use these exact column names from your sample
    console.log("Filtering zip codes...");
    const allZipCodes: ZipCode[] = results
        .filter((item: ZipCodeCsvRow): boolean => {
            const hasRequiredData = !!item['postal code'] && 
                                    !!item['latitude'] && 
                                    !!item['longitude'] && 
                                    item['country code'] === 'US';
            
            if (!hasRequiredData) {
                // Log a few failed entries to debug
                if (Math.random() < 0.01) { // Log approximately 1% of failures
                    console.log("Rejected row:", item);
                }
            }
            
            return hasRequiredData;
        })
        .map((item: ZipCodeCsvRow): ZipCode => ({
            zip: String(item['postal code']),
            latitude: parseFloat(item['latitude'] as string),
            longitude: parseFloat(item['longitude'] as string),
            placeName: String(item['place name'] || ''),
            state: String(item['admin code1'] || '')
        }))
        .filter((item: ZipCode): boolean => !isNaN(item.latitude) && !isNaN(item.longitude));

    // Filter out military zip codes (APO/FPO)
    console.log("Filtering military zip codes...");
    const isNonMilitaryZip = (zip: ZipCode) =>
      !zip.zip.startsWith('09') &&
      !zip.zip.startsWith('34') &&
      !zip.zip.startsWith('96') &&
      !(zip.placeName || '').includes('APO') &&
      !(zip.placeName || '').includes('FPO');

    const nonMilitaryZips = allZipCodes.filter(isNonMilitaryZip);

    // Create separate list of military zip codes for reference
    const militaryZips = allZipCodes.filter(zip => !isNonMilitaryZip(zip));

    console.log(`Extracted ${allZipCodes.length} valid US zip codes with coordinates`);
    console.log(`  - ${nonMilitaryZips.length} regular zip codes`);
    console.log(`  - ${militaryZips.length} military/diplomatic zip codes (filtered out)`);

    // Save military zip codes to a separate file for reference
    fs.writeFileSync('military_zipcodes.json', JSON.stringify(militaryZips, null, 2));

    // Sample regular zip codes
    if (nonMilitaryZips.length > 0) {
      console.log('Sample regular zip codes:');
      nonMilitaryZips.slice(0, 3).forEach(zc => console.log(zc));
    } else {
      console.error("WARNING: No regular zip codes were found!");
    }

    return nonMilitaryZips;
  } catch (err) {
    console.error('Error processing ZIP file:', err);
    throw err;
  }
}

/**
 * Find a minimal set of zip codes that cover the entire US
 */
function findCoveringZipcodes(zipCodes: ZipCode[], radiusMiles: number = 250): ZipCode[] {
  // Convert miles to kilometers (1 mile = 1.60934 km)
  const radiusKm = radiusMiles * 1.60934;

  console.log(`Finding minimal coverage using ${zipCodes.length} zip codes and ${radiusMiles} mile radius (${radiusKm.toFixed(2)} km)`);

  // If no zip codes, return empty array
  if (zipCodes.length === 0) {
    console.warn("No zip codes to process!");
    return [];
  }

  // Create a copy of the zip codes array
  let remaining = [...zipCodes];
  const selected: ZipCode[] = [];

  while (remaining.length > 0) {
    // Choose a zip code that covers the most remaining points
    let maxCoverage = 0;
    let bestZipCode: ZipCode | null = null;

    // For performance, check a subset of zipcodes as potential centers
    // Adjust the sampling rate based on dataset size
    const step = Math.max(1, Math.floor(remaining.length / 1000));
    console.log(`Sampling every ${step}th zipcode from ${remaining.length} remaining`);

    for (let i = 0; i < remaining.length; i += step) {
      const zipCode = remaining[i];
      const centerLon = zipCode.longitude;
      const centerLat = zipCode.latitude;

      // Count how many points this zip code would cover
      let coverage = 0;
      for (const otherZip of remaining) {
        const distance = haversine(centerLon, centerLat, otherZip.longitude, otherZip.latitude);
        if (distance <= radiusKm) {
          coverage++;
        }
      }

      if (coverage > maxCoverage) {
        maxCoverage = coverage;
        bestZipCode = zipCode;
      }
    }

    // If we found a good zip code, add it to our selection
    if (bestZipCode) {
      selected.push(bestZipCode);
      console.log(`Selected ${bestZipCode.zip} (${bestZipCode.placeName}, ${bestZipCode.state}), covers ${maxCoverage} zip codes (${(maxCoverage/zipCodes.length*100).toFixed(2)}% of total)`);

      // Remove all covered zip codes from consideration
      const beforeLength = remaining.length;
      remaining = remaining.filter(zipCode => {
        const distance = haversine(
          bestZipCode!.longitude, bestZipCode!.latitude,
          zipCode.longitude, zipCode.latitude
        );
        return distance > radiusKm;
      });

      console.log(`Removed ${beforeLength - remaining.length} zip codes, ${remaining.length} remaining (${(remaining.length/zipCodes.length*100).toFixed(2)}% left)`);
    } else {
      console.log('No suitable zip code found, stopping');
      break;
    }
  }

  return selected;
}

/**
 * Main function
 */
function main() {
  try {
    // Path to the downloaded ZIP file
    const zipFilePath = path.resolve(process.cwd(), 'uszipcodes-20231227.zip');

    console.log(`Looking for ZIP file at: ${zipFilePath}`);

    // Process the ZIP file to get zip codes
    const zipCodes = processZipArchive(zipFilePath);

    console.log('Finding optimal covering set...');
    const coveringZipCodes = findCoveringZipcodes(zipCodes);

    console.log(`Found ${coveringZipCodes.length} zip codes that cover the continental US`);
    console.log('Saving results...');

    // Format results for output
    const formattedZipCodes = coveringZipCodes.map(zc => ({
      zip: zc.zip,
      location: `${zc.placeName}, ${zc.state}`,
      coordinates: [zc.latitude, zc.longitude]
    }));

    // Save the list of covering zip codes
    const outputPath = path.resolve(process.cwd(), 'covering_zipcodes.txt');
    fs.writeFileSync(outputPath,
      coveringZipCodes.map(zc => `${zc.zip} (${zc.placeName}, ${zc.state})`).join('\n')
    );

    // Also save as JSON for additional flexibility
    const jsonOutputPath = path.resolve(process.cwd(), 'covering_zipcodes.json');
    fs.writeFileSync(jsonOutputPath, JSON.stringify(formattedZipCodes, null, 2));

    console.log(`Results saved to: ${outputPath} and ${jsonOutputPath}`);
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
  }
}

// Run the program
main();