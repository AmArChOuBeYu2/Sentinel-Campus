import React, { useState, useEffect } from 'react';
import {
  Presentation,
  KeyRound,
  Users,
  Camera,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  QrCode,
  RefreshCw,
  MapPin,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { UserProfile, CampusConfig, ClassSession, AttendanceEvent } from '../types';
import { api } from '../services/api';
import { geofenceService } from '../services/geofence';

interface TeacherDashboardProps {
  user: UserProfile;
  campus: CampusConfig;
  classes: ClassSession[];
  onOpenAttendanceModal: (params: {
    sessionType: 'daily_staff' | 'class_session';
    checkpointType: 'entry' | 'checkpoint_1' | 'checkpoint_2';
    title: string;
  }) => void;
  onOpenEnrollment: () => void;
  refreshTrigger: number;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  user,
  campus,
  classes,
  onOpenAttendanceModal,
  onOpenEnrollment,
  refreshTrigger,
}) => {
  const [selectedClass, setSelectedClass] = useState<ClassSession>(classes[0] || null);
  const [activeKey1, setActiveKey1] = useState<string | null>(selectedClass?.activePresenceKey1 || 'SC-7829');
  const [activeKey2, setActiveKey2] = useState<string | null>(selectedClass?.activePresenceKey2 || 'SC-4190');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [todayConfirmed, setTodayConfirmed] = useState(false);
  const [latestTodayRecord, setLatestTodayRecord] = useState<AttendanceEvent | null>(null);

  // 5-minute Countdown Timers (Priority 3)
  const [key1ExpiresAt, setKey1ExpiresAt] = useState<number>(() => Date.now() + 300 * 1000);
  const [key2ExpiresAt, setKey2ExpiresAt] = useState<number>(() => Date.now() + 300 * 1000);
  const [key1Remaining, setKey1Remaining] = useState<number>(300);
  const [key2Remaining, setKey2Remaining] = useState<number>(300);

  // Classroom roster
  const [roster, setRoster] = useState<Array<{
    userId: string;
    fullName: string;
    identifierCode: string;
    checkpoint1: string;
    checkpoint2: string;
    cp1VerifiedAt: string | null;
  }>>([]);
  const [rosterStats, setRosterStats] = useState({ total: 0, present: 0, absent: 0 });
  const [loadingRoster, setLoadingRoster] = useState(false);

  // Live Geofence Preview
  const [geoStatus, setGeoStatus] = useState({ distanceMeters: 14, isInside: true });

  // Real-time countdown interval (every second)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const rem1 = Math.max(0, Math.floor((key1ExpiresAt - now) / 1000));
      const rem2 = Math.max(0, Math.floor((key2ExpiresAt - now) / 1000));
      setKey1Remaining(rem1);
      setKey2Remaining(rem2);
    }, 1000);

    return () => clearInterval(timer);
  }, [key1ExpiresAt, key2ExpiresAt]);

  const formatCountdown = (totalSeconds: number) => {
    if (totalSeconds <= 0) return '00:00';
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const loadTeacherData = async () => {
    try {
      const attRes = await api.getMyAttendance();
      if (attRes.success) {
        setTodayConfirmed(attRes.todayStatus.hasDailyStaffAttendance);
        setLatestTodayRecord(attRes.todayStatus.latestRecord);
      }

      const geo = await geofenceService.getCurrentLocation(campus);
      setGeoStatus({ distanceMeters: geo.distanceMeters, isInside: geo.isInside });

      if (selectedClass) {
        loadRoster(selectedClass.id);
      }
    } catch (err) {
      console.error('[TeacherDashboard] Load error:', err);
    }
  };

  const loadRoster = async (classId: string) => {
    setLoadingRoster(true);
    try {
      const res = await api.getClassRoster(classId);
      if (res.success) {
        setRoster(res.roster);
        setRosterStats(res.stats);
      }
    } catch (err) {
      console.error('[TeacherDashboard] Roster load error:', err);
    } finally {
      setLoadingRoster(false);
    }
  };

  useEffect(() => {
    loadTeacherData();
  }, [refreshTrigger, campus, selectedClass]);

  // Generate new Presence Key
  const handleGenerateKey = async (checkpointType: 'checkpoint_1' | 'checkpoint_2') => {
    if (!selectedClass) return;
    setGeneratingKey(true);
    try {
      const res = await api.generatePresenceKey(selectedClass.id, checkpointType);
      if (res.success) {
        const expiresMs = res.presenceKey.expiresAt
          ? new Date(res.presenceKey.expiresAt).getTime()
          : Date.now() + 300 * 1000;

        if (checkpointType === 'checkpoint_1') {
          setActiveKey1(res.presenceKey.key);
          setKey1ExpiresAt(expiresMs);
          setKey1Remaining(300);
        }
        if (checkpointType === 'checkpoint_2') {
          setActiveKey2(res.presenceKey.key);
          setKey2ExpiresAt(expiresMs);
          setKey2Remaining(300);
        }
      }
    } catch (err: unknown) {
      const e = err as Error;
      alert('Failed to generate Presence Key: ' + e.message);
    } finally {
      setGeneratingKey(false);
    }
  };

  return (
    <div className="space-y-5 pb-20">
      {/* 1. Pale Cream Faculty Banner */}
      <div className="p-4 rounded-2xl bg-[#fdfbf7] border border-[#f5eedb] shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-xl bg-[#800020] text-white flex items-center justify-center font-bold text-sm shrink-0">
            <Presentation className="w-6 h-6" />
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-slate-900">{user.fullName}</h2>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#800020]/10 text-[#800020]">
                Faculty
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              ID: <span className="font-mono text-slate-700 font-semibold">{user.identifierCode}</span> • {user.department}
            </div>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[11px] text-slate-400 block">Assigned Lectures</span>
          <span className="text-sm font-black text-slate-900">{classes.length} Today</span>
        </div>
      </div>

      {/* 2. Personal Faculty Gate Attendance (Section 5 requirement) */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Personal Faculty Attendance</h3>
              <p className="text-[10px] text-slate-400">Gate Biometric Queue Replacement</p>
            </div>
          </div>

          {todayConfirmed ? (
            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Confirmed</span>
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
              Not Recorded Yet
            </span>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-emerald-600" />
            <span>Presence: <strong>{geoStatus.distanceMeters}m</strong> from SKIT Center ({geoStatus.isInside ? 'Inside' : 'Outside'})</span>
          </span>

          <button
            onClick={() =>
              onOpenAttendanceModal({
                sessionType: 'daily_staff',
                checkpointType: 'entry',
                title: 'Faculty Personal Attendance',
              })
            }
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${
              todayConfirmed
                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                : 'bg-[#800020] text-white hover:bg-[#630018] shadow-md shadow-[#800020]/20'
            }`}
          >
            {todayConfirmed ? 'Re-Verify Gate Entry' : 'Mark Gate Attendance (Camera)'}
          </button>
        </div>
      </div>

      {/* 3. Classroom Presence Keys Management (Section 9 requirement) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <KeyRound className="w-4 h-4 text-[#800020]" />
            <h3 className="text-xs font-bold text-slate-900">Classroom Presence Key Generator</h3>
          </div>
          <span className="text-[10px] text-slate-400">Start &amp; Midpoint Verification</span>
        </div>

        {/* Class Selector Strip */}
        <div className="flex space-x-2 overflow-x-auto pb-1 no-scrollbar">
          {classes.map((cls) => (
            <button
              key={cls.id}
              onClick={() => {
                setSelectedClass(cls);
                setActiveKey1(cls.activePresenceKey1 || 'SC-7829');
                setActiveKey2(cls.activePresenceKey2 || 'SC-4190');
                loadRoster(cls.id);
              }}
              className={`px-3 py-2 rounded-xl border text-xs font-bold shrink-0 transition cursor-pointer ${
                selectedClass?.id === cls.id
                  ? 'bg-[#800020] text-white border-[#800020] shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>{cls.courseCode}</div>
              <div className="text-[10px] font-normal opacity-85 truncate max-w-[130px]">{cls.courseName}</div>
            </button>
          ))}
        </div>

        {/* Selected Class Controller Card */}
        {selectedClass && (
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-mono text-[#800020] font-bold">{selectedClass.courseCode}</span>
                <h4 className="text-sm font-bold text-slate-900">{selectedClass.courseName}</h4>
                <p className="text-xs text-slate-500">{selectedClass.roomNumber} · {selectedClass.startTime} - {selectedClass.endTime}</p>
              </div>

              <span className="px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold">
                {selectedClass.sessionCategory}
              </span>
            </div>

            {/* Checkpoint 1 & 2 Presence Keys Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              {/* Checkpoint 1: Start of class key */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">1. Start-of-Class Key</span>
                  {key1Remaining > 0 ? (
                    <span className="text-[10px] text-emerald-600 font-mono font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <Clock className="w-3 h-3 animate-spin" /> {formatCountdown(key1Remaining)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                      EXPIRED
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between bg-white border border-slate-300 rounded-lg p-2.5">
                  <span className={`font-mono text-base font-black tracking-widest ${key1Remaining > 0 ? 'text-[#800020]' : 'text-slate-400 line-through'}`}>
                    {activeKey1 || 'None Active'}
                  </span>
                  <span title="Display QR Code" className="cursor-pointer">
                    <QrCode className="w-5 h-5 text-slate-500" />
                  </span>
                </div>

                <button
                  onClick={() => handleGenerateKey('checkpoint_1')}
                  disabled={generatingKey}
                  className="w-full py-1.5 rounded-lg bg-[#800020] hover:bg-[#630018] text-white text-xs font-bold transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {key1Remaining > 0 ? 'Regenerate Start Key (5m)' : 'Generate New 5-Min Key'}
                </button>
              </div>

              {/* Checkpoint 2: Mid-class key */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">2. Mid-Class Key</span>
                  {key2Remaining > 0 ? (
                    <span className="text-[10px] text-emerald-600 font-mono font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <Clock className="w-3 h-3 animate-spin" /> {formatCountdown(key2Remaining)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                      EXPIRED
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between bg-white border border-slate-300 rounded-lg p-2.5">
                  <span className={`font-mono text-base font-black tracking-widest ${key2Remaining > 0 ? 'text-emerald-700' : 'text-slate-400 line-through'}`}>
                    {activeKey2 || 'Not Generated'}
                  </span>
                  <span title="Display QR Code" className="cursor-pointer">
                    <QrCode className="w-5 h-5 text-slate-500" />
                  </span>
                </div>

                <button
                  onClick={() => handleGenerateKey('checkpoint_2')}
                  disabled={generatingKey}
                  className="w-full py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {key2Remaining > 0 ? 'Regenerate Midpoint Key (5m)' : 'Activate Midpoint Key (5m)'}
                </button>
              </div>
            </div>

            {/* Live Student Roster Summary */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-500" /> Live Classroom Roster
                </span>
                <span className="font-semibold text-slate-600">
                  <strong className="text-emerald-600">{rosterStats.present}</strong> Present / <strong className="text-rose-500">{rosterStats.absent}</strong> Absent
                </span>
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                {roster.map((stu) => (
                  <div key={stu.userId} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                    <div>
                      <div className="font-bold text-slate-800">{stu.fullName}</div>
                      <div className="text-[10px] font-mono text-slate-400">{stu.identifierCode}</div>
                    </div>

                    <div className="flex items-center space-x-2 text-[10px]">
                      <span className="flex items-center gap-0.5">
                        CP1: {stu.checkpoint1 === 'confirmed' ? (
                          <strong className="text-emerald-600">Present</strong>
                        ) : (
                          <span className="text-slate-400">Absent</span>
                        )}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-0.5">
                        CP2: {stu.checkpoint2 === 'confirmed' ? (
                          <strong className="text-emerald-600">Present</strong>
                        ) : (
                          <span className="text-slate-400">Pending</span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
