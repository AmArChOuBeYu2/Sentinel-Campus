-- ============================================================================
-- Sentinel Campus: Smart Attendance and Campus Presence Verification
-- PostgreSQL & Supabase Database Schema with Row Level Security (RLS)
-- Problem Statement 23: IEEE IGNITE 2026, SKIT Jaipur
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USER PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('staff', 'student', 'admin')),
    department TEXT NOT NULL,
    identifier_code TEXT NOT NULL UNIQUE, -- Employee ID or Student Roll No.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. BIOMETRIC ENROLLMENTS
-- Stores 128-dimensional facial embeddings securely. Original images are NOT stored permanently.
CREATE TABLE IF NOT EXISTS public.biometric_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    descriptor JSONB NOT NULL, -- 128-dimensional float array
    consent_given BOOLEAN NOT NULL DEFAULT TRUE,
    consent_statement TEXT NOT NULL,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT unique_active_enrollment_per_user UNIQUE (user_id, is_active)
);

-- 3. CAMPUS GEOFENCE & INTEGRATION CONFIGURATION
CREATE TABLE IF NOT EXISTS public.campus_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campus_name TEXT NOT NULL,
    campus_code TEXT NOT NULL UNIQUE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius_meters INTEGER NOT NULL DEFAULT 450,
    max_accuracy_meters INTEGER NOT NULL DEFAULT 80,
    wifi_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    wifi_trusted_ssids TEXT[] DEFAULT ARRAY['SKIT_CAMPUS_SECURE', 'SKIT_FACULTY_WIFI'],
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES public.profiles(id)
);

-- 4. CLASS SESSIONS & CHECKPOINTS
CREATE TABLE IF NOT EXISTS public.class_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_code TEXT NOT NULL,
    course_name TEXT NOT NULL,
    instructor_id UUID REFERENCES public.profiles(id),
    room_number TEXT NOT NULL,
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    cp1_start TIME NOT NULL,
    cp1_end TIME NOT NULL,
    cp2_start TIME NOT NULL,
    cp2_end TIME NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. ATTENDANCE & VERIFICATION EVENTS
CREATE TABLE IF NOT EXISTS public.attendance_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idempotency_key TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    session_type TEXT NOT NULL CHECK (session_type IN ('daily_staff', 'class_session')),
    session_id UUID REFERENCES public.class_sessions(id) ON DELETE SET NULL,
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
    face_distance DOUBLE PRECISION, -- Euclidean distance between capture & enrolled vector
    is_offline_submission BOOLEAN NOT NULL DEFAULT FALSE,
    synced_at TIMESTAMPTZ,
    audit_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraint: Prevent duplicate attendance for the same checkpoint on the same date/session
    CONSTRAINT unique_staff_daily_attendance UNIQUE (user_id, event_date, session_type, checkpoint_type)
);

-- 6. AUDIT TRAIL LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_id UUID REFERENCES public.profiles(id),
    action TEXT NOT NULL, -- e.g., 'ENROLLMENT_CREATED', 'ATTENDANCE_CONFIRMED', 'ATTENDANCE_REJECTED', 'CONFIG_UPDATED'
    target_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILURE', 'WARNING')),
    details JSONB,
    ip_address TEXT
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biometric_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin' AND is_active = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles: Users can read their own profile; Admins can read/write all
CREATE POLICY "Users read own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins manage profiles" ON public.profiles
    FOR ALL USING (public.is_admin());

-- Biometric Enrollments: Users can read own; Admins can view/audit; Service role inserts
CREATE POLICY "Users manage own enrollment" ON public.biometric_enrollments
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Admins audit enrollments" ON public.biometric_enrollments
    FOR SELECT USING (public.is_admin());

-- Campus Config: Read-only for all authenticated users; Admins can update
CREATE POLICY "Authenticated users view campus config" ON public.campus_config
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Admins update campus config" ON public.campus_config
    FOR ALL USING (public.is_admin());

-- Class Sessions: Authenticated users can view; Admins can manage
CREATE POLICY "Users view class sessions" ON public.class_sessions
    FOR SELECT TO authenticated USING (is_active = TRUE);

CREATE POLICY "Admins manage class sessions" ON public.class_sessions
    FOR ALL USING (public.is_admin());

-- Attendance Events: Users can see own history; Admins can see all
CREATE POLICY "Users view own attendance" ON public.attendance_events
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own attendance" ON public.attendance_events
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all attendance" ON public.attendance_events
    FOR ALL USING (public.is_admin());

-- Audit Logs: Admins only
CREATE POLICY "Admins view audit logs" ON public.audit_logs
    FOR SELECT USING (public.is_admin());
