import {
  calculateHaversineDistance,
  calculateEuclideanDistance,
  db,
} from '../db';

async function runTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 RUNNING SENTINEL CAMPUS AUTOMATED VERIFICATION TEST SUITE');
  console.log('🧪 ========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, extraInfo?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${extraInfo ? `(${extraInfo})` : ''}`);
      failed++;
    }
  }

  // 1. Haversine Distance Test
  console.log('\n--- 1. Geofence & Haversine Distance Tests ---');
  const skitLat = 26.8227;
  const skitLon = 75.8647;

  // Exact point
  const distExact = calculateHaversineDistance(skitLat, skitLon, skitLat, skitLon);
  assert(distExact === 0, 'Haversine returns 0m for exact coordinate match');

  // SKIT Main Gate (~100m north)
  const distGate = calculateHaversineDistance(skitLat, skitLon, 26.8235, 75.8647);
  assert(distGate > 80 && distGate < 120, `SKIT Gate distance calculated as ~89m (Actual: ${distGate}m)`);

  // Jaipur Airport (~8km away)
  const distAirport = calculateHaversineDistance(skitLat, skitLon, 26.8286, 75.8056);
  assert(distAirport > 5000, `Jaipur Airport correctly detected as outside campus boundary (Distance: ${distAirport}m)`);

  // 2. Euclidean Distance Biometric Matching Test
  console.log('\n--- 2. Biometric Vector Euclidean Distance Tests ---');
  const vecA = Array.from({ length: 128 }, (_, i) => Math.sin(i * 0.1) * 0.1);
  const vecIdentical = [...vecA];
  const distIdentical = calculateEuclideanDistance(vecA, vecIdentical);
  assert(distIdentical === 0, 'Exact same face embedding yields distance 0.000');

  // Slight variation (same person under lighting variation)
  const vecSimilar = vecA.map((v) => v + 0.01);
  const distSimilar = calculateEuclideanDistance(vecA, vecSimilar);
  assert(distSimilar < 0.55, `Similar face vector matches within threshold (Distance: ${distSimilar.toFixed(3)} < 0.55)`);

  // Completely different person
  const vecDifferent = Array.from({ length: 128 }, (_, i) => Math.cos(i * 0.5) * 0.4);
  const distDifferent = calculateEuclideanDistance(vecA, vecDifferent);
  assert(distDifferent > 0.55, `Different person face vector correctly exceeds threshold (Distance: ${distDifferent.toFixed(3)} > 0.55)`);

  // 3. Database & Duplicate Prevention Tests
  console.log('\n--- 3. Duplicate Prevention & Idempotency Tests ---');
  const today = '2026-10-14';
  const testUserId = 'test_usr_staff_99';

  // Record 1st attendance
  const record1 = db.recordAttendance({
    idempotencyKey: `test_key_1_${Date.now()}`,
    userId: testUserId,
    userName: 'Prof. Test User',
    userRole: 'staff',
    identifierCode: 'SKIT-TEST-99',
    sessionType: 'daily_staff',
    checkpointType: 'entry',
    eventDate: today,
    capturedAt: `${today}T08:50:00Z`,
    serverVerifiedAt: `${today}T08:50:01Z`,
    status: 'confirmed',
    latitude: skitLat,
    longitude: skitLon,
    distanceMeters: 5,
    locationAccuracy: 10,
    faceDistance: 0.22,
    isOfflineSubmission: false,
  });
  assert(record1.status === 'confirmed', 'First attendance entry recorded successfully with confirmed status');

  // Check duplicate detection
  const duplicate = db.findDuplicateAttendance(testUserId, today, 'daily_staff', 'entry');
  assert(duplicate !== undefined, 'Duplicate attendance query finds existing confirmed record');
  assert(duplicate?.id === record1.id, 'Duplicate record matches original transaction ID');

  // 4. Biometric Enrollment & Consent Tests
  console.log('\n--- 4. Biometric Consent & Enrollment Tests ---');
  const enrollment = db.saveEnrollment(
    testUserId,
    vecA,
    'I provide explicit biometric consent for campus attendance.'
  );
  assert(enrollment.isActive === true, 'Enrollment recorded as active');
  assert(enrollment.consentGiven === true, 'Informed consent flag stored');

  const retrievedEnrollment = db.getEnrollmentByUserId(testUserId);
  assert(retrievedEnrollment?.id === enrollment.id, 'Retrieved enrollment matches stored descriptor');

  // 5. Campus Geofence Configuration Update Test
  console.log('\n--- 5. Campus Configuration Tests ---');
  const initialConfig = db.getCampusConfig();
  assert(initialConfig.radiusMeters === 450, 'Default campus radius configured to 450m');
  assert(initialConfig.maxAccuracyMeters === 80, 'Default maximum accuracy threshold set to 80m');

  // 6. Audit Trail Logging Test
  console.log('\n--- 6. Security Audit Trail Tests ---');
  const auditLogs = db.getAuditLogs();
  const enrollmentLog = auditLogs.find((l) => l.action === 'ENROLLMENT_COMPLETED' && l.actorId === testUserId);
  assert(enrollmentLog !== undefined, 'Security audit trail captures biometric enrollment event');

  console.log('\n========================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
