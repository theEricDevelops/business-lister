export interface Source {
  /**
  Source Type

  Properties:
    - id: UUID - Unique identifier
    - name: string - Source name
    - type: SourceType - Source type (API, DIRECTORY, WEBSITE, CSV, MANUAL, PUPPETEER, OTHER)
    - url: string - External source url
    - apiKey: string - API key for external source
    - description: string - Source description
    - isActive: boolean - Source status
    - priority: number - Source priority
    - lastUpdated: Date - Last updated date
    - config: SourceConfig - Source configuration
   */
  id: string;
  name: string;
  type: SourceType;
  url?: string;
  apiKey?: string;
  description?: string;
  isActive: boolean;
  priority: number;
  lastUpdated?: Date;
  config?: SourceConfig;
}

export enum SourceType {
  API = 'API',
  CSV = 'CSV',
  MANUAL = 'MANUAL',
  SCRAPER = 'SCRAPER', 
  OTHER = 'OTHER',
}

export interface SourceConfig {
  // Common configuration options for sources
  rateLimit?: number;
  requestTimeout?: number;
  maxRetries?: number;
  // Scraper-specific configuration
  scraping?: {
    usesPuppeteer: boolean;
    headless?: boolean;
    waitForSelector?: string;
    navigationTimeout?: number;
    userAgent?: string;
    proxy?: string;
    // Selector map for data extraction
    selectors?: {
      businessName?: string;
      address?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      phone?: string;
      website?: string;
      email?: string;
      // Add any other business properties that might be extracted
      [key: string]: string | undefined;
    };
    
    // Special handling for certain fields (function names to be implemented)
    specialHandlers?: {
      phone?: string;
      website?: string;
      email?: string;
      // Add any other fields that need special handling
      [key: string]: string | undefined;
    };
  };
  // Add any other source-specific configuration options
  [key: string]: string | number | Record<string, any> | undefined;
}

// Example usage:
// const googleMapsSource: Source = {
//   id: 'google-maps',
//   name: 'Google Maps API',
//   type: SourceType.API,
//   url: 'https://maps.googleapis.com/maps/api',
//   apiKey: process.env.GOOGLE_MAPS_API_KEY,
//   description: 'Google Maps API for business location data',
//   isActive: true,
//   priority: 1,
//   config: {
//     region: 'us',
//     language: 'en'
//   }
// };
// 
// const iicrcDirectory: Source = {
//   id: 'iicrc-directory',
//   name: 'IICRC Directory',
//   type: SourceType.PUPPETEER,
//   url: 'https://www.iicrc.org/page/IICRCLocator',
//   description: 'IICRC certified professionals directory',
//   isActive: true,
//   priority: 2,
//   config: {
//     scraping: {
//       usesPuppeteer: true,
//       headless: true,
//       waitForSelector: '.directory-results',
//       navigationTimeout: 30000,
//       selectors: {
//         businessName: 'h3[itemprop="name"]',
//         address: 'address span[itemprop="streetAddress"]',
//         city: 'address span[itemprop="addressLocality"]',
//         state: 'address span[itemprop="addressRegion"]',
//         postalCode: 'address span[itemprop="postalCode"]',
//         phone: 'span[itemprop="telephone"]',
//         website: 'a#website',
//         email: 'a#emailContact'
//       },
//       specialHandlers: {
//         phone: "validatePhone",
//         website: "validateWebsite",
//         email: "validateEmail"
//       }
//     }
//   }
// };
