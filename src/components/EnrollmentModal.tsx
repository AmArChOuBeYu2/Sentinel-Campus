import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  X,
  FileText,
  Sparkles,
} from 'lucide-react';
import { UserProfile } from '../types';
import { faceService } from '../services/faceVerification';
import { api } from '../services/api';

interface EnrollmentModalProps {
  user: UserProfile;
  targetUserId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const EnrollmentModal: React.FC<EnrollmentModalProps> = ({
  user,
  targetUserId,
  onClose,
  onSuccess,
}) => {
  const [consentChecked, setConsentChecked] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [faceQuality, setFaceQuality] = useState<'idle' | 'good' | 'poor'>('idle');
  const [feedback, setFeedback] = useState('Position your face inside the oval guide');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastDescriptorRef = useRef<number[] | null>(null);
  const isDetectingRef = useRef(false);
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access not supported by browser.');
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false,
      });
      setStream(mediaStream);
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(console.warn);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setCameraError(e.message || 'Camera permission denied or camera device missing.');
    }
  }, []);

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

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // Face quality monitoring loop
  useEffect(() => {
    if (!stream || !videoRef.current) return;

    let active = true;

    const checkFace = async () => {
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
          const res = await faceService.detectFace(video);
          if (!active) return;

          if (res.detected && res.descriptor) {
            lastDescriptorRef.current = res.descriptor;
            setFaceQuality('good');
            setFeedback('Clear facial landmarks detected. Ready to enroll.');
          } else {
            setFaceQuality('poor');
            setFeedback(res.message || 'Center face in oval and look directly at camera');
          }
        } catch {
          // Silent tick
        } finally {
          isDetectingRef.current = false;
        }
      }

      if (active) {
        loopTimerRef.current = setTimeout(checkFace, 180);
      }
    };

    loopTimerRef.current = setTimeout(checkFace, 400);

    return () => {
      active = false;
      if (loopTimerRef.current) {
        clearTimeout(loopTimerRef.current);
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [stream]);

  const handleEnroll = async () => {
    if (!consentChecked) {
      setErrorMessage('You must review and agree to the biometric data consent declaration before enrolling.');
      return;
    }

    let descriptor = lastDescriptorRef.current;
    if (!descriptor && videoRef.current) {
      const res = await faceService.detectFace(videoRef.current);
      if (res.descriptor) descriptor = res.descriptor;
    }

    if (!descriptor || descriptor.length !== 128) {
      setErrorMessage('Could not generate a high-confidence face descriptor. Please align your face and ensure adequate lighting.');
      return;
    }

    setIsCapturing(true);
    setErrorMessage(null);

    try {
      const res = await api.submitEnrollment(
        descriptor,
        'Informed consent: I authorize Sentinel Campus to compute and store a 128-dimensional mathematical vector representation of my facial landmarks for campus attendance verification. Original images are not permanently retained.',
        targetUserId || user.id
      );

      if (res.success) {
        setIsSuccess(true);
        stopCamera();
      } else {
        setErrorMessage(res.message || 'Failed to complete biometric enrollment.');
      }
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Enrollment registration failed.');
    } finally {
      setIsCapturing(false);
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
              <h3 className="text-base font-bold text-white tracking-tight">Biometric Face Enrollment</h3>
              <p className="text-xs text-slate-400">
                {user.fullName} • {user.identifierCode}
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

        {/* Content */}
        <div className="p-5 space-y-4">
          {isSuccess ? (
            <div className="py-8 space-y-4 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/10">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h4 className="text-lg font-bold text-white">Enrollment Completed</h4>
              <p className="text-xs text-slate-300 max-w-sm mx-auto">
                Your 128-dimensional facial embedding vector has been generated and securely registered with Sentinel Campus. You can now mark attendance using live camera recognition.
              </p>
              <button
                onClick={() => {
                  onSuccess();
                  onClose();
                }}
                className="w-full py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition"
              >
                Proceed to Dashboard
              </button>
            </div>
          ) : (
            <>
              {/* Camera Viewfinder */}
              <div className="relative aspect-4/3 w-full bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                {cameraError ? (
                  <div className="p-6 text-center space-y-3">
                    <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
                    <p className="text-xs text-rose-300">{cameraError}</p>
                    <button
                      onClick={startCamera}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 text-xs font-semibold"
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

                    {/* Oval guide */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div
                        className={`w-44 h-56 border-2 border-dashed rounded-[50%] transition-colors duration-300 flex items-center justify-center ${
                          faceQuality === 'good'
                            ? 'border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                            : 'border-cyan-400/60'
                        }`}
                      />
                    </div>

                    {/* Status Pill */}
                    <div className="absolute bottom-3 inset-x-3 flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-950/80 backdrop-blur border border-slate-700 text-xs">
                      <span className="text-slate-300 text-[11px] font-medium">{feedback}</span>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          faceQuality === 'good'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {faceQuality === 'good' ? 'Optimal' : 'Aligning'}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Informed Consent Agreement */}
              <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl space-y-2 text-xs">
                <div className="flex items-center space-x-2 text-cyan-400 font-semibold text-[11px] uppercase tracking-wider">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Biometric Data &amp; Privacy Consent</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Sentinel Campus computes a 128-dimensional mathematical representation of facial landmarks for presence verification. Raw images are not permanently stored. You may request deletion or reset of your biometric vector at any time through the security office.
                </p>
                <label className="flex items-start space-x-2.5 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span className="text-white text-xs font-medium">
                    I grant informed consent for biometric vector extraction for campus attendance.
                  </span>
                </label>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
                  <XCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleEnroll}
                disabled={!consentChecked || isCapturing}
                className={`w-full py-3 rounded-xl font-bold text-xs tracking-wide transition flex items-center justify-center space-x-2 ${
                  consentChecked && !isCapturing
                    ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:from-cyan-400 hover:to-emerald-400 shadow-lg shadow-cyan-500/20 cursor-pointer'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                }`}
              >
                {isCapturing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Facial Embedding...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Register Biometric Profile</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
