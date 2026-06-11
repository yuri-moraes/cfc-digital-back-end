import express from 'express';
import { query } from '../db/pool.js';
import { Notification } from '../models/Notification.js';
import { sendWhatsApp } from '../utils/whatsapp.js';

const router = express.Router();

router.post('/send-reminders', async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized', statusCode: 401 });
  }

  const result = await query(`
    SELECT
      ls.id AS lesson_slot_id,
      ls.scheduled_date,
      ls.start_time,
      s.id AS user_id,
      s.name AS user_name,
      s.phone_number,
      np.minutes_before,
      np.whatsapp_enabled
    FROM lesson_slots ls
    JOIN users s ON s.id = ls.student_id
    JOIN notification_preferences np ON np.user_id = s.id
    WHERE ls.status = 'scheduled'
      AND np.in_app_enabled = true
      AND (ls.scheduled_date + ls.start_time) BETWEEN NOW() AND NOW() + (np.minutes_before || ' minutes')::interval

    UNION ALL

    SELECT
      ls.id AS lesson_slot_id,
      ls.scheduled_date,
      ls.start_time,
      i.id AS user_id,
      i.name AS user_name,
      i.phone_number,
      np.minutes_before,
      np.whatsapp_enabled
    FROM lesson_slots ls
    JOIN users i ON i.id = ls.instructor_id
    JOIN notification_preferences np ON np.user_id = i.id
    WHERE ls.status = 'scheduled'
      AND np.in_app_enabled = true
      AND (ls.scheduled_date + ls.start_time) BETWEEN NOW() AND NOW() + (np.minutes_before || ' minutes')::interval
  `);

  let sent = 0;

  for (const row of result.rows) {
    const already = await Notification.dedupeExists(row.user_id, row.lesson_slot_id, 'class_reminder');
    if (already) continue;

    const startStr = String(row.start_time).slice(0, 5);
    const title = 'Lembrete de Aula';
    const body = `Sua aula começa em ${row.minutes_before} minutos (${startStr}).`;

    await Notification.create(row.user_id, 'class_reminder', title, body, row.lesson_slot_id);
    sent++;

    if (row.whatsapp_enabled && row.phone_number) {
      sendWhatsApp(row.phone_number, body);
    }
  }

  res.status(200).json({ sent });
});

export default router;
