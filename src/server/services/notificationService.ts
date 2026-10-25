import { NotificationModel, UserModel } from '../models';
import { renderEmailTemplate } from './emailService';
import { renderSmsTemplate, normalizeToE164 } from './smsService';
import { notificationWorker } from './notificationWorker';
import { db } from '../db';

export interface ComplaintEventPayload {
  eventType:
    | 'complaint_submitted'
    | 'complaint_assigned'
    | 'complaint_reassigned'
    | 'complaint_status_changed'
    | 'complaint_escalated'
    | 'complaint_resolved'
    | 'complaint_reopened'
    | 'complaint_feedback_requested';
  complaint: {
    id?: string;
    complaintId: string;
    title: string;
    category: string;
    priority: string;
    status: string;
    assignedDepartment: string;
    slaHours: number;
    location: { area: string; block?: string; room?: string };
    createdBy: { id: string; name: string; email: string; mobileNumber?: string };
    assignedTo?: { id: string; name: string; email: string; department?: string } | null;
  };
  actor?: { id: string; name: string; role: string };
  reason?: string;
  notes?: string;
  newStaff?: { id: string; name: string; email: string; mobileNumber?: string } | null;
}

export interface SecurityEventPayload {
  eventType: 'password_reset';
  user: { id: string; name: string; email: string; mobileNumber?: string };
  resetToken: string;
}

export class NotificationService {
  // Helper to fetch user's preferences & contact details
  private async getUserPreferences(userId: string) {
    if (!db.isConnected) return null;
    try {
      const user = await UserModel.findById(userId).lean().exec();
      return user;
    } catch {
      return null;
    }
  }

  // 1. Dispatch Complaint Lifecycle Events (Email, SMS, In-App)
  async dispatchComplaintEvent(payload: ComplaintEventPayload): Promise<{
    inAppCreated: number;
    emailQueued: number;
    smsQueued: number;
  }> {
    if (!db.isConnected) {
      console.warn('[Notification Service] Database offline, skipping event publication.');
      return { inAppCreated: 0, emailQueued: 0, smsQueued: 0 };
    }

    const { eventType, complaint, actor, notes, newStaff } = payload;
    let inAppCreated = 0;
    let emailQueued = 0;
    let smsQueued = 0;

    const recipientsToNotify: Array<{
      userId: string;
      roleTarget?: string;
      name: string;
      email: string;
      mobileNumber?: string;
      isCreator: boolean;
      isStaff: boolean;
      isAdmin: boolean;
    }> = [];

    // Determine targeted recipients based on event
    if (eventType === 'complaint_submitted') {
      // 1. Complaint Creator
      recipientsToNotify.push({
        userId: complaint.createdBy.id,
        name: complaint.createdBy.name,
        email: complaint.createdBy.email,
        mobileNumber: complaint.createdBy.mobileNumber,
        isCreator: true,
        isStaff: false,
        isAdmin: false,
      });

      // 2. Assigned Staff (or Admin if unassigned)
      if (complaint.assignedTo?.id) {
        recipientsToNotify.push({
          userId: complaint.assignedTo.id,
          name: complaint.assignedTo.name,
          email: complaint.assignedTo.email,
          isCreator: false,
          isStaff: true,
          isAdmin: false,
        });
      } else {
        recipientsToNotify.push({
          userId: 'role:admin',
          roleTarget: 'admin',
          name: 'REC Bijnor Administration',
          email: 'admin.campuscare@recb.ac.in',
          isCreator: false,
          isStaff: false,
          isAdmin: true,
        });
      }
    } else if (eventType === 'complaint_assigned') {
      if (complaint.assignedTo?.id) {
        recipientsToNotify.push({
          userId: complaint.assignedTo.id,
          name: complaint.assignedTo.name,
          email: complaint.assignedTo.email,
          isCreator: false,
          isStaff: true,
          isAdmin: false,
        });
      }
    } else if (eventType === 'complaint_reassigned') {
      // Notify creator and newly assigned staff
      recipientsToNotify.push({
        userId: complaint.createdBy.id,
        name: complaint.createdBy.name,
        email: complaint.createdBy.email,
        mobileNumber: complaint.createdBy.mobileNumber,
        isCreator: true,
        isStaff: false,
        isAdmin: false,
      });

      if (newStaff) {
        recipientsToNotify.push({
          userId: newStaff.id,
          name: newStaff.name,
          email: newStaff.email,
          mobileNumber: newStaff.mobileNumber,
          isCreator: false,
          isStaff: true,
          isAdmin: false,
        });
      }
    } else if (
      eventType === 'complaint_status_changed' ||
      eventType === 'complaint_resolved' ||
      eventType === 'complaint_reopened' ||
      eventType === 'complaint_feedback_requested'
    ) {
      recipientsToNotify.push({
        userId: complaint.createdBy.id,
        name: complaint.createdBy.name,
        email: complaint.createdBy.email,
        mobileNumber: complaint.createdBy.mobileNumber,
        isCreator: true,
        isStaff: false,
        isAdmin: false,
      });
    } else if (eventType === 'complaint_escalated') {
      // Notify Admin and Assigned Staff
      recipientsToNotify.push({
        userId: 'role:admin',
        roleTarget: 'admin',
        name: 'REC Bijnor Administration & HOD',
        email: 'chiefwarden@recb.ac.in',
        isCreator: false,
        isStaff: false,
        isAdmin: true,
      });

      if (complaint.assignedTo?.id) {
        recipientsToNotify.push({
          userId: complaint.assignedTo.id,
          name: complaint.assignedTo.name,
          email: complaint.assignedTo.email,
          isCreator: false,
          isStaff: true,
          isAdmin: false,
        });
      }
    }

    // Process each recipient
    for (const rec of recipientsToNotify) {
      // Fetch latest profile & contact info from DB if possible
      let finalEmail = rec.email;
      let finalMobile = rec.mobileNumber;
      let emailAllowed = true;
      let smsAllowed = true;
      let inAppAllowed = true;

      if (!rec.userId.startsWith('role:')) {
        const userDoc: any = await this.getUserPreferences(rec.userId);
        if (userDoc) {
          finalEmail = userDoc.email || finalEmail;
          finalMobile = userDoc.mobileNumber || finalMobile;
          if (userDoc.notificationPreferences) {
            emailAllowed = userDoc.notificationPreferences.email !== false;
            smsAllowed = userDoc.notificationPreferences.sms !== false;
            inAppAllowed = userDoc.notificationPreferences.inApp !== false;
          }
        }
      }

      // 1. Compose Title & Message
      let title = '';
      let message = '';
      let emailHeadline = '';
      let messageLines: string[] = [];

      switch (eventType) {
        case 'complaint_submitted':
          if (rec.isCreator) {
            title = `Complaint Registered: #${complaint.complaintId}`;
            message = `Your complaint "${complaint.title}" has been registered and assigned to ${complaint.assignedDepartment}. Target SLA: ${complaint.slaHours} hours.`;
            emailHeadline = `Your complaint has been successfully registered on Campus Care.`;
            messageLines = [
              `We have received your maintenance request regarding "${complaint.title}".`,
              `It has been routed to the **${complaint.assignedDepartment}** department with a target resolution window of ${complaint.slaHours} hours.`,
              `You can track progress in real-time or update notes through your student dashboard.`,
            ];
          } else if (rec.isStaff) {
            title = `New Task Assigned: #${complaint.complaintId}`;
            message = `A ${complaint.priority} priority complaint "${complaint.title}" in ${complaint.location.area} has been assigned to your duty roster.`;
            emailHeadline = `A new campus complaint has been assigned to you.`;
            messageLines = [
              `A new ${complaint.priority} priority ticket requires your technical inspection:`,
              `Location: ${complaint.location.area}${complaint.location.room ? `, Room ${complaint.location.room}` : ''}.`,
              `Please review the suggested SOP checklist and update the ticket status once on site.`,
            ];
          } else {
            title = `Unassigned Complaint: #${complaint.complaintId}`;
            message = `Complaint "${complaint.title}" in ${complaint.assignedDepartment} requires manual staff assignment.`;
            emailHeadline = `Action Required: Unassigned campus complaint.`;
            messageLines = [
              `Ticket #${complaint.complaintId} has been filed under ${complaint.assignedDepartment}.`,
              `No resident technician was automatically available. Please assign a staff member from the administration console.`,
            ];
          }
          break;

        case 'complaint_assigned':
        case 'complaint_reassigned':
          title = rec.isCreator
            ? `Ticket #${complaint.complaintId} Assigned to Specialist`
            : `Task Assigned: #${complaint.complaintId}`;
          message = rec.isCreator
            ? `Your ticket has been assigned to ${complaint.assignedTo?.name || newStaff?.name || 'department technician'}.`
            : `Complaint "${complaint.title}" has been assigned to you by ${actor?.name || 'Administration'}.`;
          emailHeadline = rec.isCreator
            ? `Your complaint has been assigned to an engineer.`
            : `You have been assigned to handle Complaint #${complaint.complaintId}.`;
          messageLines = [
            `Ticket #${complaint.complaintId}: "${complaint.title}".`,
            notes || `Assigned to ${complaint.assignedTo?.name || 'technical specialist'} for inspection.`,
          ];
          break;

        case 'complaint_status_changed':
        case 'complaint_resolved':
        case 'complaint_reopened':
          title = `Complaint #${complaint.complaintId} Status: ${complaint.status}`;
          message = `Status updated to "${complaint.status}" by ${actor?.name || 'Staff'}.${
            complaint.status === 'Resolved' ? ' Please confirm resolution and leave your rating.' : ''
          }`;
          emailHeadline = `Status update on Complaint #${complaint.complaintId}.`;
          messageLines = [
            `The status of your ticket has been changed to: **${complaint.status}**.`,
            notes || `Work is progressing according to institutional maintenance standards.`,
            complaint.status === 'Resolved'
              ? 'If the issue is fully fixed to your satisfaction, please confirm closure and leave feedback. If the problem persists, you may reopen this ticket directly.'
              : '',
          ].filter(Boolean);
          break;

        case 'complaint_escalated':
          title = `⚠️ Overdue Complaint Escalated: #${complaint.complaintId}`;
          message = `Complaint "${complaint.title}" in ${complaint.assignedDepartment} has breached its ${complaint.slaHours}h SLA. Immediate intervention required.`;
          emailHeadline = `URGENT: SLA Target Breached for #${complaint.complaintId}.`;
          messageLines = [
            `This is an automated escalation warning.`,
            `Complaint "${complaint.title}" was not resolved within the approved ${complaint.slaHours}-hour SLA window.`,
            `The issue has been escalated to the Department Head and the Estate Maintenance office.`,
          ];
          break;

        default:
          title = `Campus Care Update: #${complaint.complaintId}`;
          message = notes || `An update was recorded for complaint #${complaint.complaintId}.`;
          emailHeadline = `Update regarding Complaint #${complaint.complaintId}.`;
          messageLines = [message];
      }

      // 2. Publish In-App Notification (Always generated for active accounts)
      if (inAppAllowed) {
        try {
          const inAppIdempotency = `inapp:${complaint.complaintId}:${eventType}:${complaint.status}:${rec.userId}`;
          const existing = await NotificationModel.findOne({ idempotencyKey: inAppIdempotency });
          if (!existing) {
            await NotificationModel.create({
              recipientId: rec.userId,
              recipientEmail: finalEmail,
              recipientPhone: finalMobile,
              eventType,
              title,
              message,
              complaintId: complaint.complaintId,
              channel: 'in_app',
              status: 'delivered',
              isRead: false,
              idempotencyKey: inAppIdempotency,
              deliveredAt: new Date(),
            });
            inAppCreated++;
          }
        } catch (inAppErr: any) {
          console.warn('[Notification Service] In-app notification creation notice:', inAppErr.message);
        }
      }

      // 3. Queue Email Job (if recipient has valid email and opted-in)
      if (emailAllowed && finalEmail) {
        const emailIdempotency = `email:${complaint.complaintId}:${eventType}:${complaint.status}:${rec.userId}`;
        const existingEmail = await NotificationModel.findOne({ idempotencyKey: emailIdempotency });

        if (!existingEmail) {
          const emailTemplate = renderEmailTemplate({
            headline: emailHeadline,
            greetingName: rec.name,
            messageLines,
            complaintId: complaint.complaintId,
            category: complaint.category,
            priority: complaint.priority,
            status: complaint.status,
            locationArea: complaint.location.area,
          });

          await NotificationModel.create({
            recipientId: rec.userId,
            recipientEmail: finalEmail,
            eventType,
            title,
            message,
            complaintId: complaint.complaintId,
            channel: 'email',
            status: 'pending',
            idempotencyKey: emailIdempotency,
            attemptCount: 0,
            maxAttempts: 3,
            metadata: {
              html: emailTemplate.html,
              subject: `[REC Bijnor Campus Care] ${title}`,
            },
          });
          emailQueued++;
        }
      }

      // 4. Queue SMS Job (for important milestones if phone available and opted-in)
      const importantSmsEvents = [
        'complaint_submitted',
        'complaint_assigned',
        'complaint_status_changed',
        'complaint_resolved',
        'complaint_escalated',
      ];

      if (smsAllowed && finalMobile && importantSmsEvents.includes(eventType)) {
        const normalizedPhone = normalizeToE164(finalMobile);
        if (normalizedPhone) {
          const smsIdempotency = `sms:${complaint.complaintId}:${eventType}:${complaint.status}:${rec.userId}`;
          const existingSms = await NotificationModel.findOne({ idempotencyKey: smsIdempotency });

          if (!existingSms) {
            const smsBody = renderSmsTemplate({
              eventType,
              complaintId: complaint.complaintId,
              status: complaint.status,
              department: complaint.assignedDepartment,
              actionSummary: title,
            });

            await NotificationModel.create({
              recipientId: rec.userId,
              recipientPhone: normalizedPhone,
              eventType,
              title,
              message: smsBody,
              complaintId: complaint.complaintId,
              channel: 'sms',
              status: 'pending',
              idempotencyKey: smsIdempotency,
              attemptCount: 0,
              maxAttempts: 3,
            });
            smsQueued++;
          }
        }
      }
    }

    // 5. Trigger asynchronous processing immediately
    setImmediate(() => {
      notificationWorker.processPendingJobs().catch((e) => {
        console.warn('[Notification Worker] Asynchronous run error:', e.message);
      });
    });

    return { inAppCreated, emailQueued, smsQueued };
  }

  // 2. Dispatch Security / Password Reset Event
  async dispatchSecurityEvent(payload: SecurityEventPayload): Promise<boolean> {
    if (!db.isConnected) return false;

    const { user, resetToken } = payload;
    const emailTemplate = renderEmailTemplate({
      headline: 'Password Reset Request Verification',
      greetingName: user.name,
      messageLines: [
        'You have requested to reset your password for the REC Bijnor Campus Care system.',
        `Your single-use verification token is: **${resetToken}**`,
        'This verification token is valid for 15 minutes. Please do not share this token with anyone.',
      ],
      securityNotice:
        'If you did not request this password reset, please contact the Computer Center immediately at computercenter@recb.ac.in.',
      ctaText: 'Open Portal to Reset Password',
    });

    const idempotencyKey = `security:reset:${user.id}:${resetToken}`;

    await NotificationModel.create({
      recipientId: user.id,
      recipientEmail: user.email,
      eventType: 'password_reset',
      title: 'Security Notice: Password Reset Token',
      message: `Your password reset verification token is: ${resetToken}. Valid for 15 minutes.`,
      channel: 'email',
      status: 'pending',
      idempotencyKey,
      attemptCount: 0,
      maxAttempts: 3,
      metadata: {
        html: emailTemplate.html,
        subject: '[REC Bijnor Campus Care] Secure Password Reset Token',
      },
    });

    // Trigger immediate background delivery
    setImmediate(() => {
      notificationWorker.processPendingJobs().catch(() => {});
    });

    return true;
  }
}

export const notificationService = new NotificationService();
