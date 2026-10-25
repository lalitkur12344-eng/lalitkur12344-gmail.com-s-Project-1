import { NotificationModel, INotification } from '../models';
import { sendEmail, EmailSendOptions } from './emailService';
import { sendSms, SmsSendOptions } from './smsService';
import { db } from '../db';

export class NotificationDeliveryWorker {
  private isRunning: boolean = false;
  private intervalTimer: NodeJS.Timeout | null = null;
  private concurrency: number = 5;

  startWorker(pollIntervalMs: number = 30000): void {
    if (this.intervalTimer) return;

    console.log(`[Notification Worker] Starting durable background worker (poll interval: ${pollIntervalMs}ms)`);

    // 1. Recover any stale processing jobs from previous process restarts
    setTimeout(() => this.recoverStaleProcessingJobs(), 3000);

    // 2. Poll periodically for pending / backoff-ready jobs
    this.intervalTimer = setInterval(() => {
      this.processPendingJobs();
    }, pollIntervalMs);
  }

  stopWorker(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
      console.log('[Notification Worker] Worker stopped.');
    }
  }

  // Recover jobs left in 'processing' state during an unexpected restart/crash
  async recoverStaleProcessingJobs(): Promise<number> {
    if (!db.isConnected) return 0;

    try {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      const res = await NotificationModel.updateMany(
        {
          status: 'processing',
          updatedAt: { $lt: twoMinutesAgo },
        },
        {
          $set: {
            status: 'pending',
            errorDetails: 'Recovered from stale worker execution after server restart.',
          },
        }
      );

      if (res.modifiedCount > 0) {
        console.log(`[Notification Worker] Recovered ${res.modifiedCount} stale jobs from server restart.`);
      }
      return res.modifiedCount;
    } catch (err: any) {
      console.warn('[Notification Worker] Notice during stale job recovery:', err.message);
      return 0;
    }
  }

  // Process a batch of pending jobs
  async processPendingJobs(maxBatch: number = 10): Promise<{ processed: number; succeeded: number; failed: number }> {
    if (!db.isConnected || this.isRunning) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    this.isRunning = true;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    try {
      const now = new Date();

      // Find jobs eligible for delivery:
      // Status is 'pending' OR 'failed' with retries remaining and nextRetryAt <= now
      const eligibleJobs = await NotificationModel.find({
        channel: { $in: ['email', 'sms'] },
        $or: [
          { status: 'pending' },
          {
            status: 'failed',
            attemptCount: { $lt: 3 },
            nextRetryAt: { $lte: now },
          },
        ],
      })
        .sort({ createdAt: 1 })
        .limit(maxBatch)
        .exec();

      if (eligibleJobs.length === 0) {
        return { processed: 0, succeeded: 0, failed: 0 };
      }

      // Process up to concurrency in parallel
      for (let i = 0; i < eligibleJobs.length; i += this.concurrency) {
        const chunk = eligibleJobs.slice(i, i + this.concurrency);
        await Promise.all(
          chunk.map(async (job) => {
            // Atomic lock to guarantee single worker execution
            const lockedJob = await NotificationModel.findOneAndUpdate(
              { _id: job._id, status: job.status },
              { $set: { status: 'processing', updatedAt: new Date() } },
              { new: true }
            );

            if (!lockedJob) {
              // Another worker acquired this job
              return;
            }

            processed++;
            const result = await this.deliverSingleJob(lockedJob);
            if (result.success || result.status === 'skipped') {
              succeeded++;
            } else {
              failed++;
            }
          })
        );
      }

      return { processed, succeeded, failed };
    } catch (err: any) {
      console.error('[Notification Worker] Error during batch processing:', err.message);
      return { processed, succeeded, failed };
    } finally {
      this.isRunning = false;
    }
  }

  // Deliver single notification record
  async deliverSingleJob(job: INotification): Promise<{ success: boolean; status: string }> {
    const now = new Date();
    const attempts = (job.attemptCount || 0) + 1;
    const maxAttempts = job.maxAttempts || 3;

    try {
      if (job.channel === 'email') {
        const emailOpts: EmailSendOptions = {
          to: job.recipientEmail || '',
          subject: job.title,
          text: job.message,
          html: job.metadata?.html || `<p>${job.message}</p>`,
          eventType: job.eventType,
          complaintId: job.complaintId,
        };

        const res = await sendEmail(emailOpts);

        if (res.success) {
          await NotificationModel.updateOne(
            { _id: job._id },
            {
              $set: {
                status: 'sent',
                attemptCount: attempts,
                providerMessageId: res.messageId,
                sentAt: now,
                updatedAt: now,
              },
            }
          );
          return { success: true, status: 'sent' };
        }

        if (res.status === 'skipped') {
          await NotificationModel.updateOne(
            { _id: job._id },
            {
              $set: {
                status: 'skipped',
                attemptCount: attempts,
                errorCategory: res.errorCategory,
                errorDetails: res.errorDetails,
                updatedAt: now,
              },
            }
          );
          return { success: true, status: 'skipped' };
        }

        // Handle failure
        const isRetryable = res.isRetryable && attempts < maxAttempts;
        const backoffMs = Math.min(1000 * Math.pow(2, attempts), 60000);
        const nextRetryAt = isRetryable ? new Date(now.getTime() + backoffMs) : undefined;

        await NotificationModel.updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'failed',
              attemptCount: attempts,
              errorCategory: res.errorCategory,
              errorDetails: res.errorDetails,
              nextRetryAt,
              updatedAt: now,
            },
          }
        );

        return { success: false, status: 'failed' };
      }

      if (job.channel === 'sms') {
        const smsOpts: SmsSendOptions = {
          to: job.recipientPhone || '',
          body: job.message,
          eventType: job.eventType,
          complaintId: job.complaintId,
          userId: job.recipientId,
        };

        const res = await sendSms(smsOpts);

        if (res.success) {
          await NotificationModel.updateOne(
            { _id: job._id },
            {
              $set: {
                status: 'sent',
                attemptCount: attempts,
                providerMessageId: res.messageId,
                sentAt: now,
                updatedAt: now,
              },
            }
          );
          return { success: true, status: 'sent' };
        }

        if (res.status === 'skipped') {
          await NotificationModel.updateOne(
            { _id: job._id },
            {
              $set: {
                status: 'skipped',
                attemptCount: attempts,
                errorCategory: res.errorCategory,
                errorDetails: res.errorDetails,
                updatedAt: now,
              },
            }
          );
          return { success: true, status: 'skipped' };
        }

        // Handle failure
        const isRetryable = res.isRetryable && attempts < maxAttempts;
        const backoffMs = Math.min(1000 * Math.pow(2, attempts), 60000);
        const nextRetryAt = isRetryable ? new Date(now.getTime() + backoffMs) : undefined;

        await NotificationModel.updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'failed',
              attemptCount: attempts,
              errorCategory: res.errorCategory,
              errorDetails: res.errorDetails,
              nextRetryAt,
              updatedAt: now,
            },
          }
        );

        return { success: false, status: 'failed' };
      }

      return { success: false, status: 'unknown_channel' };
    } catch (dispatchErr: any) {
      console.error(`[Notification Worker] Unexpected error delivering job ${job._id}:`, dispatchErr.message);
      await NotificationModel.updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'failed',
            attemptCount: attempts,
            errorCategory: 'UNKNOWN',
            errorDetails: dispatchErr.message,
            updatedAt: now,
          },
        }
      );
      return { success: false, status: 'failed' };
    }
  }

  // Provider Webhook Delivery Receipt Handler (e.g. from Twilio or SMTP webhook)
  async handleProviderDeliveryReceipt(
    providerMessageId: string,
    providerStatus: string,
    failureDetails?: string
  ): Promise<boolean> {
    if (!providerMessageId || !db.isConnected) return false;

    const normalizedStatus = providerStatus.toLowerCase();
    const now = new Date();

    if (normalizedStatus === 'delivered' || normalizedStatus === 'read') {
      const res = await NotificationModel.updateOne(
        { providerMessageId },
        {
          $set: {
            status: 'delivered',
            deliveredAt: now,
            updatedAt: now,
          },
        }
      );
      return res.modifiedCount > 0;
    }

    if (normalizedStatus === 'undelivered' || normalizedStatus === 'failed') {
      const res = await NotificationModel.updateOne(
        { providerMessageId },
        {
          $set: {
            status: 'failed',
            errorCategory: 'PROVIDER_UNDELIVERED',
            errorDetails: failureDetails || `Provider reported message status: ${providerStatus}`,
            updatedAt: now,
          },
        }
      );
      return res.modifiedCount > 0;
    }

    return false;
  }
}

export const notificationWorker = new NotificationDeliveryWorker();
