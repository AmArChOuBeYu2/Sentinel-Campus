import React, { useState } from 'react';
import {
  GraduationCap,
  Presentation,
  Building2,
  ShieldCheck,
  ArrowRight,
  Phone,
  Mail,
  Lock,
  Sparkles,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
} from 'lucide-react';
import { UserRole, UserProfile } from '../types';
import { api } from '../services/api';

interface LoginScreenProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [stage, setStage] = useState<'role_select' | 'auth'>('role_select');
  const [selectedRole, setSelectedRole] = useState<UserRole>('student');
  const [credential, setCredential] = useState('krishna.jha@skit.ac.in');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [simulatedOtp, setSimulatedOtp] = useState<string | null>(null);
  const [phoneMasked, setPhoneMasked] = useState<string>('');
  const [activeUserId, setActiveUserId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
    setErrorMsg(null);
    setOtpSent(false);
    setOtp('');
    setSimulatedOtp(null);

    if (role === 'student') {
      setCredential('krishna.jha@skit.ac.in');
    } else if (role === 'teacher') {
      setCredential('amar.choubey@skit.ac.in');
    } else if (role === 'staff') {
      setCredential('sudhanshu.kumar@skit.ac.in');
    }
    setStage('auth');
  };

  const [emailMasked, setEmailMasked] = useState<string | null>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCred = credential.trim();
    if (!cleanCred) {
      setErrorMsg('Please enter your registered institutional email address.');
      return;
    }

    if (!cleanCred.includes('@')) {
      setErrorMsg('SMS authentication is not configured. Please enter your registered institutional email address to receive an email OTP.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.requestLogin({
        role: selectedRole,
        credential: cleanCred,
      });

      if (res.success) {
        setSimulatedOtp(res.simulatedOtp || null);
        setEmailMasked(res.emailMasked || cleanCred);
        if (res.userId) setActiveUserId(res.userId);
        setOtp(res.simulatedOtp || '');
        setOtpSent(true);
      } else {
        setErrorMsg(res.message || 'Authentication request failed.');
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
    if (!otp || otp.length !== 6) {
      setErrorMsg('Please enter the 6-digit passcode.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.verifyOtp({
        userId: activeUserId || undefined,
        credential: credential.trim(),
        role: selectedRole,
        otp: otp.trim(),
      });
      if (res.success && res.user) {
        if (res.user.role !== selectedRole && res.user.role !== 'admin') {
          setErrorMsg(`Role mismatch: Account is registered as ${res.user.role}, not ${selectedRole}.`);
          return;
        }
        onLoginSuccess(res.user);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMsg(e.message || 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = async (userId: string, role?: UserRole) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.quickDemoLogin(userId, role);
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
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8 selection:bg-[#800020] selection:text-white">
      <div className="max-w-md w-full mx-auto space-y-6">
        {/* Branding Crest */}
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

        {/* Main Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-5">
          {stage === 'role_select' ? (
            /* STAGE 1: Role Selection Cards */
            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-900">Select Your Role</h2>
                <p className="text-xs text-slate-500">
                  Choose your institutional affiliation to begin authentication.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {/* 1. Student Card */}
                <button
                  type="button"
                  onClick={() => handleSelectRole('student')}
                  className="flex items-start p-3.5 rounded-xl border border-slate-200 bg-white hover:border-[#800020] hover:bg-[#fffbfb] transition text-left cursor-pointer group shadow-2xs"
                >
                  <div className="p-2 rounded-lg bg-slate-100 text-slate-600 group-hover:bg-[#800020] group-hover:text-white mr-3 shrink-0 transition">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900 group-hover:text-[#800020]">Student</span>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#800020] transition" />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Lectures, timetable, slot attendance &amp; checkpoint statuses.
                    </p>
                  </div>
                </button>

                {/* 2. Teacher Card */}
                <button
                  type="button"
                  onClick={() => handleSelectRole('teacher')}
                  className="flex items-start p-3.5 rounded-xl border border-slate-200 bg-white hover:border-[#800020] hover:bg-[#fffbfb] transition text-left cursor-pointer group shadow-2xs"
                >
                  <div className="p-2 rounded-lg bg-slate-100 text-slate-600 group-hover:bg-[#800020] group-hover:text-white mr-3 shrink-0 transition">
                    <Presentation className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900 group-hover:text-[#800020]">Teacher</span>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#800020] transition" />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Mark faculty attendance, scan class QR &amp; capture student presence.
                    </p>
                  </div>
                </button>

                {/* 3. Staff Card */}
                <button
                  type="button"
                  onClick={() => handleSelectRole('staff')}
                  className="flex items-start p-3.5 rounded-xl border border-slate-200 bg-white hover:border-[#800020] hover:bg-[#fffbfb] transition text-left cursor-pointer group shadow-2xs"
                >
                  <div className="p-2 rounded-lg bg-slate-100 text-slate-600 group-hover:bg-[#800020] group-hover:text-white mr-3 shrink-0 transition">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900 group-hover:text-[#800020]">Staff / Administration</span>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#800020] transition" />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Personal biometric attendance, gate replacement &amp; verification history.
                    </p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            /* STAGE 2: Phone / Email Authentication & OTP */
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setStage('role_select');
                    setOtpSent(false);
                    setErrorMsg(null);
                  }}
                  className="flex items-center text-xs font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  <span>Change Role</span>
                </button>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#800020]/10 text-[#800020]">
                  {selectedRole} Portal
                </span>
              </div>

              {!otpSent ? (
                /* Step 2A: Email input + Send OTP */
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-900">Institutional Email Authentication</h3>
                    <p className="text-xs text-slate-500">
                      Enter your registered SKIT institutional email to receive a secure passcode via Resend.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Institutional Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        required
                        value={credential}
                        onChange={(e) => setCredential(e.target.value)}
                        placeholder="e.g. user@skit.ac.in"
                        className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#800020] focus:ring-2 focus:ring-[#800020]/20"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      * SMS phone OTP is not configured. Email verification is enforced.
                    </p>
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
                    className="w-full py-2.5 rounded-xl bg-[#800020] hover:bg-[#630018] text-white font-bold text-xs tracking-wide transition flex items-center justify-center space-x-2 shadow-md shadow-[#800020]/20 cursor-pointer disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Dispatching Passcode via Resend...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Email OTP</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* Step 2B: OTP Input + Verify and Login */
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="text-center space-y-1">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto">
                      <Mail className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">Enter Verification Code</h3>
                    <p className="text-xs text-slate-500">
                      Passcode sent via Resend to <strong className="text-slate-800">{emailMasked || credential}</strong>
                    </p>
                    <p className="text-[10px] text-slate-400">Valid for 5 minutes &bull; Single-use only</p>
                  </div>

                  {simulatedOtp && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs text-center space-y-0.5">
                      <span className="font-bold text-[10px] uppercase tracking-wider block text-amber-900">
                        DEMO Verification Mode:
                      </span>
                      <span>Simulated Passcode: <strong className="font-mono text-sm font-bold">{simulatedOtp}</strong></span>
                    </div>
                  )}

                  <div>
                    <label className="block text-center text-xs font-semibold text-slate-700 mb-1.5">
                      6-Digit OTP Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="123456"
                      className="w-full py-2 text-center font-mono text-xl tracking-[0.4em] bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#800020] focus:ring-2 focus:ring-[#800020]/20"
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
                    className="w-full py-2.5 rounded-xl bg-[#800020] hover:bg-[#630018] text-white font-bold text-xs tracking-wide transition flex items-center justify-center space-x-2 shadow-md shadow-[#800020]/20 cursor-pointer disabled:opacity-50"
                  >
                    {loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>Verify and Login</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setOtp('');
                      setErrorMsg(null);
                    }}
                    className="w-full text-center text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                  >
                    Resend passcode or change contact info
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Local Evaluation Quick Shortcut for 4 Demo Accounts */}
          <div className="pt-3 border-t border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span className="font-semibold text-slate-700 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#800020]" /> Demo Evaluation Quick Sign-In:
              </span>
              <span className="font-mono text-[#800020] font-bold">1-Click</span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 text-[10px]">
              <button
                type="button"
                onClick={() => handleQuickDemo('usr_stu_0001', 'student')}
                className="p-1.5 rounded-lg bg-slate-50 hover:bg-[#800020]/5 border border-slate-200 text-slate-800 hover:text-[#800020] text-left transition cursor-pointer"
              >
                <div className="font-bold">Student</div>
                <div className="text-[9px] text-slate-500 truncate">Krishna Jha</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemo('usr_tch_0001', 'teacher')}
                className="p-1.5 rounded-lg bg-slate-50 hover:bg-[#800020]/5 border border-slate-200 text-slate-800 hover:text-[#800020] text-left transition cursor-pointer"
              >
                <div className="font-bold">Teacher</div>
                <div className="text-[9px] text-slate-500 truncate">Amar Choubey</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemo('usr_sta_0001', 'staff')}
                className="p-1.5 rounded-lg bg-slate-50 hover:bg-[#800020]/5 border border-slate-200 text-slate-800 hover:text-[#800020] text-left transition cursor-pointer"
              >
                <div className="font-bold">Staff 1</div>
                <div className="text-[9px] text-slate-500 truncate">Sudhanshu K.</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemo('usr_sta_0002', 'staff')}
                className="p-1.5 rounded-lg bg-slate-50 hover:bg-[#800020]/5 border border-slate-200 text-slate-800 hover:text-[#800020] text-left transition cursor-pointer"
              >
                <div className="font-bold">Staff 2</div>
                <div className="text-[9px] text-slate-500 truncate">Chetan</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemo('usr_sta_0003', 'staff')}
                className="p-1.5 rounded-lg bg-slate-50 hover:bg-[#800020]/5 border border-slate-200 text-slate-800 hover:text-[#800020] text-left transition cursor-pointer"
              >
                <div className="font-bold">Staff 3</div>
                <div className="text-[9px] text-slate-500 truncate">Configurable</div>
              </button>
            </div>
          </div>
        </div>

        {/* Back to Public Landing */}
        <div className="text-center">
          <a href="/" className="text-xs text-slate-500 hover:text-slate-800 underline">
            ← Return to Sentinel Campus Home
          </a>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
