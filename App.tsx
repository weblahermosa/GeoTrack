import React, { useState } from 'react';
import MapViewer from './components/MapViewer';
import Sidebar from './components/Sidebar';
import { TrackData } from './types';

const App: React.FC = () => {
  const [trackData, setTrackData] = useState<TrackData | null>(null);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-50">
      <Sidebar 
        onDataLoaded={setTrackData} 
        currentTrack={trackData}
      />
      <MapViewer track={trackData} />
    </div>
  );
};

export default App;