import axios from 'axios';
import { BusinessListing } from '../types/business';
import { createLogger } from './frontend-logger';

const logger = createLogger('logs/usps-service.log');

// Updated interfaces for USPS REST API
interface USPSAuthResponse {
  access_token: string;
  token_type: string;
  issued_at: number;
  expires_in: number;
  status: string;
  scope: string;
  issuer: string;
  client_id: string;
  application_name: string;
  api_products: string;
  public_key: string;
}

interface USPSAddress {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  zipPlus4?: string;
}

interface USPSVerificationResult {
  originalAddress: USPSAddress;
  verifiedAddress?: USPSAddress;
  success: boolean;
  errorMessage?: string;
}

// USPS REST API service
class USPSService {
  private clientId: string;
  private clientSecret: string;
  private authResponse: USPSAuthResponse | null = null;
  private tokenExpiry: Date | null = null;

  constructor() {
    this.clientId = process.env.USPS_CLIENT_ID || '';
    this.clientSecret = process.env.USPS_CLIENT_SECRET || '';
    
    if (!this.clientId || !this.clientSecret) {
      logger.error('USPS API credentials not found in environment variables');
    }
  }

  /**
   * Get an authentication token from USPS API
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.authResponse && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.authResponse.access_token;
    }

    try {
      logger.info('Getting new USPS access token');
      
      // For debugging only
      console.log('Authenticating with USPS API');
    
      const tokenUrl = 'https://apis.usps.com/oauth2/v3/token';
      
      const response = await axios.post<USPSAuthResponse>(
        tokenUrl,
        {
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          scope: 'addresses'
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      // Store the complete auth response
      this.authResponse = response.data;
      
      // Set expiry
      const expiryTime = new Date();
      expiryTime.setSeconds(expiryTime.getSeconds() + response.data.expires_in - 60);
      this.tokenExpiry = expiryTime;
      
      logger.info('USPS access token obtained successfully');
      logger.info(`Token expires at: ${this.tokenExpiry.toISOString()}`);
      return this.authResponse.access_token;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error(`Failed to get USPS access token: ${error.message}`);
        if (error.response) {
          logger.error(`Status: ${error.response.status}`);
          logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
          
          // Provide more detailed error messages for common issues
          if (error.response.status === 401) {
            const errorData = error.response.data;
            if (errorData.error === 'invalid_client') {
              throw new Error('USPS API authentication failed: Invalid client credentials');
            } else if (errorData.error === 'invalid_request') {
              throw new Error('USPS API authentication failed: Invalid request format');
            }
          }
        }
      } else {
        logger.error('Failed to get USPS access token', error);
      }
      throw new Error('Failed to authenticate with USPS API');
    }
  }

  /**
   * Verify an address through the USPS REST API
   */
  async verifyAddress(
    street: string,
    city: string,
    state: string,
    zipCode: string
  ): Promise<USPSVerificationResult> {
    try {
      // Extract suite/apt number to preserve it if USPS removes it
      const suiteMatch = street.match(/(?:suite|ste|apt|unit|#)\s*([a-z0-9-]+)/i);
      const suiteInfo = suiteMatch ? suiteMatch[0] : '';
      
      // Create a record of the original address to return
      const originalAddress: USPSAddress = {
        street,
        city,
        state,
        zipCode
      };

      // Get access token
      const token = await this.getAccessToken();
      logger.info(`Using access token: ${token.substring(0, 10)}...`);

      const validateUrl = 'https://apis.usps.com/addresses/v3/address';

      // Prepare request body
      const requestBody = {
        streetAddress: street.replace(suiteInfo, '').trim(),
        secondaryAddress: suiteInfo,
        city: city,
        state: state,
        ZIPCode: zipCode
      }
      logger.info(`Sending address verification request: ${JSON.stringify(requestBody)}`);

      // Send verification request
      const response = await axios.get(
        'https://apis.usps.com/addresses/v3/address',
        { 
          params: requestBody,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
         }
      );

      logger.info(`USPS API response status: ${response.status}`);
      logger.info(`USPS API response data: ${JSON.stringify(response.data)}`);
      
      // Handle the response based on USPS API documentation
      if (response.data && response.data.address) {
        const verifiedAddressData = response.data.address;
        
        return {
          originalAddress: {
            street,
            city,
            state,
            zipCode
          },
          verifiedAddress: {
            street: verifiedAddressData.streetAddress || street,
            city: verifiedAddressData.city || city,
            state: verifiedAddressData.state || state,
            zipCode: verifiedAddressData.zipCode || zipCode,
            zipPlus4: verifiedAddressData.zipPlus4
          },
          success: true
        };
      } else if (response.data && response.data.errors) {
        // Handle API error response
        const errorMessages = response.data.errors.map((err: any) => err.message).join(', ');
        return {
          originalAddress,
          success: false,
          errorMessage: errorMessages || 'Address validation failed'
        };
      } else {
        // Handle unexpected response format
        return {
          originalAddress,
          success: false,
          errorMessage: 'Unexpected response format from USPS API'
        };
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error(`Address verification failed: ${error.message}`);
        if (error.response) {
          logger.error(`Status: ${error.response.status}`);
          logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
        }
      } else {
        logger.error('Address verification failed', error);
      }
      
      return {
        originalAddress: {
          street,
          city,
          state,
          zipCode
        },
        success: false,
        errorMessage: error instanceof Error 
          ? error.message 
          : 'Address verification failed'
      };
    }
  }

  /**
   * Verify and update a business address
   */
  async verifyBusinessAddress(business: BusinessListing): Promise<{
    success: boolean;
    business: BusinessListing;
    message: string;
  }> {
    try {
      if (!business.address || !business.city || !business.state || !business.postalcode) {
        return {
          success: false,
          business,
          message: 'Business has incomplete address information'
        };
      }

      const result = await this.verifyAddress(
        business.address,
        business.city,
        business.state,
        business.postalcode
      );

      if (result.success && result.verifiedAddress) {
        // Create updated business object with verified address
        const updatedBusiness: BusinessListing = {
          ...business,
          address: result.verifiedAddress.street,
          city: result.verifiedAddress.city,
          state: result.verifiedAddress.state,
          postalcode: result.verifiedAddress.zipCode,
          // Store the +4 code extension if available
          zipCodePlus4: result.verifiedAddress.zipPlus4
        };

        return {
          success: true,
          business: updatedBusiness,
          message: 'Address successfully verified'
        };
      } else {
        return {
          success: false,
          business,
          message: result.errorMessage || 'Address could not be verified'
        };
      }
    } catch (error) {
      logger.error('Business address verification failed', error);
      return {
        success: false,
        business,
        message: error instanceof Error ? error.message : 'Address verification failed'
      };
    }
  }
}

export const uspsService = new USPSService();