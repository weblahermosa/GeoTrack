import React, { useState } from 'react';
import MapViewer from './components/MapViewer';
import Sidebar from './components/Sidebar';
import { TrackData, AnnotationMarker, Waypoint } from './types';

const App: React.FC = () => {
  const [trackData, setTrackData] = useState<TrackData | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationMarker[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [simulationPoint, setSimulationPoint] = useState<{lat: number, lon: number, bearing: number} | null>(null);
  const [autoFollow, setAutoFollow] = useState(false);

  const handleAddWaypoint = (waypoint: Waypoint) => {
    setWaypoints(prev => [...prev, waypoint]);
  };

  const handleRemoveWaypoint = (index: number) => {
    setWaypoints(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-50">
      {/* MapViewer rendered first so Sidebar sits on top */}
      <MapViewer 
        track={trackData} 
        annotations={annotations} 
        waypoints={waypoints}
        simulationPoint={simulationPoint}
        autoFollow={autoFollow}
      />
      
      <Sidebar 
        onDataLoaded={setTrackData} 
        currentTrack={trackData}
        onAnnotationsUpdate={setAnnotations}
        onAddWaypoint={handleAddWaypoint}
        waypoints={waypoints}
        onRemoveWaypoint={handleRemoveWaypoint}
        onSimulationUpdate={setSimulationPoint}
        onAutoFollowChange={setAutoFollow}
        isAutoFollow={autoFollow}
      />
    </div>
  );
};

export default App;