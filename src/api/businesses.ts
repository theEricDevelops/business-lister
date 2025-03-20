import express from 'express';
import { getDatabase } from '../services/database';
import Logger from '../utils/logger';

const router = express.Router();
const logger = new Logger('businesses-api.log');
const db = getDatabase();

// Get all businesses
router.get('/', async (req, res) => {
  try {
    const businesses = await db.getBusinesses();
    logger.info(`Returning ${businesses.length} businesses`);
    res.json(businesses);
  } catch (error) {
    logger.error('Failed to fetch businesses', error as Error);
    res.status(500).json({ error: 'Failed to fetch businesses' });
  }
});

// Get business by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`Fetching business with ID: ${id}`);
    
    const business = await db.getBusinessById(parseInt(id));
    
    if (!business) {
      logger.warning(`Business with ID ${id} not found`);
      return res.status(404).json({ error: 'Business not found' });
    }
    
    res.json(business);
  } catch (error) {
    logger.error(`Failed to fetch business with ID: ${req.params.id}`, error as Error);
    res.status(500).json({ error: 'Failed to fetch business' });
  }
});

export default router;