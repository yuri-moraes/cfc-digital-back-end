import express from 'express';
import { AvailableSlot } from '../models/AvailableSlot.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { USER_ROLES } from '../constants.js';

const router = express.Router();
const { ADMIN, STUDENT } = USER_ROLES;

router.get('/available', authMiddleware, requireRole(ADMIN, STUDENT), async (req, res) => {
  const { date_from, date_to, instructor_id } = req.query;
  const slots = await AvailableSlot.list({
    dateFrom:     date_from,
    dateTo:       date_to,
    instructorId: instructor_id || null,
  });
  res.json(slots);
});

export default router;
