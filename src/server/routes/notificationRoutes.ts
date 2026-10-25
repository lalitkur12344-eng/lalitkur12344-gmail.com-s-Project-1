import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { getEmailConfig } from '../services/emailService';
import { getSmsConfig } from '../services/smsService';
import { notificationWorker } from '../services/notificationWorker';
import { NotificationModel, UserModel } from '../models';

const router = Router();

// 1. Notification Delivery Engine Status (No credentials or secrets exposed)
router.get('/status', (req: Request, res: Response): void => {
  const emailCfg = getEmailConfig();
  const smsCfg = getSmsConfig();

  res.json({
    email: {
      configured: emailCfg.isConfigured,
      host: emailCfg.isConfigured ? emailCfg.host : 'Not configured (dry-run/skipped)',
      port: emailCfg.port,
      from: emailCfg.from,
    },
    sms: {
      configured: smsCfg.isConfigured,
      provider: smsCfg.provider,
      fromNumber: smsCfg.isConfigured ? smsCfg.fromNumber : 'Not configured (dry-run/skipped)',
    },
    queue: {
      type: 'MongoDB Durable Event Queue',
      activeWorker: true,
      maxAttempts: 3,
    },
    appBaseUrl: emailCfg.appBaseUrl,
  });
});

// 2. Get Notifications for current authenticated user
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const requestedChannel = req.query.channel as string | undefined;

    const query: Record<string, any> = {};

    // Role-based access control: users only see their own notifications
    if (role === 'admin') {
      query.$or = [{ recipientId: userId }, { recipientId: 'role:admin' }];
    } else {
      query.recipientId = userId;
    }

    if (requestedChannel) {
      query.channel = requestedChannel;
    } else {
      // Default to in_app for standard drawer viewing, or show all for that recipient
      query.channel = 'in_app';
    }

    const userNotifications = await NotificationModel.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec();

    const unreadCount = userNotifications.filter((n: any) => !n.isRead).length;

    res.json({
      notifications: userNotifications.map((n: any) => ({
        ...n,
        id: n._id?.toString() || n.id,
      })),
      unreadCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve notifications.' });
  }
});

// 3. Get User Notification Channel Preferences
router.get('/preferences', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = await UserModel.findById(req.user!.id).lean().exec();
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json({
      preferences: user.notificationPreferences || {
        email: true,
        sms: true,
        inApp: true,
      },
      mobileNumber: user.mobileNumber || '',
      email: user.email,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve notification preferences.' });
  }
});

// 4. Update User Notification Channel Preferences
router.patch('/preferences', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { email, sms, inApp } = req.body;

    const updated = await UserModel.findByIdAndUpdate(
      req.user!.id,
      {
        $set: {
          'notificationPreferences.email': typeof email === 'boolean' ? email : true,
          'notificationPreferences.sms': typeof sms === 'boolean' ? sms : true,
          'notificationPreferences.inApp': typeof inApp === 'boolean' ? inApp : true,
        },
      },
      { new: true }
    );

    res.json({
      message: 'Notification preferences updated successfully.',
      preferences: updated?.notificationPreferences,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update preferences.' });
  }
});

// 5. Mark single notification as read
router.patch('/:id/read', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const role = req.user!.role;

    // Verify ownership
    const notification = await NotificationModel.findById(id);
    if (!notification) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }

    if (notification.recipientId !== userId && !(role === 'admin' && notification.recipientId === 'role:admin')) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    notification.isRead = true;
    await notification.save();

    res.json({ message: 'Notification marked as read.', notification });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update notification.' });
  }
});

// 6. Mark all notifications as read for current user
router.patch('/read-all', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;

    const targetQuery: any =
      role === 'admin'
        ? { $or: [{ recipientId: userId }, { recipientId: 'role:admin' }], isRead: false }
        : { recipientId: userId, isRead: false };

    await NotificationModel.updateMany(targetQuery, { $set: { isRead: true } });

    res.json({ message: 'All notifications marked as read.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to mark notifications read.' });
  }
});

// 7. Provider Webhook for SMS Delivery Receipts (e.g. Twilio Status Callback)
router.post('/webhook/sms', async (req: Request, res: Response): Promise<void> => {
  try {
    const messageSid = req.body.MessageSid || req.body.SmsSid;
    const messageStatus = req.body.MessageStatus || req.body.SmsStatus;
    const errorCode = req.body.ErrorCode;

    if (!messageSid || !messageStatus) {
      res.status(400).json({ error: 'Missing MessageSid or MessageStatus in webhook payload.' });
      return;
    }

    const updated = await notificationWorker.handleProviderDeliveryReceipt(
      messageSid,
      messageStatus,
      errorCode ? `Provider ErrorCode: ${errorCode}` : undefined
    );

    res.json({ received: true, updated });
  } catch (err: any) {
    console.error('[SMS Webhook Error]:', err.message);
    res.status(500).json({ error: 'Webhook processing error.' });
  }
});

export default router;
