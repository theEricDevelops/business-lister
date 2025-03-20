import React, { useEffect, useState } from 'react';
import { BusinessListing } from '../types/business';
import { createLogger } from '../services/frontend-logger';

const logger = createLogger('BusinessesView');

const Businesses: React.FC = () => {
  const [businesses, setBusinesses] = useState<BusinessListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncNeeded, setSyncNeeded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const fetchBusinesses = async () => {
    try {
      setLoading(true);
      logger.info('Fetching businesses from API');
      const response = await fetch('/api/businesses');

      if (!response.ok) {
        throw new Error(`Failed to fetch businesses: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info(`Received ${data.length} businesses from API`);
      setBusinesses(data);

      if (data.length === 0) {
        const syncStatusResponse = await fetch('/api/sync/status');
        const syncStatus = await syncStatusResponse.json();
        setSyncNeeded(syncStatus.syncNeeded);
      } else {
        setSyncNeeded(false);
      }

      setLoading(false);
    } catch(err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      logger.error(errorMessage);
      setError(errorMessage);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBusinesses();
}, []);

const handleSync = async () => {
  try {
    setSyncing(true);
    setSyncResult(null);

    logger.info('Starting database sync');
    const response = await fetch('/api/sync', { 
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to sync database: ${response.statusText}`);
    }

    const result = await response.json();
    logger.info(`Sync completed: ${result.businessCount} businesses synced`);
    setSyncResult(result.message);

    await fetchBusinesses();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    logger.error(errorMessage);
    setSyncResult(errorMessage);
  } finally {
    setSyncing(false);
  }
};

  return (
    <div className="businesses-container">
      <h1>Business Listings</h1>
      {loading ? (
        <p>Loading...</p>
      ) : error ? (
        <div className="error-message">
          <p>Error: {error}</p>
          <button onClick={() => fetchBusinesses()}>Try Again</button>
        </div>
      ) : (
        <>
        {syncNeeded && (
          <div className="sync-container">
            <p>No businesses found in database. Sync is needed.</p>
            <button 
              onClick={handleSync} 
              disabled={syncing}
              className="sync-button"
            >
              {syncing ? 'Syncing...' : 'Sync Database'}
            </button>
            {syncResult && <p className="sync-result">{syncResult}</p>}
          </div>
        )}

        <div className="business-list">
          {businesses.length === 0 && !syncNeeded ? (
            <p>No businesses found</p>
          ) : (
            businesses.map((business) => (
              <div key={business.id || business.name} className="business-card">
                <h2>{business.name}</h2>
                <p>{business.address}</p>
                <p>{business.city}, {business.state} {business.postalCode}</p>
                {business.phone && <p>Phone: {business.phone}</p>}
                {business.website && <p>Website: <a href={business.website}>{business.website}</a></p>}
                {business.email && <p>Email: <a href={`mailto:${business.email}`}>{business.email}</a></p>}
              </div>
            ))
          )}
        </div>
        </>
      )}
    </div>
  );
};

export default Businesses;
