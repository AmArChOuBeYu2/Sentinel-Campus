import React, { useState, useEffect } from 'react';
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Filter,
  Search,
  Settings,
  Shield,
  Activity,
  MapPin,
  RefreshCw,
  Edit,
  UserCheck,
  UserX,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import {
  UserProfile,
  CampusConfig,
  AttendanceEvent,
  AuditLog,
  ManualReviewRequest,
} from '../types';
import { api } from '../services/api';

interface AdminDashboardProps {
  adminUser: UserProfile;
  campus: CampusConfig;
  onCampusUpdated: (config: CampusConfig) => void;
  refreshTrigger: number;
}

type AdminTab = 'attendance' | 'users' | 'campus_config' | 'audit' | 'system' | 'manual_reviews';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  campus,
  onCampusUpdated,
  refreshTrigger,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('attendance');

  // Stats
  const [stats, setStats] = useState<{
    totalUsers: number;
    staffCount: number;
    studentCount: number;
    enrolledUsers: number;
    confirmedToday: number;
    rejectedToday: number;
    totalRecordedToday: number;
    offlineSyncedTotal: number;
  }>({
    totalUsers: 0,
    staffCount: 0,
    studentCount: 0,
    enrolledUsers: 0,
    confirmedToday: 0,
    rejectedToday: 0,
    totalRecordedToday: 0,
    offlineSyncedTotal: 0,
  });

  // Attendance Records & Filters
  const [records, setRecords] = useState<AttendanceEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [checkpointFilter, setCheckpointFilter] = useState('all');
  const [loadingRecords, setLoadingRecords] = useState(false);

  // Users List
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Campus Config Form
  const [campusForm, setCampusForm] = useState<CampusConfig>(campus);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSuccessMsg, setConfigSuccessMsg] = useState<string | null>(null);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Manual Review Requests
  const [manualReviews, setManualReviews] = useState<ManualReviewRequest[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [reviewActionLoading, setReviewActionLoading] = useState<string | null>(null);

  // System Diagnostics
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);

  // Load Overview Stats
  const loadOverview = async () => {
    try {
      const res = await api.getAdminOverview();
      if (res.success) {
        setStats(res.stats);
      }
    } catch (err) {
      console.error('[Admin] Overview error:', err);
    }
  };

  // Load Attendance Records with Filters
  const loadAttendance = async () => {
    setLoadingRecords(true);
    try {
      const res = await api.getAdminAttendance({
        search: searchQuery,
        role: roleFilter,
        status: statusFilter,
        checkpoint: checkpointFilter,
      });
      if (res.success) {
        setRecords(res.records);
      }
    } catch (err) {
      console.error('[Admin] Attendance load error:', err);
    } finally {
      setLoadingRecords(false);
    }
  };

  // Load Users
  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await api.getAdminUsers();
      if (res.success) {
        setUsersList(res.users);
      }
    } catch (err) {
      console.error('[Admin] Users load error:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Load Manual Reviews
  const loadManualReviews = async () => {
    setLoadingReviews(true);
    try {
      const res = await api.getManualReviews();
      if (res.success) {
        setManualReviews(res.reviews);
      }
    } catch (err) {
      console.error('[Admin] Manual reviews load error:', err);
    } finally {
      setLoadingReviews(false);
    }
  };

  // Resolve Manual Review
  const handleResolveReview = async (id: string, action: 'approved' | 'rejected') => {
    const defaultNote = action === 'approved' ? 'Identity verified by supervisor' : 'Biometric identification rejected';
    const note = window.prompt(`Enter administrative notes for ${action}:`, defaultNote);
    if (note === null) return;
    setReviewActionLoading(id);
    try {
      await api.resolveManualReview(id, action === 'approved', note);
      await loadManualReviews();
      await loadAttendance();
      await loadOverview();
    } catch (err: unknown) {
      const e = err as Error;
      alert('Failed to resolve review: ' + e.message);
    } finally {
      setReviewActionLoading(null);
    }
  };

  // Load Audit
  const loadAudit = async () => {
    try {
      const res = await api.getAuditLogs();
      if (res.success) {
        setAuditLogs(res.logs);
      }
    } catch (err) {
      console.error('[Admin] Audit load error:', err);
    }
  };

  // Load Diagnostics
  const loadDiagnostics = async () => {
    try {
      const res = await api.getDiagnostics();
      if (res.success) {
        setDiagnostics(res.diagnostics);
      }
    } catch (err) {
      console.error('[Admin] Diagnostics error:', err);
    }
  };

  useEffect(() => {
    loadOverview();
    loadAttendance();
    loadUsers();
    loadManualReviews();
    loadAudit();
    loadDiagnostics();
    setCampusForm(campus);
  }, [refreshTrigger, campus]);

  // Handle User Toggle Active
  const handleToggleUserActive = async (user: UserProfile) => {
    try {
      await api.updateAdminUser(user.id, { isActive: !user.isActive });
      await loadUsers();
      await loadOverview();
    } catch (err) {
      console.error('[Admin] User update error:', err);
    }
  };

  // Handle Reset Biometric Enrollment
  const handleResetEnrollment = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete and reset the facial biometric profile for this user?')) {
      return;
    }
    try {
      await api.resetEnrollment(userId);
      await loadUsers();
      await loadOverview();
    } catch (err) {
      console.error('[Admin] Reset enrollment error:', err);
    }
  };

  // Handle Save Campus Config
  const handleSaveCampusConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigSuccessMsg(null);
    try {
      const res = await api.updateCampusConfig(campusForm);
      if (res.success) {
        onCampusUpdated(res.config);
        setConfigSuccessMsg('Campus boundary and presence verification rules updated successfully.');
      }
    } catch (err: unknown) {
      const e = err as Error;
      alert('Failed to update config: ' + e.message);
    } finally {
      setSavingConfig(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    window.open('/api/admin/attendance/export', '_blank');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs uppercase font-bold tracking-wider text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 rounded-full border border-cyan-500/20">
              Administrative Control Center
            </span>
            <span className="text-xs text-slate-400">• IEEE IGNITE 2026</span>
          </div>
          <h1 className="text-2xl font-black text-white mt-1.5 tracking-tight">
            Sentinel Campus Command &amp; Operations
          </h1>
          <p className="text-xs text-slate-400">
            Real-time biometric attendance audit, geofence perimeter controls, and presence enforcement.
          </p>
        </div>

        {/* Global Quick Action: CSV Export */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 text-xs font-bold transition cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export Official CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#1c2541]/60 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Registered Directory</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-white">{stats.totalUsers}</span>
            <span className="text-xs text-slate-400">
              ({stats.staffCount} Staff, {stats.studentCount} Students)
            </span>
          </div>
          <span className="text-[11px] text-emerald-400 block mt-1">
            {stats.enrolledUsers} Biometrically Enrolled
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#1c2541]/60 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Confirmed Today</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-emerald-400">{stats.confirmedToday}</span>
            <span className="text-xs text-slate-400">Verified Events</span>
          </div>
          <span className="text-[11px] text-slate-400 block mt-1">
            Replaced Gate Biometric Queue
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#1c2541]/60 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Rejected Submissions</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-rose-400">{stats.rejectedToday}</span>
            <span className="text-xs text-slate-400">Today</span>
          </div>
          <span className="text-[11px] text-slate-400 block mt-1">
            Off-campus or Biometric Mismatch
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#1c2541]/60 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Campus Perimeter</span>
            <MapPin className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-cyan-400">{campus.radiusMeters}m</span>
            <span className="text-xs text-slate-400">Radius</span>
          </div>
          <span className="text-[11px] text-slate-400 block mt-1">
            Center: {campus.latitude.toFixed(4)}°N, {campus.longitude.toFixed(4)}°E
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 space-x-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('attendance')}
          className={`flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer shrink-0 ${
            activeTab === 'attendance'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Attendance Master Log</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer shrink-0 ${
            activeTab === 'users'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Directory &amp; Biometric Profiles</span>
        </button>

        <button
          onClick={() => setActiveTab('campus_config')}
          className={`flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer shrink-0 ${
            activeTab === 'campus_config'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Geofence &amp; Network Rules</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer shrink-0 ${
            activeTab === 'audit'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Security Audit Trail</span>
        </button>

        <button
          onClick={() => setActiveTab('system')}
          className={`flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer shrink-0 ${
            activeTab === 'system'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>System Diagnostics</span>
        </button>

        <button
          onClick={() => setActiveTab('manual_reviews')}
          className={`flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer shrink-0 ${
            activeTab === 'manual_reviews'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span>Manual Reviews</span>
          {manualReviews.filter(r => r.status === 'pending').length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px]">
              {manualReviews.filter(r => r.status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: ATTENDANCE MASTER LOG */}
      {activeTab === 'attendance' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="p-4 rounded-xl bg-[#1c2541]/40 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search by name, ID code, or UID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadAttendance()}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Role Filter */}
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400">Role:</span>
              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setTimeout(loadAttendance, 10);
                }}
                className="bg-slate-900 text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="all">All Roles</option>
                <option value="staff">Faculty / Staff</option>
                <option value="student">Student</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setTimeout(loadAttendance, 10);
                }}
                className="bg-slate-900 text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="confirmed">Confirmed</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            {/* Checkpoint Filter */}
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400">Checkpoint:</span>
              <select
                value={checkpointFilter}
                onChange={(e) => {
                  setCheckpointFilter(e.target.value);
                  setTimeout(loadAttendance, 10);
                }}
                className="bg-slate-900 text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="all">All Checkpoints</option>
                <option value="entry">Daily Entry</option>
                <option value="checkpoint_1">Class Start (CP1)</option>
                <option value="checkpoint_2">Mid-Class (CP2)</option>
              </select>
            </div>

            <button
              onClick={loadAttendance}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-lg transition"
              title="Refresh attendance records"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingRecords ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Table */}
          <div className="bg-[#1c2541]/40 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Event ID / Hash</th>
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4">Role &amp; ID</th>
                    <th className="py-3 px-4">Session / Checkpoint</th>
                    <th className="py-3 px-4">Captured At</th>
                    <th className="py-3 px-4">Distance</th>
                    <th className="py-3 px-4">Biometric Distance</th>
                    <th className="py-3 px-4">Status &amp; Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        No attendance records match the selected query.
                      </td>
                    </tr>
                  ) : (
                    records.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-4 font-mono text-[11px] text-cyan-400">
                          <div>{rec.id}</div>
                          {rec.isOfflineSubmission && (
                            <span className="text-[10px] text-amber-400 font-bold">[Offline Synced]</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-white">
                          {rec.userName}
                        </td>
                        <td className="py-2.5 px-4 text-slate-300">
                          <span className="capitalize">{rec.userRole}</span>
                          <span className="block text-[10px] font-mono text-slate-400">{rec.identifierCode}</span>
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="capitalize font-medium text-slate-200">
                            {rec.sessionType.replace('_', ' ')}
                          </span>
                          <span className="block text-[10px] text-slate-400 capitalize">
                            ({rec.checkpointType})
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[11px] text-slate-300">
                          <div>{rec.eventDate}</div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(rec.capturedAt).toLocaleTimeString()}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-300">
                          {rec.distanceMeters !== undefined ? `${rec.distanceMeters}m` : 'N/A'}
                        </td>
                        <td className="py-2.5 px-4 font-mono">
                          {rec.faceDistance !== undefined ? (
                            <span className={rec.faceDistance <= 0.55 ? 'text-emerald-400' : 'text-rose-400 font-bold'}>
                              {rec.faceDistance.toFixed(3)}
                            </span>
                          ) : (
                            'N/A'
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          {rec.status === 'confirmed' ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Confirmed</span>
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[11px] font-bold">
                                <XCircle className="w-3 h-3" />
                                <span>Rejected</span>
                              </span>
                              {rec.rejectionReason && (
                                <span className="block text-[10px] text-rose-300 max-w-xs leading-tight">
                                  {rec.rejectionReason}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: USER DIRECTORY & BIOMETRICS */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Manage faculty &amp; student account authorization and biometric face vector enrollment status.</span>
            <button onClick={loadUsers} className="p-1.5 text-cyan-400 hover:text-white transition">
              <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="bg-[#1c2541]/40 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Identifier Code</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Biometric Enrollment</th>
                    <th className="py-3 px-4">Account Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {usersList.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-4 font-semibold text-white">{u.fullName}</td>
                      <td className="py-2.5 px-4 text-slate-300 font-mono text-[11px]">{u.email}</td>
                      <td className="py-2.5 px-4">
                        <span className="capitalize px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-cyan-300 border border-slate-700">
                          {u.role}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-cyan-400 text-[11px]">{u.identifierCode}</td>
                      <td className="py-2.5 px-4 text-slate-300">{u.department}</td>
                      <td className="py-2.5 px-4">
                        {u.isEnrolled ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>128-d Vector Enrolled</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Not Enrolled</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        {u.isActive ? (
                          <span className="text-emerald-400 font-semibold text-[11px]">Active</span>
                        ) : (
                          <span className="text-rose-400 font-semibold text-[11px]">Deactivated</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right space-x-1.5">
                        {u.isEnrolled && (
                          <button
                            onClick={() => handleResetEnrollment(u.id)}
                            className="p-1 text-slate-400 hover:text-amber-400 rounded transition"
                            title="Reset Biometric Face Profile"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleUserActive(u)}
                          className={`p-1 rounded transition ${
                            u.isActive
                              ? 'text-slate-400 hover:text-rose-400'
                              : 'text-slate-400 hover:text-emerald-400'
                          }`}
                          title={u.isActive ? 'Deactivate Account' : 'Activate Account'}
                        >
                          {u.isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CAMPUS GEOFENCE & NETWORK CONFIGURATION */}
      {activeTab === 'campus_config' && (
        <div className="max-w-2xl bg-[#1c2541]/40 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Campus Geofence &amp; Perimeter Configuration</h3>
            <p className="text-xs text-slate-400">
              Define the official geographic coordinates and perimeter tolerance for presence verification.
            </p>
          </div>

          {configSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{configSuccessMsg}</span>
            </div>
          )}

          <form onSubmit={handleSaveCampusConfig} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Campus Name</label>
              <input
                type="text"
                value={campusForm.campusName}
                onChange={(e) => setCampusForm({ ...campusForm, campusName: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Latitude (°N)</label>
                <input
                  type="number"
                  step="any"
                  value={campusForm.latitude}
                  onChange={(e) => setCampusForm({ ...campusForm, latitude: parseFloat(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                  required
                />
                <span className="text-[10px] text-slate-500">Default SKIT Jaipur: 26.8227</span>
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1">Longitude (°E)</label>
                <input
                  type="number"
                  step="any"
                  value={campusForm.longitude}
                  onChange={(e) => setCampusForm({ ...campusForm, longitude: parseFloat(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                  required
                />
                <span className="text-[10px] text-slate-500">Default SKIT Jaipur: 75.8647</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Geofence Radius (Meters)</label>
                <input
                  type="number"
                  value={campusForm.radiusMeters}
                  onChange={(e) => setCampusForm({ ...campusForm, radiusMeters: parseInt(e.target.value, 10) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                  required
                />
                <span className="text-[10px] text-slate-500">Submissions beyond this radius are rejected</span>
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1">Max Sensor Accuracy (Meters)</label>
                <input
                  type="number"
                  value={campusForm.maxAccuracyMeters}
                  onChange={(e) => setCampusForm({ ...campusForm, maxAccuracyMeters: parseInt(e.target.value, 10) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                  required
                />
                <span className="text-[10px] text-slate-500">Rejects low-confidence GPS readings</span>
              </div>
            </div>

            {/* Campus Wi-Fi Integration Settings */}
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-white font-semibold block">Campus Wi-Fi Provider Integration</span>
                  <span className="text-[11px] text-slate-400">
                    Browser security prevents reading Wi-Fi SSIDs without an enterprise gateway or captive portal webhook.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={campusForm.wifiEnabled}
                    onChange={(e) => setCampusForm({ ...campusForm, wifiEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>

              {campusForm.wifiEnabled && (
                <div className="p-3 bg-slate-900 rounded-xl space-y-2">
                  <label className="block text-slate-300 font-medium">Whitelisted Campus SSIDs (Comma-separated)</label>
                  <input
                    type="text"
                    value={campusForm.wifiTrustedSSIDs.join(', ')}
                    onChange={(e) =>
                      setCampusForm({
                        ...campusForm,
                        wifiTrustedSSIDs: e.target.value.split(',').map((s) => s.trim()),
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                  <p className="text-[10px] text-cyan-400">
                    Provider Interface: Ready for IEEE 802.1x RADIUS telemetry integration.
                  </p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={savingConfig}
              className="py-2.5 px-5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition cursor-pointer shadow-lg shadow-cyan-500/20"
            >
              {savingConfig ? 'Saving...' : 'Save Configuration Changes'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 4: SECURITY AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Immutable security ledger recording every verification, enrollment, and config modification.</span>
            <button onClick={loadAudit} className="p-1.5 text-cyan-400 hover:text-white transition">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-[#1c2541]/40 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-sans font-semibold">
                  <tr>
                    <th className="py-3 px-4">Audit ID</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-[11px]">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-4 text-cyan-400">{log.id}</td>
                      <td className="py-2.5 px-4 text-slate-300">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-white font-sans">{log.actorName}</td>
                      <td className="py-2.5 px-4 font-bold text-slate-200">{log.action}</td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            log.status === 'SUCCESS'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : log.status === 'FAILURE'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-400 max-w-xs truncate">
                        {JSON.stringify(log.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SYSTEM DIAGNOSTICS */}
      {activeTab === 'system' && (
        <div className="max-w-2xl bg-[#1c2541]/40 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white tracking-tight">System Health &amp; Hardware Diagnostics</h3>
            <button onClick={loadDiagnostics} className="p-1.5 text-cyan-400 hover:text-white transition">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {diagnostics && (
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-900 rounded-xl flex justify-between items-center">
                <span className="text-slate-400">Node.js Runtime:</span>
                <span className="font-mono text-cyan-300 font-bold">{String(diagnostics.nodeVersion)}</span>
              </div>
              <div className="p-3 bg-slate-900 rounded-xl flex justify-between items-center">
                <span className="text-slate-400">API Server Uptime:</span>
                <span className="font-mono text-white font-bold">{Math.round(Number(diagnostics.uptimeSeconds))} seconds</span>
              </div>
              <div className="p-3 bg-slate-900 rounded-xl flex justify-between items-center">
                <span className="text-slate-400">Memory Allocation (Heap):</span>
                <span className="font-mono text-white font-bold">{String(diagnostics.memoryUsageMB)} MB</span>
              </div>
              <div className="p-3 bg-slate-900 rounded-xl flex justify-between items-center">
                <span className="text-slate-400">Database Engine:</span>
                <span className="text-emerald-400 font-bold">{String(diagnostics.databaseStatus)}</span>
              </div>
              <div className="p-3 bg-slate-900 rounded-xl flex justify-between items-center">
                <span className="text-slate-400">Face Recognition Weights:</span>
                <span className="text-emerald-400 font-bold">{String(diagnostics.modelAssetsStatus)}</span>
              </div>
              <div className="p-3 bg-slate-900 rounded-xl flex justify-between items-center">
                <span className="text-slate-400">Tamper Protection Protocol:</span>
                <span className="text-cyan-400 font-bold">{String(diagnostics.tamperProtection)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: MANUAL REVIEWS */}
      {activeTab === 'manual_reviews' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#1c2541]/40 border border-slate-800 p-4 rounded-xl">
            <div>
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Biometric &amp; Presence Manual Exception Reviews</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {manualReviews.filter((r) => r.status === 'pending').length} Pending
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Supervisory override queue for camera glitches, illumination failures, or hardware exceptions.
              </p>
            </div>
            <button
              onClick={loadManualReviews}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition self-start sm:self-auto cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Queue</span>
            </button>
          </div>

          {loadingReviews ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-cyan-400" />
              Loading review requests...
            </div>
          ) : manualReviews.length === 0 ? (
            <div className="text-center py-12 border border-slate-800/80 rounded-2xl bg-[#1c2541]/20">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3 opacity-60" />
              <h4 className="text-sm font-bold text-slate-200">No Review Requests</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No users have requested manual presence verification review. Automated biometric verification is running smoothly.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {manualReviews.map((req) => (
                <div
                  key={req.id}
                  className={`p-4 rounded-xl border transition ${
                    req.status === 'pending'
                      ? 'bg-[#1c2541]/70 border-amber-500/40'
                      : req.status === 'approved'
                      ? 'bg-slate-900/60 border-emerald-500/30 opacity-80'
                      : 'bg-slate-900/60 border-rose-500/30 opacity-70'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex items-start space-x-3">
                      {req.photoSnapshot ? (
                        <img
                          src={req.photoSnapshot}
                          alt={req.userName}
                          className="w-16 h-16 rounded-xl object-cover border border-slate-700 bg-slate-950 shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 text-xs shrink-0">
                          No Photo
                        </div>
                      )}
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-bold text-white">{req.userName}</span>
                          <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50">
                            {req.identifierCode}
                          </span>
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                            {req.userRole}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-2 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800">
                          <span className="text-slate-400 font-semibold block text-[10px] uppercase tracking-wider mb-0.5">
                            Reported Issue / Reason:
                          </span>
                          {req.reason}
                        </p>
                        <div className="text-[11px] text-slate-500 mt-2 flex items-center space-x-3">
                          <span>Submitted: {new Date(req.createdAt).toLocaleString()}</span>
                          {req.resolvedAt && (
                            <span>• Resolved: {new Date(req.resolvedAt).toLocaleString()} by {req.resolvedBy || 'Admin'}</span>
                          )}
                        </div>
                        {req.adminNotes && (
                          <p className="text-xs text-emerald-400/90 mt-1 italic">
                            Admin Note: &ldquo;{req.adminNotes}&rdquo;
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end justify-between self-stretch shrink-0">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                          req.status === 'pending'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                            : req.status === 'approved'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                        }`}
                      >
                        {req.status}
                      </span>

                      {req.status === 'pending' && (
                        <div className="flex items-center space-x-2 mt-4">
                          <button
                            onClick={() => handleResolveReview(req.id, 'rejected')}
                            disabled={reviewActionLoading === req.id}
                            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleResolveReview(req.id, 'approved')}
                            disabled={reviewActionLoading === req.id}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-black transition disabled:opacity-50 cursor-pointer flex items-center space-x-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve &amp; Confirm</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
