import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, QrCode, AlertCircle, Camera, CheckCircle2, ArrowRight } from 'lucide-react';
import { api } from '../services/api';

interface ClassQRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionVerified: (sessionData: {
    token: string;
    classId: string;
    checkpoint: 'checkpoint_1' | 'checkpoint_2';
    session: any;
  }) => void;
}

export const ClassQRScannerModal: React.FC<ClassQRScannerModalProps> = ({
  isOpen,
  onClose,
  onSessionVerified,
}) => {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isStartedRef = useRef(false);

  const handleTokenFound = async (tokenString: string) => {
    // If scanning, stop camera scanner first
    if (html5QrCodeRef.current && isStartedRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        isStartedRef.current = false;
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
    }

    setVerifying(true);
    setError(null);

    let cleanToken = tokenString.trim();
    // Support JSON QR payload or raw string
    try {
      if (cleanToken.startsWith('{') && cleanToken.endsWith('}')) {
        const parsed = JSON.parse(cleanToken);
        if (parsed.token) cleanToken = parsed.token;
      }
    } catch {
      // not JSON, use cleanToken as-is
    }

    try {
      const res = await api.getQRSession(cleanToken);
      if (res.success && res.session) {
        onSessionVerified({
          token: cleanToken,
          classId: res.session.classId,
          checkpoint: res.session.checkpointType,
          session: res.session,
        });
      } else {
        setError('Invalid or expired QR session. Please scan a live classroom QR code.');
        setVerifying(false);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to verify session token with server.');
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      if (html5QrCodeRef.current && isStartedRef.current) {
        html5QrCodeRef.current.stop().catch(console.warn);
        isStartedRef.current = false;
      }
      return;
    }

    const startScanner = async () => {
      setError(null);
      setScanning(true);

      try {
        const qrScannerId = 'html5qr-code-full-region';
        const html5QrCode = new Html5Qrcode(qrScannerId);
        html5QrCodeRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            handleTokenFound(decodedText);
          },
          () => {
            // ignore scan frame errors
          }
        );
        isStartedRef.current = true;
      } catch (err: any) {
        console.warn('[QRScanner] Camera stream error:', err);
        setError('Camera access unavailable. You can enter the session token manually below.');
        setScanning(false);
      }
    };

    // Small delay to ensure DOM element is mounted
    const timer = setTimeout(() => {
      startScanner();
    }, 250);

    return () => {
      clearTimeout(timer);
      if (html5QrCodeRef.current && isStartedRef.current) {
        html5QrCodeRef.current.stop().catch(console.warn);
        isStartedRef.current = false;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-white">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#800020] flex items-center justify-center text-white shadow-md">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-white">Scan Class Session QR</h3>
              <p className="text-[11px] text-slate-400">Point camera at laptop screen QR code</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800 hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Viewport Area */}
        <div className="p-4 flex flex-col items-center">
          <div className="relative w-full max-w-[300px] aspect-square rounded-2xl overflow-hidden bg-black border-2 border-dashed border-[#800020]/60 flex items-center justify-center">
            <div id="html5qr-code-full-region" className="w-full h-full" />

            {verifying && (
              <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center space-y-3 z-20">
                <div className="w-10 h-10 border-3 border-[#800020] border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-bold text-slate-200">Verifying session token...</p>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-3 w-full p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Manual Token Entry Fallback */}
          <div className="mt-4 w-full p-3 bg-slate-800/60 rounded-2xl border border-slate-700/60">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
              Or Enter 8-Character Session Token
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="e.g. A3F9B2C1"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value.toUpperCase())}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-[#800020]"
              />
              <button
                disabled={!manualToken.trim() || verifying}
                onClick={() => handleTokenFound(manualToken)}
                className="px-4 py-2 rounded-xl bg-[#800020] hover:bg-[#630018] disabled:opacity-50 text-white font-bold text-xs flex items-center space-x-1 transition shadow-sm cursor-pointer"
              >
                <span>Verify</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
