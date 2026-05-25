import { HttpError } from "../http/responses.ts";

export interface AuthenticatedUser {
  id: string;
  email?: string;
  token: string;
}

interface JwtPayload {
  sub?: unknown;
  email?: unknown;
  exp?: unknown;
  nbf?: unknown;
  iss?: unknown;
  aud?: unknown;
}

export async function requireUser(request: Request, env: Env): Promise<AuthenticatedUser> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "auth_required", "A bearer token is required.");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (token.length < 10) {
    throw new HttpError(401, "auth_invalid", "Bearer token is too short.");
  }

  const signingSecret = readSecret(env, "AUTH_JWT_SECRET");
  if (!signingSecret) {
    const devUser = await localDevelopmentUser(token, env);
    if (devUser) {
      return devUser;
    }

    const status = readEnvString(env, "ENVIRONMENT") === "production" ? 500 : 401;
    throw new HttpError(status, "auth_not_configured", "AUTH_JWT_SECRET must be configured before bearer tokens are accepted.");
  }

  const payload = await verifyHs256Jwt(token, signingSecret, env);
  if (!payload) {
    throw new HttpError(401, "auth_invalid", "Bearer token is invalid or expired.");
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
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return atob(padded);
  } catch {
    return null;
  }
}

function base64UrlEncode(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
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
