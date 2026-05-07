import { Hono } from 'hono';
import { createMcpHandler } from 'agents/mcp';
import type { Env } from './types';
import { runScheduled } from './scheduled';
import { buildMcpServer } from './mcp/server';
import { PRIVACY_POLICY_HTML, TERMS_OF_SERVICE_HTML } from './legal';
import { startOAuthFlow, handleOAuthCallback } from './oura/auth';
import {
  authServerMetadata,
  protectedResourceMetadata,
  issueCode,
  verifyCode,
  pkceMatches,
  timingSafeEqual,
} from './oauth/server';

export const app = new Hono<{ Bindings: Env }>();

function callbackUri(reqUrl: string): string {
  const u = new URL(reqUrl);
  return `${u.origin}/oura/callback`;
}

app.get('/health', (c) => c.json({ ok: true }));

app.get('/privacy', (c) => c.html(PRIVACY_POLICY_HTML));
app.get('/terms', (c) => c.html(TERMS_OF_SERVICE_HTML));

// --- OAuth 2.1 endpoints (for claude.ai connector) -------------------------

app.get('/.well-known/oauth-authorization-server', (c) => {
  return c.json(authServerMetadata(new URL(c.req.url).origin));
});

app.get('/.well-known/oauth-protected-resource', (c) => {
  return c.json(protectedResourceMetadata(new URL(c.req.url).origin));
});

// Dynamic Client Registration stub. claude.ai may probe this on save; we
// echo back a stable client_id without persisting anything since the real
// auth gate is client_secret == MCP_AUTH_TOKEN at /oauth/token.
app.post('/register', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  return c.json({
    client_id: 'wellness-mcp',
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: (body.redirect_uris as string[] | undefined) ?? [],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
  });
});

// Authorization endpoint — auto-approves and redirects with a signed code.
// Public on purpose: code is HMAC-bound to the redirect_uri and PKCE
// challenge, and the token exchange still requires client_secret.
app.get('/authorize', async (c) => {
  const responseType = c.req.query('response_type');
  const redirectUri = c.req.query('redirect_uri');
  const state = c.req.query('state');
  const codeChallenge = c.req.query('code_challenge');
  const codeChallengeMethod = c.req.query('code_challenge_method');

  if (responseType !== 'code') {
    return c.json({ error: 'unsupported_response_type' }, 400);
  }
  if (!redirectUri) {
    return c.json({ error: 'invalid_request', error_description: 'redirect_uri required' }, 400);
  }
  if (!codeChallenge || codeChallengeMethod !== 'S256') {
    return c.json(
      { error: 'invalid_request', error_description: 'PKCE S256 required' },
      400,
    );
  }

  const code = await issueCode(
    {
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    c.env.MCP_AUTH_TOKEN,
  );

  const url = new URL(redirectUri);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);
  return c.redirect(url.toString());
});

app.post('/oauth/token', async (c) => {
  const body = await c.req.parseBody();
  const grantType = (body['grant_type'] as string) ?? '';

  let clientSecret = (body['client_secret'] as string) ?? '';
  if (!clientSecret) {
    const authHeader = c.req.header('Authorization') ?? '';
    if (authHeader.startsWith('Basic ')) {
      clientSecret = atob(authHeader.slice(6)).split(':')[1] ?? '';
    }
  }

  const validSecret = await timingSafeEqual(clientSecret, c.env.MCP_AUTH_TOKEN);

  if (grantType === 'authorization_code') {
    if (!validSecret) return c.json({ error: 'invalid_client' }, 401);

    const code = (body['code'] as string) ?? '';
    const codeVerifier = (body['code_verifier'] as string) ?? '';
    const redirectUri = (body['redirect_uri'] as string) ?? '';

    const payload = await verifyCode(code, c.env.MCP_AUTH_TOKEN);
    if (!payload || payload.redirect_uri !== redirectUri) {
      return c.json({ error: 'invalid_grant' }, 400);
    }
    if (!(await pkceMatches(codeVerifier, payload.code_challenge))) {
      return c.json(
        { error: 'invalid_grant', error_description: 'PKCE verification failed' },
        400,
      );
    }

    return c.json({
      access_token: c.env.MCP_AUTH_TOKEN,
      token_type: 'Bearer',
      expires_in: 3600 * 24 * 365,
      scope: 'mcp',
    });
  }

  if (grantType === 'client_credentials') {
    if (!validSecret) return c.json({ error: 'invalid_client' }, 401);
    return c.json({
      access_token: c.env.MCP_AUTH_TOKEN,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'mcp',
    });
  }

  if (grantType === 'refresh_token') {
    if (!validSecret) return c.json({ error: 'invalid_client' }, 401);
    return c.json({
      access_token: c.env.MCP_AUTH_TOKEN,
      token_type: 'Bearer',
      expires_in: 3600 * 24 * 365,
      scope: 'mcp',
    });
  }

  return c.json({ error: 'unsupported_grant_type' }, 400);
});

// --- Oura OAuth ------------------------------------------------------------

app.get('/oura/auth', async (c) => {
  const token = c.req.query('token') ?? '';
  if (!(await timingSafeEqual(token, c.env.MCP_AUTH_TOKEN))) {
    return c.html('<h1>401 Unauthorized</h1>', 401);
  }
  const authUrl = await startOAuthFlow(c.env.DB, c.env.OURA_CLIENT_ID, callbackUri(c.req.url));
  return c.redirect(authUrl);
});

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

// --- MCP -------------------------------------------------------------------

async function handleMcp(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const authHeader = request.headers.get('Authorization') ?? '';
  const expected = `Bearer ${env.MCP_AUTH_TOKEN}`;
  if (!(await timingSafeEqual(authHeader, expected))) {
    const origin = new URL(request.url).origin;
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      },
    });
  }
  const { pathname } = new URL(request.url);
  const server = buildMcpServer(env);
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
