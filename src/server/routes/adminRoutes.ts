import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { CollegeRosterModel } from '../models';
import { authenticateToken, AuthenticatedRequest, requireRoles } from '../middleware/auth';
import { parseAndImportRosterCsv } from '../services/rosterService';

const router = Router();

// Protect all admin routes
router.use(authenticateToken);
router.use(requireRoles(['admin']));

// 1. Get all users
router.get('/users', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const users = await db.users.find();
    const safeUsers = users.map((u: any) => {
      const { passwordHash, ...rest } = u;
      return rest;
    });

    res.json({ users: safeUsers });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// 2. Admin provision new user (Student, Faculty, Staff, Admin)
router.post('/users', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      name,
      email,
      role,
      identifier,
      department,
      enrollmentNumber,
      mobileNumber,
      academicYear,
      hostel,
      roomNumber,
      temporaryPassword,
    } = req.body;

    if (!name || !email || !role) {
      res.status(400).json({ error: 'Name, email, and role are required.' });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanIdentifier = (identifier ? String(identifier).trim().toLowerCase() : cleanEmail);

    // Check duplicate
    const allUsers = await db.users.find();
    const existing = allUsers.find(
      (u: any) => u.email.toLowerCase() === cleanEmail || (u.identifier && u.identifier.toLowerCase() === cleanIdentifier)
    );
    if (existing) {
      res.status(400).json({ error: 'A user with this email or identifier already exists.' });
      return;
    }

    const tempPass = temporaryPassword || 'Password@123';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(tempPass, salt);

    const newUser = {
      name: name.trim(),
      email: cleanEmail,
      identifier: cleanIdentifier,
      role,
      passwordHash,
      department: department || '',
      enrollmentNumber: enrollmentNumber || '',
      mobileNumber: mobileNumber || '',
      academicYear: academicYear || '',
      hostel: hostel || '',
      roomNumber: roomNumber || '',
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    const created = await db.users.create(newUser);

    // Audit log
    await db.auditLogs.create({
      action: 'ADMIN_USER_PROVISIONED',
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      details: { targetEmail: cleanEmail, role, identifier: cleanIdentifier },
      ip: req.ip || '127.0.0.1',
      timestamp: new Date().toISOString(),
    });

    const { passwordHash: _, ...safeUser } = created;
    res.status(201).json({
      message: `Account for ${name} (${role}) provisioned successfully. Initial password: ${tempPass}`,
      user: safeUser,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to provision user.' });
  }
});

// 3. Toggle user active/deactive status (Safe deactivation strategy preserving complaint history)
router.patch('/users/:id/status', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (id === req.user!.id) {
      res.status(400).json({ error: 'You cannot deactivate your own administrative account.' });
      return;
    }

    const targetUser = await db.users.findById(id);
    if (!targetUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const updated = await db.users.updateById(id, { isActive: Boolean(isActive) });

    await db.auditLogs.create({
      action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      details: { targetUserId: id, targetEmail: targetUser.email, newStatus: isActive },
      ip: req.ip || '127.0.0.1',
      timestamp: new Date().toISOString(),
    });

    res.json({
      message: `User ${targetUser.name} has been ${isActive ? 'activated' : 'deactivated'}.`,
      user: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update user status.' });
  }
});

// 4. Admin issue temporary password
router.post('/users/:id/reset-password', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const targetUser = await db.users.findById(id);
    if (!targetUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const temporaryPassword = 'TempPassword@' + Math.floor(100 + Math.random() * 900);
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(temporaryPassword, salt);

    await db.users.updateById(id, { passwordHash });

    await db.auditLogs.create({
      action: 'ADMIN_PASSWORD_RESET',
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      details: { targetEmail: targetUser.email },
      ip: req.ip || '127.0.0.1',
      timestamp: new Date().toISOString(),
    });

    res.json({
      message: `Password reset successfully for ${targetUser.name}.`,
      temporaryPassword,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// 5. Get departments
router.get('/departments', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const departments = await db.departments.find();
    res.json({ departments });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch departments.' });
  }
});

// 6. Update department SLA settings
router.patch('/departments/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { headOfDepartment, contactEmail, slaHoursDefault } = req.body;

    const updates: Record<string, any> = {};
    if (headOfDepartment) updates.headOfDepartment = headOfDepartment;
    if (contactEmail) updates.contactEmail = contactEmail;
    if (slaHoursDefault) updates.slaHoursDefault = slaHoursDefault;

    const updated = await db.departments.updateById(id, updates);
    res.json({ message: 'Department configuration updated.', department: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update department.' });
  }
});

// 7. Get Audit Logs
router.get('/audit-logs', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const logs = await db.auditLogs.find();
    logs.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json({ logs: logs.slice(0, 50) });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch audit logs.' });
  }
});

// 8. Get College Roster Entries
router.get('/roster', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { role, isClaimed, search } = req.query;
    const query: Record<string, any> = {};

    if (role && role !== 'all') {
      query.role = role;
    }

    if (isClaimed !== undefined && isClaimed !== 'all') {
      query.isClaimed = isClaimed === 'true';
    }

    if (search && typeof search === 'string') {
      const term = search.trim();
      query.$or = [
        { name: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
        { enrollmentNumber: { $regex: term, $options: 'i' } },
        { department: { $regex: term, $options: 'i' } },
      ];
    }

    const roster = await CollegeRosterModel.find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean()
      .exec();

    const totalCount = await CollegeRosterModel.countDocuments();
    const claimedCount = await CollegeRosterModel.countDocuments({ isClaimed: true });

    res.json({
      roster,
      stats: {
        total: totalCount,
        claimed: claimedCount,
        unclaimed: totalCount - claimedCount,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve college roster entries.' });
  }
});

// 9. Import College Roster from CSV
router.post('/roster/import', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { csvText } = req.body;
    if (!csvText || typeof csvText !== 'string') {
      res.status(400).json({ error: 'CSV content is required (field: csvText).' });
      return;
    }

    const stats = await parseAndImportRosterCsv(csvText);

    // Audit log
    await db.auditLogs.create({
      action: 'ROSTER_CSV_IMPORTED',
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      details: { inserted: stats.inserted, updated: stats.updated, errors: stats.errors.length },
      ip: req.ip || '127.0.0.1',
      timestamp: new Date(),
    });

    res.json({
      message: `Roster import completed: ${stats.inserted} created, ${stats.updated} updated, ${stats.errors.length} errors.`,
      stats,
    });
  } catch (err: any) {
    console.error('[Roster CSV Import Error]', err);
    res.status(500).json({ error: err.message || 'Failed to process roster CSV import.' });
  }
});

// 10. Create Single Roster Entry
router.post('/roster/entry', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      email,
      name,
      role,
      enrollmentNumber,
      department,
      academicYear,
      hostel,
      roomNumber,
      mobileNumber,
    } = req.body;

    if (!email || !name || !role) {
      res.status(400).json({ error: 'Email, name, and role are required.' });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanEnrollment = enrollmentNumber ? String(enrollmentNumber).trim().toUpperCase() : undefined;

    if (role === 'student' && !cleanEnrollment) {
      res.status(400).json({ error: 'Students must have an enrollment number.' });
      return;
    }

    const existing = await CollegeRosterModel.findOne({ email: cleanEmail }).exec();
    if (existing) {
      res.status(400).json({ error: 'A roster entry with this email address already exists.' });
      return;
    }

    const entry = await CollegeRosterModel.create({
      email: cleanEmail,
      name: String(name).trim(),
      role,
      enrollmentNumber: cleanEnrollment,
      department: department ? String(department).trim() : undefined,
      academicYear: academicYear ? String(academicYear).trim() : undefined,
      hostel: hostel ? String(hostel).trim() : undefined,
      roomNumber: roomNumber ? String(roomNumber).trim() : undefined,
      mobileNumber: mobileNumber ? String(mobileNumber).trim() : undefined,
      isEligible: true,
      isClaimed: false,
    });

    res.status(201).json({
      message: 'College roster entry added successfully.',
      entry,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create roster entry.' });
  }
});

// 11. Toggle Roster Eligibility
router.patch('/roster/:id/toggle-eligibility', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const entry = await CollegeRosterModel.findById(id).exec();
    if (!entry) {
      res.status(404).json({ error: 'Roster entry not found.' });
      return;
    }

    entry.isEligible = !entry.isEligible;
    await entry.save();

    res.json({
      message: `Roster record for ${entry.email} is now ${entry.isEligible ? 'Eligible' : 'Ineligible'}.`,
      entry,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update roster record eligibility.' });
  }
});

export default router;
