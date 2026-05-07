import { Hono } from 'hono';

interface Env {
  DB: D1Database;
  OURA_ACCESS_TOKEN: string;
  SWITCHBOT_TOKEN: string;
  SWITCHBOT_SECRET: string;
  MCP_AUTH_TOKEN: string;
}

export const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ ok: true }));

export default {
  fetch: app.fetch,
  async scheduled(
    _event: ScheduledEvent,
    _env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    // stub: sensor data collection — implemented in a later step
  },
};
