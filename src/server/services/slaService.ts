import { db } from '../db';
import { notificationService } from './notificationService';

export class SlaEscalationService {
  private intervalTimer: NodeJS.Timeout | null = null;
  private isChecking: boolean = false;

  startWorker(checkIntervalMs: number = 60000): void {
    if (this.intervalTimer) return;
    console.log('[SLA Service] Background SLA escalation monitor started (checking every 60s)');
    
    // Run an initial check after 5 seconds
    setTimeout(() => this.checkOverdueComplaints(), 5000);

    this.intervalTimer = setInterval(() => {
      this.checkOverdueComplaints();
    }, checkIntervalMs);
  }

  stopWorker(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  async checkOverdueComplaints(): Promise<number> {
    if (this.isChecking) return 0;
    if (!db.isConnected) {
      return 0;
    }
    this.isChecking = true;

    try {
      const now = new Date();
      // Find open complaints that are not resolved or closed
      const activeComplaints = await db.complaints.find();
      let escalatedCount = 0;

      for (const complaint of activeComplaints) {
        if (
          (complaint.status === 'Pending' || complaint.status === 'Assigned' || complaint.status === 'In Progress') &&
          !complaint.isEscalated &&
          complaint.slaDeadline
        ) {
          const deadline = new Date(complaint.slaDeadline);
          if (now > deadline) {
            // Overdue! Escalate ticket
            const escalationReason = `SLA breached: Target deadline of ${complaint.slaHours}h passed without resolution. Auto-escalated to Department HOD and Dean Student Welfare.`;
            
            const updatedHistory = [
              ...(complaint.history || []),
              {
                timestamp: now.toISOString(),
                action: 'ESCALATED',
                actor: { id: 'SYSTEM_SLA_WATCHDOG', name: 'Campus Care SLA Engine', role: 'system' },
                notes: escalationReason,
              },
            ];

            await db.complaints.updateById(complaint.id, {
              isEscalated: true,
              escalatedAt: now.toISOString(),
              escalationReason,
              history: updatedHistory,
            });

            escalatedCount++;

            // Dispatch multi-channel escalation notifications (In-App, Email, SMS)
            await notificationService.dispatchComplaintEvent({
              eventType: 'complaint_escalated',
              complaint: {
                ...complaint,
                isEscalated: true,
                escalationReason,
              },
              actor: { id: 'SYSTEM_SLA_WATCHDOG', name: 'Campus Care SLA Engine', role: 'system' },
              reason: escalationReason,
            });

            console.log(`[SLA Service] Auto-escalated complaint #${complaint.complaintId} (SLA deadline: ${deadline.toISOString()})`);
          }
        }
      }

      return escalatedCount;
    } catch (err: any) {
      console.error('[SLA Service] Error running SLA check:', err);
      return 0;
    } finally {
      this.isChecking = false;
    }
  }
}

export const slaService = new SlaEscalationService();
