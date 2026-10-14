import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Wifi,
  Sparkles,
  RefreshCw,
  HelpCircle,
  Send,
  UserCheck,
  ArrowRight,
  LogOut,
  XCircle,
} from 'lucide-react';
import { UserProfile, AttendanceEvent } from '../types';
import { faceService, LivenessChallenge } from '../services/faceVerification';
import { api } from '../services/api';

interface MandatoryAttendanceScreenProps {
  user: UserProfile;
  onUnlocked: () => void;
  onLogout: () => void;
  onOpenEnrollmentModal: () => void;
}

type VerificationState =
  | 'initializing'
  | 'camera_permission_required'
  | 'detecting_face'
  | 'liveness_challenge'
  | 'submitting'
  | 'face_mismatch'
  | 'network_not_verified'
  | 'enrollment_required'
  | 'attendance_recorded'
  | 'verification_failed'
  | 'manual_review';

export const MandatoryAttendanceScreen: React.FC<MandatoryAttendanceScreenProps> = ({
  user,
  onUnlocked,
  onLogout,
  onOpenEnrollmentModal,
}) => {
  const [state, setState] = useState<VerificationState>('initializing');
  const [networkInfo, setNetworkInfo] = useState<{
    verified: boolean;
    mode: string;
    isDemo: boolean;
    message: string;
    error?: string;
  } | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeChallenge, setActiveChallenge] = useState<LivenessChallenge | null>(null);
  const [livenessPassed, setLivenessPassed] = useState<boolean>(false);
  const [attendanceRecord, setAttendanceRecord] = useState<AttendanceEvent | null>(null);
  const [manualReason, setManualReason] = useState('');
  const [manualReviewSubmitted, setManualReviewSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionLoopRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);

  // 1. Initial Gate Check & Network Status
  useEffect(() => {
    let active = true;

    const checkInitialGate = async () => {
      try {
        const [gateRes, netRes] = await Promise.all([
          api.getGateStatus().catch(() => null),
          api.getNetworkStatus().catch(() => null),
        ]);

        if (!active) return;

        if (netRes && netRes.clientValidation) {
          setNetworkInfo(netRes.clientValidation);
        }

        if (gateRes && gateRes.success) {
          if (gateRes.gateUnlocked && gateRes.todayRecord) {
            setAttendanceRecord(gateRes.todayRecord);
            setState('attendance_recorded');
            return;
          }

          if (!gateRes.isEnrolled) {
            setState('enrollment_required');
            setErrorMessage(gateRes.enrollmentNote || 'Biometric reference profile not enrolled. Live camera enrollment required.');
            return;
          }
        }

        // Proceed to camera
        setState('detecting_face');
        setActiveChallenge(faceService.getRandomChallenge());
      } catch (err: unknown) {
        const e = err as Error;
        setErrorMessage(e.message || 'Failed to inspect attendance gate status.');
        setState('verification_failed');
      }
    };

    checkInitialGate();

    return () => {
      active = false;
    };
  }, []);

  // 2. Start Camera Feed
  const startCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setState('camera_permission_required');
        setErrorMessage('Camera access is not supported by your browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(console.warn);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setState('camera_permission_required');
      setErrorMessage(e.message || 'Camera permission denied. Please allow camera access in browser settings.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (detectionLoopRef.current) {
      cancelAnimationFrame(detectionLoopRef.current);
      detectionLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (state === 'detecting_face' || state === 'liveness_challenge') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [state, startCamera, stopCamera]);

  // 3. Real-time Face Detection & Biometric Submission Loop
  useEffect(() => {
    if (state !== 'detecting_face' && state !== 'liveness_challenge') return;

    let active = true;

    const runDetection = async () => {
      if (!active || isProcessingRef.current || !videoRef.current) {
        detectionLoopRef.current = requestAnimationFrame(runDetection);
        return;
      }

      if (videoRef.current.readyState >= 2) {
        try {
          const res = await faceService.detectFace(videoRef.current, activeChallenge || undefined);

          if (res.detected && res.descriptor) {
            // Check basic guided liveness
            if (activeChallenge && !livenessPassed) {
              if (res.livenessPassed) {
                setLivenessPassed(true);
              }
            }

            // Once liveness confirmed or ready, trigger server verification
            if (!activeChallenge || livenessPassed || res.livenessPassed) {
              isProcessingRef.current = true;
              setState('submitting');

              const submitRes = await api.verifyPersonalAttendance({
                faceDescriptor: res.descriptor,
                livenessPassed: true,
              });

              if (submitRes.success) {
                setAttendanceRecord(submitRes.record);
                setState('attendance_recorded');
              } else {
                setState('verification_failed');
                setErrorMessage(submitRes.message || 'Attendance verification failed.');
              }
              return;
            }
          }
        } catch (err: unknown) {
          const e = err as any;
          if (e.message && e.message.includes('Facial identity verification failed')) {
            setState('face_mismatch');
            setErrorMessage(e.message);
          } else if (e.message && e.message.includes('Network verification failed')) {
            setState('network_not_verified');
            setErrorMessage(e.message);
          } else if (e.message && e.message.includes('ENROLLMENT_REQUIRED')) {
            setState('enrollment_required');
            setErrorMessage(e.message);
          } else {
            console.warn('[AttendanceGate] Inference/verification note:', err);
          }
        }
      }

      detectionLoopRef.current = requestAnimationFrame(runDetection);
    };

    detectionLoopRef.current = requestAnimationFrame(runDetection);

    return () => {
      active = false;
      if (detectionLoopRef.current) {
        cancelAnimationFrame(detectionLoopRef.current);
      }
    };
  }, [state, activeChallenge, livenessPassed]);

  // 4. Submit Manual Review Request
  const handleSubmitManualReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualReason.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await api.submitManualReview(manualReason.trim());
      if (res.success) {
        setManualReviewSubmitted(true);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to submit manual review.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-between p-4 sm:p-6 selection:bg-[#800020] selection:text-white">
      {/* Top Header */}
      <div className="max-w-md mx-auto w-full flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-[#800020] flex items-center justify-center text-white shadow-lg shadow-maroon-900/40">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-100">Sentinel Campus</h1>
            <p className="text-xs text-slate-400">Mandatory Presence Gate</p>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs flex items-center gap-1.5 transition-colors"
          title="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Exit</span>
        </button>
      </div>

      {/* Main Content Card */}
      <div className="max-w-md mx-auto w-full my-auto py-4">
        {/* User Card */}
        <div className="bg-slate-800/80 backdrop-blur rounded-2xl p-4 border border-slate-700/80 mb-4 flex items-center justify-between shadow-xl">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-700 border-2 border-slate-600 flex items-center justify-center">
              {user.referenceImage ? (
                <img src={user.referenceImage} alt={user.fullName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-base font-bold text-slate-300">{user.fullName.charAt(0)}</span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">{user.fullName}</h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-maroon-950/80 text-rose-300 border border-rose-800/50">
                  {user.role}
                </span>
              </div>
              <p className="text-xs text-slate-400">{user.identifierCode}</p>
            </div>
          </div>

          {/* Network Trust Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-700/60 text-slate-300 border border-slate-600/50">
            <Wifi className={`w-3.5 h-3.5 ${networkInfo?.verified ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span>{networkInfo?.isDemo ? 'Demo Wi-Fi' : networkInfo?.verified ? 'Campus Subnet' : 'Checking'}</span>
          </div>
        </div>

        {/* State 1: Attendance Already Recorded / Verification Successful */}
        {state === 'attendance_recorded' && (
          <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-emerald-200">Campus Presence Verified</h3>
              <p className="text-xs text-slate-300 mt-1">
                Your personal attendance for today ({attendanceRecord?.eventDate || 'today'}) has been confirmed.
              </p>
              <div className="mt-3 p-3 bg-slate-900/60 rounded-xl text-left text-[11px] space-y-1 text-slate-400 border border-slate-800">
                <p><strong className="text-slate-300">Transaction ID:</strong> {attendanceRecord?.id}</p>
                <p><strong className="text-slate-300">Recorded At:</strong> {attendanceRecord?.capturedAt}</p>
                <p><strong className="text-slate-300">Biometric Match:</strong> Distance {attendanceRecord?.faceDistance ?? '0.12'} &lt; 0.55</p>
                <p><strong className="text-slate-300">Network:</strong> {networkInfo?.message || 'Approved Campus Wi-Fi'}</p>
              </div>
            </div>

            <button
              onClick={onUnlocked}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 transition-all"
            >
              <span>Access {user.role.toUpperCase()} Portal</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* State 2: Enrollment Required (e.g. Amar AI reference needing genuine capture) */}
        {state === 'enrollment_required' && (
          <div className="bg-amber-950/40 border border-amber-500/40 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-9 h-9" />
            </div>
            <div>
              <h3 className="text-base font-bold text-amber-200">Live Biometric Enrollment Required</h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                {errorMessage || 'Your reference image appears AI-generated or is pending initial biometric capture. To mark attendance, please perform a genuine live enrollment.'}
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={onOpenEnrollmentModal}
                className="w-full py-3 px-4 rounded-xl bg-[#800020] hover:bg-[#990026] text-white font-semibold text-xs shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                <span>Begin Genuine Live Enrollment</span>
              </button>

              <button
                onClick={() => setState('manual_review')}
                className="text-xs text-slate-400 hover:text-slate-200 py-2"
              >
                Need help? Request Administrative Review
              </button>
            </div>
          </div>
        )}

        {/* State 3: Live Camera Viewport & Liveness Check */}
        {(state === 'detecting_face' || state === 'liveness_challenge' || state === 'submitting') && (
          <div className="bg-slate-800/90 rounded-2xl p-4 border border-slate-700 shadow-2xl space-y-3">
            {/* Viewport Frame */}
            <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-black flex items-center justify-center border border-slate-700 shadow-inner">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />

              {/* Oval Face Guide Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
                  className={`w-48 h-64 rounded-[50%] border-2 transition-colors duration-300 ${
                    state === 'submitting'
                      ? 'border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.5)]'
                      : livenessPassed
                      ? 'border-emerald-400'
                      : 'border-rose-400/80 animate-pulse'
                  }`}
                />
              </div>

              {/* Status Badge */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-[11px] font-medium">
                <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur text-white flex items-center gap-1.5 border border-white/10">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  Live Camera Feed
                </span>

                {networkInfo && (
                  <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur text-slate-300 border border-white/10">
                    {networkInfo.isDemo ? 'Prototype Mode' : 'Campus Wi-Fi'}
                  </span>
                )}
              </div>

              {/* Guided Challenge Indicator */}
              {activeChallenge && (
                <div className="absolute bottom-3 left-3 right-3 p-2.5 rounded-xl bg-black/75 backdrop-blur border border-white/10 text-center">
                  <p className="text-xs font-semibold text-rose-200">
                    {livenessPassed ? '✅ Challenge Passed — Verifying Identity...' : activeChallenge.instruction}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {activeChallenge.hint} (Basic guided liveness check)
                  </p>
                </div>
              )}
            </div>

            {/* Helper Instructions */}
            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-slate-400">
                Center your face and maintain good lighting.
              </p>
              <button
                onClick={() => setState('manual_review')}
                className="text-[11px] text-rose-300 hover:text-rose-200 underline"
              >
                Camera issues?
              </button>
            </div>
          </div>
        )}

        {/* State 4: Face Mismatch */}
        {state === 'face_mismatch' && (
          <div className="bg-rose-950/40 border border-rose-500/40 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <XCircle className="w-9 h-9" />
            </div>
            <div>
              <h3 className="text-base font-bold text-rose-200">Facial Identity Mismatch</h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                The face detected in camera does not match the enrolled profile for <strong>{user.fullName}</strong>.
              </p>
              {errorMessage && (
                <p className="text-[11px] text-rose-400 mt-2 font-mono bg-rose-950/60 p-2 rounded-lg border border-rose-800/40">
                  {errorMessage}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  isProcessingRef.current = false;
                  setLivenessPassed(false);
                  setActiveChallenge(faceService.getRandomChallenge());
                  setState('detecting_face');
                }}
                className="w-full py-3 px-4 rounded-xl bg-[#800020] hover:bg-[#990026] text-white font-semibold text-xs shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry Face Verification</span>
              </button>

              <button
                onClick={() => setState('manual_review')}
                className="text-xs text-slate-400 hover:text-slate-200 py-2"
              >
                Repeated mismatch? Submit Manual Review
              </button>
            </div>
          </div>
        )}

        {/* State 5: Network Not Verified */}
        {state === 'network_not_verified' && (
          <div className="bg-amber-950/40 border border-amber-500/40 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <Wifi className="w-9 h-9" />
            </div>
            <div>
              <h3 className="text-base font-bold text-amber-200">Campus Wi-Fi Required</h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                {errorMessage || 'Attendance must be marked from an approved campus network subnet. Connection refused.'}
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  isProcessingRef.current = false;
                  setState('detecting_face');
                }}
                className="w-full py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shadow-lg transition-all"
              >
                Retry Network Handshake
              </button>

              <button
                onClick={() => setState('manual_review')}
                className="text-xs text-slate-400 hover:text-slate-200 py-2"
              >
                Connect to Campus Hotspot or Request Review
              </button>
            </div>
          </div>
        )}

        {/* State 6: Camera Permission Required */}
        {state === 'camera_permission_required' && (
          <div className="bg-slate-800 rounded-2xl p-6 text-center space-y-4 border border-slate-700 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center mx-auto">
              <Camera className="w-9 h-9" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Camera Access Required</h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                Sentinel Campus uses live front-facing camera verification to confirm physical presence. Photo uploads from gallery are strictly disallowed.
              </p>
            </div>

            <button
              onClick={startCamera}
              className="w-full py-3 px-4 rounded-xl bg-[#800020] hover:bg-[#990026] text-white font-semibold text-xs shadow-lg transition-all"
            >
              Grant Camera Permission
            </button>
          </div>
        )}

        {/* State 7: Manual Review Form */}
        {state === 'manual_review' && (
          <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 shadow-2xl space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-700 pb-3">
              <HelpCircle className="w-5 h-5 text-rose-400" />
              <h3 className="text-sm font-bold text-white">Administrative Review Request</h3>
            </div>

            {manualReviewSubmitted ? (
              <div className="text-center py-6 space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <h4 className="text-sm font-semibold text-emerald-200">Review Request Logged</h4>
                <p className="text-xs text-slate-300">
                  Your review ticket has been sent to Campus Administration. An invigilator or administrator will inspect and approve your presence record.
                </p>
                <button
                  onClick={onLogout}
                  className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs text-white"
                >
                  Exit to Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitManualReview} className="space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  If you are experiencing camera hardware issues, lighting failure, or persistent mismatch, explain your situation below.
                </p>

                <textarea
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  placeholder="Describe your issue (e.g. Front camera scratched, biometric mismatch under laboratory lighting)..."
                  rows={3}
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                  required
                />

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setState('detecting_face')}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting || manualReason.trim().length < 5}
                    className="py-2.5 px-4 rounded-xl bg-[#800020] hover:bg-[#990026] text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? 'Submitting...' : 'Submit to Admin'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Bottom Footer Guidance */}
      <div className="max-w-md mx-auto w-full text-center text-[10px] text-slate-500 pt-4 border-t border-slate-800">
        Sentinel Campus &bull; Biometric Presence Verification Gate &bull; SKIT Jaipur
      </div>
    </div>
  );
};
