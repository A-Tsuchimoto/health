export interface SensorReading {
  device_id: string;
  device_name?: string;
  temperature?: number;
  humidity?: number;
  battery?: number;
  recorded_at: number; // Unix timestamp (seconds)
}

export async function insertReading(db: D1Database, reading: SensorReading): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sensor_readings
         (device_id, device_name, temperature, humidity, battery, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      reading.device_id,
      reading.device_name ?? null,
      reading.temperature ?? null,
      reading.humidity ?? null,
      reading.battery ?? null,
      reading.recorded_at,
    )
    .run();
}

export async function getRecentReadings(
  db: D1Database,
  deviceId: string,
  hours: number,
): Promise<SensorReading[]> {
  const from = Math.floor(Date.now() / 1000) - hours * 3600;
  const { results } = await db
    .prepare(
      `SELECT device_id, device_name, temperature, humidity, battery, recorded_at
       FROM sensor_readings
       WHERE device_id = ? AND recorded_at >= ?
       ORDER BY recorded_at DESC`,
    )
    .bind(deviceId, from)
    .all<SensorReading>();
  return results;
}

export async function getReadingsInRange(
  db: D1Database,
  deviceId: string,
  from: number,
  to: number,
): Promise<SensorReading[]> {
  const { results } = await db
    .prepare(
      `SELECT device_id, device_name, temperature, humidity, battery, recorded_at
       FROM sensor_readings
       WHERE device_id = ? AND recorded_at >= ? AND recorded_at <= ?
       ORDER BY recorded_at DESC`,
    )
    .bind(deviceId, from, to)
    .all<SensorReading>();
  return results;
}
