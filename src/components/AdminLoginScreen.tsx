import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  Mail,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import { UserProfile } from '../types';
import { api } from '../services/api';

interface AdminLoginScreenProps {
  onAdminLoginSuccess: (adminUser: UserProfile) => void;
}

export const AdminLoginScreen: React.FC<AdminLoginScreenProps> = ({ onAdminLoginSuccess }) => {
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [credential, setCredential] = useState('dean.acad@skit.ac.in');
  const [institutionalKey, setInstitutionalKey] = useState('SC-ADM-2026-0001');
  const [otp, setOtp] = useState('123456');
  const [simulatedOtp, setSimulatedOtp] = useState<string | null>(null);
  const [phoneMasked, setPhoneMasked] = useState<string>('');
  const [activeUserId, setActiveUserId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.requestLogin({
        role: 'admin',
        credential,
        institutionalKey,
      });

      if (res.success) {
        setSimulatedOtp(res.simulatedOtp || null);
        setPhoneMasked(res.emailMasked || credential);
        setActiveUserId(res.userId || '');
        setOtp(res.simulatedOtp || '');
        setStep('otp');
      }
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMsg(e.message || 'Administrator authentication request failed.');
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
        if (res.user.role !== 'admin') {
          setErrorMsg('Access denied: Account does not hold institutional administrator clearance.');
          return;
        }
        onAdminLoginSuccess(res.user);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMsg(e.message || 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  // Instant 1-click Demo Admin Login
  const handleQuickAdminDemo = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.quickDemoLogin('usr_adm_0001');
      if (res.success && res.user) {
        if (res.user.role !== 'admin') {
          setErrorMsg('Access denied: Selected account is not an administrator.');
          return;
        }
        onAdminLoginSuccess(res.user);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMsg(e.message || 'Demo admin sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 selection:bg-rose-500 selection:text-white">
      <div className="max-w-md w-full mx-auto space-y-6">
        {/* Security Crest */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-950 border border-rose-500/30 text-rose-400 shadow-xl shadow-rose-950/50 mb-1">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Institutional Administration</h1>
          <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider font-mono">
            Sentinel Campus • Dean &amp; Security Controller Portal
          </p>
          <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
            Restricted access. All administrative access attempts are cryptographically audited on the institutional ledger.
          </p>
        </div>

        {/* Auth Form Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-7 space-y-5">
          {step === 'credentials' ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-sm font-bold text-white">Administrator Credentials</h2>
                <p className="text-xs text-slate-400">
                  Enter your assigned Dean / Security Controller institutional key.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Administrator Institutional ID
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={institutionalKey}
                    onChange={(e) => setInstitutionalKey(e.target.value.toUpperCase())}
                    placeholder="SC-ADM-2026-0001"
                    className="w-full pl-9 pr-3 py-2 text-xs font-mono uppercase bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Registered Official Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={credential}
                    onChange={(e) => setCredential(e.target.value)}
                    placeholder="dean.acad@skit.ac.in"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs tracking-wide transition flex items-center justify-center space-x-2 shadow-lg shadow-rose-600/25 cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying Authority...</span>
                  </>
                ) : (
                  <>
                    <span>Proceed to Security Authorization</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
                  <Lock className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-white">Administrator Passcode Verification</h3>
                <p className="text-xs text-slate-400">
                  Enter one-time passcode delivered to security terminal {phoneMasked}
                </p>
              </div>

              {simulatedOtp && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs text-center space-y-1">
                  <span className="font-bold block uppercase tracking-wider text-[10px]">DEMO Authentication Mode:</span>
                  <span>Delivered OTP: <strong className="font-mono text-sm text-white">{simulatedOtp}</strong></span>
                </div>
              )}

              <div>
                <label className="block text-center text-xs font-semibold text-slate-300 mb-2">
                  Enter 6-Digit Passcode
                </label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full py-2.5 text-center font-mono text-xl tracking-[0.5em] bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs tracking-wide transition flex items-center justify-center space-x-2 shadow-lg shadow-rose-600/25 cursor-pointer"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Authorize Admin Session</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStep('credentials')}
                className="w-full text-center text-xs text-slate-400 hover:text-slate-200 underline"
              >
                Back to credentials
              </button>
            </form>
          )}

          {/* Quick Demo Access (Local Hackathon Only) */}
          <div className="pt-4 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                Evaluation Access (DEMO)
              </span>
              <span className="font-mono text-[10px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                Local Dev Only
              </span>
            </div>

            <button
              type="button"
              onClick={handleQuickAdminDemo}
              disabled={loading}
              className="w-full p-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-200 text-left transition flex items-center justify-between cursor-pointer"
            >
              <div>
                <span className="font-bold text-xs block text-white">Dean Academics • Prof. Ramesh K. Agarwal</span>
                <span className="text-[10px] font-mono text-slate-400">SC-ADM-2026-0001 (1-Click Evaluation Sign In)</span>
              </div>
              <ArrowRight className="w-4 h-4 text-rose-400 shrink-0" />
            </button>
          </div>
        </div>

        {/* Back to Public Campus Portal */}
        <div className="text-center">
          <a
            href="/"
            className="text-xs text-slate-400 hover:text-slate-200 underline"
          >
            ← Return to Sentinel Campus User Portal
          </a>
        </div>
      </div>
    </div>
  );
};
