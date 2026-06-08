import express from 'express';
import { query } from '../db/pool.js';
import { Notification } from '../models/Notification.js';
import { sendWhatsApp } from '../utils/whatsapp.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

router.post('/send-reminders', async (req, res) => {
  const secret = req.headers.authorization?.replace('Bearer ', '');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized', statusCode: 401 });
  }

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const result = await query(`
      WITH user_prefs AS (
        SELECT
          u.id AS user_id, u.name, u.phone_number,
          COALESCE(np.minutes_before, 15) AS minutes_before,
          COALESCE(np.whatsapp_enabled, false) AS whatsapp_enabled,
          COALESCE(np.in_app_enabled, true) AS in_app_enabled
        FROM users u
        LEFT JOIN notification_preferences np ON np.user_id = u.id
      )
      SELECT
        up.user_id, up.name, up.phone_number,
        up.whatsapp_enabled, up.in_app_enabled,
        s.id AS schedule_id, s.start_time,
        c.name AS class_name,
        CURRENT_DATE AS class_date,
        up.minutes_before
      FROM schedules s
      JOIN classes c ON s.class_id = c.id
      JOIN enrollments e ON e.class_id = c.id
      JOIN user_prefs up ON up.user_id = e.student_id
      WHERE
        TRIM(s.day_of_week) = TRIM(TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'Day'))
        AND ABS(EXTRACT(EPOCH FROM (
          s.start_time - (NOW() AT TIME ZONE 'America/Sao_Paulo')::TIME
        )) / 60 - up.minutes_before) < 1
        AND NOT EXISTS (
          SELECT 1 FROM schedule_cancellations sc
          WHERE sc.schedule_id = s.id AND sc.cancelled_date = CURRENT_DATE
        )
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = up.user_id
            AND n.schedule_id = s.id
            AND n.class_date = CURRENT_DATE
            AND n.type = 'class_reminder'
        )

      UNION ALL

      SELECT
        up.user_id, up.name, up.phone_number,
        up.whatsapp_enabled, up.in_app_enabled,
        s.id, s.start_time,
        c.name,
        CURRENT_DATE,
        up.minutes_before
      FROM schedules s
      JOIN classes c ON s.class_id = c.id
      JOIN user_prefs up ON up.user_id = c.instructor_id
      WHERE
        TRIM(s.day_of_week) = TRIM(TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'Day'))
        AND ABS(EXTRACT(EPOCH FROM (
          s.start_time - (NOW() AT TIME ZONE 'America/Sao_Paulo')::TIME
        )) / 60 - up.minutes_before) < 1
        AND NOT EXISTS (
          SELECT 1 FROM schedule_cancellations sc
          WHERE sc.schedule_id = s.id AND sc.cancelled_date = CURRENT_DATE
        )
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = up.user_id
            AND n.schedule_id = s.id
            AND n.class_date = CURRENT_DATE
            AND n.type = 'class_reminder'
        )
    `);

    for (const row of result.rows) {
      try {
        const alreadySent = await Notification.dedupeExists(
          row.user_id, row.schedule_id, row.class_date, 'class_reminder'
        );

        if (alreadySent) { skipped++; continue; }

        if (row.in_app_enabled) {
          const startStr = String(row.start_time).slice(0, 5);
          await Notification.create(
            row.user_id,
            'class_reminder',
            `Lembrete: ${row.class_name}`,
            `A sua aula de ${row.class_name} começa em ${row.minutes_before} minutos (${startStr}).`,
            row.schedule_id,
            row.class_date
          );
          sent++;
        } else {
          skipped++;
        }

        if (row.phone_number && row.whatsapp_enabled) {
          const msg = `Olá ${row.name}! 👋\n\nA sua aula de ${row.class_name} começa em ${row.minutes_before} minutos.\n\nBoa aula! 🎓`;
          await sendWhatsApp(row.phone_number, msg);
        }
      } catch (err) {
        logger.error({ userId: row.user_id, err }, 'Error sending reminder');
        errors++;
      }
    }

    logger.info({ sent, skipped, errors }, 'Cron send-reminders complete');
    res.status(200).json({ sent, skipped, errors });
  } catch (err) {
    logger.error({ err }, 'Cron send-reminders failed');
    res.status(500).json({ error: err.message });
  }
});

export default router;
