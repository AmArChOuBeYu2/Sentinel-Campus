import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  HelpCircle,
  FileText,
  BookOpen,
  MessageSquare,
  ChevronRight,
  LogOut,
  Edit3,
  X,
  ChevronLeft,
  ShieldCheck,
} from 'lucide-react';
import { UserProfile, AttendanceEvent } from '../types';

interface StudentProfileProps {
  user: UserProfile;
  attendanceHistory: AttendanceEvent[];
  onLogout: () => void;
  onOpenEnrollment: () => void;
}

export const StudentProfile: React.FC<StudentProfileProps> = ({
  user,
  attendanceHistory,
  onLogout,
  onOpenEnrollment,
}) => {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState('October, 2026');

  // Pre-configured calendar days matching screenshot 5 pattern
  const calendarDays = [
    { day: 1, type: 'holiday' },
    { day: 2, type: 'holiday' },
    { day: 3, type: 'holiday' },
    { day: 4, type: 'holiday' },
    { day: 5, type: 'partial' },
    { day: 6, type: 'partial' },
    { day: 7, type: 'partial' },
    { day: 8, type: 'holiday' },
    { day: 9, type: 'partial' },
    { day: 10, type: 'partial' },
    { day: 11, type: 'present' },
    { day: 12, type: 'partial' },
    { day: 13, type: 'present' },
    { day: 14, type: 'present' }, // Today
    { day: 15, type: 'holiday' },
    { day: 16, type: 'holiday' },
    { day: 17, type: 'holiday' },
    { day: 18, type: 'holiday' },
    { day: 19, type: 'holiday' },
    { day: 20, type: 'holiday' },
    { day: 21, type: 'holiday' },
    { day: 22, type: 'holiday' },
    { day: 23, type: 'present' },
    { day: 24, type: 'present' },
    { day: 25, type: 'present' },
    { day: 26, type: 'holiday' },
    { day: 27, type: 'present' },
    { day: 28, type: 'present' },
    { day: 29, type: 'holiday' },
    { day: 30, type: 'present' },
    { day: 31, type: 'absent' },
  ];

  return (
    <div className="space-y-5 pb-20">
      {/* Profile Header (Screenshot 4) */}
      <div className="p-5 rounded-2xl bg-[#fdfbf7] border border-[#f5eedb] space-y-4 shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 rounded-full bg-[#800020]/10 border-2 border-[#800020]/20 flex items-center justify-center text-[#800020] font-black text-xl shrink-0">
            {user.fullName.split(' ').map((n) => n[0]).join('')}
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{user.fullName}</h2>
              <span className="text-[#0077b5] text-xs font-bold">in</span>
            </div>
            <div className="text-xs font-mono text-slate-500 mt-0.5">
              ID: {user.identifierCode}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              1 · {user.department}
            </div>
          </div>
        </div>

        {/* 4 Action Grid Cards */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            onClick={() => setIsCalendarOpen(true)}
            className="p-3.5 rounded-xl bg-white border border-slate-200 text-left hover:border-[#800020]/30 transition shadow-xs cursor-pointer flex flex-col justify-between h-20"
          >
            <CalendarIcon className="w-5 h-5 text-slate-600" />
            <span className="text-xs font-bold text-slate-800">Academic Calendar</span>
          </button>

          <button
            onClick={() => alert('Frequently Asked Questions & Attendance Regulations opened.')}
            className="p-3.5 rounded-xl bg-white border border-slate-200 text-left hover:border-[#800020]/30 transition shadow-xs cursor-pointer flex flex-col justify-between h-20"
          >
            <HelpCircle className="w-5 h-5 text-slate-600" />
            <span className="text-xs font-bold text-slate-800">FAQ&apos;s</span>
          </button>

          <button
            onClick={() => alert('Sentinel Campus Presence Verification Policies (IEEE IGNITE 2026).')}
            className="p-3.5 rounded-xl bg-white border border-slate-200 text-left hover:border-[#800020]/30 transition shadow-xs cursor-pointer flex flex-col justify-between h-20"
          >
            <FileText className="w-5 h-5 text-slate-600" />
            <span className="text-xs font-bold text-slate-800">Campus Policies</span>
          </button>

          <button
            onClick={() => alert('B.Tech Curriculum & Syllabi loaded.')}
            className="p-3.5 rounded-xl bg-white border border-slate-200 text-left hover:border-[#800020]/30 transition shadow-xs cursor-pointer flex flex-col justify-between h-20"
          >
            <BookOpen className="w-5 h-5 text-slate-600" />
            <span className="text-xs font-bold text-slate-800">Curriculum</span>
          </button>
        </div>

        {/* Raise a query button */}
        <button
          onClick={() => alert('Support Query ticket opened with Registrar Office.')}
          className="w-full py-2.5 rounded-xl bg-white border border-slate-200 text-slate-800 font-bold text-xs hover:bg-slate-50 transition flex items-center justify-center space-x-2 shadow-xs cursor-pointer"
        >
          <HelpCircle className="w-4 h-4 text-slate-500" />
          <span>Raise a Query</span>
        </button>
      </div>

      {/* Attendance Stats Overview (Screenshot 4) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-bold text-slate-900">Attendance</h3>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>
          <span className="text-xs text-slate-600">
            Current Semester: <strong className="text-slate-900 font-bold">58.4%</strong>
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <span className="text-lg font-black text-emerald-600 block">180</span>
            <span className="text-[11px] text-slate-500">Attended Slots</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <span className="text-lg font-black text-lime-700 block">308</span>
            <span className="text-[11px] text-slate-500">Total Slots</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <span className="text-lg font-black text-rose-500 block">128</span>
            <span className="text-[11px] text-slate-500">Missed Slots</span>
          </div>
        </div>
      </div>

      {/* Biometric Status & Account Settings */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3 shadow-sm text-xs">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-900">Biometric Facial Verification</span>
          {user.isEnrolled ? (
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
              128-d Vector Enrolled
            </span>
          ) : (
            <button
              onClick={onOpenEnrollment}
              className="px-2.5 py-1 rounded-lg bg-[#800020] text-white text-[10px] font-bold"
            >
              Enroll Now
            </button>
          )}
        </div>

        <div className="flex items-center justify-between text-slate-600 pt-2 border-t border-slate-100">
          <span>Registered Phone:</span>
          <span className="font-mono text-slate-800">{user.phone}</span>
        </div>
        <div className="flex items-center justify-between text-slate-600">
          <span>Registered Email:</span>
          <span className="font-mono text-slate-800">{user.email}</span>
        </div>
      </div>

      {/* Logout button */}
      <button
        onClick={onLogout}
        className="w-full py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs hover:bg-rose-100 transition flex items-center justify-center space-x-1.5 cursor-pointer"
      >
        <LogOut className="w-4 h-4" />
        <span>Switch Account / Sign Out</span>
      </button>

      {/* INTERACTIVE CALENDAR MODAL (Exact match for Screenshot 5) */}
      {isCalendarOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-sm overflow-hidden p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ChevronLeft className="w-4 h-4 text-emerald-800 cursor-pointer" />
                <h3 className="text-base font-bold text-slate-900">{calendarMonth}</h3>
                <ChevronRight className="w-4 h-4 text-emerald-800 cursor-pointer" />
              </div>

              <button
                onClick={() => setIsCalendarOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Days of week header */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-1.5 text-center">
              {calendarDays.map((d) => {
                let colorClass = 'bg-slate-100 text-slate-400';
                if (d.type === 'present') {
                  colorClass = 'bg-emerald-500 text-white font-bold shadow-xs';
                } else if (d.type === 'absent') {
                  colorClass = 'bg-rose-500 text-white font-bold shadow-xs';
                } else if (d.type === 'partial') {
                  colorClass = 'bg-emerald-100 text-emerald-900 font-semibold';
                }

                return (
                  <div
                    key={d.day}
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs mx-auto transition cursor-pointer ${colorClass}`}
                  >
                    {d.day}
                  </div>
                );
              })}
            </div>

            {/* Legend at bottom (Screenshot 5) */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600 font-medium">
              <div className="flex items-center space-x-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
                <span>Present</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-3 h-3 rounded-full bg-rose-500" />
                <span>Absent</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-200" />
                <span>Partial</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-3 h-3 rounded-full bg-slate-200" />
                <span>Holiday</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
