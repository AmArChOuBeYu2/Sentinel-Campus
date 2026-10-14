import { Router, Request, Response } from 'express';
import { db } from '../db';
import { getAuthenticatedUser } from './auth';

const router = Router();

// GET /api/classes/current
router.get('/current', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const classes = db.getClasses();
  const today = new Date().toISOString().split('T')[0];

  const userAttendance = db.getAttendanceByUser(user.id).filter((a) => a.eventDate === today);

  const classesWithStatus = classes.map((cls) => {
    const cp1Record = userAttendance.find(
      (a) => a.sessionId === cls.id && a.checkpointType === 'checkpoint_1' && a.status === 'confirmed'
    );
    const cp2Record = userAttendance.find(
      (a) => a.sessionId === cls.id && a.checkpointType === 'checkpoint_2' && a.status === 'confirmed'
    );

    // Active presence keys if available
    const activeKey1 = db.getActivePresenceKey(cls.id, 'checkpoint_1');
    const activeKey2 = db.getActivePresenceKey(cls.id, 'checkpoint_2');

    return {
      ...cls,
      activePresenceKey1: activeKey1 ? activeKey1.key : cls.activePresenceKey1 || null,
      activePresenceKey2: activeKey2 ? activeKey2.key : cls.activePresenceKey2 || null,
      checkpoints: {
        checkpoint_1: {
          name: 'Class Entry / Start',
          window: `${cls.cp1Start} - ${cls.cp1End}`,
          isCompleted: !!cp1Record,
          completedAt: cp1Record?.capturedAt || null,
        },
        checkpoint_2: {
          name: 'Mid-Class Presence Checkpoint',
          window: `${cls.cp2Start} - ${cls.cp2End}`,
          isCompleted: !!cp2Record,
          completedAt: cp2Record?.capturedAt || null,
        },
      },
    };
  });

  return res.json({
    success: true,
    classes: classesWithStatus,
  });
});

// POST /api/classes/:id/presence-key (Teacher generates temporary presence key)
router.post('/:id/presence-key', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return res.status(403).json({
      success: false,
      error: 'Only the assigned instructor or administrator can generate class presence keys.',
    });
  }

  const { id } = req.params;
  const { checkpointType } = req.body;

  if (checkpointType !== 'checkpoint_1' && checkpointType !== 'checkpoint_2') {
    return res.status(400).json({
      success: false,
      error: 'Invalid checkpoint type. Must be "checkpoint_1" or "checkpoint_2".',
    });
  }

  const cls = db.getClassById(id);
  if (!cls) {
    return res.status(404).json({ success: false, error: 'Class session not found.' });
  }

  const newKey = db.generatePresenceKey(id, checkpointType, user.id);

  return res.json({
    success: true,
    message: `New ${checkpointType === 'checkpoint_1' ? 'Starting' : 'Mid-Class'} Presence Key active.`,
    presenceKey: newKey,
  });
});

// GET /api/classes/:id/roster - Get live roster & attendance counts for teacher
router.get('/:id/roster', (req: Request, res: Response) => {
  const { id } = req.params;
  const today = new Date().toISOString().split('T')[0];

  const cls = db.getClassById(id);
  if (!cls) {
    return res.status(404).json({ success: false, error: 'Class session not found.' });
  }

  const allAttendance = db.getAttendance().filter((a) => a.sessionId === id && a.eventDate === today);
  const students = db.getUsers().filter((u) => u.role === 'student');

  const roster = students.map((stu) => {
    const cp1 = allAttendance.find((a) => a.userId === stu.id && a.checkpointType === 'checkpoint_1');
    const cp2 = allAttendance.find((a) => a.userId === stu.id && a.checkpointType === 'checkpoint_2');

    return {
      userId: stu.id,
      fullName: stu.fullName,
      identifierCode: stu.identifierCode,
      department: stu.department,
      checkpoint1: cp1 ? cp1.status : 'absent',
      checkpoint2: cp2 ? cp2.status : 'absent',
      cp1VerifiedAt: cp1?.capturedAt || null,
      cp2VerifiedAt: cp2?.capturedAt || null,
    };
  });

  const presentCount = roster.filter((r) => r.checkpoint1 === 'confirmed').length;
  const totalCount = roster.length;

  return res.json({
    success: true,
    class: cls,
    stats: {
      total: totalCount,
      present: presentCount,
      absent: totalCount - presentCount,
    },
    roster,
  });
});

// POST /api/classes/:id/qr-session - Teacher generates 5-minute Classroom QR Session on Laptop
router.post('/:id/qr-session', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return res.status(403).json({
      success: false,
      error: 'Only authenticated instructors or administrators can generate class capture QR codes.',
    });
  }

  const { id } = req.params;
  const { checkpointType } = req.body;

  if (checkpointType !== 'checkpoint_1' && checkpointType !== 'checkpoint_2') {
    return res.status(400).json({
      success: false,
      error: 'Invalid checkpoint type. Must be "checkpoint_1" or "checkpoint_2".',
    });
  }

  const cls = db.getClassById(id);
  if (!cls) {
    return res.status(404).json({ success: false, error: 'Class session not found.' });
  }

  const session = db.createQRSession(id, checkpointType, user.id);
  const remainingSeconds = Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));

  // The QR payload is a secure, short-lived JSON payload with cryptographic token
  const qrPayload = JSON.stringify({
    app: 'SentinelCampus',
    token: session.token,
    classId: session.classId,
    courseCode: session.courseCode,
    checkpointType: session.checkpointType,
    expiresAt: session.expiresAt,
  });

  return res.json({
    success: true,
    message: `${checkpointType === 'checkpoint_1' ? 'Start-of-Class' : 'Mid-Class'} QR Session active.`,
    session: {
      ...session,
      remainingSeconds,
      qrPayload,
    },
  });
});

// GET /api/classes/qr-session/:token - Mobile scans QR to retrieve and validate session
router.get('/qr-session/:token', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Authentication required to validate classroom session.' });
  }

  const { token } = req.params;
  const session = db.getQRSessionByToken(token);

  if (!session) {
    return res.status(404).json({ success: false, error: 'Classroom QR session not found or invalid.' });
  }

  const now = new Date();
  if (!session.isActive || now.toISOString() > session.expiresAt) {
    return res.status(410).json({
      success: false,
      error: 'Classroom QR session has expired (5-minute window elapsed). Please request the teacher to regenerate the QR code.',
    });
  }

  // Confirm teacher authorization
  if (user.role === 'teacher' && session.teacherId !== user.id && user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Unauthorized: This classroom session belongs to another instructor.',
    });
  }

  const remainingSeconds = Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - now.getTime()) / 1000));

  return res.json({
    success: true,
    session: {
      ...session,
      remainingSeconds,
    },
  });
});

// POST /api/classes/qr-session/:token/capture - Teacher captures student from mobile camera
router.post('/qr-session/:token/capture', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return res.status(403).json({ success: false, error: 'Only authenticated instructors can capture student attendance.' });
  }

  const { token } = req.params;
  const session = db.getQRSessionByToken(token);

  if (!session || !session.isActive) {
    return res.status(410).json({ success: false, error: 'QR capture session has expired or been closed.' });
  }

  const { faceDescriptor, thumbnailUrl } = req.body;

  if (!faceDescriptor || !Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
    return res.status(400).json({
      success: false,
      error: 'Valid 128-d face descriptor embedding required from live camera capture.',
    });
  }

  const startTime = Date.now();
  const matchResult = db.matchStudentFace(faceDescriptor);
  const processingTimeMs = Date.now() - startTime;
  const today = new Date().toISOString().split('T')[0];

  // If face matched
  if (matchResult.status === 'confirmed' && matchResult.match) {
    const matchedStudent = matchResult.match;

    // Check duplicate attendance constraint for this student, class session, and checkpoint
    const duplicate = db.findDuplicateAttendance(
      matchedStudent.id,
      today,
      'class_session',
      session.checkpointType,
      session.classId
    );

    if (duplicate) {
      const captureRecord = {
        studentId: matchedStudent.id,
        studentName: matchedStudent.fullName,
        identifierCode: matchedStudent.identifierCode,
        capturedAt: new Date().toISOString(),
        faceDistance: matchResult.distance,
        status: 'duplicate' as const,
        thumbnailUrl,
        processingTimeMs,
        checkpointType: session.checkpointType,
      };

      db.addStudentCaptureToSession(token, captureRecord);

      return res.status(409).json({
        success: false,
        error: `Duplicate attendance: ${matchedStudent.fullName} (${matchedStudent.identifierCode}) has already been marked present for ${session.checkpointType}.`,
        capture: captureRecord,
        matchedStudent,
      });
    }

    // Record verified attendance in master ledger
    db.recordAttendance({
      idempotencyKey: `cls_cap_${matchedStudent.id}_${session.classId}_${session.checkpointType}_${Date.now()}`,
      userId: matchedStudent.id,
      userName: matchedStudent.fullName,
      userRole: 'student',
      identifierCode: matchedStudent.identifierCode,
      sessionType: 'class_session',
      sessionId: session.classId,
      checkpointType: session.checkpointType,
      eventDate: today,
      capturedAt: new Date().toISOString(),
      serverVerifiedAt: new Date().toISOString(),
      status: 'confirmed',
      faceDistance: matchResult.distance,
      isOfflineSubmission: false,
    });

    const captureRecord = {
      studentId: matchedStudent.id,
      studentName: matchedStudent.fullName,
      identifierCode: matchedStudent.identifierCode,
      capturedAt: new Date().toISOString(),
      faceDistance: matchResult.distance,
      status: 'confirmed' as const,
      thumbnailUrl,
      processingTimeMs,
      checkpointType: session.checkpointType,
    };

    db.addStudentCaptureToSession(token, captureRecord);

    return res.json({
      success: true,
      status: 'confirmed',
      message: `Verified: ${matchedStudent.fullName} (${matchedStudent.identifierCode})`,
      capture: captureRecord,
      matchedStudent,
      confidence: matchResult.confidence,
    });
  }

  // Ambiguous match or unmatched
  const status = matchResult.status === 'ambiguous' ? ('ambiguous' as const) : ('unmatched' as const);
  const studentName = matchResult.match ? `Ambiguous: ${matchResult.match.fullName}?` : 'Unmatched Student';
  const studentId = matchResult.match?.id || 'unknown';
  const identifierCode = matchResult.match?.identifierCode || 'N/A';

  const captureRecord = {
    studentId,
    studentName,
    identifierCode,
    capturedAt: new Date().toISOString(),
    faceDistance: matchResult.distance,
    status,
    thumbnailUrl,
    processingTimeMs,
    checkpointType: session.checkpointType,
  };

  db.addStudentCaptureToSession(token, captureRecord);

  return res.json({
    success: false,
    status,
    error:
      status === 'ambiguous'
        ? 'Ambiguous match detected between multiple student templates. Flagged for review.'
        : 'Face does not match any enrolled student reference profile (Confidence below 55%).',
    capture: captureRecord,
    confidence: matchResult.confidence,
  });
});

// GET /api/classes/qr-session/:token/status - Laptop polling endpoint for live attendance updates
router.get('/qr-session/:token/status', (req: Request, res: Response) => {
  const { token } = req.params;
  const session = db.getQRSessionByToken(token);

  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found.' });
  }

  const now = new Date();
  const remainingSeconds = Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - now.getTime()) / 1000));
  const isExpired = remainingSeconds <= 0;

  // Build complete roster status for laptop console
  const students = db.getUsers().filter((u) => u.role === 'student');
  const confirmedCaptures = session.captures.filter((c) => c.status === 'confirmed');
  const pendingCaptures = session.captures.filter((c) => c.status === 'ambiguous');
  const rejectedCaptures = session.captures.filter((c) => c.status === 'unmatched');

  const rosterBreakdown = students.map((stu) => {
    const capture = session.captures.find((c) => c.studentId === stu.id);
    let studentStatus: 'confirmed' | 'pending' | 'rejected' | 'not_captured' = 'not_captured';
    if (capture) {
      if (capture.status === 'confirmed') studentStatus = 'confirmed';
      else if (capture.status === 'ambiguous') studentStatus = 'pending';
      else if (capture.status === 'unmatched') studentStatus = 'rejected';
    }

    return {
      studentId: stu.id,
      fullName: stu.fullName,
      identifierCode: stu.identifierCode,
      department: stu.department,
      status: studentStatus,
      capturedAt: capture?.capturedAt || null,
      faceDistance: capture?.faceDistance || null,
      thumbnailUrl: capture?.thumbnailUrl || null,
    };
  });

  return res.json({
    success: true,
    session: {
      ...session,
      isActive: session.isActive && !isExpired,
      remainingSeconds,
    },
    stats: {
      totalStudents: students.length,
      identifiedCount: confirmedCaptures.length,
      pendingCount: pendingCaptures.length,
      rejectedCount: rejectedCaptures.length,
      notCapturedCount: students.length - confirmedCaptures.length,
    },
    rosterBreakdown,
    recentCaptures: session.captures.slice(0, 15),
  });
});

// POST /api/classes/qr-session/:token/close - Teacher closes session
router.post('/qr-session/:token/close', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }

  const { token } = req.params;
  const closed = db.closeQRSession(token, user.id);

  if (!closed) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  return res.json({
    success: true,
    message: 'QR capture session closed successfully.',
    session: closed,
    summary: {
      classId: closed.classId,
      checkpointType: closed.checkpointType,
      totalCaptures: closed.captures.length,
      confirmed: closed.captures.filter((c) => c.status === 'confirmed').length,
      unmatched: closed.captures.filter((c) => c.status === 'unmatched').length,
    },
  });
});

export default router;
