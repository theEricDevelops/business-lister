import * as dotenv from 'dotenv';
import { JobManager } from './services/job-manager';
import { createLogger } from './utils/logger';
import { JobQueue } from './services/queue';

// Load environment variables
dotenv.config();

const logger = createLogger('Main');

async function startup() {
  try {
    logger.info('Starting application');

    const jobQueue = JobQueue.getInstance();
    await jobQueue.start();

    const jobManager = new JobManager();
    await jobManager.registerJobProcessors();

    logger.info('Application started');
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Error starting application: ${error.message}`);
    } else {
      logger.error(`Error starting application: ${String(error)}`);
    }
    process.exit(1);
  }
}

startup().catch(logger.error);
