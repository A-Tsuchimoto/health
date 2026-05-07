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

// OAuth 2.0 discovery — claude.ai uses this to find the token endpoint
app.get('/.well-known/oauth-authorization-server', (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json({
    issuer: origin,
    token_endpoint: `${origin}/oauth/token`,
    grant_types_supported: ['client_credentials'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
  });
});

// OAuth 2.0 token endpoint — accepts client_credentials with MCP_AUTH_TOKEN as secret
app.post('/oauth/token', async (c) => {
  let clientSecret = '';
  let grantType = '';

  const body = await c.req.parseBody();
  grantType = (body['grant_type'] as string) ?? '';
  clientSecret = (body['client_secret'] as string) ?? '';

  // Also accept client secret via Basic auth header
  if (!clientSecret) {
    const authHeader = c.req.header('Authorization') ?? '';
    if (authHeader.startsWith('Basic ')) {
      const decoded = atob(authHeader.slice(6));
      clientSecret = decoded.split(':')[1] ?? '';
    }
  }

  if (grantType !== 'client_credentials') {
    return c.json({ error: 'unsupported_grant_type' }, 400);
  }

  if (!(await timingSafeEqual(clientSecret, c.env.MCP_AUTH_TOKEN))) {
    return c.json({ error: 'invalid_client' }, 401);
  }

  return c.json({
    access_token: c.env.MCP_AUTH_TOKEN,
    token_type: 'Bearer',
    expires_in: 3600,
  });
});

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

// MCP は Hono を経由せず fetch export で直接処理する
// (createMcpHandler が url.pathname を完全一致チェックするため、
//  Hono 経由だとパスのズレで 404 になるケースを回避)
async function handleMcp(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const authHeader = request.headers.get('Authorization') ?? '';
  const expected = `Bearer ${env.MCP_AUTH_TOKEN}`;
  if (!(await timingSafeEqual(authHeader, expected))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { pathname } = new URL(request.url);
  const server = buildMcpServer(env);
  // route: pathname でハンドラ内部の完全一致チェックを確実に通過させる
  return createMcpHandler(server, { route: pathname })(request, env, ctx);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/mcp' || pathname.startsWith('/mcp/')) {
      return handleMcp(request, env, ctx);
    }
    return app.fetch(request, env, ctx);
  },
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runScheduled(env);
  },
};
