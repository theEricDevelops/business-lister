export interface BusinessListing {
  businessName: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  website: string;
  email: string;
}

export interface ListingsFile {
  zipCode: string;
  location: string;
  businesses: BusinessListing[];
  count: number;
  scrapeDate: string;
}

export interface ScrapedEntry {
  id?: number;
  name: string;
  address: string;
  phone?: string;
  zipCode: string;
  // Add other relevant fields
}

export interface ZipCodeCsvRow {
  [key: string]: string | undefined;
}
