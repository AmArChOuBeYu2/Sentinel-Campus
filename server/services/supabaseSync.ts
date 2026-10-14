import { getSupabaseClient } from './supabaseClient';
import {
  UserProfile,
  BiometricEnrollment,
  CampusConfig,
  ClassSession,
  AttendanceEvent,
  QRSession,
  ManualReviewRequest,
  AuditLog,
  DatabaseSchema,
} from '../db';

export class SupabaseSyncService {
  private client = getSupabaseClient();

  isEnabled(): boolean {
    const driver = process.env.STORAGE_DRIVER;
    if (driver === 'file') return false;
    return Boolean(this.client);
  }

  async loadFromSupabase(): Promise<DatabaseSchema | null> {
    if (!this.client || !this.isEnabled()) return null;

    try {
      const [
        profilesRes,
        enrollmentsRes,
        configRes,
        classesRes,
        attendanceRes,
        qrRes,
        reviewsRes,
        auditRes,
      ] = await Promise.all([
        this.client.from('profiles').select('*'),
        this.client.from('biometric_enrollments').select('*').eq('is_active', true),
        this.client.from('campus_config').select('*').eq('id', 'default').single(),
        this.client.from('class_sessions').select('*'),
        this.client.from('attendance_events').select('*'),
        this.client.from('qr_sessions').select('*'),
        this.client.from('manual_reviews').select('*'),
        this.client.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(500),
      ]);

      if (profilesRes.error) {
        return null;
      }

      const users: UserProfile[] = (profilesRes.data || []).map((p: any) => ({
        id: p.id,
        email: p.email,
        phone: p.phone || '',
        fullName: p.full_name,
        role: p.role,
        department: p.department || '',
        identifierCode: p.identifier_code,
        secondaryEmail: p.secondary_email || undefined,
        semester: p.semester || undefined,
        section: p.section || undefined,
        credentialStatus: p.credential_status,
        emailVerified: p.email_verified,
        phoneVerified: p.phone_verified,
        isActive: p.is_active,
        isEnrolled: p.is_enrolled,
        enrollmentNote: p.enrollment_note || undefined,
        createdAt: p.created_at,
      }));

      const enrollments: BiometricEnrollment[] = (enrollmentsRes.data || []).map((e: any) => ({
        id: e.id,
        userId: e.user_id,
        descriptor: e.descriptor,
        consentGiven: e.consent_given,
        consentStatement: e.consent_statement,
        enrolledAt: e.enrolled_at,
        isActive: e.is_active,
      }));

      const campusConfig: CampusConfig = configRes.data
        ? {
            campusName: configRes.data.campus_name,
            campusCode: configRes.data.campus_code,
            latitude: configRes.data.latitude,
            longitude: configRes.data.longitude,
            radiusMeters: configRes.data.radius_meters,
            maxAccuracyMeters: configRes.data.max_accuracy_meters,
            wifiEnabled: configRes.data.wifi_enabled,
            wifiTrustedSSIDs: configRes.data.wifi_trusted_ssids || [],
            updatedAt: configRes.data.updated_at,
          }
        : ({} as any);

      const classes: ClassSession[] = (classesRes.data || []).map((c: any) => ({
        id: c.id,
        courseCode: c.course_code,
        courseName: c.course_name,
        instructorId: c.instructor_id,
        instructorName: c.instructor_name || '',
        roomNumber: c.room_number,
        sessionDate: c.session_date,
        startTime: c.start_time,
        endTime: c.end_time,
        sessionCategory: 'Lecture',
        cp1Start: c.cp1_start,
        cp1End: c.cp1_end,
        cp2Start: c.cp2_start,
        cp2End: c.cp2_end,
        isActive: c.is_active,
      }));

      const attendance: AttendanceEvent[] = (attendanceRes.data || []).map((a: any) => ({
        id: a.id,
        idempotencyKey: a.idempotency_key,
        userId: a.user_id,
        userName: a.user_name,
        userRole: a.user_role,
        identifierCode: a.identifier_code,
        sessionType: a.session_type,
        sessionId: a.session_id || undefined,
        checkpointType: a.checkpoint_type,
        eventDate: a.event_date,
        capturedAt: a.captured_at,
        serverVerifiedAt: a.server_verified_at,
        status: a.status,
        rejectionReason: a.rejection_reason || undefined,
        latitude: a.latitude || undefined,
        longitude: a.longitude || undefined,
        distanceMeters: a.distance_meters || undefined,
        locationAccuracy: a.location_accuracy || undefined,
        faceDistance: a.face_distance || undefined,
        presenceKeyUsed: a.presence_key_used || undefined,
        isOfflineSubmission: a.is_offline_submission,
        syncedAt: a.synced_at || undefined,
        auditHash: a.audit_hash || undefined,
      }));

      const qrSessions: QRSession[] = (qrRes.data || []).map((q: any) => ({
        id: q.id,
        token: q.token,
        classId: q.class_id,
        courseCode: q.course_code,
        courseName: q.course_name,
        teacherId: q.teacher_id,
        teacherName: q.teacher_name,
        checkpointType: q.checkpoint_type,
        createdAt: q.created_at,
        expiresAt: q.expires_at,
        isActive: q.is_active,
        captures: q.captures || [],
      }));

      const manualReviews: ManualReviewRequest[] = (reviewsRes.data || []).map((m: any) => ({
        id: m.id,
        userId: m.user_id,
        userName: m.user_name,
        userRole: m.user_role,
        identifierCode: m.identifier_code,
        reason: m.reason,
        photoSnapshot: m.photo_snapshot || undefined,
        createdAt: m.created_at,
        status: m.status,
        resolvedAt: m.resolved_at || undefined,
        resolvedBy: m.resolved_by || undefined,
        adminNotes: m.admin_notes || undefined,
      }));

      const auditLogs: AuditLog[] = (auditRes.data || []).map((l: any) => ({
        id: l.id,
        timestamp: l.timestamp,
        actorId: l.actor_id || undefined,
        action: l.action,
        targetId: l.target_id || undefined,
        status: l.status,
        details: l.details || {},
        ipAddress: l.ip_address || undefined,
      }));

      return {
        users,
        enrollments,
        campusConfig,
        classes,
        presenceKeys: [],
        notices: [],
        attendance,
        qrSessions,
        manualReviews,
        auditLogs,
      };
    } catch (err: unknown) {
      console.warn('[SupabaseSync] Error loading initial state from Supabase:', err);
      return null;
    }
  }

  async syncProfile(user: UserProfile): Promise<void> {
    if (!this.client || !this.isEnabled()) return;
    try {
      await this.client.from('profiles').upsert(
        {
          id: user.id,
          email: user.email,
          phone: user.phone || '',
          full_name: user.fullName,
          role: user.role,
          department: user.department || '',
          identifier_code: user.identifierCode,
          secondary_email: user.secondaryEmail || null,
          semester: user.semester || null,
          section: user.section || null,
          credential_status: user.credentialStatus || 'provisional_pending_configuration',
          email_verified: Boolean(user.emailVerified),
          phone_verified: Boolean(user.phoneVerified),
          is_active: user.isActive !== false,
          is_enrolled: Boolean(user.isEnrolled),
          enrollment_note: user.enrollmentNote || null,
          created_at: user.createdAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
    } catch (err: unknown) {
      console.warn('[SupabaseSync] Profile sync warning:', err);
    }
  }

  async syncEnrollment(enrollment: BiometricEnrollment): Promise<void> {
    if (!this.client || !this.isEnabled()) return;
    try {
      await this.client.from('biometric_enrollments').upsert(
        {
          id: enrollment.id,
          user_id: enrollment.userId,
          descriptor: enrollment.descriptor,
          consent_given: enrollment.consentGiven,
          consent_statement: enrollment.consentStatement,
          enrolled_at: enrollment.enrolledAt,
          updated_at: new Date().toISOString(),
          is_active: enrollment.isActive !== false,
        },
        { onConflict: 'id' }
      );
      // Also update is_enrolled on profile
      await this.client
        .from('profiles')
        .update({ is_enrolled: enrollment.isActive, updated_at: new Date().toISOString() })
        .eq('id', enrollment.userId);
    } catch (err: unknown) {
      console.warn('[SupabaseSync] Enrollment sync warning:', err);
    }
  }

  async deleteEnrollment(userId: string): Promise<void> {
    if (!this.client || !this.isEnabled()) return;
    try {
      await this.client.from('biometric_enrollments').delete().eq('user_id', userId);
      await this.client
        .from('profiles')
        .update({ is_enrolled: false, updated_at: new Date().toISOString() })
        .eq('id', userId);
    } catch (err: unknown) {
      console.warn('[SupabaseSync] Enrollment deletion sync warning:', err);
    }
  }

  async syncCampusConfig(config: CampusConfig): Promise<void> {
    if (!this.client || !this.isEnabled()) return;
    try {
      await this.client.from('campus_config').upsert(
        {
          id: 'default',
          campus_name: config.campusName,
          campus_code: config.campusCode,
          latitude: config.latitude,
          longitude: config.longitude,
          radius_meters: config.radiusMeters,
          max_accuracy_meters: config.maxAccuracyMeters,
          wifi_enabled: config.wifiEnabled,
          wifi_trusted_ssids: config.wifiTrustedSSIDs,
          updated_at: config.updatedAt,
        },
        { onConflict: 'id' }
      );
    } catch (err: unknown) {
      console.warn('[SupabaseSync] Campus config sync warning:', err);
    }
  }

  async syncAttendanceEvent(event: AttendanceEvent): Promise<void> {
    if (!this.client || !this.isEnabled()) return;
    try {
      await this.client.from('attendance_events').upsert(
        {
          id: event.id,
          idempotency_key: event.idempotencyKey,
          user_id: event.userId,
          user_name: event.userName,
          user_role: event.userRole,
          identifier_code: event.identifierCode,
          session_type: event.sessionType,
          session_id: event.sessionId || null,
          checkpoint_type: event.checkpointType,
          event_date: event.eventDate,
          captured_at: event.capturedAt,
          server_verified_at: event.serverVerifiedAt,
          status: event.status,
          rejection_reason: event.rejectionReason || null,
          latitude: event.latitude || null,
          longitude: event.longitude || null,
          distance_meters: event.distanceMeters || null,
          location_accuracy: event.locationAccuracy || null,
          face_distance: event.faceDistance || null,
          presence_key_used: event.presenceKeyUsed || null,
          is_offline_submission: event.isOfflineSubmission,
          synced_at: event.syncedAt || null,
          audit_hash: event.auditHash || null,
          created_at: event.serverVerifiedAt || new Date().toISOString(),
        },
        { onConflict: 'idempotency_key' }
      );
    } catch (err: unknown) {
      console.warn('[SupabaseSync] Attendance event sync warning:', err);
    }
  }

  async syncQRSession(session: QRSession): Promise<void> {
    if (!this.client || !this.isEnabled()) return;
    try {
      await this.client.from('qr_sessions').upsert(
        {
          id: session.id,
          token: session.token,
          class_id: session.classId,
          course_code: session.courseCode,
          course_name: session.courseName,
          teacher_id: session.teacherId,
          teacher_name: session.teacherName,
          checkpoint_type: session.checkpointType,
          created_at: session.createdAt,
          expires_at: session.expiresAt,
          is_active: session.isActive,
          captures: session.captures || [],
        },
        { onConflict: 'token' }
      );
    } catch (err: unknown) {
      console.warn('[SupabaseSync] QR session sync warning:', err);
    }
  }

  async syncManualReview(review: ManualReviewRequest): Promise<void> {
    if (!this.client || !this.isEnabled()) return;
    try {
      await this.client.from('manual_reviews').upsert(
        {
          id: review.id,
          user_id: review.userId,
          user_name: review.userName,
          user_role: review.userRole,
          identifier_code: review.identifierCode,
          reason: review.reason,
          photo_snapshot: review.photoSnapshot || null,
          created_at: review.createdAt,
          status: review.status,
          resolved_at: review.resolvedAt || null,
          resolved_by: review.resolvedBy || null,
          admin_notes: review.adminNotes || null,
        },
        { onConflict: 'id' }
      );
    } catch (err: unknown) {
      console.warn('[SupabaseSync] Manual review sync warning:', err);
    }
  }

  async syncAuditLog(log: AuditLog): Promise<void> {
    if (!this.client || !this.isEnabled()) return;
    try {
      await this.client.from('audit_logs').upsert(
        {
          id: log.id,
          timestamp: log.timestamp,
          actor_id: log.actorId || null,
          action: log.action,
          target_id: log.targetId || null,
          status: log.status,
          details: log.details || {},
          ip_address: log.ipAddress || null,
        },
        { onConflict: 'id' }
      );
    } catch (err: unknown) {
      console.warn('[SupabaseSync] Audit log sync warning:', err);
    }
  }
}

export const supabaseSync = new SupabaseSyncService();
