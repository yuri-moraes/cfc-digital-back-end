CREATE TABLE IF NOT EXISTS lesson_slots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instructor_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id          UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  scheduled_date      DATE NOT NULL,
  start_time          TIME NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN (
                          'scheduled','completed','cancelled',
                          'no_show','absent_valid','absent_charged'
                        )),
  plate_at_checkin    VARCHAR(10),
  validated_by        UUID REFERENCES users(id),
  validated_at        TIMESTAMP,
  absence_declared_at TIMESTAMP,
  cancellation_reason TEXT,
  cancelled_by        UUID REFERENCES users(id),
  cancelled_at        TIMESTAMP,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lesson_slots_student    ON lesson_slots(student_id);
CREATE INDEX IF NOT EXISTS idx_lesson_slots_instructor ON lesson_slots(instructor_id);
CREATE INDEX IF NOT EXISTS idx_lesson_slots_date       ON lesson_slots(scheduled_date);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_lesson_slot_fk'
      AND conrelid = 'notifications'::regclass
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_lesson_slot_fk
      FOREIGN KEY (lesson_slot_id) REFERENCES lesson_slots(id) ON DELETE SET NULL;
  END IF;
END $$;
