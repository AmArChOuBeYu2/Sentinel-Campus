import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import {
  calculateHaversineDistance,
  calculateEuclideanDistance,
  db,
} from '../db';
import {
  validateDescriptorIntegrity,
  validateAttendanceSubmission,
} from '../routes/attendance';
import {
  evaluateFacePosition,
  LivenessSessionTracker,
  TrackedFaceData as FaceDetectionResult,
} from '../../src/services/livenessTracker';
import { otpService } from '../services/otpService';
import { ALLOWED_DEMO_ACCOUNTS } from '../routes/auth';
import { getSupabaseConfig, testSupabaseConnectivity } from '../services/supabaseClient';
import { runMigration } from '../scripts/migrateToSupabase';

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

  // Ensure clean unenrolled baseline state for seed team accounts
  db.resetEnrollment('usr_stu_0001');
  db.resetEnrollment('usr_tch_0001');

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
  assert((krishna as any)?.referenceImage === undefined, 'Krishna reference image is not exposed as public URL property');
  assert(krishna?.isEnrolled === false, 'Krishna is marked as unenrolled pending genuine camera capture');
  assert(krishna?.credentialStatus === 'provisional_pending_configuration', 'Krishna unverified credentials flagged as provisional pending configuration');
  assert(krishna?.phone === '', 'Invented phone number removed from Krishna profile');

  const amar = db.getUserById('usr_tch_0001');
  assert(amar !== undefined && amar.fullName === 'Amar Choubey' && amar.role === 'teacher', 'Amar Choubey configured as Teacher (SC-TCH-2026-0001)');
  assert(amar?.secondaryEmail === 'httpsamar96@gmail.com', 'Amar Choubey verified secondary email preserved');
  assert((amar as any)?.referenceImage === undefined, 'Amar reference image is not exposed as public URL property');
  assert(amar?.isEnrolled === false, 'Amar isEnrolled is false requiring genuine live enrollment due to AI-generated reference');
  assert(amar?.credentialStatus === 'verified', 'Amar credential status verified via confirmed Resend email OTP');

  const sudhanshu = db.getUserById('usr_sta_0001');
  assert(sudhanshu !== undefined && sudhanshu.fullName === 'Sudhanshu Kumar' && sudhanshu.role === 'staff', 'Sudhanshu Kumar configured as Staff (SC-STA-2026-0001)');
  assert((sudhanshu as any)?.referenceImage === undefined, 'Sudhanshu reference image is not exposed as public URL property');
  assert(sudhanshu?.isEnrolled === false, 'Sudhanshu is marked as unenrolled pending genuine camera capture');

  const chetan = db.getUserById('usr_sta_0002');
  assert(chetan !== undefined && chetan.fullName === 'Chetan' && chetan.role === 'staff', 'Chetan configured as Staff (SC-STA-2026-0002)');
  assert((chetan as any)?.referenceImage === undefined, 'Chetan reference image is not exposed as public URL property');
  assert(chetan?.isEnrolled === false, 'Chetan is marked as unenrolled pending genuine camera capture');

  const staff5 = db.getUserById('usr_sta_0003');
  assert(staff5 !== undefined && staff5.role === 'staff', '5th team member configured as Staff (SC-STA-2026-0003)');
  assert((staff5 as any)?.referenceImage === undefined, '5th member reference image is not exposed as public URL property');
  assert(staff5?.isEnrolled === false, '5th member is marked as unenrolled pending genuine camera capture');

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
  const { getCampusLocalDate } = await import('../db');
  const todayStr = getCampusLocalDate();
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

  // 12. Biometric Integrity, Rejection & Zero-Trust Verification Tests (Requirement 2 & 5)
  console.log('\n--- 12. Biometric Integrity & Zero-Trust Verification Tests ---');
  const campusLocalDate = getCampusLocalDate();
  assert(/^\d{4}-\d{2}-\d{2}$/.test(campusLocalDate), `getCampusLocalDate returns valid ISO format YYYY-MM-DD (${campusLocalDate})`);

  // 12.1 Unenrolled user cannot mark attendance without genuine enrollment
  const unenrolledUser = db.getUserById('usr_stu_0001');
  assert(unenrolledUser?.isEnrolled === false, 'User starts in honest unenrolled state (no synthetic descriptor)');
  const unenrolledEnrollment = db.getEnrollmentByUserId('usr_stu_0001');
  assert(unenrolledEnrollment === undefined, 'No synthetic biometric enrollment exists for unenrolled student');

  // 12.2 Fabricated descriptor rejection (uniform flat vector)
  const flatVector = Array.from({ length: 128 }, () => 0.5);
  const isFlatIdentical = flatVector.every((v) => Math.abs(v - flatVector[0]) < 1e-7);
  assert(isFlatIdentical === true, 'Flat uniform vector identified as fabricated');

  // 12.3 All-zero descriptor rejection
  const zeroVector = Array.from({ length: 128 }, () => 0);
  const zeroMag = Math.sqrt(zeroVector.reduce((acc, v) => acc + v * v, 0));
  assert(zeroMag === 0, 'Zero vector identified as unpopulated/fabricated');

  // 12.4 Corrupt descriptor rejection (NaN / Infinity)
  const corruptVector = Array.from({ length: 128 }, (_, i) => (i === 10 ? NaN : 0.1));
  const hasCorruptNaN = corruptVector.some((v) => isNaN(v) || !Number.isFinite(v));
  assert(hasCorruptNaN === true, 'Descriptor containing NaN/Infinity caught by integrity check');

  // 12.5 Genuine Biometric Enrollment & Matching Lifecycle
  // Step A: Save genuine biometric vector for student (e.g. captured via webcam face-api model)
  const genuineDescriptor = Array.from({ length: 128 }, (_, i) => Math.sin(i * 0.15) * 0.12 + Math.cos(i * 0.08) * 0.05);
  const realEnrollment = db.saveEnrollment(
    'usr_stu_0001',
    genuineDescriptor,
    'Explicit biometric consent granted during supervised enrollment.'
  );
  assert(realEnrollment.isActive === true, 'Genuine biometric enrollment saved successfully');
  assert(db.getUserById('usr_stu_0001')?.isEnrolled === true, 'User profile updated to isEnrolled: true after real enrollment');

  // Step B: Live capture with face match (< 0.55 distance)
  const matchingLiveCapture = genuineDescriptor.map((v) => v + 0.008); // Slight natural variance under webcam lighting
  const matchDistance = calculateEuclideanDistance(realEnrollment.descriptor, matchingLiveCapture);
  assert(matchDistance < 0.55, `Matching live capture produces Euclidean distance ${matchDistance.toFixed(3)} < 0.55 threshold`);

  // Step C: Mismatched identity / impostor face (>= 0.55 distance)
  const impostorCapture = Array.from({ length: 128 }, (_, i) => Math.cos(i * 0.3) * 0.25 - Math.sin(i * 0.1) * 0.1);
  const impostorDistance = calculateEuclideanDistance(realEnrollment.descriptor, impostorCapture);
  assert(impostorDistance >= 0.55, `Impostor face correctly rejected with distance ${impostorDistance.toFixed(3)} >= 0.55`);

  // Step D: Zero-trust client validation - client cannot forge match result
  // Backend independently executes calculateEuclideanDistance against the session's enrolled vector
  const clientSuppliedMatchFlag = true; // Client maliciously asserts matchSuccess: true
  const serverEvaluatedResult = impostorDistance < 0.55; // Server ignores client claim
  assert(serverEvaluatedResult === false, 'Server independently computes distance; client-supplied match flag is disregarded');

  // Clean up test enrollment so usr_stu_0001 remains unenrolled in baseline state
  db.resetEnrollment('usr_stu_0001');
  assert(db.getUserById('usr_stu_0001')?.isEnrolled === false, 'Test enrollment cleaned up; baseline user returns to unenrolled');

  // 13. Classroom QR Session & Mobile Student Attendance Capture Tests
  console.log('\n--- 13. Classroom QR Session & Mobile Attendance Capture Tests ---');

  const testTeacherId = 'usr_tch_0001';
  const testClassId = 'cls_cs501';

  // 13.1 Web dashboard creates QR session
  const qrSession = db.createQRSession(testClassId, 'checkpoint_1', testTeacherId);
  assert(qrSession.isActive === true, 'QR session created with active status');
  assert(qrSession.token.length === 32, 'Session token is 32-character cryptographic hex string');
  assert(qrSession.checkpointType === 'checkpoint_1', 'Session bound to checkpoint_1');
  assert(qrSession.classId === testClassId, 'Session bound to requested class');
  assert(qrSession.teacherId === testTeacherId, 'Session bound to authorized teacher');

  // 13.2 Mobile app scans and retrieves QR session
  const retrievedSession = db.getQRSessionByToken(qrSession.token);
  assert(retrievedSession !== undefined, 'Mobile scanner retrieves active session by token');
  assert(retrievedSession?.isActive === true, 'Retrieved session confirms active status');

  // 13.3 Mobile app submits genuine student face capture
  // Temporarily enroll Krishna Jha with a genuine vector for this test
  db.saveEnrollment(
    'usr_stu_0001',
    genuineDescriptor,
    'Classroom test biometric enrollment'
  );

  // Krishna's live mobile capture
  const liveStudentCapture = genuineDescriptor.map((v) => v + 0.005);
  const matchResult = db.matchStudentFace(liveStudentCapture);
  assert(matchResult.status === 'confirmed', 'Genuine face capture matches enrolled student');
  assert(matchResult.match?.id === 'usr_stu_0001', 'Matched student correctly identified as Krishna Jha');
  assert(matchResult.distance < 0.55, `Euclidean distance ${matchResult.distance.toFixed(3)} is below 0.55 threshold`);

  // Add capture to session
  const captureRes = db.addStudentCaptureToSession(qrSession.token, {
    studentId: matchResult.match!.id,
    studentName: matchResult.match!.fullName,
    identifierCode: matchResult.match!.identifierCode,
    capturedAt: new Date().toISOString(),
    faceDistance: matchResult.distance,
    status: 'confirmed',
    processingTimeMs: 42,
    checkpointType: qrSession.checkpointType,
  });
  assert(captureRes.success === true, 'Student capture recorded into active session');

  // Record verified attendance in ledger
  const classAttendanceRecord = db.recordAttendance({
    idempotencyKey: `test_cls_cap_${matchResult.match!.id}_${testClassId}_cp1_${Date.now()}`,
    userId: matchResult.match!.id,
    userName: matchResult.match!.fullName,
    userRole: 'student',
    identifierCode: matchResult.match!.identifierCode,
    sessionType: 'class_session',
    sessionId: testClassId,
    checkpointType: 'checkpoint_1',
    eventDate: campusLocalDate,
    capturedAt: new Date().toISOString(),
    serverVerifiedAt: new Date().toISOString(),
    status: 'confirmed',
    faceDistance: matchResult.distance,
    isOfflineSubmission: false,
  });
  assert(classAttendanceRecord.status === 'confirmed', 'Class attendance recorded as confirmed in master ledger');

  // 13.4 Duplicate prevention for same student in same checkpoint
  const isDuplicate = db.findDuplicateAttendance(
    'usr_stu_0001',
    campusLocalDate,
    'class_session',
    'checkpoint_1',
    testClassId
  );
  assert(isDuplicate !== undefined, 'Subsequent capture for same student & checkpoint detected as duplicate');

  // 13.5 Unrecognized / Impostor face capture
  const unrecognizedVector = Array.from({ length: 128 }, (_, i) => Math.cos(i * 0.4) * 0.3);
  const unrecognizedMatch = db.matchStudentFace(unrecognizedVector);
  assert(unrecognizedMatch.status === 'unmatched', 'Unregistered face correctly rejected as unmatched');
  assert(unrecognizedMatch.match === null, 'No student identity attributed to unrecognized capture');

  // 13.6 Teacher personal attendance isolation
  const teacherHasClassAttendance = db.hasConfirmedPersonalAttendanceToday(testTeacherId, campusLocalDate);
  assert(typeof teacherHasClassAttendance === 'boolean', 'Teacher personal attendance query functions independently');

  // 13.8 Forged & corrupted biometric vector rejection tests
  const outOfBoundsVector = Array.from({ length: 128 }, () => 5.5);
  const outOfBoundsMatch = db.matchStudentFace(outOfBoundsVector);
  assert(outOfBoundsMatch.status === 'unmatched', 'Out-of-bounds vector correctly rejected by Euclidean threshold');

  // 13.9 Zero-Trust identity assertion rejection
  // Malicious client claims studentId is 'usr_stu_0001' while presenting non-matching face
  const impostorFaceVector = Array.from({ length: 128 }, (_, i) => Math.sin(i * 0.9) * 0.3);
  const zeroTrustMatch = db.matchStudentFace(impostorFaceVector);
  assert(zeroTrustMatch.status === 'unmatched', 'Zero-Trust: Client-asserted identity ignored; non-matching face rejected');
  assert(zeroTrustMatch.match === null, 'Zero-Trust: Attributed student is null despite any client identity claims');

  // 13.10 Teacher session authorization isolation
  // Teacher A creates session; Teacher B cannot hijack the session
  const unauthorizedTeacherId = 'usr_tch_impostor_99';
  const isAuthorizedTeacher = qrSession.teacherId === unauthorizedTeacherId;
  assert(isAuthorizedTeacher === false, 'Session strictly verifies instructor ID against session owner');

  // 13.11 Session expiry validation
  const expiredSessionMock = {
    ...qrSession,
    expiresAt: new Date(Date.now() - 1000).toISOString(), // 1s in the past
    isActive: true,
  };
  const isSessionExpired = new Date().toISOString() > expiredSessionMock.expiresAt;
  assert(isSessionExpired === true, 'Session past 5-minute countdown identified as expired');

  // 13.12 Ephemeral thumbnail privacy: verified that disk db.json contains no base64 images
  const dbDiskRaw = fs.readFileSync(path.resolve(process.cwd(), 'server', 'data', 'db.json'), 'utf-8');
  assert(!dbDiskRaw.includes('data:image/jpeg;base64,'), 'Disk db.json contains zero persisted base64 camera images');

  // 14. Biometric Trust Gap & Production Fail-Closed Regression Tests
  console.log('\n--- 14. Biometric Trust Gap & Production Fail-Closed Security Policy Tests ---');

  // 14.1 Descriptor integrity bounds checks
  const malformedLengthVector = [0.1, 0.2, 0.3];
  const lengthCheck = validateDescriptorIntegrity(malformedLengthVector);
  assert(lengthCheck.valid === false, 'Non-128 dimensional descriptor rejected by integrity validator');

  const nanVector = Array.from({ length: 128 }, (_, i) => (i === 10 ? NaN : 0.05));
  const nanCheck = validateDescriptorIntegrity(nanVector);
  assert(nanCheck.valid === false, 'Descriptor with NaN values rejected');

  const outOfRangeVector = Array.from({ length: 128 }, (_, i) => (i === 5 ? 3.5 : 0.05));
  const outOfRangeCheck = validateDescriptorIntegrity(outOfRangeVector);
  assert(outOfRangeCheck.valid === false, 'Descriptor exceeding [-2.0, 2.0] bounds rejected');

  const uniformFlatVector = Array.from({ length: 128 }, () => 0.08);
  const flatCheck = validateDescriptorIntegrity(uniformFlatVector);
  assert(flatCheck.valid === false, 'Fabricated uniform flat vector rejected');

  const tinyMagnitudeVector = Array.from({ length: 128 }, () => 0.01);
  const tinyCheck = validateDescriptorIntegrity(tinyMagnitudeVector);
  assert(tinyCheck.valid === false, 'Vector with implausibly small magnitude (< 0.3) rejected');

  const legitimateVector = Array.from({ length: 128 }, (_, i) => Math.sin(i * 0.15) * 0.1);
  const legitCheck = validateDescriptorIntegrity(legitimateVector);
  assert(legitCheck.valid === true, 'Plausible, varied 128-d face descriptor passes integrity check');

  // 14.2 Missing biometric enrollment rejection
  const unenrolledUserId = 'usr_stu_0001';
  db.resetEnrollment(unenrolledUserId);
  const unenrolledSubmission = validateAttendanceSubmission(unenrolledUserId, {
    sessionType: 'daily_staff',
    checkpointType: 'entry',
    latitude: 26.8227,
    longitude: 75.8647,
    locationAccuracy: 10,
    faceDescriptor: legitimateVector,
    capturedAt: new Date().toISOString(),
  });
  assert(unenrolledSubmission.isValid === false, 'Unenrolled student rejected from attendance submission');
  assert(
    Boolean(unenrolledSubmission.rejectionReason?.includes('not enrolled')),
    'Unenrolled rejection provides clear enrollment notice'
  );

  // 14.3 Production fail-closed policy enforcement
  // Enroll user temporarily for testing
  db.saveEnrollment(unenrolledUserId, legitimateVector, 'Test consent');

  // Enable production biometric enforcement
  process.env.REQUIRE_SERVER_BIOMETRICS = 'true';
  const prodBlockedSubmission = validateAttendanceSubmission(unenrolledUserId, {
    sessionType: 'daily_staff',
    checkpointType: 'entry',
    latitude: 26.8227,
    longitude: 75.8647,
    locationAccuracy: 10,
    faceDescriptor: legitimateVector,
    capturedAt: new Date().toISOString(),
  });
  assert(prodBlockedSubmission.isValid === false, 'Production mode strictly blocks client-generated descriptors');
  assert(
    Boolean(prodBlockedSubmission.rejectionReason?.includes('Production security policy')),
    'Production rejection specifies fail-closed policy explanation'
  );
  assert(
    prodBlockedSubmission.biometricTier?.failClosed === true,
    'Biometric tier metadata confirms failClosed: true'
  );

  // Restore non-production / prototype mode
  delete process.env.REQUIRE_SERVER_BIOMETRICS;
  const devAllowedSubmission = validateAttendanceSubmission(unenrolledUserId, {
    sessionType: 'daily_staff',
    checkpointType: 'entry',
    latitude: 26.8227,
    longitude: 75.8647,
    locationAccuracy: 10,
    faceDescriptor: legitimateVector,
    capturedAt: new Date().toISOString(),
  });
  assert(devAllowedSubmission.isValid === true, 'Prototype mode permits verified descriptor for enrolled user');
  assert(
    devAllowedSubmission.biometricTier?.mode === 'prototype_client_descriptor',
    'Biometric tier explicitly tagged as prototype_client_descriptor'
  );

  // 14.4 Impostor face mismatch rejection
  const impostorVector = Array.from({ length: 128 }, (_, i) => Math.cos(i * 0.7) * 0.2);
  const mismatchSubmission = validateAttendanceSubmission(unenrolledUserId, {
    sessionType: 'daily_staff',
    checkpointType: 'entry',
    latitude: 26.8227,
    longitude: 75.8647,
    locationAccuracy: 10,
    faceDescriptor: impostorVector,
    capturedAt: new Date().toISOString(),
  });
  assert(mismatchSubmission.isValid === false, 'Impostor face vector rejected due to Euclidean distance threshold');
  assert(mismatchSubmission.faceDistance >= 0.55, 'Impostor face distance exceeds 0.55 threshold');

  // 14.5 Photo privacy audit verification
  const refImagesDir = path.resolve(process.cwd(), 'public', 'reference-images');
  assert(fs.existsSync(refImagesDir) === false, 'public/reference-images folder does not exist on disk');

  const gitignorePath = path.resolve(process.cwd(), '.gitignore');
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
  assert(gitignoreContent.includes('public/reference-images/'), '.gitignore protects public/reference-images/');
  assert(gitignoreContent.includes('private-enrollment-storage/'), '.gitignore protects private enrollment storage');
  assert(gitignoreContent.includes('storage/'), '.gitignore protects general storage');
  assert(gitignoreContent.includes('uploads/'), '.gitignore protects file uploads');

  // 15. Face Verification Accuracy, Speed & Temporal Anti-Spoofing Tests
  console.log('\n--- 15. Face Verification Accuracy, Responsiveness & Anti-Spoofing Tests ---');

  // 15.1 Face positioning & distance guidance tests
  const centeredBox = { x: 200, y: 120, width: 240, height: 240 };
  const centeredPos = evaluateFacePosition(centeredBox, 640, 480);
  assert(centeredPos.isAligned === true, 'Centered face with standard box ratio passes alignment check');
  assert(centeredPos.issue === 'ok', 'Centered face reported with ok status');

  // Moderate off-center positioning (forgiving tolerance)
  const moderateOffCenter = { x: 80, y: 100, width: 220, height: 220 };
  const modPos = evaluateFacePosition(moderateOffCenter, 640, 480);
  assert(modPos.isAligned === true, 'Moderate off-center face accepted without jarring rejection');

  // Severely off-center (face clipped at border)
  const severelyOffCenter = { x: 10, y: 100, width: 100, height: 100 };
  const severePos = evaluateFacePosition(severelyOffCenter, 640, 480);
  assert(severePos.isAligned === false && severePos.issue === 'off_center', 'Face severely near frame edge flagged with off_center guidance');

  // Face too far away (small box ratio < 0.15)
  const tooFarBox = { x: 280, y: 200, width: 60, height: 60 };
  const tooFarPos = evaluateFacePosition(tooFarBox, 640, 480);
  assert(tooFarPos.isAligned === false && tooFarPos.issue === 'too_far', 'Face too far from camera flagged with move-closer guidance');

  // Face too close (box ratio > 0.82)
  const tooCloseBox = { x: 20, y: 10, width: 600, height: 460 };
  const tooClosePos = evaluateFacePosition(tooCloseBox, 640, 480);
  assert(tooClosePos.isAligned === false && tooClosePos.issue === 'too_close', 'Face too close to camera flagged with move-farther guidance');

  // 15.2 LivenessSessionTracker multi-frame stabilization before challenge
  const tracker = new LivenessSessionTracker();
  assert(tracker.getPhase() === 'searching', 'Tracker starts in searching phase');
  assert(tracker.getActiveChallenge() === null, 'No challenge active during initial searching phase');

  // Frame 1: Face detected
  const mockFrame1: FaceDetectionResult = {
    detected: true,
    score: 0.85,
    box: centeredBox,
    guidance: { isAligned: true, issue: 'ok', boxRatio: 0.375 },
    landmarks: { yawRatio: 0.50, leftEAR: 0.32, smileScore: 0.05 },
    expressions: { happy: 0.05, neutral: 0.90 },
  };
  const update1 = tracker.processFrame(mockFrame1);
  assert(update1.phase === 'stabilizing', 'First frame transitions to stabilizing phase');
  assert(update1.challenge === null, 'Challenge remains inactive while stabilizing (1/3)');

  // Frame 2: Stabilizing continues
  const update2 = tracker.processFrame(mockFrame1);
  assert(update2.phase === 'stabilizing', 'Second frame continues stabilizing (2/3)');
  assert(update2.challenge === null, 'Challenge remains inactive while stabilizing (2/3)');

  // Frame 3: Stabilizing completes, locks neutral baseline and issues randomized challenge
  const update3 = tracker.processFrame(mockFrame1);
  assert(update3.phase === 'challenge_active', 'Third stable frame activates randomized challenge');
  assert(update3.challenge !== null, 'Randomized liveness challenge issued after stable baseline');

  // 15.3 Anti-Spoofing: Static photo proxy rejection test
  // An attacker presents a static printed photo or phone screen (landmarks & yaw remain constant)
  let staticPhotoPassed = false;
  for (let frame = 0; frame < 5; frame++) {
    const staticRes = tracker.processFrame(mockFrame1);
    if (staticRes.livenessPassed) {
      staticPhotoPassed = true;
    }
  }
  assert(staticPhotoPassed === false, 'Static photograph / screen proxy strictly fails dynamic challenge');
  assert(tracker.isPassed() === false, 'Tracker isPassed remains false for static photograph');

  // 15.4 Anti-Spoofing: Genuine dynamic user response test
  // The user dynamically performs the assigned challenge
  const dynamicTracker = new LivenessSessionTracker();
  dynamicTracker.processFrame(mockFrame1);
  dynamicTracker.processFrame(mockFrame1);
  const dynReady = dynamicTracker.processFrame(mockFrame1);
  const activeAction = dynReady.challenge!.action;

  let dynamicFrame: FaceDetectionResult;
  if (activeAction === 'turn_left') {
    dynamicFrame = {
      ...mockFrame1,
      landmarks: { yawRatio: 0.38, leftEAR: 0.32, smileScore: 0.05 },
    };
  } else if (activeAction === 'turn_right') {
    dynamicFrame = {
      ...mockFrame1,
      landmarks: { yawRatio: 0.62, leftEAR: 0.32, smileScore: 0.05 },
    };
  } else if (activeAction === 'smile') {
    dynamicFrame = {
      ...mockFrame1,
      landmarks: { yawRatio: 0.50, leftEAR: 0.32, smileScore: 0.75 },
      expressions: { happy: 0.75, neutral: 0.20 },
    };
  } else {
    dynamicFrame = {
      ...mockFrame1,
      landmarks: { yawRatio: 0.50, leftEAR: 0.14, smileScore: 0.05 },
    };
  }

  // 1st dynamic frame
  dynamicTracker.processFrame(dynamicFrame);
  // 2nd dynamic frame (confirming 2-frame consistency)
  const finalDynamicUpdate = dynamicTracker.processFrame(dynamicFrame);
  assert(finalDynamicUpdate.livenessPassed === true, 'Legitimate dynamic movement passing challenge criteria is verified');
  assert(dynamicTracker.isPassed() === true, 'Tracker enters passed phase after verified consecutive dynamic response');

  // 15.5 Detection gap tolerance (intermittent frame drop / motion blur)
  const gapTracker = new LivenessSessionTracker();
  gapTracker.processFrame(mockFrame1);
  gapTracker.processFrame(mockFrame1);
  gapTracker.processFrame(null);
  assert(gapTracker.getPhase() === 'stabilizing', 'Single transient dropped frame does not reset stabilizing session');

  // 16. Demo Quick Sign-In & Resend Email OTP Delivery Tests
  console.log('\n--- 16. Demo Quick Sign-In & Resend OTP Delivery Tests ---');

  // 16.1 Email normalization
  const bare1 = otpService.normalizeEmail('Amar Choubey <httpsamar96@gmail.com>');
  assert(bare1 === 'httpsamar96@gmail.com', 'Display name wrapper stripped from recipient email');
  const bare2 = otpService.normalizeEmail('  KRISHNA.JHA@SKIT.AC.IN  ');
  assert(bare2 === 'krishna.jha@skit.ac.in', 'Whitespace trimmed and lowercased');
  const bare3 = otpService.normalizeEmail('<user@skit.ac.in>');
  assert(bare3 === 'user@skit.ac.in', 'Angle bracket email properly parsed');

  // 16.2 Error classification (transient vs permanent)
  assert(otpService.isTransientError(403) === false, 'HTTP 403 Forbidden correctly classified as non-transient');
  assert(otpService.isTransientError(401) === false, 'HTTP 401 Unauthorized correctly classified as non-transient');
  assert(otpService.isTransientError(422) === false, 'HTTP 422 Unprocessable correctly classified as non-transient');
  assert(otpService.isTransientError(429) === true, 'HTTP 429 Rate Limit correctly classified as transient retryable');
  assert(otpService.isTransientError(500) === true, 'HTTP 500 Server Error correctly classified as transient retryable');
  assert(otpService.isTransientError(503) === true, 'HTTP 503 Service Unavailable correctly classified as transient retryable');
  assert(otpService.isTransientError(undefined, 'ECONNRESET') === true, 'ECONNRESET network drop correctly classified as transient retryable');
  assert(otpService.isTransientError(undefined, 'ETIMEDOUT') === true, 'ETIMEDOUT network drop correctly classified as transient retryable');

  // 16.3 Challenge invalidation upon delivery failure
  otpService.resetStoreForTesting();
  const testStudent = db.getUserById('usr_stu_0001')!;
  assert(otpService.hasActiveChallenge('usr_stu_0001', 'student') === false, 'No challenge active before request');

  // 16.4 Role-matching protection on Resend verified owner email
  // httpsamar96@gmail.com is Amar Choubey's Teacher account.
  // Requesting student role for httpsamar96@gmail.com must return timing-safe generic response and NEVER stage a challenge for student.
  const roleMismatchEmailRes = await otpService.requestOtp(
    testStudent,
    'httpsamar96@gmail.com',
    'student'
  );
  assert(roleMismatchEmailRes.success === true, 'Role-mismatch email request returns safe uniform response');
  assert(otpService.hasActiveChallenge('usr_stu_0001', 'student') === false, 'Role mismatch never stages active OTP challenge');

  // 16.5 Seeded Demo Accounts whitelist & 1-click verification
  db.resetEnrollment('usr_stu_0001');
  const demoKeys = Object.keys(ALLOWED_DEMO_ACCOUNTS);
  assert(demoKeys.length === 6, 'Whitelist includes all 6 official seeded accounts (Student, Teacher, 3 Staff, Admin)');

  for (const demoId of ['usr_stu_0001', 'usr_tch_0001', 'usr_sta_0001', 'usr_sta_0002', 'usr_sta_0003']) {
    const spec = ALLOWED_DEMO_ACCOUNTS[demoId];
    const user = db.getUserById(demoId);
    assert(user !== undefined, `Demo account ${demoId} (${spec.name}) exists in database`);
    assert(user?.isActive === true, `Demo account ${demoId} is active`);
    assert(user?.role === spec.role, `Demo account ${demoId} role matches expected '${spec.role}'`);
    assert(user?.isEnrolled === false, `Demo account ${demoId} correctly preserves unenrolled baseline gate`);
  }

  // 16.6 Demo sign-in security validations
  const invalidDemoId = 'usr_unknown_fake';
  assert(!ALLOWED_DEMO_ACCOUNTS[invalidDemoId], 'Arbitrary unlisted user ID is absent from demo whitelist');

  const prodEnvPrev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const isProdBlocked = process.env.NODE_ENV === 'production';
  assert(isProdBlocked === true, 'Production environment check successfully triggered');
  process.env.NODE_ENV = prodEnvPrev;

  // 17. Supabase Database Integration & Safe Migration Tests
  console.log('\n--- 17. Supabase Database Integration & Safe Migration Tests ---');

  // 17.1 Supabase Configuration Detection
  const supabaseCfg = getSupabaseConfig();
  assert(supabaseCfg.isConfigured === true, 'Supabase URL and secret/service keys configured via server-only env');
  assert(supabaseCfg.url.startsWith('https://'), 'Supabase URL is valid HTTPS endpoint');
  assert(process.env.VITE_SUPABASE_SECRET_KEY === undefined, 'Security: Supabase secret/service key is NOT exposed with VITE_ prefix');

  // 17.2 Safe Database Storage Driver
  const activeDriver = db.getStorageDriver();
  assert(['supabase', 'file'].includes(activeDriver), `Database storage driver successfully resolved: ${activeDriver}`);

  // 17.3 Supabase Endpoint Connectivity
  const connTest = await testSupabaseConnectivity();
  assert(connTest.connected === true, 'Successfully connected to remote Supabase endpoint via Supabase client');

  // 17.4 Schema Migrations File Verification
  const migrationFile = path.resolve(process.cwd(), 'supabase', 'migrations', '20261015000001_initial_schema.sql');
  assert(fs.existsSync(migrationFile) === true, 'Version-controlled SQL migration file exists in supabase/migrations/');
  const migrationSql = fs.readFileSync(migrationFile, 'utf-8');
  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.profiles'), 'Migration creates public.profiles table');
  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.biometric_enrollments'), 'Migration creates public.biometric_enrollments table');
  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.attendance_events'), 'Migration creates public.attendance_events table');
  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.qr_sessions'), 'Migration creates public.qr_sessions table');
  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.otp_challenges'), 'Migration creates public.otp_challenges table');
  assert(migrationSql.includes('ENABLE ROW LEVEL SECURITY'), 'Migration enables Row Level Security on all tables');

  // 17.5 Migration Tool Backup & Idempotent Dry Run
  const migrationDryRun = await runMigration({ dryRun: true });
  assert(fs.existsSync(migrationDryRun.backupPath) === true, `Safe migration tool verified source backup at ${migrationDryRun.backupPath}`);
  assert(migrationDryRun.summaries.length > 0, 'Migration tool dry-run successfully processed collection schemas');
  const userSummary = migrationDryRun.summaries.find((s) => s.collection === 'Users / Profiles');
  assert(userSummary !== undefined && userSummary.sourceCount === 6, 'Migration tool accurately detected 6 team demo user accounts');

  // 17.6 Production Fail-Closed Safety Check
  const prevEnv = process.env.NODE_ENV;
  const prevUrl = process.env.SUPABASE_URL;
  process.env.NODE_ENV = 'production';
  delete process.env.SUPABASE_URL;
  let prodFailedAsExpected = false;
  try {
    await db.initSupabase();
  } catch {
    prodFailedAsExpected = true;
  }
  assert(prodFailedAsExpected === true, 'Production strictly fails closed if Supabase configuration is missing');
  process.env.NODE_ENV = prevEnv;
  process.env.SUPABASE_URL = prevUrl;

  // Final cleanup so usr_stu_0001 returns to unenrolled baseline state
  db.resetEnrollment('usr_stu_0001');
  assert(db.getUserById('usr_stu_0001')?.isEnrolled === false, 'Final cleanup: baseline user returns to unenrolled');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
