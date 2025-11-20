import React, { useState, useCallback } from 'react';
import { InputMode, TrackData, ParseResult } from '../types';
import { parseData } from '../services/parser';

interface SidebarProps {
  onDataLoaded: (data: TrackData) => void;
  currentTrack: TrackData | null;
}

const Sidebar: React.FC<SidebarProps> = ({ onDataLoaded, currentTrack }) => {
  const [mode, setMode] = useState<InputMode>(InputMode.FILE);
  const [textInput, setTextInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

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
      
      if (!result.success) {
        setError(result.error);
      } else {
        onDataLoaded(result.data);
      }
      setIsLoading(false);
    };
    
    reader.onerror = () => {
        setError("Failed to read file");
        setIsLoading(false);
    }
    
    reader.readAsText(file);
  };

  const handleTextSubmit = async () => {
    if (!textInput.trim()) return;
    setError(null);
    setIsLoading(true);
    
    const result: ParseResult = await parseData(textInput, 'Pasted Data');
    
    if (!result.success) {
      setError(result.error);
    } else {
      onDataLoaded(result.data);
      setFileName('Text Input');
    }
    setIsLoading(false);
  };

  return (
    <div className="absolute top-4 left-4 z-[1000] w-96 max-h-[90vh] bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden transition-all duration-300">
      {/* Header */}
      <div className="p-6 bg-slate-900 text-white">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-500 rounded-lg">
             <i className="fa-solid fa-map-location-dot text-xl"></i>
          </div>
          <div>
            <h1 className="font-bold text-lg">GeoTrack Visualizer</h1>
            <p className="text-xs text-slate-400">Visualize GPX, KML & CSV</p>
          </div>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-y-auto">
        {/* Tabs */}
        <div className="flex p-1 bg-slate-100 rounded-lg mb-6">
          <button
            onClick={() => setMode(InputMode.FILE)}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
              mode === InputMode.FILE
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            File Upload
          </button>
          <button
            onClick={() => setMode(InputMode.TEXT)}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
              mode === InputMode.TEXT
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Paste Text
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {mode === InputMode.FILE ? (
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
                className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-slate-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all cursor-pointer group"
              >
                <div className="p-4 bg-slate-100 rounded-full mb-3 group-hover:bg-white transition-colors">
                    <i className="fa-solid fa-cloud-arrow-up text-2xl text-slate-400 group-hover:text-blue-500"></i>
                </div>
                <p className="text-sm font-medium text-slate-600 group-hover:text-blue-600">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  GPX, KML, CSV (Latitude, Longitude)
                </p>
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Paste your GPX, KML, or CSV content here..."
                className="w-full h-48 p-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none outline-none"
              />
              <button
                onClick={handleTextSubmit}
                disabled={!textInput.trim() || isLoading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
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
          
          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-start space-x-2">
              <i className="fa-solid fa-circle-exclamation text-red-500 mt-0.5"></i>
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          {/* Stats Card */}
          {currentTrack && (
             <div className="mt-6 pt-6 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Track Info</h3>
                <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Name</span>
                        <span className="text-sm font-medium text-slate-900 truncate max-w-[150px]">{currentTrack.name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Points</span>
                        <span className="text-sm font-medium text-slate-900">{currentTrack.points.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Distance</span>
                        <span className="text-sm font-medium text-slate-900">
                             {currentTrack.distanceKm ? `${currentTrack.distanceKm.toFixed(2)} km` : 'N/A'}
                        </span>
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