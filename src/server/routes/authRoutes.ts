import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { UserModel, CollegeRosterModel, EmailVerificationModel, PendingRegistrationModel } from '../models';
import { authenticateToken, AuthenticatedRequest, JWT_SECRET } from '../middleware/auth';
import { notificationService } from '../services/notificationService';
import { sendEmail, isValidEmail, renderOtpEmailTemplate } from '../services/emailService';
import { sendSms } from '../services/smsService';
import { verifyRosterEligibility, generateNumericOtp, maskEmail as maskEmailRoster } from '../services/rosterService';
import {
  validateInstitutionalEmail,
  validateEnrollmentNumber,
  validateMobileNumber,
  maskEmail,
  maskPhone,
  generateSecureNumericOtp,
  isAccountLocked,
  recordFailedLoginAttempt,
  resetLoginAttempts,
  ACCOUNT_LOCKOUT_MAX_FAILURES,
} from '../services/securityService';

const router = Router();

// ============================================================================
// MANDATORY DUAL-OTP (EMAIL + MOBILE SMS) REGISTRATION FLOW
// ============================================================================

// Helper to activate student once both email OTP and SMS OTP succeed
async function activateVerifiedStudent(pending: any, ip?: string) {
  // Check duplicate once more
  const existing = await UserModel.findOne({
    $or: [{ email: pending.email }, { enrollmentNumber: pending.enrollmentNumber }],
  }).exec();

  if (existing) {
    await PendingRegistrationModel.deleteOne({ _id: pending._id });
    return {
      message: 'An active user account is already registered for this identity. Please sign in.',
      alreadyExists: true,
      fullyVerified: true,
    };
  }

  // Mandatory: Role is strictly 'student' on backend - never trust client input!
  const newUser = await UserModel.create({
    id: 'usr_' + Date.now(),
    identifier: pending.enrollmentNumber, // string type preserved, leading zeros kept
    email: pending.email,
    name: pending.name,
    role: 'student', // DERIVED AS STUDENT - NEVER CLIENT-SUPPLIED
    passwordHash: pending.passwordHash,
    department: pending.department,
    enrollmentNumber: pending.enrollmentNumber,
    mobileNumber: pending.mobileNumber,
    academicYear: pending.academicYear || '1st Year',
    isActive: true,
    failedLoginAttempts: 0,
    lockUntil: null,
    createdAt: new Date(),
  });

  // Clean up used pending registration record
  await PendingRegistrationModel.deleteOne({ _id: pending._id });

  // Record audit log
  try {
    await db.auditLogs.create({
      action: 'USER_REGISTERED_DUAL_OTP_VERIFIED',
      actor: { id: newUser.id || newUser._id, name: newUser.name, role: newUser.role },
      details: {
        email: newUser.email,
        enrollmentNumber: newUser.enrollmentNumber,
        mobileNumber: newUser.mobileNumber,
        department: newUser.department,
      },
      ip: ip || '127.0.0.1',
      timestamp: new Date(),
    });
  } catch (e) {}

  // Generate JWT token
  const payload = {
    id: newUser.id || newUser._id,
    email: newUser.email,
    name: newUser.name,
    role: newUser.role,
    department: newUser.department,
    enrollmentNumber: newUser.enrollmentNumber,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

  return {
    message: 'Dual-OTP verification complete. Official account activated successfully!',
    fullyVerified: true,
    token,
    user: {
      id: newUser.id || newUser._id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      department: newUser.department,
      enrollmentNumber: newUser.enrollmentNumber,
      mobileNumber: newUser.mobileNumber,
      academicYear: newUser.academicYear,
      isActive: newUser.isActive,
    },
  };
}

// 1. Initiate Dual-OTP Registration
router.post('/register/initiate', async (req, res): Promise<void> => {
  try {
    const {
      name,
      email,
      enrollmentNumber,
      mobileNumber,
      department,
      academicYear,
      password,
      confirmPassword,
    } = req.body;

    // Validate required fields
    if (!name || !email || !enrollmentNumber || !mobileNumber || !department || !password) {
      res.status(400).json({
        error: 'All fields are required: Full name, official email, 15-digit enrollment number, mobile number, department, and password.',
      });
      return;
    }

    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Password and confirm password do not match.' });
      return;
    }

    if (String(password).length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long.' });
      return;
    }

    // Validate institutional email (@recb.ac.in)
    const emailValidation = validateInstitutionalEmail(email);
    if (!emailValidation.valid) {
      res.status(400).json({ error: emailValidation.reason });
      return;
    }
    const cleanEmail = emailValidation.normalized;

    // Validate 15-digit enrollment number (starts with year, code 0735, 9 digits)
    const enrollmentValidation = validateEnrollmentNumber(enrollmentNumber);
    if (!enrollmentValidation.valid) {
      res.status(400).json({ error: enrollmentValidation.reason });
      return;
    }
    const cleanEnrollment = enrollmentValidation.normalized;

    // Validate mobile number (E.164)
    const mobileValidation = validateMobileNumber(mobileNumber);
    if (!mobileValidation.valid) {
      res.status(400).json({ error: mobileValidation.reason });
      return;
    }
    const cleanMobile = mobileValidation.normalized;

    const cleanName = String(name).trim();
    const cleanDept = String(department).trim();
    const cleanYear = academicYear ? String(academicYear).trim() : '1st Year';

    const genericSuccessMessage =
      'Verification codes have been dispatched to your official college email and mobile number. Please complete dual verification to activate your account.';

    // Check if user already exists (anti-enumeration: return generic success without issuing OTP)
    const existingUser = await UserModel.findOne({
      $or: [{ email: cleanEmail }, { enrollmentNumber: cleanEnrollment }],
    }).exec();

    if (existingUser) {
      res.json({
        message: genericSuccessMessage,
        emailMasked: maskEmail(cleanEmail),
        mobileMasked: maskPhone(cleanMobile),
        resendAvailableInSeconds: 60,
      });
      return;
    }

    // Check existing pending registration cooldown
    const existingPending = await PendingRegistrationModel.findOne({ email: cleanEmail }).exec();
    if (existingPending) {
      const minCooldown = Math.min(
        existingPending.emailResendAvailableAt.getTime(),
        existingPending.smsResendAvailableAt.getTime()
      );
      if (Date.now() < minCooldown) {
        const waitSec = Math.ceil((minCooldown - Date.now()) / 1000);
        res.status(429).json({
          error: `Please wait ${waitSec} seconds before requesting new verification codes.`,
        });
        return;
      }
    }

    // Generate independent cryptographically secure OTPs for Email and SMS
    const emailOtp = generateSecureNumericOtp(6);
    const smsOtp = generateSecureNumericOtp(6);

    const salt = await bcrypt.genSalt(10);
    const emailOtpHashed = await bcrypt.hash(emailOtp, salt);
    const smsOtpHashed = await bcrypt.hash(smsOtp, salt);
    const passwordHash = await bcrypt.hash(String(password), salt);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes
    const resendAvailableAt = new Date(now.getTime() + 60 * 1000); // 60s cooldown

    // Upsert pending registration
    await PendingRegistrationModel.deleteMany({
      $or: [{ email: cleanEmail }, { enrollmentNumber: cleanEnrollment }],
    }).exec();

    await PendingRegistrationModel.create({
      email: cleanEmail,
      enrollmentNumber: cleanEnrollment,
      name: cleanName,
      mobileNumber: cleanMobile,
      department: cleanDept,
      academicYear: cleanYear,
      passwordHash,
      emailOtpHashed,
      emailVerified: false,
      emailAttemptsRemaining: 5,
      emailExpiresAt: expiresAt,
      emailResendAvailableAt: resendAvailableAt,
      emailResendCount: 0,
      smsOtpHashed,
      smsVerified: false,
      smsAttemptsRemaining: 5,
      smsExpiresAt: expiresAt,
      smsResendAvailableAt: resendAvailableAt,
      smsResendCount: 0,
      ip: req.ip || '127.0.0.1',
    });

    // Dispatch Email OTP
    const emailTpl = renderOtpEmailTemplate({
      greetingName: cleanName,
      otp: emailOtp,
      purpose: 'REC Bijnor Campus Care Portal Registration',
      expiresInMinutes: 10,
    });

    const emailResult = await sendEmail({
      to: cleanEmail,
      subject: 'Your Email Verification Code - REC Bijnor Campus Care',
      html: emailTpl.html,
      text: emailTpl.text,
      eventType: 'registration_email_otp',
    });

    // Dispatch SMS OTP
    const smsResult = await sendSms({
      to: cleanMobile,
      body: `[REC Bijnor] Your mobile verification code is: ${smsOtp}. Valid for 10 minutes. Do not share this OTP.`,
      eventType: 'registration_sms_otp',
    });

    // In production, fail fast if both communication channels failed and were not skipped/unconfigured
    if (
      process.env.NODE_ENV === 'production' &&
      !emailResult.success &&
      !smsResult.success &&
      emailResult.status !== 'skipped' &&
      smsResult.status !== 'skipped'
    ) {
      res.status(502).json({
        error: 'Failed to deliver verification codes via institutional email and SMS. Please try again or contact portal support.',
        delivery: {
          email: { status: emailResult.status, errorCategory: emailResult.errorCategory },
          sms: { status: smsResult.status, errorCategory: smsResult.errorCategory },
        },
      });
      return;
    }

    let partialNotice: string | undefined;
    if (emailResult.success && !smsResult.success && smsResult.status !== 'skipped') {
      partialNotice = 'Email OTP was delivered to your institutional inbox, but SMS delivery failed. You may verify with email or retry SMS.';
    } else if (!emailResult.success && smsResult.success && emailResult.status !== 'skipped') {
      partialNotice = 'SMS OTP was sent to your phone, but institutional email delivery failed. You may verify with SMS or retry email.';
    }

    res.json({
      message: genericSuccessMessage,
      emailMasked: maskEmail(cleanEmail),
      mobileMasked: maskPhone(cleanMobile),
      resendAvailableInSeconds: 60,
      partialNotice,
      delivery: {
        email: emailResult.status,
        sms: smsResult.status,
      },
      devEmailOtp: process.env.NODE_ENV !== 'production' ? emailOtp : undefined,
      devSmsOtp: process.env.NODE_ENV !== 'production' ? smsOtp : undefined,
    });
  } catch (err: any) {
    console.error('[Registration Initiate Error]', err);
    res.status(500).json({ error: 'Failed to initiate registration verification.' });
  }
});

// 2. Verify Email OTP
router.post('/register/verify-email-otp', async (req, res): Promise<void> => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      res.status(400).json({ error: 'Official email and 6-digit verification code are required.' });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    if (!/^\d{6}$/.test(cleanOtp)) {
      res.status(400).json({ error: 'Verification code must be exactly 6 digits.' });
      return;
    }

    const pending = await PendingRegistrationModel.findOne({ email: cleanEmail }).exec();
    if (!pending) {
      res.status(400).json({ error: 'No active registration session found. Please register again.' });
      return;
    }

    if (pending.emailVerified) {
      res.json({
        message: 'Email is already verified.',
        emailVerified: true,
        smsVerified: pending.smsVerified,
        fullyVerified: pending.smsVerified,
      });
      return;
    }

    if (new Date() > pending.emailExpiresAt) {
      res.status(400).json({ error: 'Email verification code has expired. Please request a new code.' });
      return;
    }

    if (pending.emailAttemptsRemaining <= 0) {
      res.status(400).json({ error: 'Maximum email verification attempts exceeded. Please request a new code.' });
      return;
    }

    const isMatch = await bcrypt.compare(cleanOtp, pending.emailOtpHashed);
    if (!isMatch) {
      pending.emailAttemptsRemaining -= 1;
      await pending.save();
      res.status(400).json({
        error: `Incorrect email verification code. ${pending.emailAttemptsRemaining} attempt(s) remaining.`,
      });
      return;
    }

    pending.emailVerified = true;
    await pending.save();

    // Check if both OTPs are verified
    if (pending.smsVerified) {
      const activation = await activateVerifiedStudent(pending, req.ip);
      res.status(201).json(activation);
      return;
    }

    res.json({
      message: 'Official email verified successfully. Please enter your mobile SMS OTP to activate your account.',
      emailVerified: true,
      smsVerified: false,
      fullyVerified: false,
    });
  } catch (err: any) {
    console.error('[Verify Email OTP Error]', err);
    res.status(500).json({ error: 'Failed to verify email OTP.' });
  }
});

// 3. Verify SMS OTP
router.post('/register/verify-sms-otp', async (req, res): Promise<void> => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      res.status(400).json({ error: 'Official email and 6-digit SMS verification code are required.' });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    if (!/^\d{6}$/.test(cleanOtp)) {
      res.status(400).json({ error: 'Verification code must be exactly 6 digits.' });
      return;
    }

    const pending = await PendingRegistrationModel.findOne({ email: cleanEmail }).exec();
    if (!pending) {
      res.status(400).json({ error: 'No active registration session found. Please register again.' });
      return;
    }

    if (pending.smsVerified) {
      res.json({
        message: 'Mobile number is already verified.',
        emailVerified: pending.emailVerified,
        smsVerified: true,
        fullyVerified: pending.emailVerified,
      });
      return;
    }

    if (new Date() > pending.smsExpiresAt) {
      res.status(400).json({ error: 'SMS verification code has expired. Please request a new code.' });
      return;
    }

    if (pending.smsAttemptsRemaining <= 0) {
      res.status(400).json({ error: 'Maximum mobile verification attempts exceeded. Please request a new code.' });
      return;
    }

    const isMatch = await bcrypt.compare(cleanOtp, pending.smsOtpHashed);
    if (!isMatch) {
      pending.smsAttemptsRemaining -= 1;
      await pending.save();
      res.status(400).json({
        error: `Incorrect mobile verification code. ${pending.smsAttemptsRemaining} attempt(s) remaining.`,
      });
      return;
    }

    pending.smsVerified = true;
    await pending.save();

    // Check if both OTPs are verified
    if (pending.emailVerified) {
      const activation = await activateVerifiedStudent(pending, req.ip);
      res.status(201).json(activation);
      return;
    }

    res.json({
      message: 'Mobile number verified successfully. Please enter your email OTP to activate your account.',
      emailVerified: false,
      smsVerified: true,
      fullyVerified: false,
    });
  } catch (err: any) {
    console.error('[Verify SMS OTP Error]', err);
    res.status(500).json({ error: 'Failed to verify SMS OTP.' });
  }
});

// 4. Resend Dual OTP (Email or SMS)
router.post('/register/resend-dual-otp', async (req, res): Promise<void> => {
  try {
    const { email, channel } = req.body;
    if (!email || !channel || !['email', 'sms'].includes(channel)) {
      res.status(400).json({ error: 'Email and channel ("email" or "sms") are required.' });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const pending = await PendingRegistrationModel.findOne({ email: cleanEmail }).exec();
    if (!pending) {
      res.status(400).json({ error: 'No active registration session found. Please register again.' });
      return;
    }

    const now = Date.now();
    const cooldownAt = channel === 'email' ? pending.emailResendAvailableAt : pending.smsResendAvailableAt;
    if (now < cooldownAt.getTime()) {
      const waitSec = Math.ceil((cooldownAt.getTime() - now) / 1000);
      res.status(429).json({
        error: `Please wait ${waitSec} seconds before requesting a new ${channel.toUpperCase()} verification code.`,
      });
      return;
    }

    const resendCount = channel === 'email' ? pending.emailResendCount : pending.smsResendCount;
    if (resendCount >= 5) {
      res.status(429).json({
        error: `Maximum resend limit reached for ${channel.toUpperCase()}. Please restart registration.`,
      });
      return;
    }

    const newOtp = generateSecureNumericOtp(6);
    const salt = await bcrypt.genSalt(10);
    const newOtpHashed = await bcrypt.hash(newOtp, salt);

    if (channel === 'email') {
      pending.emailOtpHashed = newOtpHashed;
      pending.emailAttemptsRemaining = 5;
      pending.emailExpiresAt = new Date(now + 10 * 60 * 1000);
      pending.emailResendAvailableAt = new Date(now + 60 * 1000);
      pending.emailResendCount += 1;
      await pending.save();

      const emailTpl = renderOtpEmailTemplate({
        greetingName: pending.name,
        otp: newOtp,
        purpose: 'REC Bijnor Campus Care Portal Registration',
        expiresInMinutes: 10,
      });

      const emailResult = await sendEmail({
        to: pending.email,
        subject: 'New Email Verification Code - REC Bijnor Campus Care',
        html: emailTpl.html,
        text: emailTpl.text,
        eventType: 'registration_email_otp_resend',
      });

      if (process.env.NODE_ENV === 'production' && !emailResult.success && emailResult.status !== 'skipped') {
        res.status(502).json({
          error: 'Failed to deliver email verification code. Please check your institutional email address or try again.',
          deliveryStatus: emailResult.status,
          errorCategory: emailResult.errorCategory,
        });
        return;
      }
    } else {
      pending.smsOtpHashed = newOtpHashed;
      pending.smsAttemptsRemaining = 5;
      pending.smsExpiresAt = new Date(now + 10 * 60 * 1000);
      pending.smsResendAvailableAt = new Date(now + 60 * 1000);
      pending.smsResendCount += 1;
      await pending.save();

      const smsResult = await sendSms({
        to: pending.mobileNumber,
        body: `[REC Bijnor] Your new mobile verification code is: ${newOtp}. Valid for 10 minutes.`,
        eventType: 'registration_sms_otp_resend',
      });

      if (process.env.NODE_ENV === 'production' && !smsResult.success && smsResult.status !== 'skipped') {
        res.status(502).json({
          error: 'Failed to deliver SMS verification code. Please check your mobile number or try again.',
          deliveryStatus: smsResult.status,
          errorCategory: smsResult.errorCategory,
        });
        return;
      }
    }

    res.json({
      message: `A fresh 6-digit ${channel.toUpperCase()} verification code has been dispatched.`,
      resendAvailableInSeconds: 60,
      devOtp: process.env.NODE_ENV !== 'production' ? newOtp : undefined,
    });
  } catch (err: any) {
    console.error('[Resend Dual OTP Error]', err);
    res.status(500).json({ error: 'Failed to resend verification code.' });
  }
});

// ============================================================================
// AUTOMATIC ROSTER VERIFICATION & EMAIL OTP REGISTRATION
// ============================================================================

// 1. Request Registration OTP
// Requirement: Normalize & match against roster, generic response to reduce enumeration
router.post('/register/request-otp', async (req, res): Promise<void> => {
  try {
    const { email, enrollmentNumber, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Official college email and a secure password are required.' });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanEnrollment = enrollmentNumber ? String(enrollmentNumber).trim().toUpperCase() : undefined;

    if (!isValidEmail(cleanEmail)) {
      res.status(400).json({ error: 'Please enter a valid official college email address.' });
      return;
    }

    if (String(password).length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long.' });
      return;
    }

    const genericSuccessMessage =
      'If your details match an eligible institutional roster record, a 6-digit verification code has been dispatched to your official email.';

    // Check if an active account already exists with this email or enrollment number
    const existingUser = await UserModel.findOne({
      $or: [
        { email: cleanEmail },
        ...(cleanEnrollment ? [{ enrollmentNumber: cleanEnrollment }] : []),
      ],
    }).exec();

    if (existingUser) {
      // Generic response to avoid enumeration; do not issue OTP
      res.json({
        message: genericSuccessMessage,
        emailMasked: maskEmail(cleanEmail),
        resendAvailableInSeconds: 60,
      });
      return;
    }

    // Verify roster record eligibility
    const eligibility = await verifyRosterEligibility(cleanEmail, cleanEnrollment);

    if (!eligibility.eligible || !eligibility.roster) {
      // Record audit log for security analytics
      try {
        await db.auditLogs.create({
          action: 'REGISTRATION_ATTEMPT_REJECTED',
          actor: { id: 'UNAUTHENTICATED', name: cleanEmail, role: 'anonymous' },
          details: { email: cleanEmail, enrollmentNumber: cleanEnrollment, reason: eligibility.reason },
          ip: req.ip || '127.0.0.1',
          timestamp: new Date(),
        });
      } catch (auditErr: any) {
        console.warn('[Audit Log Warning]', auditErr.message);
      }

      // Generic response to prevent roster enumeration
      res.json({
        message: genericSuccessMessage,
        emailMasked: maskEmail(cleanEmail),
        resendAvailableInSeconds: 60,
      });
      return;
    }

    // Check resend rate limit (cooldown period of 60 seconds)
    const existingVerification = await EmailVerificationModel.findOne({
      email: cleanEmail,
      purpose: 'registration',
      isUsed: false,
    }).exec();

    if (existingVerification && existingVerification.resendAvailableAt > new Date()) {
      const waitSeconds = Math.ceil(
        (existingVerification.resendAvailableAt.getTime() - Date.now()) / 1000
      );
      res.status(429).json({
        error: `Please wait ${waitSeconds} seconds before requesting another verification code.`,
      });
      return;
    }

    // Generate numeric 6-digit OTP and hash it with bcrypt
    const otp = generateNumericOtp(6);
    const salt = await bcrypt.genSalt(10);
    const otpHashed = await bcrypt.hash(otp, salt);
    const pendingPasswordHash = await bcrypt.hash(String(password), salt);

    // Save or update verification record
    await EmailVerificationModel.deleteMany({ email: cleanEmail, purpose: 'registration' });
    await EmailVerificationModel.create({
      email: cleanEmail,
      purpose: 'registration',
      otpHashed,
      pendingPasswordHash,
      enrollmentNumber: cleanEnrollment,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes expiry
      attemptsRemaining: 3,
      maxAttempts: 3,
      resendAvailableAt: new Date(Date.now() + 60 * 1000), // 60s cooldown
      resendCount: 0,
      isUsed: false,
      ip: req.ip || '127.0.0.1',
    });

    // Send verification email via Nodemailer
    const emailTemplate = renderOtpEmailTemplate({
      greetingName: eligibility.roster.name,
      otp,
      purpose: 'Official Campus Care Account Registration',
      expiresInMinutes: 10,
    });

    const emailResult = await sendEmail({
      to: cleanEmail,
      subject: 'Your Verification Code - REC Bijnor Campus Care',
      html: emailTemplate.html,
      text: emailTemplate.text,
      eventType: 'registration_otp',
    });

    if (process.env.NODE_ENV === 'production' && !emailResult.success && emailResult.status !== 'skipped') {
      res.status(502).json({
        error: 'Failed to deliver email verification code. Please check your official email or try again later.',
        deliveryStatus: emailResult.status,
        errorCategory: emailResult.errorCategory,
      });
      return;
    }

    res.json({
      message: genericSuccessMessage,
      emailMasked: maskEmail(cleanEmail),
      resendAvailableInSeconds: 60,
      devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined,
    });
  } catch (err: any) {
    console.error('[Registration OTP Request Error]', err);
    res.status(500).json({ error: 'Failed to process registration verification request.' });
  }
});

// 2. Verify OTP & Activate Roster Account
// Requirement: Derive role strictly from roster, never client. Atomic claim.
router.post('/register/verify-otp', async (req, res): Promise<void> => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      res.status(400).json({ error: 'Official college email and verification code are required.' });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    if (!/^\d{6}$/.test(cleanOtp)) {
      res.status(400).json({ error: 'Verification code must be exactly 6 digits.' });
      return;
    }

    const verificationRecord = await EmailVerificationModel.findOne({
      email: cleanEmail,
      purpose: 'registration',
      isUsed: false,
    }).exec();

    if (!verificationRecord) {
      res.status(400).json({
        error: 'No active verification session found. Please request a new verification code.',
      });
      return;
    }

    // Check expiry
    if (new Date() > verificationRecord.expiresAt) {
      await EmailVerificationModel.deleteOne({ _id: verificationRecord._id });
      res.status(400).json({
        error: 'Verification code has expired. Please request a new verification code.',
      });
      return;
    }

    // Check attempts remaining
    if (verificationRecord.attemptsRemaining <= 0) {
      await EmailVerificationModel.deleteOne({ _id: verificationRecord._id });
      res.status(400).json({
        error: 'Maximum verification attempts exceeded. Please request a new verification code.',
      });
      return;
    }

    // Compare OTP hash using bcrypt
    const isOtpValid = await bcrypt.compare(cleanOtp, verificationRecord.otpHashed);

    if (!isOtpValid) {
      verificationRecord.attemptsRemaining -= 1;
      await verificationRecord.save();

      if (verificationRecord.attemptsRemaining <= 0) {
        await EmailVerificationModel.deleteOne({ _id: verificationRecord._id });
        res.status(400).json({
          error: 'Incorrect verification code. Maximum attempts exceeded. Please request a new code.',
        });
        return;
      }

      res.status(400).json({
        error: `Incorrect verification code. ${verificationRecord.attemptsRemaining} attempt(s) remaining.`,
      });
      return;
    }

    // Mark verification record as used
    verificationRecord.isUsed = true;
    verificationRecord.verifiedAt = new Date();
    await verificationRecord.save();

    // Concurrently safe atomic claim on roster record
    const roster = await CollegeRosterModel.findOneAndUpdate(
      { email: cleanEmail, isEligible: true, isClaimed: false },
      { $set: { isClaimed: true, claimedAt: new Date() } },
      { new: true }
    ).exec();

    if (!roster) {
      res.status(400).json({
        error: 'College roster record is no longer eligible or has already been activated.',
      });
      return;
    }

    // Prevent duplicate user creation
    const existingUser = await UserModel.findOne({
      $or: [
        { email: cleanEmail },
        ...(roster.enrollmentNumber ? [{ enrollmentNumber: roster.enrollmentNumber }] : []),
      ],
    }).exec();

    if (existingUser) {
      res.status(400).json({
        error: 'An active user account is already registered for this identity. Please sign in.',
      });
      return;
    }

    // Requirement 12: Derive role strictly from roster record!
    const newUser = await UserModel.create({
      id: 'usr_' + Date.now(),
      identifier: roster.enrollmentNumber || roster.email.split('@')[0],
      email: roster.email,
      name: roster.name,
      role: roster.role, // DERIVED FROM ROSTER - NEVER TRUST CLIENT
      passwordHash: verificationRecord.pendingPasswordHash,
      department: roster.department || '',
      enrollmentNumber: roster.enrollmentNumber || '',
      academicYear: roster.academicYear || '',
      hostel: roster.hostel || '',
      roomNumber: roster.roomNumber || '',
      mobileNumber: roster.mobileNumber || '',
      isActive: true,
      createdAt: new Date(),
    });

    // Link user back to roster record
    roster.registeredUserId = newUser._id;
    await roster.save();

    // Clean up used verification record
    await EmailVerificationModel.deleteOne({ _id: verificationRecord._id });

    // Record audit log
    await db.auditLogs.create({
      action: 'USER_REGISTERED_ROSTER_VERIFIED',
      actor: { id: newUser.id || newUser._id, name: newUser.name, role: newUser.role },
      details: { email: newUser.email, role: newUser.role, enrollmentNumber: newUser.enrollmentNumber },
      ip: req.ip || '127.0.0.1',
      timestamp: new Date(),
    });

    // Generate JWT for immediate authenticated login
    const payload = {
      id: newUser.id || newUser._id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      department: newUser.department,
      enrollmentNumber: newUser.enrollmentNumber,
      hostel: newUser.hostel,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Official identity verified successfully. Welcome to REC Bijnor Campus Care.',
      token,
      user: {
        id: newUser.id || newUser._id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        department: newUser.department,
        enrollmentNumber: newUser.enrollmentNumber,
        mobileNumber: newUser.mobileNumber,
        academicYear: newUser.academicYear,
        hostel: newUser.hostel,
        roomNumber: newUser.roomNumber,
        isActive: newUser.isActive,
      },
    });
  } catch (err: any) {
    console.error('[Registration OTP Verify Error]', err);
    res.status(500).json({ error: 'Failed to complete registration verification.' });
  }
});

// 3. Resend Registration OTP
// Requirement: Rate-limited resends with 60-second cooldown
router.post('/register/resend-otp', async (req, res): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Official college email is required.' });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();

    const verificationRecord = await EmailVerificationModel.findOne({
      email: cleanEmail,
      purpose: 'registration',
      isUsed: false,
    }).exec();

    if (!verificationRecord) {
      res.status(400).json({
        error: 'No pending registration session found. Please start a new registration.',
      });
      return;
    }

    // Check cooldown
    if (new Date() < verificationRecord.resendAvailableAt) {
      const waitSeconds = Math.ceil(
        (verificationRecord.resendAvailableAt.getTime() - Date.now()) / 1000
      );
      res.status(429).json({
        error: `Please wait ${waitSeconds} seconds before requesting a new code.`,
      });
      return;
    }

    // Check max resend count (max 4 per session)
    if (verificationRecord.resendCount >= 4) {
      res.status(429).json({
        error: 'Maximum resend limit reached for this session. Please start a new registration.',
      });
      return;
    }

    // Generate new OTP and update record
    const newOtp = generateNumericOtp(6);
    const salt = await bcrypt.genSalt(10);
    const otpHashed = await bcrypt.hash(newOtp, salt);

    verificationRecord.otpHashed = otpHashed;
    verificationRecord.attemptsRemaining = 3;
    verificationRecord.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    verificationRecord.resendAvailableAt = new Date(Date.now() + 60 * 1000);
    verificationRecord.resendCount += 1;
    await verificationRecord.save();

    // Fetch roster name for friendly email greeting
    const roster = await CollegeRosterModel.findOne({ email: cleanEmail }).exec();
    const recipientName = roster ? roster.name : 'Student/Faculty';

    const emailTemplate = renderOtpEmailTemplate({
      greetingName: recipientName,
      otp: newOtp,
      purpose: 'Official Campus Care Account Registration',
      expiresInMinutes: 10,
    });

    const emailResult = await sendEmail({
      to: cleanEmail,
      subject: 'New Verification Code - REC Bijnor Campus Care',
      html: emailTemplate.html,
      text: emailTemplate.text,
      eventType: 'registration_otp_resend',
    });

    if (process.env.NODE_ENV === 'production' && !emailResult.success && emailResult.status !== 'skipped') {
      res.status(502).json({
        error: 'Failed to resend verification code. Please check your official email or try again later.',
        deliveryStatus: emailResult.status,
        errorCategory: emailResult.errorCategory,
      });
      return;
    }

    res.json({
      message: 'A fresh 6-digit verification code has been dispatched to your official email.',
      emailMasked: maskEmail(cleanEmail),
      resendAvailableInSeconds: 60,
      devOtp: process.env.NODE_ENV !== 'production' ? newOtp : undefined,
    });
  } catch (err: any) {
    console.error('[Resend OTP Error]', err);
    res.status(500).json({ error: 'Failed to resend verification code.' });
  }
});


// Check whether accounts exist in the database (for initial setup detection)
router.get('/status', async (req, res): Promise<void> => {
  try {
    const allUsers = await db.users.find();
    res.json({
      hasUsers: allUsers.length > 0,
      totalUsers: allUsers.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to inspect auth status.' });
  }
});

// Setup initial administrator (only allowed when totalUsers === 0)
router.post('/setup-initial-admin', async (req, res): Promise<void> => {
  try {
    const allUsers = await db.users.find();
    if (allUsers.length > 0) {
      res.status(403).json({
        error: 'First-time setup is disabled. Institutional accounts already exist in the database.',
      });
      return;
    }

    const { name, email, identifier, password, mobileNumber, department } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required.' });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanIdentifier = identifier ? String(identifier).trim().toLowerCase() : cleanEmail.split('@')[0];

    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      res.status(400).json({ error: 'Please provide a valid institutional email address.' });
      return;
    }

    if (String(password).length < 8) {
      res.status(400).json({ error: 'Administrator password must be at least 8 characters long.' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(String(password), salt);

    const newAdmin = await db.users.create({
      id: 'admin_' + Date.now(),
      name: String(name).trim(),
      email: cleanEmail,
      identifier: cleanIdentifier,
      role: 'admin',
      passwordHash,
      department: department ? String(department).trim() : 'Administration',
      mobileNumber: mobileNumber ? String(mobileNumber).trim() : '',
      isActive: true,
      createdAt: new Date().toISOString(),
    });

    // Generate JWT
    const payload = {
      id: newAdmin.id || newAdmin._id,
      email: newAdmin.email,
      name: newAdmin.name,
      role: newAdmin.role,
      department: newAdmin.department,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Initial College Administrator account provisioned successfully.',
      token,
      user: {
        id: newAdmin.id || newAdmin._id,
        email: newAdmin.email,
        name: newAdmin.name,
        role: newAdmin.role,
        department: newAdmin.department,
        mobileNumber: newAdmin.mobileNumber,
        isActive: newAdmin.isActive,
      },
    });
  } catch (err: any) {
    console.error('[Initial Admin Setup Error]', err);
    res.status(500).json({ error: 'Failed to provision initial administrator.' });
  }
});

// Single Login Page - identifier (official email or roll no or username) + password
router.post('/login', async (req, res): Promise<void> => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      res.status(400).json({ error: 'Please enter both your college ID / email and password.' });
      return;
    }

    const cleanIdentifier = String(identifier).trim().toLowerCase();

    // Find user by identifier, email, or enrollmentNumber
    const allUsers = await db.users.find();
    const user = allUsers.find(
      (u: any) =>
        (u.identifier && u.identifier.toLowerCase() === cleanIdentifier) ||
        (u.email && u.email.toLowerCase() === cleanIdentifier) ||
        (u.enrollmentNumber && u.enrollmentNumber.toLowerCase() === cleanIdentifier)
    );

    const genericLoginError = 'Invalid institutional credentials. Please check your identifier and password.';

    if (!user) {
      res.status(401).json({ error: genericLoginError });
      return;
    }

    // Check account lockout status (5 consecutive failures = 15m lockout)
    const lockoutStatus = isAccountLocked(user);
    if (lockoutStatus.isLocked) {
      res.status(423).json({
        error: `Account is temporarily locked due to multiple failed login attempts. Please try again after ${lockoutStatus.remainingMinutes} minute(s) or reset your password.`,
      });
      return;
    }

    if (user.isActive === false) {
      res.status(403).json({ error: 'Your account has been deactivated. Please contact REC Bijnor Administration.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      const failureResult = await recordFailedLoginAttempt(user);
      if (failureResult.isLocked) {
        res.status(423).json({
          error: 'Account has been temporarily locked for 15 minutes due to 5 consecutive failed login attempts.',
        });
        return;
      }
      res.status(401).json({
        error: genericLoginError,
        attemptsRemaining: ACCOUNT_LOCKOUT_MAX_FAILURES - failureResult.attempts,
      });
      return;
    }

    // Successful login: reset failed login attempts
    await resetLoginAttempts(user);

    // Generate JWT
    const payload = {
      id: user.id || user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department,
      enrollmentNumber: user.enrollmentNumber,
      hostel: user.hostel,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    // Update last login
    await db.users.updateById(user.id || user._id, {
      lastLogin: new Date().toISOString(),
    });

    // Record audit
    await db.auditLogs.create({
      action: 'USER_LOGIN',
      actor: { id: user.id, name: user.name, role: user.role },
      details: { email: user.email, role: user.role },
      ip: req.ip || '127.0.0.1',
      timestamp: new Date().toISOString(),
    });

    res.json({
      token,
      user: {
        id: user.id || user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
        enrollmentNumber: user.enrollmentNumber,
        mobileNumber: user.mobileNumber,
        academicYear: user.academicYear,
        hostel: user.hostel,
        roomNumber: user.roomNumber,
        isActive: user.isActive,
      },
    });
  } catch (err: any) {
    console.error('[Auth Error]', err);
    res.status(500).json({ error: 'Internal authentication service error.' });
  }
});

// Current user profile
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }
    const user = await db.users.findById(req.user.id);
    if (!user) {
      res.status(404).json({ error: 'User profile not found.' });
      return;
    }

    const { passwordHash, ...safeProfile } = user;
    res.json({ user: safeProfile });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve profile.' });
  }
});

// Update permitted profile fields
router.patch('/profile', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    const { mobileNumber, hostel, roomNumber, notificationPreferences } = req.body;

    const updates: Record<string, any> = {};
    if (mobileNumber !== undefined) updates.mobileNumber = String(mobileNumber).trim();
    if (hostel !== undefined) updates.hostel = String(hostel).trim();
    if (roomNumber !== undefined) updates.roomNumber = String(roomNumber).trim();
    if (notificationPreferences && typeof notificationPreferences === 'object') {
      updates.notificationPreferences = {
        email: Boolean(notificationPreferences.email !== false),
        sms: Boolean(notificationPreferences.sms !== false),
        inApp: Boolean(notificationPreferences.inApp !== false),
      };
    }

    // Protect verified identity fields
    const updated = await db.users.updateById(req.user.id, updates);
    if (!updated) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const { passwordHash, ...safeProfile } = updated;
    res.json({ message: 'Profile updated successfully.', user: safeProfile });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// Password Reset Request (Generates single-use token)
const resetTokens: Record<string, { userId: string; expiresAt: number }> = {};

router.post('/forgot-password', async (req, res): Promise<void> => {
  try {
    const { identifier } = req.body;
    if (!identifier) {
      res.status(400).json({ error: 'Identifier is required.' });
      return;
    }

    const cleanIdentifier = String(identifier).trim().toLowerCase();
    const allUsers = await db.users.find();
    const user = allUsers.find(
      (u: any) =>
        (u.email && u.email.toLowerCase() === cleanIdentifier) ||
        (u.identifier && u.identifier.toLowerCase() === cleanIdentifier) ||
        (u.enrollmentNumber && u.enrollmentNumber.toLowerCase() === cleanIdentifier)
    );

    // Generic response regardless of whether user exists for security
    if (!user) {
      res.json({
        message: 'If the identifier matches an authorized institutional account, a secure reset token has been dispatched.',
      });
      return;
    }

    const token = Math.random().toString(36).substring(2, 8).toUpperCase();
    resetTokens[token] = {
      userId: user.id || user._id,
      expiresAt: Date.now() + 15 * 60 * 1000, // 15 mins
    };

    console.log(`[Password Reset Token for ${user.email}]: ${token}`);

    // Dispatch security verification email
    await notificationService.dispatchSecurityEvent({
      eventType: 'password_reset',
      user: {
        id: user.id || user._id,
        name: user.name,
        email: user.email,
        mobileNumber: user.mobileNumber,
      },
      resetToken: token,
    });

    res.json({
      message: 'If the identifier matches an authorized institutional account, a secure reset token has been dispatched.',
      demoToken: process.env.NODE_ENV !== 'production' ? token : undefined,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to initiate password reset.' });
  }
});

// Password Reset Confirmation
router.post('/reset-password', async (req, res): Promise<void> => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      res.status(400).json({ error: 'Token and new password are required.' });
      return;
    }

    if (String(newPassword).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }

    const record = resetTokens[token.trim().toUpperCase()];
    if (!record || Date.now() > record.expiresAt) {
      res.status(400).json({ error: 'Invalid or expired password reset token.' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await db.users.updateById(record.userId, { passwordHash });
    delete resetTokens[token.trim().toUpperCase()];

    res.json({ message: 'Password has been reset successfully. Please log in with your new password.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

export default router;
