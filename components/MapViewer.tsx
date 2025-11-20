import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, useMap, Marker, Popup } from 'react-leaflet';
import { TrackData, GeoPoint } from '../types';
import L from 'leaflet';

const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const iconShadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: iconUrl,
    shadowUrl: iconShadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    tooltipAnchor: [16, -28],
    shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapViewerProps {
  track: TrackData | null;
}

// Component to handle efficient rendering of many clickable points
const TrackPointsLayer = ({ points }: { points: GeoPoint[] }) => {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length === 0) return;

    const layerGroup = L.layerGroup();
    // Use canvas renderer for performance with large datasets
    const renderer = L.canvas({ padding: 0.5 });

    points.forEach(point => {
      const marker = L.circleMarker([point.lat, point.lon], {
        renderer: renderer,
        radius: 3, // Small visible dot
        color: '#3b82f6', // Blue-500
        fillColor: '#ffffff',
        fillOpacity: 0.8,
        weight: 1
      });

      // Create popup content string
      const popupContent = `
        <div class="font-sans text-sm">
          <div class="font-bold mb-1 text-gray-700">Track Point</div>
          <div class="grid grid-cols-[40px_1fr] gap-x-2 gap-y-1 text-xs text-gray-600">
            <span class="font-semibold">Lat:</span> <span class="font-mono">${point.lat.toFixed(5)}</span>
            <span class="font-semibold">Lon:</span> <span class="font-mono">${point.lon.toFixed(5)}</span>
            ${point.ele !== undefined ? `<span class="font-semibold">Ele:</span> <span class="font-mono">${point.ele.toFixed(1)} m</span>` : ''}
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
      layerGroup.addLayer(marker);
    });

    layerGroup.addTo(map);

    return () => {
      map.removeLayer(layerGroup);
    };
  }, [points, map]);

  return null;
};

const RecenterAutomatically = ({ bounds }: { bounds: [[number, number], [number, number]] }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds[0][0] !== 0) {
       try {
          map.fitBounds(bounds, { padding: [50, 50] });
       } catch(e) {
          console.warn("Invalid bounds", e);
       }
    }
  }, [bounds, map]);
  return null;
};

const StartEndMarkers = ({ points }: { points: { lat: number, lon: number }[] }) => {
    if (points.length < 2) return null;
    const start = points[0];
    const end = points[points.length - 1];

    return (
        <>
            <Marker position={[start.lat, start.lon]}>
                <Popup>Start</Popup>
            </Marker>
            <Marker position={[end.lat, end.lon]}>
                <Popup>End</Popup>
            </Marker>
        </>
    );
}

const MapViewer: React.FC<MapViewerProps> = ({ track }) => {
  const defaultCenter: [number, number] = [51.505, -0.09];
  const defaultZoom = 3;

  return (
    <div className="h-full w-full z-0 relative">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        scrollWheelZoom={true}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {track && (
          <>
            <Polyline 
                positions={track.points.map(p => [p.lat, p.lon])} 
                pathOptions={{ color: '#3b82f6', weight: 3, opacity: 0.6 }} 
            />
            
            {/* Interactive points layer */}
            <TrackPointsLayer points={track.points} />

            {/* Start and End Markers */}
            <StartEndMarkers points={track.points} />
            
            {/* Automatically center map */}
            <RecenterAutomatically bounds={track.bounds} />
          </>
        )}
      </MapContainer>
    </div>
  );
};

export default MapViewer;