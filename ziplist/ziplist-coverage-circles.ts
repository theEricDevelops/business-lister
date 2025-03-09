import * as fs from 'fs';
import * as path from 'path';

interface ZipCodeCoverage {
  zip: string;
  location: string;
  coordinates: [number, number]; // [latitude, longitude]
}

/**
 * Generates a KML file with circles representing zip code coverage
 */
function generateCircleCoverageKML(coverageData: ZipCodeCoverage[], radiusMiles: number = 250): string {
  // Convert miles to kilometers for KML
  const radiusKm = radiusMiles * 1.60934;
  
  // KML Header with required namespaces
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document>
  <name>US Zip Code Coverage (${radiusMiles}-mile radius)</name>
  <description>Coverage map of the United States using ${coverageData.length} zip codes with ${radiusMiles}-mile radius</description>
  
  <!-- Styles for the circles and center points -->
  <Style id="centerPointStyle">
    <IconStyle>
      <scale>0.8</scale>
      <Icon>
        <href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href>
      </Icon>
    </IconStyle>
    <LabelStyle>
      <scale>0.8</scale>
    </LabelStyle>
  </Style>
  
  <Style id="circleStyle">
    <LineStyle>
      <color>7f0000ff</color>
      <width>2</width>
    </LineStyle>
    <PolyStyle>
      <color>3f0000ff</color>
      <fill>1</fill>
      <outline>1</outline>
    </PolyStyle>
  </Style>
  
  <Folder>
    <name>Coverage Circles (${radiusMiles}-mile radius)</name>`;
  
  // Add each zip code with its radius as a circle
  coverageData.forEach((zipData) => {
    const [lat, lon] = zipData.coordinates;
    
    kml += `
    <Placemark>
      <name>${zipData.zip} - ${zipData.location}</name>
      <description>Coverage radius: ${radiusMiles} miles (${radiusKm.toFixed(2)} km)</description>
      <styleUrl>#centerPointStyle</styleUrl>
      <Point>
        <coordinates>${lon},${lat},0</coordinates>
      </Point>
    </Placemark>
    
    <Placemark>
      <name>${zipData.zip} coverage area</name>
      <description>Coverage area for ${zipData.zip} (${zipData.location})</description>
      <styleUrl>#circleStyle</styleUrl>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>`;
    
    // Create circle with 72 points (5-degree intervals)
    for (let i = 0; i <= 72; i++) {
      const bearing = i * 5; // 5-degree intervals
      const circlePoint = calculateDestinationPoint(lat, lon, radiusKm, bearing);
      kml += `${circlePoint[1]},${circlePoint[0]},0 `;
    }
    
    kml += `</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`;
  });
  
  // Add US boundary as a Network Link
  kml += `
  </Folder>
</Document>
</kml>`;

  return kml;
}

/**
 * Calculate destination point given starting point, distance and bearing
 * Uses Haversine formula for more accurate circle generation
 * @param lat Starting latitude in degrees
 * @param lon Starting longitude in degrees
 * @param distance Distance in kilometers
 * @param bearing Bearing in degrees (0 = north, 90 = east, etc.)
 * @returns [lat, lon] of destination point
 */
function calculateDestinationPoint(lat: number, lon: number, distance: number, bearing: number): [number, number] {
  const R = 6371; // Earth's radius in km
  
  const bearingRad = bearing * Math.PI / 180;
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;
  
  const distRatio = distance / R;
  const sinDistRatio = Math.sin(distRatio);
  const cosDistRatio = Math.cos(distRatio);
  
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  
  const newLatRad = Math.asin(sinLat * cosDistRatio + cosLat * sinDistRatio * Math.cos(bearingRad));
  const newLonRad = lonRad + Math.atan2(
    Math.sin(bearingRad) * sinDistRatio * cosLat,
    cosDistRatio - sinLat * Math.sin(newLatRad)
  );
  
  // Convert back to degrees
  const newLat = newLatRad * 180 / Math.PI;
  const newLon = newLonRad * 180 / Math.PI;
  
  return [newLat, newLon];
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
    
    console.log(`Generating KML for ${coverageData.length} zip codes with radius circles...`);
    
    // Generate KML with proper radius circles
    const kml = generateCircleCoverageKML(coverageData);
    
    // Save KML file
    const kmlPath = path.resolve(process.cwd(), 'us_zip_coverage_circles.kml');
    fs.writeFileSync(kmlPath, kml);
    
    console.log(`KML file saved to: ${kmlPath}`);
    console.log('You can open this file with Google Earth or upload to Google My Maps');
    console.log('Note: Make sure the US boundaries KML file is in the same directory');
  } catch (error) {
    console.error('Error creating KML:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
  }
}

main();