import React, { useState, useEffect, useCallback } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { DemoControlBar } from './components/DemoControlBar';
import { LoginScreen } from './components/LoginScreen';
import { LandingPage } from './components/LandingPage';
import { AdminLoginScreen } from './components/AdminLoginScreen';
import { StudentDashboard } from './components/StudentDashboard';
import { TeacherDashboard } from './components/TeacherDashboard';
import { StaffDashboard } from './components/StaffDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { TeacherLaptopConsole } from './components/TeacherLaptopConsole';
import { AttendanceModal } from './components/AttendanceModal';
import { EnrollmentModal } from './components/EnrollmentModal';
import { MandatoryAttendanceScreen } from './components/MandatoryAttendanceScreen';
import { OfflineQueueDrawer } from './components/OfflineQueueDrawer';
import { UserProfile, CampusConfig, AttendanceEvent, ClassSession } from './types';
import { api } from './services/api';
import { geofenceService, GeolocationMode, DEFAULT_SKIT_COORDS } from './services/geofence';
import { offlineSyncService } from './services/offlineSync';
import { ShieldCheck, RefreshCw } from 'lucide-react';

function AppContent() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [gateUnlocked, setGateUnlocked] = useState<boolean>(false);
  const [campus, setCampus] = useState<CampusConfig>({
    campusName: DEFAULT_SKIT_COORDS.campusName,
    campusCode: 'SKIT-JAI-2026',
    latitude: DEFAULT_SKIT_COORDS.latitude,
    longitude: DEFAULT_SKIT_COORDS.longitude,
    radiusMeters: DEFAULT_SKIT_COORDS.radiusMeters,
    maxAccuracyMeters: DEFAULT_SKIT_COORDS.maxAccuracyMeters,
    wifiEnabled: false,
    wifiTrustedSSIDs: ['SKIT_CAMPUS_SECURE', 'SKIT_FACULTY_WIFI'],
    updatedAt: new Date().toISOString(),
  });
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [isOnline, setIsOnline] = useState(offlineSyncService.isOnline());
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(offlineSyncService.getSimulatedOffline());
  const [geoMode, setGeoMode] = useState<GeolocationMode>(geofenceService.getMode());
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Demo bar is hidden by default from normal UI; only visible if ?demo=1 in query or set in localStorage
  const location = useLocation();
  const [showDemoBar, setShowDemoBar] = useState<boolean>(() => {
    return (
      new URLSearchParams(window.location.search).get('demo') === '1' ||
      localStorage.getItem('sentinel_show_demo_bar') === '1'
    );
  });

  // Modals state
  const [attendanceParams, setAttendanceParams] = useState<{
    sessionType?: 'daily_staff' | 'class_session';
    sessionId?: string;
    checkpointType?: 'entry' | 'checkpoint_1' | 'checkpoint_2';
    title?: string;
  } | null>(null);
  const [isEnrollmentOpen, setIsEnrollmentOpen] = useState(false);
  const [isSyncDrawerOpen, setIsSyncDrawerOpen] = useState(false);

  const navigate = useNavigate();

  // Load session & campus config
  const initApp = useCallback(async () => {
    setLoading(true);
    try {
      const token = api.getToken();
      if (token) {
        const meRes = await api.getMe();
        if (meRes.success && meRes.user) {
          setUser(meRes.user);
          if (meRes.user.role === 'admin') {
            setGateUnlocked(true);
          } else {
            const gateRes = await api.getGateStatus().catch(() => null);
            setGateUnlocked(!!(gateRes && gateRes.gateUnlocked));
          }
        } else {
          setUser(null);
          setGateUnlocked(false);
        }
      } else {
        setUser(null);
        setGateUnlocked(false);
      }

      // Fetch Campus Config & Classes
      const [campusRes, classRes] = await Promise.all([
        api.getCampusConfig().catch(() => null),
        api.getCurrentClasses().catch(() => null),
      ]);

      if (campusRes && campusRes.success) setCampus(campusRes.config);
      if (classRes && classRes.success) setClasses(classRes.classes);
    } catch (err) {
      console.warn('[App] Session init error:', err);
      setUser(null);
      setGateUnlocked(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initApp();

    const unsub = offlineSyncService.subscribe(async () => {
      setIsOnline(offlineSyncService.isOnline());
      setIsSimulatedOffline(offlineSyncService.getSimulatedOffline());
      const count = await offlineSyncService.getPendingCount();
      setPendingSyncCount(count);
    });

    offlineSyncService.getPendingCount().then(setPendingSyncCount);
    return unsub;
  }, [initApp]);

  const handleLogout = () => {
    api.setToken(null);
    setUser(null);
    setGateUnlocked(false);
    navigate('/login');
  };

  const triggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleSelectUser = async (userId: string) => {
    const res = await api.quickDemoLogin(userId);
    if (res.success && res.user) {
      setUser(res.user);
      triggerRefresh();
      if (res.user.role === 'admin') {
        setGateUnlocked(true);
        navigate('/admin');
      } else {
        setGateUnlocked(false);
        navigate('/verify-presence');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-[#800020] flex items-center justify-center text-white animate-pulse shadow-md">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-base font-bold text-slate-900 tracking-tight">Sentinel Campus</h2>
          <p className="text-xs text-slate-500">Smart Attendance. Verified Presence.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col selection:bg-[#800020] selection:text-white">
      {/* Demo Control Bar: Hidden in normal UI, visible only when ?demo=1 is active */}
      {showDemoBar && user && (
        <DemoControlBar
          currentRole={user.role}
          currentUserId={user.id}
          onSelectUser={handleSelectUser}
          geoMode={geoMode}
          onGeoModeChange={setGeoMode}
          isSimulatedOffline={isSimulatedOffline}
          onToggleOffline={setIsSimulatedOffline}
        />
      )}

      <Routes>
        {/* Route 1: Public Login (/login) - Dedicated card selection for Student, Teacher, Staff only */}
        <Route
          path="/login"
          element={
            user ? (
              user.role === 'admin' ? (
                <Navigate to="/admin" replace />
              ) : gateUnlocked ? (
                <Navigate to="/" replace />
              ) : (
                <Navigate to="/verify-presence" replace />
              )
            ) : (
              <LoginScreen
                onLoginSuccess={(authedUser) => {
                  setUser(authedUser);
                  triggerRefresh();
                  if (authedUser.role === 'admin') {
                    setGateUnlocked(true);
                    navigate('/admin');
                  } else {
                    setGateUnlocked(false);
                    navigate('/verify-presence');
                  }
                }}
              />
            )
          }
        />

        {/* Route 2: Mandatory Personal Presence & Attendance Gate (/verify-presence) */}
        <Route
          path="/verify-presence"
          element={
            !user ? (
              <Navigate to="/login" replace />
            ) : user.role === 'admin' ? (
              <Navigate to="/admin" replace />
            ) : gateUnlocked ? (
              <Navigate to="/" replace />
            ) : (
              <MandatoryAttendanceScreen
                user={user}
                onUnlocked={() => {
                  setGateUnlocked(true);
                  triggerRefresh();
                  navigate('/');
                }}
                onLogout={handleLogout}
                onOpenEnrollmentModal={() => setIsEnrollmentOpen(true)}
              />
            )
          }
        />

        {/* Route 3: Isolated Admin Portal (/admin) - Dedicated Admin authentication & dashboard */}
        <Route
          path="/admin"
          element={
            !user || user.role !== 'admin' ? (
              <AdminLoginScreen
                onAdminLoginSuccess={(adminUser) => {
                  setUser(adminUser);
                  setGateUnlocked(true);
                  triggerRefresh();
                  navigate('/admin');
                }}
              />
            ) : (
              <div className="min-h-screen bg-[#0b132b] text-slate-100 flex flex-col">
                <Navbar
                  user={user}
                  onLogout={handleLogout}
                  isOnline={isOnline}
                  pendingSyncCount={pendingSyncCount}
                  onOpenSyncDrawer={() => setIsSyncDrawerOpen(true)}
                  onOpenEnrollment={() => setIsEnrollmentOpen(true)}
                />
                <main className="flex-1">
                  <AdminDashboard
                    adminUser={user}
                    campus={campus}
                    onCampusUpdated={(newConf) => setCampus(newConf)}
                    refreshTrigger={refreshTrigger}
                  />
                </main>
              </div>
            )
          }
        />

        {/* Route 4: Teacher Laptop Web Console (/teacher/console) */}
        <Route
          path="/teacher/console"
          element={
            <TeacherLaptopConsole
              user={user}
              campus={campus}
              onLogout={handleLogout}
              onOpenAttendanceModal={(params) => setAttendanceParams(params || {})}
            />
          }
        />

        {/* Route 5: Root (/) - Landing Page if unauthenticated; Role dashboard if authenticated & gate verified */}
        <Route
          path="/"
          element={
            !user ? (
              <LandingPage />
            ) : user.role === 'admin' ? (
              <Navigate to="/admin" replace />
            ) : !gateUnlocked ? (
              <Navigate to="/verify-presence" replace />
            ) : (
              <div className="flex flex-col min-h-screen">
                <Navbar
                  user={user}
                  onLogout={handleLogout}
                  isOnline={isOnline}
                  pendingSyncCount={pendingSyncCount}
                  onOpenSyncDrawer={() => setIsSyncDrawerOpen(true)}
                  onOpenEnrollment={() => setIsEnrollmentOpen(true)}
                />

                <main className="flex-1 pb-16 pt-2">
                  {user.role === 'student' && (
                    <StudentDashboard
                      user={user}
                      campus={campus}
                      onOpenAttendanceModal={(params) => setAttendanceParams(params || {})}
                      onOpenEnrollmentModal={() => setIsEnrollmentOpen(true)}
                      onLogout={handleLogout}
                      refreshTrigger={refreshTrigger}
                    />
                  )}

                  {user.role === 'teacher' && (
                    <div className="max-w-md mx-auto px-4 py-3">
                      <TeacherDashboard
                        user={user}
                        campus={campus}
                        classes={classes}
                        onOpenAttendanceModal={(params) => setAttendanceParams(params || {})}
                        onOpenEnrollment={() => setIsEnrollmentOpen(true)}
                        refreshTrigger={refreshTrigger}
                      />
                    </div>
                  )}

                  {user.role === 'staff' && (
                    <div className="max-w-md mx-auto px-4 py-3">
                      <StaffDashboard
                        user={user}
                        campus={campus}
                        onOpenAttendanceModal={(params) => setAttendanceParams(params || {})}
                        onOpenEnrollmentModal={() => setIsEnrollmentOpen(true)}
                        onOpenSyncDrawer={() => setIsSyncDrawerOpen(true)}
                        refreshTrigger={refreshTrigger}
                      />
                    </div>
                  )}
                </main>
              </div>
            )
          }
        />

        {/* Catch-all redirect to / */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Live Attendance Modal */}
      {attendanceParams && user && (
        <AttendanceModal
          user={user}
          campus={campus}
          sessionType={attendanceParams.sessionType}
          sessionId={attendanceParams.sessionId}
          checkpointType={attendanceParams.checkpointType}
          title={attendanceParams.title}
          onClose={() => setAttendanceParams(null)}
          onSuccess={(_rec?: AttendanceEvent) => {
            triggerRefresh();
          }}
          onOpenEnrollment={() => setIsEnrollmentOpen(true)}
        />
      )}

      {/* Biometric Face Enrollment Modal */}
      {isEnrollmentOpen && user && (
        <EnrollmentModal
          user={user}
          onClose={() => setIsEnrollmentOpen(false)}
          onSuccess={() => {
            setUser({ ...user, isEnrolled: true });
            triggerRefresh();
          }}
        />
      )}

      {/* Offline Queue Slide-Over Drawer */}
      <OfflineQueueDrawer
        isOpen={isSyncDrawerOpen}
        onClose={() => setIsSyncDrawerOpen(false)}
        onSyncCompleted={triggerRefresh}
      />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
