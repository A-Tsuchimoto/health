import { describe, expect, it, vi } from 'vitest';

vi.mock('agents/mcp', () => ({
  createMcpHandler: vi.fn().mockReturnValue(() => new Response('mcp')),
}));

import { app } from '../index';

describe('GET /health', () => {
  it('returns { ok: true } with status 200', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});
