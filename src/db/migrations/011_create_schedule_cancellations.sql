CREATE TABLE IF NOT EXISTS schedule_cancellations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id    UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  cancelled_date DATE NOT NULL,
  reason         TEXT,
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(schedule_id, cancelled_date)
);

CREATE INDEX IF NOT EXISTS idx_schedule_cancellations_schedule_id ON schedule_cancellations(schedule_id);
