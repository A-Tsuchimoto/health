import { Hono } from 'hono';
import { createMcpHandler } from 'agents/mcp';
import type { Env } from './types';
import { runScheduled } from './scheduled';
import { buildMcpServer } from './mcp/server';
import { PRIVACY_POLICY_HTML, TERMS_OF_SERVICE_HTML } from './legal';

export const app = new Hono<{ Bindings: Env }>();

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ah, bh] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const aa = new Uint8Array(ah);
  const ba = new Uint8Array(bh);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ ba[i];
  return diff === 0;
}

app.get('/health', (c) => c.json({ ok: true }));

app.get('/privacy', (c) => c.html(PRIVACY_POLICY_HTML));
app.get('/terms', (c) => c.html(TERMS_OF_SERVICE_HTML));

app.use('/mcp/*', async (c, next) => {
  const authHeader = c.req.header('Authorization') ?? '';
  const expected = `Bearer ${c.env.MCP_AUTH_TOKEN}`;
  if (!(await timingSafeEqual(authHeader, expected))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return next();
});

app.all('/mcp/*', async (c) => {
  const server = buildMcpServer(c.env);
  const handle = createMcpHandler(server);
  return handle(c.req.raw, c.env, c.executionCtx);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runScheduled(env);
  },
};
