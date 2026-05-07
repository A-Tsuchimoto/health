const BASE_URL = 'https://api.ouraring.com/v2/usercollection';

export interface OuraSleepDocument {
  day: string;
  score?: number;
  contributors?: Record<string, number>;
  [key: string]: unknown;
}

export interface OuraReadinessDocument {
  day: string;
  score?: number;
  contributors?: Record<string, number>;
  [key: string]: unknown;
}

export interface OuraActivityDocument {
  day: string;
  score?: number;
  active_calories?: number;
  steps?: number;
  [key: string]: unknown;
}

export interface OuraHeartRateSample {
  bpm: number;
  source: string;
  timestamp: string;
}

interface OuraListResponse<T> {
  data: T[];
  next_token?: string;
}

export class OuraClient {
  private readonly headers: Record<string, string>;

  constructor(accessToken: string) {
    this.headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private async fetchList<T>(
    endpoint: string,
    params: Record<string, string>,
  ): Promise<T[]> {
    const url = new URL(`${BASE_URL}/${endpoint}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url.toString(), { headers: this.headers });
    if (!res.ok) {
      throw new Error(`Oura ${endpoint} failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as OuraListResponse<T>;
    return json.data;
  }

  getDailySleep(start_date: string, end_date: string): Promise<OuraSleepDocument[]> {
    return this.fetchList<OuraSleepDocument>('daily_sleep', { start_date, end_date });
  }

  getDailyReadiness(start_date: string, end_date: string): Promise<OuraReadinessDocument[]> {
    return this.fetchList<OuraReadinessDocument>('daily_readiness', { start_date, end_date });
  }

  getDailyActivity(start_date: string, end_date: string): Promise<OuraActivityDocument[]> {
    return this.fetchList<OuraActivityDocument>('daily_activity', { start_date, end_date });
  }

  getHeartRate(start_datetime: string, end_datetime: string): Promise<OuraHeartRateSample[]> {
    return this.fetchList<OuraHeartRateSample>('heartrate', {
      start_datetime,
      end_datetime,
    });
  }
}
