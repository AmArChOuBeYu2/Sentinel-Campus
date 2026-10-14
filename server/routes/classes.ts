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

export default router;
