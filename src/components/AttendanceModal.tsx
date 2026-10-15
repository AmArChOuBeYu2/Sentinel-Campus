import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  X,
  Compass,
  Clock,
  Sparkles,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import { UserProfile, CampusConfig, AttendanceEvent } from '../types';
import { geofenceService } from '../services/geofence';
import { faceService, LivenessChallenge, FaceDetectionResult } from '../services/faceVerification';
import { offlineSyncService } from '../services/offlineSync';
import { api } from '../services/api';

export type FaceVerificationState =
  | 'camera_unavailable'
  | 'loading_model'
  | 'searching_face'
  | 'face_detected'
  | 'identity_verification'
  | 'liveness_verification'
  | 'eligible';

interface AttendanceModalProps {
  user: UserProfile;
  campus: CampusConfig;
  sessionType?: 'daily_personal' | 'daily_staff' | 'class_session';
  sessionId?: string;
  checkpointType?: 'entry' | 'checkpoint_1' | 'checkpoint_2';
  title?: string;
  onClose: () => void;
  onSuccess: (record?: AttendanceEvent) => void;
  onOpenEnrollment?: () => void;
}

type Step = 'camera_check' | 'processing' | 'result';

export const AttendanceModal: React.FC<AttendanceModalProps> = ({
  user,
  campus,
  sessionType = user.role === 'teacher' ? 'daily_personal' : user.role === 'staff' ? 'daily_staff' : 'class_session',
  sessionId,
  checkpointType = 'entry',
  title = 'Mark Campus Attendance',
  onClose,
  onSuccess,
  onOpenEnrollment,
}) => {
  const [step, setStep] = useState<Step>('camera_check');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Live Device Location (Geofence) state
  const [geoChecking, setGeoChecking] = useState(true);
  const [geoResult, setGeoResult] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    distanceMeters: number;
    isInside: boolean;
    isAccuracyAcceptable: boolean;
    error?: string;
  } | null>(null);

  // 7-State Machine for Facial Verification
  const [faceState, setFaceState] = useState<FaceVerificationState>('loading_model');
  const [faceStatusText, setFaceStatusText] = useState<string>('Initializing face verification models...');
  const [challenge, setChallenge] = useState<LivenessChallenge | null>(null);

  // Presence Key for class sessions
  const [presenceKey, setPresenceKey] = useState<string>(
    checkpointType === 'checkpoint_1' ? 'SC-7829' : 'SC-4190'
  );

  // Result state
  const [isSuccess, setIsSuccess] = useState(false);
  const [isQueuedOffline, setIsQueuedOffline] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmedRecord, setConfirmedRecord] = useState<AttendanceEvent | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastDescriptorRef = useRef<number[] | null>(null);
  const isDetectingRef = useRef(false);
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Live Device Location Query
  const checkPresence = useCallback(async () => {
    setGeoChecking(true);
    try {
      const res = await geofenceService.getCurrentLocation(campus);
      setGeoResult(res);
    } catch {
      setGeoResult({
        latitude: 0,
        longitude: 0,
        accuracy: 9999,
        distanceMeters: 9999,
        isInside: false,
        isAccuracyAcceptable: false,
        error: 'Unable to query live device location sensor.',
      });
    } finally {
      setGeoChecking(false);
    }
  }, [campus]);

  // 2. Start Camera Stream
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera MediaDevices API is not available in this browser environment.');
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      setStream(mediaStream);
      streamRef.current = mediaStream;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(console.warn);
      }

      // Check if models are loaded
      if (faceService.isLoaded()) {
        setFaceState('searching_face');
        setFaceStatusText('Searching for face... Center face inside oval guide');
      } else {
        setFaceState('loading_model');
        setFaceStatusText('Loading face verification model weights...');
        faceService.loadModels().then(() => {
          setFaceState('searching_face');
          setFaceStatusText('Searching for face... Center face inside oval guide');
        });
      }
    } catch (err: unknown) {
      console.error('[Camera] Access error:', err);
      const e = err as Error;
      let msg = 'Failed to initialize live camera feed.';
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        msg = 'Camera permission denied. Please grant camera access in your browser to verify attendance.';
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        msg = 'No camera hardware detected on this device.';
      } else if (e.message) {
        msg = e.message;
      }
      setCameraError(msg);
      setFaceState('camera_unavailable');
      setFaceStatusText('Camera feed unavailable');
    }
  }, []);

  // Stop camera helper
  const stopCamera = useCallback(() => {
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
    isDetectingRef.current = false;
  }, []);

  // Initialize on mount
  useEffect(() => {
    const c = faceService.getRandomChallenge();
    setChallenge(c);
    checkPresence();
    startCamera();

    return () => {
      stopCamera();
    };
  }, [checkPresence, startCamera, stopCamera]);

  // 3. Real-time Face & Liveness State Machine Loop
  useEffect(() => {
    if (!stream || !videoRef.current) return;

    let active = true;

    const detectLoop = async () => {
      if (!active || !videoRef.current) return;

      const video = videoRef.current;
      if (
        !isDetectingRef.current &&
        video.readyState >= 3 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        !video.paused
      ) {
        isDetectingRef.current = true;
        try {
          const res: FaceDetectionResult = await faceService.detectFace(
            video,
            challenge || undefined
          );

          if (!active) return;

          if (!res.detected) {
            // STATE: searching_face (Face lost or not centered)
            setFaceState('searching_face');
            setFaceStatusText(res.message || 'Searching for face... Center face inside oval guide');
          } else {
            // Face IS detected!
            if (res.descriptor) {
              lastDescriptorRef.current = res.descriptor;
            }

            // Check Identity & Biometric Enrollment first
            if (!user.isEnrolled) {
              setFaceState('identity_verification');
              setFaceStatusText('Face detected, but biometric profile not enrolled. Complete enrollment first.');
            } else if (res.livenessPassed) {
              setFaceState('eligible');
              setFaceStatusText('Liveness & identity verified! Eligible for attendance submission.');
            } else {
              setFaceState('liveness_verification');
              setFaceStatusText(challenge?.instruction || 'Face detected. Please hold steady...');
            }
          }
        } catch (err) {
          console.debug('[Face] Real-time inference tick:', err);
        } finally {
          isDetectingRef.current = false;
        }
      }

      if (active) {
        loopTimerRef.current = setTimeout(detectLoop, 180);
      }
    };

    loopTimerRef.current = setTimeout(detectLoop, 300);

    return () => {
      active = false;
      if (loopTimerRef.current) {
        clearTimeout(loopTimerRef.current);
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [stream, challenge, user.isEnrolled]);

  // 4. Capture & Verify Submission
  const handleSubmitAttendance = async () => {
    if (!user.isEnrolled) {
      setErrorMessage('User biometric profile is not enrolled. Please complete facial enrollment before marking attendance.');
      setStep('result');
      return;
    }

    if (faceState !== 'eligible') {
      setErrorMessage('Facial verification and active liveness check must be completed before submission.');
      setStep('result');
      return;
    }

    if (!geoResult || !geoResult.isInside || !geoResult.isAccuracyAcceptable) {
      setErrorMessage(
        geoResult?.error ||
          `Presence verification failed: You are ${geoResult?.distanceMeters}m from campus center (Allowed radius: ${campus.radiusMeters}m).`
      );
      setStep('result');
      return;
    }

    let descriptor = lastDescriptorRef.current;
    if (!descriptor || descriptor.length !== 128) {
      if (videoRef.current) {
        const directRes = await faceService.detectFace(videoRef.current);
        if (directRes.descriptor) {
          descriptor = directRes.descriptor;
        }
      }
    }

    if (!descriptor || descriptor.length !== 128) {
      setErrorMessage('Failed to capture high-quality face embedding. Please ensure good lighting and try again.');
      setStep('result');
      return;
    }

    setStep('processing');
    const isOnline = offlineSyncService.isOnline();
    const capturedAt = new Date().toISOString();
    const idempotencyKey = `att_${user.id}_${Date.now()}`;

    // --- Offline Branch ---
    if (!isOnline) {
      try {
        await offlineSyncService.queueSubmission({
          idempotencyKey,
          userId: user.id,
          userName: user.fullName,
          userRole: user.role,
          identifierCode: user.identifierCode,
          sessionType,
          sessionId,
          checkpointType,
          latitude: geoResult.latitude,
          longitude: geoResult.longitude,
          locationAccuracy: geoResult.accuracy,
          faceDescriptor: descriptor,
          capturedAt,
          presenceKey: sessionType === 'class_session' ? presenceKey : undefined,
        });

        setIsQueuedOffline(true);
        setIsSuccess(true);
        stopCamera();
        setStep('result');
        return;
      } catch (err: unknown) {
        const e = err as Error;
        setErrorMessage('Failed to queue offline attendance submission: ' + (e.message || String(e)));
        setIsSuccess(false);
        stopCamera();
        setStep('result');
        return;
      }
    }

    // --- Online Branch ---
    try {
      const res = await api.submitAttendance({
        idempotencyKey,
        sessionType,
        sessionId,
        checkpointType,
        latitude: geoResult.latitude,
        longitude: geoResult.longitude,
        locationAccuracy: geoResult.accuracy,
        faceDescriptor: descriptor,
        capturedAt,
        presenceKey: sessionType === 'class_session' ? presenceKey : undefined,
      });

      if (res.success && res.record) {
        setIsSuccess(true);
        setConfirmedRecord(res.record);
        stopCamera();
        setStep('result');
      } else {
        setIsSuccess(false);
        setErrorMessage(res.error || 'Server rejected attendance verification.');
        stopCamera();
        setStep('result');
      }
    } catch (err: unknown) {
      const e = err as Error;
      const isNetworkError =
        !navigator.onLine ||
        e.message?.includes('Failed to fetch') ||
        e.message?.includes('NetworkError') ||
        e.message?.includes('network') ||
        e.message?.includes('ECONNREFUSED');

      if (isNetworkError) {
        // Automatic fallback: Queue to offline store on network drop
        try {
          await offlineSyncService.queueSubmission({
            idempotencyKey,
            userId: user.id,
            userName: user.fullName,
            userRole: user.role,
            identifierCode: user.identifierCode,
            sessionType,
            sessionId,
            checkpointType,
            latitude: geoResult.latitude,
            longitude: geoResult.longitude,
            locationAccuracy: geoResult.accuracy,
            faceDescriptor: descriptor,
            capturedAt,
            presenceKey: sessionType === 'class_session' ? presenceKey : undefined,
          });

          setIsQueuedOffline(true);
          setIsSuccess(true);
          stopCamera();
          setStep('result');
          return;
        } catch {
          // If queuing fails, fall through to error message
        }
      }

      setIsSuccess(false);
      setErrorMessage(e.message || 'Server attendance verification failed.');
      stopCamera();
      setStep('result');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#0b132b] border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[#1c2541]/50">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
              <p className="text-xs text-slate-400">
                {user.fullName} • <span className="capitalize">{user.role}</span> ({checkpointType})
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4">
          {/* STEP 1: Live Verification */}
          {step === 'camera_check' && (
            <>
              {/* Live Device Location Banner (Priority 5) */}
              <div
                className={`p-3 rounded-xl border flex items-start space-x-3 text-xs ${
                  geoChecking
                    ? 'bg-slate-800/50 border-slate-700 text-slate-300'
                    : geoResult?.isInside && geoResult?.isAccuracyAcceptable
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-cyan-400" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {geoChecking
                        ? 'Querying Live Device Location...'
                        : geoResult?.isInside && geoResult?.isAccuracyAcceptable
                        ? 'Live Device Location: Confirmed Inside Campus'
                        : 'Live Device Location: Verification Alert'}
                    </span>
                    <button
                      onClick={checkPresence}
                      disabled={geoChecking}
                      className="text-cyan-400 hover:underline flex items-center gap-1 font-mono text-[10px] cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${geoChecking ? 'animate-spin' : ''}`} /> Refresh Location
                    </button>
                  </div>
                  {geoResult && (
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-300">
                      <span>Distance: <strong>{geoResult.distanceMeters}m</strong> (Allowed: &lt;{campus.radiusMeters}m)</span>
                      <span>Accuracy: <strong>±{geoResult.accuracy}m</strong> (Max: ±{campus.maxAccuracyMeters}m)</span>
                    </div>
                  )}
                  {geoResult?.error && <p className="mt-1 text-rose-300 font-medium">{geoResult.error}</p>}
                </div>
              </div>

              {/* Unenrolled Warning Banner (Priority 4) */}
              {!user.isEnrolled && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center space-x-2 text-amber-400 font-bold">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Biometric Face Profile Required</span>
                  </div>
                  <p className="text-slate-300">
                    You have not enrolled your biometric facial template. You must complete enrollment before attendance can be recorded.
                  </p>
                  {onOpenEnrollment && (
                    <button
                      onClick={() => {
                        stopCamera();
                        onClose();
                        onOpenEnrollment();
                      }}
                      className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center justify-center space-x-1.5 shadow-md shadow-amber-500/20"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Enroll My Face Now</span>
                    </button>
                  )}
                </div>
              )}

              {/* Live Camera Viewfinder with 7-State Machine */}
              <div className="relative aspect-4/3 w-full bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                {cameraError ? (
                  <div className="p-6 text-center space-y-3">
                    <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
                    <p className="text-xs text-rose-300 max-w-xs">{cameraError}</p>
                    <button
                      onClick={startCamera}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 text-xs font-semibold hover:bg-cyan-400 transition"
                    >
                      Retry Camera
                    </button>
                  </div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover mirror transform -scale-x-100"
                    />

                    {/* Face Oval Guide with Dynamic States */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div
                        className={`w-48 h-64 border-2 border-dashed rounded-[50%] transition-all duration-300 flex items-center justify-center ${
                          faceState === 'eligible'
                            ? 'border-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.4)]'
                            : faceState === 'identity_verification'
                            ? 'border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.3)]'
                            : faceState === 'liveness_verification'
                            ? 'border-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.3)]'
                            : faceState === 'face_detected'
                            ? 'border-cyan-400'
                            : 'border-slate-500'
                        }`}
                      >
                        <div
                          className={`w-2.5 h-2.5 rounded-full transition-colors ${
                            faceState === 'eligible'
                              ? 'bg-emerald-400 animate-ping'
                              : faceState === 'identity_verification'
                              ? 'bg-rose-400'
                              : 'bg-cyan-400/50'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Floating Status Badge (STRICT: Never show PASS when searching or unenrolled!) */}
                    <div className="absolute bottom-3 inset-x-3 flex items-center justify-between px-3 py-2 rounded-lg bg-slate-950/85 backdrop-blur border border-slate-700 text-xs">
                      <div className="flex items-center space-x-2 truncate mr-2">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="text-slate-200 font-medium truncate">{faceStatusText}</span>
                      </div>

                      {/* Explicit Badge for State */}
                      <div className="shrink-0">
                        {faceState === 'eligible' && (
                          <span className="flex items-center space-x-1 text-emerald-400 font-bold text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>PASS</span>
                          </span>
                        )}
                        {faceState === 'searching_face' && (
                          <span className="text-[10px] uppercase font-bold text-slate-400 animate-pulse bg-slate-800 px-2 py-0.5 rounded">
                            Searching
                          </span>
                        )}
                        {faceState === 'loading_model' && (
                          <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                            Loading Model
                          </span>
                        )}
                        {faceState === 'identity_verification' && (
                          <span className="text-[10px] uppercase font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">
                            Unenrolled
                          </span>
                        )}
                        {faceState === 'liveness_verification' && (
                          <span className="text-[10px] uppercase font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded animate-pulse">
                            Action Required
                          </span>
                        )}
                        {faceState === 'face_detected' && (
                          <span className="text-[10px] uppercase font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">
                            Detected
                          </span>
                        )}
                        {faceState === 'camera_unavailable' && (
                          <span className="text-[10px] uppercase font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">
                            No Feed
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Liveness Challenge Card (Active when face is detected and enrolled) */}
              {user.isEnrolled && challenge && faceState !== 'eligible' && (
                <div className="p-3 bg-[#1c2541]/40 border border-cyan-500/20 rounded-xl space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-cyan-400 font-bold uppercase text-[10px] tracking-wider">
                      Active Liveness Challenge
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Live Sensing</span>
                  </div>
                  <p className="text-white font-semibold text-sm">{challenge.instruction}</p>
                  <p className="text-[11px] text-slate-400">{challenge.hint}</p>
                </div>
              )}



              {/* Security Protocol Banner */}
              <div className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                <span>Security Protocol: Direct camera live capture only. Gallery uploads restricted.</span>
              </div>

              {/* Submit CTA: Enabled ONLY if faceState is eligible AND GPS is inside & accurate */}
              <button
                onClick={handleSubmitAttendance}
                disabled={Boolean(
                  !user.isEnrolled ||
                  faceState !== 'eligible' ||
                  geoChecking ||
                  !geoResult?.isInside ||
                  !geoResult?.isAccuracyAcceptable
                )}
                className={`w-full py-3 rounded-xl font-bold text-sm tracking-wide transition flex items-center justify-center space-x-2 ${
                  user.isEnrolled &&
                  faceState === 'eligible' &&
                  geoResult?.isInside &&
                  geoResult?.isAccuracyAcceptable
                    ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:from-cyan-400 hover:to-emerald-400 shadow-lg shadow-cyan-500/20 cursor-pointer'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>
                  {!user.isEnrolled
                    ? 'Biometric Enrollment Required'
                    : faceState !== 'eligible'
                    ? 'Complete Face & Liveness Check'
                    : !geoResult?.isInside || !geoResult?.isAccuracyAcceptable
                    ? 'Awaiting Valid Campus Location'
                    : 'Verify & Record Attendance'}
                </span>
              </button>
            </>
          )}

          {/* STEP 2: Processing Spinner */}
          {step === 'processing' && (
            <div className="py-12 flex flex-col items-center justify-center space-y-4 text-center">
              <RefreshCw className="w-10 h-10 text-cyan-400 animate-spin" />
              <h4 className="text-base font-bold text-white">Validating Presence &amp; Biometrics...</h4>
              <p className="text-xs text-slate-400 max-w-xs">
                Executing server-side geofence calculation, facial embedding Euclidean distance verification, and duplicate checks.
              </p>
            </div>
          )}

          {/* STEP 3: Verification Result */}
          {step === 'result' && (
            <div className="py-6 space-y-5 text-center">
              {isSuccess ? (
                <>
                  <div className={`w-16 h-16 rounded-full ${isQueuedOffline ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-amber-500/10' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-emerald-500/10'} border flex items-center justify-center mx-auto shadow-xl`}>
                    {isQueuedOffline ? <AlertTriangle className="w-10 h-10" /> : <CheckCircle2 className="w-10 h-10" />}
                  </div>

                  <div>
                    <h4 className={`text-lg font-bold ${isQueuedOffline ? 'text-amber-300' : 'text-white'} tracking-tight`}>
                      {isQueuedOffline ? 'Attendance Queued (Offline - Pending Verification)' : 'Attendance Confirmed!'}
                    </h4>
                    <p className="text-xs text-slate-300 mt-1 max-w-sm mx-auto">
                      {isQueuedOffline
                        ? 'Your live biometric capture and GPS coordinates have been saved to the local offline queue with pending status. Attendance is not confirmed until verified by the campus server upon connectivity restoration.'
                        : `Successfully verified and recorded on the campus master ledger for ${user.fullName}.`}
                    </p>
                  </div>

                  {confirmedRecord && !isQueuedOffline && (
                    <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-left text-xs space-y-1.5 max-w-sm mx-auto">
                      <div className="flex justify-between text-slate-400">
                        <span>Event ID:</span>
                        <span className="font-mono text-cyan-400">{confirmedRecord.id}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Verified At:</span>
                        <span className="text-white font-mono">{new Date(confirmedRecord.capturedAt).toLocaleTimeString()}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Campus Distance:</span>
                        <span className="text-emerald-400 font-semibold">{confirmedRecord.distanceMeters}m</span>
                      </div>
                      {confirmedRecord.faceDistance !== undefined && (
                        <div className="flex justify-between text-slate-400">
                          <span>Biometric Distance:</span>
                          <span className="text-cyan-400 font-mono">{confirmedRecord.faceDistance.toFixed(3)} (&lt; 0.550)</span>
                        </div>
                      )}
                      {confirmedRecord.auditHash && (
                        <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800">
                          <span>Audit Hash:</span>
                          <span className="font-mono text-[10px] text-slate-500">{confirmedRecord.auditHash}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => {
                      if (!isQueuedOffline && confirmedRecord) {
                        onSuccess(confirmedRecord);
                      }
                      onClose();
                    }}
                    className={`w-full py-2.5 rounded-xl ${isQueuedOffline ? 'bg-amber-500 hover:bg-amber-400' : 'bg-emerald-500 hover:bg-emerald-400'} text-slate-950 font-bold text-xs transition cursor-pointer`}
                  >
                    {isQueuedOffline ? 'Acknowledge (Pending Sync)' : 'Done'}
                  </button>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-xl shadow-rose-500/10">
                    <XCircle className="w-10 h-10" />
                  </div>

                  <div>
                    <h4 className="text-lg font-bold text-white tracking-tight">Attendance Rejected</h4>
                    <p className="text-xs text-rose-300 mt-1 max-w-sm mx-auto font-medium">
                      {errorMessage || 'Attendance criteria could not be satisfied.'}
                    </p>
                  </div>

                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-left text-xs text-slate-400 space-y-1">
                    <span className="font-semibold text-slate-200">Remediation steps:</span>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                      <li>Ensure you are physically within the SKIT Jaipur campus boundary (&lt; {campus.radiusMeters}m).</li>
                      <li>Check that your face is not obscured and matches your enrolled biometric profile.</li>
                      <li>Confirm that you haven't already marked attendance for this session today.</li>
                    </ul>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setStep('camera_check');
                        setErrorMessage(null);
                        startCamera();
                        checkPresence();
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-semibold text-xs hover:bg-slate-700 transition cursor-pointer"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={onClose}
                      className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white font-bold text-xs hover:bg-rose-600 transition cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
