import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { NotificationPreference } from '../models/NotificationPreference.js';
import { Notification } from '../models/Notification.js';
import { paginate, paginatedResponse } from '../utils/paginate.js';

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

router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const count = await Notification.countUnread(req.user.userId);
    res.status(200).json({ count });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page, limit } = paginate(req);
    const { rows, total } = await Notification.findByUser(req.user.userId, { page, limit });
    res.status(200).json(paginatedResponse(rows, total, { page, limit }));
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    await Notification.markAllRead(req.user.userId);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const updated = await Notification.markRead(req.params.id, req.user.userId);
    res.status(200).json(updated);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, statusCode: error.statusCode || 500 });
  }
});

export default router;

