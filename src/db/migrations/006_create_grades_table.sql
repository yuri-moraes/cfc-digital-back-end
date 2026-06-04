CREATE TABLE IF NOT EXISTS grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  numeric_score INT NOT NULL CHECK (numeric_score >= 0 AND numeric_score <= 100),
  letter_grade VARCHAR(1) NOT NULL,
  feedback TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_grades_assignment_id ON grades(assignment_id);
CREATE INDEX IF NOT EXISTS idx_grades_student_id ON grades(student_id);
