import React from 'react';
import {
  Home,
  Calendar,
  Bell,
  User,
  Clock,
  BookOpen,
} from 'lucide-react';
import { UserRole } from '../types';

export type NavTab = 'home' | 'classes' | 'attendance' | 'updates' | 'schedule' | 'profile';

interface BottomNavProps {
  role: UserRole;
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  unreadCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  role,
  activeTab,
  onTabChange,
  unreadCount = 3,
}) => {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 shadow-lg md:hidden">
      <div className="max-w-md mx-auto px-2 flex items-center justify-around h-16">
        {/* 1. Home */}
        <button
          onClick={() => onTabChange('home')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition cursor-pointer ${
            activeTab === 'home' ? 'text-[#800020]' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <div
            className={`p-1 rounded-xl transition ${
              activeTab === 'home' ? 'bg-[#800020]/10' : ''
            }`}
          >
            <Home className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-semibold mt-0.5">Home</span>
        </button>

        {/* 2. Role-specific Tab: Classes for Teacher, Attendance for Student/Staff */}
        {role === 'teacher' ? (
          <button
            onClick={() => onTabChange('classes')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition cursor-pointer ${
              activeTab === 'classes' ? 'text-[#800020]' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div
              className={`p-1 rounded-xl transition ${
                activeTab === 'classes' ? 'bg-[#800020]/10' : ''
              }`}
            >
              <BookOpen className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-semibold mt-0.5">My Classes</span>
          </button>
        ) : (
          <button
            onClick={() => onTabChange('attendance')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition cursor-pointer ${
              activeTab === 'attendance' ? 'text-[#800020]' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div
              className={`p-1 rounded-xl transition ${
                activeTab === 'attendance' ? 'bg-[#800020]/10' : ''
              }`}
            >
              <Clock className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-semibold mt-0.5">Attendance</span>
          </button>
        )}

        {/* 3. Updates */}
        <button
          onClick={() => onTabChange('updates')}
          className={`relative flex flex-col items-center justify-center flex-1 py-1 transition cursor-pointer ${
            activeTab === 'updates' ? 'text-[#800020]' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <div
            className={`p-1 rounded-xl transition relative ${
              activeTab === 'updates' ? 'bg-[#800020]/10' : ''
            }`}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-1 px-1 py-0.2 bg-[#800020] text-white text-[8px] font-bold rounded-full border-2 border-white">
                {unreadCount}+
              </span>
            )}
          </div>
          <span className="text-[10px] font-semibold mt-0.5">Updates</span>
        </button>

        {/* 4. Schedule */}
        <button
          onClick={() => onTabChange('schedule')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition cursor-pointer ${
            activeTab === 'schedule' ? 'text-[#800020]' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <div
            className={`p-1 rounded-xl transition ${
              activeTab === 'schedule' ? 'bg-[#800020]/10' : ''
            }`}
          >
            <Calendar className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-semibold mt-0.5">Schedule</span>
        </button>

        {/* 5. Profile */}
        <button
          onClick={() => onTabChange('profile')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition cursor-pointer ${
            activeTab === 'profile' ? 'text-[#800020]' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <div
            className={`p-1 rounded-xl transition ${
              activeTab === 'profile' ? 'bg-[#800020]/10' : ''
            }`}
          >
            <User className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-semibold mt-0.5">Profile</span>
        </button>
      </div>
    </nav>
  );
};
