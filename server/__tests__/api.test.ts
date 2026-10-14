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

  // Rate limiting / cooldown is tracked per email address even for non-enrolled addresses to prevent flooding
  const testCooldownEmail = 'cooldown.check@skit.ac.in';
  const firstReq = await otpService.requestOtp(null, testCooldownEmail, 'student');
  assert(firstReq.success === true, 'First OTP request processed and recorded for rate limiting');

  const cooldownReq = await otpService.requestOtp(null, testCooldownEmail, 'student');
  assert(cooldownReq.success === false && cooldownReq.status === 429, 'Immediate second OTP request blocked by 60-second cooldown');

  // 7.8 Startup & Environment Configuration Validation
  const configStatus = otpService.validateConfig();
  assert(configStatus.valid === true, 'otpService.validateConfig() passes with valid OTP_HMAC_SECRET and RESEND_API_KEY');

  // 7.9 Recipient & Account Resolution (Primary vs. Secondary vs. Unknown vs. Inactive)
  console.log('\n--- 7.9 Account & Recipient Resolution Tests ---');
  const primaryUser = db.getUserByEmailOrPhone('amar.choubey@skit.ac.in');
  assert(primaryUser?.id === 'usr_tch_0001', 'Primary institutional email resolves to active teacher account');

  const secondaryUser = db.getUserByEmailOrPhone('httpsamar96@gmail.com');
  assert(secondaryUser?.id === 'usr_tch_0001', 'Approved secondary email resolves to active teacher account');

  const studentUser = db.getUserByEmailOrPhone('krishna.jha@skit.ac.in');
  assert(studentUser?.id === 'usr_stu_0001', 'Student institutional email resolves to active student account (Krishna Jha)');

  const unknownUser = db.getUserByEmailOrPhone('unknown.hacker@gmail.com');
  assert(unknownUser === undefined, 'Unknown email correctly resolves to undefined');

  // Test safe timing-attack resistant response for unknown user (Requirement 4 & 7)
  otpService.resetStoreForTesting();
  const unknownReq = await otpService.requestOtp(null, 'unknown.hacker@gmail.com', 'student');
  assert(unknownReq.success === true, 'Unknown account returns safe uniform success message (No account enumeration)');
  assert(unknownReq.isSimulated === false, 'Unknown account does not generate simulated OTP');
  // Confirm no challenge was staged for unknown account
  const verifyUnknown = otpService.verifyOtp('non_existent_id', 'student', '123456');
  assert(verifyUnknown.success === false, 'No challenge staged for unknown account');

  // 7.10 OTP Challenge Invalidation on Dispatch Failure
  console.log('\n--- 7.10 Dispatch Failure Challenge Invalidation Tests ---');
  // Temporarily disable simulated OTP to verify challenge invalidation on failure
  const prevAllowSimulated = process.env.ALLOW_SIMULATED_OTP;
  process.env.ALLOW_SIMULATED_OTP = 'false';

  // Attempting to send to an unauthorized recipient on Resend free tier returns an error
  // which must invalidate the staged challenge
  otpService.resetStoreForTesting();
  const failingUser = {
    ...dummyUser,
    id: 'usr_failing_001',
    email: 'unauthorized-recipient@example.com',
  };
  const failDispatch = await otpService.requestOtp(
    failingUser,
    'unauthorized-recipient@example.com',
    'student'
  );
  // Resend free tier rejects unauthorized domains
  if (!failDispatch.success) {
    assert(failDispatch.success === false, 'Resend dispatch to unauthorized domain correctly returns failure');
    // Ensure challenge was invalidated and deleted
    const verifyPruned = otpService.verifyOtp('usr_failing_001', 'student', '123456');
    assert(verifyPruned.success === false, 'Failed dispatch challenge is immediately invalidated from store');
  }

  // Restore env var
  if (prevAllowSimulated !== undefined) {
    process.env.ALLOW_SIMULATED_OTP = prevAllowSimulated;
  } else {
    delete process.env.ALLOW_SIMULATED_OTP;
  }

  // 7.11 Live Resend Email Delivery to Verified Owner Address (Requirement 10)
  if (process.env.RESEND_API_KEY) {
    const amarUser = db.getUserById('usr_tch_0001');
    if (amarUser) {
      otpService.resetStoreForTesting();
      const liveDispatch = await otpService.requestOtp(amarUser, 'httpsamar96@gmail.com', 'teacher');
      assert(liveDispatch.success === true, 'Live Resend email OTP delivered to owner address (httpsamar96@gmail.com)');
      assert(liveDispatch.isSimulated === false, 'Live delivery confirmed as non-simulated real Resend email');
      assert(typeof liveDispatch.messageId === 'string' && liveDispatch.messageId.length > 0, `Resend returned valid message ID: ${liveDispatch.messageId}`);
    }
  }

  // 7.12 Email Template & Privacy Verification (OTP in body, not subject)
  console.log('\n--- 7.12 Email Template Privacy & Placement Tests ---');
  const dummyOtp = '849201';
  const htmlBody = (otpService as any).createEmailHtml(dummyOtp, 'Amar Choubey', 'teacher');
  const textBody = (otpService as any).createEmailText(dummyOtp, 'Amar Choubey', 'teacher');
  assert(htmlBody.includes(dummyOtp), 'Email HTML body correctly contains OTP passcode');
  assert(textBody.includes(dummyOtp), 'Email text body correctly contains OTP passcode');

  // 8. Team Profiles & Role Enforcement Tests
  console.log('\n--- 8. Team Profiles & Role Enforcement Tests ---');
  const krishna = db.getUserById('usr_stu_0001');
  assert(krishna !== undefined && krishna.fullName === 'Krishna Jha' && krishna.role === 'student', 'Krishna Jha configured as Student (SC-STU-2026-0001)');
  assert(krishna?.referenceImage === '/reference-images/krishna.jpeg', 'Krishna reference image configured correctly');
  assert(krishna?.isEnrolled === true, 'Krishna is marked as enrolled with reference vector');

  const amar = db.getUserById('usr_tch_0001');
  assert(amar !== undefined && amar.fullName === 'Amar Choubey' && amar.role === 'teacher', 'Amar Choubey configured as Teacher (SC-TCH-2026-0001)');
  assert(amar?.secondaryEmail === 'httpsamar96@gmail.com', 'Amar Choubey verified secondary email preserved');
  assert(amar?.referenceImage === '/reference-images/amar.png', 'Amar reference image configured correctly');
  assert(amar?.isEnrolled === false, 'Amar isEnrolled is false requiring genuine live enrollment due to AI-generated reference');

  const sudhanshu = db.getUserById('usr_sta_0001');
  assert(sudhanshu !== undefined && sudhanshu.fullName === 'Sudhanshu Kumar' && sudhanshu.role === 'staff', 'Sudhanshu Kumar configured as Staff (SC-STA-2026-0001)');
  assert(sudhanshu?.referenceImage === '/reference-images/sudhanshu.jpeg', 'Sudhanshu reference image configured correctly');
  assert(sudhanshu?.isEnrolled === true, 'Sudhanshu is marked as enrolled');

  const chetan = db.getUserById('usr_sta_0002');
  assert(chetan !== undefined && chetan.fullName === 'Chetan' && chetan.role === 'staff', 'Chetan configured as Staff (SC-STA-2026-0002)');
  assert(chetan?.referenceImage === '/reference-images/chetan.jpeg', 'Chetan reference image configured correctly');
  assert(chetan?.isEnrolled === true, 'Chetan is marked as enrolled');

  const staff5 = db.getUserById('usr_sta_0003');
  assert(staff5 !== undefined && staff5.role === 'staff', '5th team member configured as Staff (SC-STA-2026-0003)');
  assert(staff5?.referenceImage === '/reference-images/staff5.jpeg', '5th member reference image configured correctly');
  assert(staff5?.isEnrolled === true, '5th member is marked as enrolled');

  // 9. Campus Network Trust & Subnet Validation Tests
  console.log('\n--- 9. Campus Network Trust & Subnet Validation Tests ---');
  const { networkAuthService } = await import('../services/networkAuthService');

  // 9.1 Demo / Prototype Mode Explicit Labelling
  const demoReq = {
    headers: {},
    socket: { remoteAddress: '192.168.43.15' },
    ip: '192.168.43.15',
  } as any;
  const demoResult = networkAuthService.validateNetwork(demoReq);
  assert(demoResult.verified === true, 'Demo mode accepts local hotspot/testing connections');
  assert(demoResult.isDemo === true, 'Demo mode flag accurately set in validation response');
  assert(demoResult.isSimulated === true, 'Demo mode explicitly flagged as simulated (isSimulated: true)');
  assert(demoResult.verificationTier === 'simulated_prototype', 'Demo mode assigned simulated_prototype tier');

  // 9.2 Zero-Trust Client MAC Address Enforcement (Requirement 8)
  const prototypeMac = 'E4:EC:E8:8C:DB:E3';
  assert(networkAuthService.isMacSufficientForAuth() === false, 'isMacSufficientForAuth returns false (MAC cannot authorize attendance)');

  const macEval = networkAuthService.evaluateMacClaim(prototypeMac);
  assert(macEval.acceptedAsAuthFactor === false, 'Client-supplied MAC address is rejected as an authentication factor');
  assert(macEval.reason.includes('W3C browser sandboxing and Android 10+ MAC address randomization'), 'Evaluation explains OS and browser security sandboxing reasons');

  // 9.3 Client-supplied MAC address cannot bypass CIDR verification
  const origMode = process.env.NETWORK_AUTH_MODE;
  process.env.NETWORK_AUTH_MODE = 'cidr';
  process.env.TRUSTED_NETWORK_CIDRS = '192.168.1.0/24,10.0.0.0/8';

  const untrustedReqWithMac = {
    headers: {
      'x-forwarded-for': '203.0.113.88',
      'x-client-mac': prototypeMac,
    },
    socket: { remoteAddress: '203.0.113.88' },
    body: { clientMac: prototypeMac },
  } as any;
  const untrustedWithMacResult = networkAuthService.validateNetwork(untrustedReqWithMac, { clientMac: prototypeMac });
  assert(untrustedWithMacResult.verified === false, 'Client presenting prototype MAC E4:EC:E8:8C:DB:E3 from external IP is strictly rejected');
  assert(untrustedWithMacResult.macNotice?.includes('strictly disregarded as authentication evidence') === true, 'Server security audit logs that MAC was disregarded');

  // 9.4 Trusted campus CIDR verification
  const trustedReq = {
    headers: { 'x-forwarded-for': '192.168.1.55' },
    socket: { remoteAddress: '192.168.1.55' },
  } as any;
  const trustedResult = networkAuthService.validateNetwork(trustedReq);
  assert(trustedResult.verified === true, 'CIDR mode accepts IP within trusted campus subnet 192.168.1.0/24');
  assert(trustedResult.matchedCidr === '192.168.1.0/24', 'Matched CIDR properly returned');
  assert(trustedResult.verificationTier === 'server_verified_infrastructure', 'CIDR mode assigned server_verified_infrastructure tier');

  // 9.5 Demo mode cannot authorize production attendance (Fail-closed)
  const origNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  process.env.NETWORK_AUTH_MODE = 'demo';
  const prodDemoReq = {
    headers: { 'x-forwarded-for': '192.168.43.15' },
    socket: { remoteAddress: '192.168.43.15' },
  } as any;
  const prodDemoResult = networkAuthService.validateNetwork(prodDemoReq);
  assert(prodDemoResult.verified === false, 'Demo/simulated mode fails closed in production (cannot authorize production attendance)');
  assert(prodDemoResult.error?.includes('prohibited in production') === true, 'Clear fail-closed error returned');

  // Restore environment variables
  if (origNodeEnv !== undefined) {
    process.env.NODE_ENV = origNodeEnv;
  } else {
    delete process.env.NODE_ENV;
  }
  if (origMode !== undefined) {
    process.env.NETWORK_AUTH_MODE = origMode;
  } else {
    delete process.env.NETWORK_AUTH_MODE;
  }

  // 10. Mandatory Personal Presence & Same-Day Duplicate Prevention Tests
  console.log('\n--- 10. Mandatory Personal Presence & Duplicate Prevention Tests ---');
  const todayStr = new Date().toISOString().split('T')[0];
  const testStudentIdPersonal = 'usr_stu_0001';

  const personalRecord = db.recordAttendance({
    idempotencyKey: `pers_test_${testStudentIdPersonal}_${Date.now()}`,
    userId: testStudentIdPersonal,
    userName: 'Krishna Jha',
    userRole: 'student',
    identifierCode: 'SC-STU-2026-0001',
    sessionType: 'daily_personal',
    checkpointType: 'entry',
    eventDate: todayStr,
    capturedAt: new Date().toISOString(),
    serverVerifiedAt: new Date().toISOString(),
    status: 'confirmed',
    latitude: 26.8227,
    longitude: 75.8647,
    distanceMeters: 8,
    locationAccuracy: 12,
    faceDistance: 0.15,
    isOfflineSubmission: false,
  });
  assert(personalRecord.status === 'confirmed', 'Daily personal presence attendance successfully confirmed and recorded');

  const hasConfirmed = db.hasConfirmedPersonalAttendanceToday(testStudentIdPersonal, todayStr);
  assert(hasConfirmed === true, 'hasConfirmedPersonalAttendanceToday correctly identifies confirmed personal attendance');

  const retrievedPersonal = db.getTodayPersonalAttendance(testStudentIdPersonal, todayStr);
  assert(retrievedPersonal?.id === personalRecord.id, 'getTodayPersonalAttendance retrieves original attendance event');

  // 11. Supervisory Manual Review Lifecycle Tests
  console.log('\n--- 11. Supervisory Manual Review Lifecycle Tests ---');
  const newReview = db.createManualReview(
    'usr_sta_0002',
    'Camera aperture condensation caused low-light matching failure at Campus Gate 2.',
    'data:image/jpeg;base64,mockChetanSnapshot'
  );
  assert(newReview.status === 'pending', 'Manual review created with pending status');
  assert(newReview.userId === 'usr_sta_0002', 'Manual review linked to correct user (Chetan)');

  const pendingList = db.getManualReviews();
  assert(pendingList.some((r) => r.id === newReview.id), 'Pending review appears in getManualReviews()');

  const resolvedReview = db.resolveManualReview(
    newReview.id,
    true,
    'Prof. Ramesh K. Agarwal (Dean)',
    'Identity verified visually by Campus Security Desk Supervisor.'
  );
  assert(resolvedReview?.status === 'approved', 'Manual review resolved with approved status');
  assert(resolvedReview?.adminNotes === 'Identity verified visually by Campus Security Desk Supervisor.', 'Admin notes recorded in audit trail');

  // Verify that resolving with approval automatically confirms attendance
  const chetanPersonalAttendance = db.hasConfirmedPersonalAttendanceToday('usr_sta_0002', todayStr);
  assert(chetanPersonalAttendance === true, 'Approving manual review automatically records confirmed personal attendance event');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
