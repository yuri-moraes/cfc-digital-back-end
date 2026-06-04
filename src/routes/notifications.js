import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { NotificationPreference } from '../models/NotificationPreference.js';

const router = express.Router();

router.get('/preferences', authMiddleware, async (req, res) => {
  try {
    const prefs = await NotificationPreference.findOrCreate(req.user.userId);
    res.status(200).json(prefs);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

router.put('/preferences', authMiddleware, async (req, res) => {
  try {
    const { minutes_before, whatsapp_enabled, in_app_enabled } = req.body;
    const prefs = await NotificationPreference.update(req.user.userId, { minutes_before, whatsapp_enabled, in_app_enabled });
    res.status(200).json(prefs);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

export default router;
