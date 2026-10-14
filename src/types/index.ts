export type UserRole = 'student' | 'teacher' | 'staff' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  phone: string;
  fullName: string;
  role: UserRole;
  department: string;
  identifierCode: string; // Institutional Key, e.g. SC-STU-2026-0001
  isActive: boolean;
  isEnrolled: boolean;
  createdAt: string;
  avatarUrl?: string;
  semester?: string;
  section?: string;
}

export interface CampusConfig {
  campusName: string;
  campusCode: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  maxAccuracyMeters: number;
  wifiEnabled: boolean;
  wifiTrustedSSIDs: string[];
  updatedAt: string;
}

export interface ClassCheckpointStatus {
  name: string;
  window: string;
  isCompleted: boolean;
  completedAt: string | null;
}

export interface ClassSession {
  id: string;
  courseCode: string;
  courseName: string;
  instructorId: string;
  instructorName: string;
  roomNumber: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  sessionCategory: 'Lecture' | 'Practice' | 'Lab' | 'Exam';
  cp1Start: string;
  cp1End: string;
  cp2Start: string;
  cp2End: string;
  isActive: boolean;
  activePresenceKey1?: string;
  activePresenceKey2?: string;
  checkpoints?: {
    checkpoint_1: ClassCheckpointStatus;
    checkpoint_2: ClassCheckpointStatus;
  };
}

export interface PresenceKey {
  id: string;
  sessionId: string;
  checkpointType: 'checkpoint_1' | 'checkpoint_2';
  key: string;
  generatedAt: string;
  expiresAt: string;
  isActive: boolean;
  teacherId: string;
}

export interface Notice {
  id: string;
  category: 'GENERAL' | 'ACADEMIC' | 'EXAM' | 'SECURITY';
  title: string;
  description: string;
  publishedAt: string;
  targetRoles: UserRole[];
  imageUrl?: string;
}

export interface AttendanceEvent {
  id: string;
  idempotencyKey: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  identifierCode: string;
  sessionType: 'daily_staff' | 'class_session';
  sessionId?: string;
  checkpointType: 'entry' | 'checkpoint_1' | 'checkpoint_2';
  eventDate: string;
  capturedAt: string;
  serverVerifiedAt: string;
  status: 'confirmed' | 'rejected' | 'pending_sync';
  rejectionReason?: string;
  latitude?: number;
  longitude?: number;
  distanceMeters?: number;
  locationAccuracy?: number;
  faceDistance?: number;
  presenceKeyUsed?: string;
  isOfflineSubmission: boolean;
  syncedAt?: string;
  auditHash?: string;
}

export interface OfflineSubmission {
  id: string;
  idempotencyKey: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  identifierCode: string;
  sessionType: 'daily_staff' | 'class_session';
  sessionId?: string;
  checkpointType: 'entry' | 'checkpoint_1' | 'checkpoint_2';
  latitude: number;
  longitude: number;
  locationAccuracy: number;
  faceDescriptor: number[];
  capturedAt: string;
  presenceKey?: string;
  status: 'pending' | 'syncing' | 'synced' | 'rejected';
  rejectionReason?: string;
  syncAttempts: number;
  lastAttemptAt?: string;
}

export interface GeofenceResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  distanceMeters: number;
  isInside: boolean;
  isAccuracyAcceptable: boolean;
  error?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  action: string;
  status: 'SUCCESS' | 'FAILURE' | 'WARNING';
  details: Record<string, unknown>;
  ipAddress?: string;
}
