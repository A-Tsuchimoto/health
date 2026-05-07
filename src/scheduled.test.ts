import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./switchbot/client');
vi.mock('./db/queries');

import { runScheduled } from './scheduled';
import { SwitchBotClient } from './switchbot/client';
import { insertReading } from './db/queries';
import type { Env } from './types';

const env: Env = {
  DB: {} as D1Database,
  OURA_CLIENT_ID: 'client-id',
  OURA_CLIENT_SECRET: 'client-secret',
  SWITCHBOT_TOKEN: 'tok',
  SWITCHBOT_SECRET: 'sec',
  MCP_AUTH_TOKEN: 'mcp',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(insertReading).mockResolvedValue(undefined);
});

describe('runScheduled()', () => {
  it('filters only Meter devices and inserts readings', async () => {
    const listDevices = vi.fn().mockResolvedValue([
      { deviceId: 'm1', deviceName: 'Meter1', deviceType: 'MeterPlus' },
      { deviceId: 'b1', deviceName: 'Bot1', deviceType: 'Bot' },
    ]);
    const getMeterStatus = vi.fn().mockResolvedValue({
      deviceId: 'm1', deviceType: 'MeterPlus', temperature: 22.0, humidity: 55, battery: 85,
    });
    vi.mocked(SwitchBotClient).mockImplementation(() => ({ listDevices, getMeterStatus }) as unknown as InstanceType<typeof SwitchBotClient>);

    await runScheduled(env);

    expect(getMeterStatus).toHaveBeenCalledTimes(1);
    expect(getMeterStatus).toHaveBeenCalledWith('m1');
    expect(insertReading).toHaveBeenCalledTimes(1);
    expect(insertReading).toHaveBeenCalledWith(
      env.DB,
      expect.objectContaining({ device_id: 'm1', temperature: 22.0 }),
    );
  });

  it('continues processing when one device fails', async () => {
    const listDevices = vi.fn().mockResolvedValue([
      { deviceId: 'm1', deviceName: 'Bad', deviceType: 'Meter' },
      { deviceId: 'm2', deviceName: 'Good', deviceType: 'MeterPlus' },
    ]);
    const getMeterStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ deviceId: 'm2', deviceType: 'MeterPlus', temperature: 20, humidity: 50, battery: 70 });
    vi.mocked(SwitchBotClient).mockImplementation(() => ({ listDevices, getMeterStatus }) as unknown as InstanceType<typeof SwitchBotClient>);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await runScheduled(env);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('m1'), expect.any(Error));
    expect(insertReading).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it('returns early and logs when listDevices fails', async () => {
    const listDevices = vi.fn().mockRejectedValue(new Error('network'));
    const getMeterStatus = vi.fn();
    vi.mocked(SwitchBotClient).mockImplementation(() => ({ listDevices, getMeterStatus }) as unknown as InstanceType<typeof SwitchBotClient>);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await runScheduled(env);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('listDevices'), expect.any(Error));
    expect(getMeterStatus).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
