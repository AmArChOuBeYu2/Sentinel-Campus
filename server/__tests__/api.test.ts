import 'dotenv/config';
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

  // 7. Resend Email OTP Authentication & Security Tests (Requirement 10)
  console.log('\n--- 7. Resend Email OTP Authentication & Security Tests ---');
  const { otpService } = await import('../services/otpService');
  otpService.resetStoreForTesting();

  const testStudentId = 'usr_stu_test_001';

  // 7.1 Correct OTP verification
  otpService.seedOtpForTesting(testStudentId, 'student', '482910');
  const validRes = otpService.verifyOtp(testStudentId, 'student', '482910');
  assert(validRes.success === true, 'Correct 6-digit OTP verified successfully');

  // 7.2 Single-use / Reused OTP rejection
  const reusedRes = otpService.verifyOtp(testStudentId, 'student', '482910');
  assert(reusedRes.success === false, 'Reused OTP correctly rejected (Single-use enforcement)');

  // 7.3 Incorrect OTP rejection & attempt tracking
  otpService.seedOtpForTesting(testStudentId, 'student', '991122');
  const wrongRes = otpService.verifyOtp(testStudentId, 'student', '000000');
  assert(wrongRes.success === false, 'Incorrect OTP rejected with attempts decrement');

  // 7.4 Expired OTP rejection
  otpService.seedOtpForTesting(testStudentId, 'student', '778899', { isExpired: true });
  const expiredRes = otpService.verifyOtp(testStudentId, 'student', '778899');
  assert(expiredRes.success === false, 'Expired OTP (>5 min) correctly rejected');

  // 7.5 Role mismatch rejection
  otpService.seedOtpForTesting(testStudentId, 'student', '665544');
  const roleMismatchRes = otpService.verifyOtp(testStudentId, 'teacher', '665544');
  assert(roleMismatchRes.success === false, 'Role mismatch rejected (Student OTP attempted as Teacher)');

  // 7.6 Phone Credential Detection (Requirement 8)
  const isPhone = otpService.isPhoneCredential('+91 98765 43210');
  const isEmail = otpService.isPhoneCredential('amar.choubey@skit.ac.in');
  assert(isPhone === true, 'Phone number credential correctly identified as SMS');
  assert(isEmail === false, 'Email credential correctly identified for Resend delivery');

  // 7.7 Cooldown & Rate Limiting Enforcement
  const dummyUser = {
    id: 'usr_stu_0001',
    email: 'test.cooldown@skit.ac.in',
    phone: '+91 98765 43210',
    fullName: 'Test Cooldown User',
    role: 'student' as const,
    department: 'CSE',
    identifierCode: 'SC-TEST-0001',
    isActive: true,
    isEnrolled: false,
    createdAt: new Date().toISOString(),
  };

  const firstReq = await otpService.requestOtp(dummyUser, 'test.cooldown@skit.ac.in', 'student');
  assert(firstReq.success === true, 'First OTP request processed');

  const cooldownReq = await otpService.requestOtp(dummyUser, 'test.cooldown@skit.ac.in', 'student');
  assert(cooldownReq.success === false && cooldownReq.status === 429, 'Immediate second OTP request blocked by 60-second cooldown');

  // 7.8 Live Resend Email Delivery to Verified Owner Address (Requirement 10)
  if (process.env.RESEND_API_KEY) {
    const amarUser = db.getUserById('usr_stu_0001');
    if (amarUser) {
      otpService.resetStoreForTesting();
      const liveDispatch = await otpService.requestOtp(amarUser, 'httpsamar96@gmail.com', 'student');
      assert(liveDispatch.success === true, 'Live Resend email OTP delivered to owner address (httpsamar96@gmail.com)');
      assert(liveDispatch.isSimulated === false, 'Live delivery confirmed as non-simulated real Resend email');
    }
  }

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
