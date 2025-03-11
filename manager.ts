import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

interface ScrapedEntry {
  id?: number;
  name: string;
  address: string;
  phone?: string;
  zipCode: string;
  // Add other relevant fields
}

// Enhanced job status to include detailed processing phases
type JobStatus = 
  'pending' | 
  'scraping' | 
  'verifying' |
  'processing' |
  'deduplicating' |
  'merging' |
  'completed' | 
  'failed';

interface ZipCodeJob {
  zip: string;
  location: string;
  coordinates: [number, number];
  status: JobStatus;
  error?: string;
  startTime?: Date;
  endTime?: Date;
}

class JobManager {
  private jobs: ZipCodeJob[] = [];
  private activeJobs = 0;
  private maxConcurrentJobs: number;
  private completedCount = 0;
  private failedCount = 0;
  private allListings: ScrapedEntry[] = [];
  
  constructor(maxConcurrentJobs = 3) {
    this.maxConcurrentJobs = maxConcurrentJobs;
    
    // Load existing listings if available
    if (fs.existsSync('./listings.json')) {
      try {
        this.allListings = JSON.parse(fs.readFileSync('./listings.json', 'utf-8'));
        console.log(`Loaded ${this.allListings.length} existing listings`);
      } catch (error) {
        console.error('Error loading existing listings:', error);
        this.allListings = [];
      }
    }
  }
  
  loadJobsFromFile(filePath: string): void {
    try {
      const jsonData = fs.readFileSync(filePath, 'utf-8');
      const zipCodes = JSON.parse(jsonData);
      
      if (!Array.isArray(zipCodes)) {
        throw new Error('Invalid ZIP code data format: expected array');
      }
      
      this.jobs = zipCodes.map(item => ({
        zip: item.zip,
        location: item.location,
        coordinates: item.coordinates,
        status: 'pending'
      }));
      
      console.log(`Loaded ${this.jobs.length} ZIP codes to process`);
    } catch (error) {
      console.error(`Failed to load ZIP codes from ${filePath}:`, error);
      process.exit(1);
    }
  }
  
  async start(): Promise<void> {
    console.log(`Starting job manager with max ${this.maxConcurrentJobs} concurrent jobs`);
    
    // Initial batch of jobs
    while (this.activeJobs < this.maxConcurrentJobs && this.getNextPendingJob()) {
      await this.startNextJob();
    }
    
    // Wait for all jobs to complete
    while (this.activeJobs > 0 || this.getNextPendingJob()) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Status update every 10 seconds
      if (Date.now() % 10000 < 1000) {
        this.printStatus();
      }
    }
    
    this.finalize();
  }
  
  private getNextPendingJob(): ZipCodeJob | null {
    const pendingJob = this.jobs.find(job => job.status === 'pending');
    return pendingJob || null;
  }
  
  private async startNextJob(): Promise<void> {
    const job = this.getNextPendingJob();
    if (!job) return;
    
    job.status = 'scraping';
    job.startTime = new Date();
    this.activeJobs++;
    
    console.log(`[${new Date().toISOString()}] Starting job for ZIP: ${job.zip} (${job.location})`);
    
    // Process the job asynchronously
    this.processJob(job).then(() => {
      job.status = 'completed';
      job.endTime = new Date();
      this.completedCount++;
      this.activeJobs--;
      
      const duration = job.endTime.getTime() - job.startTime!.getTime();
      console.log(`[${new Date().toISOString()}] Completed job for ZIP: ${job.zip} (took ${Math.round(duration/1000)} seconds)`);
      
      // Start next job if available
      this.startNextJob();
    }).catch(error => {
      job.status = 'failed';
      job.error = error.message;
      job.endTime = new Date();
      this.failedCount++;
      this.activeJobs--;
      console.error(`[${new Date().toISOString()}] Failed job for ZIP: ${job.zip}`, error);
      
      // Start next job if available
      this.startNextJob();
    });
  }
  
  private async processJob(job: ZipCodeJob): Promise<void> {
    try {
      await this.runVerification(job);
    } catch (error) {
      console.error(`Error processing job ${job.zip}:`, error);
      throw error;
    }
  }
  
  private async runVerification(job: ZipCodeJob): Promise<void> {
    const zipCode = job.zip;
    console.log(`Starting verification for zip code: ${zipCode}`);
    
    // Step 1: Run the scraper
    job.status = 'scraping';
    console.log(`[${zipCode}] Running scraper...`);
    const scrapeResult = spawnSync('tsx', ['scrape.ts', zipCode], { 
      stdio: 'inherit',
      encoding: 'utf-8'
    });
    
    if (scrapeResult.status !== 0) {
      console.error(`[${zipCode}] Scraper failed to run`);
      throw new Error(`Scraper process exited with code ${scrapeResult.status}`);
    }
    
    // Step 2: Verify JSON output exists
    job.status = 'verifying';
    console.log(`[${zipCode}] Verifying output...`);
    const jsonFilePath = `./listings_${zipCode}.json`;
    if (!fs.existsSync(jsonFilePath)) {
      throw new Error(`JSON file not found: ${jsonFilePath}`);
    }
    
    // Step 3: Parse JSON data
    job.status = 'processing';
    console.log(`[${zipCode}] Processing JSON data...`);
    const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8')) as ScrapedEntry[];
    console.log(`[${zipCode}] Found ${jsonData.length} entries in JSON file`);
    
    if (jsonData.length === 0) {
      console.warn(`Warning: No entries found in JSON file for ${zipCode}`);
      return;
    }
    
    // Step 4: Check for duplicates in the JSON data
    job.status = 'deduplicating';
    console.log(`[${zipCode}] Checking for duplicates...`);
    const nameAddressMap = new Map<string, number>();
    const duplicates: ScrapedEntry[] = [];
    
    jsonData.forEach(entry => {
      const key = `${entry.name}|${entry.address}`;
      if (nameAddressMap.has(key)) {
        duplicates.push(entry);
      } else {
        nameAddressMap.set(key, 1);
      }
    });
    
    if (duplicates.length > 0) {
      console.error(`[${zipCode}] Found ${duplicates.length} duplicate entries in JSON data`);
      // Continue processing but log the issue
    }
    
    // Step 5: Merge with main listings, avoiding duplicates
    job.status = 'merging';
    console.log(`[${zipCode}] Merging with main listings...`);
    const newEntries: ScrapedEntry[] = [];
    
    jsonData.forEach(entry => {
      const isDuplicate = this.allListings.some(existingEntry => 
        existingEntry.name === entry.name && 
        existingEntry.address === entry.address && 
        existingEntry.zipCode === entry.zipCode
      );
      
      if (!isDuplicate) {
        newEntries.push(entry);
      }
    });
    
    // Add new entries to the master list
    if (newEntries.length > 0) {
      this.allListings = [...this.allListings, ...newEntries];
      console.log(`[${zipCode}] Added ${newEntries.length} new entries to master listing`);
      
      // Save updated master listings
      fs.writeFileSync('./listings.json', JSON.stringify(this.allListings, null, 2));
    }
    
    console.log(`[${zipCode}] Verification completed successfully!`);
    console.log(`- ${jsonData.length} entries in JSON file`);
    console.log(`- ${newEntries.length} new unique entries added to master list`);
  }
  
  private printStatus(): void {
    // Group jobs by status for a more detailed report
    const statusCounts: Record<JobStatus, number> = {
      pending: 0,
      scraping: 0,
      verifying: 0,
      processing: 0,
      deduplicating: 0,
      merging: 0,
      completed: 0,
      failed: 0
    };
    
    this.jobs.forEach(job => {
      statusCounts[job.status]++;
    });
    
    console.log('\n--- JOB MANAGER STATUS ---');
    console.log(`Total Jobs: ${this.jobs.length}`);
    console.log('By Status:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      if (count > 0) {
        console.log(`  - ${status}: ${count}`);
      }
    });
    
    // Show currently processing jobs with their detailed status
    const processingJobs = this.jobs.filter(job => 
      ['scraping', 'verifying', 'processing', 'deduplicating', 'merging'].includes(job.status)
    );
    
    if (processingJobs.length > 0) {
      console.log('Currently Processing:');
      processingJobs.forEach(job => {
        const duration = new Date().getTime() - (job.startTime?.getTime() || new Date().getTime());
        console.log(`  - ${job.zip} (${job.location}): ${job.status} (${Math.round(duration/1000)}s)`);
      });
    }
    
    console.log(`Total Listings: ${this.allListings.length}`);
    console.log('-------------------------\n');
  }
  
  private finalize(): void {
    console.log('\n=== JOB MANAGER COMPLETE ===');
    console.log(`Processed ${this.jobs.length} ZIP codes`);
    console.log(`Successful: ${this.completedCount}`);
    console.log(`Failed: ${this.failedCount}`);
    console.log(`Total unique listings: ${this.allListings.length}`);
    
    // Calculate some statistics
    const successfulJobs = this.jobs.filter(job => job.status === 'completed' && job.startTime && job.endTime);
    let avgProcessingTime = 0;
    
    if (successfulJobs.length > 0) {
      const totalTime = successfulJobs.reduce((sum, job) => 
        sum + (job.endTime!.getTime() - job.startTime!.getTime()), 0);
      avgProcessingTime = totalTime / successfulJobs.length / 1000; // in seconds
      
      console.log(`Average processing time: ${avgProcessingTime.toFixed(2)} seconds per ZIP code`);
    }
    
    // Write final report
    const reportData = {
      timestamp: new Date().toISOString(),
      jobsProcessed: this.jobs.length,
      successful: this.completedCount,
      failed: this.failedCount,
      totalListings: this.allListings.length,
      avgProcessingTimeSeconds: avgProcessingTime,
      failedJobs: this.jobs.filter(job => job.status === 'failed').map(job => ({
        zip: job.zip,
        location: job.location,
        error: job.error
      }))
    };
    
    fs.writeFileSync('./job_report.json', JSON.stringify(reportData, null, 2));
    console.log('Final report saved to job_report.json');
  }
}

// Main execution
async function main() {
  // Get max concurrent jobs from command line or default to 3
  const maxConcurrentJobs = process.argv[2] ? parseInt(process.argv[2]) : 3;
  
  const jobManager = new JobManager(maxConcurrentJobs);
  const zipCodesPath = path.resolve(process.cwd(), 'ziplist/covering_zipcodes.json');
  
  if (!fs.existsSync(zipCodesPath)) {
    console.error(`ZIP codes file not found: ${zipCodesPath}`);
    process.exit(1);
  }
  
  jobManager.loadJobsFromFile(zipCodesPath);
  await jobManager.start();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});