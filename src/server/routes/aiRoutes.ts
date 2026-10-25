import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authenticateToken } from '../middleware/auth';
import {
  analyzeComplaintWithAI,
  detectDuplicateComplaint,
  chatWithGemini,
  getQuotaStatus,
  ChatbotRole,
  ChatMessage,
} from '../services/aiService';

const router = Router();

// Check AI status & quota cooldown
router.get('/status', (req: Request, res: Response): void => {
  const quota = getQuotaStatus();
  res.json({
    configured: Boolean(process.env.GEMINI_API_KEY),
    model: 'gemini-3.8-flash',
    quota,
  });
});

router.post('/analyze', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description } = req.body;
    if (!title && !description) {
      res.status(400).json({ error: 'Title or description required for AI triage.' });
      return;
    }

    const result = await analyzeComplaintWithAI(title || '', description || '');
    res.json({ analysis: result });
  } catch (err: any) {
    res.status(500).json({ error: 'AI analysis failed.' });
  }
});

router.post('/detect-duplicates', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, category, location } = req.body;

    if (!db.isConnected) {
      res.json({
        duplicateCheck: {
          isDuplicateCandidate: false,
          confidenceScore: 0,
          reason: 'Database offline - duplicate check skipped.',
        },
      });
      return;
    }

    const all = await db.complaints.find();
    const openComplaints = all.filter((c: any) => c.status !== 'Resolved' && c.status !== 'Closed');

    const result = detectDuplicateComplaint(
      title || '',
      description || '',
      category || '',
      location || { area: '' },
      openComplaints
    );

    res.json({ duplicateCheck: result });
  } catch (err: any) {
    res.status(500).json({ error: 'Duplicate detection failed.' });
  }
});

// Multi-turn chat endpoint using Gemini models
router.post('/chat', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { messages, roleMode, model } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Messages array is required for chat conversation.' });
      return;
    }

    const validRoleMode: ChatbotRole = ['advisor', 'technical', 'emergency'].includes(roleMode)
      ? roleMode
      : 'advisor';

    const result = await chatWithGemini(messages as ChatMessage[], validRoleMode, model);
    res.json(result);
  } catch (err: any) {
    console.error('[AI Chat Error]:', err.message);
    res.status(500).json({ error: err.message || 'Chatbot service error occurred.' });
  }
});

export default router;
