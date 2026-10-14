import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  X,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Users,
  Sparkles,
  RefreshCw,
  Clock,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../services/api';
import { faceService } from '../services/faceVerification';

interface ClassStudentCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionToken: string;
  classInfo: {
    courseName?: string;
    courseCode?: string;
    checkpoint: 'checkpoint_1' | 'checkpoint_2';
  };
  onFinished: () => void;
}

export const ClassStudentCaptureModal: React.FC<ClassStudentCaptureModalProps> = ({
  isOpen,
  onClose,
  sessionToken,
  classInfo,
  onFinished,
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturing, setCapturing] = useState(false);
  const [captureFeedback, setCaptureFeedback] = useState<{
    type: 'success' | 'warning' | 'error' | 'duplicate';
    title: string;
    message: string;
    studentName?: string;
    studentId?: string;
    confidence?: number;
    thumbnail?: string;
  } | null>(null);

  const [sessionStats, setSessionStats] = useState<{
    totalEnrolled: number;
    confirmedCount: number;
    pendingCount: number;
    rejectedCount: number;
  }>({
    totalEnrolled: 0,
    confirmedCount: 0,
    pendingCount: 0,
    rejectedCount: 0,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Poll session status periodically
  const fetchSessionStatus = useCallback(async () => {
    try {
      const res = await api.getQRSessionStatus(sessionToken);
      if (res.success && res.stats) {
        setSessionStats({
          totalEnrolled: res.stats.totalStudents,
          confirmedCount: res.stats.identifiedCount,
          pendingCount: res.stats.pendingCount,
          rejectedCount: res.stats.rejectedCount,
        });
      }
    } catch (err) {
      console.warn('[CaptureModal] Error fetching status:', err);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (isOpen) {
      fetchSessionStatus();
      const interval = setInterval(fetchSessionStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen, fetchSessionStatus]);

  // Camera Management
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by your browser.');
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      console.warn('[CaptureModal] Camera start error:', err);
      setCameraError('Unable to access camera. Please allow camera permissions.');
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Capture frame and send to server
  const handleCapture = async () => {
    if (!videoRef.current || capturing) return;
    setCapturing(true);

    try {
      const video = videoRef.current;
      if (
        video.readyState < 3 ||
        video.videoWidth === 0 ||
        video.videoHeight === 0 ||
        video.paused
      ) {
        setCaptureFeedback({
          type: 'error',
          title: 'Camera Initializing',
          message: 'Camera stream is still stabilizing. Please wait a moment and tap Capture again.',
        });
        setCapturing(false);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to create canvas context');

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const thumbnailBase64 = canvas.toDataURL('image/jpeg', 0.85);

      // Detect genuine face descriptor via face-api.js with calibrated dual-pass
      const detection = await faceService.detectFace(video);
      const descriptor = detection.descriptor;

      if (!descriptor || descriptor.length !== 128) {
        setCaptureFeedback({
          type: 'error',
          title: 'No Face Detected',
          message:
            detection.message ||
            'No face detected in camera frame. Ensure student is directly facing the camera with good lighting.',
        });
        setCapturing(false);
        return;
      }

      const res = await api.captureStudentAttendance(sessionToken, {
        faceDescriptor: descriptor,
        thumbnailUrl: thumbnailBase64,
      });

      if (res.success) {
        if (res.status === 'confirmed') {
          setCaptureFeedback({
            type: 'success',
            title: 'Attendance Confirmed',
            message: `Verified via facial embedding (Confidence: ${Math.round((res.confidence || 0.95) * 100)}%)`,
            studentName: res.matchedStudent?.fullName || res.capture.studentName,
            studentId: res.matchedStudent?.identifierCode || res.capture.identifierCode,
            confidence: res.confidence,
            thumbnail: thumbnailBase64,
          });
        } else if (res.status === 'ambiguous') {
          setCaptureFeedback({
            type: 'warning',
            title: 'Ambiguous Face Match',
            message: 'Multiple student profiles matched closely. Flagged for review.',
            studentName: res.matchedStudent?.fullName || res.capture.studentName || 'Multiple candidates',
            studentId: res.matchedStudent?.identifierCode || res.capture.identifierCode || 'AMBIGUOUS',
            thumbnail: thumbnailBase64,
          });
        } else {
          setCaptureFeedback({
            type: 'error',
            title: 'Face Not Recognised',
            message: 'No registered student matched within the distance threshold (<0.55).',
            studentName: 'Unrecognised Student',
            studentId: 'REJECTED',
            thumbnail: thumbnailBase64,
          });
        }
        await fetchSessionStatus();
      } else {
        if (res.message && res.message.toLowerCase().includes('already')) {
          setCaptureFeedback({
            type: 'duplicate',
            title: 'Duplicate Capture',
            message: res.message,
            studentName: res.matchedStudent?.fullName || res.capture?.studentName,
            studentId: res.matchedStudent?.identifierCode || res.capture?.identifierCode,
            thumbnail: thumbnailBase64,
          });
        } else {
          setCaptureFeedback({
            type: 'error',
            title: 'Capture Failed',
            message: res.message || 'Face verification failed.',
            thumbnail: thumbnailBase64,
          });
        }
      }
    } catch (err: any) {
      console.error('[CaptureModal] Capture error:', err);
      setCaptureFeedback({
        type: 'error',
        title: 'Capture Error',
        message: err?.message || 'Failed to capture student.',
      });
    } finally {
      setCapturing(false);
      // Automatically clear feedback after 3.5 seconds
      setTimeout(() => {
        setCaptureFeedback((current) => (current ? null : null));
      }, 3500);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-white max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#800020] flex items-center justify-center text-white shadow-md">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white tracking-tight">Classroom Face Capture</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  {classInfo.checkpoint === 'checkpoint_1' ? 'CP 1 (Start)' : 'CP 2 (Mid)'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate max-w-[240px]">
                {classInfo.courseName || 'Class Session'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Counter Strip */}
        <div className="px-4 py-2.5 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 text-slate-300">
            <Users className="w-4 h-4 text-emerald-400" />
            <span>Students Captured:</span>
            <span className="font-mono font-bold text-white text-sm">
              {sessionStats.confirmedCount} / {sessionStats.totalEnrolled || 24}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={toggleFacingMode}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-300 transition flex items-center space-x-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>{facingMode === 'environment' ? 'Back' : 'Front'}</span>
            </button>
          </div>
        </div>

        {/* Viewfinder Area */}
        <div className="relative p-4 flex flex-col items-center">
          <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-black border-2 border-slate-700 flex items-center justify-center">
            {cameraError ? (
              <div className="p-6 text-center space-y-2">
                <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
                <p className="text-xs text-rose-300">{cameraError}</p>
                <button
                  onClick={startCamera}
                  className="px-3 py-1.5 rounded-xl bg-[#800020] text-white text-xs font-bold"
                >
                  Retry Camera
                </button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover transform-gpu"
                />

                {/* Face Targeting Oval Guide */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-48 h-60 rounded-[50%] border-2 border-dashed border-cyan-400/80 animate-pulse shadow-[0_0_20px_rgba(34,211,238,0.2)]" />
                </div>

                {/* Guide Text */}
                <div className="absolute top-3 inset-x-3 pointer-events-none flex justify-center">
                  <span className="px-3 py-1 rounded-full bg-slate-950/80 backdrop-blur border border-slate-700 text-[11px] font-semibold text-slate-200">
                    Point camera at student&apos;s face and tap capture
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Real-time Feedback Banner */}
          {captureFeedback && (
            <div
              className={`mt-3 w-full p-3 rounded-2xl border flex items-center space-x-3 animate-slideDown ${
                captureFeedback.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                  : captureFeedback.type === 'warning'
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                  : captureFeedback.type === 'duplicate'
                  ? 'bg-blue-500/15 border-blue-500/40 text-blue-200'
                  : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
              }`}
            >
              {captureFeedback.thumbnail ? (
                <img
                  src={captureFeedback.thumbnail}
                  alt="Captured student"
                  className="w-12 h-12 rounded-xl object-cover border border-white/20 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
                  {captureFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                  )}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold truncate">
                    {captureFeedback.studentName || captureFeedback.title}
                  </h4>
                  {captureFeedback.studentId && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/30">
                      {captureFeedback.studentId}
                    </span>
                  )}
                </div>
                <p className="text-[11px] opacity-90 truncate mt-0.5">{captureFeedback.message}</p>
              </div>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="p-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              stopCamera();
              onFinished();
            }}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
          >
            Done Capturing
          </button>

          <button
            disabled={capturing || !!cameraError}
            onClick={handleCapture}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-[#800020] to-[#990026] hover:from-[#66001a] hover:to-[#800020] text-white text-sm font-bold shadow-lg shadow-[#800020]/30 flex items-center justify-center space-x-2 transition disabled:opacity-50 cursor-pointer active:scale-98"
          >
            {capturing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Matching Face...</span>
              </>
            ) : (
              <>
                <Camera className="w-4 h-4" />
                <span>Capture Student</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
