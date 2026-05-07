// OAuth 2.1 + PKCE authorization server for the MCP endpoint.
//
// Design:
// - /authorize is public and auto-approves (this is a personal server; the
//   real authorization gate is the client_secret check at /oauth/token).
// - The authorization code is HMAC-signed with MCP_AUTH_TOKEN and contains
//   { redirect_uri, code_challenge, exp }. No DB needed.
// - /oauth/token requires client_secret == MCP_AUTH_TOKEN AND the PKCE
//   verifier to match. Both grants (authorization_code, client_credentials)
//   issue MCP_AUTH_TOKEN itself as the access_token, since /mcp validates
//   incoming Bearer tokens against MCP_AUTH_TOKEN.

const enc = new TextEncoder();

export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [ah, bh] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const aa = new Uint8Array(ah);
  const ba = new Uint8Array(bh);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ ba[i];
  return diff === 0;
}

function bytesToB64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function strToB64Url(s: string): string {
  return bytesToB64Url(enc.encode(s));
}

function fromB64Url(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

async function hmacHex(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface CodePayload {
  redirect_uri: string;
  code_challenge: string;
  exp: number;
}

export async function issueCode(payload: CodePayload, secret: string): Promise<string> {
  const data = strToB64Url(JSON.stringify(payload));
  const sig = await hmacHex(data, secret);
  return `${data}.${sig}`;
}

export async function verifyCode(code: string, secret: string): Promise<CodePayload | null> {
  const dot = code.indexOf('.');
  if (dot < 0) return null;
  const data = code.slice(0, dot);
  const sig = code.slice(dot + 1);
  const expected = await hmacHex(data, secret);
  if (!(await timingSafeEqual(sig, expected))) return null;
  let payload: CodePayload;
  try {
    payload = JSON.parse(fromB64Url(data));
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}

export async function pkceMatches(verifier: string, challenge: string): Promise<boolean> {
  if (!verifier) return false;
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(verifier));
  return bytesToB64Url(new Uint8Array(hash)) === challenge;
}

export function authServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'client_credentials', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: [
      'client_secret_post',
      'client_secret_basic',
      'none',
    ],
    scopes_supported: ['mcp'],
  };
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
  };
}
