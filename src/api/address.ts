import express from 'express';
import { uspsService } from '../services/usps';
import { getDatabase } from '../services/database';
import { createLogger } from '../services/frontend-logger';
import { BusinessListing } from '../types/business';

const router = express.Router();
const logger = createLogger('logs/address-api.log');
const db = getDatabase();

/**
 * Verify a business address using USPS API
 */
router.post('/verify/:id', async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`Verifying address for business ID: ${id}`);
    
    // Get the business from database
    const businesses = await db.query(
      `SELECT * FROM businesses WHERE id = $1`,
      [id]
    );
    
    if (!businesses || businesses.length === 0) {
      logger.warning(`Business with ID ${id} not found`);
      return res.status(404).json({ success: false, message: 'Business not found' });
    }
    const business = businesses[0] as BusinessListing;
    
    // Verify the address
    const result = await uspsService.verifyBusinessAddress(business);
    
    if (result.success) {
      // Update the database with verified address
      const updatedBusiness = result.business;
      
      // Log the business object before database update for debugging
      logger.info(`Business object before update: ${JSON.stringify(updatedBusiness)}`);
      
      // Check if the USPS data is nested in 'address' property
      // This handles cases where the mapping wasn't done in the service
      if (updatedBusiness.address && typeof updatedBusiness.address === 'object' && 'streetAddress' in updatedBusiness.address) {
        logger.info('Detected nested USPS response structure, mapping fields');
        const addressData = updatedBusiness.address as any;
        
        // Map the nested fields to the top-level business object
        updatedBusiness.address = addressData.streetAddress || '';
        updatedBusiness.city = addressData.city || '';
        updatedBusiness.state = addressData.state || '';
        updatedBusiness.postalcode = addressData.ZIPCode || '';
        updatedBusiness.zipCodePlus4 = addressData.ZIPPlus4 || '';
        
        logger.info(`Mapped business object: ${JSON.stringify(updatedBusiness)}`);
      }
      
      // Make sure we don't update with blank values
      const addressToUpdate = updatedBusiness.address || business.address;
      const cityToUpdate = updatedBusiness.city || business.city;
      const stateToUpdate = updatedBusiness.state || business.state;
      const postalcodeToUpdate = updatedBusiness.postalcode || business.postalcode;
      const zipCodePlus4ToUpdate = updatedBusiness.zipCodePlus4 || business.zipCodePlus4;
      
      await db.query(
        `UPDATE businesses 
         SET address = $1, city = $2, state = $3, postalcode = $4, zipCodePlus4 = $5, updated_at = NOW()
         WHERE id = $6`,
        [
          addressToUpdate,
          cityToUpdate,
          stateToUpdate,
          postalcodeToUpdate,
          zipCodePlus4ToUpdate || null,
          id
        ]
      );
      
      logger.info(`Successfully verified and updated address for business ID: ${id}`);
      
      // Return the updated business
      res.json({
        success: true,
        message: 'Address verified and updated successfully',
        business: updatedBusiness
      });
    } else {
      logger.warning(`Address verification failed for business ID: ${id} - ${result.message}`);
      res.status(200).json({ 
        success: false,
        message: result.message,
        business: business
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    logger.error(`Error verifying address: ${errorMessage}`, error);
    res.status(500).json({ success: false, message: 'Error verifying address' });
  }
});

/**
 * Verify address without updating business (for testing)
 */
router.post('/test-verify', async (req, res) => {
  try {
    const { address, city, state, zipCode } = req.body;
    
    if (!address || !city || !state || !zipCode) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required address fields' 
      });
    }
    
    const result = await uspsService.verifyAddress(address, city, state, zipCode);
    res.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    logger.error(`Error testing address verification: ${errorMessage}`, error);
    res.status(500).json({ success: false, message: 'Error verifying address' });
  }
});

export default router;