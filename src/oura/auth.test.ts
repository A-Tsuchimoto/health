import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startOAuthFlow, handleOAuthCallback, getValidToken } from './auth';

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', mockFetch);

const mockCrypto = {
  randomUUID: vi.fn(() => 'test-state-uuid'),
  subtle: crypto.subtle,
};
vi.stubGlobal('crypto', mockCrypto);

function makeDb(firstResult: unknown = null, updateOk = true) {
  const runMock = vi.fn().mockResolvedValue({ success: updateOk });
  const firstMock = vi.fn().mockResolvedValue(firstResult);
  const stmtMock = {
    bind: vi.fn().mockReturnThis(),
    run: runMock,
    first: firstMock,
  };
  return {
    db: { prepare: vi.fn().mockReturnValue(stmtMock) } as unknown as D1Database,
    runMock,
    firstMock,
    stmtMock,
  };
}

function tokenResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return Promise.resolve(
    new Response(
      JSON.stringify({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 86400,
        token_type: 'Bearer',
        ...overrides,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  mockCrypto.randomUUID.mockReturnValue('test-state-uuid');
});

describe('startOAuthFlow()', () => {
  it('stores state in D1 and returns correct Oura authorization URL', async () => {
    const { db, stmtMock } = makeDb();
    const url = await startOAuthFlow(db, 'client-id-123', 'https://example.com/oura/callback');

    expect(stmtMock.bind).toHaveBeenCalledWith('test-state-uuid');
    expect(stmtMock.run).toHaveBeenCalled();

    const parsed = new URL(url);
    expect(parsed.host).toBe('cloud.ouraring.com');
    expect(parsed.searchParams.get('client_id')).toBe('client-id-123');
    expect(parsed.searchParams.get('state')).toBe('test-state-uuid');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://example.com/oura/callback');
  });
});

describe('handleOAuthCallback()', () => {
  it('exchanges code for tokens and stores them in D1', async () => {
    const { db, stmtMock } = makeDb({ state: 'correct-state' });
    mockFetch.mockReturnValue(tokenResponse());

    await handleOAuthCallback(
      db,
      'client-id',
      'client-secret',
      'auth-code-abc',
      'correct-state',
      'https://example.com/oura/callback',
    );

    // Token endpoint called with correct params
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.ouraring.com/oauth/token');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth-code-abc');

    // Tokens stored in D1
    expect(stmtMock.bind).toHaveBeenCalledWith(
      'new-access-token',
      'new-refresh-token',
      expect.any(Number),
    );
    expect(stmtMock.run).toHaveBeenCalled();
  });

  it('throws when state does not match', async () => {
    const { db } = makeDb({ state: 'stored-state' });

    await expect(
      handleOAuthCallback(db, 'cid', 'csec', 'code', 'wrong-state', 'https://x/cb'),
    ).rejects.toThrow('Invalid or expired');
  });
});

describe('getValidToken()', () => {
  it('returns stored access token when still valid', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const { db } = makeDb({ access_token: 'stored-token', refresh_token: 'rt', expires_at: expiresAt });

    const token = await getValidToken(db, 'cid', 'csec');
    expect(token).toBe('stored-token');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refreshes when token expires within 5 minutes', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60; // 1 min left
    const { db } = makeDb({
      access_token: 'old-token',
      refresh_token: 'refresh-token',
      expires_at: expiresAt,
    });
    mockFetch.mockReturnValue(tokenResponse({ access_token: 'refreshed-token' }));

    const token = await getValidToken(db, 'cid', 'csec');
    expect(token).toBe('refreshed-token');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('refresh-token');
  });

  it('throws when no token row exists', async () => {
    const { db } = makeDb(null);
    await expect(getValidToken(db, 'cid', 'csec')).rejects.toThrow('not connected');
  });
});
