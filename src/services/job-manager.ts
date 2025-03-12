import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { ZipCodeJob, JobStatus, ScrapedEntry } from '../types';
import { createLogger, readJsonFile } from '../utils';
import { JobQueue } from './queue';
import { Scraper } from '../scripts/scrape.js';

const logger = createLogger('JobManager');

/**
 * Service to manage scraping jobs for zip codes
 */
export class JobManager {
  private jobQueue: JobQueue;
  
  constructor() {
    this.jobQueue = JobQueue.getInstance();
  }
  
  async registerJobProcessors(): Promise<void> {
    this.jobQueue.processJobs('scrape', async (job) => {
      const { zipCode, location } = job.data as ZipCodeJob;

      try {
        const scraper = new Scraper({
          headless: true,
          timeout: 30000
        });

        await scraper.initialize();
        const results = await scraper.run(zipCode, location);
        await scraper.close();

        return { success: true, results };
      } catch (error: Error) {
        logger.error(`Error processing job for zip code ${zipCode}: ${error.message}`);
        throw error;
      }
    });

    logger.info('Job processors registered');
  }

  async addScrapingJob(zipCode: string, location: string): Promise<string> {
    return this.jobQueue.addJob('scrape', { zipCode, location });
  }