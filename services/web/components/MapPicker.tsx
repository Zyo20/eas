'use client';

import { useEffect, useRef, useState } from 'react';
import type LType from 'leaflet';

interface MapPickerProps {
  lat: number | null;
  lng: number | null;
  radius: number;
  onChange: (lat: number, lng: number) => void;
}

export default function MapPicker({ lat, lng, radius, onChange }: MapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const markerRef = useRef<LType.Marker | null>(null);
  const circleRef = useRef<LType.Circle | null>(null);
  const [loading, setLoading] = useState(true);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Initialize Leaflet Map
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;

    let mapInstance: LType.Map;
    let markerInstance: LType.Marker;
    let circleInstance: LType.Circle;

    // Dynamically load Leaflet on client-side to prevent SSR window issues
    Promise.all([
      import('leaflet'),
      // Load Leaflet stylesheet dynamically
      new Promise((resolve) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.onload = resolve;
        document.head.appendChild(link);
      })
    ]).then(([L]) => {
      setLoading(false);

      // Fix default marker icon issues in Next.js build
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      // Default to Lapu-Lapu City College if coordinates are not set
      const initialLat = lat ?? 10.3103;
      const initialLng = lng ?? 123.8914;

      // 1. Create Map
      mapInstance = L.map(mapContainerRef.current!).setView([initialLat, initialLng], 14);
      mapRef.current = mapInstance;

      // 2. Add OSM Tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(mapInstance);

      // 3. Add Marker
      markerInstance = L.marker([initialLat, initialLng], { draggable: true }).addTo(mapInstance);
      markerRef.current = markerInstance;

      // 4. Add Geofence Circle Overlay
      circleInstance = L.circle([initialLat, initialLng], {
        radius: radius,
        color: '#2563eb', // Blue-600
        fillColor: '#3b82f6', // Blue-500
        fillOpacity: 0.15,
        weight: 1.5,
      }).addTo(mapInstance);
      circleRef.current = circleInstance;

      // 5. Setup Drag Interactions
      markerInstance.on('dragend', () => {
        const position = markerInstance.getLatLng();
        onChange(Number(position.lat.toFixed(10)), Number(position.lng.toFixed(10)));
      });

      // 6. Setup Click Interactions
      mapInstance.on('click', (e) => {
        const position = e.latlng;
        markerInstance.setLatLng(position);
        circleInstance.setLatLng(position);
        onChange(Number(position.lat.toFixed(10)), Number(position.lng.toFixed(10)));
      });
    }).catch((err) => {
      console.error('Failed to load Leaflet', err);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update marker and circle state when props change
  useEffect(() => {
    if (loading) return;

    const currentLat = lat ?? 10.3103;
    const currentLng = lng ?? 123.8914;

    if (markerRef.current) {
      markerRef.current.setLatLng([currentLat, currentLng]);
    }
    if (circleRef.current) {
      circleRef.current.setLatLng([currentLat, currentLng]);
      circleRef.current.setRadius(radius);
    }
    // If external coordinates changes, pan map to center
    if (mapRef.current && lat !== null && lng !== null) {
      mapRef.current.panTo([currentLat, currentLng]);
    }
  }, [lat, lng, radius, loading]);

  // GPS Locate Device handler
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser (or requires a secure HTTPS context).');
      return;
    }
    setGpsError(null);

    const successCallback = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      onChange(Number(latitude.toFixed(10)), Number(longitude.toFixed(10)));
      if (mapRef.current) {
        mapRef.current.setView([latitude, longitude], 15);
      }
    };

    const errorCallback = (error: GeolocationPositionError) => {
      if (error.code === error.TIMEOUT) {
        // Fallback to low accuracy on timeout
        setGpsError('GPS high-accuracy request timed out. Retrying with low accuracy...');
        navigator.geolocation.getCurrentPosition(
          successCallback,
          (fallbackError) => {
            setGpsError(getFriendlyGpsErrorMessage(fallbackError));
          },
          { enableHighAccuracy: false, timeout: 15000 }
        );
      } else {
        setGpsError(getFriendlyGpsErrorMessage(error));
      }
      console.warn('Geolocation error:', error);
    };

    navigator.geolocation.getCurrentPosition(successCallback, errorCallback, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  };

  const getFriendlyGpsErrorMessage = (error: GeolocationPositionError) => {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return 'GPS permission denied. Please allow location access in your browser/device settings.';
      case error.POSITION_UNAVAILABLE:
        return 'Location information is unavailable. Check your device GPS/network signal.';
      case error.TIMEOUT:
        return 'Request to get user location timed out.';
      default:
        return 'Could not retrieve your location. Check your GPS permissions.';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          💡 Drop pin, click map, or locate yourself to set coordinates
        </span>
        <button
          type="button"
          onClick={handleLocateMe}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #cbd5e1',
            background: 'white',
            color: '#0f172a',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
        >
          📍 Locate Me
        </button>
      </div>

      {gpsError && (
        <div style={{ fontSize: 11, color: '#dc2626', margin: '2px 0' }}>
          ⚠️ {gpsError}
        </div>
      )}

      <div
        ref={mapContainerRef}
        style={{
          height: 280,
          width: '100%',
          borderRadius: 8,
          border: '1px solid #cbd5e1',
          overflow: 'hidden',
          background: '#f1f5f9',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {loading && (
          <div style={{ color: '#64748b', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={spinnerStyle} />
            Loading map canvas...
          </div>
        )}
      </div>
    </div>
  );
}

const spinnerStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  border: '2px solid #cbd5e1',
  borderTopColor: '#3b82f6',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
};
