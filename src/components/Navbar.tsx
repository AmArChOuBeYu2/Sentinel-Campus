import React from 'react';
import {
  ShieldCheck,
  Wifi,
  WifiOff,
  CloudUpload,
  User,
  LogOut,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { UserProfile } from '../types';

interface NavbarProps {
  user: UserProfile | null;
  onLogout: () => void;
  isOnline: boolean;
  pendingSyncCount: number;
  onOpenSyncDrawer: () => void;
  onOpenEnrollment: () => void;
  onOpenCalendar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onLogout,
  isOnline,
  pendingSyncCount,
  onOpenSyncDrawer,
  onOpenCalendar,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 shadow-2xs">
      <div className="max-w-md md:max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Logo & Branding */}
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#800020] flex items-center justify-center text-white shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-black text-sm text-slate-900 tracking-tight">Sentinel Campus</span>
                <span className="hidden sm:inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full bg-[#800020]/10 text-[#800020]">
                  SKIT
                </span>
              </div>
              <p className="text-[10px] text-slate-400 hidden sm:block">
                Smart Attendance. Verified Presence.
              </p>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center space-x-2">
            {/* Calendar shortcut (from MyNIAT header) */}
            {onOpenCalendar && (
              <button
                onClick={onOpenCalendar}
                className="p-1.5 text-slate-500 hover:text-[#800020] hover:bg-[#800020]/5 rounded-lg transition cursor-pointer"
                title="Academic Calendar"
              >
                <Calendar className="w-4 h-4" />
              </button>
            )}

            {/* Network Status Pill */}
            <div
              className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                isOnline
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
              }`}
              title={isOnline ? 'Online' : 'Offline'}
            >
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
            </div>

            {/* Offline Sync Badge */}
            {pendingSyncCount > 0 && (
              <button
                onClick={onOpenSyncDrawer}
                className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#800020]/10 text-[#800020] border border-[#800020]/20 hover:bg-[#800020]/15 transition cursor-pointer"
              >
                <CloudUpload className="w-3 h-3 animate-bounce" />
                <span>{pendingSyncCount}</span>
              </button>
            )}

            {/* User Profile Avatar (matching MyNIAT header icon) */}
            {user && (
              <div className="flex items-center space-x-2 pl-1 border-l border-slate-200">
                <div
                  className="w-7 h-7 rounded-full bg-[#fdfbf7] border border-[#f5eedb] text-[#800020] font-bold text-xs flex items-center justify-center cursor-pointer shadow-2xs"
                  title={`${user.fullName} (${user.role})`}
                >
                  {user.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </div>

                <button
                  onClick={onLogout}
                  className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                  title="Switch Role / Logout"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
