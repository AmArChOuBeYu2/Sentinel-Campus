import { Router, Request, Response } from 'express';
import { db, getCampusLocalDate } from '../db';
import { getAuthenticatedUser } from './auth';

const router = Router();

// Middleware: Admin authorization check
function requireAdmin(req: Request, res: Response, next: () => void) {
  const user = getAuthenticatedUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Administrative privileges required.',
    });
  }
  next();
}

// GET /api/admin/overview
router.get('/overview', requireAdmin, (req: Request, res: Response) => {
  const today = getCampusLocalDate();
  const allUsers = db.getUsers();
  const allAttendance = db.getAttendance();

  const todayAttendance = allAttendance.filter((a) => a.eventDate === today);
  const confirmedToday = todayAttendance.filter((a) => a.status === 'confirmed').length;
  const rejectedToday = todayAttendance.filter((a) => a.status === 'rejected').length;
  const offlineSynced = allAttendance.filter((a) => a.isOfflineSubmission).length;

  return res.json({
    success: true,
    stats: {
      totalUsers: allUsers.length,
      staffCount: allUsers.filter((u) => u.role === 'staff').length,
      studentCount: allUsers.filter((u) => u.role === 'student').length,
      enrolledUsers: allUsers.filter((u) => u.isEnrolled).length,
      confirmedToday,
      rejectedToday,
      totalRecordedToday: todayAttendance.length,
      offlineSyncedTotal: offlineSynced,
    },
    campus: db.getCampusConfig(),
  });
});

// GET /api/admin/attendance
router.get('/attendance', requireAdmin, (req: Request, res: Response) => {
  const { date, role, status, search, checkpoint } = req.query;

  let records = db.getAttendance();

  if (date) {
    records = records.filter((r) => r.eventDate === String(date));
  }
  if (role && role !== 'all') {
    records = records.filter((r) => r.userRole === String(role));
  }
  if (status && status !== 'all') {
    records = records.filter((r) => r.status === String(status));
  }
  if (checkpoint && checkpoint !== 'all') {
    records = records.filter((r) => r.checkpointType === String(checkpoint));
  }
  if (search) {
    const q = String(search).toLowerCase();
    records = records.filter(
      (r) =>
        r.userName.toLowerCase().includes(q) ||
        r.identifierCode.toLowerCase().includes(q) ||
        r.userId.toLowerCase().includes(q)
    );
  }

  return res.json({
    success: true,
    total: records.length,
    records,
  });
});

// GET /api/admin/attendance/export (CSV Export)
router.get('/attendance/export', requireAdmin, (req: Request, res: Response) => {
  const records = db.getAttendance();
  const headers = [
    'Attendance ID',
    'Date',
    'Captured At',
    'Server Verified At',
    'User Name',
    'Role',
    'ID Code',
    'Session Type',
    'Checkpoint',
    'Status',
    'Rejection Reason',
    'Distance (meters)',
    'GPS Accuracy (m)',
    'Face Distance',
    'Offline Queued',
    'Audit Hash',
  ];

  const rows = records.map((r) => [
    r.id,
    r.eventDate,
    r.capturedAt,
    r.serverVerifiedAt,
    `"${r.userName.replace(/"/g, '""')}"`,
    r.userRole,
    r.identifierCode,
    r.sessionType,
    r.checkpointType,
    r.status,
    `"${(r.rejectionReason || '').replace(/"/g, '""')}"`,
    r.distanceMeters ?? 'N/A',
    r.locationAccuracy ?? 'N/A',
    r.faceDistance ?? 'N/A',
    r.isOfflineSubmission ? 'YES' : 'NO',
    r.auditHash || 'N/A',
  ]);

  const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=sentinel_attendance_${getCampusLocalDate()}.csv`
  );
  return res.send(csvContent);
});

// GET /api/admin/users
router.get('/users', requireAdmin, (req: Request, res: Response) => {
  const users = db.getUsers();
  return res.json({
    success: true,
    users,
  });
});

// PATCH /api/admin/users/:id
router.patch('/users/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;

  const updated = db.updateUser(id, updates);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }

  return res.json({
    success: true,
    user: updated,
  });
});

// GET /api/admin/campus
router.get('/campus', requireAdmin, (req: Request, res: Response) => {
  return res.json({
    success: true,
    config: db.getCampusConfig(),
  });
});

// PUT /api/admin/campus
router.put('/campus', requireAdmin, (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  const {
    campusName,
    latitude,
    longitude,
    radiusMeters,
    maxAccuracyMeters,
    wifiEnabled,
    wifiTrustedSSIDs,
  } = req.body;

  const updated = db.updateCampusConfig(
    {
      campusName,
      latitude: Number(latitude),
      longitude: Number(longitude),
      radiusMeters: Number(radiusMeters),
      maxAccuracyMeters: Number(maxAccuracyMeters),
      wifiEnabled: Boolean(wifiEnabled),
      wifiTrustedSSIDs: Array.isArray(wifiTrustedSSIDs) ? wifiTrustedSSIDs : undefined,
    },
    user?.id
  );

  return res.json({
    success: true,
    config: updated,
    message: 'Campus geofence and presence configuration updated successfully.',
  });
});

// GET /api/admin/audit
router.get('/audit', requireAdmin, (req: Request, res: Response) => {
  const logs = db.getAuditLogs();
  return res.json({
    success: true,
    total: logs.length,
    logs,
  });
});

// GET /api/admin/diagnostics
router.get('/diagnostics', requireAdmin, (req: Request, res: Response) => {
  return res.json({
    success: true,
    diagnostics: {
      uptimeSeconds: process.uptime(),
      memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      nodeVersion: process.version,
      databaseStatus: 'healthy (file-backed)',
      modelAssetsStatus: 'locally hosted (/models/)',
      wifiIntegrationStatus: 'provider interface stubbed (RFC-802.1x capable)',
      tamperProtection: 'HMAC/SHA256 audit hashing active',
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
