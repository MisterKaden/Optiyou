import type { ContributionIntent, UploadKind } from "../platform/types.ts";

interface BuildContributionIntentInput {
  gtin: string;
  userId: string;
  profileId: string;
  baseUrl: string;
  now: Date;
  signingSecret: string;
}

const REQUIRED_UPLOADS: UploadKind[] = ["front_package", "nutrition_label", "ingredients_label"];

export async function buildContributionIntent(input: BuildContributionIntentInput): Promise<ContributionIntent> {
  const productId = `prod_${input.gtin}`;
  const contributionId = `contrib_${crypto.randomUUID()}`;
  const expiresAt = new Date(input.now.getTime() + 15 * 60 * 1000).toISOString();
  const uploadEntries = REQUIRED_UPLOADS.map((kind) => ({
    kind,
    objectKey: `contributions/${productId}/${contributionId}/${kind}.jpg`
  }));

  const uploads = await Promise.all(
    uploadEntries.map(async (upload) => ({
      ...upload,
      expiresAt,
      url: `${input.baseUrl}/v1/uploads/${await signUploadToken({
        objectKey: upload.objectKey,
        contributionId,
        userId: input.userId,
        kind: upload.kind,
        expiresAt,
        signingSecret: input.signingSecret
      })}`
    }))
  );

  return {
    status: "missing_product",
    product: {
      id: productId,
      gtin: input.gtin,
      market: "US_CA",
      verificationStatus: "unverified"
    },
    contribution: {
      id: contributionId,
      profileId: input.profileId,
      status: "awaiting_uploads"
    },
    uploads,
    queueMessage: {
      type: "ingest_missing_product",
      productId,
      contributionId,
      gtin: input.gtin,
      market: "US_CA",
      uploadKeys: {
        front_package: uploadEntries[0].objectKey,
        nutrition_label: uploadEntries[1].objectKey,
        ingredients_label: uploadEntries[2].objectKey
      }
    }
  };
}

interface SignUploadTokenInput {
  objectKey: string;
  contributionId: string;
  userId: string;
  kind: UploadKind;
  expiresAt: string;
  signingSecret: string;
}

async function signUploadToken(input: SignUploadTokenInput): Promise<string> {
  const payload = base64UrlEncode(JSON.stringify({
    objectKey: input.objectKey,
    contributionId: input.contributionId,
    userId: input.userId,
    kind: input.kind,
    expiresAt: input.expiresAt
  }));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${base64UrlEncode(signature)}`;
}

export interface VerifiedUploadToken {
  objectKey: string;
  contributionId: string;
  userId: string;
  kind: UploadKind;
  expiresAt: string;
}

export async function verifyUploadToken(
  token: string,
  signingSecret: string,
  now: Date
): Promise<VerifiedUploadToken | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  if (!constantTimeEqual(signature, base64UrlEncode(expected))) {
    return null;
  }

  const parsed = parseUploadTokenPayload(payload);
  if (!parsed || Date.parse(parsed.expiresAt) <= now.getTime()) {
    return null;
  }

  return parsed;
}

function base64UrlEncode(value: string | ArrayBuffer): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function parseUploadTokenPayload(payload: string): VerifiedUploadToken | null {
  try {
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as unknown;
    if (!isUploadPayload(decoded)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function isUploadPayload(value: unknown): value is VerifiedUploadToken {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.objectKey === "string" &&
    typeof candidate.contributionId === "string" &&
    typeof candidate.userId === "string" &&
    isUploadKind(candidate.kind) &&
    typeof candidate.expiresAt === "string";
}

function isUploadKind(value: unknown): value is UploadKind {
  return typeof value === "string" && REQUIRED_UPLOADS.includes(value as UploadKind);
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}
