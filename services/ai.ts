import { GoogleGenAI } from "@google/genai";
import { Waypoint } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

interface SearchResult {
  waypoints: Waypoint[];
  groundingMetadata: any;
}

export const searchPlaces = async (query: string, center?: {lat: number, lon: number}): Promise<SearchResult> => {
  try {
    const prompt = `
      Find places matching this query: "${query}".
      
      Strictly follow these rules:
      1. Return a list of 3-5 highly relevant places.
      2. For each place, you MUST output a single line in this exact format:
         PLACE_MARKER|Name|Address|Latitude|Longitude|Short Description
         
      Example output:
      PLACE_MARKER|7-Eleven|123 Main St|34.0522|-118.2437|Open 24 hours, convenience store.
      
      Ensure Latitude and Longitude are numeric numbers.
    `;
    
    const toolConfig = center ? {
        retrievalConfig: {
            latLng: {
                latitude: center.lat,
                longitude: center.lon
            }
        }
    } : undefined;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: toolConfig
      }
    });

    const text = response.text || "";
    const waypoints: Waypoint[] = [];
    
    const lines = text.split('\n');
    for (const line of lines) {
        if (line.includes('PLACE_MARKER|')) {
            const parts = line.split('|');
            if (parts.length >= 5) {
                const lat = parseFloat(parts[3].trim());
                const lon = parseFloat(parts[4].trim());
                if (!isNaN(lat) && !isNaN(lon)) {
                    waypoints.push({
                        label: parts[1].trim(),
                        address: parts[2].trim(),
                        lat: lat,
                        lon: lon,
                        description: parts[5]?.trim()
                    });
                }
            }
        }
    }
    
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

    return { waypoints, groundingMetadata };
  } catch (error) {
      console.error("Search error:", error);
      return { waypoints: [], groundingMetadata: null };
  }
}