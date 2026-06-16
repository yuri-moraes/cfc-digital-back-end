ALTER TABLE notifications DROP COLUMN IF EXISTS schedule_id;
ALTER TABLE notifications DROP COLUMN IF EXISTS class_date;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS lesson_slot_id UUID;

DO $$
DECLARE v_name TEXT;
BEGIN
  SELECT conname INTO v_name
  FROM pg_constraint
  WHERE conrelid = 'notifications'::regclass
    AND contype = 'c'
    AND conname LIKE '%type%';
  IF v_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE notifications DROP CONSTRAINT ' || v_name;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_type_check'
      AND conrelid = 'notifications'::regclass
  ) THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
      CHECK (type IN ('class_reminder', 'class_cancelled', 'class_rescheduled'));
  END IF;
END $$;

DROP TABLE IF EXISTS schedule_cancellations;
DROP TABLE IF EXISTS student_absences;
DROP TABLE IF EXISTS attendance_records;
DROP TABLE IF EXISTS grades;
DROP TABLE IF EXISTS assignments;
DROP TABLE IF EXISTS enrollments;
DROP TABLE IF EXISTS schedules;
DROP TABLE IF EXISTS classes;
