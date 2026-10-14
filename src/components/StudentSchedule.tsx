import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Camera,
  CheckCircle2,
  XCircle,
  FileEdit,
} from 'lucide-react';
import { ClassSession } from '../types';

interface StudentScheduleProps {
  classes: ClassSession[];
  onOpenAttendanceModal: (params: {
    sessionType: 'daily_staff' | 'class_session';
    sessionId: string;
    checkpointType: 'checkpoint_1' | 'checkpoint_2';
    title: string;
  }) => void;
}

export const StudentSchedule: React.FC<StudentScheduleProps> = ({
  classes,
  onOpenAttendanceModal,
}) => {
  const [selectedDay, setSelectedDay] = useState(14); // Wednesday Oct 14

  const weekDays = [
    { name: 'Mon', date: 12 },
    { name: 'Tue', date: 13 },
    { name: 'Wed', date: 14 },
    { name: 'Thu', date: 15 },
    { name: 'Fri', date: 16 },
    { name: 'Sat', date: 17 },
    { name: 'Sun', date: 18 },
  ];

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <h2 className="text-xl font-bold text-slate-900">Schedule</h2>
        <div className="flex items-center space-x-1 text-xs text-[#800020] font-semibold underline cursor-pointer">
          <span>Oct {selectedDay}, 2026</span>
          <FileEdit className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Horizontal Weekly Date Strip (As in Screenshot 3) */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-2.5 shadow-sm">
        {weekDays.map((d) => {
          const isSelected = d.date === selectedDay;
          return (
            <button
              key={d.date}
              onClick={() => setSelectedDay(d.date)}
              className={`flex flex-col items-center justify-center py-2 px-2.5 rounded-xl transition cursor-pointer ${
                isSelected
                  ? 'bg-[#800020] text-white font-bold shadow-md shadow-[#800020]/20'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <span className="text-[10px] font-medium">{d.name}</span>
              <span className="text-sm font-bold mt-0.5">{d.date}</span>
            </button>
          );
        })}
      </div>

      {/* Chronological List of Class Cards */}
      <div className="space-y-3">
        {classes.map((cls) => {
          const cp1 = cls.checkpoints?.checkpoint_1;
          const cp2 = cls.checkpoints?.checkpoint_2;

          return (
            <div
              key={cls.id}
              className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3 hover:border-slate-300 transition"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 font-mono">
                  {cls.startTime} - {cls.endTime}
                </span>

                <span
                  className={`px-3 py-0.5 rounded-md text-[10px] font-bold ${
                    cls.sessionCategory === 'Lecture'
                      ? 'bg-purple-50 text-purple-700 border border-purple-200'
                      : cls.sessionCategory === 'Exam'
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-pink-50 text-pink-700 border border-pink-200'
                  }`}
                >
                  {cls.sessionCategory}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900">{cls.courseName}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {cls.roomNumber} · {cls.instructorName}
                </p>
              </div>

              {/* Checkpoints Status */}
              <div className="pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                {/* Checkpoint 1 */}
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between space-y-1">
                  <span className="text-[11px] font-semibold text-slate-700">CP 1: Start of Class</span>
                  <div className="flex items-center space-x-1">
                    {cp1?.isCompleted ? (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Present (Verified)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-medium">
                        Awaiting Verification
                      </span>
                    )}
                  </div>
                </div>

                {/* Checkpoint 2 */}
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between space-y-1">
                  <span className="text-[11px] font-semibold text-slate-700">CP 2: Mid-Class</span>
                  <div className="flex items-center space-x-1">
                    {cp2?.isCompleted ? (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Present (Verified)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-medium">
                        Awaiting Verification
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
