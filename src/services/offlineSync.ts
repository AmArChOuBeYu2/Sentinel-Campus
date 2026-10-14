import { OfflineSubmission } from '../types';
import { api } from './api';

const DB_NAME = 'sentinel_campus_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'pending_submissions';

class OfflineSyncService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private isSimulatedOffline = false;
  private listeners: Array<() => void> = [];

  constructor() {
    this.initNetworkListeners();
    const saved = localStorage.getItem('sentinel_sim_offline');
    this.isSimulatedOffline = saved === 'true';
  }

  private initNetworkListeners() {
    window.addEventListener('online', () => {
      console.log('[OfflineSync] Browser reported online connection.');
      this.notifyListeners();
      if (!this.isSimulatedOffline) {
        this.triggerAutoSync();
      }
    });

    window.addEventListener('offline', () => {
      console.log('[OfflineSync] Browser reported offline connection.');
      this.notifyListeners();
    });
  }

  isOnline(): boolean {
    if (this.isSimulatedOffline) return false;
    return navigator.onLine;
  }

  setSimulatedOffline(value: boolean) {
    this.isSimulatedOffline = value;
    localStorage.setItem('sentinel_sim_offline', String(value));
    this.notifyListeners();
    if (!value && navigator.onLine) {
      this.triggerAutoSync();
    }
  }

  getSimulatedOffline(): boolean {
    return this.isSimulatedOffline;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((cb) => cb());
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('userId', 'userId', { unique: false });
          store.createIndex('capturedAt', 'capturedAt', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  async queueSubmission(submission: Omit<OfflineSubmission, 'id' | 'syncAttempts' | 'status'>): Promise<OfflineSubmission> {
    const db = await this.getDB();
    const item: OfflineSubmission = {
      ...submission,
      id: `off_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      status: 'pending',
      syncAttempts: 0,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.add(item);

      req.onsuccess = () => {
        console.log('[OfflineSync] Submission queued locally:', item.id);
        this.notifyListeners();
        resolve(item);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getSubmissions(): Promise<OfflineSubmission[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const list = (req.result as OfflineSubmission[]) || [];
        list.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getPendingCount(): Promise<number> {
    const submissions = await this.getSubmissions();
    return submissions.filter((s) => s.status === 'pending' || s.status === 'syncing').length;
  }

  async updateSubmission(id: string, updates: Partial<OfflineSubmission>): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const item = getReq.result;
        if (!item) return resolve();
        const updated = { ...item, ...updates };
        const putReq = store.put(updated);
        putReq.onsuccess = () => {
          this.notifyListeners();
          resolve();
        };
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async removeSubmission(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => {
        this.notifyListeners();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async clearSynced(): Promise<void> {
    const all = await this.getSubmissions();
    const syncedIds = all.filter((s) => s.status === 'synced').map((s) => s.id);
    for (const id of syncedIds) {
      await this.removeSubmission(id);
    }
  }

  async triggerAutoSync(): Promise<{ synced: number; failed: number }> {
    if (!this.isOnline()) {
      return { synced: 0, failed: 0 };
    }

    const all = await this.getSubmissions();
    const pending = all.filter((s) => s.status === 'pending');

    if (pending.length === 0) {
      return { synced: 0, failed: 0 };
    }

    console.log(`[OfflineSync] Attempting batch sync of ${pending.length} pending submissions...`);

    // Mark as syncing
    for (const item of pending) {
      await this.updateSubmission(item.id, {
        status: 'syncing',
        syncAttempts: item.syncAttempts + 1,
        lastAttemptAt: new Date().toISOString(),
      });
    }

    try {
      const res = await api.syncOfflineSubmissions(
        pending.map((p) => ({
          idempotencyKey: p.idempotencyKey,
          userId: p.userId,
          sessionType: p.sessionType,
          sessionId: p.sessionId,
          checkpointType: p.checkpointType,
          latitude: p.latitude,
          longitude: p.longitude,
          locationAccuracy: p.locationAccuracy,
          faceDescriptor: p.faceDescriptor,
          capturedAt: p.capturedAt,
          isOfflineSubmission: true,
        }))
      );

      let syncedCount = 0;
      let failedCount = 0;

      for (const item of pending) {
        const result = res.results.find((r) => r.idempotencyKey === item.idempotencyKey);
        if (result) {
          if (result.status === 'confirmed') {
            await this.updateSubmission(item.id, {
              status: 'synced',
              rejectionReason: undefined,
            });
            syncedCount++;
          } else if (result.status === 'duplicate') {
            await this.updateSubmission(item.id, {
              status: 'synced',
              rejectionReason: 'Already recorded today (Duplicate resolved)',
            });
            syncedCount++;
          } else {
            await this.updateSubmission(item.id, {
              status: 'rejected',
              rejectionReason: result.reason || 'Server validation rejected offline capture',
            });
            failedCount++;
          }
        }
      }

      this.notifyListeners();
      return { synced: syncedCount, failed: failedCount };
    } catch (err) {
      console.error('[OfflineSync] Batch sync error:', err);
      // Revert to pending
      for (const item of pending) {
        await this.updateSubmission(item.id, {
          status: 'pending',
          rejectionReason: 'Network error during synchronization. Will retry automatically.',
        });
      }
      this.notifyListeners();
      return { synced: 0, failed: pending.length };
    }
  }
}

export const offlineSyncService = new OfflineSyncService();
