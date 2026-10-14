import { CampusConfig, GeofenceResult } from '../types';

export type GeolocationMode = 'real' | 'skit_inside' | 'jaipur_outside' | 'inaccurate_gps';

// SKIT Jaipur reference coordinates
export const DEFAULT_SKIT_COORDS = {
  latitude: 26.8227,
  longitude: 75.8647,
  campusName: 'Swami Keshvanand Institute of Technology (SKIT), Jaipur',
  radiusMeters: 450,
  maxAccuracyMeters: 80,
};

// Haversine distance in meters
export function computeDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

class GeofenceService {
  private mode: GeolocationMode = 'skit_inside'; // Default to inside SKIT for smooth hackathon demo

  constructor() {
    const saved = localStorage.getItem('sentinel_geo_mode') as GeolocationMode;
    if (saved) {
      this.mode = saved;
    }
  }

  getMode(): GeolocationMode {
    return this.mode;
  }

  setMode(mode: GeolocationMode) {
    this.mode = mode;
    localStorage.setItem('sentinel_geo_mode', mode);
  }

  async getCurrentLocation(campus: CampusConfig): Promise<GeofenceResult> {
    // If a demo simulation preset is chosen:
    if (this.mode === 'skit_inside') {
      const lat = 26.8228;
      const lon = 75.8646;
      const distance = computeDistanceMeters(campus.latitude, campus.longitude, lat, lon);
      return {
        latitude: lat,
        longitude: lon,
        accuracy: 12, // Excellent GPS accuracy
        distanceMeters: distance,
        isInside: distance <= campus.radiusMeters,
        isAccuracyAcceptable: true,
      };
    }

    if (this.mode === 'jaipur_outside') {
      const lat = 26.8286;
      const lon = 75.8056; // Jaipur Airport ~6km away
      const distance = computeDistanceMeters(campus.latitude, campus.longitude, lat, lon);
      return {
        latitude: lat,
        longitude: lon,
        accuracy: 18,
        distanceMeters: distance,
        isInside: distance <= campus.radiusMeters,
        isAccuracyAcceptable: true,
      };
    }

    if (this.mode === 'inaccurate_gps') {
      const lat = 26.8227;
      const lon = 75.8647;
      const distance = computeDistanceMeters(campus.latitude, campus.longitude, lat, lon);
      return {
        latitude: lat,
        longitude: lon,
        accuracy: 145, // Exceeds 80m threshold
        distanceMeters: distance,
        isInside: distance <= campus.radiusMeters,
        isAccuracyAcceptable: false,
        error: `Inside boundary, accuracy insufficient (±145m > ±${campus.maxAccuracyMeters}m). Move outdoors with clear sky view and retry.`,
      };
    }

    // Real Browser Geolocation API
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        return resolve({
          latitude: 0,
          longitude: 0,
          accuracy: 9999,
          distanceMeters: 999999,
          isInside: false,
          isAccuracyAcceptable: false,
          error: 'Geolocation is not supported by your browser.',
        });
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const acc = Math.round(pos.coords.accuracy);
          const distance = computeDistanceMeters(campus.latitude, campus.longitude, lat, lon);
          const isInside = distance <= campus.radiusMeters;
          const isAccuracyAcceptable = acc <= campus.maxAccuracyMeters;

          let errorMsg: string | undefined = undefined;
          if (isInside && !isAccuracyAcceptable) {
            errorMsg = `Inside boundary, accuracy insufficient (±${acc}m > ±${campus.maxAccuracyMeters}m). Move outdoors with clear sky view and retry.`;
          } else if (!isInside) {
            errorMsg = `Outside approved boundary: Device is ${distance}m from campus center (Allowed radius: ${campus.radiusMeters}m).`;
          }

          resolve({
            latitude: lat,
            longitude: lon,
            accuracy: acc,
            distanceMeters: distance,
            isInside,
            isAccuracyAcceptable,
            error: errorMsg,
          });
        },
        (err) => {
          let errorMsg = 'Failed to obtain device location.';
          if (err.code === err.PERMISSION_DENIED) {
            errorMsg = 'Location permission was denied. Please grant location access in your browser settings to verify campus presence.';
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            errorMsg = 'Location information is unavailable from your device sensor.';
          } else if (err.code === err.TIMEOUT) {
            errorMsg = 'Location request timed out. Please retry with a stronger GPS or network signal.';
          }

          resolve({
            latitude: 0,
            longitude: 0,
            accuracy: 9999,
            distanceMeters: 999999,
            isInside: false,
            isAccuracyAcceptable: false,
            error: errorMsg,
          });
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  }
}

export const geofenceService = new GeofenceService();
