import * as fs from 'fs';
import * as path from 'path';

interface ZipCodeCoverage {
  zip: string;
  location: string;
  coordinates: [number, number]; // [latitude, longitude]
}

/**
 * Generates a KML file with circles representing zip code coverage, referencing US boundaries
 */
function generateSimpleCoverageKML(coverageData: ZipCodeCoverage[], usBoundariesKmlPath: string, radiusMiles: number = 250): string {
  // Convert miles to kilometers for KML
  const radiusKm = radiusMiles * 1.60934;
  
  // Get the filename only from the path for the NetworkLink
  const boundaryFilename = path.basename(usBoundariesKmlPath);
  
  // KML Header with NetworkLink to US boundaries
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>US Zip Code Coverage (${radiusMiles}-mile radius)</name>
  <description>Coverage map of the United States using ${coverageData.length} zip codes with ${radiusMiles}-mile radius</description>
  
  <!-- Reference to US Boundaries KML -->
  <NetworkLink>
    <name>US Boundaries</name>
    <Link>
      <href>${boundaryFilename}</href>
    </Link>
  </NetworkLink>
  
  <!-- Style for the circles -->
  <Style id="coverageCircle">
    <LineStyle>
      <color>8000FFFF</color>
      <width>2</width>
    </LineStyle>
    <PolyStyle>
      <color>4000FFFF</color>
      <outline>1</outline>
    </PolyStyle>
  </Style>`;
  
  // Add each zip code as a circle placemark
  coverageData.forEach((zipData, index) => {
    // NOTE: KML uses longitude,latitude order (opposite of our stored coordinates)
    const [lat, lon] = zipData.coordinates;
    
    kml += `
  <Placemark>
    <name>${zipData.zip} - ${zipData.location}</name>
    <description>Coverage area for zip code ${zipData.zip} (${zipData.location})</description>
    <styleUrl>#coverageCircle</styleUrl>
    <!-- Draw circle with 36 points -->
    <Polygon>
      <extrude>1</extrude>
      <altitudeMode>relativeToGround</altitudeMode>
      <outerBoundaryIs>
        <LinearRing>
          <coordinates>`;
          
    // Create a circle by calculating 36 points around the center
    for (let i = 0; i <= 36; i++) {
      const angle = i * 10 * Math.PI / 180; // 10 degrees per step
      // Calculate lat/lon for each point on the circle
      const latRadians = lat * Math.PI / 180;
      const angularDistance = radiusKm / 6371; // Earth radius in km
      
      const pointLat = Math.asin(Math.sin(latRadians) * Math.cos(angularDistance) + 
                      Math.cos(latRadians) * Math.sin(angularDistance) * Math.cos(angle));
      const pointLon = lon * Math.PI / 180 + 
                      Math.atan2(Math.sin(angle) * Math.sin(angularDistance) * Math.cos(latRadians),
                                Math.cos(angularDistance) - Math.sin(latRadians) * Math.sin(pointLat));
      
      // Convert back to degrees and add to KML
      const pointLatDeg = pointLat * 180 / Math.PI;
      const pointLonDeg = pointLon * 180 / Math.PI;
      
      kml += `\n              ${pointLonDeg},${pointLatDeg},100`; // 100m height
    }
    
    kml += `
          </coordinates>
        </LinearRing>
      </outerBoundaryIs>
    </Polygon>
    <!-- Center marker -->
    <Point>
      <coordinates>${lon},${lat},0</coordinates>
    </Point>
  </Placemark>`;
  });
  
  // KML Footer
  kml += `
</Document>
</kml>`;

  return kml;
}

/**
 * Main function to read the JSON data and create KML
 */
function main() {
  try {
    // Read the coverage data JSON
    const jsonPath = path.resolve(process.cwd(), 'covering_zipcodes.json');
    if (!fs.existsSync(jsonPath)) {
      console.error(`Coverage data not found at: ${jsonPath}`);
      return;
    }
    
    const jsonData = fs.readFileSync(jsonPath, 'utf8');
    const coverageData: ZipCodeCoverage[] = JSON.parse(jsonData);
    
    console.log(`Generating KML for ${coverageData.length} zip codes...`);
    
    // Path to US boundaries KML
    const usBoundariesPath = path.resolve(process.cwd(), 'cb_2023_us_nation_5m.kml');
    if (!fs.existsSync(usBoundariesPath)) {
      console.error(`US boundaries KML file not found: ${usBoundariesPath}`);
      return;
    }
    
    // Generate KML with coverage circles, referencing the US boundaries KML
    const kml = generateSimpleCoverageKML(coverageData, usBoundariesPath);
    
    // Save KML file
    const kmlPath = path.resolve(process.cwd(), 'us_zip_coverage.kml');
    fs.writeFileSync(kmlPath, kml);
    
    console.log(`KML file saved to: ${kmlPath}`);
    console.log('You can open this file with Google Earth or upload to Google My Maps');
    console.log('Note: Make sure to keep both KML files in the same directory when viewing');
  } catch (error) {
    console.error('Error creating KML:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
  }
}

main();