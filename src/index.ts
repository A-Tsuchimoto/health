import { Hono } from 'hono';
import { createMcpHandler } from 'agents/mcp';
import type { Env } from './types';
import { runScheduled } from './scheduled';
import { buildMcpServer } from './mcp/server';
import { PRIVACY_POLICY_HTML, TERMS_OF_SERVICE_HTML } from './legal';
import { startOAuthFlow, handleOAuthCallback } from './oura/auth';

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

function callbackUri(reqUrl: string): string {
  const u = new URL(reqUrl);
  return `${u.origin}/oura/callback`;
}

app.get('/health', (c) => c.json({ ok: true }));

app.get('/privacy', (c) => c.html(PRIVACY_POLICY_HTML));
app.get('/terms', (c) => c.html(TERMS_OF_SERVICE_HTML));

// Oura OAuth — start: visited in browser with token query param for auth
app.get('/oura/auth', async (c) => {
  const token = c.req.query('token') ?? '';
  if (!(await timingSafeEqual(token, c.env.MCP_AUTH_TOKEN))) {
    return c.html('<h1>401 Unauthorized</h1>', 401);
  }
  const authUrl = await startOAuthFlow(c.env.DB, c.env.OURA_CLIENT_ID, callbackUri(c.req.url));
  return c.redirect(authUrl);
});

// Oura OAuth — callback: Oura redirects here after user grants access
app.get('/oura/callback', async (c) => {
  const error = c.req.query('error');
  if (error) {
    return c.html(`<h1>Authorization denied</h1><p>${error}</p>`, 400);
  }

  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) {
    return c.html('<h1>Bad request</h1><p>Missing code or state.</p>', 400);
  }

  try {
    await handleOAuthCallback(
      c.env.DB,
      c.env.OURA_CLIENT_ID,
      c.env.OURA_CLIENT_SECRET,
      code,
      state,
      callbackUri(c.req.url),
    );
    return c.html(
      '<h1>Oura connected!</h1><p>Authorization successful. You can close this window.</p>',
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.html(`<h1>Error</h1><p>${msg}</p>`, 500);
  }
});

app.use('/mcp', async (c, next) => {
  const authHeader = c.req.header('Authorization') ?? '';
  const expected = `Bearer ${c.env.MCP_AUTH_TOKEN}`;
  if (!(await timingSafeEqual(authHeader, expected))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return next();
});

app.use('/mcp/*', async (c, next) => {
  const authHeader = c.req.header('Authorization') ?? '';
  const expected = `Bearer ${c.env.MCP_AUTH_TOKEN}`;
  if (!(await timingSafeEqual(authHeader, expected))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return next();
});

app.all('/mcp', async (c) => {
  const server = buildMcpServer(c.env);
  const handle = createMcpHandler(server);
  return handle(c.req.raw, c.env, c.executionCtx);
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
