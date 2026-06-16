ALTER TABLE users ADD COLUMN IF NOT EXISTS purchased_lessons INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS category VARCHAR(5)
  CHECK (category IN ('A', 'B', 'AB', 'C', 'D', 'E'));
