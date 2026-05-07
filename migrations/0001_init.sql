CREATE TABLE IF NOT EXISTS sensor_readings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT    NOT NULL,
  device_name TEXT,
  temperature REAL,
  humidity    INTEGER,
  battery     INTEGER,
  recorded_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_recorded
  ON sensor_readings (device_id, recorded_at);
