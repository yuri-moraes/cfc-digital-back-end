CREATE TABLE IF NOT EXISTS student_absences (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schedule_id  UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  absence_date DATE NOT NULL,
  status       VARCHAR(20) NOT NULL CHECK (status IN ('valid', 'late', 'no_show')),
  declared_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, schedule_id, absence_date)
);

CREATE INDEX IF NOT EXISTS idx_student_absences_student_id ON student_absences(student_id);
CREATE INDEX IF NOT EXISTS idx_student_absences_schedule_id ON student_absences(schedule_id);
