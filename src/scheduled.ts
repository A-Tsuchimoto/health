import type { Env } from './types';
import { SwitchBotClient } from './switchbot/client';
import { insertReading } from './db/queries';

export async function runScheduled(env: Env): Promise<void> {
  const client = new SwitchBotClient(env.SWITCHBOT_TOKEN, env.SWITCHBOT_SECRET);

  let devices;
  try {
    devices = await client.listDevices();
  } catch (err) {
    console.error('[scheduled] listDevices failed:', err);
    return;
  }

  const meters = devices.filter((d) => d.deviceType.includes('Meter'));

  await Promise.all(
    meters.map(async (device) => {
      try {
        const status = await client.getMeterStatus(device.deviceId);
        await insertReading(env.DB, {
          device_id: device.deviceId,
          device_name: device.deviceName,
          temperature: status.temperature,
          humidity: status.humidity,
          battery: status.battery,
          recorded_at: Math.floor(Date.now() / 1000),
        });
      } catch (err) {
        console.error(`[scheduled] device ${device.deviceId} failed:`, err);
      }
    }),
  );
}
