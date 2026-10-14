import fs from 'fs';
import path from 'path';

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

export function auditHistoricalAttendance(dbFilePath?: string): {
  totalRecords: number;
  suspiciousCount: number;
  results: SuspiciousAuditResult[];
} {
  const filePath = dbFilePath || path.resolve(process.cwd(), 'server', 'data', 'db.json');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const users: UserRecord[] = raw.users || [];
  const attendance: AttendanceRecord[] = raw.attendance || [];

  const userMap = new Map(users.map((u) => [u.id, u]));
  const results: SuspiciousAuditResult[] = [];

  for (const record of attendance) {
    const user = userMap.get(record.userId);
    const reasons: string[] = [];

    if (!user) {
      // Ephemeral test user or orphan
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

  return {
    totalRecords: attendance.length,
    suspiciousCount: results.length,
    results,
  };
}

export function repairHistoricalAttendance(dbFilePath?: string): {
  repairedCount: number;
  repairs: Array<{ id: string; field: string; from: string; to: string }>;
} {
  const filePath = dbFilePath || path.resolve(process.cwd(), 'server', 'data', 'db.json');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const repairs: Array<{ id: string; field: string; from: string; to: string }> = [];

  for (const record of raw.attendance || []) {
    // 1. Repair att_31bb51d0-c (Teacher sessionType)
    if (record.id === 'att_31bb51d0-c' && record.sessionType === 'daily_staff') {
      record.sessionType = 'daily_personal';
      repairs.push({ id: record.id, field: 'sessionType', from: 'daily_staff', to: 'daily_personal' });
    }
    // 2. Repair att_e693dba0-b (Sudhanshu name)
    if (record.id === 'att_e693dba0-b' && record.userName === 'Er. Priya Mehta') {
      record.userName = 'Sudhanshu Kumar';
      repairs.push({ id: record.id, field: 'userName', from: 'Er. Priya Mehta', to: 'Sudhanshu Kumar' });
    }
    // 3. Repair att_seed_tch_1 (Amar name & sessionType)
    if (record.id === 'att_seed_tch_1') {
      if (record.userName === 'Dr. Rajesh Sharma') {
        record.userName = 'Amar Choubey';
        repairs.push({ id: record.id, field: 'userName', from: 'Dr. Rajesh Sharma', to: 'Amar Choubey' });
      }
      if (record.sessionType === 'daily_staff') {
        record.sessionType = 'daily_personal';
        repairs.push({ id: record.id, field: 'sessionType', from: 'daily_staff', to: 'daily_personal' });
      }
    }
    // 4. Repair att_seed_stu_1 (Krishna name)
    if (record.id === 'att_seed_stu_1' && record.userName === 'Amar Choubey') {
      record.userName = 'Krishna Jha';
      repairs.push({ id: record.id, field: 'userName', from: 'Amar Choubey', to: 'Krishna Jha' });
    }
  }

  if (repairs.length > 0) {
    if (!raw.auditLogs) raw.auditLogs = [];
    raw.auditLogs.unshift({
      id: `aud_repair_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: 'usr_adm_0001',
      action: 'HISTORICAL_ATTENDANCE_REPAIRED',
      status: 'SUCCESS',
      details: { repairsCount: repairs.length, repairs },
    });
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2), 'utf-8');
  }

  return {
    repairedCount: repairs.length,
    repairs,
  };
}

if (process.argv[1]?.includes('auditHistoricalAttendance')) {
  const isRepair = process.argv.includes('--repair');
  if (isRepair) {
    const res = repairHistoricalAttendance();
    console.log(`✅ Repaired ${res.repairedCount} anomalous historical attendance records with audit trail.`);
  } else {
    const audit = auditHistoricalAttendance();
    console.log('========================================================');
    console.log('🔍 SENTINEL CAMPUS: HISTORICAL ATTENDANCE AUDIT REPORT');
    console.log('========================================================');
    console.log(`Total Attendance Records Inspected: ${audit.totalRecords}`);
    console.log(`Suspicious Records Flagged: ${audit.suspiciousCount}\n`);

    audit.results.forEach((r, idx) => {
      console.log(`[${idx + 1}] ID: ${r.id} | User: ${r.userId} (${r.expectedName})`);
      console.log(`    Date: ${r.eventDate} | Session: ${r.sessionType} | Status: ${r.status}`);
      console.log(`    Recorded as: '${r.recordedName}' (${r.recordedRole})`);
      console.log(`    Reasons:`);
      r.reasons.forEach((reason) => console.log(`      - ${reason}`));
      console.log('');
    });
    console.log('Run with --repair to apply auditable corrections.');
  }
}
