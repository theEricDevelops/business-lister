import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { ScrapedEntry, JobStatus, ZipCodeJob } from '../types';

export class JobManager {
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
      const zipCodes = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      this.jobs = zipCodes.map((zip: any) => ({
        zip: zip.zipCode,
        location: zip.city + ', ' + zip.state,
        coordinates: [parseFloat(zip.longitude), parseFloat(zip.latitude)],
        status: 'pending'
      }));
      console.log(`Loaded ${this.jobs.length} ZIP codes from ${filePath}`);
    } catch (error) {
      console.error(`Error loading ZIP codes from ${filePath}:`, error);
      process.exit(1);
    }
  }
  
  async start(): Promise<void> {
    console.log(`Starting job manager with ${this.maxConcurrentJobs} concurrent jobs`);
    
    // Start interval for status updates
    const statusInterval = setInterval(() => this.printStatus(), 10000);
    
    // Start initial batch of jobs
    for (let i = 0; i < this.maxConcurrentJobs; i++) {
      await this.startNextJob();
    }
    
    // Check if all jobs are completed or failed
    const checkCompletion = setInterval(() => {
      if (this.activeJobs === 0 && this.completedCount + this.failedCount === this.jobs.length) {
        clearInterval(statusInterval);
        clearInterval(checkCompletion);
        this.finalize();
      }
    }, 1000);
  }
  
  private getNextPendingJob(): ZipCodeJob | null {
    return this.jobs.find(job => job.status === 'pending') || null;
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
    const scrapeResult = spawnSync('tsx', ['src/scrapers/scrape.ts', zipCode], { 
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
    const jsonFilePath = `./data/listings_${zipCode}.json`;
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
    
    console.log(`[${zipCode}] Found ${duplicates.length} duplicates in JSON data`);
    
    // Step 5: Merge with master list
    job.status = 'merging';
    console.log(`[${zipCode}] Merging with master list...`);
    const uniqueEntries = jsonData.filter(entry => !duplicates.includes(entry));
    
    // Check against master list to avoid duplicates across ZIP codes
    let newEntries = 0;
    uniqueEntries.forEach(entry => {
      const key = `${entry.name}|${entry.address}`;
      const exists = this.allListings.some(existing => 
        `${existing.name}|${existing.address}` === key
      );
      
      if (!exists) {
        this.allListings.push(entry);
        newEntries++;
      }
    });
    
    console.log(`[${zipCode}] Added ${newEntries} new entries to master list`);
    
    // Write updated master list to disk periodically
    fs.writeFileSync('./listings.json', JSON.stringify(this.allListings, null, 2));
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
    
    fs.writeFileSync('./data/job_report.json', JSON.stringify(reportData, null, 2));
    console.log('Final report saved to job_report.json');
  }
}
