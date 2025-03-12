/**
 * Describes the status of a job during its lifecycle
 */
export type JobStatus = 
  'pending' | 
  'scraping' | 
  'verifying' |
  'processing' |
  'deduplicating' |
  'merging' |
  'completed' | 
  'failed';

/**
 * Represents a job for processing a zip code
 */
export interface ZipCodeJob {
  zip: string;
  location?: string;
  status: JobStatus;
  coordinates?: [number, number];
  error?: string;
  startTime?: Date;
  endTime?: Date;
}

/**
 * Configuration for job processing
 */
export interface JobConfig {
  maxConcurrentJobs: number;
}
