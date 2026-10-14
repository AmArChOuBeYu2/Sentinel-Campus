import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type UserRole = 'student' | 'teacher' | 'staff' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  phone: string;
  fullName: string;
  role: UserRole;
  department: string;
  identifierCode: string; // Institutional ID, e.g. SC-STU-2026-0001
  institutionalKeyHash?: string;
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
}

export interface BiometricEnrollment {
  id: string;
  userId: string;
  descriptor: number[]; // 128-d vector
  consentGiven: boolean;
  consentStatement: string;
  enrolledAt: string;
  isActive: boolean;
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

export interface PresenceKey {
  id: string;
  sessionId: string;
  checkpointType: 'checkpoint_1' | 'checkpoint_2';
  key: string; // e.g. "SC-7829"
  generatedAt: string;
  expiresAt: string;
  isActive: boolean;
  teacherId: string;
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
  eventDate: string; // YYYY-MM-DD
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

interface DatabaseSchema {
  users: UserProfile[];
  enrollments: BiometricEnrollment[];
  campusConfig: CampusConfig;
  classes: ClassSession[];
  presenceKeys: PresenceKey[];
  qrSessions: QRSession[];
  notices: Notice[];
  attendance: AttendanceEvent[];
  auditLogs: AuditLog[];
  manualReviews?: ManualReviewRequest[];
}

const DB_FILE = path.resolve(process.cwd(), 'server', 'data', 'db.json');

// Haversine distance in meters
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Euclidean distance between two 128-d vectors
export function calculateEuclideanDistance(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 1.0;
  let sum = 0;
  for (let i = 0; i < vecA.length; i++) {
    const diff = vecA[i] - vecB[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// Format current date in campus-local timezone (Jaipur, India: Asia/Kolkata)
export function getCampusLocalDate(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

// Initial seed data with the five authorized team member profiles
function getInitialSeedData(): DatabaseSchema {
  const staff5Name = process.env.CONFIGURABLE_STAFF_NAME || 'Campus Staff Specialist';
  const today = getCampusLocalDate();

  return {
    campusConfig: {
      campusName: 'Swami Keshvanand Institute of Technology (SKIT), Jaipur',
      campusCode: 'SKIT-JAI-2026',
      latitude: 26.8227,
      longitude: 75.8647,
      radiusMeters: 450,
      maxAccuracyMeters: 80,
      wifiEnabled: false,
      wifiTrustedSSIDs: ['SKIT_CAMPUS_SECURE', 'SKIT_FACULTY_WIFI'],
      updatedAt: new Date().toISOString(),
    },
    users: [
      {
        id: 'usr_stu_0001',
        email: 'krishna.jha@skit.ac.in',
        phone: '',
        fullName: 'Krishna Jha',
        role: 'student',
        department: 'B.Tech Computer Science & Engineering',
        identifierCode: 'SC-STU-2026-0001',
        semester: 'Semester 6',
        section: 'Sec-B',
        credentialStatus: 'provisional_pending_configuration',
        emailVerified: false,
        phoneVerified: false,
        isActive: true,
        isEnrolled: false,
        enrollmentNote: 'Biometric profile pending genuine live enrollment. Genuine camera capture required before attendance.',
        createdAt: '2026-01-20T10:15:00Z',
      },
      {
        id: 'usr_tch_0001',
        email: 'amar.choubey@skit.ac.in',
        phone: '',
        fullName: 'Amar Choubey',
        role: 'teacher',
        department: 'Computer Science & Engineering',
        identifierCode: 'SC-TCH-2026-0001',
        secondaryEmail: 'httpsamar96@gmail.com',
        credentialStatus: 'verified', // Verified via real Resend email OTP
        emailVerified: true,
        phoneVerified: false,
        isActive: true,
        isEnrolled: false,
        enrollmentNote: 'Reference image is AI-generated (Amar.png). Ineligible for biometric enrollment until genuine live enrollment is completed.',
        createdAt: '2026-01-15T08:00:00Z',
      },
      {
        id: 'usr_sta_0001',
        email: 'sudhanshu.kumar@skit.ac.in',
        phone: '',
        fullName: 'Sudhanshu Kumar',
        role: 'staff',
        department: 'Academic Administration & Lab Tech',
        identifierCode: 'SC-STA-2026-0001',
        credentialStatus: 'provisional_pending_configuration',
        emailVerified: false,
        phoneVerified: false,
        isActive: true,
        isEnrolled: false,
        enrollmentNote: 'Biometric profile pending genuine live enrollment. Genuine camera capture required before attendance.',
        createdAt: '2026-02-01T09:30:00Z',
      },
      {
        id: 'usr_sta_0002',
        email: 'chetan@skit.ac.in',
        phone: '',
        fullName: 'Chetan',
        role: 'staff',
        department: 'Facilities & Campus IT Support',
        identifierCode: 'SC-STA-2026-0002',
        credentialStatus: 'provisional_pending_configuration',
        emailVerified: false,
        phoneVerified: false,
        isActive: true,
        isEnrolled: false,
        enrollmentNote: 'Biometric profile pending genuine live enrollment. Genuine camera capture required before attendance.',
        createdAt: '2026-02-05T10:00:00Z',
      },
      {
        id: 'usr_sta_0003',
        email: 'staff.operations@skit.ac.in',
        phone: '',
        fullName: staff5Name,
        role: 'staff',
        department: 'Campus Operations & Security',
        identifierCode: 'SC-STA-2026-0003',
        credentialStatus: 'provisional_pending_configuration',
        emailVerified: false,
        phoneVerified: false,
        isActive: true,
        isEnrolled: false,
        enrollmentNote: 'Biometric profile pending genuine live enrollment. Name and credentials pending manual configuration.',
        createdAt: '2026-02-10T11:00:00Z',
      },
      {
        id: 'usr_adm_0001',
        email: 'dean.acad@skit.ac.in',
        phone: '',
        fullName: 'Prof. Ramesh K. Agarwal (Dean)',
        role: 'admin',
        department: 'Academic Affairs & Campus Security',
        identifierCode: 'SC-ADM-2026-0001',
        credentialStatus: 'provisional_pending_configuration',
        emailVerified: false,
        phoneVerified: false,
        isActive: true,
        isEnrolled: false,
        enrollmentNote: 'Administrative supervisor account. Personal attendance gate exempt.',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
    enrollments: [],
    qrSessions: [],
    manualReviews: [],
    classes: [
      {
        id: 'cls_cs501',
        courseCode: 'CS-501',
        courseName: 'Balanced Binary Tree & Graph Algorithms',
        instructorId: 'usr_tch_0001',
        instructorName: 'Amar Choubey',
        roomNumber: 'Room 420 (Visvesvaraya Block)',
        sessionDate: today,
        startTime: '08:50 AM',
        endTime: '09:40 AM',
        sessionCategory: 'Lecture',
        cp1Start: '08:50 AM',
        cp1End: '09:10 AM',
        cp2Start: '09:15 AM',
        cp2End: '09:35 AM',
        isActive: true,
        activePresenceKey1: 'SC-7829',
        activePresenceKey2: 'SC-4190',
      },
      {
        id: 'cls_cs502',
        courseCode: 'CS-502',
        courseName: 'Deadlock Characterization & Prevention',
        instructorId: 'usr_tch_0001',
        instructorName: 'Amar Choubey',
        roomNumber: 'Room 420 (Visvesvaraya Block)',
        sessionDate: today,
        startTime: '09:40 AM',
        endTime: '10:30 AM',
        sessionCategory: 'Lecture',
        cp1Start: '09:40 AM',
        cp1End: '10:00 AM',
        cp2Start: '10:05 AM',
        cp2End: '10:25 AM',
        isActive: true,
        activePresenceKey1: 'SC-3319',
        activePresenceKey2: 'SC-8802',
      },
      {
        id: 'cls_cs503',
        courseCode: 'CS-503',
        courseName: 'Module Quiz PS 4 (Operating Systems)',
        instructorId: 'usr_tch_0001',
        instructorName: 'Amar Choubey',
        roomNumber: 'Lab 204 (Aryabhata Block)',
        sessionDate: today,
        startTime: '10:30 AM',
        endTime: '11:20 AM',
        sessionCategory: 'Exam',
        cp1Start: '10:30 AM',
        cp1End: '10:45 AM',
        cp2Start: '10:55 AM',
        cp2End: '11:15 AM',
        isActive: true,
      },
      {
        id: 'cls_cs504',
        courseCode: 'CS-504',
        courseName: 'Balanced Binary Tree Practice & Optimization',
        instructorId: 'usr_tch_0001',
        instructorName: 'Amar Choubey',
        roomNumber: 'Room 420',
        sessionDate: today,
        startTime: '02:40 PM',
        endTime: '03:30 PM',
        sessionCategory: 'Practice',
        cp1Start: '02:40 PM',
        cp1End: '03:00 PM',
        cp2Start: '03:05 PM',
        cp2End: '03:25 PM',
        isActive: true,
        activePresenceKey1: 'SC-5521',
      },
    ],
    presenceKeys: [
      {
        id: 'pk_1',
        sessionId: 'cls_cs501',
        checkpointType: 'checkpoint_1',
        key: 'SC-7829',
        generatedAt: `${today}T08:50:00Z`,
        expiresAt: `${today}T18:00:00Z`,
        isActive: true,
        teacherId: 'usr_tch_0001',
      },
      {
        id: 'pk_2',
        sessionId: 'cls_cs501',
        checkpointType: 'checkpoint_2',
        key: 'SC-4190',
        generatedAt: `${today}T09:15:00Z`,
        expiresAt: `${today}T18:00:00Z`,
        isActive: true,
        teacherId: 'usr_tch_0001',
      },
    ],
    notices: [
      {
        id: 'not_1',
        category: 'GENERAL',
        title: 'GRIT Miles are up for grabs!',
        description: 'Compete in campus technical hackathons and claim points before October 27.',
        publishedAt: '13 Oct 2026 at 12:10 PM',
        targetRoles: ['student', 'teacher', 'staff'],
      },
      {
        id: 'not_2',
        category: 'ACADEMIC',
        title: 'Mid-Term Laboratory Continuous Assessment',
        description: 'Submission deadlines for CS-501 cloud computing lab journals are scheduled for Friday.',
        publishedAt: '14 Oct 2026 at 09:30 AM',
        targetRoles: ['student', 'teacher'],
      },
      {
        id: 'not_3',
        category: 'SECURITY',
        title: 'Smart Presence Verification Active',
        description: 'Please ensure facial illumination and geofence location accuracy when logging presence.',
        publishedAt: '14 Oct 2026 at 08:00 AM',
        targetRoles: ['student', 'teacher', 'staff'],
      },
    ],
    attendance: [
      {
        id: 'att_seed_tch_1',
        idempotencyKey: `seed_tch_0001_${today}`,
        userId: 'usr_tch_0001',
        userName: 'Dr. Rajesh Sharma',
        userRole: 'teacher',
        identifierCode: 'SC-TCH-2026-0001',
        sessionType: 'daily_staff',
        checkpointType: 'entry',
        eventDate: today,
        capturedAt: `${today}T08:42:15Z`,
        serverVerifiedAt: `${today}T08:42:16Z`,
        status: 'confirmed',
        latitude: 26.8228,
        longitude: 75.8646,
        distanceMeters: 14,
        locationAccuracy: 12,
        faceDistance: 0.18,
        isOfflineSubmission: false,
        auditHash: 'sha256_seed_hash_tch_0001',
      },
      {
        id: 'att_seed_stu_1',
        idempotencyKey: `seed_stu_0001_${today}_cp1`,
        userId: 'usr_stu_0001',
        userName: 'Amar Choubey',
        userRole: 'student',
        identifierCode: 'SC-STU-2026-0001',
        sessionType: 'class_session',
        sessionId: 'cls_cs501',
        checkpointType: 'checkpoint_1',
        eventDate: today,
        capturedAt: `${today}T08:52:10Z`,
        serverVerifiedAt: `${today}T08:52:11Z`,
        status: 'confirmed',
        presenceKeyUsed: 'SC-7829',
        latitude: 26.8227,
        longitude: 75.8647,
        distanceMeters: 8,
        locationAccuracy: 10,
        faceDistance: 0.21,
        isOfflineSubmission: false,
        auditHash: 'sha256_seed_hash_stu_0001',
      },
    ],
    auditLogs: [
      {
        id: 'aud_seed_1',
        timestamp: `${today}T08:42:16Z`,
        actorId: 'usr_tch_0001',
        actorName: 'Dr. Rajesh Sharma',
        action: 'ATTENDANCE_CONFIRMED',
        status: 'SUCCESS',
        details: { sessionType: 'daily_staff', distanceMeters: 14 },
      },
    ],
  };
}

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed.presenceKeys) parsed.presenceKeys = [];
        if (!parsed.notices) parsed.notices = [];
        if (!parsed.manualReviews) parsed.manualReviews = [];

        // Prune legacy synthetic or unverified test enrollments
        parsed.enrollments = (parsed.enrollments || []).filter(
          (e: any) => !['enr_stu_0001', 'enr_tch_0001', 'enr_sta_0001', 'enr_sta_0002', 'enr_sta_0003'].includes(e.id)
        );

        // Cleanse legacy base64 image snapshots from disk to ensure zero personal photos stored
        if (parsed.manualReviews) {
          parsed.manualReviews.forEach((r: any) => { delete r.photoSnapshot; });
        }
        if (parsed.qrSessions) {
          parsed.qrSessions.forEach((s: any) => {
            (s.captures || []).forEach((c: any) => { delete c.thumbnailUrl; });
          });
        }

        // Synchronize and verify the 5 authorized team members
        const seed = getInitialSeedData();
        for (const seedUser of seed.users) {
          const existingIdx = parsed.users.findIndex((u: any) => u.id === seedUser.id);
          const hasRealEnrollment = parsed.enrollments.some((e: any) => e.userId === seedUser.id && e.isActive);
          if (existingIdx !== -1) {
            parsed.users[existingIdx] = {
              ...parsed.users[existingIdx],
              fullName: seedUser.fullName,
              role: seedUser.role,
              email: seedUser.email,
              phone: seedUser.phone,
              identifierCode: seedUser.identifierCode,
              secondaryEmail: seedUser.secondaryEmail,
              credentialStatus: seedUser.credentialStatus,
              emailVerified: seedUser.emailVerified,
              phoneVerified: seedUser.phoneVerified,
              isEnrolled: hasRealEnrollment,
              enrollmentNote: hasRealEnrollment ? undefined : seedUser.enrollmentNote,
            };
            delete (parsed.users[existingIdx] as any).referenceImage;
          } else {
            parsed.users.push(seedUser);
          }
        }

        this.save(parsed);
        return parsed;
      }
    } catch (err) {
      console.warn('[DB] Failed to load db.json, generating seed data:', err);
    }
    const seed = getInitialSeedData();
    this.save(seed);
    return seed;
  }

  private save(data: DatabaseSchema) {
    try {
      const dir = path.dirname(DB_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Ephemeral image protection: Base64 camera thumbnails and review snapshots remain in-memory
      // during active sessions/reviews but are stripped from disk persistence to prevent storing personal biometric photos.
      const sanitized = {
        ...data,
        qrSessions: (data.qrSessions || []).map((session) => ({
          ...session,
          captures: (session.captures || []).map((cap) => {
            const { thumbnailUrl, ...rest } = cap;
            return rest;
          }),
        })),
        manualReviews: (data.manualReviews || []).map((rev) => {
          const { photoSnapshot, ...rest } = rev;
          return rest;
        }),
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(sanitized, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DB] Failed to persist db.json:', err);
    }
  }

  // --- Users ---
  getUsers(): UserProfile[] {
    return this.data.users;
  }

  getUserById(id: string): UserProfile | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  getUserByIdentifier(code: string): UserProfile | undefined {
    return this.data.users.find(
      (u) => u.identifierCode.toUpperCase() === code.trim().toUpperCase()
    );
  }

  getUserByEmailOrPhone(credential: string): UserProfile | undefined {
    const q = credential.trim().toLowerCase();
    return this.data.users.find(
      (u) =>
        u.email.toLowerCase() === q ||
        u.secondaryEmail?.toLowerCase() === q ||
        u.phone.replace(/\s+/g, '') === q.replace(/\s+/g, '')
    );
  }

  updateUser(id: string, updates: Partial<UserProfile>): UserProfile | null {
    const idx = this.data.users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    this.data.users[idx] = { ...this.data.users[idx], ...updates };
    this.save(this.data);
    return this.data.users[idx];
  }

  createUser(profile: Omit<UserProfile, 'id' | 'createdAt'>): UserProfile {
    const newUser: UserProfile = {
      id: `usr_${crypto.randomUUID().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
      ...profile,
    };
    this.data.users.push(newUser);
    this.save(this.data);
    return newUser;
  }

  // --- Biometric Enrollments ---
  getEnrollmentByUserId(userId: string): BiometricEnrollment | undefined {
    return this.data.enrollments.find((e) => e.userId === userId && e.isActive);
  }

  saveEnrollment(
    userId: string,
    descriptor: number[],
    consentStatement: string
  ): BiometricEnrollment {
    this.data.enrollments.forEach((e) => {
      if (e.userId === userId) e.isActive = false;
    });

    const newEnrollment: BiometricEnrollment = {
      id: `enr_${crypto.randomUUID().slice(0, 8)}`,
      userId,
      descriptor,
      consentGiven: true,
      consentStatement,
      enrolledAt: new Date().toISOString(),
      isActive: true,
    };

    this.data.enrollments.push(newEnrollment);
    this.updateUser(userId, { isEnrolled: true });
    this.addAuditLog(userId, 'ENROLLMENT_COMPLETED', 'SUCCESS', {
      enrollmentId: newEnrollment.id,
      dimensions: descriptor.length,
    });
    this.save(this.data);
    return newEnrollment;
  }

  deleteEnrollment(userId: string): boolean {
    let deleted = false;
    this.data.enrollments = this.data.enrollments.filter((e) => {
      if (e.userId === userId) {
        deleted = true;
        return false;
      }
      return true;
    });
    if (deleted) {
      this.updateUser(userId, { isEnrolled: false });
      this.addAuditLog(userId, 'ENROLLMENT_RESET', 'WARNING', { userId });
      this.save(this.data);
    }
    return deleted;
  }

  resetEnrollment(userId: string): boolean {
    return this.deleteEnrollment(userId);
  }

  // --- Campus Config ---
  getCampusConfig(): CampusConfig {
    return this.data.campusConfig;
  }

  updateCampusConfig(updates: Partial<CampusConfig>, actorId = 'usr_adm_0001'): CampusConfig {
    this.data.campusConfig = {
      ...this.data.campusConfig,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.addAuditLog(actorId, 'CAMPUS_CONFIG_UPDATED', 'SUCCESS', updates);
    this.save(this.data);
    return this.data.campusConfig;
  }

  // --- Classes ---
  getClasses(): ClassSession[] {
    return this.data.classes;
  }

  getClassById(id: string): ClassSession | undefined {
    return this.data.classes.find((c) => c.id === id);
  }

  createClass(session: Omit<ClassSession, 'id'>, actorId: string): ClassSession {
    const newClass: ClassSession = {
      id: `cls_${crypto.randomUUID().slice(0, 8)}`,
      ...session,
    };
    this.data.classes.push(newClass);
    this.addAuditLog(actorId, 'CLASS_CREATED', 'SUCCESS', { classId: newClass.id, code: newClass.courseCode });
    this.save(this.data);
    return newClass;
  }

  // --- Presence Keys (Starting-Class & Mid-Class) ---
  generatePresenceKey(
    sessionId: string,
    checkpointType: 'checkpoint_1' | 'checkpoint_2',
    teacherId: string
  ): PresenceKey {
    // Invalidate existing active key for this session & checkpoint
    this.data.presenceKeys.forEach((k) => {
      if (k.sessionId === sessionId && k.checkpointType === checkpointType) {
        k.isActive = false;
      }
    });

    // Random 4-digit token, e.g. "SC-7829"
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const keyString = `SC-${randomCode}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // 5 min window (Priority 3)

    const presenceKey: PresenceKey = {
      id: `pk_${crypto.randomUUID().slice(0, 8)}`,
      sessionId,
      checkpointType,
      key: keyString,
      generatedAt: now.toISOString(),
      expiresAt,
      isActive: true,
      teacherId,
    };

    this.data.presenceKeys.unshift(presenceKey);

    // Update active key reference on class session
    const cls = this.getClassById(sessionId);
    if (cls) {
      if (checkpointType === 'checkpoint_1') cls.activePresenceKey1 = keyString;
      if (checkpointType === 'checkpoint_2') cls.activePresenceKey2 = keyString;
    }

    this.addAuditLog(teacherId, 'PRESENCE_KEY_GENERATED', 'SUCCESS', {
      sessionId,
      checkpointType,
      key: keyString,
      expiresAt,
    });

    this.save(this.data);
    return presenceKey;
  }

  getActivePresenceKey(
    sessionId: string,
    checkpointType: 'checkpoint_1' | 'checkpoint_2'
  ): PresenceKey | undefined {
    const now = new Date().toISOString();
    return this.data.presenceKeys.find(
      (k) =>
        k.sessionId === sessionId &&
        k.checkpointType === checkpointType &&
        k.isActive &&
        k.expiresAt > now
    );
  }

  validatePresenceKey(
    sessionId: string,
    checkpointType: 'checkpoint_1' | 'checkpoint_2',
    submittedKey: string
  ): { valid: boolean; reason?: string } {
    const activeKey = this.getActivePresenceKey(sessionId, checkpointType);
    if (!activeKey) {
      return {
        valid: false,
        reason: `No active Presence Key found for this class session's ${checkpointType}. The instructor may not have opened attendance yet.`,
      };
    }

    if (activeKey.key.toUpperCase() !== submittedKey.trim().toUpperCase()) {
      return {
        valid: false,
        reason: `Invalid Presence Key "${submittedKey}". Please verify the code displayed by your instructor.`,
      };
    }

    return { valid: true };
  }

  // --- QR Sessions for Laptop & Mobile Classroom Capture ---
  createQRSession(
    classId: string,
    checkpointType: 'checkpoint_1' | 'checkpoint_2',
    teacherId: string
  ): QRSession {
    if (!this.data.qrSessions) {
      this.data.qrSessions = [];
    }
    // Invalidate existing active session for this class & checkpoint
    this.data.qrSessions.forEach((s) => {
      if (s.classId === classId && s.checkpointType === checkpointType) {
        s.isActive = false;
      }
    });

    const cls = this.getClassById(classId);
    const teacher = this.getUserById(teacherId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // 5 min countdown
    const token = crypto.randomBytes(16).toString('hex');

    const qrSession: QRSession = {
      id: `qrs_${crypto.randomUUID().slice(0, 8)}`,
      token,
      classId,
      courseCode: cls?.courseCode || 'CS-501',
      courseName: cls?.courseName || 'Class Session',
      teacherId,
      teacherName: teacher?.fullName || 'Instructor',
      checkpointType,
      createdAt: now.toISOString(),
      expiresAt,
      isActive: true,
      captures: [],
    };

    this.data.qrSessions.unshift(qrSession);
    this.addAuditLog(teacherId, 'QR_SESSION_CREATED', 'SUCCESS', {
      sessionId: qrSession.id,
      classId,
      checkpointType,
      token,
      expiresAt,
    });
    this.save(this.data);
    return qrSession;
  }

  getQRSessionByToken(token: string): QRSession | undefined {
    if (!this.data.qrSessions) this.data.qrSessions = [];
    const session = this.data.qrSessions.find((s) => s.token === token);
    if (!session) return undefined;
    if (session.isActive && new Date().toISOString() > session.expiresAt) {
      session.isActive = false;
      this.save(this.data);
    }
    return session;
  }

  getActiveQRSession(
    classId: string,
    checkpointType: 'checkpoint_1' | 'checkpoint_2'
  ): QRSession | undefined {
    if (!this.data.qrSessions) this.data.qrSessions = [];
    const now = new Date().toISOString();
    return this.data.qrSessions.find(
      (s) =>
        s.classId === classId &&
        s.checkpointType === checkpointType &&
        s.isActive &&
        s.expiresAt > now
    );
  }

  addStudentCaptureToSession(
    token: string,
    capture: Omit<CapturedStudent, 'id'>
  ): { success: boolean; capture?: CapturedStudent; reason?: string } {
    const session = this.getQRSessionByToken(token);
    if (!session || !session.isActive) {
      return { success: false, reason: 'QR capture session is expired or inactive.' };
    }

    const capturedStudent: CapturedStudent = {
      id: `cap_${crypto.randomUUID().slice(0, 8)}`,
      ...capture,
    };

    session.captures.unshift(capturedStudent);
    this.save(this.data);
    return { success: true, capture: capturedStudent };
  }

  closeQRSession(token: string, teacherId?: string): QRSession | undefined {
    const session = this.getQRSessionByToken(token);
    if (session) {
      session.isActive = false;
      this.addAuditLog(teacherId || session.teacherId, 'QR_SESSION_CLOSED', 'SUCCESS', {
        sessionId: session.id,
        classId: session.classId,
        capturedCount: session.captures.length,
      });
      this.save(this.data);
    }
    return session;
  }

  // Multi-student facial recognition match against enrolled reference profiles
  matchStudentFace(descriptor: number[]): {
    match: UserProfile | null;
    distance: number;
    status: 'confirmed' | 'unmatched' | 'ambiguous';
    confidence: number;
  } {
    const enrolledStudents = this.data.users.filter((u) => u.role === 'student');
    const matches: Array<{ user: UserProfile; distance: number }> = [];

    for (const student of enrolledStudents) {
      const enrollment = this.getEnrollmentByUserId(student.id);
      if (enrollment && enrollment.isActive && enrollment.descriptor) {
        const dist = calculateEuclideanDistance(descriptor, enrollment.descriptor);
        matches.push({ user: student, distance: dist });
      }
    }

    if (matches.length === 0) {
      return { match: null, distance: 1.0, status: 'unmatched', confidence: 0 };
    }

    matches.sort((a, b) => a.distance - b.distance);
    const best = matches[0];
    const threshold = 0.55;

    if (best.distance > threshold) {
      return {
        match: null,
        distance: Number(best.distance.toFixed(4)),
        status: 'unmatched',
        confidence: Math.max(0, Math.round((1 - best.distance) * 100)),
      };
    }

    // Check for ambiguity (if second best match is within 0.05 of the best match)
    if (matches.length > 1 && matches[1].distance < threshold) {
      const diff = matches[1].distance - best.distance;
      if (diff < 0.05) {
        return {
          match: best.user,
          distance: Number(best.distance.toFixed(4)),
          status: 'ambiguous',
          confidence: Math.round((1 - best.distance) * 100),
        };
      }
    }

    return {
      match: best.user,
      distance: Number(best.distance.toFixed(4)),
      status: 'confirmed',
      confidence: Math.round((1 - best.distance) * 100),
    };
  }

  // --- Notices ---
  getNotices(role?: UserRole): Notice[] {
    if (!role) return this.data.notices;
    return this.data.notices.filter((n) => n.targetRoles.includes(role));
  }

  createNotice(notice: Omit<Notice, 'id'>, actorId: string): Notice {
    const newNotice: Notice = {
      id: `not_${crypto.randomUUID().slice(0, 8)}`,
      ...notice,
    };
    this.data.notices.unshift(newNotice);
    this.addAuditLog(actorId, 'NOTICE_PUBLISHED', 'SUCCESS', { noticeId: newNotice.id, title: newNotice.title });
    this.save(this.data);
    return newNotice;
  }

  // --- Attendance ---
  getAttendance(): AttendanceEvent[] {
    return this.data.attendance;
  }

  getAttendanceByUser(userId: string): AttendanceEvent[] {
    return this.data.attendance
      .filter((a) => a.userId === userId)
      .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
  }

  findDuplicateAttendance(
    userId: string,
    eventDate: string,
    sessionType: 'daily_staff' | 'class_session' | 'daily_personal',
    checkpointType: 'entry' | 'checkpoint_1' | 'checkpoint_2',
    sessionId?: string
  ): AttendanceEvent | undefined {
    return this.data.attendance.find((a) => {
      if (a.userId !== userId || a.status !== 'confirmed') return false;
      if (a.eventDate !== eventDate) return false;
      if (a.sessionType !== sessionType) return false;
      if (a.checkpointType !== checkpointType) return false;
      if (sessionType === 'class_session' && a.sessionId !== sessionId) return false;
      return true;
    });
  }

  // --- Manual Review Requests ---
  getManualReviews(): ManualReviewRequest[] {
    if (!this.data.manualReviews) this.data.manualReviews = [];
    return this.data.manualReviews;
  }

  createManualReview(
    userId: string,
    reason: string,
    photoSnapshot?: string
  ): ManualReviewRequest {
    if (!this.data.manualReviews) this.data.manualReviews = [];
    const user = this.getUserById(userId);
    const review: ManualReviewRequest = {
      id: `rev_${crypto.randomUUID().slice(0, 8)}`,
      userId,
      userName: user?.fullName || 'User',
      userRole: user?.role || 'student',
      identifierCode: user?.identifierCode || '',
      reason,
      photoSnapshot,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    this.data.manualReviews.unshift(review);
    this.addAuditLog(userId, 'MANUAL_REVIEW_REQUESTED', 'WARNING', {
      reviewId: review.id,
      reason,
    });
    this.save(this.data);
    return review;
  }

  resolveManualReview(
    reviewId: string,
    approved: boolean,
    adminId: string,
    adminNotes?: string
  ): ManualReviewRequest | null {
    if (!this.data.manualReviews) this.data.manualReviews = [];
    const rev = this.data.manualReviews.find((r) => r.id === reviewId);
    if (!rev) return null;

    rev.status = approved ? 'approved' : 'rejected';
    rev.resolvedAt = new Date().toISOString();
    rev.resolvedBy = adminId;
    rev.adminNotes = adminNotes;

    if (approved) {
      const today = getCampusLocalDate();
      const user = this.getUserById(rev.userId);
      if (user) {
        this.recordAttendance({
          idempotencyKey: `rev_att_${rev.id}_${today}`,
          userId: user.id,
          userName: user.fullName,
          userRole: user.role,
          identifierCode: user.identifierCode,
          sessionType: 'daily_personal',
          checkpointType: 'entry',
          eventDate: today,
          capturedAt: new Date().toISOString(),
          serverVerifiedAt: new Date().toISOString(),
          status: 'confirmed',
          rejectionReason: `Manual Administrative Review Approved: ${adminNotes || 'Verified by Admin'}`,
          distanceMeters: 0,
          locationAccuracy: 5,
          faceDistance: 0,
          isOfflineSubmission: false,
        });
      }
    }

    this.addAuditLog(adminId, 'MANUAL_REVIEW_RESOLVED', 'SUCCESS', {
      reviewId,
      status: rev.status,
      adminNotes,
    });
    this.save(this.data);
    return rev;
  }

  // --- Personal Attendance Gate ---
  hasConfirmedPersonalAttendanceToday(userId: string, dateOverride?: string): boolean {
    const today = dateOverride || getCampusLocalDate();
    return this.data.attendance.some(
      (a) =>
        a.userId === userId &&
        a.eventDate === today &&
        a.status === 'confirmed' &&
        (a.sessionType === 'daily_personal' || a.sessionType === 'daily_staff')
    );
  }

  getTodayPersonalAttendance(userId: string, dateOverride?: string): AttendanceEvent | undefined {
    const today = dateOverride || getCampusLocalDate();
    return this.data.attendance.find(
      (a) =>
        a.userId === userId &&
        a.eventDate === today &&
        a.status === 'confirmed' &&
        (a.sessionType === 'daily_personal' || a.sessionType === 'daily_staff')
    );
  }

  recordAttendance(event: Omit<AttendanceEvent, 'id'>): AttendanceEvent {
    const hashData = `${event.userId}_${event.capturedAt}_${event.latitude}_${event.longitude}_${event.status}`;
    const auditHash = crypto.createHash('sha256').update(hashData).digest('hex').slice(0, 32);

    const record: AttendanceEvent = {
      id: `att_${crypto.randomUUID().slice(0, 10)}`,
      ...event,
      auditHash,
    };

    this.data.attendance.unshift(record);

    this.addAuditLog(
      record.userId,
      record.status === 'confirmed' ? 'ATTENDANCE_CONFIRMED' : 'ATTENDANCE_REJECTED',
      record.status === 'confirmed' ? 'SUCCESS' : 'FAILURE',
      {
        attendanceId: record.id,
        sessionType: record.sessionType,
        checkpointType: record.checkpointType,
        distanceMeters: record.distanceMeters,
        faceDistance: record.faceDistance,
        reason: record.rejectionReason,
        isOfflineSubmission: record.isOfflineSubmission,
      }
    );

    this.save(this.data);
    return record;
  }

  // --- Audit Logs ---
  getAuditLogs(): AuditLog[] {
    return this.data.auditLogs.slice(0, 200);
  }

  addAuditLog(
    actorId: string,
    action: string,
    status: 'SUCCESS' | 'FAILURE' | 'WARNING',
    details: Record<string, unknown>,
    ipAddress = '127.0.0.1'
  ): AuditLog {
    const actor = this.getUserById(actorId);
    const log: AuditLog = {
      id: `aud_${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      actorId,
      actorName: actor?.fullName || 'System',
      action,
      status,
      details,
      ipAddress,
    };
    this.data.auditLogs.unshift(log);
    if (this.data.auditLogs.length > 500) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 500);
    }
    this.save(this.data);
    return log;
  }
}

export const db = new Database();
