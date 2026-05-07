const OURA_AUTH_URL = 'https://cloud.ouraring.com/oauth/authorize';
const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';
// Scopes needed for daily_sleep / daily_readiness / daily_activity / heartrate
const OURA_SCOPES = 'daily heartrate';

interface TokenRow {
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null;
  state: string | null;
}

interface OuraTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

/** Start the Authorization Code flow. Returns the Oura authorization URL. */
export async function startOAuthFlow(
  db: D1Database,
  clientId: string,
  redirectUri: string,
): Promise<string> {
  const state = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO oauth_tokens (provider, access_token, state)
       VALUES ('oura', '', ?)
       ON CONFLICT(provider) DO UPDATE SET state = excluded.state`,
    )
    .bind(state)
    .run();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: OURA_SCOPES,
    state,
  });

  return `${OURA_AUTH_URL}?${params}`;
}

/** Handle the callback: verify state, exchange code, store tokens. */
export async function handleOAuthCallback(
  db: D1Database,
  clientId: string,
  clientSecret: string,
  code: string,
  state: string,
  redirectUri: string,
): Promise<void> {
  const row = await db
    .prepare(`SELECT state FROM oauth_tokens WHERE provider = 'oura'`)
    .first<Pick<TokenRow, 'state'>>();

  if (!row || row.state !== state) {
    throw new Error('Invalid or expired OAuth state. Start the flow again via /oura/auth.');
  }

  const res = await fetch(OURA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as OuraTokenResponse;
  const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;

  await db
    .prepare(
      `UPDATE oauth_tokens
       SET access_token = ?, refresh_token = ?, expires_at = ?, state = NULL
       WHERE provider = 'oura'`,
    )
    .bind(data.access_token, data.refresh_token ?? null, expiresAt)
    .run();
}

async function refreshToken(
  db: D1Database,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const res = await fetch(OURA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as OuraTokenResponse;
  const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;

  await db
    .prepare(
      `UPDATE oauth_tokens
       SET access_token = ?, refresh_token = COALESCE(?, refresh_token), expires_at = ?
       WHERE provider = 'oura'`,
    )
    .bind(data.access_token, data.refresh_token ?? null, expiresAt)
    .run();

  return data.access_token;
}

/**
 * Return a valid access token, refreshing automatically if it expires
 * within the next 5 minutes.
 */
export async function getValidToken(
  db: D1Database,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const row = await db
    .prepare(
      `SELECT access_token, refresh_token, expires_at
       FROM oauth_tokens WHERE provider = 'oura'`,
    )
    .first<Omit<TokenRow, 'state'>>();

  if (!row || !row.access_token) {
    throw new Error(
      'Oura is not connected. Visit /oura/auth?token=<MCP_AUTH_TOKEN> to authorize.',
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const nearExpiry = row.expires_at !== null && row.expires_at - now < 300;

  if (nearExpiry && row.refresh_token) {
    return refreshToken(db, clientId, clientSecret, row.refresh_token);
  }

  return row.access_token;
}
