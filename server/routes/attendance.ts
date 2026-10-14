import { Router, Request, Response } from 'express';
import {
  db,
  calculateHaversineDistance,
  calculateEuclideanDistance,
  getCampusLocalDate,
  AttendanceEvent,
} from '../db';
import { getAuthenticatedUser } from './auth';
import { networkAuthService } from '../services/networkAuthService';

const router = Router();

// Euclidean distance threshold for 128-d face descriptors (face-api standard)
const FACE_MATCH_THRESHOLD = 0.55;

interface SubmissionPayload {
  idempotencyKey?: string;
  sessionType: 'daily_staff' | 'class_session';
  sessionId?: string;
  checkpointType: 'entry' | 'checkpoint_1' | 'checkpoint_2';
  latitude: number;
  longitude: number;
  locationAccuracy: number;
  faceDescriptor: number[];
  capturedAt: string;
  presenceKey?: string;
  isOfflineSubmission?: boolean;
}

export function validateDescriptorIntegrity(descriptor: unknown): { valid: boolean; error?: string } {
  if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
    return { valid: false, error: 'Valid 128-d face descriptor embedding required from live camera capture.' };
  }

  let sumSquares = 0;
  const firstVal = descriptor[0];
  let allEqual = true;

  for (let i = 0; i < 128; i++) {
    const v = descriptor[i];
    if (typeof v !== 'number' || isNaN(v) || !isFinite(v)) {
      return { valid: false, error: 'Corrupted face descriptor: contains non-numeric, NaN, or non-finite values.' };
    }
    if (Math.abs(v) > 2.0) {
      return { valid: false, error: 'Corrupted face descriptor: component value exceeds plausible biometric range [-2.0, 2.0].' };
    }
    if (v !== firstVal) {
      allEqual = false;
    }
    sumSquares += v * v;
  }

  if (allEqual) {
    return { valid: false, error: 'Fabricated uniform flat vector rejected by biometric integrity checks.' };
  }

  const magnitude = Math.sqrt(sumSquares);
  if (magnitude < 0.3 || magnitude > 2.0) {
    return { valid: false, error: `Fabricated or unpopulated vector: magnitude (${magnitude.toFixed(2)}) is outside plausible face embedding range [0.3, 2.0].` };
  }

  return { valid: true };
}

// Validation helper
export function validateAttendanceSubmission(
  userId: string,
  payload: SubmissionPayload
): {
  isValid: boolean;
  rejectionReason?: string;
  distanceMeters: number;
  faceDistance: number;
  biometricTier?: Record<string, unknown>;
} {
  const campus = db.getCampusConfig();

  // 0. Class Presence Key check (if class session)
  if (payload.sessionType === 'class_session' && payload.sessionId) {
    if (!payload.presenceKey) {
      return {
        isValid: false,
        rejectionReason: 'Presence Key is required for classroom session attendance. Obtain the active key from your instructor.',
        distanceMeters: 0,
        faceDistance: 1.0,
      };
    }
    const pkCheck = db.validatePresenceKey(
      payload.sessionId,
      payload.checkpointType,
      payload.presenceKey
    );
    if (!pkCheck.valid) {
      return {
        isValid: false,
        rejectionReason: pkCheck.reason || 'Invalid or expired Presence Key.',
        distanceMeters: 0,
        faceDistance: 1.0,
      };
    }
  }

  // 1. Geofence presence verification (Server-calculated Haversine)
  const distanceMeters = calculateHaversineDistance(
    campus.latitude,
    campus.longitude,
    payload.latitude,
    payload.longitude
  );

  // 2. Location Accuracy Check (reject spoofed/coarse cellular GPS)
  if (payload.locationAccuracy > campus.maxAccuracyMeters) {
    return {
      isValid: false,
      rejectionReason: `Location signal accuracy is too low (±${Math.round(
        payload.locationAccuracy
      )}m, allowed max: ±${campus.maxAccuracyMeters}m). Please ensure clear sky view and retry.`,
      distanceMeters,
      faceDistance: 1.0,
    };
  }

  // 3. Geofence boundary check
  if (distanceMeters > campus.radiusMeters) {
    return {
      isValid: false,
      rejectionReason: `Presence verification failed. Device is ${distanceMeters}m from campus center (Allowed radius: ${campus.radiusMeters}m). Must be inside campus boundary.`,
      distanceMeters,
      faceDistance: 1.0,
    };
  }

  // 4. Biometric Face Verification
  // Production Fail-Closed Policy:
  // Server-side face recognition runtime (e.g. @tensorflow/tfjs-node or Python sidecar) is absent from this Node.js environment.
  // When in production mode or when REQUIRE_SERVER_BIOMETRICS is enabled, client-generated descriptors must fail closed safely.
  const isProductionBiometricEnforced =
    process.env.NODE_ENV === 'production' || process.env.REQUIRE_SERVER_BIOMETRICS === 'true';

  if (isProductionBiometricEnforced) {
    return {
      isValid: false,
      rejectionReason:
        'Production security policy: Server-side facial landmark inference runtime (@tensorflow/tfjs-node) is not loaded. Client-supplied descriptors cannot authorize production attendance.',
      distanceMeters,
      faceDistance: 1.0,
      biometricTier: {
        mode: 'prototype_client_descriptor',
        isProductionSecure: false,
        failClosed: true,
      },
    };
  }

  const enrollment = db.getEnrollmentByUserId(userId);
  if (!enrollment) {
    return {
      isValid: false,
      rejectionReason: 'Biometric profile not enrolled. Please complete facial enrollment before marking attendance.',
      distanceMeters,
      faceDistance: 1.0,
      biometricTier: {
        mode: 'prototype_client_descriptor',
        isProductionSecure: false,
      },
    };
  }

  const descriptorCheck = validateDescriptorIntegrity(payload.faceDescriptor);
  if (!descriptorCheck.valid) {
    return {
      isValid: false,
      rejectionReason: descriptorCheck.error || 'Invalid or fabricated face descriptor vector.',
      distanceMeters,
      faceDistance: 1.0,
      biometricTier: {
        mode: 'prototype_client_descriptor',
        isProductionSecure: false,
      },
    };
  }

  // Cross-Identity Check: Reject if face belongs to another registered account
  const allOtherEnrollments = db.getEnrollments().filter((e) => e.userId !== userId && e.isActive);
  for (const otherEnrollment of allOtherEnrollments) {
    if (otherEnrollment.descriptor && Array.isArray(otherEnrollment.descriptor)) {
      const crossDist = calculateEuclideanDistance(otherEnrollment.descriptor, payload.faceDescriptor);
      if (crossDist <= FACE_MATCH_THRESHOLD) {
        const otherUser = db.getUserById(otherEnrollment.userId);
        const otherName = otherUser ? otherUser.fullName : otherEnrollment.userId;
        const otherRole = otherUser ? otherUser.role.toUpperCase() : 'USER';
        return {
          isValid: false,
          rejectionReason: `Cross-identity mismatch rejected: The detected face matches ${otherName} (${otherRole}), not the enrolled profile for the authenticated account.`,
          distanceMeters,
          faceDistance: crossDist,
          biometricTier: {
            mode: 'prototype_client_descriptor',
            isProductionSecure: false,
            crossIdentityMismatch: true,
          },
        };
      }
    }
  }

  const faceDistance = calculateEuclideanDistance(
    enrollment.descriptor,
    payload.faceDescriptor
  );

  if (faceDistance > FACE_MATCH_THRESHOLD) {
    return {
      isValid: false,
      rejectionReason: `Facial identity verification failed (Confidence distance: ${faceDistance.toFixed(
        3
      )}, required threshold: < ${FACE_MATCH_THRESHOLD}). Face did not match enrolled profile.`,
      distanceMeters,
      faceDistance,
      biometricTier: {
        mode: 'prototype_client_descriptor',
        isProductionSecure: false,
      },
    };
  }

  return {
    isValid: true,
    distanceMeters,
    faceDistance,
    biometricTier: {
      mode: 'prototype_client_descriptor',
      isProductionSecure: false,
      notice: 'Prototype mode: Descriptor computed on client browser. Not for production biometric verification.',
    },
  };
}

// POST /api/attendance/verify (Pre-flight dry run check)
router.post('/verify', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const payload: SubmissionPayload = req.body;
  const validation = validateAttendanceSubmission(user.id, payload);

  return res.json({
    success: validation.isValid,
    insideCampus: validation.distanceMeters <= db.getCampusConfig().radiusMeters,
    distanceMeters: validation.distanceMeters,
    faceMatched: validation.faceDistance <= FACE_MATCH_THRESHOLD,
    faceDistance: Number(validation.faceDistance.toFixed(4)),
    rejectionReason: validation.rejectionReason || null,
    biometricTier: validation.biometricTier,
  });
});

// POST /api/attendance/submit
router.post('/submit', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const payload: SubmissionPayload = req.body;
  const eventDate = getCampusLocalDate();
  const checkpointType = payload.checkpointType || 'entry';

  // Role Authorization Check: Restrict sessionType by authoritative user role
  if (user.role === 'teacher') {
    if (payload.sessionType === 'daily_staff') {
      return res.status(403).json({
        success: false,
        error: 'Role authorization error: Teacher accounts cannot submit daily_staff attendance. Teacher accounts use daily_personal attendance.',
      });
    }
    if (payload.sessionType === 'class_session') {
      return res.status(403).json({
        success: false,
        error: 'Role authorization error: Teacher accounts cannot submit student class_session attendance. Use classroom QR session scanner to capture student attendance.',
      });
    }
  }

  if (user.role === 'staff') {
    if (payload.sessionType === 'class_session') {
      return res.status(403).json({
        success: false,
        error: 'Role authorization error: Staff accounts cannot submit student class_session attendance.',
      });
    }
  }

  if (user.role === 'student') {
    if (payload.sessionType === 'daily_staff') {
      return res.status(403).json({
        success: false,
        error: 'Role authorization error: Student accounts cannot submit staff attendance.',
      });
    }
  }

  const sessionType =
    payload.sessionType ||
    (user.role === 'staff' ? 'daily_staff' : user.role === 'teacher' ? 'daily_personal' : 'class_session');

  // Check duplicate attendance constraint
  const existingRecord = db.findDuplicateAttendance(
    user.id,
    eventDate,
    sessionType,
    checkpointType,
    payload.sessionId
  );

  if (existingRecord) {
    return res.status(409).json({
      success: false,
      error: `Duplicate attendance rejected. Attendance for ${checkpointType} has already been confirmed today (${existingRecord.capturedAt}).`,
      existingRecord,
    });
  }

  // Server-side validation of location & biometric descriptor
  const validation = validateAttendanceSubmission(user.id, payload);

  const status = validation.isValid ? 'confirmed' : 'rejected';

  const record = db.recordAttendance({
    idempotencyKey: payload.idempotencyKey || `sub_${user.id}_${Date.now()}`,
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    identifierCode: user.identifierCode,
    sessionType,
    sessionId: payload.sessionId,
    checkpointType,
    eventDate,
    capturedAt: payload.capturedAt || new Date().toISOString(),
    serverVerifiedAt: new Date().toISOString(),
    status,
    rejectionReason: validation.rejectionReason,
    latitude: payload.latitude,
    longitude: payload.longitude,
    distanceMeters: validation.distanceMeters,
    locationAccuracy: payload.locationAccuracy,
    faceDistance: Number(validation.faceDistance.toFixed(4)),
    isOfflineSubmission: !!payload.isOfflineSubmission,
  });

  return res.status(status === 'confirmed' ? 200 : 422).json({
    success: status === 'confirmed',
    record,
    error: status === 'rejected' ? validation.rejectionReason : undefined,
    biometricTier: validation.biometricTier,
  });
});

// GET /api/attendance/me
router.get('/me', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const records = db.getAttendanceByUser(user.id);
  const today = getCampusLocalDate();
  const todayRecords = records.filter((r) => r.eventDate === today);

  return res.json({
    success: true,
    user: {
      id: user.id,
      fullName: user.fullName,
      role: user.role,
      identifierCode: user.identifierCode,
    },
    todayStatus: {
      hasPersonalAttendance: todayRecords.some(
        (r) =>
          (r.sessionType === 'daily_personal' || r.sessionType === 'daily_staff') &&
          r.status === 'confirmed'
      ),
      hasDailyStaffAttendance: todayRecords.some(
        (r) => r.sessionType === 'daily_staff' && r.status === 'confirmed'
      ),
      latestRecord: records[0] || null,
      confirmedCountToday: todayRecords.filter((r) => r.status === 'confirmed').length,
    },
    records,
  });
});

// POST /api/attendance/sync (Offline queue batch synchronization)
router.post('/sync', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const { submissions } = req.body;
  if (!Array.isArray(submissions) || submissions.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Payload must contain a non-empty array of submissions to synchronize.',
    });
  }

  const results: Array<{
    idempotencyKey: string;
    status: 'confirmed' | 'rejected' | 'duplicate';
    record?: AttendanceEvent;
    reason?: string;
  }> = [];

  for (const item of submissions) {
    const itemUserId = item.userId || user.id;
    // Authorization check: User can only sync their own submissions unless admin
    if (user.role !== 'admin' && itemUserId !== user.id) {
      results.push({
        idempotencyKey: item.idempotencyKey,
        status: 'rejected',
        reason: 'Unauthorized: Cannot sync attendance on behalf of another user.',
      });
      continue;
    }

    const itemUser = db.getUserById(itemUserId);
    if (!itemUser) {
      results.push({
        idempotencyKey: item.idempotencyKey,
        status: 'rejected',
        reason: 'User not found in campus directory.',
      });
      continue;
    }

    const eventDate = item.capturedAt
      ? item.capturedAt.split('T')[0]
      : getCampusLocalDate();
    const checkpointType = item.checkpointType || 'entry';
    const sessionType = item.sessionType || (itemUser.role === 'staff' ? 'daily_staff' : 'class_session');

    // Duplicate check
    const existing = db.findDuplicateAttendance(
      itemUser.id,
      eventDate,
      sessionType,
      checkpointType,
      item.sessionId
    );

    if (existing) {
      results.push({
        idempotencyKey: item.idempotencyKey,
        status: 'duplicate',
        reason: `Attendance already confirmed for ${checkpointType} on ${eventDate}.`,
        record: existing,
      });
      continue;
    }

    // Verify submission against server rules
    const validation = validateAttendanceSubmission(itemUser.id, item);
    const finalStatus = validation.isValid ? 'confirmed' : 'rejected';

    const record = db.recordAttendance({
      idempotencyKey: item.idempotencyKey || `sync_${itemUser.id}_${Date.now()}`,
      userId: itemUser.id,
      userName: itemUser.fullName,
      userRole: itemUser.role,
      identifierCode: itemUser.identifierCode,
      sessionType,
      sessionId: item.sessionId,
      checkpointType,
      eventDate,
      capturedAt: item.capturedAt || new Date().toISOString(),
      serverVerifiedAt: new Date().toISOString(),
      status: finalStatus,
      rejectionReason: validation.rejectionReason,
      latitude: item.latitude,
      longitude: item.longitude,
      distanceMeters: validation.distanceMeters,
      locationAccuracy: item.locationAccuracy,
      faceDistance: Number(validation.faceDistance.toFixed(4)),
      isOfflineSubmission: true,
      syncedAt: new Date().toISOString(),
    });

    results.push({
      idempotencyKey: item.idempotencyKey,
      status: finalStatus,
      record,
      reason: validation.rejectionReason,
    });
  }

  return res.json({
    success: true,
    totalReceived: submissions.length,
    confirmed: results.filter((r) => r.status === 'confirmed').length,
    rejected: results.filter((r) => r.status === 'rejected').length,
    duplicates: results.filter((r) => r.status === 'duplicate').length,
    results,
  });
});

// GET /api/attendance/gate-status - Check if authenticated user must complete mandatory attendance
router.get('/gate-status', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  // Admin users are exempt from daily personal attendance gate
  if (user.role === 'admin') {
    return res.json({
      success: true,
      attendanceRequired: false,
      gateUnlocked: true,
      isEnrolled: true,
      todayAttendanceConfirmed: true,
      message: 'Admin accounts bypass daily attendance gate.',
    });
  }

  const enrollment = db.getEnrollmentByUserId(user.id);
  const isEnrolled = !!(enrollment && enrollment.isActive);
  const todayRecord = db.getTodayPersonalAttendance(user.id);
  const todayAttendanceConfirmed = !!todayRecord;
  const networkStatus = networkAuthService.validateNetwork(req);

  return res.json({
    success: true,
    attendanceRequired: true,
    gateUnlocked: todayAttendanceConfirmed,
    isEnrolled,
    enrollmentNote: user.enrollmentNote,
    todayAttendanceConfirmed,
    todayRecord: todayRecord || null,
    networkStatus,
  });
});

// POST /api/attendance/verify-personal-attendance - Mandatory Face & Network Attendance Flow
router.post('/verify-personal-attendance', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Authentication session required.' });
  }

  // Admin users are exempt from personal daily attendance gate
  if (user.role === 'admin') {
    return res.json({
      success: true,
      unlocked: true,
      message: 'Admin accounts are exempt from daily personal attendance gate.',
    });
  }

  const { faceDescriptor, latitude, longitude, locationAccuracy, livenessPassed, androidWifiPayload } = req.body;

  // 1. Server-side Network Validation (Campus Wi-Fi / CIDR / Demo)
  const networkResult = networkAuthService.validateNetwork(req, androidWifiPayload);
  if (!networkResult.verified) {
    db.addAuditLog(user.id, 'PERSONAL_ATTENDANCE_BLOCKED_NETWORK', 'FAILURE', {
      networkError: networkResult.error,
      clientIp: networkResult.clientIp,
    });
    return res.status(403).json({
      success: false,
      error: networkResult.error || 'Network verification failed. Connection to approved campus Wi-Fi network required.',
      networkStatus: networkResult,
    });
  }

  // 2. Biometric Enrollment Verification
  const enrollment = db.getEnrollmentByUserId(user.id);
  if (!enrollment || !enrollment.isActive) {
    return res.status(400).json({
      success: false,
      code: 'ENROLLMENT_REQUIRED',
      error: user.enrollmentNote || 'Biometric profile not enrolled. Genuine facial enrollment is required before attendance verification.',
    });
  }

  // 3. Biometric Descriptor Payload Validation
  if (!Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
    return res.status(400).json({
      success: false,
      error: 'Invalid or missing facial biometric vector. Live camera capture required.',
    });
  }

  // Reject fabricated, NaN, uniform, or flat vectors
  const hasInvalid = faceDescriptor.some((n) => typeof n !== 'number' || !Number.isFinite(n) || isNaN(n));
  const allIdentical = faceDescriptor.every((v) => Math.abs(v - faceDescriptor[0]) < 1e-7);
  const vectorNorm = Math.sqrt(faceDescriptor.reduce((sum, v) => sum + v * v, 0));
  if (hasInvalid || allIdentical || vectorNorm === 0) {
    return res.status(400).json({
      success: false,
      error: 'Fabricated or invalid biometric vector rejected. Genuine model capture required.',
    });
  }

  // 4A. Cross-Identity Impostor Check: Inspect if presented face matches another registered user's enrolled profile
  const allOtherEnrollments = db.getEnrollments().filter((e) => e.userId !== user.id && e.isActive);
  for (const otherEnrollment of allOtherEnrollments) {
    if (otherEnrollment.descriptor && Array.isArray(otherEnrollment.descriptor)) {
      const crossDistance = calculateEuclideanDistance(otherEnrollment.descriptor, faceDescriptor);
      if (crossDistance <= FACE_MATCH_THRESHOLD) {
        const otherUser = db.getUserById(otherEnrollment.userId);
        const otherName = otherUser ? otherUser.fullName : otherEnrollment.userId;
        const otherRole = otherUser ? otherUser.role.toUpperCase() : 'USER';

        db.addAuditLog(user.id, 'CROSS_IDENTITY_IMPOSTOR_ATTEMPT', 'FAILURE', {
          authenticatedUserId: user.id,
          authenticatedName: user.fullName,
          authenticatedRole: user.role,
          matchedUserId: otherEnrollment.userId,
          matchedName: otherName,
          matchedRole: otherRole,
          crossDistance: Number(crossDistance.toFixed(4)),
          threshold: FACE_MATCH_THRESHOLD,
        });

        return res.status(403).json({
          success: false,
          code: 'CROSS_IDENTITY_MISMATCH',
          error: `Cross-identity mismatch rejected: The detected face matches ${otherName} (${otherRole}), not the enrolled profile for the authenticated account (${user.fullName}, ${user.role.toUpperCase()}). Attendance cannot be recorded for another person's biometric identity.`,
          crossDistance: Number(crossDistance.toFixed(4)),
        });
      }
    }
  }

  // 4B. Biometric Face Distance Matching against Authenticated Account's Enrolled Reference
  const faceDistance = calculateEuclideanDistance(enrollment.descriptor, faceDescriptor);
  if (faceDistance > FACE_MATCH_THRESHOLD) {
    db.addAuditLog(user.id, 'PERSONAL_ATTENDANCE_FACE_MISMATCH', 'FAILURE', {
      faceDistance: Number(faceDistance.toFixed(4)),
      threshold: FACE_MATCH_THRESHOLD,
    });
    return res.status(401).json({
      success: false,
      code: 'FACE_MISMATCH',
      error: `Facial identity verification failed (Distance: ${faceDistance.toFixed(3)} >= ${FACE_MATCH_THRESHOLD}). Face did not match enrolled profile for ${user.fullName}.`,
      faceDistance: Number(faceDistance.toFixed(4)),
    });
  }

  // 5. Basic guided liveness validation
  if (livenessPassed === false) {
    return res.status(400).json({
      success: false,
      error: 'Guided liveness challenge failed. Please complete the prompt (e.g. natural blink or subtle head turn).',
    });
  }

  const today = getCampusLocalDate();

  // 6. Check existing personal attendance for today (Duplicate Prevention)
  const existingRecord = db.getTodayPersonalAttendance(user.id, today);
  if (existingRecord) {
    db.addAuditLog(user.id, 'PERSONAL_ATTENDANCE_CONFIRMED_SESSION', 'SUCCESS', {
      attendanceId: existingRecord.id,
      reverified: true,
      networkMode: networkResult.mode,
    });

    return res.json({
      success: true,
      unlocked: true,
      alreadyRecorded: true,
      message: `Welcome back, ${user.fullName}. Today's attendance is already confirmed (${existingRecord.capturedAt}).`,
      record: existingRecord,
      networkStatus: networkResult,
    });
  }

  // 7. Record new Personal Attendance
  const campus = db.getCampusConfig();
  const distMeters = (latitude !== undefined && longitude !== undefined)
    ? calculateHaversineDistance(campus.latitude, campus.longitude, latitude, longitude)
    : 0;

  const record = db.recordAttendance({
    idempotencyKey: `pers_${user.id}_${today}`,
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
    latitude: latitude || campus.latitude,
    longitude: longitude || campus.longitude,
    distanceMeters: distMeters,
    locationAccuracy: locationAccuracy || 10,
    faceDistance: Number(faceDistance.toFixed(4)),
    isOfflineSubmission: false,
  });

  return res.json({
    success: true,
    unlocked: true,
    alreadyRecorded: false,
    message: `Personal attendance verified & recorded successfully for ${user.fullName}. Dashboard unlocked.`,
    record,
    networkStatus: networkResult,
  });
});

// POST /api/attendance/manual-review - Submit a review request for camera/mismatch exceptions
router.post('/manual-review', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const { reason, photoSnapshot } = req.body;
  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    return res.status(400).json({
      success: false,
      error: 'Please provide a clear reason for administrative review (minimum 5 characters).',
    });
  }

  const review = db.createManualReview(user.id, reason.trim(), photoSnapshot);
  return res.json({
    success: true,
    message: 'Manual review request submitted to Campus Security & Administration. An authorized administrator will inspect your case.',
    review,
  });
});

// GET /api/attendance/manual-reviews - List review requests (Admin only)
router.get('/manual-reviews', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Forbidden. Admin access required.' });
  }

  const reviews = db.getManualReviews();
  return res.json({ success: true, reviews });
});

// POST /api/attendance/manual-reviews/:id/resolve - Resolve review request (Admin only)
router.post('/manual-reviews/:id/resolve', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Forbidden. Admin access required.' });
  }

  const { id } = req.params;
  const { approved, notes } = req.body;

  const result = db.resolveManualReview(id, !!approved, user.id, notes);
  if (!result) {
    return res.status(404).json({ success: false, error: 'Review request not found.' });
  }

  return res.json({
    success: true,
    message: `Review request ${id} ${approved ? 'approved' : 'rejected'}.`,
    review: result,
  });
});

// GET /api/attendance/network-status - Public network configuration
router.get('/network-status', (req: Request, res: Response) => {
  const config = networkAuthService.getPublicNetworkConfig();
  const clientValidation = networkAuthService.validateNetwork(req);
  return res.json({
    success: true,
    config,
    clientValidation,
  });
});

export default router;
