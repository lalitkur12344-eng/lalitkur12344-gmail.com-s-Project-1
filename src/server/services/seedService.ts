import bcrypt from 'bcryptjs';
import { db } from '../db';
import { UserModel, ComplaintModel, NotificationModel } from '../models';

export const PRE_SEEDED_USER_IDS = [
  'usr_admin_01',
  'usr_faculty_01',
  'usr_staff_elec',
  'usr_staff_hst',
  'usr_staff_net',
  'usr_stud_01',
  'usr_stud_02',
];

export async function purgePreSeededAccounts(): Promise<{ deletedUsers: number; deletedComplaints: number }> {
  if (!db.isConnected) return { deletedUsers: 0, deletedComplaints: 0 };

  try {
    // Purge any pre-seeded demo users by ID or demo identifier
    const userDeleteRes = await UserModel.deleteMany({
      $or: [
        { id: { $in: PRE_SEEDED_USER_IDS } },
        { identifier: { $in: ['admin', 'fac_cs_01', 'stf_elec_01', 'stf_hst_01', 'stf_net_01', '2201330100045', '2301330100088'] } },
        { email: { $in: ['admin@recb.ac.in', 'faculty.cs@recb.ac.in', 'staff.electrical@recb.ac.in', 'staff.hostel@recb.ac.in', 'staff.network@recb.ac.in', 'student.rahul@recb.ac.in', 'student.priya@recb.ac.in'] } },
      ],
    });

    // Also purge demo complaints and dummy notifications created with pre-seeded IDs
    const complaintDeleteRes = await ComplaintModel.deleteMany({
      $or: [
        { id: { $in: ['rec_cmp_1001', 'rec_cmp_1002', 'rec_cmp_1003', 'rec_cmp_1004'] } },
        { complaintId: { $in: ['REC-2026-1001', 'REC-2026-1002', 'REC-2026-1003', 'REC-2026-1004'] } },
        { 'createdBy.id': { $in: PRE_SEEDED_USER_IDS } },
      ],
    });

    await NotificationModel.deleteMany({
      recipientId: { $in: PRE_SEEDED_USER_IDS },
    });

    if (userDeleteRes.deletedCount > 0 || complaintDeleteRes.deletedCount > 0) {
      console.log(`[Seed Service] Successfully purged ${userDeleteRes.deletedCount} pre-seeded demo accounts and ${complaintDeleteRes.deletedCount} demo complaints.`);
    }

    return {
      deletedUsers: userDeleteRes.deletedCount,
      deletedComplaints: complaintDeleteRes.deletedCount,
    };
  } catch (err: any) {
    console.warn('[Seed Service] Notice during pre-seeded account purge:', err.message);
    return { deletedUsers: 0, deletedComplaints: 0 };
  }
}

export async function seedInitialDataIfEmpty(): Promise<void> {
  if (!db.isConnected) return;

  // 1. Purge any pre-seeded demo accounts if present from past runs
  await purgePreSeededAccounts();

  // 2. Ensure institutional facility departments exist (Electricity, Water, Hostel, etc.)
  const existingDepartments = await db.departments.find();
  if (existingDepartments.length === 0) {
    console.log('[Seed Service] Initializing REC Bijnor institutional facility departments...');
    const departmentsData = [
      {
        id: 'dept_elec',
        name: 'Electricity',
        code: 'ELEC',
        headOfDepartment: 'Er. S. P. Gupta (Executive Engineer Electrical)',
        contactEmail: 'electrical@recb.ac.in',
        slaHoursDefault: { Low: 36, Medium: 16, High: 8, Emergency: 4 },
        categories: ['Electricity'],
      },
      {
        id: 'dept_wtr',
        name: 'Water',
        code: 'WTR',
        headOfDepartment: 'Er. Anil Rawat (Junior Engineer Civil)',
        contactEmail: 'water.works@recb.ac.in',
        slaHoursDefault: { Low: 36, Medium: 18, High: 8, Emergency: 4 },
        categories: ['Water'],
      },
      {
        id: 'dept_hst',
        name: 'Hostel',
        code: 'HST',
        headOfDepartment: 'Prof. M. K. Pandey (Chief Hostel Warden)',
        contactEmail: 'chiefwarden@recb.ac.in',
        slaHoursDefault: { Low: 48, Medium: 24, High: 12, Emergency: 4 },
        categories: ['Hostel', 'Mess & Food'],
      },
      {
        id: 'dept_san',
        name: 'Sanitation',
        code: 'SAN',
        headOfDepartment: 'Dr. Sunita Dixit (Sanitation In-charge)',
        contactEmail: 'sanitation@recb.ac.in',
        slaHoursDefault: { Low: 24, Medium: 12, High: 6, Emergency: 2 },
        categories: ['Cleanliness', 'Sanitation'],
      },
      {
        id: 'dept_net',
        name: 'Internet & Network',
        code: 'NET',
        headOfDepartment: 'Dr. Amit Verma (Head Computer Center)',
        contactEmail: 'computercenter@recb.ac.in',
        slaHoursDefault: { Low: 36, Medium: 18, High: 8, Emergency: 4 },
        categories: ['Internet & Network'],
      },
      {
        id: 'dept_maint',
        name: 'Maintenance',
        code: 'MAINT',
        headOfDepartment: 'Er. D. K. Sharma (Estate Officer)',
        contactEmail: 'estate@recb.ac.in',
        slaHoursDefault: { Low: 48, Medium: 24, High: 12, Emergency: 6 },
        categories: ['Maintenance', 'Other'],
      },
      {
        id: 'dept_lib',
        name: 'Academic & Library',
        code: 'LIB',
        headOfDepartment: 'Dr. R. K. Singh (Librarian)',
        contactEmail: 'library@recb.ac.in',
        slaHoursDefault: { Low: 48, Medium: 24, High: 12, Emergency: 6 },
        categories: ['Library'],
      },
    ];

    for (const dept of departmentsData) {
      await db.departments.create(dept);
    }
  }

  // 3. Optional: If environment specifies an initial admin, provision it securely if zero users exist
  const totalUsers = await db.users.find();
  const adminEmail = process.env.ADMIN_EMAIL || process.env.INITIAL_ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD;

  if (totalUsers.length === 0 && adminEmail && adminPassword) {
    console.log(`[Seed Service] Provisioning initial administrator from environment (${adminEmail})...`);
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(adminPassword, salt);
    await db.users.create({
      id: 'admin_' + Date.now(),
      identifier: adminEmail.split('@')[0],
      email: adminEmail.toLowerCase().trim(),
      name: process.env.ADMIN_NAME || 'Campus Care Administrator',
      role: 'admin',
      passwordHash,
      department: 'Administration',
      isActive: true,
      createdAt: new Date().toISOString(),
    });
    console.log('[Seed Service] Initial administrator provisioned successfully.');
  }

  console.log(`[Seed Service] Baseline verified. No pre-seeded demo accounts created. Current user count: ${(await db.users.find()).length}`);
}
