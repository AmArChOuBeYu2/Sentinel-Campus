import { Router, Request, Response } from 'express';
import { db, UserRole } from '../db';

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

import { otpService } from '../services/otpService';

// POST /api/auth/login - Step 1: Validate Role, Phone/Email and Institutional Key
router.post('/login', async (req: Request, res: Response) => {
  const { role, credential, institutionalKey } = req.body;

  if (!role) {
    return res.status(400).json({ success: false, error: 'Please select a login role.' });
  }

  // Find user by phone, email, or institutional key
  let user = null;
  if (credential && credential.trim()) {
    user = db.getUserByEmailOrPhone(credential.trim());
  }
  if (!user && institutionalKey && institutionalKey.trim()) {
    user = db.getUserByIdentifier(institutionalKey.trim());
  }

  if (!user || !user.isActive) {
    return res.status(401).json({
      success: false,
      error: 'Unrecognized credentials. No active account found matching this phone number or email.',
    });
  }

  // Check role match: Prevent privilege escalation across roles
  if (user.role !== role && user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: `Role mismatch: This account is registered as ${user.role.toUpperCase()}, not ${role.toUpperCase()}. Access restricted.`,
    });
  }

  // Send passcode via configured OTP adapter (simulated in dev, provider in prod)
  const otpCode = '123456';
  const otpRes = await otpService.sendOtp(user.phone, otpCode);

  db.addAuditLog(user.id, 'USER_LOGIN_OTP_REQUESTED', 'SUCCESS', {
    role: user.role,
    identifier: user.identifierCode,
    provider: otpRes.provider,
  });

  return res.json({
    success: true,
    message: otpRes.message,
    userId: user.id,
    identifierCode: user.identifierCode,
    phoneMasked: user.phone.replace(/(\+91\s\d{2})\d{4}(\d{4})/, '$1 **** $2'),
    simulatedOtp: otpRes.isSimulated ? otpRes.simulatedOtp : undefined,
    isSimulated: otpRes.isSimulated,
  });
});

// POST /api/auth/verify-otp - Step 2: Validate OTP and issue session
router.post('/verify-otp', (req: Request, res: Response) => {
  const { userId, otp } = req.body;

  const user = db.getUserById(userId);
  if (!user || !user.isActive) {
    return res.status(401).json({ success: false, error: 'User account not found or inactive.' });
  }

  // Demo OTP check: accept '123456' or any 6-digit OTP in demo mode
  if (!otp || (otp !== '123456' && otp.length !== 6)) {
    return res.status(400).json({ success: false, error: 'Invalid or expired OTP code.' });
  }

  db.addAuditLog(user.id, 'USER_AUTHENTICATED', 'SUCCESS', {
    role: user.role,
    identifier: user.identifierCode,
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
