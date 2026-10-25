import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { normalizeToE164 } from './smsService';
import { UserModel } from '../models';

export const ACCOUNT_LOCKOUT_MAX_FAILURES = 5;
export const ACCOUNT_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Institutional Email Validation
 * - Allowed domains: @recb.ac.in (and @recbijnor.ac.in if explicitly enabled)
 * - Trims whitespace and normalizes to lowercase
 * - Strictly rejects unauthorized domains (gmail, yahoo, outlook, etc.)
 * - Defends against domain spoofing (e.g. user@recb.ac.in.attacker.com or user@fakerecb.ac.in)
 */
export function validateInstitutionalEmail(rawEmail: string): {
  valid: boolean;
  normalized: string;
  reason?: string;
} {
  if (!rawEmail || typeof rawEmail !== 'string') {
    return { valid: false, normalized: '', reason: 'Official college email is required.' };
  }

  const clean = rawEmail.trim().toLowerCase();

  // Basic RFC pattern check
  const basicEmailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!basicEmailRegex.test(clean)) {
    return { valid: false, normalized: clean, reason: 'Please enter a valid institutional email format.' };
  }

  const parts = clean.split('@');
  if (parts.length !== 2) {
    return { valid: false, normalized: clean, reason: 'Malformed email address.' };
  }

  const [localPart, domain] = parts;
  if (!localPart || localPart.length < 2) {
    return { valid: false, normalized: clean, reason: 'Invalid email username segment.' };
  }

  // Institutional domain policy
  const allowAlt = process.env.ALLOW_RECBIJNOR_DOMAIN === 'true';
  const isApproved =
    domain === 'recb.ac.in' || (allowAlt && domain === 'recbijnor.ac.in');

  if (!isApproved) {
    return {
      valid: false,
      normalized: clean,
      reason: 'Only official college email (@recb.ac.in) is permitted. Commercial providers (Gmail, Yahoo, etc.) are strictly prohibited.',
    };
  }

  return { valid: true, normalized: clean };
}

/**
 * 15-Digit Enrollment Number Validation
 * - Exactly 15 numeric digits (/^[0-9]{15}$/)
 * - Digits 0..1: Admission year segment (e.g. 23)
 * - Digits 2..5: Fixed college code '0735'
 * - Digits 6..14: Student-specific numeric segment (9 digits)
 * - Preserved as string throughout; never converted to JS Number
 */
export function validateEnrollmentNumber(rawEnrollment: string): {
  valid: boolean;
  normalized: string;
  reason?: string;
  details?: {
    admissionYear: string;
    collegeCode: string;
    studentSegment: string;
  };
} {
  if (!rawEnrollment || typeof rawEnrollment !== 'string') {
    return { valid: false, normalized: '', reason: 'Fifteen-digit enrollment number is required.' };
  }

  const clean = rawEnrollment.trim();

  // Must be strictly 15 numeric digits (reject spaces, letters, punctuation, 14 or 16 digits)
  if (!/^[0-9]{15}$/.test(clean)) {
    return {
      valid: false,
      normalized: clean,
      reason: 'Enrollment number must be exactly 15 numeric digits without spaces or symbols (e.g. 230735013069249).',
    };
  }

  const admissionYear = clean.substring(0, 2);
  const collegeCode = clean.substring(2, 6);
  const studentSegment = clean.substring(6);

  if (collegeCode !== '0735') {
    return {
      valid: false,
      normalized: clean,
      reason: 'Enrollment number college code segment must match REC Bijnor institutional code (0735).',
    };
  }

  return {
    valid: true,
    normalized: clean,
    details: { admissionYear, collegeCode, studentSegment },
  };
}

/**
 * Mobile Number Normalization & Validation
 */
export function validateMobileNumber(rawMobile: string): {
  valid: boolean;
  normalized: string;
  reason?: string;
} {
  if (!rawMobile || typeof rawMobile !== 'string') {
    return { valid: false, normalized: '', reason: 'Mobile phone number with country code is required.' };
  }

  const normalized = normalizeToE164(rawMobile);
  if (!normalized) {
    return {
      valid: false,
      normalized: '',
      reason: 'Invalid mobile phone number format. Please provide a valid mobile number with country code (e.g. +919876543210).',
    };
  }

  return { valid: true, normalized };
}

/**
 * Mask Email for Generic Non-Enumerating Responses
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***.***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  const first = local[0];
  const last = local[local.length - 1];
  const maskedLocal = `${first}${'*'.repeat(Math.min(local.length - 2, 4))}${last}`;
  return `${maskedLocal}@${domain}`;
}

/**
 * Mask Phone Number for Generic Non-Enumerating Responses
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return '+** ***** ****';
  const clean = phone.trim();
  const last4 = clean.slice(-4);
  const prefix = clean.slice(0, 3); // e.g. +91
  return `${prefix}******${last4}`;
}

/**
 * Cryptographically Secure 6-Digit OTP Generator
 */
export function generateSecureNumericOtp(digits: number = 6): string {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  const num = crypto.randomInt(min, max + 1);
  return num.toString();
}

/**
 * Check whether an account is currently locked out
 */
export function isAccountLocked(user: any): { isLocked: boolean; remainingMinutes?: number } {
  if (!user.lockUntil) {
    return { isLocked: false };
  }

  const lockTime = new Date(user.lockUntil).getTime();
  const now = Date.now();

  if (now < lockTime) {
    const remainingMs = lockTime - now;
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));
    return { isLocked: true, remainingMinutes };
  }

  return { isLocked: false };
}

/**
 * Record a failed login attempt; lock out if threshold reached
 */
export async function recordFailedLoginAttempt(user: any): Promise<{
  isLocked: boolean;
  attempts: number;
  remainingMinutes?: number;
}> {
  const currentAttempts = (user.failedLoginAttempts || 0) + 1;
  user.failedLoginAttempts = currentAttempts;

  let isLocked = false;
  let remainingMinutes: number | undefined;

  if (currentAttempts >= ACCOUNT_LOCKOUT_MAX_FAILURES) {
    const lockUntil = new Date(Date.now() + ACCOUNT_LOCKOUT_DURATION_MS);
    user.lockUntil = lockUntil;
    isLocked = true;
    remainingMinutes = 15;
  }

  // Persist to MongoDB if active connection is ready
  try {
    if (typeof user.save === 'function') {
      await user.save();
    } else if (UserModel && mongoose.connection.readyState === 1) {
      const isObjectId = user._id && mongoose.Types.ObjectId.isValid(user._id);
      const query = isObjectId
        ? { _id: user._id }
        : { $or: [{ email: user.email }, { identifier: user.identifier || user.id }] };
      const updates: Record<string, any> = {
        failedLoginAttempts: currentAttempts,
        ...(isLocked ? { lockUntil: user.lockUntil } : {}),
      };
      await UserModel.updateOne(query, { $set: updates }).exec();
    }
  } catch (err) {
    // In disconnected mock tests or memory models, user in-memory state is preserved
  }

  return {
    isLocked,
    attempts: currentAttempts,
    remainingMinutes,
  };
}

/**
 * Reset failed login attempts upon successful authentication
 */
export async function resetLoginAttempts(user: any): Promise<void> {
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  user.lastLogin = new Date();

  try {
    if (typeof user.save === 'function') {
      await user.save();
    } else if (UserModel && mongoose.connection.readyState === 1) {
      const isObjectId = user._id && mongoose.Types.ObjectId.isValid(user._id);
      const query = isObjectId
        ? { _id: user._id }
        : { $or: [{ email: user.email }, { identifier: user.identifier || user.id }] };
      await UserModel.updateOne(query, {
        $set: { failedLoginAttempts: 0, lockUntil: null, lastLogin: new Date() },
      }).exec();
    }
  } catch (err) {
    // In disconnected mock tests or memory models, user in-memory state is preserved
  }
}
