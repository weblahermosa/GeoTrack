import { GeoPoint, ParseResult, TrackData } from '../types';
import Papa from 'papaparse';
import { gpx, kml } from '@tmcw/togeojson';

const deg2rad = (deg: number) => deg * (Math.PI/180);

// Exported helper to calculate distance between two points in km
export const getDistance = (p1: GeoPoint, p2: GeoPoint): number => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(p2.lat - p1.lat);
  const dLon = deg2rad(p2.lon - p1.lon);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(p1.lat)) * Math.cos(deg2rad(p2.lat)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; 
};

// Helper to calculate bounds
const calculateBounds = (points: GeoPoint[]): [[number, number], [number, number]] => {
  if (points.length === 0) return [[0, 0], [0, 0]];
  
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  
  points.forEach(p => {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  });
  
  return [[minLat, minLon], [maxLat, maxLon]];
};

// Helper to calculate approximate distance
const calculateDistance = (points: GeoPoint[]): number => {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += getDistance(points[i], points[i+1]);
  }
  return total;
};

export const parseData = async (content: string, fileName: string = 'Untitled Track'): Promise<ParseResult> => {
  try {
    content = content.trim();
    
    // Detect format
    if (content.startsWith('<')) {
      if (content.includes('<gpx')) return parseGPX(content, fileName);
      if (content.includes('<kml')) return parseKML(content, fileName);
    }
    
    // Default to CSV if not XML
    return parseCSV(content, fileName);
  } catch (e: any) {
    return { success: false, error: e.message || 'Unknown parsing error' };
  }
};

const parseGPX = (content: string, fileName: string): ParseResult => {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(content, "text/xml");
    const geoJson = gpx(xmlDoc);
    
    const points: GeoPoint[] = [];
    
    geoJson.features.forEach((feature: any) => {
      if (feature.geometry) {
        if (feature.geometry.type === 'LineString') {
          feature.geometry.coordinates.forEach((coord: number[]) => {
            points.push({
              lon: coord[0],
              lat: coord[1],
              ele: coord[2] || 0,
              time: feature.properties?.coordTimes?.[points.length] || undefined
            });
          });
        } else if (feature.geometry.type === 'MultiLineString') {
           let flatIndex = 0;
           feature.geometry.coordinates.forEach((line: number[][]) => {
            line.forEach((coord: number[]) => {
                 points.push({
                    lon: coord[0],
                    lat: coord[1],
                    ele: coord[2] || 0,
                    time: feature.properties?.coordTimes?.[flatIndex] || undefined
                 });
                 flatIndex++;
            });
           });
        }
      }
    });

    if (points.length === 0) return { success: false, error: "No valid track points found in GPX" };

    return {
      success: true,
      data: {
        name: fileName,
        points,
        bounds: calculateBounds(points),
        distanceKm: calculateDistance(points)
      }
    };
  } catch (e) {
    return { success: false, error: "Invalid GPX format" };
  }
};

const parseKML = (content: string, fileName: string): ParseResult => {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(content, "text/xml");
    const geoJson = kml(xmlDoc);
    
    const points: GeoPoint[] = [];
     geoJson.features.forEach((feature: any) => {
      if (feature.geometry) {
        if (feature.geometry.type === 'LineString') {
          feature.geometry.coordinates.forEach((coord: number[]) => {
            points.push({
              lon: coord[0],
              lat: coord[1],
              ele: coord[2] || 0,
              time: feature.properties?.coordTimes ? feature.properties.coordTimes[points.length] : undefined
            });
          });
        } else if (feature.geometry.type === 'MultiLineString') {
            feature.geometry.coordinates.forEach((line: number[][]) => {
                line.forEach((coord: number[]) => {
                    points.push({
                        lon: coord[0],
                        lat: coord[1],
                        ele: coord[2] || 0
                    });
                });
            });
        }
      }
    });

    if (points.length === 0) return { success: false, error: "No valid track points found in KML" };

    return {
      success: true,
      data: {
        name: fileName,
        points,
        bounds: calculateBounds(points),
        distanceKm: calculateDistance(points)
      }
    };
  } catch (e) {
    return { success: false, error: "Invalid KML format" };
  }
};

const parseCSV = (content: string, fileName: string): ParseResult => {
  const lines = content.split('\n');
  let headerLineIndex = -1;
  
  for(let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i].toLowerCase();
    if (line.includes('latitude') && line.includes('longitude')) {
      headerLineIndex = i;
      break;
    }
  }

  if (headerLineIndex === -1) {
      headerLineIndex = 0;
  }

  const csvData = lines.slice(headerLineIndex).join('\n');

  const result = Papa.parse(csvData, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    return { success: false, error: "Failed to parse CSV data" };
  }

  const points: GeoPoint[] = [];

  result.data.forEach((row: any) => {
    const normalizedRow: any = {};
    Object.keys(row).forEach(k => {
        normalizedRow[k.trim().toLowerCase()] = row[k];
    });

    const lat = normalizedRow['latitude'];
    const lon = normalizedRow['longitude'];
    const ele = normalizedRow['altitude'] || normalizedRow['ele'] || 0;
    const time = normalizedRow['time'];

    if (typeof lat === 'number' && typeof lon === 'number') {
      points.push({ lat, lon, ele, time });
    }
  });

  if (points.length === 0) return { success: false, error: "No valid Latitude/Longitude columns found in CSV" };

  let finalName = fileName;
  if (headerLineIndex > 0) {
     const metaLines = lines.slice(0, headerLineIndex);
     const nameLine = metaLines.find(l => l.toLowerCase().startsWith('name,'));
     if (nameLine) {
         const parts = nameLine.split(',');
         if (parts.length > 1) finalName = parts.slice(1).join(',').trim();
     }
  }

  return {
    success: true,
    data: {
      name: finalName,
      points,
      bounds: calculateBounds(points),
      distanceKm: calculateDistance(points)
    }
  };
};