import express from 'express';
import { syncDatabaseFromJsonFiles, checkDatabaseEmpty, getSyncProgress } from '../services/database-sync';
import Logger from '../utils/logger';

const router = express.Router();
const logger = new Logger('sync-api.log');

// Check if sync is needed
router.get('/status', async (req, res) => {
  try {
    const isEmpty = await checkDatabaseEmpty();
    res.json({ syncNeeded: isEmpty });
  } catch (error) {
    logger.error('Error checking sync status', error as Error);
    res.status(500).json({ error: 'Failed to check sync status' });
  }
});

// Check sync progress
router.get('/progress', async (req, res) => {
  try {
    const progress = await getSyncProgress();
    res.json(progress);
  } catch (error) {
    logger.error('Error checking sync progress', error as Error);
    res.status(500).json({ error: 'Failed to check sync progress' });
  }
});

// Trigger database sync
router.post('/', async (req, res) => {
  try {
    logger.info('Database sync requested');
    const result = await syncDatabaseFromJsonFiles();
    logger.info(`Sync completed: ${result.count} businesses from ${result.zipCodes.length} zip codes`);
    res.json({ 
      success: true, 
      message: `Synced ${result.count} businesses from ${result.zipCodes.length} zip codes`,
      businessCount: result.count,
      zipCodeCount: result.zipCodes.length
    });
  } catch (error) {
    logger.error('Sync failed', error as Error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

export default router;