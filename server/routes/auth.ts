import { Router, Request, Response } from 'express';
import { db, UserRole } from '../db';
import { otpService } from '../services/otpService';

const router = Router();

export function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const tokenOrId = authHeader.replace('Bearer ', '').trim();
    if (tokenOrId) {
      const user =
        db.getUserById(tokenOrId) ||
        db.getUserByIdentifier(tokenOrId) ||
        db.getUserByEmailOrPhone(tokenOrId);
      if (user && user.isActive) return user;
    }
  }
  return null;
}

// POST /api/auth/login - Step 1: Request OTP via Resend Email
router.post('/login', async (req: Request, res: Response) => {
  const { role, credential, institutionalKey } = req.body;

  if (!role) {
    return res.status(400).json({ success: false, error: 'Please select a login role.' });
  }

  const rawCredential = (credential || '').trim();
  if (!rawCredential && !institutionalKey) {
    return res.status(400).json({
      success: false,
      error: 'Please enter your registered institutional email address.',
    });
  }

  // Requirement 8: If user entered phone number, clearly indicate SMS OTP is not configured
  if (otpService.isPhoneCredential(rawCredential)) {
    return res.status(400).json({
      success: false,
      error:
        'SMS OTP authentication is not configured. Resend email delivery requires your registered institutional email address (e.g. user@skit.ac.in).',
    });
  }

  // Find user by email or institutional key
  const normalizedCredential = otpService.normalizeEmail(rawCredential);
  let user = null;
  if (normalizedCredential) {
    user = db.getUserByEmailOrPhone(normalizedCredential);
  }
  if (!user && rawCredential && rawCredential !== normalizedCredential) {
    user = db.getUserByEmailOrPhone(rawCredential);
  }
  if (!user && institutionalKey) {
    user = db.getUserByIdentifier(institutionalKey.trim());
  }

  const targetEmail = normalizedCredential.includes('@') ? normalizedCredential : user?.email || '';

  // Call otpService.requestOtp
  // Handles cooldown, rate-limiting, timing-safe dummy computation, and Resend email dispatch
  const otpRes = await otpService.requestOtp(user, targetEmail, role as UserRole);

  if (!otpRes.success) {
    return res.status(otpRes.status || 400).json({
      success: false,
      error: otpRes.error,
    });
  }

  // Audit log
  if (user) {
    db.addAuditLog(user.id, 'USER_LOGIN_OTP_REQUESTED', 'SUCCESS', {
      role: user.role,
      identifier: user.identifierCode,
      channel: 'email_resend',
    });
  }

  // Mask email for privacy
  const [namePart, domainPart] = targetEmail.split('@');
  const maskedEmail = domainPart
    ? `${namePart.slice(0, 2)}***@${domainPart}`
    : targetEmail;

  return res.json({
    success: true,
    message: otpRes.message,
    userId: user ? user.id : undefined,
    credential: targetEmail,
    emailMasked: maskedEmail,
    isSimulated: otpRes.isSimulated || false,
    simulatedOtp: otpRes.simulatedOtp,
  });
});

export const ALLOWED_DEMO_ACCOUNTS: Record<string, { role: UserRole; name: string; description: string }> = {
  usr_stu_0001: { role: 'student', name: 'Krishna Jha', description: 'Student Demo Account' },
  usr_tch_0001: { role: 'teacher', name: 'Amar Choubey', description: 'Teacher Demo Account' },
  usr_sta_0001: { role: 'staff', name: 'Sudhanshu Kumar', description: 'Staff Demo Account 1' },
  usr_sta_0002: { role: 'staff', name: 'Chetan', description: 'Staff Demo Account 2' },
  usr_sta_0003: { role: 'staff', name: 'Campus Staff Specialist', description: 'Staff Demo Account 3' },
  usr_adm_0001: { role: 'admin', name: 'Prof. Ramesh K. Agarwal (Dean)', description: 'Administrator Demo Account' },
};

// POST /api/auth/demo-login - Server-validated 1-click sign-in for seeded demo accounts
router.post('/demo-login', (req: Request, res: Response) => {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    return res.status(403).json({
      success: false,
      error: 'Demo quick sign-in is disabled in production environments. Please authenticate via institutional email OTP.',
    });
  }

  const isDemoEnabled =
    process.env.ENABLE_DEMO_LOGIN === 'true' || process.env.ALLOW_SIMULATED_OTP === 'true';
  if (!isDemoEnabled) {
    return res.status(403).json({
      success: false,
      error: 'Demo quick sign-in is disabled. Set ENABLE_DEMO_LOGIN=true in the environment configuration.',
    });
  }

  const { userId, role } = req.body;
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Missing demo account identifier (userId).',
    });
  }

  const cleanUserId = userId.trim();
  const demoSpec = ALLOWED_DEMO_ACCOUNTS[cleanUserId];
  if (!demoSpec) {
    return res.status(400).json({
      success: false,
      error: `Unauthorized demo account identifier '${cleanUserId}'. Only official seeded demo accounts are permitted.`,
    });
  }

  const user = db.getUserById(cleanUserId);
  if (!user) {
    return res.status(404).json({
      success: false,
      error: `Demo account '${cleanUserId}' was not found in the campus database.`,
    });
  }

  if (!user.isActive) {
    return res.status(403).json({
      success: false,
      error: `Demo account '${user.fullName}' is currently deactivated or suspended.`,
    });
  }

  if (user.role !== demoSpec.role) {
    return res.status(403).json({
      success: false,
      error: `Demo account configuration error: user role is '${user.role}', but expected '${demoSpec.role}'.`,
    });
  }

  if (role && role !== user.role) {
    return res.status(403).json({
      success: false,
      error: `Role mismatch: Selected role '${role}' does not match demo account role '${user.role}'.`,
    });
  }

  const enrollment = db.getEnrollmentByUserId(user.id);
  const isEnrolled = !!enrollment;

  db.addAuditLog(user.id, 'USER_DEMO_AUTHENTICATED', 'SUCCESS', {
    role: user.role,
    identifier: user.identifierCode,
    isEnrolled,
    demoAccountId: user.id,
  });

  return res.json({
    success: true,
    user: {
      ...user,
      isEnrolled,
    },
    token: user.id,
    isEnrolled,
    message: isEnrolled
      ? `Demo sign-in successful for ${user.fullName} (${user.role.toUpperCase()}). Please verify face presence.`
      : `Demo sign-in successful for ${user.fullName} (${user.role.toUpperCase()}). Biometric profile pending live enrollment.`,
  });
});

// POST /api/auth/verify-otp - Step 2: Validate OTP and issue authenticated session
router.post('/verify-otp', (req: Request, res: Response) => {
  const { userId, credential, role, otp } = req.body;

  let user = null;
  if (userId) {
    user = db.getUserById(userId);
  }
  if (!user && credential) {
    const cleanCredential = otpService.normalizeEmail(credential);
    user = db.getUserByEmailOrPhone(cleanCredential) || db.getUserByEmailOrPhone(credential);
  }

  if (!user || !user.isActive) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired verification code.',
    });
  }

  // Authoritative Role Check: Reject any role mismatch immediately
  const targetRole = role || user.role;
  if (user.role !== targetRole && user.role !== 'admin') {
    db.addAuditLog(user.id, 'LOGIN_ROLE_MISMATCH_REJECTED', 'WARNING', {
      attemptedRole: targetRole,
      actualRole: user.role,
    });
    return res.status(403).json({
      success: false,
      error: `Role mismatch: This account is registered as ${user.role.toUpperCase()}, not ${targetRole.toUpperCase()}. Access restricted.`,
    });
  }

  // If demo login with static 123456 in dev mode (ONLY after role match confirmed)
  const isDev =
    process.env.NODE_ENV !== 'production' &&
    (process.env.ALLOW_SIMULATED_OTP === 'true' || process.env.ENABLE_DEMO_LOGIN === 'true');
  if (isDev && otp === '123456') {
    db.addAuditLog(user.id, 'USER_AUTHENTICATED', 'SUCCESS', {
      role: user.role,
      identifier: user.identifierCode,
      method: 'simulated_dev_otp',
    });
    return res.json({
      success: true,
      user,
      token: user.id,
    });
  }

  // Verify OTP via otpService (checks expiration, timing-safe hash, decrements attempts, single-use deletion)
  const verifyResult = otpService.verifyOtp(user.id, targetRole as UserRole, otp);

  if (!verifyResult.success) {
    return res.status(400).json({
      success: false,
      error: verifyResult.error,
    });
  }

  db.addAuditLog(user.id, 'USER_AUTHENTICATED', 'SUCCESS', {
    role: user.role,
    identifier: user.identifierCode,
    method: 'resend_email_otp',
  });

  return res.json({
    success: true,
    user,
    token: user.id,
  });
});

// GET /api/auth/demo-users
router.get('/demo-users', (_req: Request, res: Response) => {
  return res.json({
    success: true,
    users: db.getUsers().map((u) => ({
      id: u.id,
      fullName: u.fullName,
      role: u.role,
      identifierCode: u.identifierCode,
      email: u.email,
      department: u.department,
      isEnrolled: u.isEnrolled,
    })),
  });
});

// GET /api/me
router.get('/me', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const enrollment = db.getEnrollmentByUserId(user.id);

  return res.json({
    success: true,
    user: {
      ...user,
      isEnrolled: !!enrollment,
    },
    enrollment: enrollment
      ? {
          id: enrollment.id,
          enrolledAt: enrollment.enrolledAt,
          consentGiven: enrollment.consentGiven,
        }
      : null,
  });
});

export default router;
