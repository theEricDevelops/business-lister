export interface BusinessListing {
  id: number;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  postalcode?: string;
  phone?: string;
  website?: string;
  email?: string;
  category?: string;
  source?: string;
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

export interface Filters {
  search: string;
  category: string;
  state: string;
  city: string;
  postalcode: string;
  hasEmail: boolean;
  hasPhone: boolean;
  hasWebsite: boolean;
}