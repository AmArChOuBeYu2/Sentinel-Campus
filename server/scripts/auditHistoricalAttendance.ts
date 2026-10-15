import fs from 'fs';
import path from 'path';
import { calculateEuclideanDistance } from '../db';

interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  sessionType: string;
  checkpointType: string;
  eventDate: string;
  capturedAt: string;
  status: string;
  rejectionReason?: string;
}

interface UserRecord {
  id: string;
  fullName: string;
  role: string;
  email: string;
  isEnrolled: boolean;
  enrollmentNote?: string;
}

interface BiometricEnrollmentRecord {
  id: string;
  userId: string;
  descriptor: number[];
  isActive: boolean;
  enrolledAt: string;
  consentGiven: boolean;
}

export interface SuspiciousAuditResult {
  id: string;
  userId: string;
  recordedName: string;
  expectedName: string;
  recordedRole: string;
  expectedRole: string;
  sessionType: string;
  checkpointType: string;
  eventDate: string;
  capturedAt: string;
  status: string;
  reasons: string[];
}

export interface SuspiciousEnrollmentResult {
  enrollmentId: string;
  userId: string;
  userName: string;
  reasons: string[];
}

export function auditHistoricalAttendance(dbFilePath?: string): {
  totalRecords: number;
  suspiciousCount: number;
  results: SuspiciousAuditResult[];
  enrollmentIssues: SuspiciousEnrollmentResult[];
} {
  const filePath = dbFilePath || path.resolve(process.cwd(), 'server', 'data', 'db.json');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const users: UserRecord[] = raw.users || [];
  const attendance: AttendanceRecord[] = raw.attendance || [];
  const enrollments: BiometricEnrollmentRecord[] = raw.biometricEnrollments || [];

  const userMap = new Map(users.map((u) => [u.id, u]));
  const results: SuspiciousAuditResult[] = [];
  const confirmedPersonalMap = new Map<string, string>(); // key: `${userId}_${eventDate}` -> id

  for (const record of attendance) {
    const user = userMap.get(record.userId);
    const reasons: string[] = [];

    if (!user) {
      if (!record.userId.startsWith('test_')) {
        reasons.push(`Orphaned user ID '${record.userId}' not found in registered campus profiles`);
      }
    } else {
      if (record.userName !== user.fullName) {
        reasons.push(
          `Cross-identity mismatch: recorded as '${record.userName}', but registered user is '${user.fullName}'`
        );
      }
      if (record.userRole !== user.role) {
        reasons.push(
          `Role mismatch: recorded as role '${record.userRole}', but registered role is '${user.role}'`
        );
      }
      if (user.role === 'teacher' && record.sessionType === 'daily_staff') {
        reasons.push(
          `Cross-role anomaly: Teacher account marked with 'daily_staff' attendance instead of 'daily_personal'`
        );
      }
      if (user.role === 'student' && record.sessionType === 'daily_staff') {
        reasons.push(
          `Cross-role anomaly: Student account marked with 'daily_staff' attendance`
        );
      }
      if (user.role === 'staff' && record.sessionType === 'class_session') {
        reasons.push(
          `Cross-role anomaly: Staff account marked with 'class_session' attendance as student`
        );
      }
    }

    // Check for duplicate confirmed personal attendance (daily_personal or daily_staff) per user per eventDate
    if (
      record.status === 'confirmed' &&
      (record.sessionType === 'daily_personal' || record.sessionType === 'daily_staff')
    ) {
      const personalKey = `${record.userId}_${record.eventDate}`;
      if (confirmedPersonalMap.has(personalKey)) {
        reasons.push(
          `Duplicate personal attendance: User already has confirmed personal attendance (${confirmedPersonalMap.get(
            personalKey
          )}) on date ${record.eventDate}`
        );
      } else {
        confirmedPersonalMap.set(personalKey, record.id);
      }
    }

    if (reasons.length > 0) {
      results.push({
        id: record.id,
        userId: record.userId,
        recordedName: record.userName,
        expectedName: user ? user.fullName : 'UNKNOWN_ORPHAN',
        recordedRole: record.userRole,
        expectedRole: user ? user.role : 'UNKNOWN_ORPHAN',
        sessionType: record.sessionType,
        checkpointType: record.checkpointType,
        eventDate: record.eventDate,
        capturedAt: record.capturedAt,
        status: record.status,
        reasons,
      });
    }
  }

  // Audit Biometric Enrollments for Cross-Identity Collisions & Ineligible AI References
  const enrollmentIssues: SuspiciousEnrollmentResult[] = [];
  const activeEnrollments = enrollments.filter((e) => e.isActive && Array.isArray(e.descriptor));

  for (let i = 0; i < activeEnrollments.length; i++) {
    const enrA = activeEnrollments[i];
    const userA = userMap.get(enrA.userId);
    const enrReasons: string[] = [];

    // AI-generated check for Amar Choubey
    if (enrA.userId === 'usr_tch_0001') {
      enrReasons.push('AI-generated reference image (Amar.png) requires manual in-person admin verification.');
    }

    // Cross-identity collision check against other active enrollments
    for (let j = 0; j < activeEnrollments.length; j++) {
      if (i === j) continue;
      const enrB = activeEnrollments[j];
      if (enrA.userId !== enrB.userId) {
        const dist = calculateEuclideanDistance(enrA.descriptor, enrB.descriptor);
        if (dist <= 0.55) {
          const userB = userMap.get(enrB.userId);
          enrReasons.push(
            `Cross-identity biometric collision: Descriptor matches ${userB?.fullName || enrB.userId} (${dist.toFixed(
              3
            )} <= 0.55)`
          );
        }
      }
    }

    if (enrReasons.length > 0) {
      enrollmentIssues.push({
        enrollmentId: enrA.id,
        userId: enrA.userId,
        userName: userA ? userA.fullName : enrA.userId,
        reasons: enrReasons,
      });
    }
  }

  return {
    totalRecords: attendance.length,
    suspiciousCount: results.length,
    results,
    enrollmentIssues,
  };
}

export function repairHistoricalAttendance(dbFilePath?: string): {
  repairedCount: number;
  repairs: Array<{ id: string; field: string; from: string; to: string }>;
  invalidatedEnrollments: string[];
} {
  const filePath = dbFilePath || path.resolve(process.cwd(), 'server', 'data', 'db.json');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const repairs: Array<{ id: string; field: string; from: string; to: string }> = [];
  const invalidatedEnrollments: string[] = [];

  const confirmedPersonalMap = new Map<string, string>();

  // 1. Repair attendance ledger records
  for (const record of raw.attendance || []) {
    // Correct anomalous Teacher sessionType
    if (record.userId === 'usr_tch_0001' && record.sessionType === 'daily_staff') {
      record.sessionType = 'daily_personal';
      repairs.push({ id: record.id, field: 'sessionType', from: 'daily_staff', to: 'daily_personal' });
    }
    // Correct anomalous Sudhanshu name
    if (record.userId === 'usr_sta_0001' && record.userName === 'Er. Priya Mehta') {
      record.userName = 'Sudhanshu Kumar';
      repairs.push({ id: record.id, field: 'userName', from: 'Er. Priya Mehta', to: 'Sudhanshu Kumar' });
    }
    // Correct anomalous Amar name on student ID
    if (record.id === 'att_seed_stu_1' && record.userName === 'Amar Choubey') {
      record.userName = 'Krishna Jha';
      repairs.push({ id: record.id, field: 'userName', from: 'Amar Choubey', to: 'Krishna Jha' });
    }

    // Deduplicate duplicate personal attendance writes
    if (
      record.status === 'confirmed' &&
      (record.sessionType === 'daily_personal' || record.sessionType === 'daily_staff')
    ) {
      const key = `${record.userId}_${record.eventDate}`;
      if (confirmedPersonalMap.has(key)) {
        // Mark subsequent duplicates with status 'duplicate' (never delete)
        record.status = 'duplicate';
        record.rejectionReason = `Duplicate personal attendance: Already confirmed in record ${confirmedPersonalMap.get(
          key
        )} on ${record.eventDate}`;
        repairs.push({ id: record.id, field: 'status', from: 'confirmed', to: 'duplicate' });
      } else {
        confirmedPersonalMap.set(key, record.id);
      }
    }
  }

  // 2. Invalidate corrupted / cross-identity / AI-generated enrollments
  const enrollments: BiometricEnrollmentRecord[] = raw.biometricEnrollments || [];
  for (const enr of enrollments) {
    if (enr.isActive) {
      // Invalidate Sudhanshu's enrollment (collides with Amar Choubey)
      if (enr.userId === 'usr_sta_0001') {
        enr.isActive = false;
        invalidatedEnrollments.push(enr.id);
        const u = (raw.users || []).find((usr: any) => usr.id === 'usr_sta_0001');
        if (u) {
          u.isEnrolled = false;
          u.enrollmentNote =
            'Previous enrollment was invalidated due to cross-identity mismatch with Amar Choubey (Teacher). Controlled re-enrollment required.';
        }
      }
      // Invalidate Amar's enrollment (AI-generated reference)
      if (enr.userId === 'usr_tch_0001') {
        enr.isActive = false;
        invalidatedEnrollments.push(enr.id);
        const u = (raw.users || []).find((usr: any) => usr.id === 'usr_tch_0001');
        if (u) {
          u.isEnrolled = false;
          u.enrollmentNote =
            'Reference image is AI-generated (Amar.png). Ineligible for biometric enrollment until verified in-person by an administrator.';
        }
      }
    }
  }

  if (repairs.length > 0 || invalidatedEnrollments.length > 0) {
    if (!raw.auditLogs) raw.auditLogs = [];
    raw.auditLogs.unshift({
      id: `aud_repair_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: 'usr_adm_0001',
      action: 'HISTORICAL_ATTENDANCE_AND_ENROLLMENT_REPAIRED',
      status: 'SUCCESS',
      details: {
        repairsCount: repairs.length,
        repairs,
        invalidatedEnrollmentsCount: invalidatedEnrollments.length,
        invalidatedEnrollments,
      },
    });
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2), 'utf-8');
  }

  return {
    repairedCount: repairs.length,
    repairs,
    invalidatedEnrollments,
  };
}

if (process.argv[1]?.includes('auditHistoricalAttendance')) {
  const isRepair = process.argv.includes('--repair');
  if (isRepair) {
    const res = repairHistoricalAttendance();
    console.log(
      `✅ Repaired ${res.repairedCount} anomalous historical attendance records and invalidated ${res.invalidatedEnrollments.length} compromised enrollments with audit trail.`
    );
  } else {
    const audit = auditHistoricalAttendance();
    console.log('========================================================');
    console.log('🔍 SENTINEL CAMPUS: HISTORICAL ATTENDANCE & ENROLLMENT AUDIT');
    console.log('========================================================');
    console.log(`Total Attendance Records Inspected: ${audit.totalRecords}`);
    console.log(`Suspicious Records Flagged: ${audit.suspiciousCount}`);
    console.log(`Compromised / Ineligible Enrollments Flagged: ${audit.enrollmentIssues.length}\n`);

    if (audit.results.length > 0) {
      console.log('--- Flagged Attendance Records ---');
      audit.results.forEach((r, idx) => {
        console.log(`[${idx + 1}] ID: ${r.id} | User: ${r.userId} (${r.expectedName})`);
        console.log(`    Date: ${r.eventDate} | Session: ${r.sessionType} | Status: ${r.status}`);
        console.log(`    Recorded as: '${r.recordedName}' (${r.recordedRole})`);
        console.log(`    Reasons:`);
        r.reasons.forEach((reason) => console.log(`      - ${reason}`));
        console.log('');
      });
    }

    if (audit.enrollmentIssues.length > 0) {
      console.log('--- Flagged Biometric Enrollments ---');
      audit.enrollmentIssues.forEach((e, idx) => {
        console.log(`[${idx + 1}] Enrollment ID: ${e.enrollmentId} | User: ${e.userId} (${e.userName})`);
        e.reasons.forEach((r) => console.log(`      - ${r}`));
        console.log('');
      });
    }

    console.log('Run with --repair to apply auditable corrections.');
  }
}
