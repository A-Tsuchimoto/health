import { describe, expect, it, vi } from 'vitest';
import { insertReading, getRecentReadings, getReadingsInRange } from './queries';
import type { SensorReading } from './queries';

function makeDb(): D1Database {
  const stmt = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ success: true }),
    all: vi.fn().mockResolvedValue({ results: [] }),
    first: vi.fn().mockResolvedValue(null),
  };
  return { prepare: vi.fn().mockReturnValue(stmt) } as unknown as D1Database;
}

describe('insertReading()', () => {
  it('runs an INSERT with all fields bound', async () => {
    const db = makeDb();
    const stmt = (db.prepare as ReturnType<typeof vi.fn>)();

    const reading: SensorReading = {
      device_id: 'dev-01',
      device_name: 'Living Room',
      temperature: 22.5,
      humidity: 60,
      battery: 90,
      recorded_at: 1700000000,
    };
    await insertReading(db, reading);

    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sensor_readings'));
    expect(stmt.bind).toHaveBeenCalledWith(
      'dev-01',
      'Living Room',
      22.5,
      60,
      90,
      1700000000,
    );
    expect(stmt.run).toHaveBeenCalled();
  });

  it('passes null for optional fields when absent', async () => {
    const db = makeDb();
    const stmt = (db.prepare as ReturnType<typeof vi.fn>)();

    await insertReading(db, { device_id: 'dev-02', recorded_at: 1700000001 });

    expect(stmt.bind).toHaveBeenCalledWith('dev-02', null, null, null, null, 1700000001);
  });
});

describe('getRecentReadings()', () => {
  it('queries with device_id and a computed from timestamp', async () => {
    const rows: SensorReading[] = [
      { device_id: 'dev-01', temperature: 23, humidity: 55, battery: 80, recorded_at: 1700000000 },
    ];
    const db = makeDb();
    const stmt = (db.prepare as ReturnType<typeof vi.fn>)();
    stmt.all.mockResolvedValue({ results: rows });

    const before = Math.floor(Date.now() / 1000) - 24 * 3600;
    const result = await getRecentReadings(db, 'dev-01', 24);

    expect(result).toEqual(rows);
    const boundArgs = stmt.bind.mock.calls[0] as [string, number];
    expect(boundArgs[0]).toBe('dev-01');
    expect(boundArgs[1]).toBeGreaterThanOrEqual(before - 1); // allow 1s clock drift
  });
});

describe('getReadingsInRange()', () => {
  it('queries with device_id, from, and to', async () => {
    const db = makeDb();
    const stmt = (db.prepare as ReturnType<typeof vi.fn>)();
    stmt.all.mockResolvedValue({ results: [] });

    await getReadingsInRange(db, 'dev-01', 1700000000, 1700003600);

    expect(stmt.bind).toHaveBeenCalledWith('dev-01', 1700000000, 1700003600);
  });
});
