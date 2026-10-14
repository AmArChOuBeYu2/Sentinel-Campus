import React, { useState, useEffect } from 'react';
import { UserProfile, CampusConfig, ClassSession, AttendanceEvent, Notice } from '../types';
import { api } from '../services/api';
import { BottomNav, NavTab } from './BottomNav';
import { StudentHome } from './StudentHome';
import { StudentSchedule } from './StudentSchedule';
import { StudentProfile } from './StudentProfile';
import { StudentAttendanceTab } from './StudentAttendanceTab';
import { StudentUpdatesTab } from './StudentUpdatesTab';

interface StudentDashboardProps {
  user: UserProfile;
  campus: CampusConfig;
  onOpenAttendanceModal: (params?: {
    sessionType?: 'daily_staff' | 'class_session';
    sessionId?: string;
    checkpointType?: 'entry' | 'checkpoint_1' | 'checkpoint_2';
    title?: string;
  }) => void;
  onOpenEnrollmentModal: () => void;
  onLogout: () => void;
  refreshTrigger: number;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  user,
  campus,
  onOpenAttendanceModal,
  onOpenEnrollmentModal,
  onLogout,
  refreshTrigger,
}) => {
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceEvent[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);

  const loadData = async () => {
    try {
      const [classRes, attRes, notRes] = await Promise.all([
        api.getCurrentClasses(),
        api.getMyAttendance(),
        api.getNotices('student'),
      ]);

      if (classRes.success) setClasses(classRes.classes);
      if (attRes.success) setAttendanceHistory(attRes.records);
      if (notRes.success) setNotices(notRes.notices);
    } catch (err) {
      console.error('[StudentDashboard] Data load error:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [refreshTrigger, campus]);

  return (
    <div className="max-w-md mx-auto px-4 py-3">
      {/* Tab Content */}
      {activeTab === 'home' && (
        <StudentHome
          user={user}
          campus={campus}
          classes={classes}
          attendanceHistory={attendanceHistory}
          notices={notices}
          onOpenAttendanceModal={(p) => onOpenAttendanceModal(p)}
          onOpenCalendar={() => setActiveTab('profile')}
          onNavigateTab={(t) => setActiveTab(t)}
          onOpenEnrollment={onOpenEnrollmentModal}
        />
      )}

      {activeTab === 'attendance' && (
        <StudentAttendanceTab
          user={user}
          records={attendanceHistory}
          onOpenCalendar={() => setActiveTab('profile')}
        />
      )}

      {activeTab === 'schedule' && (
        <StudentSchedule
          classes={classes}
          onOpenAttendanceModal={(p) => onOpenAttendanceModal(p)}
        />
      )}

      {activeTab === 'updates' && <StudentUpdatesTab notices={notices} />}

      {activeTab === 'profile' && (
        <StudentProfile
          user={user}
          attendanceHistory={attendanceHistory}
          onLogout={onLogout}
          onOpenEnrollment={onOpenEnrollmentModal}
        />
      )}

      {/* Mobile Bottom Navigation */}
      <BottomNav
        role="student"
        activeTab={activeTab}
        onTabChange={setActiveTab}
        unreadCount={notices.length}
      />
    </div>
  );
};
