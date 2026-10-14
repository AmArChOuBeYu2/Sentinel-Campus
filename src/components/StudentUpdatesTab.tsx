import React from 'react';
import { Bell, Sparkles, Calendar, Tag } from 'lucide-react';
import { Notice } from '../types';

interface StudentUpdatesTabProps {
  notices: Notice[];
}

export const StudentUpdatesTab: React.FC<StudentUpdatesTabProps> = ({ notices }) => {
  return (
    <div className="space-y-4 pb-20">
      <div className="pt-1">
        <h2 className="text-xl font-bold text-slate-900">Campus Notices &amp; Updates</h2>
        <p className="text-xs text-slate-500">Official academic notifications &amp; circulars</p>
      </div>

      <div className="space-y-3">
        {notices.map((notice) => (
          <div
            key={notice.id}
            className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2 hover:border-slate-300 transition"
          >
            <div className="flex items-center justify-between">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  notice.category === 'GENERAL'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : notice.category === 'ACADEMIC'
                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                    : notice.category === 'EXAM'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {notice.category}
              </span>

              <span className="text-[10px] text-slate-400 font-medium">{notice.publishedAt}</span>
            </div>

            <h3 className="text-sm font-bold text-slate-900">{notice.title}</h3>
            <p className="text-xs text-slate-600 leading-relaxed">{notice.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
