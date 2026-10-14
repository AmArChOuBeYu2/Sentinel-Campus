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

  if (!Array.isArray(descriptor) || descriptor.length !== 128) {
    return res.status(400).json({
      success: false,
      error: 'Invalid biometric payload. A 128-dimensional facial embedding vector is required.',
    });
  }

  // Validate values in descriptor are real finite numbers
  const hasInvalidValues = descriptor.some((n) => typeof n !== 'number' || !Number.isFinite(n) || isNaN(n));
  const allIdentical = descriptor.every((v) => Math.abs(v - descriptor[0]) < 1e-7);
  const vectorMagnitude = Math.sqrt(descriptor.reduce((sum, v) => sum + v * v, 0));

  if (hasInvalidValues || allIdentical || vectorMagnitude === 0) {
    return res.status(400).json({
      success: false,
      error: 'Fabricated or invalid biometric embedding rejected. Genuine model capture required.',
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
