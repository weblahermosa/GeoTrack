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
  TEXT = 'TEXT'
}

export type ParseResult = 
  | { success: true; data: TrackData }
  | { success: false; error: string };