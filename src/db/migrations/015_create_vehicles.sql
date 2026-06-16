CREATE TABLE IF NOT EXISTS vehicles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate      VARCHAR(10)  UNIQUE NOT NULL,
  model      VARCHAR(100) NOT NULL,
  year       INT          NOT NULL,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
