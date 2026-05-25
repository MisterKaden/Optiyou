import { HttpError } from "../http/responses.ts";

export interface AuthenticatedUser {
  id: string;
  email?: string;
  token: string;
}

export interface AppleSignInNonce {
  nonce: string;
  nonceSha256: string;
  expiresAt: string;
}

export interface IssuedAuthSession {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: string;
  user: AuthenticatedUser;
}

interface JwtPayload {
  sub?: unknown;
  email?: unknown;
  exp?: unknown;
  iat?: unknown;
  nbf?: unknown;
  iss?: unknown;
  aud?: unknown;
  nonce?: unknown;
  token_use?: unknown;
}

interface JwtHeader {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
}

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const DEFAULT_NONCE_TTL_SECONDS = 10 * 60;
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60;
const APPLE_JWKS_CACHE_TTL_SECONDS = 6 * 60 * 60;
const OPTIYOU_ACCESS_TOKEN_USE = "optiyou_access";

export async function requireUser(request: Request, env: Env): Promise<AuthenticatedUser> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "auth_required", "A bearer token is required.");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (token.length < 10) {
    throw new HttpError(401, "auth_invalid", "Bearer token is too short.");
  }

  const devUser = await localDevelopmentUser(token, env);
  if (devUser) {
    return devUser;
  }

  const signingSecret = readSecret(env, "AUTH_JWT_SECRET");
  if (!signingSecret) {
    const status = readEnvString(env, "ENVIRONMENT") === "production" ? 500 : 401;
    throw new HttpError(status, "auth_not_configured", "AUTH_JWT_SECRET must be configured before access tokens are accepted.");
  }

  const payload = await verifyHs256Jwt(token, signingSecret, env);
  if (!payload) {
    throw new HttpError(401, "auth_invalid", "Bearer token is invalid or expired.");
  }

  if (payload.token_use !== OPTIYOU_ACCESS_TOKEN_USE) {
    throw new HttpError(401, "auth_invalid", "Bearer token is not an Optiyou access token.");
  }

  const id = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!/^[a-zA-Z0-9._:-]{3,160}$/.test(id)) {
    throw new HttpError(401, "auth_invalid_subject", "Bearer token subject is invalid.");
  }

  return {
    id,
    email: typeof payload.email === "string" && payload.email.includes("@") ? payload.email : undefined,
    token
  };
}

export async function createAppleSignInNonce(env: Env, now = new Date()): Promise<AppleSignInNonce> {
  const nonce = randomBase64Url(32);
  const nonceSha256 = await sha256Hex(nonce);
  const ttlSeconds = readPositiveInteger(env, "AUTH_APPLE_NONCE_TTL_SECONDS", DEFAULT_NONCE_TTL_SECONDS);
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  await env.APP_CONFIG.put(appleNonceKey(nonceSha256), "issued", { expirationTtl: ttlSeconds });

  return {
    nonce,
    nonceSha256,
    expiresAt: expiresAt.toISOString()
  };
}

export async function exchangeAppleIdentityToken(
  input: { identityToken: string; nonce: string },
  env: Env,
  now = new Date()
): Promise<IssuedAuthSession> {
  if (input.identityToken.length < 100 || input.identityToken.length > 8192) {
    throw new HttpError(401, "auth_invalid", "Apple identity token is invalid.");
  }

  if (!/^[a-zA-Z0-9._~:-]{24,256}$/.test(input.nonce)) {
    throw new HttpError(401, "auth_nonce_invalid", "Apple sign-in nonce is invalid or expired.");
  }

  const expectedNonceHash = await sha256Hex(input.nonce);
  const nonceKey = appleNonceKey(expectedNonceHash);
  const nonceState = await env.APP_CONFIG.get(nonceKey);
  if (nonceState !== "issued") {
    throw new HttpError(401, "auth_nonce_invalid", "Apple sign-in nonce is invalid or expired.");
  }

  const expectedAudience = readRequiredConfig(env, "APPLE_CLIENT_ID", "APPLE_CLIENT_ID must match the iOS bundle identifier.");
  const payload = await verifyAppleIdentityToken(input.identityToken, expectedAudience, expectedNonceHash, env, now);
  if (!payload) {
    throw new HttpError(401, "auth_invalid", "Apple identity token is invalid or expired.");
  }

  await env.APP_CONFIG.delete(nonceKey);

  const rawAppleUserId = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!/^[a-zA-Z0-9._-]{3,180}$/.test(rawAppleUserId)) {
    throw new HttpError(401, "auth_invalid_subject", "Apple identity token subject is invalid.");
  }

  const user: AuthenticatedUser = {
    id: `apple:${rawAppleUserId}`,
    email: typeof payload.email === "string" && payload.email.includes("@") ? payload.email : undefined,
    token: input.identityToken
  };

  return issueAuthSession(user, env, now);
}

export async function issueAuthSession(user: AuthenticatedUser, env: Env, now = new Date()): Promise<IssuedAuthSession> {
  const signingSecret = readSecret(env, "AUTH_JWT_SECRET");
  if (!signingSecret) {
    throw new HttpError(500, "auth_not_configured", "AUTH_JWT_SECRET must be configured before sessions are issued.");
  }

  const ttlSeconds = readPositiveInteger(env, "AUTH_SESSION_TTL_SECONDS", DEFAULT_SESSION_TTL_SECONDS);
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = new Date((issuedAt + ttlSeconds) * 1000);
  const accessToken = await signHs256Jwt({
    sub: user.id,
    email: user.email,
    iss: readEnvString(env, "AUTH_JWT_ISSUER") ?? "https://optiyou.co",
    aud: readEnvString(env, "AUTH_JWT_AUDIENCE") ?? "optiyou-ios",
    iat: issuedAt,
    nbf: issuedAt - 5,
    exp: issuedAt + ttlSeconds,
    token_use: OPTIYOU_ACCESS_TOKEN_USE
  }, signingSecret);

  return {
    accessToken,
    tokenType: "Bearer",
    expiresAt: expiresAt.toISOString(),
    user: {
      ...user,
      token: accessToken
    }
  };
}

export async function requireAdmin(request: Request, env: Env): Promise<void> {
  const expected = readSecret(env, "ADMIN_API_TOKEN");
  const provided = request.headers.get("x-optiyou-admin-token");
  if (!expected || !provided || !(await timingSafeEqual(provided, expected))) {
    throw new HttpError(403, "admin_forbidden", "Admin access requires Cloudflare Access plus the admin API token.");
  }
}

export function readSecret(env: Env, name: string): string | null {
  const value = Reflect.get(env, name);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readEnvString(env: Env, name: string): string | null {
  return readSecret(env, name);
}

function readRequiredConfig(env: Env, name: string, message: string): string {
  const value = readEnvString(env, name);
  if (!value) {
    throw new HttpError(500, "auth_not_configured", message);
  }

  return value;
}

function readPositiveInteger(env: Env, name: string, fallback: number): number {
  const value = readEnvString(env, name);
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function localDevelopmentUser(token: string, env: Env): Promise<AuthenticatedUser | null> {
  if (readEnvString(env, "ENVIRONMENT") === "production") {
    return null;
  }

  const devToken = readSecret(env, "DEV_AUTH_TOKEN");
  if (devToken && await timingSafeEqual(token, devToken)) {
    return {
      id: readEnvString(env, "DEV_AUTH_USER_ID") ?? "seed-user",
      token
    };
  }

  if (token.startsWith("dev:")) {
    const id = token.slice("dev:".length).trim();
    if (/^[a-zA-Z0-9._:-]{3,160}$/.test(id)) {
      return { id, token };
    }
  }

  return null;
}

async function verifyHs256Jwt(token: string, signingSecret: string, env: Env): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const header = parseJsonObject(decodeBase64UrlToString(encodedHeader));
  if (!header || header.alg !== "HS256") {
    return null;
  }

  const signedInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = base64UrlEncode(await hmacSha256(signedInput, signingSecret));
  if (!(await timingSafeEqual(signature, expectedSignature))) {
    return null;
  }

  const payload = parseJsonObject(decodeBase64UrlToString(encodedPayload)) as JwtPayload | null;
  if (!payload) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) {
    return null;
  }

  if (typeof payload.iat === "number" && payload.iat > now + 60) {
    return null;
  }

  if (typeof payload.nbf === "number" && payload.nbf > now + 60) {
    return null;
  }

  const expectedIssuer = readEnvString(env, "AUTH_JWT_ISSUER");
  if (expectedIssuer && payload.iss !== expectedIssuer) {
    return null;
  }

  const expectedAudience = readEnvString(env, "AUTH_JWT_AUDIENCE");
  if (expectedAudience && !audienceMatches(payload.aud, expectedAudience)) {
    return null;
  }

  return payload;
}

async function verifyAppleIdentityToken(
  token: string,
  expectedAudience: string,
  expectedNonceHash: string,
  env: Env,
  nowDate: Date
): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const header = parseJsonObject(decodeBase64UrlToString(encodedHeader)) as JwtHeader | null;
  if (!header || header.alg !== "RS256" || typeof header.kid !== "string") {
    return null;
  }

  const payload = parseJsonObject(decodeBase64UrlToString(encodedPayload)) as JwtPayload | null;
  if (!payload) {
    return null;
  }

  const jwk = await findAppleJwk(env, header.kid);
  if (!jwk) {
    return null;
  }

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const signatureBytes = decodeBase64UrlToBytes(signature);
  if (!signatureBytes) {
    return null;
  }

  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    signatureBytes,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );
  if (!verified) {
    return null;
  }

  const now = Math.floor(nowDate.getTime() / 1000);
  if (payload.iss !== APPLE_ISSUER) {
    return null;
  }

  if (!audienceMatches(payload.aud, expectedAudience)) {
    return null;
  }

  if (typeof payload.exp !== "number" || payload.exp <= now) {
    return null;
  }

  if (typeof payload.iat === "number" && payload.iat > now + 60) {
    return null;
  }

  if (typeof payload.nbf === "number" && payload.nbf > now + 60) {
    return null;
  }

  if (payload.nonce !== expectedNonceHash) {
    return null;
  }

  return payload;
}

async function findAppleJwk(env: Env, kid: string): Promise<JsonWebKey | null> {
  const jwks = await loadAppleJwks(env);
  const keys = Array.isArray(jwks.keys) ? jwks.keys : [];
  const key = keys.find((candidate) =>
    candidate &&
    typeof candidate === "object" &&
    Reflect.get(candidate, "kid") === kid &&
    Reflect.get(candidate, "kty") === "RSA"
  );

  return key ? key as JsonWebKey : null;
}

async function loadAppleJwks(env: Env): Promise<Record<string, unknown>> {
  const configured = readSecret(env, "APPLE_JWKS_JSON");
  if (configured) {
    const parsed = parseJsonObject(configured);
    if (parsed) {
      return parsed;
    }
  }

  const cacheKey = "auth:apple:jwks";
  const cached = await env.APP_CONFIG.get(cacheKey);
  if (cached) {
    const parsed = parseJsonObject(cached);
    if (parsed) {
      return parsed;
    }
  }

  const response = await fetch(APPLE_JWKS_URL);
  if (!response.ok) {
    throw new HttpError(503, "auth_jwks_unavailable", "Apple public keys are unavailable.");
  }

  const text = await response.text();
  const parsed = parseJsonObject(text);
  if (!parsed) {
    throw new HttpError(503, "auth_jwks_invalid", "Apple public keys response was invalid.");
  }

  await env.APP_CONFIG.put(cacheKey, text, { expirationTtl: APPLE_JWKS_CACHE_TTL_SECONDS });
  return parsed;
}

async function signHs256Jwt(payload: Record<string, unknown>, signingSecret: string): Promise<string> {
  const encodedHeader = base64UrlEncodeString(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = base64UrlEncodeString(JSON.stringify(payload));
  const signedInput = `${encodedHeader}.${encodedPayload}`;
  const signature = base64UrlEncode(await hmacSha256(signedInput, signingSecret));

  return `${signedInput}.${signature}`;
}

async function hmacSha256(value: string, secret: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", key, encoder.encode(value));
}

function appleNonceKey(nonceSha256: string): string {
  return `auth:apple:nonce:${nonceSha256}`;
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function audienceMatches(audience: unknown, expected: string): boolean {
  if (typeof audience === "string") {
    return audience === expected;
  }
  return Array.isArray(audience) && audience.some((value) => value === expected);
}

function parseJsonObject(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function decodeBase64UrlToString(value: string): string | null {
  const bytes = decodeBase64UrlToBytes(value);
  if (!bytes) {
    return null;
  }

  return new TextDecoder().decode(bytes);
}

function decodeBase64UrlToBytes(value: string): Uint8Array | null {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    return null;
  }
}

function base64UrlEncodeString(value: string): string {
  return base64UrlEncode(new TextEncoder().encode(value));
}

function base64UrlEncode(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function timingSafeEqual(left: string, right: string): Promise<boolean> {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  await crypto.subtle.digest("SHA-256", leftBytes);
  return diff === 0;
}
