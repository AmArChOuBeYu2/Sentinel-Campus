import React, { useState, useEffect } from 'react';
import {
  Building2,
  MapPin,
  Clock,
  Camera,
  History,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { UserProfile, CampusConfig, AttendanceEvent } from '../types';
import { api } from '../services/api';
import { geofenceService } from '../services/geofence';
import { offlineSyncService } from '../services/offlineSync';

interface StaffDashboardProps {
  user: UserProfile;
  campus: CampusConfig;
  onOpenAttendanceModal: (params?: {
    sessionType?: 'daily_staff' | 'class_session';
    sessionId?: string;
    checkpointType?: 'entry' | 'checkpoint_1' | 'checkpoint_2';
    title?: string;
  }) => void;
  onOpenEnrollmentModal: () => void;
  onOpenSyncDrawer: () => void;
  refreshTrigger: number;
}

export const StaffDashboard: React.FC<StaffDashboardProps> = ({
  user,
  campus,
  onOpenAttendanceModal,
  onOpenEnrollmentModal,
  onOpenSyncDrawer,
  refreshTrigger,
}) => {
  const [history, setHistory] = useState<AttendanceEvent[]>([]);
  const [todayConfirmed, setTodayConfirmed] = useState(false);
  const [latestTodayRecord, setLatestTodayRecord] = useState<AttendanceEvent | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  // Live geofence status preview
  const [geoStatus, setGeoStatus] = useState<{
    distanceMeters: number;
    isInside: boolean;
    accuracy: number;
  }>({ distanceMeters: 14, isInside: true, accuracy: 12 });

  const loadData = async () => {
    try {
      const res = await api.getMyAttendance();
      if (res.success) {
        setHistory(res.records);
        setTodayConfirmed(res.todayStatus.hasDailyStaffAttendance);
        setLatestTodayRecord(res.todayStatus.latestRecord);
      }

      const count = await offlineSyncService.getPendingCount();
      setPendingCount(count);

      const geo = await geofenceService.getCurrentLocation(campus);
      setGeoStatus({
        distanceMeters: geo.distanceMeters,
        isInside: geo.isInside,
        accuracy: geo.accuracy,
      });
    } catch (err) {
      console.error('[StaffDashboard] Load error:', err);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = offlineSyncService.subscribe(async () => {
      const c = await offlineSyncService.getPendingCount();
      setPendingCount(c);
    });
    return unsub;
  }, [refreshTrigger, campus]);

  return (
    <div className="space-y-5 pb-20">
      {/* 1. Pale Cream Header Card */}
      <div className="p-4 rounded-2xl bg-[#fdfbf7] border border-[#f5eedb] shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-xl bg-[#800020] text-white flex items-center justify-center font-bold text-sm shrink-0">
            <Building2 className="w-6 h-6" />
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-slate-900">{user.fullName}</h2>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#800020]/10 text-[#800020]">
                Staff
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              ID: <span className="font-mono text-slate-700 font-semibold">{user.identifierCode}</span> • {user.department}
            </div>
          </div>
        </div>

        {!user.isEnrolled && (
          <button
            onClick={onOpenEnrollmentModal}
            className="px-3 py-1.5 rounded-xl bg-[#800020] text-white text-xs font-bold hover:bg-[#630018] transition shrink-0 cursor-pointer"
          >
            Enroll Face
          </button>
        )}
      </div>

      {/* 2. Today's Attendance & CTA Card */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Today&apos;s Gate Attendance</h3>
              <p className="text-[11px] text-slate-400">
                {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
              </p>
            </div>
          </div>

          {todayConfirmed ? (
            <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Confirmed</span>
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold">
              Not Recorded Yet
            </span>
          )}
        </div>

        {todayConfirmed && latestTodayRecord ? (
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Verified Timestamp:</span>
              <span className="text-slate-900 font-mono font-bold">
                {new Date(latestTodayRecord.capturedAt).toLocaleTimeString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Event ID:</span>
              <span className="font-mono text-[#800020]">{latestTodayRecord.id}</span>
            </div>
            <div className="flex justify-between">
              <span>Campus Distance:</span>
              <span className="text-emerald-700 font-semibold">{latestTodayRecord.distanceMeters}m from SKIT Center</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Skip the physical main gate biometric queue! Tap the button below to verify your presence and face directly from your mobile browser.
          </p>
        )}

        {/* Big CTA */}
        <button
          onClick={() => {
            if (!user.isEnrolled) {
              onOpenEnrollmentModal();
            } else {
              onOpenAttendanceModal({
                sessionType: 'daily_staff',
                checkpointType: 'entry',
                title: 'Staff Gate Attendance',
              });
            }
          }}
          className={`w-full py-3.5 rounded-xl font-bold text-xs tracking-wide transition flex items-center justify-center space-x-2 cursor-pointer shadow-sm ${
            todayConfirmed
              ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
              : 'bg-[#800020] text-white hover:bg-[#630018] shadow-md shadow-[#800020]/20'
          }`}
        >
          <Camera className="w-4 h-4" />
          <span>
            {todayConfirmed
              ? 'Attendance Already Confirmed (Click to View/Re-verify)'
              : user.isEnrolled
              ? 'Mark Gate Attendance (Live Camera)'
              : 'Enroll Biometric Face Profile'}
          </span>
        </button>
      </div>

      {/* 3. Geofence & Boundary Card */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MapPin className="w-4 h-4 text-[#800020]" />
            <h3 className="text-xs font-bold text-slate-900">Campus Geofence Status</h3>
          </div>
          <button onClick={loadData} className="text-[11px] text-[#800020] font-semibold hover:underline">
            Refresh GPS
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-slate-400 block text-[10px]">Distance to Center:</span>
            <span className="text-slate-900 font-bold font-mono text-sm">{geoStatus.distanceMeters}m</span>
            <span className="text-[10px] text-slate-500 block">(Perimeter: {campus.radiusMeters}m)</span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-slate-400 block text-[10px]">Presence Verdict:</span>
            <span className={`font-bold text-xs block mt-1 ${geoStatus.isInside ? 'text-emerald-600' : 'text-rose-600'}`}>
              {geoStatus.isInside ? 'Inside Campus Boundary' : 'Outside Campus Boundary'}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Pending Offline Submissions Alert */}
      {pendingCount > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 text-xs">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <span className="font-bold text-amber-900 block">
                {pendingCount} Offline Attendance Capture{pendingCount > 1 ? 's' : ''} Stored Locally
              </span>
              <span className="text-amber-800 text-[11px]">
                Will synchronize with the campus server upon connection restoration.
              </span>
            </div>
          </div>
          <button
            onClick={onOpenSyncDrawer}
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 transition cursor-pointer"
          >
            Review
          </button>
        </div>
      )}

      {/* 5. Attendance Ledger */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-slate-600" />
            <h3 className="text-xs font-bold text-slate-900">Personal Attendance Ledger</h3>
          </div>
          <span className="text-[11px] text-slate-400">{history.length} Events</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {history.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs">
              No attendance events recorded for this account yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {history.map((rec) => (
                <div key={rec.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition">
                  <div>
                    <div className="font-bold text-slate-800">
                      {rec.sessionType.replace('_', ' ')} • {rec.checkpointType}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {rec.eventDate} · {new Date(rec.capturedAt).toLocaleTimeString()} · {rec.distanceMeters}m
                    </div>
                  </div>

                  <div>
                    {rec.status === 'confirmed' ? (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Confirmed</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">
                        <XCircle className="w-3 h-3" />
                        <span>Rejected</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
