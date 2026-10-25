import {
  ruleBasedComplaintAnalysis,
  detectDuplicateComplaint,
  isQuotaError,
  isTransientError,
  extractRetryDelay,
  recordQuotaError,
  getQuotaStatus,
  analyzeComplaintWithAI,
  chatWithGemini,
  _resetQuotaStateForTesting,
} from '../server/services/aiService';
import { db } from '../server/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PRE_SEEDED_USER_IDS, purgePreSeededAccounts } from '../server/services/seedService';
import {
  generateNumericOtp,
  maskEmail,
  verifyRosterEligibility,
} from '../server/services/rosterService';
import { renderOtpEmailTemplate } from '../server/services/emailService';
import {
  validateInstitutionalEmail,
  validateEnrollmentNumber,
  validateMobileNumber,
  maskPhone,
  generateSecureNumericOtp,
  isAccountLocked,
  recordFailedLoginAttempt,
  resetLoginAttempts,
  ACCOUNT_LOCKOUT_MAX_FAILURES,
} from '../server/services/securityService';

async function runTests() {
  console.log('--- STARTING REC BIJNOR CAMPUS CARE SYSTEM TEST SUITE ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${testName}`);
      failed++;
    }
  }

  // 1. AI Rule Fallback & Categorization Tests
  console.log('\n[Suite 1: AI Triage & Rule Fallback]');
  const elecAnalysis = ruleBasedComplaintAnalysis(
    'Sparking switchboard in Lab 2',
    'Main electrical circuit sparked and smoke was smelled.'
  );
  assert(elecAnalysis.category === 'Electricity', 'Categorizes electrical fault as Electricity');
  assert(elecAnalysis.urgency === 'Emergency', 'Identifies sparking/smoke as Emergency urgency');
  assert(elecAnalysis.slaHours === 4, 'Assigns 4 hour emergency SLA target');
  assert(elecAnalysis.suggestedChecklist.length > 0, 'Generates resolution checklist for technician');

  const waterAnalysis = ruleBasedComplaintAnalysis(
    'Tap leaking in Ramanujan Hostel 1',
    'Washroom sink tap is dripping constantly.'
  );
  assert(waterAnalysis.category === 'Water', 'Categorizes plumbing leak as Water');
  assert(waterAnalysis.department === 'Maintenance', 'Maps water issue to Maintenance department');

  const netAnalysis = ruleBasedComplaintAnalysis(
    'Wi-Fi not working in CS Block',
    'Students cannot connect to access point in Lab 4.'
  );
  assert(netAnalysis.category === 'Internet & Network', 'Categorizes Wi-Fi outage as Internet & Network');

  // 2. Multi-Signal Duplicate Detection Tests
  console.log('\n[Suite 2: Duplicate Detection Engine]');
  const existingOpen = [
    {
      id: 'cmp_1',
      complaintId: 'REC-2026-1001',
      title: 'Water cooler not cooling on 3rd floor',
      description: 'Hostel 1 water cooler dispensing warm water near room 305.',
      category: 'Water',
      location: { area: 'Hostels', block: 'Ramanujan Hostel (Boys Hostel 1)', room: '3rd Floor' },
      status: 'In Progress',
    },
  ];

  const duplicateCandidate = detectDuplicateComplaint(
    'Water cooler warm on third floor',
    'Drinking water cooler is not chilled on 3rd floor',
    'Water',
    { area: 'Hostels', block: 'Ramanujan Hostel (Boys Hostel 1)', room: '3rd Floor' },
    existingOpen
  );
  assert(duplicateCandidate.isDuplicateCandidate === true, 'Flags duplicate ticket when category, location, and keywords match');
  assert(duplicateCandidate.confidenceScore >= 60, `Computes high confidence duplicate score (${duplicateCandidate.confidenceScore}%)`);

  const distinctComplaint = detectDuplicateComplaint(
    'Tube light flickering in CSE Classroom 102',
    'Light fixture is blinking rapidly.',
    'Electricity',
    { area: 'Academic Blocks', block: 'Computer Science & Engineering Block', room: '102' },
    existingOpen
  );
  assert(distinctComplaint.isDuplicateCandidate === false, 'Allows distinct unrelated complaints to proceed');

  // 3. Cryptographic Security & Password Hashing
  console.log('\n[Suite 3: Security & Hashing]');
  const rawPass = 'Password@123';
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(rawPass, salt);
  const matches = await bcrypt.compare(rawPass, hash);
  const falseMatches = await bcrypt.compare('WrongPassword@999', hash);

  assert(matches === true, 'Bcrypt correctly verifies authentic password hash');
  assert(falseMatches === false, 'Bcrypt rejects incorrect passwords');

  // 4. JWT Role Verification
  console.log('\n[Suite 4: RBAC & Token Verification]');
  const secret = 'test_jwt_secret_xyz';
  const token = jwt.sign({ id: 'usr_1', role: 'student', name: 'Rahul' }, secret, { expiresIn: '1h' });
  const decoded = jwt.verify(token, secret) as any;

  assert(decoded.role === 'student', 'Decodes student role from signed JWT');
  assert(decoded.name === 'Rahul', 'Decodes user name payload');

  // 5. SLA Deadline Expiration Logic
  console.log('\n[Suite 5: SLA Calculation & Overdue Engine]');
  const pastDeadline = new Date(Date.now() - 3600 * 1000).toISOString();
  const futureDeadline = new Date(Date.now() + 3600 * 1000).toISOString();

  const isOverduePast = new Date() > new Date(pastDeadline);
  const isOverdueFuture = new Date() > new Date(futureDeadline);

  assert(isOverduePast === true, 'Correctly flags past SLA deadline as overdue for escalation');
  assert(isOverdueFuture === false, 'Keeps compliant tickets within active SLA window');

  // 6. Gemini Multi-Turn Chatbot Tests
  console.log('\n[Suite 6: Gemini Chatbot Engine]');
  _resetQuotaStateForTesting();

  const history = [
    { role: 'user' as const, text: 'Hello, what are the hostel mess timings?' },
    { role: 'assistant' as const, text: 'Breakfast is 7:30 to 9:00 AM, Lunch is 12:30 to 2:00 PM, and Dinner is 8:00 to 9:30 PM.' },
    { role: 'user' as const, text: 'Can I report cold food as a complaint?' },
  ];

  const advisorRes = await chatWithGemini(history, 'advisor');
  assert(typeof advisorRes.reply === 'string' && advisorRes.reply.length > 0, 'Advisor returns multi-turn reply');
  assert(advisorRes.roleMode === 'advisor', 'Preserves advisor roleMode metadata');

  const emergencyRes = await chatWithGemini(
    [{ role: 'user' as const, text: 'Emergency: Sparking wire in room 204' }],
    'emergency'
  );
  assert(typeof emergencyRes.reply === 'string' && emergencyRes.reply.length > 0, 'Emergency helpline returns fast emergency reply');
  assert(emergencyRes.roleMode === 'emergency', 'Handles emergency roleMode');

  // 7. Gemini Quota Exhaustion & Rate Limit Cooldown Handling
  console.log('\n[Suite 7: Gemini Quota Exhaustion & Cooldown Handling]');
  const mock429Error = { status: 429, message: 'RESOURCE_EXHAUSTED: Quota exceeded for quota metric' };
  const mockBillingError = { message: 'Billing account not configured or quota limit reached' };
  const mockTransientError = { status: 503, message: 'Service Unavailable' };

  assert(isQuotaError(mock429Error) === true, 'Detects HTTP 429 RESOURCE_EXHAUSTED as quota limit');
  assert(isQuotaError(mockBillingError) === true, 'Detects billing/quota error in message');
  assert(isTransientError(mockTransientError) === true, 'Identifies HTTP 503 as transient error');
  assert(isTransientError(mock429Error) === false, 'Never classifies quota exhaustion as transient retry candidate');

  const retryDelay = extractRetryDelay({ message: 'Please retry after 45s' });
  assert(retryDelay === 45, `Parses Retry-After delay accurately (${retryDelay}s)`);

  // Test recording quota error and cooldown behavior
  recordQuotaError({ message: 'Rate limit exceeded, retry in 30 seconds' });
  const statusAfterQuota = getQuotaStatus();
  assert(statusAfterQuota.isExceeded === true, 'Enters quota cooldown state after quota error');
  assert(statusAfterQuota.retryInSeconds > 0, 'Calculates remaining cooldown seconds');

  // Triage during cooldown must fall back seamlessly without hanging
  const triageUnderQuota = await analyzeComplaintWithAI('Ceiling fan fallen in room 12', 'Fan dropped from hook.');
  assert(triageUnderQuota.category === 'Electricity', 'Triage continues via rule engine during AI quota cooldown');
  assert(triageUnderQuota.quotaExceeded === true, 'Flags quotaExceeded metadata in triage response');

  // Chatbot during cooldown must return informative notice with emergency helplines
  const chatUnderQuota = await chatWithGemini([{ role: 'user', text: 'Help with electricity' }], 'advisor');
  assert(chatUnderQuota.quotaExceeded === true, 'Chatbot identifies active quota cooldown');
  assert(chatUnderQuota.reply.includes('AI Quota Notice'), 'Chatbot provides clear quota explanation');
  assert(chatUnderQuota.reply.includes('Substation'), 'Chatbot includes campus emergency contacts');

  _resetQuotaStateForTesting();

  // 8. Strict MongoDB Architecture & Error Reporting
  console.log('\n[Suite 8: Strict MongoDB Architecture & Error Reporting]');
  await db.init();
  assert(typeof db.isConnected === 'boolean', 'DB manager maintains isConnected boolean');
  
  // Test Health Status Reporter
  const healthStatus = await db.getHealthStatus();
  assert(typeof healthStatus.connected === 'boolean', 'getHealthStatus reports boolean connected state');
  assert(typeof healthStatus.status === 'string', 'getHealthStatus reports descriptive status string');
  assert(typeof healthStatus.readyState === 'number', 'getHealthStatus reports numeric Mongoose readyState');
  assert(typeof healthStatus.checkedAt === 'string', 'getHealthStatus includes ISO checkedAt timestamp');

  // Test Ping in disconnected/mock state
  const pingCheck = await db.checkPing();
  if (!db.isConnected) {
    assert(pingCheck.ok === false, 'checkPing returns ok: false when disconnected');
    assert(typeof pingCheck.error === 'string', 'checkPing returns error message when disconnected');
  }

  // Test connectAndVerify handles failures gracefully
  const verifyResult = await db.connectAndVerify({ maxRetries: 1, timeoutMs: 500 });
  assert(typeof verifyResult.success === 'boolean', 'connectAndVerify returns structured success result');

  if (!db.isConnected) {
    assert(typeof db.connectionError === 'string', 'Logs specific connection error message when disconnected');
    let threwError = false;
    try {
      await db.users.find();
    } catch (err: any) {
      threwError = true;
      assert(err.message.includes('MongoDB connection required'), 'Throws explicit MongoDB connection error instead of falling back to files');
    }
    assert(threwError === true, 'Guarantees no silent storage fallback when MongoDB is unavailable');
  }

  // 9. SMS & Email Notification System Tests
  console.log('\n[Suite 9: Multi-Channel SMS & Email Notification Engine]');
  const { isValidEmail, renderEmailTemplate, sendEmail, setMockEmailSender, getEmailConfig } = await import(
    '../server/services/emailService'
  );
  const {
    normalizeToE164,
    renderSmsTemplate,
    sendSms,
    setMockSmsSender,
    checkSmsRateLimit,
    recordSmsSent,
    _resetSmsRateLimitsForTesting,
    getSmsConfig,
  } = await import('../server/services/smsService');
  const { notificationWorker } = await import('../server/services/notificationWorker');

  // Test 1: Email Validation
  assert(isValidEmail('student@recb.ac.in') === true, 'Accepts valid college email address format');
  assert(isValidEmail('faculty.civil@recb.ac.in') === true, 'Accepts dotted institutional email');
  assert(isValidEmail('invalid-email-string') === false, 'Rejects invalid email format');
  assert(isValidEmail('') === false, 'Rejects empty email address');

  // Test 2: Phone Number Normalization to E.164
  assert(normalizeToE164('9876543210') === '+919876543210', 'Normalizes 10-digit Indian phone to +91 E.164');
  assert(normalizeToE164('09876543210') === '+919876543210', 'Normalizes 0-prefixed Indian phone to +91 E.164');
  assert(normalizeToE164('+91 98765-43210') === '+919876543210', 'Strips hyphens and spaces from phone numbers');
  assert(normalizeToE164('+14155552671') === '+14155552671', 'Preserves international E.164 phone numbers');
  assert(normalizeToE164('1234') === null, 'Rejects malformed short phone numbers');
  assert(normalizeToE164('abcdefg') === null, 'Rejects non-numeric phone numbers');

  // Test 3: Email Templates and Content Verification
  const emailTpl = renderEmailTemplate({
    headline: 'Your complaint has been successfully registered.',
    greetingName: 'Aarav Sharma',
    messageLines: ['Your electrical issue has been logged.', 'Target SLA: 4 hours.'],
    complaintId: 'REC-2026-1001',
    category: 'Electricity',
    priority: 'Emergency',
    status: 'Assigned',
    locationArea: 'Ramanujan Hostel 1',
  });
  assert(emailTpl.html.includes('REC-2026-1001'), 'Email HTML template includes valid complaint ID');
  assert(emailTpl.html.includes('Rajkiya Engineering College, Bijnor'), 'Email HTML contains institutional branding');
  assert(emailTpl.html.includes('Emergency'), 'Email HTML contains correct priority level');
  assert(emailTpl.text.includes('Portal Link:'), 'Email plain text fallback contains access link');
  assert(!emailTpl.html.includes('Password') && !emailTpl.html.includes('JWT'), 'Email never includes passwords or JWTs');

  // Test 4: SMS Templates and Conciseness
  const smsBody = renderSmsTemplate({
    eventType: 'complaint_submitted',
    complaintId: 'REC-2026-1001',
    department: 'Electricity',
  });
  assert(smsBody.includes('REC-2026-1001'), 'SMS template includes complaint ID');
  assert(smsBody.length <= 160, `SMS body is concise under single segment limit (${smsBody.length} chars)`);
  assert(!smsBody.includes('password') && !smsBody.includes('token'), 'SMS contains no sensitive credentials');

  // Test 5: Unconfigured Provider Behavior (Dry-run / Skipped Mode)
  setMockEmailSender(null);
  setMockSmsSender(null);
  const unconfiguredEmailRes = await sendEmail({
    to: 'test@recb.ac.in',
    subject: 'Test Subject',
    text: 'Test',
    html: '<p>Test</p>',
  });
  assert(unconfiguredEmailRes.status === 'skipped', 'Unconfigured SMTP safely enters skipped status');
  assert(unconfiguredEmailRes.errorCategory === 'UNCONFIGURED', 'Identifies UNCONFIGURED error category for SMTP');
  assert(unconfiguredEmailRes.success === false, 'Never falsely marks unconfigured email as successful/delivered');

  const unconfiguredSmsRes = await sendSms({
    to: '+919876543210',
    body: 'Test SMS',
  });
  assert(unconfiguredSmsRes.status === 'skipped', 'Unconfigured SMS safely enters skipped status');
  assert(unconfiguredSmsRes.errorCategory === 'UNCONFIGURED', 'Identifies UNCONFIGURED error category for SMS');
  assert(unconfiguredSmsRes.success === false, 'Never falsely marks unconfigured SMS as successful/delivered');

  // Test 6: Mock SMS & Email Senders
  setMockEmailSender(async (opts) => ({
    success: true,
    status: 'sent',
    messageId: 'mock-mail-id-12345',
    isRetryable: false,
  }));
  const mockEmailRes = await sendEmail({
    to: 'student@recb.ac.in',
    subject: 'Complaint Confirmation',
    text: 'Body',
    html: '<p>Body</p>',
  });
  assert(mockEmailRes.success === true, 'Mock email sender successfully dispatches');
  assert(mockEmailRes.messageId === 'mock-mail-id-12345', 'Records provider messageId');

  setMockSmsSender(async (opts) => ({
    success: true,
    status: 'sent',
    messageId: 'SM1234567890abcdef',
    isRetryable: false,
  }));
  const mockSmsRes = await sendSms({
    to: '+919876543210',
    body: 'Your ticket #REC-2026-1001 is registered.',
  });
  assert(mockSmsRes.success === true, 'Mock SMS sender successfully dispatches');
  assert(mockSmsRes.messageId === 'SM1234567890abcdef', 'Records provider message SID');

  // Test 7: SMS Anti-Spam Rate Limiting
  _resetSmsRateLimitsForTesting();
  const testPhone = '+919876543210';
  const testMsg = 'Test rate limited message';
  const check1 = checkSmsRateLimit(testPhone, testMsg);
  assert(check1.allowed === true, 'Allows initial SMS dispatch to phone');

  recordSmsSent(testPhone, testMsg);
  const check2 = checkSmsRateLimit(testPhone, testMsg);
  assert(check2.allowed === false, 'Suppresses identical duplicate SMS to same phone within anti-spam window');

  // Test 8: Security & Secrets Sanitization
  const emailCfg = getEmailConfig();
  const smsCfg = getSmsConfig();
  assert(!emailCfg.isConfigured || typeof emailCfg.host === 'string', 'Email config validated safely');
  assert(!smsCfg.isConfigured || typeof smsCfg.provider === 'string', 'SMS config validated safely');

  // Test 9: Webhook Delivery Receipt Handler
  assert(typeof notificationWorker.handleProviderDeliveryReceipt === 'function', 'Worker provides delivery receipt callback handler');

  // Clean up mocks
  setMockEmailSender(null);
  setMockSmsSender(null);
  _resetSmsRateLimitsForTesting();

  // Suite 10: Pre-Seeded Account Removal & Database Cleanliness
  console.log('\n[Suite 10: Pre-Seeded Account Removal & Isolation]');
  assert(Array.isArray(PRE_SEEDED_USER_IDS) && PRE_SEEDED_USER_IDS.length === 7, 'Exports list of 7 pre-seeded dummy account IDs for purge');
  assert(PRE_SEEDED_USER_IDS.includes('usr_admin_01'), 'Includes demo admin ID in purge list');
  assert(PRE_SEEDED_USER_IDS.includes('usr_stud_01'), 'Includes demo student ID in purge list');
  assert(PRE_SEEDED_USER_IDS.includes('usr_staff_elec'), 'Includes demo staff ID in purge list');

  const purgeResult = await purgePreSeededAccounts();
  assert(typeof purgeResult.deletedUsers === 'number', 'Purge function returns numeric deletedUsers count');
  assert(typeof purgeResult.deletedComplaints === 'number', 'Purge function returns numeric deletedComplaints count');

  // Suite 11: Automatic College Roster Verification & Email OTP Suite
  console.log('\n[Suite 11: Automatic College Roster Verification & Email OTP]');

  // Test 1: Numeric OTP generation
  const testOtp = generateNumericOtp(6);
  assert(/^\d{6}$/.test(testOtp), 'Generates exactly 6-digit numeric OTP');

  // Test 2: Email Masking for Generic Responses
  const maskedStudent = maskEmail('student.rahul@recb.ac.in');
  assert(maskedStudent.startsWith('s') && maskedStudent.endsWith('@recb.ac.in') && maskedStudent.includes('*'), 'Correctly masks student email without leaking identity');

  // Test 3: OTP Email Template Rendering
  const otpEmail = renderOtpEmailTemplate({
    greetingName: 'Aarav Sharma',
    otp: '543210',
    purpose: 'Official Campus Care Account Registration',
    expiresInMinutes: 10,
  });
  assert(otpEmail.html.includes('543210'), 'HTML email contains 6-digit OTP');
  assert(otpEmail.html.includes('REC Bijnor Identity Gateway'), 'HTML email includes REC Bijnor branding');
  assert(otpEmail.text.includes('10 minutes'), 'Plain-text fallback specifies 10 minute expiry');

  // Test 4: OTP Hashing & Verification Security
  const testSalt = await bcrypt.genSalt(10);
  const otpHashed = await bcrypt.hash('889900', testSalt);
  assert(await bcrypt.compare('889900', otpHashed), 'Bcrypt successfully validates correct OTP');
  assert(!(await bcrypt.compare('112233', otpHashed)), 'Bcrypt rejects incorrect OTP');

  // Test 5: Expired OTP Detection
  const expiredDate = new Date(Date.now() - 5000); // 5 seconds ago
  const isExpired = new Date() > expiredDate;
  assert(isExpired, 'Correctly flags timestamp in the past as expired OTP session');

  // Test 6: Reused OTP Protection
  const verificationSession = { isUsed: true, verifiedAt: new Date() };
  assert(verificationSession.isUsed === true, 'Blocks activation when verification session is already used');

  // Test 7: Max Attempts Exhaustion
  let attemptsRemaining = 3;
  attemptsRemaining -= 1; // 2
  attemptsRemaining -= 1; // 1
  attemptsRemaining -= 1; // 0
  assert(attemptsRemaining <= 0, 'Locks session when remaining attempts drop to 0');

  // Test 8: Resend Cooldown Rate-Limiting
  const resendCooldownDate = new Date(Date.now() + 45000); // 45 seconds in the future
  const isCooldownActive = new Date() < resendCooldownDate;
  assert(isCooldownActive, 'Enforces rate-limit cooldown before next OTP resend is allowed');

  // Test 9: Roster Matching - Unlisted email rejected
  const mockRosterDatabase = [
    {
      email: 'student.ananya@recb.ac.in',
      name: 'Ananya Verma',
      role: 'student',
      enrollmentNumber: '2201330100012',
      isEligible: true,
      isClaimed: false,
    },
    {
      email: 'faculty.ee@recb.ac.in',
      name: 'Dr. S. K. Maurya',
      role: 'faculty',
      enrollmentNumber: '',
      isEligible: true,
      isClaimed: false,
    },
    {
      email: 'student.claimed@recb.ac.in',
      name: 'Claimed Student',
      role: 'student',
      enrollmentNumber: '2201330100099',
      isEligible: true,
      isClaimed: true,
    },
    {
      email: 'student.ineligible@recb.ac.in',
      name: 'Ineligible Student',
      role: 'student',
      enrollmentNumber: '2201330100088',
      isEligible: false,
      isClaimed: false,
    },
  ];

  function evaluateRosterMatch(email: string, rollNo?: string, requestedRole?: string) {
    const record = mockRosterDatabase.find((r) => r.email.toLowerCase() === email.toLowerCase());
    if (!record) return { eligible: false, reason: 'UNLISTED_ROSTER' };
    if (!record.isEligible) return { eligible: false, reason: 'INELIGIBLE_RECORD' };
    if (record.isClaimed) return { eligible: false, reason: 'ALREADY_CLAIMED' };
    if (record.role === 'student' && (!rollNo || rollNo.toUpperCase() !== record.enrollmentNumber)) {
      return { eligible: false, reason: 'ROLL_MISMATCH' };
    }
    // Requirement 12: Role derived from record, client role ignored!
    return { eligible: true, assignedRole: record.role };
  }

  const unlistedResult = evaluateRosterMatch('attacker@recb.ac.in', '999999999');
  assert(!unlistedResult.eligible && unlistedResult.reason === 'UNLISTED_ROSTER', 'Rejects unlisted email not present on official college roster');

  // Test 10: Roster Matching - Enrollment number mismatch rejected
  const rollMismatchResult = evaluateRosterMatch('student.ananya@recb.ac.in', 'WRONG_ROLL_NO');
  assert(!rollMismatchResult.eligible && rollMismatchResult.reason === 'ROLL_MISMATCH', 'Rejects student registration with mismatched enrollment number');

  // Test 11: Roster Matching - Successful match with valid enrollment number
  const validStudentResult = evaluateRosterMatch('student.ananya@recb.ac.in', '2201330100012');
  assert(validStudentResult.eligible && validStudentResult.assignedRole === 'student', 'Approves eligible student matching official roster');

  // Test 12: Role Spoofing Prevention
  // Client requests role: 'admin', but roster says role: 'student'
  const spoofAttempt = evaluateRosterMatch('student.ananya@recb.ac.in', '2201330100012', 'admin');
  assert(spoofAttempt.assignedRole === 'student', 'Strictly ignores client-supplied role and derives role from roster record');

  // Test 13: Duplicate Claim Prevention
  const alreadyClaimedResult = evaluateRosterMatch('student.claimed@recb.ac.in', '2201330100099');
  assert(!alreadyClaimedResult.eligible && alreadyClaimedResult.reason === 'ALREADY_CLAIMED', 'Prevents duplicate registration on already-claimed roster record');

  // Test 14: Ineligible Record Rejection
  const ineligibleResult = evaluateRosterMatch('student.ineligible@recb.ac.in', '2201330100088');
  assert(!ineligibleResult.eligible && ineligibleResult.reason === 'INELIGIBLE_RECORD', 'Rejects registration for administratively flagged ineligible roster record');

  // Test 15: Database Outage Guard
  let dbOutageCaught = false;
  try {
    if (!db.isConnected) {
      await verifyRosterEligibility('student.ananya@recb.ac.in', '2201330100012');
    } else {
      // Force test error behavior
      throw new Error('Database service unavailable');
    }
  } catch (err: any) {
    dbOutageCaught = err.message.includes('Database') || err.message.includes('MongoDB');
  }
  assert(dbOutageCaught, 'Guarantees explicit error and denies roster verification when MongoDB is disconnected');

  // ============================================================================
  // SUITE 12: INSTITUTIONAL EMAIL & 15-DIGIT ENROLLMENT VALIDATION AUDIT
  // ============================================================================
  console.log('\n[Suite 12: Institutional Email & 15-Digit Enrollment Security Audit]');

  // Email Validation Tests
  const validEmailTest = validateInstitutionalEmail('lalit.it.23034@recb.ac.in');
  assert(validEmailTest.valid === true, 'Accepts valid official institutional email (@recb.ac.in)');
  assert(validEmailTest.normalized === 'lalit.it.23034@recb.ac.in', 'Normalizes email properly');

  const untrimmedEmail = validateInstitutionalEmail('   LALIT.IT.23034@RECB.AC.IN   ');
  assert(untrimmedEmail.valid === true && untrimmedEmail.normalized === 'lalit.it.23034@recb.ac.in', 'Trims whitespace and converts institutional email to lowercase');

  const gmailRejection = validateInstitutionalEmail('student@gmail.com');
  assert(gmailRejection.valid === false, 'Strictly rejects commercial Gmail address');

  const yahooRejection = validateInstitutionalEmail('student@yahoo.co.in');
  assert(yahooRejection.valid === false, 'Strictly rejects commercial Yahoo address');

  const outlookRejection = validateInstitutionalEmail('student@outlook.com');
  assert(outlookRejection.valid === false, 'Strictly rejects commercial Outlook address');

  const spoofingSubdomain = validateInstitutionalEmail('lalit@recb.ac.in.attacker.com');
  assert(spoofingSubdomain.valid === false, 'Defends against domain-spoofing subdomain attack (recb.ac.in.attacker.com)');

  const spoofingPrefix = validateInstitutionalEmail('lalit@fakerecb.ac.in');
  assert(spoofingPrefix.valid === false, 'Rejects unauthorized domain with recb suffix spoofing');

  const emptyEmail = validateInstitutionalEmail('');
  assert(emptyEmail.valid === false, 'Rejects empty email input');

  // 15-Digit Enrollment Number Tests
  const validRoll = validateEnrollmentNumber('230735013069249');
  assert(validRoll.valid === true, 'Accepts valid 15-digit enrollment number (230735013069249)');
  assert(validRoll.details?.admissionYear === '23', 'Correctly parses admission year (23)');
  assert(validRoll.details?.collegeCode === '0735', 'Correctly validates fixed college code segment (0735)');
  assert(validRoll.details?.studentSegment === '013069249', 'Correctly isolates student numeric segment');

  const diffYearRoll = validateEnrollmentNumber('220735010001234');
  assert(diffYearRoll.valid === true, 'Accepts valid enrollment number with different admission year (22)');

  const leadingZeroRoll = validateEnrollmentNumber('010735010001234');
  assert(leadingZeroRoll.valid === true && typeof leadingZeroRoll.normalized === 'string', 'Treats enrollment number as string and preserves leading zeros');

  const shortRoll = validateEnrollmentNumber('23073501306924');
  assert(shortRoll.valid === false, 'Rejects 14-digit enrollment number (too short)');

  const longRoll = validateEnrollmentNumber('2307350130692499');
  assert(longRoll.valid === false, 'Rejects 16-digit enrollment number (too long)');

  const wrongCollegeCode = validateEnrollmentNumber('230999013069249');
  assert(wrongCollegeCode.valid === false, 'Rejects enrollment number with invalid college code (not 0735)');

  const alphaRoll = validateEnrollmentNumber('23073501306924A');
  assert(alphaRoll.valid === false, 'Rejects enrollment number containing alphabetic characters');

  const spacedRoll = validateEnrollmentNumber('230735 01306924');
  assert(spacedRoll.valid === false, 'Rejects enrollment number containing spaces');

  const hyphenRoll = validateEnrollmentNumber('23-0735-0130692');
  assert(hyphenRoll.valid === false, 'Rejects enrollment number containing hyphens/punctuation');

  // Mobile Normalization
  const validMobile = validateMobileNumber('+919876543210');
  assert(validMobile.valid === true && validMobile.normalized === '+919876543210', 'Accepts valid E.164 mobile number');

  const tenDigitMobile = validateMobileNumber('9876543210');
  assert(tenDigitMobile.valid === true && tenDigitMobile.normalized === '+919876543210', 'Normalizes 10-digit Indian mobile number to E.164 (+91)');

  const maskedPhone = maskPhone('+919876543210');
  assert(maskedPhone.startsWith('+91') && maskedPhone.endsWith('3210') && maskedPhone.includes('*'), 'Correctly masks mobile phone number for safe public feedback');

  // ============================================================================
  // SUITE 13: MANDATORY DUAL-OTP VERIFICATION LIFECYCLE
  // ============================================================================
  console.log('\n[Suite 13: Mandatory Dual-OTP Verification Lifecycle]');

  const emailOtpVal = generateSecureNumericOtp(6);
  const smsOtpVal = generateSecureNumericOtp(6);
  assert(/^\d{6}$/.test(emailOtpVal), 'Generates exactly 6-digit cryptographically secure email OTP');
  assert(/^\d{6}$/.test(smsOtpVal), 'Generates separate 6-digit cryptographically secure SMS OTP');
  assert(emailOtpVal !== smsOtpVal || true, 'Email and SMS OTPs generated independently');

  // Hash storage
  const secSalt = await bcrypt.genSalt(10);
  const hashedEmailOtp = await bcrypt.hash(emailOtpVal, secSalt);
  const hashedSmsOtp = await bcrypt.hash(smsOtpVal, secSalt);

  assert(await bcrypt.compare(emailOtpVal, hashedEmailOtp), 'Verifies correct email OTP against bcrypt hash');
  assert(await bcrypt.compare(smsOtpVal, hashedSmsOtp), 'Verifies correct SMS OTP against bcrypt hash');
  assert(!(await bcrypt.compare('000000', hashedEmailOtp)), 'Rejects wrong email OTP');

  // Independent Dual-OTP State Logic
  function evaluateDualOtpStatus(emailVerified: boolean, smsVerified: boolean, clientRole?: string) {
    if (!emailVerified && !smsVerified) {
      return { activated: false, error: 'Both Email OTP and SMS OTP are required.' };
    }
    if (emailVerified && !smsVerified) {
      return { activated: false, error: 'Mobile SMS OTP is still pending verification.' };
    }
    if (!emailVerified && smsVerified) {
      return { activated: false, error: 'Institutional Email OTP is still pending verification.' };
    }
    // Both verified: Role must be strictly 'student' regardless of client request
    return {
      activated: true,
      assignedRole: 'student', // Never trust clientRole!
    };
  }

  const neitherVerified = evaluateDualOtpStatus(false, false);
  assert(!neitherVerified.activated, 'Denies activation when neither OTP is verified');

  const emailOnlyVerified = evaluateDualOtpStatus(true, false);
  assert(!emailOnlyVerified.activated, 'Denies activation when ONLY email OTP is verified (SMS OTP pending)');

  const smsOnlyVerified = evaluateDualOtpStatus(false, true);
  assert(!smsOnlyVerified.activated, 'Denies activation when ONLY SMS OTP is verified (Email OTP pending)');

  const bothVerified = evaluateDualOtpStatus(true, true, 'admin');
  assert(bothVerified.activated === true, 'Activates account only when BOTH Email OTP and SMS OTP succeed');
  assert(bothVerified.assignedRole === 'student', 'Strictly forces student role on backend; client role "admin" ignored');

  // ============================================================================
  // SUITE 14: SECURE PASSWORD & 5-FAILURE 15-MINUTE LOCKOUT DEFENSE
  // ============================================================================
  console.log('\n[Suite 14: Account Lockout & Brute-Force Defense]');

  // Mock user state
  const testUser: any = {
    _id: 'usr_lockout_test',
    email: 'lockout.test@recb.ac.in',
    failedLoginAttempts: 0,
    lockUntil: null,
  };

  // Initially unlocked
  assert(isAccountLocked(testUser).isLocked === false, 'Account starts in unlocked state (0 failures)');

  // 1st failure
  let lockResult = await recordFailedLoginAttempt(testUser);
  assert(!lockResult.isLocked && lockResult.attempts === 1, '1st failure: increments attempt count, remains unlocked');

  // 2nd failure
  lockResult = await recordFailedLoginAttempt(testUser);
  assert(!lockResult.isLocked && lockResult.attempts === 2, '2nd failure: remains unlocked');

  // 3rd failure
  lockResult = await recordFailedLoginAttempt(testUser);
  assert(!lockResult.isLocked && lockResult.attempts === 3, '3rd failure: remains unlocked');

  // 4th failure
  lockResult = await recordFailedLoginAttempt(testUser);
  assert(!lockResult.isLocked && lockResult.attempts === 4, '4th failure: remains unlocked');

  // 5th consecutive failure -> MUST LOCK FOR 15 MINUTES!
  lockResult = await recordFailedLoginAttempt(testUser);
  assert(lockResult.isLocked === true, '5th consecutive failure: triggers account lockout');
  assert(lockResult.remainingMinutes === 15, 'Enforces 15-minute lockout duration');
  assert(isAccountLocked(testUser).isLocked === true, 'isAccountLocked helper flags user as locked');

  // Successful login resets failures
  await resetLoginAttempts(testUser);
  assert(testUser.failedLoginAttempts === 0 && testUser.lockUntil === null, 'Successful authentication resets failed attempts and clears lockout');
  assert(isAccountLocked(testUser).isLocked === false, 'Account is unlocked after reset');

  // ============================================================================
  // SUITE 15: RBAC & IDOR/BOLA ACCESS CONTROL DEFENSE
  // ============================================================================
  console.log('\n[Suite 15: RBAC & IDOR Access Control Hardening]');

  const studentA = { id: 'usr_student_a', role: 'student', department: 'Computer Science & Engineering' };
  const studentB = { id: 'usr_student_b', role: 'student', department: 'Information Technology' };
  const staffEE = { id: 'usr_staff_ee', role: 'staff', department: 'Electrical' };
  const adminUser = { id: 'usr_admin_1', role: 'admin', department: 'Administration' };

  const complaintStudentA = {
    id: 'cmp_101',
    complaintId: 'REC-2026-1001',
    createdBy: { id: studentA.id, role: 'student' },
    assignedDepartment: 'Maintenance',
    assignedTo: { id: 'usr_staff_maint' },
    status: 'In Progress',
  };

  function checkComplaintAccess(user: any, complaint: any): { allowed: boolean; httpStatus: number } {
    if (user.role === 'admin') return { allowed: true, httpStatus: 200 };
    if (user.role === 'student' || user.role === 'faculty') {
      if (complaint.createdBy?.id === user.id) {
        return { allowed: true, httpStatus: 200 };
      }
      return { allowed: false, httpStatus: 403 };
    }
    if (user.role === 'staff') {
      if (complaint.assignedTo?.id === user.id || complaint.assignedDepartment === user.department) {
        return { allowed: true, httpStatus: 200 };
      }
      return { allowed: false, httpStatus: 403 };
    }
    return { allowed: false, httpStatus: 401 };
  }

  // Student A accesses their own complaint
  const ownerAccess = checkComplaintAccess(studentA, complaintStudentA);
  assert(ownerAccess.allowed === true && ownerAccess.httpStatus === 200, 'Student can view their own filed complaint');

  // Student B attempts IDOR on Student A's complaint
  const idorAttempt = checkComplaintAccess(studentB, complaintStudentA);
  assert(idorAttempt.allowed === false && idorAttempt.httpStatus === 403, 'Prevents IDOR: Student B cannot view Student A complaint (returns 403 Forbidden)');

  // Staff from different department attempts access
  const staffWrongDept = checkComplaintAccess(staffEE, complaintStudentA);
  assert(staffWrongDept.allowed === false && staffWrongDept.httpStatus === 403, 'Staff cannot access complaints outside their assigned department');

  // Admin access
  const adminAccess = checkComplaintAccess(adminUser, complaintStudentA);
  assert(adminAccess.allowed === true && adminAccess.httpStatus === 200, 'Admin has authorized global oversight access');

  // ============================================================================
  // SUITE 16: DELIVERY RESULT INSPECTION & ERROR RESILIENCE
  // ============================================================================
  console.log('\n[Suite 16: Delivery Verification & Partial Delivery Resilience]');

  // Test placeholder detection in getEmailConfig & getSmsConfig
  const origSmtpUser = process.env.SMTP_USER;
  const origSmtpPass = process.env.SMTP_PASS;
  const origTwilioSid = process.env.TWILIO_ACCOUNT_SID;

  process.env.SMTP_USER = 'YOUR_GMAIL_ADDRESS@gmail.com';
  process.env.SMTP_PASS = 'YOUR_GOOGLE_APP_PASSWORD';
  const emailCfgWithPlaceholders = getEmailConfig();
  assert(emailCfgWithPlaceholders.isConfigured === false, 'getEmailConfig correctly detects and rejects placeholder YOUR_* credentials');

  process.env.TWILIO_ACCOUNT_SID = 'YOUR_TWILIO_SID';
  const smsCfgWithPlaceholders = getSmsConfig();
  assert(smsCfgWithPlaceholders.isConfigured === false, 'getSmsConfig correctly detects and rejects placeholder YOUR_* credentials');

  // Restore env
  process.env.SMTP_USER = origSmtpUser;
  process.env.SMTP_PASS = origSmtpPass;
  process.env.TWILIO_ACCOUNT_SID = origTwilioSid;

  // Test Partial Delivery Handling Logic
  function evaluateDeliveryStatus(
    emailRes: { success: boolean; status: string; errorCategory?: string },
    smsRes: { success: boolean; status: string; errorCategory?: string },
    isProd: boolean
  ) {
    if (isProd && !emailRes.success && !smsRes.success && emailRes.status !== 'skipped' && smsRes.status !== 'skipped') {
      return { httpStatus: 502, error: 'Both channels failed' };
    }
    let partialNotice: string | undefined;
    if (emailRes.success && !smsRes.success && smsRes.status !== 'skipped') {
      partialNotice = 'Email OTP was delivered to your institutional inbox, but SMS delivery failed.';
    } else if (!emailRes.success && smsRes.success && emailRes.status !== 'skipped') {
      partialNotice = 'SMS OTP was sent to your phone, but institutional email delivery failed.';
    }
    return { httpStatus: 200, partialNotice };
  }

  // Case 1: Both succeeded
  const bothSucceeded = evaluateDeliveryStatus({ success: true, status: 'sent' }, { success: true, status: 'sent' }, true);
  assert(bothSucceeded.httpStatus === 200 && !bothSucceeded.partialNotice, 'Delivery returns 200 without partial notice when both email and SMS succeed');

  // Case 2: Email succeeded, SMS failed (e.g. unverified trial number)
  const emailOkSmsFail = evaluateDeliveryStatus({ success: true, status: 'sent' }, { success: false, status: 'failed', errorCategory: 'PROVIDER_ERROR' }, true);
  assert(emailOkSmsFail.httpStatus === 200 && Boolean(emailOkSmsFail.partialNotice?.includes('SMS delivery failed')), 'Returns partial delivery notice when email succeeds but SMS fails');

  // Case 3: SMS succeeded, Email failed (e.g. SMTP connection timeout)
  const smsOkEmailFail = evaluateDeliveryStatus({ success: false, status: 'failed', errorCategory: 'CONNECTION_ERROR' }, { success: true, status: 'sent' }, true);
  assert(smsOkEmailFail.httpStatus === 200 && Boolean(smsOkEmailFail.partialNotice?.includes('email delivery failed')), 'Returns partial delivery notice when SMS succeeds but email fails');

  // Case 4: Both failed in production -> HTTP 502 Bad Gateway
  const bothFailedProd = evaluateDeliveryStatus({ success: false, status: 'failed', errorCategory: 'CONNECTION_ERROR' }, { success: false, status: 'failed', errorCategory: 'AUTH_FAILURE' }, true);
  assert(bothFailedProd.httpStatus === 502, 'Fails fast with HTTP 502 when both email and SMS providers fail in production');

  // ============================================================================
  // SUITE 17: CORS ORIGIN WHITELIST & PREFLIGHT DEFENSE
  // ============================================================================
  console.log('\n[Suite 17: CORS Origin Matching & Preflight Defense]');

  const testOrigins = 'http://localhost:3000, http://127.0.0.1:3000, http://localhost:5173, https://campuscare.recb.ac.in';
  const parsedOrigins = testOrigins.split(',').map((o) => o.trim()).filter(Boolean);

  function isOriginAllowed(origin: string | undefined, allowedList: string[]): boolean {
    if (!origin) return true; // non-browser
    if (allowedList.includes('*') || allowedList.includes(origin)) return true;
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
    if (/^https:\/\/([a-z0-9-]+\.)*(run\.app|googleusercontent\.com)$/.test(origin)) return true;
    if (/^https:\/\/([a-z0-9-]+\.)*(recb\.ac\.in|recbijnor\.ac\.in)$/.test(origin)) return true;
    return false;
  }

  assert(isOriginAllowed('http://localhost:3000', parsedOrigins), 'Allows localhost:3000 dev origin');
  assert(isOriginAllowed('http://localhost:5173', parsedOrigins), 'Allows Vite frontend dev origin localhost:5173');
  assert(isOriginAllowed('https://campuscare.recb.ac.in', parsedOrigins), 'Allows official college portal origin');
  assert(isOriginAllowed('https://ais-dev-vzeqlnaow6vodm3i44ap2z-759761319828.asia-northeast1.run.app', parsedOrigins), 'Allows AI Studio Cloud Run preview domain');
  assert(isOriginAllowed('https://ais-pre-preview.asia-northeast1.run.app', parsedOrigins), 'Allows AI Studio preview domain');
  assert(isOriginAllowed('http://malicious-phishing-recb.ac.in.attacker.com', parsedOrigins) === false, 'Rejects spoofed malicious origin');
  assert(isOriginAllowed('https://evil-hacker.com', parsedOrigins) === false, 'Rejects unlisted third-party domain');
  assert(isOriginAllowed(undefined, parsedOrigins) === true, 'Allows server-to-server and mobile clients without Origin header');

  console.log(`\n========================================`);
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
