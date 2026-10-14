import React, { useState } from 'react';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Filter,
  Calendar,
  ShieldCheck,
  KeyRound,
} from 'lucide-react';
import { AttendanceEvent, UserProfile } from '../types';

interface StudentAttendanceTabProps {
  user: UserProfile;
  records: AttendanceEvent[];
  onOpenCalendar: () => void;
}

export const StudentAttendanceTab: React.FC<StudentAttendanceTabProps> = ({
  user,
  records,
  onOpenCalendar,
}) => {
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'rejected'>('all');

  const filtered = records.filter((r) => {
    if (filter === 'confirmed') return r.status === 'confirmed';
    if (filter === 'rejected') return r.status === 'rejected';
    return true;
  });

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Attendance Log</h2>
          <p className="text-xs text-slate-500">Continuous presence verified ledger</p>
        </div>

        <button
          onClick={onOpenCalendar}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#800020]/10 text-[#800020] text-xs font-bold hover:bg-[#800020]/15 transition cursor-pointer"
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Calendar</span>
        </button>
      </div>

      {/* Filter Chips */}
      <div className="flex space-x-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
            filter === 'all'
              ? 'bg-[#800020] text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200'
          }`}
        >
          All ({records.length})
        </button>
        <button
          onClick={() => setFilter('confirmed')}
          className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
            filter === 'confirmed'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200'
          }`}
        >
          Confirmed ({records.filter((r) => r.status === 'confirmed').length})
        </button>
        <button
          onClick={() => setFilter('rejected')}
          className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
            filter === 'rejected'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200'
          }`}
        >
          Rejected ({records.filter((r) => r.status === 'rejected').length})
        </button>
      </div>

      {/* Records List */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            No attendance records matching this filter.
          </div>
        ) : (
          filtered.map((rec) => (
            <div key={rec.id} className="p-4 space-y-1.5 hover:bg-slate-50 transition">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900 capitalize">
                  {rec.sessionType.replace('_', ' ')} · {rec.checkpointType}
                </span>

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

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 font-mono">
                <span>Date: {rec.eventDate}</span>
                <span>Time: {new Date(rec.capturedAt).toLocaleTimeString()}</span>
                <span>Dist: {rec.distanceMeters}m</span>
                {rec.faceDistance !== undefined && (
                  <span>FaceDist: {rec.faceDistance.toFixed(3)}</span>
                )}
                {rec.presenceKeyUsed && (
                  <span className="text-[#800020] font-bold">Key: {rec.presenceKeyUsed}</span>
                )}
              </div>

              {rec.rejectionReason && (
                <div className="text-[11px] text-rose-600 bg-rose-50 p-2 rounded-lg mt-1">
                  Reason: {rec.rejectionReason}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
