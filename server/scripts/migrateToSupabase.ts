import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { getSupabaseClient, testSupabaseConnectivity } from '../services/supabaseClient';
import { DatabaseSchema } from '../db';

export interface MigrationSummary {
  collection: string;
  sourceCount: number;
  migratedCount: number;
  skippedCount: number;
  conflictCount: number;
  errors: string[];
}

export async function runMigration(options?: {
  sourceFilePath?: string;
  dryRun?: boolean;
}): Promise<{
  success: boolean;
  backupPath: string;
  summaries: MigrationSummary[];
  overallError?: string;
}> {
  const sourceFile =
    options?.sourceFilePath || path.resolve(process.cwd(), 'server', 'data', 'db.json');
  const backupPath = `${sourceFile}.backup`;

  console.log('\n📦 ========================================================');
  console.log('📦 SENTINEL CAMPUS: SUPABASE IDEMPOTENT MIGRATION TOOL');
  console.log('📦 ========================================================\n');

  // 1. Backup Source JSON File
  if (!fs.existsSync(sourceFile)) {
    return {
      success: false,
      backupPath: '',
      summaries: [],
      overallError: `Source JSON file not found at ${sourceFile}`,
    };
  }

  try {
    fs.copyFileSync(sourceFile, backupPath);
    console.log(`🛡️  Step 1: Verified source backup created at:\n    ${backupPath}\n`);
  } catch (err: unknown) {
    const e = err as Error;
    return {
      success: false,
      backupPath: '',
      summaries: [],
      overallError: `Failed to create backup: ${e.message}`,
    };
  }

  // 2. Validate Supabase Client & Connectivity
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      backupPath,
      summaries: [],
      overallError:
        'Supabase client is not configured. Please define SUPABASE_URL and SUPABASE_SECRET_KEY in .env.',
    };
  }

  const conn = await testSupabaseConnectivity();
  if (!conn.connected) {
    return {
      success: false,
      backupPath,
      summaries: [],
      overallError: `Supabase connectivity check failed: ${conn.error}`,
    };
  }

  if (!conn.tablesFound && !options?.dryRun) {
    return {
      success: false,
      backupPath,
      summaries: [],
      overallError:
        'Connected to Supabase endpoint, but required database tables do not exist yet.\n' +
        'Please run the migration SQL file first in your Supabase Dashboard SQL Editor:\n' +
        '-> supabase/migrations/20261015000001_initial_schema.sql',
    };
  }

  if (conn.tablesFound) {
    console.log('✅ Step 2: Supabase connectivity and schema tables verified.\n');
  } else {
    console.log('🔍 Step 2: Supabase connected (Schema tables pending creation in SQL Editor - Dry Run Mode).\n');
  }

  // 3. Read Source Data
  let rawData: DatabaseSchema;
  try {
    const fileContent = fs.readFileSync(sourceFile, 'utf-8');
    rawData = JSON.parse(fileContent);
  } catch (err: unknown) {
    const e = err as Error;
    return {
      success: false,
      backupPath,
      summaries: [],
      overallError: `Failed to parse ${sourceFile}: ${e.message}`,
    };
  }

  const summaries: MigrationSummary[] = [];
  const validUserIds = new Set((rawData.users || []).map((u) => u.id));

  // Helper for batch upserts
  async function migrateCollection<T>(
    collectionName: string,
    tableName: string,
    records: T[],
    mapFn: (item: T) => Record<string, unknown>,
    idField: string = 'id',
    filterFn?: (item: T) => { accept: boolean; reason?: string }
  ): Promise<MigrationSummary> {
    const summary: MigrationSummary = {
      collection: collectionName,
      sourceCount: records.length,
      migratedCount: 0,
      skippedCount: 0,
      conflictCount: 0,
      errors: [],
    };

    if (records.length === 0) {
      summaries.push(summary);
      console.log(`ℹ️  [${collectionName}] 0 records in source file (skipped)`);
      return summary;
    }

    for (const record of records) {
      if (filterFn) {
        const filterResult = filterFn(record);
        if (!filterResult.accept) {
          summary.skippedCount++;
          continue;
        }
      }

      if (options?.dryRun) {
        summary.migratedCount++;
        continue;
      }

      try {
        const payload = mapFn(record);
        const { error } = await client!.from(tableName).upsert(payload, {
          onConflict: idField,
        });

        if (error) {
          summary.conflictCount++;
          summary.errors.push(`Record ${payload[idField] || 'unknown'}: ${error.message}`);
        } else {
          summary.migratedCount++;
        }
      } catch (err: unknown) {
        const e = err as Error;
        summary.conflictCount++;
        summary.errors.push(`Record execution error: ${e.message}`);
      }
    }

    if (options?.dryRun) {
      console.log(
        `🔍 [DRY RUN] [${collectionName}] Source: ${summary.sourceCount} | Verified: ${summary.migratedCount} | Skipped: ${summary.skippedCount}`
      );
    } else {
      console.log(
        `  [${collectionName}] Source: ${summary.sourceCount} | Migrated: ${summary.migratedCount} | Skipped: ${summary.skippedCount} | Conflicts: ${summary.conflictCount}`
      );
    }
    summaries.push(summary);
    return summary;
  }

  // --- Step 3A: Campus Config ---
  if (rawData.campusConfig) {
    await migrateCollection(
      'Campus Config',
      'campus_config',
      [rawData.campusConfig],
      (c) => ({
        id: 'default',
        campus_name: c.campusName,
        campus_code: c.campusCode,
        latitude: c.latitude,
        longitude: c.longitude,
        radius_meters: c.radiusMeters,
        max_accuracy_meters: c.maxAccuracyMeters,
        wifi_enabled: c.wifiEnabled,
        wifi_trusted_ssids: c.wifiTrustedSSIDs,
        updated_at: c.updatedAt || new Date().toISOString(),
      }),
      'id'
    );
  }

  // --- Step 3B: Profiles (Users) ---
  await migrateCollection(
    'Users / Profiles',
    'profiles',
    rawData.users || [],
    (u) => ({
      id: u.id,
      email: u.email,
      phone: u.phone || '',
      full_name: u.fullName,
      role: u.role,
      department: u.department || '',
      identifier_code: u.identifierCode,
      secondary_email: u.secondaryEmail || null,
      semester: u.semester || null,
      section: u.section || null,
      credential_status: u.credentialStatus || 'provisional_pending_configuration',
      email_verified: Boolean(u.emailVerified),
      phone_verified: Boolean(u.phoneVerified),
      is_active: u.isActive !== false,
      is_enrolled: Boolean(u.isEnrolled),
      enrollment_note: u.enrollmentNote || null,
      created_at: u.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    'id',
    (u) => {
      if (!u.emailVerified) {
        console.log(`  [Notice] Seeded user ${u.fullName} (${u.id}) has unverified email: ${u.email} (persisting as email_verified: false)`);
      }
      return { accept: true };
    }
  );

  // --- Step 3C: Biometric Enrollments ---
  // Safely guard against synthetic/test descriptors or orphaned enrollments
  await migrateCollection(
    'Biometric Enrollments',
    'biometric_enrollments',
    rawData.enrollments || [],
    (e) => ({
      id: e.id,
      user_id: e.userId,
      descriptor: e.descriptor,
      consent_given: e.consentGiven !== false,
      consent_statement: e.consentStatement || 'Supervised biometric enrollment consent',
      enrolled_at: e.enrolledAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: e.isActive !== false,
    }),
    'id',
    (e) => {
      if (!validUserIds.has(e.userId) || e.userId.startsWith('test_')) {
        return { accept: false, reason: `Orphaned/test user ${e.userId}` };
      }
      if (!e.descriptor || !Array.isArray(e.descriptor) || e.descriptor.length !== 128) {
        return { accept: false, reason: `Invalid descriptor dimensions for ${e.userId}` };
      }
      return { accept: true };
    }
  );

  // --- Step 3D: Class Sessions ---
  await migrateCollection(
    'Class Sessions',
    'class_sessions',
    rawData.classes || [],
    (c) => ({
      id: c.id,
      course_code: c.courseCode,
      course_name: c.courseName,
      instructor_id: c.instructorId || null,
      instructor_name: c.instructorName || '',
      room_number: c.roomNumber,
      section: (c as any).section || '',
      session_date: c.sessionDate || new Date().toISOString().split('T')[0],
      start_time: c.startTime,
      end_time: c.endTime,
      cp1_start: c.cp1Start,
      cp1_end: c.cp1End,
      cp2_start: c.cp2Start,
      cp2_end: c.cp2End,
      is_active: c.isActive !== false,
      enrolled_student_ids: (c as any).enrolledStudentIds || [],
      created_at: new Date().toISOString(),
    }),
    'id'
  );

  // --- Step 3E: Attendance Events ---
  await migrateCollection(
    'Attendance Events',
    'attendance_events',
    rawData.attendance || [],
    (a) => ({
      id: a.id,
      idempotency_key: a.idempotencyKey,
      user_id: a.userId,
      user_name: a.userName,
      user_role: a.userRole,
      identifier_code: a.identifierCode,
      session_type: a.sessionType,
      session_id: a.sessionId || null,
      checkpoint_type: a.checkpointType,
      event_date: a.eventDate,
      captured_at: a.capturedAt,
      server_verified_at: a.serverVerifiedAt,
      status: a.status,
      rejection_reason: a.rejectionReason || null,
      latitude: a.latitude || null,
      longitude: a.longitude || null,
      distance_meters: a.distanceMeters || null,
      location_accuracy: a.locationAccuracy || null,
      face_distance: a.faceDistance || null,
      presence_key_used: a.presenceKeyUsed || null,
      is_offline_submission: Boolean(a.isOfflineSubmission),
      synced_at: a.syncedAt || null,
      audit_hash: a.auditHash || null,
      created_at: a.serverVerifiedAt || new Date().toISOString(),
    }),
    'id',
    (a) => {
      if (!validUserIds.has(a.userId) || a.userId.startsWith('test_')) {
        return { accept: false, reason: `Orphaned/test user ${a.userId}` };
      }
      return { accept: true };
    }
  );

  // --- Step 3F: QR Sessions ---
  await migrateCollection(
    'QR Sessions',
    'qr_sessions',
    rawData.qrSessions || [],
    (q) => ({
      id: q.id,
      token: q.token,
      class_id: q.classId,
      course_code: q.courseCode,
      course_name: q.courseName,
      teacher_id: q.teacherId,
      teacher_name: q.teacherName,
      checkpoint_type: q.checkpointType,
      created_at: q.createdAt,
      expires_at: q.expiresAt,
      isActive: q.isActive,
      captures: q.captures || [],
    }),
    'id'
  );

  // --- Step 3G: Manual Reviews ---
  await migrateCollection(
    'Manual Reviews',
    'manual_reviews',
    rawData.manualReviews || [],
    (m) => ({
      id: m.id,
      user_id: m.userId,
      user_name: m.userName,
      user_role: m.userRole,
      identifier_code: m.identifierCode,
      reason: m.reason,
      photo_snapshot: m.photoSnapshot || null,
      created_at: m.createdAt,
      status: m.status,
      resolved_at: m.resolvedAt || null,
      resolved_by: m.resolvedBy || null,
      admin_notes: m.adminNotes || null,
    }),
    'id'
  );

  // --- Step 3H: Audit Logs ---
  await migrateCollection(
    'Audit Logs',
    'audit_logs',
    rawData.auditLogs || [],
    (l) => ({
      id: l.id,
      timestamp: l.timestamp,
      actor_id: l.actorId || null,
      action: l.action,
      target_id: l.targetId || null,
      status: l.status,
      details: l.details || {},
      ip_address: l.ipAddress || null,
    }),
    'id'
  );

  const totalSource = summaries.reduce((acc, s) => acc + s.sourceCount, 0);
  const totalMigrated = summaries.reduce((acc, s) => acc + s.migratedCount, 0);
  const totalConflicts = summaries.reduce((acc, s) => acc + s.conflictCount, 0);

  console.log('\n========================================================');
  console.log(
    `📊 MIGRATION SUMMARY: Total Source: ${totalSource} | Successfully Migrated: ${totalMigrated} | Conflicts: ${totalConflicts}`
  );
  console.log('========================================================\n');

  return {
    success: totalConflicts === 0,
    backupPath,
    summaries,
  };
}

// CLI Execution if invoked directly
if (process.argv[1]?.includes('migrateToSupabase')) {
  runMigration().then((result) => {
    if (!result.success) {
      if (result.overallError) {
        console.error('❌ Migration Error:', result.overallError);
      }
      process.exit(1);
    } else {
      console.log('🎉 Migration completed successfully.');
      process.exit(0);
    }
  });
}
