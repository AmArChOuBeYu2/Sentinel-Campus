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
  secondaryEmail?: string;
  semester?: string;
  section?: string;
  enrollmentNote?: string;
  credentialStatus?: 'verified' | 'provisional_pending_configuration';
  emailVerified?: boolean;
  phoneVerified?: boolean;
  identityVerifiedByAdmin?: boolean;
  adminVerifiedAt?: string;
  adminVerifiedBy?: string;
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
  sessionType: 'daily_staff' | 'class_session' | 'daily_personal';
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

export interface ManualReviewRequest {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  identifierCode: string;
  reason: string;
  photoSnapshot?: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  resolvedAt?: string;
  resolvedBy?: string;
  adminNotes?: string;
}

export interface GateStatusResponse {
  success: boolean;
  attendanceRequired: boolean;
  gateUnlocked: boolean;
  isEnrolled: boolean;
  enrollmentNote?: string;
  todayAttendanceConfirmed: boolean;
  todayRecord?: AttendanceEvent | null;
  networkStatus?: {
    verified: boolean;
    mode: string;
    isDemo: boolean;
    isSimulated?: boolean;
    verificationTier?: 'simulated_prototype' | 'server_verified_infrastructure';
    message: string;
    error?: string;
    clientIp?: string;
    macNotice?: string;
  };
  message?: string;
}

export interface OfflineSubmission {
  id: string;
  idempotencyKey: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  identifierCode: string;
  sessionType: 'daily_staff' | 'class_session' | 'daily_personal';
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

export interface CapturedStudent {
  id: string;
  studentId: string;
  studentName: string;
  identifierCode: string;
  capturedAt: string;
  faceDistance: number;
  status: 'confirmed' | 'unmatched' | 'ambiguous' | 'duplicate';
  thumbnailUrl?: string;
  processingTimeMs: number;
  checkpointType: 'checkpoint_1' | 'checkpoint_2';
}

export interface QRSession {
  id: string;
  token: string;
  classId: string;
  courseCode: string;
  courseName: string;
  teacherId: string;
  teacherName: string;
  checkpointType: 'checkpoint_1' | 'checkpoint_2';
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
  captures: CapturedStudent[];
  remainingSeconds?: number;
  qrPayload?: string;
}

