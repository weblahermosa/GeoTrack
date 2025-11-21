export interface GeoPoint {
  lat: number;
  lon: number;
  ele?: number;
  time?: string;
}

export interface TrackData {
  name: string;
  points: GeoPoint[];
  bounds: [[number, number], [number, number]]; // [minLat, minLon], [maxLat, maxLon]
  distanceKm?: number;
}

export enum InputMode {
  FILE = 'FILE',
  TEXT = 'TEXT',
  SEARCH = 'SEARCH'
}

export type ParseResult = 
  | { success: true; data: TrackData }
  | { success: false; error: string };

export interface AnnotationMarker {
  lat: number;
  lon: number;
  type: 'TIME' | 'DISTANCE' | 'STOP' | 'SPEED';
  label: string;
  detail?: string;
}

export interface Waypoint {
  lat: number;
  lon: number;
  label: string;
  address?: string;
  description?: string;
  uri?: string;
}