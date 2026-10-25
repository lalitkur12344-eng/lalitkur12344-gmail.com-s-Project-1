import { Router, Response } from 'express';
import { db } from '../db';
import { authenticateToken, AuthenticatedRequest, requireRoles } from '../middleware/auth';

const router = Router();

// Get announcements
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user!.role;
    const all = await db.announcements.find();

    const visible = all.filter((a: any) => {
      if (a.targetAudience === 'all') return true;
      if (userRole === 'admin') return true;
      return a.targetAudience === userRole;
    });

    visible.sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json({ announcements: visible });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve announcements.' });
  }
});

// Admin publish announcement
router.post(
  '/',
  authenticateToken,
  requireRoles(['admin']),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { title, content, priority, targetAudience } = req.body;

      if (!title || !content) {
        res.status(400).json({ error: 'Announcement title and content are required.' });
        return;
      }

      const newAnnouncement = {
        title: title.trim(),
        content: content.trim(),
        priority: priority || 'Normal',
        targetAudience: targetAudience || 'all',
        createdBy: { id: req.user!.id, name: req.user!.name },
        createdAt: new Date().toISOString(),
      };

      const created = await db.announcements.create(newAnnouncement);

      // Create notification for users
      const allUsers = await db.users.find({ isActive: true });
      for (const u of allUsers) {
        if (targetAudience === 'all' || u.role === targetAudience) {
          await db.notifications.create({
            recipientId: u.id,
            eventType: 'announcement',
            title: `📢 Announcement: ${title}`,
            message: content.length > 100 ? content.substring(0, 100) + '...' : content,
            isRead: false,
          });
        }
      }

      res.status(201).json({ message: 'Announcement broadcasted successfully.', announcement: created });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to publish announcement.' });
    }
  }
);

// Admin delete announcement
router.delete(
  '/:id',
  authenticateToken,
  requireRoles(['admin']),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      await db.announcements.deleteById(id);
      res.json({ message: 'Announcement deleted.' });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to delete announcement.' });
    }
  }
);

export default router;
