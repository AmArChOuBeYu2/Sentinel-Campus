import React, { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  Presentation,
  QrCode,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Camera,
  LogOut,
  Download,
  Search,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';
import { UserProfile, CampusConfig, ClassSession, QRSession, CapturedStudent } from '../types';
import { api } from '../services/api';

interface TeacherLaptopConsoleProps {
  user: UserProfile | null;
  campus: CampusConfig;
  onLogout: () => void;
  onOpenAttendanceModal: (params: {
    sessionType: 'daily_staff' | 'class_session';
    checkpointType: 'entry' | 'checkpoint_1' | 'checkpoint_2';
    title: string;
  }) => void;
}

export const TeacherLaptopConsole: React.FC<TeacherLaptopConsoleProps> = ({
  user,
  campus,
  onLogout,
  onOpenAttendanceModal,
}) => {
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassSession | null>(null);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<'checkpoint_1' | 'checkpoint_2'>('checkpoint_1');

  // Active QR Session State
  const [activeSession, setActiveSession] = useState<QRSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(300);
  const [sessionStats, setSessionStats] = useState<{
    totalStudents: number;
    identifiedCount: number;
    pendingCount: number;
    rejectedCount: number;
    notCapturedCount: number;
  }>({
    totalStudents: 0,
    identifiedCount: 0,
    pendingCount: 0,
    rejectedCount: 0,
    notCapturedCount: 0,
  });

  const [rosterBreakdown, setRosterBreakdown] = useState<Array<{
    studentId: string;
    fullName: string;
    identifierCode: string;
    department: string;
    status: 'confirmed' | 'pending' | 'rejected' | 'not_captured';
    capturedAt: string | null;
    faceDistance: number | null;
    thumbnailUrl: string | null;
  }>>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [rosterTab, setRosterTab] = useState<'all' | 'confirmed' | 'pending' | 'rejected' | 'notCaptured'>('all');

  // Personal Teacher Attendance State
  const [teacherPersonalAttended, setTeacherPersonalAttended] = useState(false);
  const [teacherAttendedAt, setTeacherAttendedAt] = useState<string | null>(null);

  // Canvas for QR Code
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load Classes and Teacher Personal Attendance
  const loadInitialData = useCallback(async () => {
    try {
      const [classRes, attRes] = await Promise.all([
        api.getCurrentClasses(),
        api.getMyAttendance(),
      ]);

      if (classRes.success && classRes.classes.length > 0) {
        setClasses(classRes.classes);
        setSelectedClass((current) => current || classRes.classes[0]);
      }

      if (attRes.success && attRes.todayStatus) {
        setTeacherPersonalAttended(attRes.todayStatus.hasDailyStaffAttendance);
        if (attRes.todayStatus.latestRecord) {
          setTeacherAttendedAt(
            attRes.todayStatus.latestRecord.capturedAt ||
            attRes.todayStatus.latestRecord.serverVerifiedAt
          );
        }
      }
    } catch (err) {
      console.warn('[TeacherConsole] Error loading initial data:', err);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Generate QR Canvas whenever activeSession changes
  useEffect(() => {
    if (!activeSession || !qrCanvasRef.current) return;

    const payload = JSON.stringify({
      app: 'SentinelCampus',
      token: activeSession.token,
      classId: activeSession.classId,
      checkpoint: activeSession.checkpointType,
      expiresAt: activeSession.expiresAt,
    });

    QRCode.toCanvas(
      qrCanvasRef.current,
      payload,
      {
        width: 260,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      },
      (err) => {
        if (err) console.error('[TeacherConsole] QR Render error:', err);
      }
    );
  }, [activeSession]);

  // Countdown timer for active session
  useEffect(() => {
    if (!activeSession || !activeSession.isActive) return;

    const interval = setInterval(() => {
      const expires = new Date(activeSession.expiresAt).getTime();
      const diff = Math.max(0, Math.floor((expires - Date.now()) / 1000));
      setRemainingSeconds(diff);

      if (diff <= 0) {
        setActiveSession((prev) => (prev ? { ...prev, isActive: false } : null));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession]);

  // Poll Session Status every 2 seconds when active
  const pollSessionStatus = useCallback(async () => {
    if (!activeSession || !activeSession.isActive) return;

    try {
      const res = await api.getQRSessionStatus(activeSession.token);
      if (res.success) {
        setSessionStats(res.stats);
        setRosterBreakdown(res.rosterBreakdown || []);
        if (!res.session.isActive) {
          setActiveSession(res.session);
        } else {
          setActiveSession(res.session);
        }
      }
    } catch (err) {
      console.warn('[TeacherConsole] Poll error:', err);
    }
  }, [activeSession]);

  useEffect(() => {
    if (!activeSession || !activeSession.isActive) return;

    pollSessionStatus();
    const interval = setInterval(pollSessionStatus, 2000);
    return () => clearInterval(interval);
  }, [activeSession, pollSessionStatus]);

  // Start new QR session
  const handleStartSession = async () => {
    if (!selectedClass) return;
    setLoadingSession(true);

    try {
      const res = await api.generateQRSession(selectedClass.id, selectedCheckpoint);
      if (res.success && res.session) {
        setActiveSession(res.session);
        setRemainingSeconds(res.session.remainingSeconds || 300);
        await pollSessionStatus();
      }
    } catch (err) {
      console.error('[TeacherConsole] Failed to generate QR session:', err);
    } finally {
      setLoadingSession(false);
    }
  };

  // Close active session
  const handleCloseSession = async () => {
    if (!activeSession) return;
    try {
      const res = await api.closeQRSession(activeSession.token);
      if (res.success) {
        setActiveSession(res.session);
        await pollSessionStatus();
      }
    } catch (err) {
      console.error('[TeacherConsole] Failed to close session:', err);
    }
  };

  // Format seconds into MM:SS
  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!selectedClass) return;

    const headers = ['Student ID', 'Full Name', 'Department', 'Status', 'Face Distance', 'Capture Time'];
    const rows = rosterBreakdown.map((s) => [
      s.identifierCode || s.studentId || 'N/A',
      `"${s.fullName}"`,
      s.department || 'N/A',
      s.status,
      s.faceDistance !== null ? s.faceDistance.toFixed(3) : 'N/A',
      s.capturedAt ? new Date(s.capturedAt).toLocaleTimeString() : 'N/A',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `${selectedClass.courseCode}_Attendance_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered Roster for Table
  const getDisplayRoster = () => {
    let list = rosterBreakdown;

    if (rosterTab === 'confirmed') {
      list = list.filter((s) => s.status === 'confirmed');
    } else if (rosterTab === 'pending') {
      list = list.filter((s) => s.status === 'pending');
    } else if (rosterTab === 'rejected') {
      list = list.filter((s) => s.status === 'rejected');
    } else if (rosterTab === 'notCaptured') {
      list = list.filter((s) => s.status === 'not_captured');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.fullName?.toLowerCase().includes(q) ||
          s.identifierCode?.toLowerCase().includes(q) ||
          s.studentId?.toLowerCase().includes(q)
      );
    }

    return list;
  };

  const confirmedRate = sessionStats.totalStudents > 0
    ? `${Math.round((sessionStats.identifiedCount / sessionStats.totalStudents) * 100)}%`
    : '0%';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-2xl bg-[#800020] flex items-center justify-center text-white shadow-md shadow-[#800020]/30">
            <Presentation className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold tracking-tight text-white">Sentinel Campus</h1>
              <span className="px-2 py-0.5 rounded-full bg-[#800020]/20 text-[#ff8099] border border-[#800020]/40 text-[10px] font-bold uppercase tracking-wider">
                Teacher Laptop Console
              </span>
            </div>
            <p className="text-xs text-slate-400">Classroom Facial Recognition &amp; QR Attendance Terminal</p>
          </div>
        </div>

        {/* User Info & Controls */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3 bg-slate-800/60 px-3.5 py-1.5 rounded-2xl border border-slate-700/60">
            <div className="w-8 h-8 rounded-xl bg-slate-700 flex items-center justify-center text-xs font-bold text-white uppercase">
              {user?.fullName?.charAt(0) || 'T'}
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-white">{user?.fullName || 'Faculty Member'}</div>
              <div className="text-[10px] text-slate-400 font-mono">
                {user?.identifierCode || 'SC-TCH-2026-0001'}
              </div>
            </div>
          </div>

          <a
            href="/"
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition flex items-center space-x-1 border border-slate-700"
          >
            <span>Mobile App View</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={onLogout}
            className="p-2 text-slate-400 hover:text-rose-400 rounded-xl hover:bg-slate-800 transition cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Section 1: Teacher Personal Attendance Banner */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800/80 border border-slate-700 shadow-md flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm ${
                teacherPersonalAttended ? 'bg-emerald-600' : 'bg-amber-600'
              }`}
            >
              {teacherPersonalAttended ? (
                <CheckCircle2 className="w-6 h-6" />
              ) : (
                <ShieldCheck className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white">Faculty Daily Campus Attendance</h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    teacherPersonalAttended
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {teacherPersonalAttended ? 'Verified Today' : 'Attendance Pending'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {teacherPersonalAttended
                  ? `Campus presence confirmed via face verification and SKIT geofence${
                      teacherAttendedAt ? ` at ${new Date(teacherAttendedAt).toLocaleTimeString()}` : ''
                    }.`
                  : 'Independent staff presence verification is required for today.'}
              </p>
            </div>
          </div>

          {!teacherPersonalAttended && (
            <button
              onClick={() =>
                onOpenAttendanceModal({
                  sessionType: 'daily_staff',
                  checkpointType: 'entry',
                  title: 'Faculty Campus Entry Attendance',
                })
              }
              className="px-4 py-2 rounded-xl bg-[#800020] hover:bg-[#66001a] text-white text-xs font-bold transition shadow-md shadow-[#800020]/20 flex items-center space-x-1.5 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Mark My Attendance</span>
            </button>
          )}
        </div>

        {/* Section 2: Classroom QR Session Generator & Live Stream */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: QR Code Display & Countdown (5 columns) */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-5">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                <div>
                  <h2 className="text-sm font-bold text-white">Classroom Attendance Session</h2>
                  <p className="text-xs text-slate-400">Generate QR code for mobile face capture</p>
                </div>

                {/* Class Selector */}
                <div className="relative">
                  <select
                    value={selectedClass?.id || ''}
                    onChange={(e) => {
                      const c = classes.find((cls) => cls.id === e.target.value);
                      if (c) setSelectedClass(c);
                    }}
                    className="appearance-none bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 pr-8 text-xs font-semibold text-white focus:outline-none focus:border-[#800020] cursor-pointer"
                  >
                    {classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.courseCode}: {cls.courseName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Checkpoint Mode Selector */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-800/80 rounded-2xl border border-slate-700/60 mb-5">
                <button
                  type="button"
                  onClick={() => setSelectedCheckpoint('checkpoint_1')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center space-x-1.5 ${
                    selectedCheckpoint === 'checkpoint_1'
                      ? 'bg-[#800020] text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Checkpoint 1</span>
                  <span className="text-[10px] opacity-75 font-normal">(Start)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCheckpoint('checkpoint_2')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center space-x-1.5 ${
                    selectedCheckpoint === 'checkpoint_2'
                      ? 'bg-[#800020] text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Checkpoint 2</span>
                  <span className="text-[10px] opacity-75 font-normal">(Mid-Class)</span>
                </button>
              </div>

              {/* QR Display Area */}
              {activeSession && activeSession.isActive ? (
                <div className="flex flex-col items-center justify-center p-6 bg-slate-950 rounded-2xl border border-slate-800 space-y-4">
                  {/* Countdown Clock (Priority 6) */}
                  <div className="flex items-center space-x-2 px-3.5 py-1 rounded-full bg-slate-900 border border-slate-700">
                    <Clock
                      className={`w-4 h-4 ${
                        remainingSeconds < 60 ? 'text-rose-400 animate-pulse' : 'text-cyan-400'
                      }`}
                    />
                    <span
                      className={`font-mono text-sm font-black ${
                        remainingSeconds < 60 ? 'text-rose-400' : 'text-white'
                      }`}
                    >
                      {formatTimer(remainingSeconds)}
                    </span>
                    <span className="text-[10px] text-slate-400">remaining</span>
                  </div>

                  {/* QR Canvas */}
                  <div className="p-3 bg-white rounded-2xl shadow-xl flex items-center justify-center">
                    <canvas ref={qrCanvasRef} />
                  </div>

                  {/* Token & Info */}
                  <div className="text-center space-y-1">
                    <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-xl bg-slate-900 border border-slate-700">
                      <span className="text-[11px] text-slate-400">Session Token:</span>
                      <span className="font-mono text-sm font-bold text-cyan-400">
                        {activeSession.token}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 pt-1">
                      Scan this QR code with the teacher mobile app to begin live facial capture
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-10 bg-slate-950/50 rounded-2xl border border-dashed border-slate-800 text-center space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-500">
                    <QrCode className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-200">No Active QR Session</h3>
                    <p className="text-xs text-slate-400 max-w-xs">
                      Click below to generate a 5-minute QR code on this screen for{' '}
                      <span className="text-white font-medium">
                        {selectedCheckpoint === 'checkpoint_1' ? 'Start of Class' : 'Mid-Class'}
                      </span>
                      .
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Session Action Buttons */}
            <div>
              {activeSession && activeSession.isActive ? (
                <button
                  onClick={handleCloseSession}
                  className="w-full py-3 rounded-2xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 font-bold text-xs transition cursor-pointer flex items-center justify-center space-x-2"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Close Session &amp; Lock Attendance</span>
                </button>
              ) : (
                <button
                  disabled={loadingSession}
                  onClick={handleStartSession}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#800020] to-[#990026] hover:from-[#66001a] hover:to-[#800020] text-white font-bold text-sm transition shadow-lg shadow-[#800020]/20 flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {loadingSession ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Generating Session...</span>
                    </>
                  ) : (
                    <>
                      <QrCode className="w-4 h-4" />
                      <span>
                        Generate {selectedCheckpoint === 'checkpoint_1' ? 'Start-of-Class' : 'Mid-Class'} QR
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Live Roster Summary & Captured Gallery (7 columns) */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col space-y-5">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                <span className="text-[11px] font-semibold text-slate-400 block">Total Enrolled</span>
                <span className="text-xl font-black text-white mt-0.5 block font-mono">
                  {sessionStats.totalStudents || 24}
                </span>
                <span className="text-[10px] text-slate-500">Students registered</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                <span className="text-[11px] font-semibold text-emerald-400 block">Confirmed</span>
                <span className="text-xl font-black text-emerald-300 mt-0.5 block font-mono">
                  {sessionStats.identifiedCount}
                </span>
                <span className="text-[10px] text-emerald-500/80">{confirmedRate} verified</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                <span className="text-[11px] font-semibold text-amber-400 block">Flagged / Ambiguous</span>
                <span className="text-xl font-black text-amber-300 mt-0.5 block font-mono">
                  {sessionStats.pendingCount + sessionStats.rejectedCount}
                </span>
                <span className="text-[10px] text-amber-500/80">Requires review</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/40">
                <span className="text-[11px] font-semibold text-slate-400 block">Not Yet Captured</span>
                <span className="text-xl font-black text-slate-300 mt-0.5 block font-mono">
                  {sessionStats.notCapturedCount ||
                    Math.max(
                      0,
                      (sessionStats.totalStudents || 24) -
                        sessionStats.identifiedCount -
                        sessionStats.pendingCount -
                        sessionStats.rejectedCount
                    )}
                </span>
                <span className="text-[10px] text-slate-500">Awaiting scan</span>
              </div>
            </div>

            {/* Live Captured Students Strip */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Live Student Captures (Real-Time Feed)
                  </h3>
                </div>
                {activeSession?.isActive && (
                  <span className="inline-flex items-center space-x-1 text-[11px] text-cyan-400">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                    <span>Polling live feed every 2s</span>
                  </span>
                )}
              </div>

              {activeSession && activeSession.captures && activeSession.captures.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-56 overflow-y-auto pr-1">
                  {activeSession.captures.map((cap: CapturedStudent, idx: number) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center space-x-3 shadow-sm hover:border-slate-700 transition"
                    >
                      {cap.thumbnailUrl ? (
                        <img
                          src={cap.thumbnailUrl}
                          alt={cap.studentName}
                          className="w-11 h-11 rounded-xl object-cover border border-slate-700 shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 uppercase shrink-0">
                          {cap.studentName?.charAt(0) || 'S'}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-white truncate">{cap.studentName}</h4>
                        <p className="text-[10px] text-slate-400 font-mono truncate">{cap.identifierCode}</p>
                        <div className="flex items-center space-x-1.5 mt-0.5">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                              cap.status === 'confirmed'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : cap.status === 'ambiguous'
                                ? 'bg-purple-500/20 text-purple-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {cap.status}
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono">
                            {new Date(cap.capturedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-center space-y-2">
                  <Users className="w-6 h-6 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-400">
                    No students captured yet for this session. As the teacher points their phone camera at students, they will appear here instantly.
                  </p>
                </div>
              )}
            </div>

            {/* Roster Controls & Export Button */}
            <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              {/* Tab Filters */}
              <div className="flex items-center space-x-1.5 bg-slate-800/60 p-1 rounded-xl border border-slate-700/60">
                {(['all', 'confirmed', 'pending', 'rejected', 'notCaptured'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setRosterTab(tab)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition capitalize cursor-pointer ${
                      rosterTab === tab
                        ? 'bg-[#800020] text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab === 'notCaptured' ? 'Not Captured' : tab}
                  </button>
                ))}
              </div>

              {/* CSV Export Button */}
              <button
                onClick={handleExportCSV}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center space-x-1.5 border border-slate-700 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                <span>Export Attendance CSV</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search enrolled students by name or institutional roll number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#800020]"
              />
            </div>

            {/* Class Roster Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Student</th>
                    <th className="px-4 py-2.5 font-semibold">ID / Roll No</th>
                    <th className="px-4 py-2.5 font-semibold">Department</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Verified Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {getDisplayRoster().map((stu, i) => (
                    <tr key={i} className="hover:bg-slate-900/40 transition">
                      <td className="px-4 py-2.5 font-medium text-white flex items-center space-x-2.5">
                        {stu.thumbnailUrl ? (
                          <img
                            src={stu.thumbnailUrl}
                            alt={stu.fullName}
                            className="w-7 h-7 rounded-lg object-cover border border-slate-700"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300 uppercase">
                            {stu.fullName?.charAt(0) || 'S'}
                          </div>
                        )}
                        <span className="truncate max-w-[150px]">{stu.fullName}</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-300">
                        {stu.identifierCode || stu.studentId}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">
                        {stu.department || 'Computer Science'}
                      </td>
                      <td className="px-4 py-2.5">
                        {stu.status === 'confirmed' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Present</span>
                          </span>
                        ) : stu.status === 'rejected' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                            <XCircle className="w-3 h-3" />
                            <span>Flagged</span>
                          </span>
                        ) : stu.status === 'pending' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                            <span>Pending</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">Not Captured</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 font-mono text-[11px]">
                        {stu.capturedAt
                          ? new Date(stu.capturedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  {getDisplayRoster().length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500 text-xs">
                        No students found matching this criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
