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
  let user = null;
  if (rawCredential) {
    user = db.getUserByEmailOrPhone(rawCredential);
  }
  if (!user && institutionalKey) {
    user = db.getUserByIdentifier(institutionalKey.trim());
  }

  const targetEmail = rawCredential.includes('@') ? rawCredential : user?.email || '';

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

// POST /api/auth/verify-otp - Step 2: Validate OTP and issue authenticated session
router.post('/verify-otp', (req: Request, res: Response) => {
  const { userId, credential, role, otp } = req.body;

  let user = null;
  if (userId) {
    user = db.getUserById(userId);
  }
  if (!user && credential) {
    user = db.getUserByEmailOrPhone(credential);
  }

  // If demo login with static 123456 in dev mode
  const isDev = process.env.NODE_ENV !== 'production' && process.env.ALLOW_SIMULATED_OTP === 'true';
  if (isDev && otp === '123456' && user) {
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

  if (!user || !user.isActive) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired verification code.',
    });
  }

  // Check role match: verify selected role matches user role
  const targetRole = role || user.role;
  if (user.role !== targetRole && user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: `Role mismatch: This account is registered as ${user.role.toUpperCase()}, not ${targetRole.toUpperCase()}. Access restricted.`,
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
