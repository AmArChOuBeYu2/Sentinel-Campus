import React, { useState } from 'react';
import {
  GraduationCap,
  Presentation,
  Building2,
  ShieldCheck,
  ArrowRight,
  KeyRound,
  Phone,
  Mail,
  Lock,
  Sparkles,
  AlertCircle,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import { UserRole, UserProfile } from '../types';
import { api } from '../services/api';

interface LoginScreenProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>('student');
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [credential, setCredential] = useState('amar.choubey@skit.ac.in');
  const [institutionalKey, setInstitutionalKey] = useState('SC-STU-2026-0001');
  const [otp, setOtp] = useState('123456');
  const [simulatedOtp, setSimulatedOtp] = useState<string | null>(null);
  const [phoneMasked, setPhoneMasked] = useState<string>('');
  const [activeUserId, setActiveUserId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync sample credentials on role change
  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
    setErrorMsg(null);
    if (role === 'student') {
      setCredential('amar.choubey@skit.ac.in');
      setInstitutionalKey('SC-STU-2026-0001');
    } else if (role === 'teacher') {
      setCredential('rajesh.sharma@skit.ac.in');
      setInstitutionalKey('SC-TCH-2026-0001');
    } else if (role === 'staff') {
      setCredential('priya.mehta@skit.ac.in');
      setInstitutionalKey('SC-STA-2026-0001');
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.requestLogin({
        role: selectedRole,
        credential,
        institutionalKey,
      });

      if (res.success) {
        setSimulatedOtp(res.simulatedOtp);
        setPhoneMasked(res.phoneMasked);
        setActiveUserId(res.userId);
        setOtp(res.simulatedOtp); // Pre-fill in demo mode for frictionless testing
        setStep('otp');
      }
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMsg(e.message || 'Authentication request failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.verifyOtp(activeUserId, otp);
      if (res.success && res.user) {
        onLoginSuccess(res.user);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMsg(e.message || 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  // Instant 1-click Demo Shortcut
  const handleQuickDemo = async (userId: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.quickDemoLogin(userId);
      if (res.success && res.user) {
        onLoginSuccess(res.user);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMsg(e.message || 'Demo sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto space-y-6">
        {/* Institutional Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#800020] text-white shadow-lg shadow-[#800020]/20 mb-1">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Sentinel Campus</h1>
          <p className="text-xs font-semibold text-[#800020] uppercase tracking-wider">
            Smart Attendance. Verified Presence.
          </p>
          <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
            IEEE IGNITE 2026 • SKIT Jaipur (Problem Statement 23)
          </p>
        </div>

        {/* Card Container */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-5">
          {step === 'credentials' ? (
            <>
              {/* Question */}
              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-900">How are you logging in?</h2>
                <p className="text-xs text-slate-500">
                  Select your institutional affiliation to begin authentication.
                </p>
              </div>

              {/* 3 Visually Distinct Role Cards */}
              <div className="grid grid-cols-1 gap-2.5">
                {/* 1. Student */}
                <button
                  type="button"
                  onClick={() => handleSelectRole('student')}
                  className={`flex items-start p-3.5 rounded-xl border text-left transition cursor-pointer ${
                    selectedRole === 'student'
                      ? 'border-[#800020] bg-[#fffbfb] ring-2 ring-[#800020]/15'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg mr-3 shrink-0 ${
                      selectedRole === 'student'
                        ? 'bg-[#800020] text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">Student</span>
                      {selectedRole === 'student' && (
                        <span className="text-[10px] font-bold text-[#800020] uppercase bg-[#800020]/10 px-2 py-0.5 rounded-full">
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Lectures, classroom presence keys, timetable &amp; slot attendance.
                    </p>
                  </div>
                </button>

                {/* 2. Teacher */}
                <button
                  type="button"
                  onClick={() => handleSelectRole('teacher')}
                  className={`flex items-start p-3.5 rounded-xl border text-left transition cursor-pointer ${
                    selectedRole === 'teacher'
                      ? 'border-[#800020] bg-[#fffbfb] ring-2 ring-[#800020]/15'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg mr-3 shrink-0 ${
                      selectedRole === 'teacher'
                        ? 'bg-[#800020] text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Presentation className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">Teacher</span>
                      {selectedRole === 'teacher' && (
                        <span className="text-[10px] font-bold text-[#800020] uppercase bg-[#800020]/10 px-2 py-0.5 rounded-full">
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Generate Presence Keys, track classroom rosters &amp; verify presence.
                    </p>
                  </div>
                </button>

                {/* 3. Staff / Other Professional */}
                <button
                  type="button"
                  onClick={() => handleSelectRole('staff')}
                  className={`flex items-start p-3.5 rounded-xl border text-left transition cursor-pointer ${
                    selectedRole === 'staff'
                      ? 'border-[#800020] bg-[#fffbfb] ring-2 ring-[#800020]/15'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg mr-3 shrink-0 ${
                      selectedRole === 'staff'
                        ? 'bg-[#800020] text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">Staff / Other Professional</span>
                      {selectedRole === 'staff' && (
                        <span className="text-[10px] font-bold text-[#800020] uppercase bg-[#800020]/10 px-2 py-0.5 rounded-full">
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Direct mobile camera gate-replacement attendance &amp; department presence.
                    </p>
                  </div>
                </button>
              </div>

              {/* Login Form */}
              <form onSubmit={handleRequestOtp} className="space-y-3.5 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Unique Institutional Key
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={institutionalKey}
                      onChange={(e) => setInstitutionalKey(e.target.value)}
                      placeholder="e.g. SC-STU-2026-0001"
                      className="w-full pl-9 pr-3 py-2 text-xs font-mono uppercase bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#800020]/20 focus:border-[#800020]"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Assigned by Academic Administration Office.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Registered Email or Phone Number
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={credential}
                      onChange={(e) => setCredential(e.target.value)}
                      placeholder="e.g. student@skit.ac.in or +91 98765 43210"
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#800020]/20 focus:border-[#800020]"
                    />
                  </div>
                </div>

                {errorMsg && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-[#800020] hover:bg-[#630018] text-white font-bold text-xs tracking-wide transition flex items-center justify-center space-x-2 shadow-md shadow-[#800020]/20 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying Institutional ID...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue with Institutional Verification</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            /* OTP Screen */
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto">
                  <Phone className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900">OTP Verification</h3>
                <p className="text-xs text-slate-500">
                  Enter the 6-digit one-time passcode sent to{' '}
                  <span className="font-semibold text-slate-800">{phoneMasked}</span>
                </p>
              </div>

              {simulatedOtp && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs text-center space-y-1">
                  <span className="font-bold block">Demonstration Mode Active:</span>
                  <span>Simulated OTP delivered: <strong className="font-mono text-sm">{simulatedOtp}</strong></span>
                </div>
              )}

              <div>
                <label className="block text-center text-xs font-semibold text-slate-700 mb-2">
                  Enter 6-Digit Passcode
                </label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full py-2.5 text-center font-mono text-xl tracking-[0.5em] bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#800020] focus:ring-2 focus:ring-[#800020]/20"
                />
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-[#800020] hover:bg-[#630018] text-white font-bold text-xs tracking-wide transition flex items-center justify-center space-x-2 shadow-md shadow-[#800020]/20 cursor-pointer"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Verify Passcode &amp; Access Campus Portal</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStep('credentials')}
                className="w-full text-center text-xs text-slate-500 hover:text-slate-800 underline"
              >
                Back to institutional credentials
              </button>
            </form>
          )}

          {/* 1-Click Demo Evaluation Shortcut for Judges */}
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-semibold text-slate-700 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#800020]" /> Hackathon Judge Quick Logins:
              </span>
              <span>1-Click Bypass</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => handleQuickDemo('usr_stu_0001')}
                className="p-2 rounded-lg bg-slate-50 hover:bg-[#800020]/5 border border-slate-200 text-slate-800 hover:text-[#800020] text-left transition cursor-pointer"
              >
                <div className="font-bold">Student</div>
                <div className="text-[10px] text-slate-500 truncate">Amar Choubey</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemo('usr_tch_0001')}
                className="p-2 rounded-lg bg-slate-50 hover:bg-[#800020]/5 border border-slate-200 text-slate-800 hover:text-[#800020] text-left transition cursor-pointer"
              >
                <div className="font-bold">Teacher</div>
                <div className="text-[10px] text-slate-500 truncate">Dr. Rajesh Sharma</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemo('usr_sta_0001')}
                className="p-2 rounded-lg bg-slate-50 hover:bg-[#800020]/5 border border-slate-200 text-slate-800 hover:text-[#800020] text-left transition cursor-pointer"
              >
                <div className="font-bold">Staff</div>
                <div className="text-[10px] text-slate-500 truncate">Er. Priya Mehta</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
