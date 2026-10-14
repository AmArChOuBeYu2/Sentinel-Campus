import {
  UserProfile,
  CampusConfig,
  ClassSession,
  AttendanceEvent,
  AuditLog,
  Notice,
  PresenceKey,
  UserRole,
  QRSession,
  CapturedStudent,
} from '../types';

const API_BASE = '/api';

class ApiService {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('sentinel_auth_token') || null;
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('sentinel_auth_token', token);
    } else {
      localStorage.removeItem('sentinel_auth_token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
    }

    return data;
  }

  // --- Authentication ---
  async requestLogin(params: {
    role: UserRole;
    credential?: string;
    institutionalKey?: string;
  }): Promise<{
    success: boolean;
    message: string;
    userId?: string;
    credential?: string;
    emailMasked?: string;
    isSimulated?: boolean;
    simulatedOtp?: string;
  }> {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async verifyOtp(
    paramOrUserId: string | { userId?: string; credential?: string; role?: UserRole; otp: string },
    optionalOtp?: string,
    optionalRole?: UserRole
  ): Promise<{ success: boolean; user: UserProfile; token: string }> {
    const payload =
      typeof paramOrUserId === 'string'
        ? { userId: paramOrUserId, otp: optionalOtp, role: optionalRole }
        : paramOrUserId;

    const res = await this.request<{ success: boolean; user: UserProfile; token: string }>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  }

  async quickDemoLogin(userId: string, role?: UserRole): Promise<{ success: boolean; user: UserProfile; token: string }> {
    const res = await this.request<{ success: boolean; user: UserProfile; token: string }>('/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    });
    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  }

  async getMe(): Promise<{ success: boolean; user: UserProfile; enrollment: unknown }> {
    return this.request<{ success: boolean; user: UserProfile; enrollment: unknown }>('/me');
  }

  // --- Enrollment ---
  async submitEnrollment(
    descriptor: number[],
    consentStatement: string,
    targetUserId?: string
  ): Promise<{ success: boolean; message: string }> {
    return this.request('/enrollment', {
      method: 'POST',
      body: JSON.stringify({
        descriptor,
        consentGiven: true,
        consentStatement,
        targetUserId,
      }),
    });
  }

  async resetEnrollment(userId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/enrollment/${userId}`, {
      method: 'DELETE',
    });
  }

  // --- Attendance ---
  async submitAttendance(payload: {
    idempotencyKey?: string;
    sessionType: 'daily_staff' | 'class_session' | 'daily_personal';
    sessionId?: string;
    checkpointType: 'entry' | 'checkpoint_1' | 'checkpoint_2';
    latitude: number;
    longitude: number;
    locationAccuracy: number;
    faceDescriptor: number[];
    capturedAt: string;
    presenceKey?: string;
    isOfflineSubmission?: boolean;
  }): Promise<{ success: boolean; record: AttendanceEvent; error?: string }> {
    return this.request('/attendance/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getMyAttendance(): Promise<{
    success: boolean;
    todayStatus: {
      hasPersonalAttendance: boolean;
      hasDailyStaffAttendance: boolean;
      latestRecord: AttendanceEvent | null;
      confirmedCountToday: number;
    };
    records: AttendanceEvent[];
  }> {
    return this.request('/attendance/me');
  }

  async syncOfflineSubmissions(submissions: unknown[]): Promise<{
    success: boolean;
    totalReceived: number;
    confirmed: number;
    rejected: number;
    duplicates: number;
    results: Array<{
      idempotencyKey: string;
      status: 'confirmed' | 'rejected' | 'duplicate';
      record?: AttendanceEvent;
      reason?: string;
    }>;
  }> {
    return this.request('/attendance/sync', {
      method: 'POST',
      body: JSON.stringify({ submissions }),
    });
  }

  // --- Mandatory Personal Attendance & Gating ---
  async getGateStatus(): Promise<{
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
      message: string;
      error?: string;
      clientIp?: string;
    };
    message?: string;
  }> {
    return this.request('/attendance/gate-status');
  }

  async verifyPersonalAttendance(payload: {
    faceDescriptor: number[];
    latitude?: number;
    longitude?: number;
    locationAccuracy?: number;
    livenessPassed?: boolean;
    androidWifiPayload?: {
      ssid?: string;
      bssid?: string;
      gatewayIp?: string;
      networkSignature?: string;
    };
  }): Promise<{
    success: boolean;
    unlocked: boolean;
    alreadyRecorded: boolean;
    message: string;
    record: AttendanceEvent;
    networkStatus: any;
    error?: string;
  }> {
    return this.request('/attendance/verify-personal-attendance', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async submitManualReview(reason: string, photoSnapshot?: string): Promise<{
    success: boolean;
    message: string;
    review: any;
  }> {
    return this.request('/attendance/manual-review', {
      method: 'POST',
      body: JSON.stringify({ reason, photoSnapshot }),
    });
  }

  async getManualReviews(): Promise<{ success: boolean; reviews: any[] }> {
    return this.request('/attendance/manual-reviews');
  }

  async resolveManualReview(id: string, approved: boolean | 'approved' | 'rejected', notes?: string): Promise<{
    success: boolean;
    message: string;
    review: any;
  }> {
    const isApproved = typeof approved === 'boolean' ? approved : approved === 'approved';
    return this.request(`/attendance/manual-reviews/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ approved: isApproved, notes }),
    });
  }

  async getNetworkStatus(): Promise<{
    success: boolean;
    config: {
      authMode: string;
      isDemoMode: boolean;
      trustedSSIDs: string[];
      notice: string;
    };
    clientValidation: {
      verified: boolean;
      mode: string;
      isDemo: boolean;
      message: string;
      error?: string;
      clientIp?: string;
    };
  }> {
    return this.request('/attendance/network-status');
  }

  // --- Classes & Presence Keys ---
  async getCurrentClasses(): Promise<{ success: boolean; classes: ClassSession[] }> {
    return this.request('/classes/current');
  }

  async generatePresenceKey(
    sessionId: string,
    checkpointType: 'checkpoint_1' | 'checkpoint_2'
  ): Promise<{ success: boolean; message: string; presenceKey: PresenceKey }> {
    return this.request(`/classes/${sessionId}/presence-key`, {
      method: 'POST',
      body: JSON.stringify({ checkpointType }),
    });
  }

  async getClassRoster(sessionId: string): Promise<{
    success: boolean;
    class: ClassSession;
    stats: { total: number; present: number; absent: number };
    roster: Array<{
      userId: string;
      fullName: string;
      identifierCode: string;
      checkpoint1: string;
      checkpoint2: string;
      cp1VerifiedAt: string | null;
      cp2VerifiedAt: string | null;
    }>;
  }> {
    return this.request(`/classes/${sessionId}/roster`);
  }

  // --- Laptop & Mobile QR Classroom Attendance ---
  async generateQRSession(
    classId: string,
    checkpointType: 'checkpoint_1' | 'checkpoint_2'
  ): Promise<{ success: boolean; session: QRSession; message: string }> {
    return this.request(`/classes/${classId}/qr-session`, {
      method: 'POST',
      body: JSON.stringify({ checkpointType }),
    });
  }

  async getQRSession(token: string): Promise<{ success: boolean; session: QRSession }> {
    return this.request(`/classes/qr-session/${token}`);
  }

  async captureStudentAttendance(
    token: string,
    data: { faceDescriptor: number[]; thumbnailUrl?: string }
  ): Promise<{
    success: boolean;
    status: 'confirmed' | 'unmatched' | 'ambiguous' | 'duplicate';
    message?: string;
    error?: string;
    capture: CapturedStudent;
    matchedStudent?: UserProfile;
    confidence: number;
  }> {
    return this.request(`/classes/qr-session/${token}/capture`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getQRSessionStatus(token: string): Promise<{
    success: boolean;
    session: QRSession;
    stats: {
      totalStudents: number;
      identifiedCount: number;
      pendingCount: number;
      rejectedCount: number;
      notCapturedCount: number;
    };
    rosterBreakdown: Array<{
      studentId: string;
      fullName: string;
      identifierCode: string;
      department: string;
      status: 'confirmed' | 'pending' | 'rejected' | 'not_captured';
      capturedAt: string | null;
      faceDistance: number | null;
      thumbnailUrl: string | null;
    }>;
    recentCaptures: CapturedStudent[];
  }> {
    return this.request(`/classes/qr-session/${token}/status`);
  }

  async closeQRSession(token: string): Promise<{
    success: boolean;
    message: string;
    session: QRSession;
    summary: {
      classId: string;
      checkpointType: string;
      totalCaptures: number;
      confirmed: number;
      unmatched: number;
    };
  }> {
    return this.request(`/classes/qr-session/${token}/close`, {
      method: 'POST',
    });
  }

  // --- Notices ---
  async getNotices(role?: UserRole): Promise<{ success: boolean; notices: Notice[] }> {
    const url = role ? `/notices?role=${role}` : '/notices';
    return this.request(url);
  }

  async createNotice(notice: {
    title: string;
    description: string;
    category: string;
    targetRoles: UserRole[];
  }): Promise<{ success: boolean; notice: Notice }> {
    return this.request('/notices', {
      method: 'POST',
      body: JSON.stringify(notice),
    });
  }

  // --- Admin ---
  async getAdminOverview(): Promise<{
    success: boolean;
    stats: {
      totalUsers: number;
      staffCount: number;
      studentCount: number;
      enrolledUsers: number;
      confirmedToday: number;
      rejectedToday: number;
      totalRecordedToday: number;
      offlineSyncedTotal: number;
    };
    campus: CampusConfig;
  }> {
    return this.request('/admin/overview');
  }

  async getAdminAttendance(params: {
    date?: string;
    role?: string;
    status?: string;
    checkpoint?: string;
    search?: string;
  } = {}): Promise<{ success: boolean; total: number; records: AttendanceEvent[] }> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val) query.set(key, val);
    });
    return this.request(`/admin/attendance?${query.toString()}`);
  }

  async getAdminUsers(): Promise<{ success: boolean; users: UserProfile[] }> {
    return this.request('/admin/users');
  }

  async updateAdminUser(id: string, updates: Partial<UserProfile>): Promise<{ success: boolean; user: UserProfile }> {
    return this.request(`/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async getCampusConfig(): Promise<{ success: boolean; config: CampusConfig }> {
    return this.request('/admin/campus');
  }

  async updateCampusConfig(config: Partial<CampusConfig>): Promise<{ success: boolean; config: CampusConfig; message: string }> {
    return this.request('/admin/campus', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  async getAuditLogs(): Promise<{ success: boolean; logs: AuditLog[] }> {
    return this.request('/admin/audit');
  }

  async getDiagnostics(): Promise<{ success: boolean; diagnostics: Record<string, unknown> }> {
    return this.request('/admin/diagnostics');
  }
}

export const api = new ApiService();
