import React, { useState, useEffect, useRef, useMemo } from 'react';
import { InputMode, TrackData, ParseResult, AnnotationMarker, Waypoint } from '../types';
import { parseData, getDistance } from '../services/parser';
import { searchPlaces } from '../services/ai';

interface SidebarProps {
  onDataLoaded: (data: TrackData) => void;
  onAnnotationsUpdate: (markers: AnnotationMarker[]) => void;
  currentTrack: TrackData | null;
  onAddWaypoint: (waypoint: Waypoint) => void;
  waypoints: Waypoint[];
  onRemoveWaypoint: (index: number) => void;
  onSimulationUpdate: (point: {lat: number, lon: number, bearing: number} | null) => void;
  onAutoFollowChange: (follow: boolean) => void;
  isAutoFollow: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ onDataLoaded, onAnnotationsUpdate, currentTrack, onAddWaypoint, waypoints, onRemoveWaypoint, onSimulationUpdate, onAutoFollowChange, isAutoFollow }) => {
  const [mode, setMode] = useState<InputMode>(InputMode.FILE);
  const [textInput, setTextInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Waypoint[]>([]);
  const [groundingChunks, setGroundingChunks] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Master visibility toggle for smart markers
  const [showSmartMarkers, setShowSmartMarkers] = useState(true);

  // Simulation State
  const [isSimulating, setIsSimulating] = useState(false);
  const [simProgress, setSimProgress] = useState(0); // 0 to 1
  const [simSpeed, setSimSpeed] = useState(100); // km/h

  // Smart Annotations Configuration
  const [annotConfig, setAnnotConfig] = useState({
      time: { enabled: false, value: 10, unit: 'min' as 'min' | 'hr' },
      distance: { enabled: false, value: 1, unit: 'km' as 'km' | 'mi' | 'm' },
      stop: { enabled: false, minDuration: 5, unit: 'min' as 'min' | 'sec' },
      speed: { enabled: false, limit: 100, unit: 'kmh' as 'kmh' | 'mph' }
  });

  // Draggable State
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        e.preventDefault();
        setPosition({
            x: e.clientX - dragOffset.current.x,
            y: e.clientY - dragOffset.current.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    if (isDragging) {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // --- Statistics & Metadata ---
  const trackMetadata = useMemo(() => {
    if (!currentTrack || !currentTrack.points || currentTrack.points.length === 0) return null;

    const points = currentTrack.points;
    let maxEle = -Infinity;
    let minEle = Infinity;
    let maxSpeed = 0;
    
    const hasElevation = points.some(p => p.ele !== undefined && p.ele !== 0);
    const hasTime = points.some(p => p.time !== undefined);

    const startTime = points[0].time ? new Date(points[0].time).getTime() : null;
    const endTime = points[points.length - 1].time ? new Date(points[points.length - 1].time).getTime() : null;
    
    // Calculate formatted date
    let fullDateStr = '';
    if (points[0].time) {
        const dateObj = new Date(points[0].time);
        fullDateStr = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
    }

    let totalTimeMs = 0;
    if (startTime && endTime) {
        totalTimeMs = endTime - startTime;
    }

    // Pre-calculate cumulative distances for simulation
    const cumulativeDistances = [0];
    let currentDist = 0;

    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        
        if (i > 0) {
            const dist = getDistance(points[i-1], p);
            currentDist += dist;
            cumulativeDistances.push(currentDist);
        }

        if (p.ele !== undefined) {
            if (p.ele > maxEle) maxEle = p.ele;
            if (p.ele < minEle) minEle = p.ele;
        }

        if (i > 0 && hasTime) {
            const prev = points[i-1];
            if (p.time && prev.time) {
                const t1 = new Date(prev.time).getTime();
                const t2 = new Date(p.time).getTime();
                const timeDiffHours = (t2 - t1) / 3600000;
                const distKm = getDistance(prev, p);
                if (timeDiffHours > 0) {
                    const speed = distKm / timeDiffHours;
                    if (speed < 1200 && speed > maxSpeed) maxSpeed = speed;
                }
            }
        }
    }
    
    if (maxEle === -Infinity) maxEle = 0;
    if (minEle === Infinity) minEle = 0;

    const avgSpeed = (currentTrack.distanceKm && totalTimeMs > 0) 
        ? currentTrack.distanceKm / (totalTimeMs / 3600000) 
        : 0;

    const hours = Math.floor(totalTimeMs / 3600000);
    const minutes = Math.floor((totalTimeMs % 3600000) / 60000);
    const seconds = Math.floor(((totalTimeMs % 3600000) % 60000) / 1000);
    
    let timeStr = 'N/A';
    if (startTime && endTime) {
        if (hours > 0) timeStr = `${hours}h ${minutes}m`;
        else if (minutes > 0) timeStr = `${minutes}m ${seconds}s`;
        else timeStr = `${seconds}s`;
    }

    return {
        maxEle,
        minEle,
        maxSpeed,
        avgSpeed,
        totalTime: timeStr,
        hasElevation,
        hasTime,
        cumulativeDistances,
        totalDist: currentDist,
        fullDate: fullDateStr
    };
  }, [currentTrack]);

  // --- Simulation Logic ---
  const toRad = (deg: number) => deg * Math.PI / 180;
  const toDeg = (rad: number) => rad * 180 / Math.PI;

  const calculateBearing = (startLat: number, startLng: number, destLat: number, destLng: number) => {
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

  // Animation Loop
  useEffect(() => {
    if (!isSimulating || !trackMetadata || !currentTrack) return;

    let lastTime = performance.now();
    let requestId: number;

    const animate = (time: number) => {
        const dt = (time - lastTime) / 1000; // seconds
        lastTime = time;

        // km per second = speedKmh / 3600
        const distMovedKm = (simSpeed / 3600) * dt;
        
        setSimProgress(prev => {
            const currentDistanceKm = prev * trackMetadata.totalDist;
            const newDistanceKm = currentDistanceKm + distMovedKm;
            
            if (newDistanceKm >= trackMetadata.totalDist) {
                setIsSimulating(false);
                return 1;
            }
            return newDistanceKm / trackMetadata.totalDist;
        });

        requestId = requestAnimationFrame(animate);
    };

    requestId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestId);
  }, [isSimulating, simSpeed, trackMetadata, currentTrack]);

  // Update Simulation Position
  useEffect(() => {
    if (!trackMetadata || !currentTrack) {
        onSimulationUpdate(null);
        return;
    }
    
    const targetDist = simProgress * trackMetadata.totalDist;
    const dists = trackMetadata.cumulativeDistances;
    
    // Find the segment
    let idx = 0;
    for (let i = 0; i < dists.length - 1; i++) {
        if (targetDist >= dists[i] && targetDist <= dists[i+1]) {
            idx = i;
            break;
        }
    }
    
    // Interpolate
    const p1 = currentTrack.points[idx];
    const p2 = currentTrack.points[idx+1];

    if (!p2) {
        // End of track
        onSimulationUpdate({ lat: p1.lat, lon: p1.lon, bearing: 0 });
        return;
    }

    const segmentLength = dists[idx+1] - dists[idx];
    const segmentProgress = segmentLength > 0 ? (targetDist - dists[idx]) / segmentLength : 0;
    
    const lat = p1.lat + (p2.lat - p1.lat) * segmentProgress;
    const lon = p1.lon + (p2.lon - p1.lon) * segmentProgress;
    
    // Calculate bearing for the car
    const bearing = calculateBearing(p1.lat, p1.lon, p2.lat, p2.lon);

    onSimulationUpdate({ lat, lon, bearing });

  }, [simProgress, trackMetadata, currentTrack, onSimulationUpdate]);


  // --- Smart Annotations Calculation ---
  useEffect(() => {
    if (!currentTrack) {
        onAnnotationsUpdate([]);
        return;
    }

    if (!showSmartMarkers) {
        onAnnotationsUpdate([]);
        return;
    }

    const markers: AnnotationMarker[] = [];
    const { time, distance, stop, speed } = annotConfig;
    
    const speedLimitKmh = speed.unit === 'mph' ? speed.limit * 1.60934 : speed.limit;
    const stopMinDurationMs = (stop.unit === 'min' ? stop.minDuration * 60 : stop.minDuration) * 1000;
    const distIntervalKm = distance.unit === 'km' ? distance.value : (distance.unit === 'mi' ? distance.value * 1.60934 : distance.value / 1000);
    const timeIntervalMs = (time.unit === 'hr' ? time.value * 60 : time.value) * 60 * 1000;

    let accumDist = 0;
    let nextDistMarker = distIntervalKm;
    
    let accumTimeMs = 0;
    let nextTimeMarker = timeIntervalMs;
    let firstTime = currentTrack.points[0]?.time ? new Date(currentTrack.points[0].time).getTime() : null;

    let stopStartTime: number | null = null;
    let stopStartPoint: any = null;

    for(let i = 0; i < currentTrack.points.length - 1; i++) {
        const p1 = currentTrack.points[i];
        const p2 = currentTrack.points[i+1];
        const dist = getDistance(p1, p2);
        accumDist += dist;

        if (distance.enabled && accumDist >= nextDistMarker) {
             markers.push({ 
                 lat: p2.lat, 
                 lon: p2.lon, 
                 type: 'DISTANCE', 
                 label: `${distance.unit === 'm' ? (nextDistMarker * 1000).toFixed(0) : nextDistMarker.toFixed(1)}${distance.unit}`,
                 detail: `Total: ${accumDist.toFixed(2)}km`
             });
             nextDistMarker += distIntervalKm;
        }

        if (p1.time && p2.time && firstTime) {
            const t1 = new Date(p1.time).getTime();
            const t2 = new Date(p2.time).getTime();
            const timeDiffHours = (t2 - t1) / 3600000;
            
            accumTimeMs = t2 - firstTime;

            if (time.enabled && accumTimeMs >= nextTimeMarker) {
                 markers.push({
                     lat: p2.lat, 
                     lon: p2.lon, 
                     type: 'TIME',
                     label: `+${(accumTimeMs / (1000 * (time.unit === 'hr' ? 3600 : 60))).toFixed(0)} ${time.unit}`,
                     detail: `Time elapsed: ${(accumTimeMs/60000).toFixed(0)} mins`
                 });
                 nextTimeMarker += timeIntervalMs;
            }

            const speedKmh = timeDiffHours > 0 ? dist / timeDiffHours : 0;

            if (speed.enabled && speedKmh > speedLimitKmh) {
                const prevTime = i > 0 && currentTrack.points[i-1].time ? new Date(currentTrack.points[i-1].time!).getTime() : 0;
                const prevDist = i > 0 ? getDistance(currentTrack.points[i-1], p1) : 0;
                const prevSpeed = (i > 0 && prevTime) ? prevDist / ((t1 - prevTime) / 3600000) : 0;

                if (prevSpeed <= speedLimitKmh) {
                     markers.push({
                         lat: p1.lat,
                         lon: p1.lon,
                         type: 'SPEED',
                         label: `! ${speed.unit === 'mph' ? (speedKmh / 1.609).toFixed(0) : speedKmh.toFixed(0)}`,
                         detail: `Speeding: ${speedKmh.toFixed(1)} km/h`
                     });
                }
            }

            if (stop.enabled) {
                const isStopped = speedKmh < 1;
                if (isStopped) {
                    if (!stopStartTime) {
                        stopStartTime = t1;
                        stopStartPoint = p1;
                    }
                } else {
                    if (stopStartTime) {
                        const duration = t1 - stopStartTime;
                        if (duration >= stopMinDurationMs) {
                             const durationMins = (duration / 60000).toFixed(1);
                             markers.push({
                                 lat: stopStartPoint.lat,
                                 lon: stopStartPoint.lon,
                                 type: 'STOP',
                                 label: `Stop ${durationMins}m`,
                                 detail: `Stopped for ${durationMins} mins`
                             });
                        }
                        stopStartTime = null;
                        stopStartPoint = null;
                    }
                }
            }
        }
    }

    if (stop.enabled && stopStartTime && stopStartPoint && currentTrack.points.length > 0) {
         const lastPoint = currentTrack.points[currentTrack.points.length-1];
         if (lastPoint.time) {
             const tLast = new Date(lastPoint.time).getTime();
             const duration = tLast - stopStartTime;
             if (duration >= stopMinDurationMs) {
                 const durationMins = (duration / 60000).toFixed(1);
                 markers.push({
                     lat: stopStartPoint.lat,
                     lon: stopStartPoint.lon,
                     type: 'STOP',
                     label: `Stop ${durationMins}m`,
                     detail: `Stopped for ${durationMins} mins`
                 });
             }
         }
    }
    onAnnotationsUpdate(markers);
  }, [annotConfig, currentTrack, onAnnotationsUpdate, showSmartMarkers]);

  const updateAnnot = (key: keyof typeof annotConfig, updates: Partial<typeof annotConfig[keyof typeof annotConfig]>) => {
      setAnnotConfig(prev => ({
          ...prev,
          [key]: { ...prev[key], ...updates }
      }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsLoading(true);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      const result: ParseResult = await parseData(content, file.name);
      
      if (result.success) {
        onDataLoaded(result.data);
        setSimProgress(0);
        setIsSimulating(false);
      } else {
        setError((result as { success: false; error: string }).error);
      }
      setIsLoading(false);
    };
    reader.readAsText(file);
  };

  const handleTextSubmit = async () => {
    if (!textInput.trim()) return;
    setError(null);
    setIsLoading(true);
    const result: ParseResult = await parseData(textInput, 'Pasted Data');
    if (result.success) {
      onDataLoaded(result.data);
      setFileName('Text Input');
      setSimProgress(0);
      setIsSimulating(false);
    } else {
      setError((result as { success: false; error: string }).error);
    }
    setIsLoading(false);
  };

  const handleSearch = async () => {
      if (!searchQuery.trim()) return;
      setIsSearching(true);
      setSearchResults([]);
      setGroundingChunks([]);
      setError(null);

      let center: {lat: number, lon: number} | undefined = undefined;
      if (currentTrack && currentTrack.bounds) {
          center = {
              lat: (currentTrack.bounds[0][0] + currentTrack.bounds[1][0]) / 2,
              lon: (currentTrack.bounds[0][1] + currentTrack.bounds[1][1]) / 2
          };
      } else {
          try {
              const pos: GeolocationPosition = await new Promise((resolve, reject) => 
                  navigator.geolocation.getCurrentPosition(resolve, reject, {timeout: 5000})
              );
              center = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          } catch(e) {}
      }

      const result = await searchPlaces(searchQuery, center);
      setSearchResults(result.waypoints);
      if (result.groundingMetadata?.groundingChunks) {
          setGroundingChunks(result.groundingMetadata.groundingChunks);
      }
      setIsSearching(false);
  };

  return (
    <div 
        style={{ left: position.x, top: position.y }}
        className="absolute z-[1000] w-96 max-h-[90vh] backdrop-blur-xl bg-white/60 border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.37)] rounded-2xl flex flex-col overflow-hidden ring-1 ring-black/5"
    >
      {/* Header */}
      <div 
        onMouseDown={handleMouseDown}
        className="p-6 bg-slate-900/85 backdrop-blur-md text-white cursor-move select-none border-b border-white/10"
      >
        <div className="flex items-center space-x-3 pointer-events-none">
          <img 
              src="https://aistudiocdn.com/La_Hermosa_Logo.png" 
              alt="La Hermosa" 
              className="w-12 h-12 rounded-lg object-contain bg-white" 
          />
          <div>
            <h1 className="font-bold text-lg drop-shadow-sm">GeoTrack Visualizer</h1>
            <p className="text-xs text-slate-300">Visualize GPX, KML & CSV</p>
          </div>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-400/30 scrollbar-track-transparent">
        {/* Tabs */}
        <div className="flex p-1 bg-white/40 rounded-lg mb-6 backdrop-blur-sm border border-white/20">
          <button
            onClick={() => setMode(InputMode.FILE)}
            className={`flex-1 py-2 text-xs font-medium rounded-md transition-all ${
              mode === InputMode.FILE
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-800 hover:bg-white/30'
            }`}
          >
            File
          </button>
          <button
            onClick={() => setMode(InputMode.TEXT)}
            className={`flex-1 py-2 text-xs font-medium rounded-md transition-all ${
              mode === InputMode.TEXT
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-800 hover:bg-white/30'
            }`}
          >
            Text
          </button>
          <button
            onClick={() => setMode(InputMode.SEARCH)}
            className={`flex-1 py-2 text-xs font-medium rounded-md transition-all ${
              mode === InputMode.SEARCH
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-800 hover:bg-white/30'
            }`}
          >
            Search
          </button>
        </div>

        <div className="space-y-4">
          {mode === InputMode.FILE && (
            <div className="relative">
              <input
                type="file"
                onChange={handleFileChange}
                accept=".gpx,.kml,.csv,.txt"
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-slate-400/50 bg-white/30 rounded-xl hover:border-blue-500 hover:bg-blue-50/50 transition-all cursor-pointer group backdrop-blur-sm"
              >
                <div className="p-4 bg-white/60 rounded-full mb-3 group-hover:bg-white transition-colors shadow-sm">
                    <i className="fa-solid fa-cloud-arrow-up text-2xl text-slate-400 group-hover:text-blue-500"></i>
                </div>
                <p className="text-sm font-medium text-slate-700 group-hover:text-blue-600">
                  Click to upload or drag and drop
                </p>
              </label>
            </div>
          )}
          
          {mode === InputMode.TEXT && (
            <div className="space-y-3">
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Paste your GPX, KML, or CSV content here..."
                className="w-full h-48 p-3 text-xs font-mono bg-white/40 border border-slate-300/50 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none outline-none placeholder-slate-500 backdrop-blur-sm"
              />
              <button
                onClick={handleTextSubmit}
                disabled={!textInput.trim() || isLoading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-lg shadow-blue-600/20"
              >
                {isLoading ? (
                   <i className="fa-solid fa-circle-notch fa-spin"></i>
                ) : (
                   <i className="fa-solid fa-wand-magic-sparkles"></i>
                )}
                <span>Visualize Data</span>
              </button>
            </div>
          )}

          {mode === InputMode.SEARCH && (
              <div className="space-y-3">
                  <div className="relative">
                      <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                          placeholder="Search for places..."
                          className="w-full pl-10 pr-3 py-3 text-sm bg-white/50 border border-slate-300/50 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none backdrop-blur-sm placeholder-slate-500"
                      />
                      <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-3.5 text-slate-500"></i>
                  </div>
                  <button
                      onClick={handleSearch}
                      disabled={!searchQuery.trim() || isSearching}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center space-x-2 shadow-lg shadow-blue-600/20"
                  >
                      {isSearching ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-location-crosshairs"></i>}
                      <span>Find Places</span>
                  </button>

                  {searchResults.length > 0 && (
                      <div className="mt-4 space-y-2">
                          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Results</h3>
                          {searchResults.map((place, idx) => (
                              <div key={idx} className="p-3 bg-white/60 border border-white/60 rounded-lg shadow-sm hover:border-blue-300 hover:bg-white/80 transition-all backdrop-blur-md">
                                  <div className="flex justify-between items-start mb-1">
                                      <div className="font-bold text-slate-800 text-sm">{place.label}</div>
                                      <button onClick={() => onAddWaypoint(place)} className="text-xs bg-blue-100/80 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition-colors"><i className="fa-solid fa-plus mr-1"></i> Add</button>
                                  </div>
                                  <div className="text-xs text-slate-600 mb-1">{place.address}</div>
                              </div>
                          ))}
                      </div>
                  )}
                  {groundingChunks.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-200/50">
                          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Sources</h4>
                          <div className="space-y-1">
                             {groundingChunks.map((chunk, i) => {
                                 const uri = chunk.web?.uri || chunk.maps?.uri;
                                 const title = chunk.web?.title || chunk.maps?.title || 'Source Link';
                                 return uri ? <a key={i} href={uri} target="_blank" rel="noopener noreferrer" className="block text-xs text-blue-600 hover:underline truncate"><i className="fa-solid fa-arrow-up-right-from-square text-[10px] mr-1"></i>{title}</a> : null;
                             })}
                          </div>
                      </div>
                  )}
              </div>
          )}

          {error && (
            <div className="p-3 bg-red-50/80 border border-red-100 rounded-lg flex items-start space-x-2 backdrop-blur-sm">
              <i className="fa-solid fa-circle-exclamation text-red-500 mt-0.5"></i>
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {waypoints.length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-200/50">
                 <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Added Places</h3>
                 <div className="space-y-2">
                     {waypoints.map((wp, idx) => (
                         <div key={idx} className="flex justify-between items-center p-2 bg-orange-50/60 rounded-lg border border-orange-100 backdrop-blur-sm">
                             <div className="flex items-center space-x-2 overflow-hidden">
                                 <div className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0"></div>
                                 <span className="text-xs font-medium text-slate-800 truncate">{wp.label}</span>
                             </div>
                             <button onClick={() => onRemoveWaypoint(idx)} className="text-slate-400 hover:text-red-500 transition-colors"><i className="fa-solid fa-xmark"></i></button>
                         </div>
                     ))}
                 </div>
              </div>
          )}

          {currentTrack && (
             <div className="mt-6 pt-6 border-t border-slate-200/50">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Track Info</h3>
                <div className="bg-white/40 rounded-xl p-4 space-y-3 border border-white/40 backdrop-blur-sm">
                    <div className="flex justify-between items-center"><span className="text-sm text-slate-600">Name</span><span className="text-sm font-medium text-slate-900 truncate max-w-[150px]">{currentTrack.name}</span></div>
                    <div className="flex justify-between items-center"><span className="text-sm text-slate-600">Points</span><span className="text-sm font-medium text-slate-900">{currentTrack.points.length}</span></div>
                    <div className="flex justify-between items-center"><span className="text-sm text-slate-600">Distance</span><span className="text-sm font-medium text-slate-900">{currentTrack.distanceKm ? `${currentTrack.distanceKm.toFixed(2)} km` : 'N/A'}</span></div>
                </div>
             </div>
          )}

          {/* Detailed Statistics */}
          {trackMetadata && (
              <div className="mt-6 pt-6 border-t border-slate-200/50">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Detailed Statistics</h3>
                  <div className="bg-white/40 rounded-xl p-4 grid grid-cols-2 gap-3 border border-white/40 backdrop-blur-sm">
                      <div><span className="text-[10px] text-slate-500 block">Max Elevation</span><span className="text-sm font-medium text-slate-900">{trackMetadata.hasElevation ? `${trackMetadata.maxEle.toFixed(1)} m` : 'N/A'}</span></div>
                      <div><span className="text-[10px] text-slate-500 block">Min Elevation</span><span className="text-sm font-medium text-slate-900">{trackMetadata.hasElevation ? `${trackMetadata.minEle.toFixed(1)} m` : 'N/A'}</span></div>
                      <div><span className="text-[10px] text-slate-500 block">Avg Speed</span><span className="text-sm font-medium text-slate-900">{trackMetadata.hasTime ? `${trackMetadata.avgSpeed.toFixed(1)} km/h` : 'N/A'}</span></div>
                      <div><span className="text-[10px] text-slate-500 block">Max Speed</span><span className="text-sm font-medium text-slate-900">{trackMetadata.hasTime ? `${trackMetadata.maxSpeed.toFixed(1)} km/h` : 'N/A'}</span></div>
                      <div className="col-span-2 pt-2 border-t border-slate-300/30 mt-1"><div className="flex justify-between items-center"><span className="text-[10px] text-slate-500">Total Time</span><span className="text-sm font-medium text-slate-900">{trackMetadata.totalTime}</span></div></div>
                  </div>
              </div>
          )}

          {/* Simulation Controls */}
          {currentTrack && trackMetadata && (
            <div className="mt-6 pt-6 border-t border-slate-200/50">
                 <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Journey Simulation</h3>
                    {trackMetadata.fullDate && (
                        <span className="text-[10px] font-semibold text-blue-700 bg-blue-50/80 px-2 py-0.5 rounded border border-blue-200 backdrop-blur-sm">
                            {trackMetadata.fullDate}
                        </span>
                    )}
                 </div>
                 <div className="bg-white/40 rounded-xl p-4 border border-white/40 backdrop-blur-sm space-y-4">
                     <div className="flex items-center space-x-3">
                        <button 
                            onClick={() => setIsSimulating(!isSimulating)}
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-all shadow-lg ${isSimulating ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                        >
                            <i className={`fa-solid ${isSimulating ? 'fa-pause' : 'fa-play'} text-sm`}></i>
                        </button>
                        <div className="flex-1">
                            <div className="flex justify-between mb-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Progress</span>
                                <span className="text-[10px] font-mono text-slate-700">{(simProgress * 100).toFixed(0)}%</span>
                            </div>
                            <input 
                                type="range" 
                                min="0" 
                                max="1" 
                                step="0.001"
                                value={simProgress} 
                                onChange={(e) => {
                                    setSimProgress(parseFloat(e.target.value));
                                    if(isSimulating) setIsSimulating(false);
                                }}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                        </div>
                     </div>
                     
                     <div>
                         <div className="flex justify-between mb-1">
                             <span className="text-[10px] font-bold text-slate-500 uppercase">Speed (Simulated)</span>
                             <span className="text-[10px] font-mono text-slate-700">{simSpeed} km/h</span>
                         </div>
                         <input 
                             type="range" 
                             min="10" 
                             max="1000" 
                             step="10"
                             value={simSpeed}
                             onChange={(e) => setSimSpeed(parseInt(e.target.value))}
                             className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                         />
                     </div>

                     <div className="pt-3 mt-3 border-t border-white/30 flex items-center justify-between">
                        <label className="flex items-center space-x-2 cursor-pointer select-none">
                            <div className="relative">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer"
                                    checked={isAutoFollow}
                                    onChange={(e) => onAutoFollowChange(e.target.checked)}
                                />
                                <div className="w-9 h-5 bg-slate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                            </div>
                            <span className="text-xs font-medium text-slate-600">Auto-focus Car</span>
                        </label>
                     </div>
                 </div>
            </div>
          )}

          {/* Smart Markers Controls */}
          {currentTrack && (
            <div className="mt-6 pt-6 border-t border-slate-200/50">
                 <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Smart Markers</h3>
                    <button onClick={() => setShowSmartMarkers(!showSmartMarkers)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${showSmartMarkers ? 'bg-blue-600' : 'bg-slate-300/50'}`}>
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${showSmartMarkers ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                 </div>
                 
                 <div className={`transition-all duration-300 ${showSmartMarkers ? 'opacity-100' : 'opacity-40 grayscale pointer-events-none'}`}>
                     <div className="grid grid-cols-4 gap-2 mb-4">
                        <button onClick={() => updateAnnot('time', { enabled: !annotConfig.time.enabled })} className={`p-3 rounded-xl border transition-all backdrop-blur-sm ${annotConfig.time.enabled ? 'bg-violet-50/80 border-violet-200 text-violet-600 shadow-sm' : 'bg-white/30 border-slate-200/50 text-slate-400 hover:bg-white/50'}`} title="Time"><i className="fa-solid fa-clock text-xl"></i></button>
                        <button onClick={() => updateAnnot('distance', { enabled: !annotConfig.distance.enabled })} className={`p-3 rounded-xl border transition-all backdrop-blur-sm ${annotConfig.distance.enabled ? 'bg-emerald-50/80 border-emerald-200 text-emerald-600 shadow-sm' : 'bg-white/30 border-slate-200/50 text-slate-400 hover:bg-white/50'}`} title="Distance"><i className="fa-solid fa-ruler-horizontal text-xl"></i></button>
                        <button onClick={() => updateAnnot('stop', { enabled: !annotConfig.stop.enabled })} className={`p-3 rounded-xl border transition-all backdrop-blur-sm ${annotConfig.stop.enabled ? 'bg-rose-50/80 border-rose-200 text-rose-600 shadow-sm' : 'bg-white/30 border-slate-200/50 text-slate-400 hover:bg-white/50'}`} title="Stops"><i className="fa-solid fa-hand text-xl"></i></button>
                        <button onClick={() => updateAnnot('speed', { enabled: !annotConfig.speed.enabled })} className={`p-3 rounded-xl border transition-all backdrop-blur-sm ${annotConfig.speed.enabled ? 'bg-amber-50/80 border-amber-200 text-amber-600 shadow-sm' : 'bg-white/30 border-slate-200/50 text-slate-400 hover:bg-white/50'}`} title="Speed"><i className="fa-solid fa-gauge-high text-xl"></i></button>
                     </div>
                 </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;