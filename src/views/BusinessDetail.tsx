import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Icon, LatLngExpression } from 'leaflet';
import { BusinessListing } from '../types/business';
import { createLogger } from '../services/frontend-logger';
import { formatPhone, formatCategory } from '../utils/formatters';
import '../styles/business-detail.css';
import 'leaflet/dist/leaflet.css';

const logger = createLogger('BusinessDetailView');

// Define a custom icon for the map marker
const customIcon = new Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const BusinessDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [business, setBusiness] = useState<BusinessListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapCoordinates, setMapCoordinates] = useState<LatLngExpression | null>(null);
  const [geocodingError, setGeocodingError] = useState<string | null>(null);

  // Fetch business details
  useEffect(() => {
    const fetchBusinessDetail = async () => {
      try {
        setLoading(true);
        logger.info(`Fetching details for business ID: ${id}`);
        
        const response = await fetch(`/api/businesses/${id}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Business not found');
          }
          throw new Error(`Failed to fetch business details: ${response.statusText}`);
        }
        
        const data = await response.json();
        logger.info('Business details retrieved successfully');
        setBusiness(data);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        logger.error(`Error fetching business details: ${errorMessage}`);
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchBusinessDetail();
    }
  }, [id]);

  // Geocode address to get coordinates for map
  useEffect(() => {
    const geocodeAddress = async () => {
      if (!business) return;
      
      try {
        // Create several versions of the address, from most to least specific
        const fullAddress = `${business.address}, ${business.city}, ${business.state} ${business.postalcode}, USA`;
        
        // Create a clean address without suite/unit numbers
        const cleanAddress = business.address
          .replace(/\b(suite|ste|apt|unit|#)\s*[a-z0-9-]+\b/i, '') // Remove suite/apt numbers
          .replace(/,\s*$/, '') // Remove trailing commas
          .trim();
        
        // Expand common abbreviations
        const expandedAddress = cleanAddress
          .replace(/\bSw\b/i, 'Southwest')
          .replace(/\bNw\b/i, 'Northwest')
          .replace(/\bNe\b/i, 'Northeast')
          .replace(/\bSe\b/i, 'Southeast')
          .replace(/\bSt\b/i, 'Street')
          .replace(/\bAve\b/i, 'Avenue')
          .replace(/\bRd\b/i, 'Road')
          .replace(/\bBlvd\b/i, 'Boulevard')
          .replace(/\bLn\b/i, 'Lane')
          .replace(/\bPl\b/i, 'Place')
          .replace(/\bCt\b/i, 'Court');
        
        const expandedFullAddress = `${expandedAddress}, ${business.city}, ${business.state} ${business.postalcode}, USA`;
        const cityStateZip = `${business.city}, ${business.state} ${business.postalcode}, USA`;
        
        logger.info(`Attempting geocoding with multiple address formats`);
        
        // Try progressively less specific addresses
        let response, data;
        const addressVariations = [
          fullAddress,
          expandedFullAddress,
          `${cleanAddress}, ${business.city}, ${business.state} ${business.postalcode}, USA`,
          cityStateZip
        ];
        
        // Try each address variation
        for (const addressStr of addressVariations) {
          // Add a delay between requests to avoid rate limiting
          if (addressStr !== addressVariations[0]) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          logger.info(`Trying geocoding with: ${addressStr}`);
          
          response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressStr)}&limit=1`,
            {
              headers: {
                'Accept-Language': 'en',
                'User-Agent': 'BusinessLister/1.0'
              }
            }
          );
          
          data = await response.json();
          
          if (data && data.length > 0) {
            setMapCoordinates([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
            logger.info(`Geocoding successful with format: ${addressStr}`);
            return; // Exit once we've found coordinates
          }
        }
        
        // If we get here, all geocoding attempts failed
        logger.warning(`Fallback to ZIP code geocoding`);
        
        // Final attempt: try just the ZIP code
        response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(business.postalcode)}, USA&limit=1`,
          {
            headers: {
              'Accept-Language': 'en',
              'User-Agent': 'BusinessLister/1.0'
            }
          }
        );
        
        data = await response.json();
        
        if (data && data.length > 0) {
          setMapCoordinates([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
          logger.info(`ZIP code level geocoding successful`);
          
          // Set a visual indicator that this is approximate
          // You can add some state to show an "approximate location" message
        } else {
          setGeocodingError('Could not find coordinates for this address');
          logger.warning(`All geocoding attempts failed for: ${business.address}`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setGeocodingError(errorMessage);
        logger.error(`Geocoding error: ${errorMessage}`);
      }
    };
    
    if (business) {
      geocodeAddress();
    }
  }, [business]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loader"></div>
        <p>Loading business details...</p>
      </div>
    );
  }

  if (error || !business) {
    return (
      <div className="business-detail-container">
        <div className="error-message">
          <p>{error || 'Business not found'}</p>
          <Link to="/" className="back-button">Back to Listings</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="business-detail-container">
      <Link to="/" className="back-link">
        &larr; Back to Listings
      </Link>
      
      <div className="business-detail-card">
        <header className="business-header">
          <h1>{business.name}</h1>
          {business.id && <span className="business-id">ID: {business.id}</span>}
          {business.category && (
            <div className="category-tag">{formatCategory(business.category)}</div>
          )}
        </header>
        
        <section className="business-section">
          <h2>Contact Information</h2>
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">Address:</span>
              <span className="detail-value">
                {business.address}<br />
                {business.city}, {business.state} {business.postalcode}
              </span>
            </div>
            
            {business.phone && (
              <div className="detail-item">
                <span className="detail-label">Phone:</span>
                <a href={`tel:${business.phone}`} className="detail-value">
                  {formatPhone(business.phone)}
                </a>
              </div>
            )}
            
            {business.email && (
              <div className="detail-item">
                <span className="detail-label">Email:</span>
                <a href={`mailto:${business.email}`} className="detail-value">
                  {business.email}
                </a>
              </div>
            )}
            
            {business.website && (
              <div className="detail-item">
                <span className="detail-label">Website:</span>
                <a 
                  href={business.website} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="detail-value"
                >
                  {business.website}
                </a>
              </div>
            )}
          </div>
        </section>

        {/* Map section using OpenStreetMap */}
        <section className="business-section">
          <h2>Location</h2>
          {mapCoordinates ? (
            <div className="map-container">
              <MapContainer 
                center={mapCoordinates} 
                zoom={15} 
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={mapCoordinates} icon={customIcon}>
                  <Popup>
                    <strong>{business.name}</strong><br />
                    {business.address}<br />
                    {business.city}, {business.state} {business.postalcode}
                  </Popup>
                </Marker>
              </MapContainer>
              <div className="map-attribution">
                Map data © OpenStreetMap contributors
              </div>
            </div>
          ) : (
            <div className="map-placeholder">
              {geocodingError ? (
                <div className="address-display-container">
                  <div className="geocoding-error">
                    <p>Address not found on map</p>
                    <div className="address-display">
                      <strong>{business.name}</strong><br />
                      {business.address}<br />
                      {business.city}, {business.state} {business.postalcode}
                    </div>
                    <div className="external-map-links">
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          `${business.address}, ${business.city}, ${business.state} ${business.postalcode}`
                        )}`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="external-map-link"
                      >
                        <span className="icon">🗺️</span> View on Google Maps
                      </a>
                      <a 
                        href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(
                          `${business.address}, ${business.city}, ${business.state} ${business.postalcode}`
                        )}`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="external-map-link"
                      >
                        <span className="icon">🗺️</span> View on OpenStreetMap
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                <p>Loading map...</p>
              )}
            </div>
          )}
        </section>
        
        {/* Additional information section */}
        <section className="business-section">
          <h2>Additional Information</h2>
          <div className="detail-grid">
            {business.source && (
              <div className="detail-item">
                <span className="detail-label">Category:</span>
                <span className="detail-value">{formatCategory(business.source)}</span>
              </div>
            )}
            {/* Add more fields here as they become available */}
          </div>
        </section>
        
        {/* Actions section */}
        <section className="business-actions">
          {business.phone && (
            <a href={`tel:${business.phone}`} className="action-button phone-button">
              <span className="icon">📞</span> Call
            </a>
          )}
          {business.email && (
            <a href={`mailto:${business.email}`} className="action-button email-button">
              <span className="icon">✉️</span> Email
            </a>
          )}
          {business.website && (
            <a 
              href={business.website} 
              target="_blank" 
              rel="noopener noreferrer"
              className="action-button website-button"
            >
              <span className="icon">🌐</span> Visit Website
            </a>
          )}
          {mapCoordinates && (
            <a 
              href={`https://www.google.com/maps/search/?api=1&query=${mapCoordinates[0]},${mapCoordinates[1]}`}
              target="_blank" 
              rel="noopener noreferrer"
              className="action-button map-button"
            >
              <span className="icon">🗺️</span> Open in Google Maps
            </a>
          )}
        </section>
      </div>
    </div>
  );
};

export default BusinessDetail;