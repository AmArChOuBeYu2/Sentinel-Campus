import React from 'react';
import {
  MapPin,
  Wifi,
  WifiOff,
  Users,
  Sparkles,
} from 'lucide-react';
import { UserRole } from '../types';
import { GeolocationMode, geofenceService } from '../services/geofence';
import { offlineSyncService } from '../services/offlineSync';

interface DemoControlBarProps {
  currentRole: UserRole;
  currentUserId: string;
  onSelectUser: (userId: string) => void;
  geoMode: GeolocationMode;
  onGeoModeChange: (mode: GeolocationMode) => void;
  isSimulatedOffline: boolean;
  onToggleOffline: (offline: boolean) => void;
}

export const DemoControlBar: React.FC<DemoControlBarProps> = ({
  currentUserId,
  onSelectUser,
  geoMode,
  onGeoModeChange,
  isSimulatedOffline,
  onToggleOffline,
}) => {
  return (
    <aside aria-label="Demo Testing Controls" className="bg-[#800020] text-white px-3 py-1.5 text-xs shadow-inner">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
        {/* Title */}
        <div className="flex items-center space-x-1.5 font-bold tracking-tight text-[11px]">
          <Sparkles className="w-3 h-3 text-amber-300" />
          <span>IEEE IGNITE 2026 DEMO CONTROLS:</span>
        </div>

        {/* User Switcher */}
        <div className="flex items-center space-x-1.5">
          <span className="text-white/80 flex items-center gap-1 font-medium text-[10px]">
            <Users className="w-3 h-3" /> Role:
          </span>
          <div className="flex bg-[#630018] rounded-lg p-0.5 border border-white/20">
            <button
              onClick={() => onSelectUser('usr_stu_0001')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                currentUserId === 'usr_stu_0001'
                  ? 'bg-white text-[#800020] shadow-xs'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              Student (Amar)
            </button>
            <button
              onClick={() => onSelectUser('usr_tch_0001')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                currentUserId === 'usr_tch_0001'
                  ? 'bg-white text-[#800020] shadow-xs'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              Teacher (Dr. Rajesh)
            </button>
            <button
              onClick={() => onSelectUser('usr_sta_0001')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                currentUserId === 'usr_sta_0001'
                  ? 'bg-white text-[#800020] shadow-xs'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              Staff (Er. Priya)
            </button>
            <button
              onClick={() => onSelectUser('usr_adm_0001')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                currentUserId === 'usr_adm_0001'
                  ? 'bg-white text-[#800020] shadow-xs'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              Admin (Dean)
            </button>
          </div>
        </div>

        {/* GPS Mode Selector */}
        <div className="flex items-center space-x-1">
          <span className="text-white/80 flex items-center gap-1 font-medium text-[10px]">
            <MapPin className="w-3 h-3" /> GPS:
          </span>
          <select
            value={geoMode}
            onChange={(e) => {
              const mode = e.target.value as GeolocationMode;
              geofenceService.setMode(mode);
              onGeoModeChange(mode);
            }}
            className="bg-[#630018] text-white border border-white/20 rounded-md px-1.5 py-0.5 text-[10px] font-bold focus:outline-none cursor-pointer"
          >
            <option value="skit_inside">Inside SKIT Campus (~15m, Pass)</option>
            <option value="jaipur_outside">Outside (Jaipur Airport 6km, Reject)</option>
            <option value="inaccurate_gps">Inaccurate GPS (±145m, Reject)</option>
            <option value="real">Real Device Browser GPS</option>
          </select>
        </div>

        {/* Offline Simulator Toggle */}
        <button
          onClick={() => {
            const next = !isSimulatedOffline;
            offlineSyncService.setSimulatedOffline(next);
            onToggleOffline(next);
          }}
          className={`flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer ${
            isSimulatedOffline
              ? 'bg-amber-400 text-slate-950 border-amber-300'
              : 'bg-white/10 text-white border-white/25 hover:bg-white/20'
          }`}
        >
          {isSimulatedOffline ? (
            <>
              <WifiOff className="w-3 h-3" />
              <span>Offline Mode Active</span>
            </>
          ) : (
            <>
              <Wifi className="w-3 h-3" />
              <span>Simulate Offline</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
