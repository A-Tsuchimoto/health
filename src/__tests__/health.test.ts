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

describe('GET /health', () => {
  it('returns { ok: true } with status 200', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});

describe('GET /.well-known/oauth-authorization-server', () => {
  it('returns token_endpoint and grant_types', async () => {
    const res = await app.request('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.token_endpoint).toBe('string');
    expect((body.grant_types_supported as string[]).includes('client_credentials')).toBe(true);
  });
});

describe('POST /oauth/token', () => {
  it('returns access_token when client_secret matches MCP_AUTH_TOKEN', async () => {
    const res = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=wellness-mcp&client_secret=${MCP_AUTH_TOKEN}`,
    }, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.access_token).toBe(MCP_AUTH_TOKEN);
    expect(body.token_type).toBe('Bearer');
  });

  it('returns 401 when client_secret is wrong', async () => {
    const res = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&client_id=wellness-mcp&client_secret=wrong',
    }, makeEnv());
    expect(res.status).toBe(401);
  });

  it('returns 400 for unsupported grant_type', async () => {
    const res = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=authorization_code&code=abc',
    }, makeEnv());
    expect(res.status).toBe(400);
  });

  it('accepts client_secret via Basic auth header', async () => {
    const credentials = btoa(`wellness-mcp:${MCP_AUTH_TOKEN}`);
    const res = await app.request('/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: 'grant_type=client_credentials',
    }, makeEnv());
    expect(res.status).toBe(200);
  });
});
