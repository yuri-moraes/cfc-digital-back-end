CREATE TABLE IF NOT EXISTS instructor_vehicles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id    UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(instructor_id, vehicle_id)
);
CREATE INDEX IF NOT EXISTS idx_instructor_vehicles_instructor ON instructor_vehicles(instructor_id);
