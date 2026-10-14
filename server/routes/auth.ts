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

// POST /api/auth/login - Step 1: Validate Role, Phone/Email and Institutional Key
router.post('/login', (req: Request, res: Response) => {
  const { role, credential, institutionalKey } = req.body;

  if (!role) {
    return res.status(400).json({ success: false, error: 'Please select a login role.' });
  }

  // Find user by institutional key or phone/email
  let user = null;
  if (institutionalKey) {
    user = db.getUserByIdentifier(institutionalKey);
  } else if (credential) {
    user = db.getUserByEmailOrPhone(credential);
  } else {
    // Demo fallback for quick role switch
    user = db.getUsers().find((u) => u.role === (role as UserRole) && u.isActive);
  }

  if (!user || !user.isActive) {
    return res.status(401).json({
      success: false,
      error: 'Invalid institutional key or unverified credential.',
    });
  }

  // Check role match
  if (user.role !== role && user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: `Role mismatch: This institutional ID is registered as a ${user.role}, not ${role}.`,
    });
  }

  // Generate simulated 6-digit OTP for demo mode
  const simulatedOtp = '123456';

  db.addAuditLog(user.id, 'USER_LOGIN_OTP_REQUESTED', 'SUCCESS', {
    role: user.role,
    identifier: user.identifierCode,
  });

  return res.json({
    success: true,
    message: `OTP sent to ${user.phone}. For demonstration, enter OTP: ${simulatedOtp}`,
    userId: user.id,
    identifierCode: user.identifierCode,
    phoneMasked: user.phone.replace(/(\+91\s\d{2})\d{4}(\d{4})/, '$1 **** $2'),
    simulatedOtp,
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
