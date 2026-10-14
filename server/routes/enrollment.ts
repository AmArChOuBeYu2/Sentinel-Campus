import { Router, Request, Response } from 'express';
import { db } from '../db';
import { getAuthenticatedUser } from './auth';

const router = Router();

// POST /api/enrollment
router.post('/', (req: Request, res: Response) => {
  const currentUser = getAuthenticatedUser(req);
  if (!currentUser) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const { descriptor, consentGiven, consentStatement, targetUserId } = req.body;

  // Authorization: Only user themselves or an admin can enroll
  const targetId = targetUserId && currentUser.role === 'admin' ? targetUserId : currentUser.id;
  const targetUser = db.getUserById(targetId);

  if (!targetUser) {
    return res.status(404).json({ success: false, error: 'User profile not found.' });
  }

  if (!consentGiven) {
    return res.status(400).json({
      success: false,
      error: 'Informed biometric consent is mandatory before processing facial embeddings.',
    });
  }

  // Production Fail-Closed Policy:
  // Server-side face recognition runtime (@tensorflow/tfjs-node) is absent from this Node.js environment.
  // When in production mode or when REQUIRE_SERVER_BIOMETRICS is enabled, client-generated descriptors must fail closed safely.
  const isProductionBiometricEnforced =
    process.env.NODE_ENV === 'production' || process.env.REQUIRE_SERVER_BIOMETRICS === 'true';

  if (isProductionBiometricEnforced) {
    db.addAuditLog(currentUser.id, 'BIOMETRIC_ENROLLMENT_FAIL_CLOSED_PRODUCTION', 'WARNING', {
      targetUserId: targetId,
      message: 'Client-supplied descriptor rejected under production biometric security policy',
    });
    return res.status(503).json({
      success: false,
      error: 'Production security policy: Server-side facial landmark inference runtime (@tensorflow/tfjs-node) is not loaded. Client-supplied descriptors cannot be registered as production biometric enrollment.',
      biometricTier: {
        mode: 'prototype_client_descriptor',
        isProductionSecure: false,
        failClosed: true,
      },
    });
  }

  if (!Array.isArray(descriptor) || descriptor.length !== 128) {
    return res.status(400).json({
      success: false,
      error: 'Invalid biometric payload. A 128-dimensional facial embedding vector is required.',
    });
  }

  // Validate descriptor integrity: finite numbers, plausible range [-2.0, 2.0], non-flat, magnitude in [0.3, 2.0]
  let sumSquares = 0;
  const firstVal = descriptor[0];
  let allEqual = true;

  for (let i = 0; i < 128; i++) {
    const v = descriptor[i];
    if (typeof v !== 'number' || isNaN(v) || !Number.isFinite(v)) {
      return res.status(400).json({
        success: false,
        error: 'Corrupted face descriptor: contains non-numeric, NaN, or non-finite values.',
      });
    }
    if (Math.abs(v) > 2.0) {
      return res.status(400).json({
        success: false,
        error: 'Corrupted face descriptor: component value exceeds plausible biometric range [-2.0, 2.0].',
      });
    }
    if (v !== firstVal) {
      allEqual = false;
    }
    sumSquares += v * v;
  }

  if (allEqual) {
    return res.status(400).json({
      success: false,
      error: 'Fabricated uniform flat vector rejected by biometric integrity checks.',
    });
  }

  const magnitude = Math.sqrt(sumSquares);
  if (magnitude < 0.3 || magnitude > 2.0) {
    return res.status(400).json({
      success: false,
      error: `Fabricated or unpopulated vector: magnitude (${magnitude.toFixed(2)}) is outside plausible face embedding range [0.3, 2.0].`,
    });
  }

  const enrollment = db.saveEnrollment(
    targetId,
    descriptor,
    consentStatement || 'Biometric consent agreed for campus attendance'
  );

  return res.json({
    success: true,
    message: `Biometric enrollment successfully registered for ${targetUser.fullName}.`,
    enrollment: {
      id: enrollment.id,
      userId: enrollment.userId,
      enrolledAt: enrollment.enrolledAt,
      consentGiven: enrollment.consentGiven,
    },
    biometricTier: {
      mode: 'prototype_client_descriptor',
      isProductionSecure: false,
      notice: 'Prototype mode: Descriptor computed on client browser. Not for production biometric verification.',
    },
  });
});

// GET /api/enrollment/status
router.get('/status', (req: Request, res: Response) => {
  const currentUser = getAuthenticatedUser(req);
  if (!currentUser) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const enrollment = db.getEnrollmentByUserId(currentUser.id);

  return res.json({
    success: true,
    isEnrolled: !!enrollment,
    enrollment: enrollment
      ? {
          id: enrollment.id,
          enrolledAt: enrollment.enrolledAt,
          consentGiven: enrollment.consentGiven,
        }
      : null,
  });
});

// DELETE /api/enrollment/:userId
router.delete('/:userId', (req: Request, res: Response) => {
  const currentUser = getAuthenticatedUser(req);
  if (!currentUser) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const { userId } = req.params;

  // Authorization: admin or self
  if (currentUser.role !== 'admin' && currentUser.id !== userId) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden. You do not have permission to reset this biometric enrollment.',
    });
  }

  const deleted = db.deleteEnrollment(userId);

  return res.json({
    success: true,
    deleted,
    message: deleted
      ? 'Biometric enrollment successfully deleted.'
      : 'No active enrollment found for user.',
  });
});

export default router;
