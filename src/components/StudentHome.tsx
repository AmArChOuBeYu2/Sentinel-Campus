import React from 'react';
import {
  Clock,
  Calendar,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Camera,
  MapPin,
  BookOpen,
} from 'lucide-react';
import { UserProfile, CampusConfig, ClassSession, AttendanceEvent, Notice } from '../types';

interface StudentHomeProps {
  user: UserProfile;
  campus: CampusConfig;
  classes: ClassSession[];
  attendanceHistory: AttendanceEvent[];
  notices: Notice[];
  onOpenAttendanceModal: (params: {
    sessionType: 'daily_staff' | 'class_session';
    sessionId: string;
    checkpointType: 'checkpoint_1' | 'checkpoint_2';
    title: string;
  }) => void;
  onOpenCalendar: () => void;
  onNavigateTab: (tab: 'schedule' | 'updates' | 'profile' | 'attendance') => void;
  onOpenEnrollment?: () => void;
}

export const StudentHome: React.FC<StudentHomeProps> = ({
  user,
  classes,
  attendanceHistory,
  notices,
  onOpenAttendanceModal,
  onOpenCalendar,
  onNavigateTab,
  onOpenEnrollment,
}) => {
  const today = new Date().toISOString().split('T')[0];
  const todayRecords = attendanceHistory.filter((a) => a.eventDate === today);
  const attendedCount = todayRecords.filter((a) => a.status === 'confirmed').length;
  const totalSlotsToday = Math.max(classes.length, 4);

  // Overall calculations
  const totalSemesterSlots = 308;
  const attendedSemesterSlots = 180 + attendedCount;
  const overallPercentage = ((attendedSemesterSlots / totalSemesterSlots) * 100).toFixed(1);

  return (
    <div className="space-y-4 pb-20">
      {/* Biometric Enrollment Callout if Unenrolled */}
      {!user.isEnrolled && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 shadow-sm flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-amber-950">Biometric Profile Not Enrolled</h3>
              <p className="text-[11px] text-amber-800">Enroll your face to enable campus attendance verification.</p>
            </div>
          </div>
          {onOpenEnrollment && (
            <button
              onClick={onOpenEnrollment}
              className="px-3 py-1.5 rounded-xl bg-[#800020] hover:bg-[#630018] text-white text-xs font-bold shrink-0 transition shadow-sm cursor-pointer"
            >
              Enroll Face
            </button>
          )}
        </div>
      )}

      {/* 1. Top Pale Cream Attendance Summary Card (As in MyNIAT Screenshot 2) */}
      <div
        onClick={() => onNavigateTab('profile')}
        className="p-4 rounded-2xl bg-[#fdfbf7] border border-[#f5eedb] shadow-sm flex items-center justify-between cursor-pointer hover:border-[#800020]/20 transition"
      >
        <div className="flex items-center space-x-3.5">
          {/* Circular Percentage Dial */}
          <div className="relative w-14 h-14 rounded-full border-4 border-amber-300 bg-amber-50/50 flex items-center justify-center shrink-0">
            <span className="text-xs font-black text-amber-900">{overallPercentage}%</span>
          </div>

          <div>
            <h2 className="text-sm font-bold text-slate-900">{user.fullName}</h2>
            <div className="text-[11px] text-slate-500 mt-0.5 space-x-2">
              <span>
                Attended Slots: <strong className="text-amber-900 font-semibold">{attendedSemesterSlots}</strong>
              </span>
              <span className="text-slate-300">|</span>
              <span>
                Total Slots: <strong className="text-emerald-700 font-semibold">{totalSemesterSlots}</strong>
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              ID: {user.identifierCode}
            </div>
          </div>
        </div>

        <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
      </div>

      {/* 2. Today's Attendance Header & Carousel */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Today&apos;s Attendance</h3>
              <p className="text-[10px] text-slate-500">
                {new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-700">
            {attendedCount}/{totalSlotsToday} attended
          </span>
        </div>

        {/* Horizontal Carousel of Class Cards */}
        <div className="flex space-x-3 overflow-x-auto pb-2 no-scrollbar">
          {classes.map((cls) => {
            const cp1 = cls.checkpoints?.checkpoint_1;
            const isPresent = cp1?.isCompleted;

            return (
              <div
                key={cls.id}
                className="w-72 shrink-0 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">Today&apos;s Attendance</span>
                  <button
                    onClick={() => alert(`Query submitted for ${cls.courseCode} to Academic Office.`)}
                    className="text-[11px] font-semibold text-[#800020] hover:underline flex items-center"
                  >
                    Raise a Query &gt;
                  </button>
                </div>

                <div>
                  <span className="text-[11px] font-medium text-slate-400">{cls.startTime} - {cls.endTime}</span>
                  <h4 className="text-xs font-bold text-slate-900 mt-0.5 line-clamp-1">{cls.courseName}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">{cls.roomNumber} · {cls.instructorName}</p>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <span
                      className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        isPresent
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {isPresent ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : null}
                      <span>{isPresent ? 'Present (Verified)' : 'Awaiting Teacher Scan'}</span>
                    </span>
                  </div>

                  <span className="text-[10px] text-slate-400 font-mono">
                    {cls.sessionCategory}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Notices & Updates Section (MyNIAT Screenshot 2) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900">Notices &amp; Updates</h3>
          <button
            onClick={() => onNavigateTab('updates')}
            className="text-[11px] font-semibold text-[#800020] hover:underline"
          >
            View &gt;
          </button>
        </div>

        {notices.slice(0, 2).map((notice) => (
          <div
            key={notice.id}
            className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-start justify-between space-x-3"
          >
            <div className="space-y-1 flex-1">
              <div className="flex items-center space-x-1.5">
                <span className="w-1.5 h-3 bg-emerald-500 rounded-full" />
                <span className="text-[10px] font-bold tracking-wider text-slate-600 uppercase">
                  {notice.category}
                </span>
                <span className="w-1.5 h-1.5 bg-[#800020] rounded-full" />
              </div>
              <h4 className="text-xs font-bold text-slate-900 leading-snug line-clamp-1">
                {notice.title}
              </h4>
              <p className="text-[11px] text-slate-500 line-clamp-1">
                {notice.description}
              </p>
              <span className="text-[10px] text-slate-400 block pt-0.5">
                {notice.publishedAt}
              </span>
            </div>

            {/* Thumbnail */}
            <div className="w-16 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 text-[10px] font-black uppercase tracking-tight text-center p-1">
              SKIT 2026
            </div>
          </div>
        ))}
      </div>

      {/* 4. Upcoming Classes */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900">Upcoming Classes</h3>
          <button
            onClick={() => onNavigateTab('schedule')}
            className="text-[11px] font-semibold text-[#800020] hover:underline"
          >
            Full Timetable &gt;
          </button>
        </div>

        <div className="space-y-2">
          {classes.map((cls) => (
            <div
              key={cls.id}
              className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between hover:border-slate-300 transition"
            >
              <div>
                <span className="text-[11px] font-medium text-slate-400">{cls.startTime} - {cls.endTime}</span>
                <h4 className="text-xs font-bold text-slate-900">{cls.courseName}</h4>
                <p className="text-[11px] text-slate-500">{cls.roomNumber} · {cls.instructorName}</p>
              </div>

              <div className="text-right space-y-1">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                    cls.sessionCategory === 'Lecture'
                      ? 'bg-purple-50 text-purple-700 border border-purple-200'
                      : cls.sessionCategory === 'Exam'
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {cls.sessionCategory}
                </span>

                <button
                  onClick={() =>
                    onOpenAttendanceModal({
                      sessionType: 'class_session',
                      sessionId: cls.id,
                      checkpointType: 'checkpoint_2',
                      title: `${cls.courseCode}: Mid-Class Checkpoint`,
                    })
                  }
                  className="block text-[10px] font-bold text-[#800020] hover:underline"
                >
                  Mid Checkpoint &gt;
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
