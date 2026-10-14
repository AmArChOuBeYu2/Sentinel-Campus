-- ============================================================================
-- Sentinel Campus: Smart Attendance and Campus Presence Verification
-- PostgreSQL & Supabase Database Migration
-- Problem Statement 23: IEEE IGNITE 2026, SKIT Jaipur
-- ============================================================================

-- Enable UUID extension and pgcrypto
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. USER PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    phone TEXT DEFAULT '',
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'staff', 'admin')),
    department TEXT NOT NULL DEFAULT '',
    identifier_code TEXT NOT NULL UNIQUE,
    secondary_email TEXT,
    semester TEXT,
    section TEXT,
    credential_status TEXT NOT NULL DEFAULT 'provisional_pending_configuration',
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
    enrollment_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_identifier ON public.profiles(identifier_code);

-- 2. BIOMETRIC ENROLLMENTS
-- Stores 128-dimensional facial embeddings securely. Original images are NOT stored permanently.
CREATE TABLE IF NOT EXISTS public.biometric_enrollments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    descriptor JSONB NOT NULL,
    consent_given BOOLEAN NOT NULL DEFAULT TRUE,
    consent_statement TEXT NOT NULL,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT unique_active_enrollment_per_user UNIQUE (user_id, is_active)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_user_id ON public.biometric_enrollments(user_id);

-- 3. CAMPUS GEOFENCE & INTEGRATION CONFIGURATION
CREATE TABLE IF NOT EXISTS public.campus_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    campus_name TEXT NOT NULL,
    campus_code TEXT NOT NULL UNIQUE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius_meters INTEGER NOT NULL DEFAULT 450,
    max_accuracy_meters INTEGER NOT NULL DEFAULT 80,
    wifi_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    wifi_trusted_ssids TEXT[] DEFAULT ARRAY['SKIT_CAMPUS_SECURE', 'SKIT_FACULTY_WIFI'],
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. CLASS SESSIONS & CHECKPOINTS
CREATE TABLE IF NOT EXISTS public.class_sessions (
    id TEXT PRIMARY KEY,
    course_code TEXT NOT NULL,
    course_name TEXT NOT NULL,
    instructor_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    instructor_name TEXT NOT NULL DEFAULT '',
    room_number TEXT NOT NULL,
    section TEXT NOT NULL DEFAULT '',
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    cp1_start TIME NOT NULL,
    cp1_end TIME NOT NULL,
    cp2_start TIME NOT NULL,
    cp2_end TIME NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    enrolled_student_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_class_instructor ON public.class_sessions(instructor_id);
CREATE INDEX IF NOT EXISTS idx_class_date ON public.class_sessions(session_date);

-- 5. ATTENDANCE & VERIFICATION EVENTS
CREATE TABLE IF NOT EXISTS public.attendance_events (
    id TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL CHECK (user_role IN ('student', 'teacher', 'staff', 'admin')),
    identifier_code TEXT NOT NULL,
    session_type TEXT NOT NULL CHECK (session_type IN ('daily_staff', 'class_session', 'daily_personal')),
    session_id TEXT REFERENCES public.class_sessions(id) ON DELETE SET NULL,
    checkpoint_type TEXT NOT NULL CHECK (checkpoint_type IN ('entry', 'checkpoint_1', 'checkpoint_2')),
    event_date DATE NOT NULL DEFAULT CURRENT_DATE,
    captured_at TIMESTAMPTZ NOT NULL,
    server_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL CHECK (status IN ('confirmed', 'rejected', 'pending_sync')),
    rejection_reason TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION,
    location_accuracy DOUBLE PRECISION,
    face_distance DOUBLE PRECISION,
    presence_key_used TEXT,
    is_offline_submission BOOLEAN NOT NULL DEFAULT FALSE,
    synced_at TIMESTAMPTZ,
    audit_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_daily_personal_attendance UNIQUE (user_id, event_date, session_type, checkpoint_type)
);

CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON public.attendance_events(user_id, event_date);
CREATE INDEX IF NOT EXISTS idx_attendance_date_type ON public.attendance_events(event_date, session_type);
CREATE INDEX IF NOT EXISTS idx_attendance_idempotency ON public.attendance_events(idempotency_key);

-- 6. QR SESSIONS
CREATE TABLE IF NOT EXISTS public.qr_sessions (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    class_id TEXT NOT NULL REFERENCES public.class_sessions(id) ON DELETE CASCADE,
    course_code TEXT NOT NULL,
    course_name TEXT NOT NULL,
    teacher_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    teacher_name TEXT NOT NULL,
    checkpoint_type TEXT NOT NULL CHECK (checkpoint_type IN ('checkpoint_1', 'checkpoint_2')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    isActive BOOLEAN NOT NULL DEFAULT TRUE,
    captures JSONB NOT NULL DEFAULT '[]'::JSONB
);

CREATE INDEX IF NOT EXISTS idx_qr_token ON public.qr_sessions(token);
CREATE INDEX IF NOT EXISTS idx_qr_class ON public.qr_sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_qr_teacher_active ON public.qr_sessions(teacher_id, isActive);

-- 7. MANUAL REVIEWS
CREATE TABLE IF NOT EXISTS public.manual_reviews (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL CHECK (user_role IN ('student', 'teacher', 'staff', 'admin')),
    identifier_code TEXT NOT NULL,
    reason TEXT NOT NULL,
    photo_snapshot TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    admin_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_manual_reviews_user ON public.manual_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_manual_reviews_status ON public.manual_reviews(status);

-- 8. AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILURE', 'WARNING')),
    details JSONB,
    ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);

-- 9. OTP CHALLENGES (Hashed, Single-Use, 5-Minute Expiry)
CREATE TABLE IF NOT EXISTS public.otp_challenges (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    email TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts_remaining INTEGER NOT NULL DEFAULT 5,
    is_consumed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_challenges_user_role ON public.otp_challenges(user_id, role);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_email ON public.otp_challenges(email);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_expires ON public.otp_challenges(expires_at);

-- 10. OTP RATE LIMITS & COOLDOWN
CREATE TABLE IF NOT EXISTS public.otp_rate_limits (
    email TEXT PRIMARY KEY,
    last_requested_at TIMESTAMPTZ NOT NULL,
    request_timestamps JSONB NOT NULL DEFAULT '[]'::JSONB
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biometric_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_rate_limits ENABLE ROW LEVEL SECURITY;

-- Service role policies (full backend operations)
CREATE POLICY "Service role full access on profiles" ON public.profiles FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on biometric_enrollments" ON public.biometric_enrollments FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on campus_config" ON public.campus_config FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on class_sessions" ON public.class_sessions FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on attendance_events" ON public.attendance_events FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on qr_sessions" ON public.qr_sessions FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on manual_reviews" ON public.manual_reviews FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on audit_logs" ON public.audit_logs FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on otp_challenges" ON public.otp_challenges FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on otp_rate_limits" ON public.otp_rate_limits FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- Anon read-only policies for public configurations
CREATE POLICY "Anon read campus config" ON public.campus_config FOR SELECT TO anon USING (TRUE);
CREATE POLICY "Anon read active class sessions" ON public.class_sessions FOR SELECT TO anon USING (is_active = TRUE);
