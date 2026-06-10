CREATE TABLE IF NOT EXISTS exam_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES users(id),
  vehicle_id    UUID NOT NULL REFERENCES vehicles(id),
  exam_date     DATE NOT NULL,
  result        VARCHAR(10) NOT NULL CHECK (result IN ('passed', 'failed')),
  notes         TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_exam_results_student ON exam_results(student_id);
