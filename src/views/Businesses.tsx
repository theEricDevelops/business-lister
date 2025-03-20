import React, { useEffect, useState } from 'react';
import { createLogger } from '../services/frontend-logger';
import { Filters, BusinessListing } from '../types/business';
import { SyncProgress } from '../types/db';
import { formatPhone, formatCategory } from '../utils/formatters';
import '../styles/businesses.css';
import { useNavigate } from 'react-router-dom';

const logger = createLogger('BusinessesView');

const Businesses: React.FC = () => {
  const [businesses, setBusinesses] = useState<BusinessListing[]>([]);
  const [allBusinesses, setAllBusinesses] = useState<BusinessListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncNeeded, setSyncNeeded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [progressInterval, setProgressInterval] = useState<number | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const navigate = useNavigate();

  // Initialize filters
  const [filters, setFilters] = useState<Filters>({
    search: '',
    city: '',
    state: '',
    postalcode: '',
    category: '', // Add category filter
    hasEmail: false,
    hasPhone: false,
    hasWebsite: false
  });
  
  // Filter options derived from the data
  const [filterOptions, setFilterOptions] = useState<{
    cities: string[];
    states: string[];
    postalcodes: string[];
    categories: string[]; // Add categories array
  }>({
    cities: [],
    states: [],
    postalcodes: [],
    categories: [] // Initialize categories array
  });

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
      setAllBusinesses(data);
      setBusinesses(data);

        // Generate filter options from the data
      if (data.length > 0) {
        const cities = Array.from(new Set<string>(data.map((b: BusinessListing) => (b.city || '') as string))).sort();
        const states = Array.from(new Set<string>(data.map((b: BusinessListing) => (b.state || '') as string))).sort();
        const postalcodes = Array.from(new Set<string>(data.map((b: BusinessListing) => (b.postalcode || '') as string))).sort();
        const categories = Array.from(new Set<string>(data.map((b: BusinessListing) => (b.category || '') as string))).sort(); 

        setFilterOptions({
          cities,
          states,
          postalcodes,
          categories
        });
      }

      // Check if we need to show sync button (empty dataset)
      if (data.length === 0) {
        const syncStatusResponse = await fetch('/api/sync/status');
        const syncStatus = await syncStatusResponse.json();
        setSyncNeeded(syncStatus.syncNeeded);
      } else {
        setSyncNeeded(false);
      }
      
      setLoading(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Error fetching businesses: ${errorMessage}`);
      setError('Failed to load businesses. Please try again later.');
      setLoading(false);
    }
  };

  // Apply filters to businesses
  const applyFilters = () => {
    let filtered = [...allBusinesses];
    
    // Apply text search filter
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(business => 
        (business.name?.toLowerCase().includes(searchTerm) ||
        business.address?.toLowerCase().includes(searchTerm) ||
        business.city?.toLowerCase().includes(searchTerm) ||
        business.state?.toLowerCase().includes(searchTerm) ||
        business.postalcode?.toLowerCase().includes(searchTerm) ||
        business.phone?.toLowerCase().includes(searchTerm) ||
        business.email?.toLowerCase().includes(searchTerm) ||
        business.website?.toLowerCase().includes(searchTerm))
      );
    }

    // Apply category filter
    if (filters.category) {
      filtered = filtered.filter(business => business.category === filters.category);
    }
    
    // Apply city filter
    if (filters.city) {
      filtered = filtered.filter(business => business.city === filters.city);
    }
    
    // Apply state filter
    if (filters.state) {
      filtered = filtered.filter(business => business.state === filters.state);
    }
    
    // Apply postal code filter
    if (filters.postalcode) {
      filtered = filtered.filter(business => business.postalcode === filters.postalcode);
    }
    
    // Apply email filter
    if (filters.hasEmail) {
      filtered = filtered.filter(business => !!business.email);
    }
    
    // Apply phone filter
    if (filters.hasPhone) {
      filtered = filtered.filter(business => !!business.phone);
    }
    
    // Apply website filter
    if (filters.hasWebsite) {
      filtered = filtered.filter(business => !!business.website);
    }
    
    setBusinesses(filtered);
  };

  // Handle filter changes
  const handleFilterChange = (filterName: keyof Filters, value: string | boolean) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
  };

  // Reset filters
  const resetFilters = () => {
    setFilters({
      search: '',
      category: '',
      city: '',
      state: '',
      postalcode: '',
      hasEmail: false,
      hasPhone: false,
      hasWebsite: false
    });
    setBusinesses(allBusinesses);
  };

  useEffect(() => {
    fetchBusinesses();
    
    // Clean up interval on unmount
    return () => {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
    };
  }, []);
  
  // Apply filters whenever they change
  useEffect(() => {
    applyFilters();
  }, [filters, allBusinesses]);

  // Check sync progress
  const checkSyncProgress = async () => {
    try {
      const response = await fetch('/api/sync/progress');
      const progress = await response.json();
      setSyncProgress(progress);
      
      // If sync is no longer in progress, stop polling
      if (!progress.inProgress && progressInterval) {
        clearInterval(progressInterval);
        setProgressInterval(null);
        setSyncing(false);
        
        // Refresh business list after sync completes
        if (progress.processed > 0) {
          await fetchBusinesses();
        }
      }
    } catch (error) {
      logger.error('Failed to fetch sync progress');
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setSyncResult(null);
      setSyncProgress(null);

      logger.info('Starting database sync');
      const response = await fetch('/api/sync', { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Start polling for progress updates
      const interval = setInterval(checkSyncProgress, 1000);
      setProgressInterval(interval);

      if (!response.ok) {
        throw new Error(`Failed to sync database: ${response.statusText}`);
      }

      const result = await response.json();
      logger.info(`Sync request sent: ${result.message}`);
      // Let the progress polling handle the rest
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      logger.error(errorMessage);
      setSyncResult(errorMessage);
      
      // Stop polling on error
      if (progressInterval) {
        clearInterval(progressInterval);
        setProgressInterval(null);
      }
      
      setSyncing(false);
    }
  };

  // Calculate percentage for progress bar
  const calculateProgress = () => {
    if (!syncProgress || syncProgress.total === 0) return 0;
    return Math.round((syncProgress.processed / syncProgress.total) * 100);
  };

  

  return (
    <div className="businesses-container">
      <header className="app-header">
        <h1>Business Listings</h1>
        <div className="header-actions">
          <button 
            className="filter-toggle" 
            onClick={() => setFilterOpen(!filterOpen)}
          >
            {filterOpen ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>
      </header>

      {loading ? (
        <div className="loading-container">
          <div className="loader"></div>
          <p>Loading businesses...</p>
        </div>
      ) : error ? (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => fetchBusinesses()}>Try Again</button>
        </div>
      ) : (
        <>
          {syncNeeded && (
            <div className="sync-container">
              <p>No businesses found in database. Import data to get started.</p>
              <button 
                onClick={handleSync} 
                disabled={syncing}
                className="sync-button"
              >
                {syncing ? 'Syncing...' : 'Import Businesses'}
              </button>
              
              {/* Progress display */}
              {syncing && syncProgress && (
                <div className="sync-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${calculateProgress()}%` }}
                    ></div>
                  </div>
                  <div className="progress-details">
                    <p>Processing: {syncProgress.currentZipCode}</p>
                    <p>Businesses: {syncProgress.processed} of {syncProgress.total}</p>
                    <p>Zip Codes: {syncProgress.completedZipCodes} of {syncProgress.totalZipCodes}</p>
                    <p>{calculateProgress()}% complete</p>
                  </div>
                </div>
              )}
              
              {syncResult && <p className="sync-result">{syncResult}</p>}
            </div>
          )}

          {/* Filters Panel */}
          {filterOpen && (
            <div className="filters-panel">
              <div className="filters-header">
                <h2>Filter Businesses</h2>
                <button onClick={resetFilters} className="reset-button">Reset</button>
              </div>
              
              <div className="filters-grid">
                <div className="filter-group">
                  <label htmlFor="search">Search</label>
                  <input
                    id="search"
                    type="text"
                    placeholder="Search businesses..."
                    value={filters.search}
                    onChange={(e) => handleFilterChange('search', e.target.value)}
                  />
                </div>

                <div className="filter-group">
                  <label htmlFor="category">Category</label>
                  <select 
                    id="category"
                    value={filters.category}
                    onChange={(e) => handleFilterChange('category', e.target.value)}
                  >
                    <option value="">All Categories</option>
                    {filterOptions.categories.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                
                <div className="filter-group">
                  <label htmlFor="city">City</label>
                  <select
                    id="city"
                    value={filters.city}
                    onChange={(e) => handleFilterChange('city', e.target.value)}
                  >
                    <option value="">All Cities</option>
                    {filterOptions.cities.map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>
                
                <div className="filter-group">
                  <label htmlFor="state">State</label>
                  <select
                    id="state"
                    value={filters.state}
                    onChange={(e) => handleFilterChange('state', e.target.value)}
                  >
                    <option value="">All States</option>
                    {filterOptions.states.map(state => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>
                
                <div className="filter-group">
                  <label htmlFor="postcalcode">Postal Code</label>
                  <select
                    id="postcalcode"
                    value={filters.postalcode}
                    onChange={(e) => handleFilterChange('postalcode', e.target.value)}
                  >
                    <option value="">All Postal Codes</option>
                    {filterOptions.postalcodes.map(code => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="checkbox-filters">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.hasEmail}
                    onChange={(e) => handleFilterChange('hasEmail', e.target.checked)}
                  />
                  Has Email
                </label>
                
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.hasPhone}
                    onChange={(e) => handleFilterChange('hasPhone', e.target.checked)}
                  />
                  Has Phone
                </label>
                
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.hasWebsite}
                    onChange={(e) => handleFilterChange('hasWebsite', e.target.checked)}
                  />
                  Has Website
                </label>
              </div>
            </div>
          )}

          {/* Results summary */}
          <div className="results-summary">
            <p>
              Showing {businesses.length} {businesses.length === 1 ? 'business' : 'businesses'}
              {allBusinesses.length !== businesses.length && ` of ${allBusinesses.length} total`}
            </p>
          </div>

          {/* Business cards */}
          <div className="business-list">
            {businesses.length === 0 && !syncNeeded ? (
              <div className="no-results">
                <p>No businesses match your filters</p>
                <button onClick={resetFilters} className="reset-button">Reset Filters</button>
              </div>
            ) : (
              businesses.map((business) => (
                <div 
                  key={business.id || business.name} 
                  className="business-card"
                  onClick={() => navigate(`/business/${business.id}`)}
                >
                  <h2>{business.name || business.name}</h2>
                  
                  {/* Add category display */}
                  {business.category && (
                    <div className="category-tag">{formatCategory(business.category)}</div>
                  )}
                  
                  <p className="address">{business.address}</p>
                  <p className="location">{business.city}, {business.state} {business.postalcode}</p>
                  
                  <div className="business-contact">
                    {business.phone && (
                      <p className="phone">
                        <span className="icon">📞</span>
                        <a href={`tel:${business.phone}`}>{formatPhone(business.phone)}</a>
                      </p>
                    )}
                    
                    {business.website && (
                      <p className="website">
                        <span className="icon">🌐</span>
                        <a href={business.website} target="_blank" rel="noopener noreferrer">
                          {business.website.replace(/^https?:\/\//, '')}
                        </a>
                      </p>
                    )}
                    
                    {business.email && (
                      <p className="email">
                        <span className="icon">✉️</span>
                        <a href={`mailto:${business.email}`}>{business.email}</a>
                      </p>
                    )}
                  </div>
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
