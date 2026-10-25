import crypto from 'crypto';
import { CollegeRosterModel, ICollegeRoster } from '../models';
import { isValidEmail } from './emailService';
import { db } from '../db';

export interface RosterImportStats {
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; error: string; data?: any }>;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  roster?: ICollegeRoster;
}

// Mask email for generic public responses (e.g. s***l@recb.ac.in)
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***.***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  const first = local[0];
  const last = local[local.length - 1];
  const maskedLocal = `${first}${'*'.repeat(Math.min(local.length - 2, 5))}${last}`;
  return `${maskedLocal}@${domain}`;
}

// Generate cryptographically secure numeric OTP
export function generateNumericOtp(digits: number = 6): string {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  const num = crypto.randomInt(min, max + 1);
  return num.toString();
}

// Robust CSV Line Parser handling quotes and commas
function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        currentValue += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(currentValue.trim());
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  values.push(currentValue.trim());
  return values;
}

// Map various column header names to standard fields
function normalizeHeaderName(rawHeader: string): string {
  const h = rawHeader.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (h.includes('email') || h === 'mail') return 'email';
  if (h.includes('name') || h === 'fullname' || h === 'studentname' || h === 'facultyname') return 'name';
  if (h === 'role' || h === 'usertype' || h === 'category') return 'role';
  if (h.includes('enroll') || h.includes('roll') || h === 'rollno' || h === 'enrollmentno') return 'enrollmentNumber';
  if (h.includes('dept') || h.includes('department') || h === 'branch') return 'department';
  if (h.includes('year') || h.includes('academic') || h === 'batch') return 'academicYear';
  if (h.includes('hostel') || h === 'bh' || h === 'gh') return 'hostel';
  if (h.includes('room') || h === 'roomno') return 'roomNumber';
  if (h.includes('phone') || h.includes('mobile') || h.includes('contact')) return 'mobileNumber';
  return h;
}

export async function parseAndImportRosterCsv(csvText: string): Promise<RosterImportStats> {
  if (!db.isConnected) {
    throw new Error('Database service unavailable. Cannot import roster while MongoDB is disconnected.');
  }

  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const stats: RosterImportStats = {
    totalRows: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  if (lines.length < 2) {
    stats.errors.push({ row: 0, error: 'CSV file must include a header line and at least one data row.' });
    return stats;
  }

  // Parse header
  const headerTokens = parseCsvLine(lines[0]);
  const headerMap: Record<number, string> = {};

  headerTokens.forEach((rawCol, index) => {
    headerMap[index] = normalizeHeaderName(rawCol);
  });

  const validRoles = ['student', 'faculty', 'staff', 'admin'];

  // Process data lines
  for (let i = 1; i < lines.length; i++) {
    stats.totalRows++;
    const rowNum = i + 1;
    const tokens = parseCsvLine(lines[i]);

    if (tokens.length === 0 || tokens.every((t) => t === '')) {
      stats.skipped++;
      continue;
    }

    const rowData: Record<string, any> = {};
    tokens.forEach((val, colIdx) => {
      const field = headerMap[colIdx];
      if (field) {
        rowData[field] = val;
      }
    });

    const email = rowData.email ? String(rowData.email).trim().toLowerCase() : '';
    const name = rowData.name ? String(rowData.name).trim() : '';
    let role = rowData.role ? String(rowData.role).trim().toLowerCase() : 'student';
    const enrollmentNumber = rowData.enrollmentNumber ? String(rowData.enrollmentNumber).trim().toUpperCase() : undefined;
    const department = rowData.department ? String(rowData.department).trim() : undefined;
    const academicYear = rowData.academicYear ? String(rowData.academicYear).trim() : undefined;
    const hostel = rowData.hostel ? String(rowData.hostel).trim() : undefined;
    const roomNumber = rowData.roomNumber ? String(rowData.roomNumber).trim() : undefined;
    const mobileNumber = rowData.mobileNumber ? String(rowData.mobileNumber).trim() : undefined;

    // Validate email
    if (!email || !isValidEmail(email)) {
      stats.errors.push({ row: rowNum, error: `Invalid or missing email: "${email}"`, data: rowData });
      stats.skipped++;
      continue;
    }

    // Validate name
    if (!name) {
      stats.errors.push({ row: rowNum, error: 'Missing name', data: rowData });
      stats.skipped++;
      continue;
    }

    // Validate role
    if (!validRoles.includes(role)) {
      stats.errors.push({ row: rowNum, error: `Invalid role "${role}". Must be one of: ${validRoles.join(', ')}`, data: rowData });
      stats.skipped++;
      continue;
    }

    // Students must have enrollment number
    if (role === 'student' && !enrollmentNumber) {
      stats.errors.push({ row: rowNum, error: 'Student roster records require an enrollmentNumber/rollNumber', data: rowData });
      stats.skipped++;
      continue;
    }

    try {
      const existing = await CollegeRosterModel.findOne({ email }).exec();
      if (existing) {
        // Update details without unclaiming if already claimed
        existing.name = name;
        existing.role = role as any;
        if (enrollmentNumber !== undefined) existing.enrollmentNumber = enrollmentNumber;
        if (department !== undefined) existing.department = department;
        if (academicYear !== undefined) existing.academicYear = academicYear;
        if (hostel !== undefined) existing.hostel = hostel;
        if (roomNumber !== undefined) existing.roomNumber = roomNumber;
        if (mobileNumber !== undefined) existing.mobileNumber = mobileNumber;
        existing.isEligible = true; // Refresh eligibility
        await existing.save();
        stats.updated++;
      } else {
        await CollegeRosterModel.create({
          email,
          name,
          role,
          enrollmentNumber,
          department,
          academicYear,
          hostel,
          roomNumber,
          mobileNumber,
          isEligible: true,
          isClaimed: false,
        });
        stats.inserted++;
      }
    } catch (saveErr: any) {
      stats.errors.push({ row: rowNum, error: saveErr.message || 'Database error during roster upsert', data: rowData });
      stats.skipped++;
    }
  }

  return stats;
}

// Verify roster record eligibility
export async function verifyRosterEligibility(email: string, enrollmentNumber?: string): Promise<EligibilityResult> {
  if (!db.isConnected) {
    throw new Error('Database service unavailable. Cannot verify roster eligibility while MongoDB is disconnected.');
  }

  const cleanEmail = email.toLowerCase().trim();
  const roster = await CollegeRosterModel.findOne({ email: cleanEmail }).exec();

  if (!roster) {
    return {
      eligible: false,
      reason: 'No official college roster record found for this email address.',
    };
  }

  if (roster.isEligible === false) {
    return {
      eligible: false,
      reason: 'This college roster record is flagged as ineligible. Please contact College Administration.',
    };
  }

  if (roster.isClaimed === true) {
    return {
      eligible: false,
      reason: 'This college identity has already been activated and claimed.',
    };
  }

  // Strict check for students: enrollment number must match
  if (roster.role === 'student') {
    if (!enrollmentNumber) {
      return {
        eligible: false,
        reason: 'Enrollment number is required for student registration.',
      };
    }

    const cleanInputRoll = enrollmentNumber.toUpperCase().trim();
    const rosterRoll = (roster.enrollmentNumber || '').toUpperCase().trim();

    if (cleanInputRoll !== rosterRoll) {
      return {
        eligible: false,
        reason: 'Submitted enrollment number does not match the official college roster record.',
      };
    }
  }

  return {
    eligible: true,
    roster,
  };
}
