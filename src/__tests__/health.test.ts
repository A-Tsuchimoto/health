import { describe, expect, it, vi } from 'vitest';

vi.mock('agents/mcp', () => ({
  createMcpHandler: vi.fn().mockReturnValue(() => new Response('mcp')),
}));

import { app } from '../index';

const MCP_AUTH_TOKEN = 'test-mcp-token';

function makeEnv() {
  return {
    MCP_AUTH_TOKEN,
    DB: {} as D1Database,
    OURA_CLIENT_ID: '',
    OURA_CLIENT_SECRET: '',
    SWITCHBOT_TOKEN: '',
    SWITCHBOT_SECRET: '',
  };
}

// PKCE helpers for tests
function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
async function makePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = 'test-verifier-with-enough-entropy-1234567890abcdef';
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(hash)) };
}

describe('GET /health', () => {
  it('returns { ok: true }', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('OAuth metadata', () => {
  it('GET /.well-known/oauth-authorization-server returns endpoints + PKCE', async () => {
    const res = await app.request('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.token_endpoint).toMatch(/\/oauth\/token$/);
    expect(body.authorization_endpoint).toMatch(/\/authorize$/);
    expect(body.registration_endpoint).toMatch(/\/register$/);
    expect((body.code_challenge_methods_supported as string[]).includes('S256')).toBe(true);
    expect((body.grant_types_supported as string[]).includes('authorization_code')).toBe(true);
  });

  it('GET /.well-known/oauth-protected-resource points to /mcp', async () => {
    const res = await app.request('/.well-known/oauth-protected-resource');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toMatch(/\/mcp$/);
    expect(Array.isArray(body.authorization_servers)).toBe(true);
  });
});

describe('POST /register (DCR stub)', () => {
  it('returns a client_id', async () => {
    const res = await app.request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['https://claude.ai/cb'] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.client_id).toBe('string');
  });
});

describe('GET /authorize', () => {
  it('redirects to redirect_uri with code and state when valid', async () => {
    const { challenge } = await makePkce();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: 'wellness-mcp',
      redirect_uri: 'https://claude.ai/cb',
      state: 'xyz',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    const res = await app.request(`/authorize?${params}`, {}, makeEnv());
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('Location')!);
    expect(loc.origin + loc.pathname).toBe('https://claude.ai/cb');
    expect(loc.searchParams.get('state')).toBe('xyz');
    expect(loc.searchParams.get('code')).toBeTruthy();
  });

  it('rejects missing PKCE', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: 'wellness-mcp',
      redirect_uri: 'https://claude.ai/cb',
    });
    const res = await app.request(`/authorize?${params}`);
    expect(res.status).toBe(400);
  });

  it('rejects unsupported response_type', async () => {
    const { challenge } = await makePkce();
    const params = new URLSearchParams({
      response_type: 'token',
      redirect_uri: 'https://claude.ai/cb',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    const res = await app.request(`/authorize?${params}`);
    expect(res.status).toBe(400);
  });
});

describe('POST /oauth/token — authorization_code flow', () => {
  async function getCode(challenge: string, redirectUri = 'https://claude.ai/cb'): Promise<string> {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: 'wellness-mcp',
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    const res = await app.request(`/authorize?${params}`, {}, makeEnv());
    const loc = new URL(res.headers.get('Location')!);
    return loc.searchParams.get('code')!;
  }

  it('issues access_token with valid PKCE + client_secret', async () => {
    const { verifier, challenge } = await makePkce();
    const code = await getCode(challenge);

    const res = await app.request(
      '/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: 'https://claude.ai/cb',
          client_id: 'wellness-mcp',
          client_secret: MCP_AUTH_TOKEN,
          code_verifier: verifier,
        }).toString(),
      },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.access_token).toBe(MCP_AUTH_TOKEN);
    expect(body.token_type).toBe('Bearer');
  });

  it('rejects with wrong client_secret', async () => {
    const { verifier, challenge } = await makePkce();
    const code = await getCode(challenge);

    const res = await app.request(
      '/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: 'https://claude.ai/cb',
          client_secret: 'wrong',
          code_verifier: verifier,
        }).toString(),
      },
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it('rejects with wrong code_verifier', async () => {
    const { challenge } = await makePkce();
    const code = await getCode(challenge);

    const res = await app.request(
      '/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: 'https://claude.ai/cb',
          client_secret: MCP_AUTH_TOKEN,
          code_verifier: 'attacker-guess',
        }).toString(),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it('rejects mismatched redirect_uri', async () => {
    const { verifier, challenge } = await makePkce();
    const code = await getCode(challenge, 'https://claude.ai/cb');

    const res = await app.request(
      '/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: 'https://evil.example/cb',
          client_secret: MCP_AUTH_TOKEN,
          code_verifier: verifier,
        }).toString(),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /oauth/token — client_credentials flow', () => {
  it('issues token when client_secret matches', async () => {
    const res = await app.request(
      '/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=client_credentials&client_secret=${MCP_AUTH_TOKEN}`,
      },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.access_token).toBe(MCP_AUTH_TOKEN);
  });

  it('rejects wrong secret', async () => {
    const res = await app.request(
      '/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials&client_secret=wrong',
      },
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it('rejects unsupported grant_type', async () => {
    const res = await app.request(
      '/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=password',
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it('accepts client_secret via Basic auth header', async () => {
    const credentials = btoa(`wellness-mcp:${MCP_AUTH_TOKEN}`);
    const res = await app.request(
      '/oauth/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        body: 'grant_type=client_credentials',
      },
      makeEnv(),
    );
    expect(res.status).toBe(200);
  });
});
