import { Router, Response } from 'express';
import { db } from '../db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { analyzeComplaintWithAI, detectDuplicateComplaint, CATEGORY_DEPARTMENT_MAP } from '../services/aiService';
import { notificationService } from '../services/notificationService';

const router = Router();

// Automatic Staff Assignment Helper
async function findBestStaffForDepartment(departmentName: string) {
  const allUsers = await db.users.find({ role: 'staff', isActive: true });
  const deptStaff = allUsers.filter(
    (s: any) => s.department && s.department.toLowerCase() === departmentName.toLowerCase()
  );

  if (deptStaff.length === 0) {
    // If no staff in exact department, try general maintenance
    const fallbackStaff = allUsers.find((s: any) => s.department === 'Maintenance');
    return fallbackStaff || null;
  }

  // Workload balancing: find staff with least open tickets
  const allComplaints = await db.complaints.find();
  const staffWorkloads: Record<string, number> = {};

  deptStaff.forEach((s: any) => {
    staffWorkloads[s.id || s._id] = 0;
  });

  allComplaints.forEach((c: any) => {
    if (
      (c.status === 'Assigned' || c.status === 'In Progress') &&
      c.assignedTo?.id &&
      staffWorkloads[c.assignedTo.id] !== undefined
    ) {
      staffWorkloads[c.assignedTo.id]++;
    }
  });

  // Sort staff by lowest workload
  deptStaff.sort((a: any, b: any) => {
    const idA = a.id || a._id;
    const idB = b.id || b._id;
    return (staffWorkloads[idA] || 0) - (staffWorkloads[idB] || 0);
  });

  return deptStaff[0];
}

// 1. Submit Complaint
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const {
      title,
      description,
      category: requestedCategory,
      location,
      priority: requestedPriority,
      evidenceImages,
    } = req.body;

    if (!title || !description || !location || !location.area) {
      res.status(400).json({ error: 'Please provide complaint title, description, and campus location details.' });
      return;
    }

    // AI Analysis & Triage
    const aiResult = await analyzeComplaintWithAI(title, description);

    // Prioritize user explicit selection or AI recommendation
    const category = requestedCategory || aiResult.category;
    const priority = requestedPriority || aiResult.urgency;
    const assignedDepartment = CATEGORY_DEPARTMENT_MAP[category] || aiResult.department || 'Maintenance';

    // Duplicate detection against open complaints
    const openComplaints = await db.complaints.find();
    const activeOpen = openComplaints.filter((c: any) => c.status !== 'Resolved' && c.status !== 'Closed');
    const duplicateCheck = detectDuplicateComplaint(title, description, category, location, activeOpen);

    // Calculate SLA
    const departmentRecord = await db.departments.findOne({ name: assignedDepartment });
    const slaHours =
      departmentRecord?.slaHoursDefault?.[priority as 'Low' | 'Medium' | 'High' | 'Emergency'] ||
      aiResult.slaHours ||
      24;

    const now = new Date();
    const slaDeadline = new Date(now.getTime() + slaHours * 3600 * 1000);

    // Generate unique complaint ID (REC-2026-XXXX)
    const count = await db.complaints.count();
    const complaintId = `REC-2026-${(1001 + count).toString()}`;

    // Auto Staff Assignment
    const assignedStaff = await findBestStaffForDepartment(assignedDepartment);
    const initialStatus = assignedStaff ? 'Assigned' : 'Pending';

    const newComplaint = {
      complaintId,
      title: title.trim(),
      description: description.trim(),
      category,
      location: {
        area: location.area,
        block: location.block || '',
        room: location.room || '',
        landmark: location.landmark || '',
      },
      priority,
      severity: aiResult.severity,
      status: initialStatus,
      isEscalated: false,
      createdBy: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        mobileNumber: (req.user as any).mobileNumber || '',
      },
      assignedTo: assignedStaff
        ? {
            id: assignedStaff.id || assignedStaff._id,
            name: assignedStaff.name,
            email: assignedStaff.email,
            department: assignedStaff.department,
          }
        : null,
      assignedDepartment,
      evidenceImages: Array.isArray(evidenceImages) ? evidenceImages : [],
      resolutionNotes: '',
      resolutionEvidence: [],
      slaHours,
      slaDeadline: slaDeadline.toISOString(),
      aiSummary: aiResult.summary,
      aiSuggestedChecklist: aiResult.suggestedChecklist,
      history: [
        {
          timestamp: now.toISOString(),
          action: 'SUBMITTED',
          actor: { id: req.user.id, name: req.user.name, role: req.user.role },
          notes: `Complaint filed via portal. Categorized under ${category} (${assignedDepartment}).`,
        },
        ...(assignedStaff
          ? [
              {
                timestamp: new Date(now.getTime() + 100).toISOString(),
                action: 'AUTO_ASSIGNED',
                actor: { id: 'SYSTEM_DISPATCHER', name: 'Workload Balancing Engine', role: 'system' },
                notes: `Automatically assigned to ${assignedStaff.name} based on department duty roster and active workload.`,
              },
            ]
          : [
              {
                timestamp: new Date(now.getTime() + 100).toISOString(),
                action: 'UNASSIGNED_QUEUE',
                actor: { id: 'SYSTEM', name: 'Campus Care Dispatcher', role: 'system' },
                notes: 'No active staff currently available in department. Flagged for Admin manual assignment.',
              },
            ]),
      ],
      feedback: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const saved = await db.complaints.create(newComplaint);

    // Dispatch multi-channel notifications (In-App, Email, SMS) asynchronously
    await notificationService.dispatchComplaintEvent({
      eventType: 'complaint_submitted',
      complaint: saved,
      actor: { id: req.user.id, name: req.user.name, role: req.user.role },
    });

    // Audit Log
    await db.auditLogs.create({
      action: 'COMPLAINT_CREATED',
      actor: { id: req.user.id, name: req.user.name, role: req.user.role },
      details: { complaintId, category, priority, department: assignedDepartment },
      ip: req.ip || '127.0.0.1',
      timestamp: now.toISOString(),
    });

    res.status(201).json({
      message: 'Complaint submitted successfully.',
      complaint: saved,
      duplicateWarning: duplicateCheck.isDuplicateCandidate ? duplicateCheck : null,
    });
  } catch (err: any) {
    console.error('[Create Complaint Error]', err);
    res.status(500).json({ error: 'Failed to record complaint in database.' });
  }
});

// 2. Get Complaints (Role-governed + Filtered)
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { status, category, priority, department, search, assignedToMe } = req.query;

    const all = await db.complaints.find();

    // Role-based filtering
    let filtered = all.filter((c: any) => {
      if (req.user!.role === 'student' || req.user!.role === 'faculty') {
        return c.createdBy?.id === req.user!.id;
      }
      if (req.user!.role === 'staff') {
        if (assignedToMe === 'true') {
          return c.assignedTo?.id === req.user!.id;
        }
        // Staff see complaints in their department OR assigned to them
        return (
          c.assignedTo?.id === req.user!.id ||
          (req.user!.department && c.assignedDepartment === req.user!.department)
        );
      }
      // Admin sees all
      return true;
    });

    // Query filters
    if (status && status !== 'all') {
      filtered = filtered.filter((c: any) => c.status === status);
    }
    if (category && category !== 'all') {
      filtered = filtered.filter((c: any) => c.category === category);
    }
    if (priority && priority !== 'all') {
      filtered = filtered.filter((c: any) => c.priority === priority);
    }
    if (department && department !== 'all') {
      filtered = filtered.filter((c: any) => c.assignedDepartment === department);
    }
    if (search) {
      const q = String(search).toLowerCase();
      filtered = filtered.filter(
        (c: any) =>
          c.complaintId?.toLowerCase().includes(q) ||
          c.title?.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.location?.area?.toLowerCase().includes(q) ||
          c.location?.block?.toLowerCase().includes(q)
      );
    }

    // Sort newest first
    filtered.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ complaints: filtered, total: filtered.length });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve complaints.' });
  }
});

// 3. Get Single Complaint Details
router.get('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const complaint = await db.complaints.findOne({
      $or: [{ id }, { _id: id }, { complaintId: id }],
    });

    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    // Authorization check
    if (
      req.user?.role === 'student' ||
      req.user?.role === 'faculty'
    ) {
      if (complaint.createdBy?.id !== req.user.id) {
        res.status(403).json({ error: 'Access denied. You can only view your own complaints.' });
        return;
      }
    }

    res.json({ complaint });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch complaint details.' });
  }
});

// 4. Update Complaint Status (Role-restricted lifecycle)
router.patch('/:id/status', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status: newStatus, resolutionNotes, resolutionEvidence } = req.body;

    const complaint = await db.complaints.findOne({
      $or: [{ id }, { _id: id }, { complaintId: id }],
    });

    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    const currentStatus = complaint.status;
    const userRole = req.user!.role;
    const userId = req.user!.id;

    // Validate permission and allowed transitions
    const validStatuses = ['Pending', 'Assigned', 'In Progress', 'Resolved', 'Closed', 'Reopened'];
    if (!validStatuses.includes(newStatus)) {
      res.status(400).json({ error: 'Invalid complaint status target.' });
      return;
    }

    // Students / Faculty can only Reopen or Close their own resolved complaint
    if (userRole === 'student' || userRole === 'faculty') {
      if (complaint.createdBy.id !== userId) {
        res.status(403).json({ error: 'Unauthorized to change status of this complaint.' });
        return;
      }
      if (newStatus !== 'Reopened' && newStatus !== 'Closed') {
        res.status(403).json({ error: 'You can only Reopen or Confirm Closure of your resolved complaints.' });
        return;
      }
      if (currentStatus !== 'Resolved') {
        res.status(400).json({ error: 'Complaint can only be reopened or closed once marked Resolved.' });
        return;
      }
    }

    // Staff can update tickets assigned to them or in their department to In Progress or Resolved
    if (userRole === 'staff') {
      const isAssigned = complaint.assignedTo?.id === userId;
      const isSameDept = req.user!.department && complaint.assignedDepartment === req.user!.department;

      if (!isAssigned && !isSameDept) {
        res.status(403).json({ error: 'Staff can only update complaints within their department.' });
        return;
      }
    }

    const now = new Date();
    const actionName = `STATUS_${newStatus.toUpperCase()}`;
    const updatedHistory = [
      ...(complaint.history || []),
      {
        timestamp: now.toISOString(),
        action: actionName,
        actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
        notes: resolutionNotes || `Status updated from ${currentStatus} to ${newStatus}.`,
      },
    ];

    const updates: Record<string, any> = {
      status: newStatus,
      history: updatedHistory,
      updatedAt: now.toISOString(),
    };

    if (resolutionNotes) {
      updates.resolutionNotes = resolutionNotes;
    }
    if (Array.isArray(resolutionEvidence) && resolutionEvidence.length > 0) {
      updates.resolutionEvidence = resolutionEvidence;
    }
    if (newStatus === 'Resolved') {
      updates.resolvedAt = now.toISOString();
    }
    if (newStatus === 'Reopened') {
      updates.isEscalated = false;
    }

    const updated = await db.complaints.updateById(complaint.id, updates);

    // Dispatch multi-channel notifications (In-App, Email, SMS) asynchronously
    const targetEvent =
      newStatus === 'Resolved'
        ? 'complaint_resolved'
        : newStatus === 'Reopened'
        ? 'complaint_reopened'
        : 'complaint_status_changed';

    await notificationService.dispatchComplaintEvent({
      eventType: targetEvent,
      complaint: updated || complaint,
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      notes: resolutionNotes,
    });

    res.json({ message: 'Complaint status updated successfully.', complaint: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update status.' });
  }
});

// 5. Admin / HOD Reassign Complaint
router.patch('/:id/reassign', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'admin' && req.user?.role !== 'staff') {
      res.status(403).json({ error: 'Only Administrators or Department Supervisors can reassign complaints.' });
      return;
    }

    const { id } = req.params;
    const { newStaffId, newDepartment, reason } = req.body;

    const complaint = await db.complaints.findOne({
      $or: [{ id }, { _id: id }, { complaintId: id }],
    });

    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    const newStaff = newStaffId ? await db.users.findById(newStaffId) : null;
    const now = new Date();

    const reassignmentNotes = `Reassigned by ${req.user.name}. Reason: ${reason || 'Workload adjustment/Specialist dispatch'}.`;

    const updatedHistory = [
      ...(complaint.history || []),
      {
        timestamp: now.toISOString(),
        action: 'REASSIGNED',
        actor: { id: req.user.id, name: req.user.name, role: req.user.role },
        notes: reassignmentNotes,
      },
    ];

    const updates: Record<string, any> = {
      history: updatedHistory,
      status: 'Assigned',
      updatedAt: now.toISOString(),
    };

    if (newDepartment) updates.assignedDepartment = newDepartment;
    if (newStaff) {
      updates.assignedTo = {
        id: newStaff.id || newStaff._id,
        name: newStaff.name,
        email: newStaff.email,
        department: newStaff.department,
      };
    }

    const updated = await db.complaints.updateById(complaint.id, updates);

    // Dispatch multi-channel notifications (In-App, Email, SMS) asynchronously
    await notificationService.dispatchComplaintEvent({
      eventType: 'complaint_reassigned',
      complaint: updated || complaint,
      actor: { id: req.user.id, name: req.user.name, role: req.user.role },
      reason,
      newStaff: newStaff
        ? {
            id: newStaff.id || newStaff._id,
            name: newStaff.name,
            email: newStaff.email,
            mobileNumber: newStaff.mobileNumber,
          }
        : null,
    });

    res.json({ message: 'Complaint reassigned successfully.', complaint: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reassign complaint.' });
  }
});

// 6. Add Progress Note to Complaint
router.post('/:id/notes', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    if (!note || !note.trim()) {
      res.status(400).json({ error: 'Note content cannot be empty.' });
      return;
    }

    const complaint = await db.complaints.findOne({
      $or: [{ id }, { _id: id }, { complaintId: id }],
    });

    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    const now = new Date();
    const updatedHistory = [
      ...(complaint.history || []),
      {
        timestamp: now.toISOString(),
        action: 'NOTE_ADDED',
        actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
        notes: note.trim(),
      },
    ];

    const updated = await db.complaints.updateById(complaint.id, {
      history: updatedHistory,
      updatedAt: now.toISOString(),
    });

    res.json({ message: 'Progress note added.', complaint: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to add progress note.' });
  }
});

// 7. Submit Feedback / Rating (for Resolved Complaints)
router.post('/:id/feedback', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { rating, comments } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'Please provide a satisfaction rating between 1 and 5 stars.' });
      return;
    }

    const complaint = await db.complaints.findOne({
      $or: [{ id }, { _id: id }, { complaintId: id }],
    });

    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    if (complaint.createdBy.id !== req.user!.id && req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Only the complaint submitter can provide feedback.' });
      return;
    }

    const now = new Date();
    const feedbackObj = {
      rating: Number(rating),
      comments: comments ? String(comments).trim() : '',
      submittedAt: now.toISOString(),
    };

    const updatedHistory = [
      ...(complaint.history || []),
      {
        timestamp: now.toISOString(),
        action: 'FEEDBACK_SUBMITTED',
        actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
        notes: `Rated ${rating}/5 stars. ${comments ? `Feedback: "${comments}"` : ''}`,
      },
    ];

    const updated = await db.complaints.updateById(complaint.id, {
      feedback: feedbackObj,
      status: 'Closed', // Automatically closes once satisfied feedback submitted
      history: updatedHistory,
      updatedAt: now.toISOString(),
    });

    res.json({ message: 'Thank you! Your feedback has been recorded.', complaint: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to record feedback.' });
  }
});

export default router;
