import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OuraClient } from './client';

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', mockFetch);

const ACCESS_TOKEN = 'oura-token-abc';

function okJson(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('OuraClient — auth header', () => {
  it('sends Bearer token on every request', async () => {
    mockFetch.mockReturnValue(okJson([]));
    const client = new OuraClient(ACCESS_TOKEN);
    await client.getDailySleep('2025-01-01', '2025-01-07');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      `Bearer ${ACCESS_TOKEN}`,
    );
  });
});

describe('OuraClient.getDailySleep()', () => {
  it('hits daily_sleep endpoint with correct query params', async () => {
    mockFetch.mockReturnValue(okJson([{ day: '2025-01-01', score: 82 }]));
    const client = new OuraClient(ACCESS_TOKEN);
    const result = await client.getDailySleep('2025-01-01', '2025-01-07');

    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(82);

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch('daily_sleep');
    expect(url).toMatch('start_date=2025-01-01');
    expect(url).toMatch('end_date=2025-01-07');
  });

  it('throws on non-2xx', async () => {
    mockFetch.mockReturnValue(Promise.resolve(new Response('Unauthorized', { status: 401 })));
    const client = new OuraClient(ACCESS_TOKEN);
    await expect(client.getDailySleep('2025-01-01', '2025-01-07')).rejects.toThrow('401');
  });
});

describe('OuraClient.getDailyReadiness()', () => {
  it('hits daily_readiness endpoint', async () => {
    mockFetch.mockReturnValue(okJson([{ day: '2025-01-01', score: 75 }]));
    const client = new OuraClient(ACCESS_TOKEN);
    await client.getDailyReadiness('2025-01-01', '2025-01-07');

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch('daily_readiness');
  });
});

describe('OuraClient.getDailyActivity()', () => {
  it('hits daily_activity endpoint', async () => {
    mockFetch.mockReturnValue(okJson([]));
    const client = new OuraClient(ACCESS_TOKEN);
    await client.getDailyActivity('2025-01-01', '2025-01-07');

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch('daily_activity');
  });
});

describe('OuraClient.getHeartRate()', () => {
  it('hits heartrate endpoint with datetime params', async () => {
    mockFetch.mockReturnValue(okJson([{ bpm: 62, source: 'ppg', timestamp: '2025-01-01T01:00:00Z' }]));
    const client = new OuraClient(ACCESS_TOKEN);
    const result = await client.getHeartRate('2025-01-01T00:00:00Z', '2025-01-02T00:00:00Z');

    expect(result[0].bpm).toBe(62);

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch('heartrate');
    expect(url).toMatch('start_datetime=');
    expect(url).toMatch('end_datetime=');
  });
});
