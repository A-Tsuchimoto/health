import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SwitchBotClient } from './client';

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', mockFetch);

const mockCrypto = {
  randomUUID: vi.fn(() => 'test-nonce-1234'),
  subtle: {
    importKey: vi.fn().mockResolvedValue('mock-key'),
    sign: vi.fn().mockResolvedValue(new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer),
  },
};
vi.stubGlobal('crypto', mockCrypto);

const TOKEN = 'my-token';
const SECRET = 'my-secret';

function okJson(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  mockCrypto.randomUUID.mockReturnValue('test-nonce-1234');
});

describe('SwitchBotClient.listDevices()', () => {
  it('calls /v1.1/devices with HMAC headers', async () => {
    mockFetch.mockReturnValueOnce(
      okJson({ body: { deviceList: [{ deviceId: 'd1', deviceName: 'Room', deviceType: 'MeterPlus' }] } }),
    );

    const client = new SwitchBotClient(TOKEN, SECRET);
    const devices = await client.listDevices();

    expect(devices).toHaveLength(1);
    expect(devices[0].deviceId).toBe('d1');

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch('/v1.1/devices');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(TOKEN);
    expect((init.headers as Record<string, string>)['nonce']).toBe('test-nonce-1234');
    expect((init.headers as Record<string, string>)['sign']).toBeTruthy();
  });

  it('throws on non-2xx response', async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve(new Response('Internal Server Error', { status: 500 })),
    );
    const client = new SwitchBotClient(TOKEN, SECRET);
    await expect(client.listDevices()).rejects.toThrow('500');
  });
});

describe('SwitchBotClient.getMeterStatus()', () => {
  it('calls /v1.1/devices/:id/status and returns body', async () => {
    const status = { deviceId: 'd1', deviceType: 'MeterPlus', temperature: 23.5, humidity: 55, battery: 80 };
    mockFetch.mockReturnValueOnce(okJson({ body: status }));

    const client = new SwitchBotClient(TOKEN, SECRET);
    const result = await client.getMeterStatus('d1');

    expect(result.temperature).toBe(23.5);
    expect(result.humidity).toBe(55);

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch('/v1.1/devices/d1/status');
  });

  it('throws on non-2xx response', async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve(new Response('Not Found', { status: 404 })),
    );
    const client = new SwitchBotClient(TOKEN, SECRET);
    await expect(client.getMeterStatus('d1')).rejects.toThrow('404');
  });
});
