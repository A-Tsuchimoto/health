import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../types';
import { OuraClient } from '../oura/client';
import { SwitchBotClient } from '../switchbot/client';
import { getRecentReadings } from '../db/queries';

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

export function buildMcpServer(env: Env): McpServer {
  const server = new McpServer({ name: 'wellness-mcp', version: '1.0.0' });
  const oura = new OuraClient(env.OURA_ACCESS_TOKEN);
  const switchbot = new SwitchBotClient(env.SWITCHBOT_TOKEN, env.SWITCHBOT_SECRET);

  server.tool(
    'oura_daily_sleep',
    'Oura の日別睡眠スコアとコントリビュータを取得する',
    {
      start_date: z.string().describe('開始日 YYYY-MM-DD'),
      end_date: z.string().describe('終了日 YYYY-MM-DD'),
    },
    async ({ start_date, end_date }) => text(await oura.getDailySleep(start_date, end_date)),
  );

  server.tool(
    'oura_daily_readiness',
    'Oura の日別レディネススコアを取得する',
    {
      start_date: z.string().describe('開始日 YYYY-MM-DD'),
      end_date: z.string().describe('終了日 YYYY-MM-DD'),
    },
    async ({ start_date, end_date }) => text(await oura.getDailyReadiness(start_date, end_date)),
  );

  server.tool(
    'oura_daily_activity',
    'Oura の日別アクティビティスコアを取得する',
    {
      start_date: z.string().describe('開始日 YYYY-MM-DD'),
      end_date: z.string().describe('終了日 YYYY-MM-DD'),
    },
    async ({ start_date, end_date }) => text(await oura.getDailyActivity(start_date, end_date)),
  );

  server.tool(
    'oura_heart_rate',
    'Oura の心拍数サンプルを取得する',
    {
      start_datetime: z.string().describe('開始日時 ISO 8601'),
      end_datetime: z.string().describe('終了日時 ISO 8601'),
    },
    async ({ start_datetime, end_datetime }) =>
      text(await oura.getHeartRate(start_datetime, end_datetime)),
  );

  server.tool(
    'list_switchbot_devices',
    'SwitchBot デバイス一覧を取得する',
    {},
    async () => text(await switchbot.listDevices()),
  );

  server.tool(
    'switchbot_current_status',
    'SwitchBot デバイスの現在の温湿度を API から直接取得する',
    {
      device_name: z.string().optional().describe('デバイス名の部分一致フィルタ'),
    },
    async ({ device_name }) => {
      const devices = await switchbot.listDevices();
      const meters = devices.filter(
        (d) =>
          d.deviceType.includes('Meter') &&
          (!device_name || d.deviceName.includes(device_name)),
      );
      const statuses = await Promise.all(
        meters.map((d) => switchbot.getMeterStatus(d.deviceId)),
      );
      return text(statuses);
    },
  );

  server.tool(
    'switchbot_history',
    'SwitchBot デバイスの温湿度履歴を D1 から取得する',
    {
      device_name: z.string().optional().describe('デバイス名の部分一致フィルタ'),
      hours: z.number().optional().describe('過去 N 時間分(デフォルト 24)'),
    },
    async ({ device_name, hours = 24 }) => {
      const devices = await switchbot.listDevices();
      const meters = devices.filter(
        (d) =>
          d.deviceType.includes('Meter') &&
          (!device_name || d.deviceName.includes(device_name)),
      );
      const histories = await Promise.all(
        meters.map((d) => getRecentReadings(env.DB, d.deviceId, hours)),
      );
      return text(
        meters.map((d, i) => ({ device: d.deviceName, readings: histories[i] })),
      );
    },
  );

  return server;
}
