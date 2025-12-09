import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, useMap, Marker, Popup, ZoomControl } from 'react-leaflet';
import { TrackData, GeoPoint, AnnotationMarker, Waypoint, SimulationStatus } from '../types';
import { getDistance } from '../services/parser';
import L from 'leaflet';
import 'leaflet.markercluster';

const iconUrl = 'https://aistudiocdn.com/La_Hermosa_Logo.png';

// Default fallback icon for generic markers
let DefaultIcon = L.icon({
    iconUrl: iconUrl,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -10],
    tooltipAnchor: [16, -28],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom Icons for Start, End, and Car
const startIcon = L.divIcon({
    className: 'custom-start-icon',
    html: `<div class="w-8 h-8 rounded-full bg-green-600 border-2 border-white shadow-lg flex items-center justify-center text-white transform hover:scale-110 transition-transform"><i class="fa-solid fa-play text-[10px] ml-0.5"></i></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});

const endIcon = L.divIcon({
    className: 'custom-end-icon',
    html: `<div class="w-8 h-8 rounded-full bg-red-600 border-2 border-white shadow-lg flex items-center justify-center text-white transform hover:scale-110 transition-transform"><i class="fa-solid fa-flag-checkered text-[10px]"></i></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});

interface MapViewerProps {
  track: TrackData | null;
  annotations: AnnotationMarker[];
  waypoints: Waypoint[];
  simulationStatus?: SimulationStatus | null;
  autoFollow?: boolean;
}

const CarMarker = ({ status }: { status: SimulationStatus }) => {
    // Create icon dynamically to update rotation
    const carIcon = L.divIcon({
        className: 'custom-car-icon',
        html: `<div class="w-10 h-10 bg-blue-600 rounded-full border-2 border-white shadow-xl flex items-center justify-center text-white" style="transform: rotate(${status.point.bearing}deg); transition: transform 0.1s linear;"><i class="fa-solid fa-car-side text-base"></i></div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20]
    });

    return (
        <Marker position={[status.point.lat, status.point.lon]} icon={carIcon} zIndexOffset={1000}>
            <Popup>
                <div className="text-center min-w-[140px]">
                    <div className="font-bold text-blue-600 mb-1">Simulating</div>
                    <div className="text-xs text-slate-600 font-mono mb-1">
                        {status.time ? status.time.toLocaleTimeString() : 'N/A'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                         {status.time ? status.time.toLocaleDateString() : ''}
                    </div>
                </div>
            </Popup>
        </Marker>
    );
};

// Helper for Directional Arrows
const calculateBearing = (startLat: number, startLng: number, destLat: number, destLng: number) => {
    const toRad = (deg: number) => deg * Math.PI / 180;
    const toDeg = (rad: number) => rad * 180 / Math.PI;
    
    const startLatRad = toRad(startLat);
    const startLngRad = toRad(startLng);
    const destLatRad = toRad(destLat);
    const destLngRad = toRad(destLng);

    const y = Math.sin(destLngRad - startLngRad) * Math.cos(destLatRad);
    const x = Math.cos(startLatRad) * Math.sin(destLatRad) -
            Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(destLngRad - startLngRad);
    let brng = Math.atan2(y, x);
    brng = toDeg(brng);
    return (brng + 360) % 360;
};

const DirectionalArrowsLayer = ({ points }: { points: GeoPoint[] }) => {
    if (!points || points.length < 2) return null;

    // Logic to select a subset of points for arrows to avoid clutter
    // Aim for roughly 30-40 arrows max depending on track length
    const totalPoints = points.length;
    const step = Math.max(2, Math.floor(totalPoints / 40));
    
    const arrowMarkers = [];

    for (let i = 0; i < totalPoints - 1; i += step) {
        const p1 = points[i];
        // Look ahead slightly for better bearing smoothing if points are very close
        const nextIdx = Math.min(i + Math.max(1, Math.floor(step/2)), totalPoints - 1);
        const p2 = points[nextIdx];
        
        if (p1.lat === p2.lat && p1.lon === p2.lon) continue;

        const bearing = calculateBearing(p1.lat, p1.lon, p2.lat, p2.lon);
        
        const arrowIcon = L.divIcon({
            className: 'bg-transparent border-none',
            html: `<div style="transform: rotate(${bearing}deg);" class="text-white/90 drop-shadow-md flex items-center justify-center"><i class="fa-solid fa-chevron-up text-xs font-bold" style="-webkit-text-stroke: 1px rgba(0,0,0,0.3);"></i></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        arrowMarkers.push(
            <Marker key={`arrow-${i}`} position={[p1.lat, p1.lon]} icon={arrowIcon} interactive={false} />
        );
    }

    return <>{arrowMarkers}</>;
};

// Component to handle auto-following the car
const AutoFollowController = ({ point, active }: { point: {lat: number, lon: number} | null | undefined, active: boolean }) => {
    const map = useMap();
    
    useEffect(() => {
        if (active && point) {
            // Use panTo for smooth animation, keep current zoom level
            map.panTo([point.lat, point.lon], { animate: true, duration: 0.5 });
        }
    }, [point, active, map]);
    
    return null;
};

// Component to render Smart Annotations using divIcons
const AnnotationsLayer = ({ markers }: { markers: AnnotationMarker[] }) => {
    if (!markers || markers.length === 0) return null;

    return (
        <>
            {markers.map((m, i) => {
                let bgColor = 'bg-blue-500';
                let iconClass = 'fa-info';
                let ringColor = 'ring-blue-200';

                switch(m.type) {
                    case 'TIME': 
                        bgColor = 'bg-violet-500'; 
                        ringColor = 'ring-violet-200';
                        iconClass = 'fa-clock'; 
                        break;
                    case 'DISTANCE': 
                        bgColor = 'bg-emerald-500'; 
                        ringColor = 'ring-emerald-200';
                        iconClass = 'fa-ruler-horizontal'; 
                        break;
                    case 'STOP': 
                        bgColor = 'bg-rose-500'; 
                        ringColor = 'ring-rose-200';
                        iconClass = 'fa-hand'; 
                        break;
                    case 'SPEED': 
                        bgColor = 'bg-amber-500'; 
                        ringColor = 'ring-amber-200';
                        iconClass = 'fa-gauge-high'; 
                        break;
                }

                const customIcon = L.divIcon({
                    className: 'custom-annotation-icon',
                    html: `<div class="w-8 h-8 rounded-full ${bgColor} flex items-center justify-center text-white shadow-lg ring-4 ${ringColor}"><i class="fa-solid ${iconClass} text-xs"></i></div>`,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16],
                    popupAnchor: [0, -10]
                });

                return (
                    <Marker key={`annot-${i}`} position={[m.lat, m.lon]} icon={customIcon}>
                        <Popup>
                            <div className="text-center min-w-[100px]">
                                <div className={`text-xs font-bold px-2 py-1 rounded text-white mb-2 inline-block ${bgColor}`}>{m.type}</div>
                                <div className="font-bold text-slate-800 text-lg">{m.label}</div>
                                {m.detail && <div className="text-slate-500 text-xs mt-1">{m.detail}</div>}
                            </div>
                        </Popup>
                    </Marker>
                );
            })}
        </>
    );
};

// Component to render user-added Waypoints from Search
const WaypointsLayer = ({ points }: { points: Waypoint[] }) => {
    if (!points || points.length === 0) return null;

    return (
        <>
            {points.map((p, i) => {
                 const customIcon = L.divIcon({
                    className: 'custom-waypoint-icon',
                    html: `<div class="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white shadow-lg ring-4 ring-orange-200"><i class="fa-solid fa-location-dot text-sm"></i></div>`,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16],
                    popupAnchor: [0, -10]
                });

                return (
                    <Marker key={`wp-${i}`} position={[p.lat, p.lon]} icon={customIcon}>
                        <Popup>
                            <div className="min-w-[150px]">
                                <div className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-1">Place</div>
                                <div className="font-bold text-slate-900 text-base leading-tight mb-1">{p.label}</div>
                                <div className="text-slate-600 text-xs mb-2">{p.address}</div>
                                {p.description && (
                                    <div className="p-2 bg-slate-50 rounded text-xs text-slate-500 italic border border-slate-100">
                                        "{p.description}"
                                    </div>
                                )}
                            </div>
                        </Popup>
                    </Marker>
                );
            })}
        </>
    );
};

// Component to handle efficient rendering of many clickable points using MarkerCluster
const TrackPointsLayer = ({ points }: { points: GeoPoint[] }) => {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length === 0) return;

    // Cast L to any because markerClusterGroup is added by the plugin
    const clusterGroup = (L as any).markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 60,
      disableClusteringAtZoom: 16,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false
    });

    const markers = points.map((point, index) => {
      const marker = L.circleMarker([point.lat, point.lon], {
        radius: 6,
        color: '#3b82f6',
        fillColor: '#ffffff',
        fillOpacity: 0.9,
        weight: 2
      });

      let speedInfo = '';
      if (index > 0 && point.time && points[index - 1].time) {
          const prev = points[index - 1];
          const dist = getDistance(prev, point);
          const timeDiffMs = new Date(point.time).getTime() - new Date(prev.time).getTime();
          if (timeDiffMs > 0) {
              const timeDiffHours = timeDiffMs / 3600000;
              const speedKmh = dist / timeDiffHours;
              speedInfo = `<span class="font-semibold">Speed:</span> <span class="font-mono">${speedKmh.toFixed(1)} km/h</span>`;
          }
      }

      const popupContent = `
        <div class="font-sans text-sm">
          <div class="font-bold mb-1 text-gray-700">Track Point</div>
          <div class="grid grid-cols-[40px_1fr] gap-x-2 gap-y-1 text-xs text-gray-600">
            <span class="font-semibold">Lat:</span> <span class="font-mono">${point.lat.toFixed(5)}</span>
            <span class="font-semibold">Lon:</span> <span class="font-mono">${point.lon.toFixed(5)}</span>
            ${point.ele !== undefined ? `<span class="font-semibold">Ele:</span> <span class="font-mono">${point.ele.toFixed(1)} m</span>` : ''}
            ${point.time ? `<span class="font-semibold">Time:</span> <span class="font-mono">${new Date(point.time).toLocaleTimeString()}</span>` : ''}
            ${speedInfo}
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
      return marker;
    });

    clusterGroup.addLayers(markers);
    map.addLayer(clusterGroup);

    return () => {
      map.removeLayer(clusterGroup);
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
            <Marker position={[start.lat, start.lon]} icon={startIcon}>
                <Popup>
                    <div className="text-center font-bold text-green-700">Start Point</div>
                </Popup>
            </Marker>
            <Marker position={[end.lat, end.lon]} icon={endIcon}>
                <Popup>
                    <div className="text-center font-bold text-red-700">End Point</div>
                </Popup>
            </Marker>
        </>
    );
}

// Custom Location Control
const LocateControl = () => {
    const map = useMap();

    const handleLocate = () => {
        map.locate({ setView: true, maxZoom: 15 });
    };

    return (
        <div className="leaflet-top leaflet-right" style={{ marginTop: '80px' }}>
            <div className="leaflet-bar leaflet-control">
                <a 
                    className="leaflet-control-custom-button flex items-center justify-center bg-white hover:bg-gray-100 cursor-pointer"
                    style={{ width: '30px', height: '30px', lineHeight: '30px' }}
                    onClick={(e) => { e.preventDefault(); handleLocate(); }}
                    title="Show my location"
                    href="#"
                >
                    <i className="fa-solid fa-location-crosshairs text-slate-700"></i>
                </a>
            </div>
        </div>
    );
};

const MapViewer: React.FC<MapViewerProps> = ({ track, annotations, waypoints, simulationStatus, autoFollow = false }) => {
  const defaultCenter: [number, number] = [51.505, -0.09];
  const defaultZoom = 3;

  // Calculate traveled path for polyline based on simulation status
  const traveledPositions: [number, number][] = useMemo(() => {
    if (!track || !simulationStatus) return [];
    
    // Get all points up to the last passed index
    const path = track.points.slice(0, simulationStatus.lastIndex + 1).map(p => [p.lat, p.lon] as [number, number]);
    // Add the current interpolated position of the car
    path.push([simulationStatus.point.lat, simulationStatus.point.lon]);
    
    return path;
  }, [track, simulationStatus]);

  return (
    <div className="h-full w-full z-0 relative">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        scrollWheelZoom={true}
        zoomControl={false} // Disable default zoom control to move it
        className="h-full w-full"
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <ZoomControl position="topright" />
        <LocateControl />
        
        <WaypointsLayer points={waypoints} />
        
        {track && (
          <>
            {/* Base Track - Blue */}
            <Polyline 
                positions={track.points.map(p => [p.lat, p.lon])} 
                pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.6 }} 
            />
            
            {/* Traveled Path - Amber/Orange */}
            {simulationStatus && traveledPositions.length > 0 && (
                <Polyline 
                    positions={traveledPositions} 
                    pathOptions={{ color: '#f59e0b', weight: 4, opacity: 0.9 }} 
                />
            )}
            
            <DirectionalArrowsLayer points={track.points} />
            <TrackPointsLayer points={track.points} />
            <StartEndMarkers points={track.points} />
            <AnnotationsLayer markers={annotations} />
            <RecenterAutomatically bounds={track.bounds} />
          </>
        )}

        {simulationStatus && (
            <>
                <CarMarker status={simulationStatus} />
                <AutoFollowController point={simulationStatus.point} active={autoFollow || false} />
            </>
        )}
      </MapContainer>
    </div>
  );
};

export default MapViewer;