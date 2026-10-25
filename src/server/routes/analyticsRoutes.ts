import { Router, Response } from 'express';
import { db } from '../db';
import { authenticateToken, AuthenticatedRequest, requireRoles } from '../middleware/auth';

const router = Router();

router.get(
  '/',
  authenticateToken,
  requireRoles(['admin', 'staff', 'faculty']),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const complaints = await db.complaints.find();
      const staffUsers = await db.users.find({ role: 'staff' });
      const departments = await db.departments.find();

      const total = complaints.length;
      const pending = complaints.filter((c: any) => c.status === 'Pending').length;
      const assigned = complaints.filter((c: any) => c.status === 'Assigned').length;
      const inProgress = complaints.filter((c: any) => c.status === 'In Progress').length;
      const resolved = complaints.filter((c: any) => c.status === 'Resolved').length;
      const closed = complaints.filter((c: any) => c.status === 'Closed').length;
      const reopened = complaints.filter((c: any) => c.status === 'Reopened').length;
      const escalated = complaints.filter((c: any) => c.isEscalated).length;

      const emergency = complaints.filter((c: any) => c.priority === 'Emergency').length;
      const highPriority = complaints.filter((c: any) => c.priority === 'High').length;

      // Category breakdown
      const categoryCounts: Record<string, number> = {};
      complaints.forEach((c: any) => {
        categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
      });

      // Department breakdown
      const departmentCounts: Record<string, number> = {};
      complaints.forEach((c: any) => {
        departmentCounts[c.assignedDepartment] = (departmentCounts[c.assignedDepartment] || 0) + 1;
      });

      // Resolution time calculation (in hours)
      const resolvedComplaints = complaints.filter(
        (c: any) => (c.status === 'Resolved' || c.status === 'Closed') && c.resolvedAt
      );

      let totalResolutionHours = 0;
      let onTimeCount = 0;

      resolvedComplaints.forEach((c: any) => {
        const start = new Date(c.createdAt).getTime();
        const end = new Date(c.resolvedAt).getTime();
        const durationHours = (end - start) / (1000 * 3600);
        totalResolutionHours += durationHours;

        if (c.slaDeadline) {
          const deadline = new Date(c.slaDeadline).getTime();
          if (end <= deadline) {
            onTimeCount++;
          }
        }
      });

      const avgResolutionHours =
        resolvedComplaints.length > 0 ? +(totalResolutionHours / resolvedComplaints.length).toFixed(1) : 0;
      const slaComplianceRate =
        resolvedComplaints.length > 0 ? Math.round((onTimeCount / resolvedComplaints.length) * 100) : 100;

      // Feedback stats
      const feedbackItems = complaints.filter((c: any) => c.feedback && c.feedback.rating);
      const totalRating = feedbackItems.reduce((acc: number, c: any) => acc + c.feedback.rating, 0);
      const avgSatisfaction = feedbackItems.length > 0 ? +(totalRating / feedbackItems.length).toFixed(1) : 0;

      // Staff Workload
      const staffWorkload = staffUsers.map((s: any) => {
        const assignedTickets = complaints.filter((c: any) => c.assignedTo?.id === s.id);
        const openTickets = assignedTickets.filter(
          (c: any) => c.status === 'Assigned' || c.status === 'In Progress'
        ).length;
        const resolvedTickets = assignedTickets.filter(
          (c: any) => c.status === 'Resolved' || c.status === 'Closed'
        ).length;

        return {
          staffId: s.id,
          name: s.name,
          department: s.department,
          activeWorkload: openTickets,
          totalResolved: resolvedTickets,
          totalAssigned: assignedTickets.length,
        };
      });

      res.json({
        total,
        pending,
        assigned,
        inProgress,
        resolved,
        closed,
        reopened,
        escalated,
        emergency,
        highPriority,
        avgResolutionHours,
        slaComplianceRate,
        avgSatisfaction,
        feedbackCount: feedbackItems.length,
        categoryCounts,
        departmentCounts,
        staffWorkload,
        departmentCount: departments.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to generate analytics.' });
    }
  }
);

export default router;
