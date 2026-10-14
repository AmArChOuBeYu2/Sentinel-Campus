import React from 'react';
import { ShieldCheck, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-[#800020] selection:text-white">
      {/* Top Header */}
      <header className="py-6 px-4 sm:px-8 border-b border-slate-200/60 bg-white/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-[#800020] flex items-center justify-center text-white shadow-md shadow-[#800020]/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <span className="text-base font-black text-slate-900 tracking-tight">Sentinel Campus</span>
              <span className="block text-[10px] font-bold text-[#800020] uppercase tracking-wider">
                SKIT Jaipur • IEEE IGNITE 2026
              </span>
            </div>
          </div>

          <Link
            to="/login"
            className="px-4 py-2 rounded-xl bg-[#800020] hover:bg-[#630018] text-white text-xs font-bold transition shadow-sm cursor-pointer"
          >
            Portal Login
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full mx-auto text-center space-y-7">
          {/* Emblem */}
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-[#800020] text-white shadow-xl shadow-[#800020]/25 transform transition hover:scale-105 duration-200">
            <ShieldCheck className="w-11 h-11" />
          </div>

          {/* Branding & Tagline */}
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              Sentinel Campus
            </h1>
            <p className="text-base font-bold text-[#800020] tracking-wide">
              Smart Attendance. Verified Presence.
            </p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
              Mobile-first campus presence verification combining live facial biometrics, device geofencing, and classroom QR attendance.
            </p>
          </div>

          {/* Prominent Login Button */}
          <div className="pt-2">
            <Link
              to="/login"
              className="inline-flex items-center justify-center w-full py-4 px-6 rounded-2xl bg-[#800020] hover:bg-[#630018] text-white font-bold text-sm tracking-wide shadow-lg shadow-[#800020]/30 transition-all duration-200 cursor-pointer space-x-2.5 group"
            >
              <span>Login to Campus Portal</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          {/* Institutional Trust Badges */}
          <div className="pt-4 flex items-center justify-center space-x-4 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Live Biometric Matching
            </span>
            <span className="text-slate-300">•</span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Geofence Verified
            </span>
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="py-4 text-center text-[11px] text-slate-400 border-t border-slate-200/50">
        Problem Statement 23: Smart Campus, Facial Recognition &amp; Mobile App • SKIT Jaipur
      </footer>
    </div>
  );
};

export default LandingPage;
