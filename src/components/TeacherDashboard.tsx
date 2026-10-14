import React, { useState, useEffect } from 'react';
import {
  Presentation,
  QrCode,
  Users,
  Camera,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  MapPin,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  Laptop,
} from 'lucide-react';
import { UserProfile, CampusConfig, ClassSession, AttendanceEvent } from '../types';
import { api } from '../services/api';
import { geofenceService } from '../services/geofence';
import { ClassQRScannerModal } from './ClassQRScannerModal';
import { ClassStudentCaptureModal } from './ClassStudentCaptureModal';

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
  const [todayConfirmed, setTodayConfirmed] = useState(false);
  const [latestTodayRecord, setLatestTodayRecord] = useState<AttendanceEvent | null>(null);

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

  // Mobile QR Scanner & Capture Modals State
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [activeScanClass, setActiveScanClass] = useState<ClassSession | null>(null);
  const [activeSessionData, setActiveSessionData] = useState<{
    token: string;
    classId: string;
    checkpoint: 'checkpoint_1' | 'checkpoint_2';
    session: any;
  } | null>(null);

  const loadTeacherData = async () => {
    try {
      const attRes = await api.getMyAttendance();
      if (attRes.success && attRes.todayStatus) {
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

  const handleStartQRScan = (cls: ClassSession) => {
    setActiveScanClass(cls);
    setIsQRScannerOpen(true);
  };

  const handleSessionVerified = (sessionData: {
    token: string;
    classId: string;
    checkpoint: 'checkpoint_1' | 'checkpoint_2';
    session: any;
  }) => {
    setIsQRScannerOpen(false);
    setActiveSessionData(sessionData);
  };

  return (
    <div className="space-y-4 pb-20">
      {/* 1. Biometric Profile Warning if Unenrolled */}
      {!user.isEnrolled && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 shadow-sm flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-amber-950">Biometric Profile Not Enrolled</h3>
              <p className="text-[11px] text-amber-800">Enroll your face to verify campus gate presence.</p>
            </div>
          </div>
          <button
            onClick={onOpenEnrollment}
            className="px-3 py-1.5 rounded-xl bg-[#800020] hover:bg-[#630018] text-white text-xs font-bold shrink-0 transition shadow-sm cursor-pointer"
          >
            Enroll Face
          </button>
        </div>
      )}

      {/* 2. Top Faculty Profile Banner */}
      <div className="p-4 rounded-2xl bg-[#fdfbf7] border border-[#f5eedb] shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#800020] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
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
              ID: <span className="font-mono text-slate-700 font-semibold">{user.identifierCode}</span> • {user.department || 'Computer Science'}
            </div>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[11px] text-slate-400 block">Lectures</span>
          <span className="text-sm font-black text-slate-900">{classes.length} Today</span>
        </div>
      </div>

      {/* 3. Prominent Mark My Attendance Action at the Top (Section 5 Requirement) */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-white ${
                todayConfirmed ? 'bg-emerald-600' : 'bg-[#800020]'
              }`}
            >
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Mark My Daily Attendance</h3>
              <p className="text-[10px] text-slate-400">Independent Campus Presence Verification</p>
            </div>
          </div>

          {todayConfirmed ? (
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Verified Today</span>
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
              Attendance Pending
            </span>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-600 pt-1 border-t border-slate-100">
          <span className="flex items-center gap-1.5 text-[11px]">
            <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>
              {geoStatus.distanceMeters}m from SKIT ({geoStatus.isInside ? 'Inside' : 'Outside'})
            </span>
          </span>

          <button
            onClick={() =>
              onOpenAttendanceModal({
                sessionType: 'daily_staff',
                checkpointType: 'entry',
                title: 'Faculty Campus Daily Attendance',
              })
            }
            className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center space-x-1.5 ${
              todayConfirmed
                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                : 'bg-[#800020] text-white hover:bg-[#630018] shadow-md shadow-[#800020]/20'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>{todayConfirmed ? 'Re-Verify Gate Attendance' : 'Mark Attendance (Camera)'}</span>
          </button>
        </div>
      </div>

      {/* 4. Link to Teacher Laptop Web Console */}
      <a
        href="/teacher/console"
        className="p-3.5 rounded-2xl bg-slate-900 text-white flex items-center justify-between shadow-sm hover:bg-slate-800 transition group cursor-pointer"
      >
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-slate-800 text-cyan-400 flex items-center justify-center border border-slate-700">
            <Laptop className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>Open Teacher Laptop Console</span>
              <ExternalLink className="w-3 h-3 text-cyan-400 opacity-80" />
            </h4>
            <p className="text-[10px] text-slate-400">
              Display live classroom QR codes and view real-time capture roster
            </p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition" />
      </a>

      {/* 5. Assigned Classes with "Scan Class QR" Workflow (Section 5 & 7 Requirements) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-[#800020]" />
            <h3 className="text-xs font-bold text-slate-900">Today&apos;s Assigned Classes</h3>
          </div>
          <span className="text-[10px] text-slate-500">Scan Laptop QR to Capture Students</span>
        </div>

        <div className="space-y-3">
          {classes.map((cls) => {
            const isSelected = selectedClass?.id === cls.id;

            return (
              <div
                key={cls.id}
                className={`p-4 rounded-2xl bg-white border transition shadow-sm space-y-3 ${
                  isSelected ? 'border-[#800020] ring-1 ring-[#800020]/20' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-mono font-bold text-[#800020]">
                      {cls.courseCode}
                    </span>
                    <h4 className="text-xs font-bold text-slate-900 mt-0.5">{cls.courseName}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {cls.roomNumber} • {cls.startTime} - {cls.endTime}
                    </p>
                  </div>

                  <span className="px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold">
                    {cls.sessionCategory}
                  </span>
                </div>

                {/* Prominent "Scan Class QR" Action */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      setSelectedClass(cls);
                      loadRoster(cls.id);
                    }}
                    className="text-[11px] font-semibold text-slate-600 hover:text-slate-900"
                  >
                    {isSelected ? 'Viewing Roster' : 'View Roster'}
                  </button>

                  <button
                    onClick={() => handleStartQRScan(cls)}
                    className="px-4 py-2 rounded-xl bg-[#800020] hover:bg-[#630018] text-white text-xs font-bold shadow-md shadow-[#800020]/20 flex items-center space-x-1.5 transition cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Scan Class QR</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6. Class Roster View */}
      {selectedClass && (
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-900">Enrolled Students Roster</h3>
              <p className="text-[10px] text-slate-500">{selectedClass.courseName}</p>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono font-bold text-emerald-700">
                {rosterStats.present} / {rosterStats.total} Present
              </span>
            </div>
          </div>

          {loadingRoster ? (
            <div className="py-6 text-center text-xs text-slate-400">Loading roster...</div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {roster.map((stu) => (
                <div
                  key={stu.userId}
                  className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700 uppercase">
                      {stu.fullName.charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 text-xs">{stu.fullName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{stu.identifierCode}</div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        stu.checkpoint1 === 'confirmed'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      CP1: {stu.checkpoint1 === 'confirmed' ? 'Done' : 'Pending'}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        stu.checkpoint2 === 'confirmed'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      CP2: {stu.checkpoint2 === 'confirmed' ? 'Done' : 'Pending'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* QR Scanner Modal (Step 1: Scans laptop QR) */}
      <ClassQRScannerModal
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        onSessionVerified={handleSessionVerified}
      />

      {/* Student Face Capture Modal (Step 2: Captures students and verifies face < 0.55) */}
      {activeSessionData && (
        <ClassStudentCaptureModal
          isOpen={true}
          onClose={() => setActiveSessionData(null)}
          sessionToken={activeSessionData.token}
          classInfo={{
            courseName: activeScanClass?.courseName || activeSessionData.session?.className,
            courseCode: activeScanClass?.courseCode,
            checkpoint: activeSessionData.checkpoint,
          }}
          onFinished={() => {
            setActiveSessionData(null);
            if (selectedClass) loadRoster(selectedClass.id);
          }}
        />
      )}
    </div>
  );
};
