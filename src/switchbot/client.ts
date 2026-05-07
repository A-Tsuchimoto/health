const BASE_URL = 'https://api.switch-bot.com/v1.1';

export interface SwitchBotDevice {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  hubDeviceId?: string;
}

export interface MeterStatus {
  deviceId: string;
  deviceType: string;
  temperature: number;
  humidity: number;
  battery: number;
}

async function buildHeaders(token: string, secret: string): Promise<Record<string, string>> {
  const t = Date.now().toString();
  const nonce = crypto.randomUUID();
  const message = token + t + nonce;

  const keyData = new TextEncoder().encode(secret);
  const msgData = new TextEncoder().encode(message);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, msgData);
  const sign = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  return {
    Authorization: token,
    sign,
    t,
    nonce,
    'Content-Type': 'application/json',
  };
}

export class SwitchBotClient {
  constructor(
    private readonly token: string,
    private readonly secret: string,
  ) {}

  async listDevices(): Promise<SwitchBotDevice[]> {
    const headers = await buildHeaders(this.token, this.secret);
    const res = await fetch(`${BASE_URL}/devices`, { headers });
    if (!res.ok) {
      throw new Error(`SwitchBot listDevices failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { body: { deviceList: SwitchBotDevice[] } };
    return json.body.deviceList;
  }

  async getMeterStatus(deviceId: string): Promise<MeterStatus> {
    const headers = await buildHeaders(this.token, this.secret);
    const res = await fetch(`${BASE_URL}/devices/${deviceId}/status`, { headers });
    if (!res.ok) {
      throw new Error(`SwitchBot getMeterStatus(${deviceId}) failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { body: MeterStatus };
    return json.body;
  }
}
