import React, { useState, useEffect } from 'react';
import {
  CloudUpload,
  RefreshCw,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react';
import { OfflineSubmission } from '../types';
import { offlineSyncService } from '../services/offlineSync';

interface OfflineQueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncCompleted: () => void;
}

export const OfflineQueueDrawer: React.FC<OfflineQueueDrawerProps> = ({
  isOpen,
  onClose,
  onSyncCompleted,
}) => {
  const [submissions, setSubmissions] = useState<OfflineSubmission[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);

  const loadSubmissions = async () => {
    const list = await offlineSyncService.getSubmissions();
    setSubmissions(list);
  };

  useEffect(() => {
    if (isOpen) {
      loadSubmissions();
      const unsub = offlineSyncService.subscribe(loadSubmissions);
      return unsub;
    }
  }, [isOpen]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncSummary(null);
    try {
      const res = await offlineSyncService.triggerAutoSync();
      setSyncSummary(`Sync finished: ${res.synced} confirmed/updated, ${res.failed} rejected/failed.`);
      await loadSubmissions();
      onSyncCompleted();
    } catch {
      setSyncSummary('Network error during synchronization attempt.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearCompleted = async () => {
    await offlineSyncService.clearSynced();
    await loadSubmissions();
  };

  const handleDeleteItem = async (id: string) => {
    await offlineSyncService.removeSubmission(id);
    await loadSubmissions();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/70 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-md bg-[#0b132b] border-l border-cyan-500/30 h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-[#1c2541]/70 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <CloudUpload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Offline Attendance Queue</h3>
              <p className="text-xs text-slate-400">IndexedDB Local Submissions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="p-4 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between gap-2">
          <button
            onClick={handleManualSync}
            disabled={isSyncing || submissions.length === 0}
            className={`flex-1 py-2 px-3 rounded-xl font-semibold text-xs transition flex items-center justify-center space-x-2 ${
              isSyncing || submissions.length === 0
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 cursor-pointer shadow-lg shadow-cyan-500/20'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Pending With Server'}</span>
          </button>

          {submissions.some((s) => s.status === 'synced') && (
            <button
              onClick={handleClearCompleted}
              className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
              title="Clear confirmed synced entries"
            >
              Clear Completed
            </button>
          )}
        </div>

        {/* Sync Summary Alert */}
        {syncSummary && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{syncSummary}</span>
          </div>
        )}

        {/* List of submissions */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {submissions.length === 0 ? (
            <div className="py-16 text-center text-slate-500 space-y-2">
              <CloudUpload className="w-12 h-12 mx-auto stroke-1 text-slate-600" />
              <p className="text-sm font-medium text-slate-400">Offline Queue Empty</p>
              <p className="text-xs max-w-xs mx-auto">
                Any attendance records captured while offline will automatically queue here and sync once connection is restored.
              </p>
            </div>
          ) : (
            submissions.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl bg-[#1c2541]/40 border border-slate-800 space-y-2 hover:border-slate-700 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-white capitalize">
                    {item.sessionType.replace('_', ' ')} • {item.checkpointType}
                  </span>
                  <div className="flex items-center space-x-1.5">
                    {item.status === 'synced' && (
                      <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Confirmed</span>
                      </span>
                    )}
                    {item.status === 'pending' && (
                      <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                        <Clock className="w-3 h-3" />
                        <span>Pending Sync</span>
                      </span>
                    )}
                    {item.status === 'syncing' && (
                      <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px] font-bold">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Syncing</span>
                      </span>
                    )}
                    {item.status === 'rejected' && (
                      <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px] font-bold">
                        <XCircle className="w-3 h-3" />
                        <span>Server Rejected</span>
                      </span>
                    )}

                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition"
                      title="Delete from local queue"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 space-y-0.5">
                  <div>User: <strong className="text-slate-300">{item.userName}</strong> ({item.identifierCode})</div>
                  <div>Captured: {new Date(item.capturedAt).toLocaleString()}</div>
                  <div>Coords: {item.latitude.toFixed(4)}°N, {item.longitude.toFixed(4)}°E (±{item.locationAccuracy}m)</div>
                </div>

                {item.rejectionReason && (
                  <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] flex items-start space-x-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{item.rejectionReason}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-slate-800 bg-[#1c2541]/40 text-[11px] text-slate-400">
          <p>
            Offline submissions are held in client-side IndexedDB with cryptographic idempotency keys. Raw biometric images are discarded immediately after 128-d vector extraction to preserve privacy.
          </p>
        </div>
      </div>
    </div>
  );
};
