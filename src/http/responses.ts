export const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
} as const;

const STATIC_ASSET_PATTERN =
  /\.(?:avif|css|gif|ico|jpg|jpeg|js|json|png|svg|txt|webmanifest|webp|woff2?)$/i;

export function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return withResponseHeaders(
    Response.json(payload, {
      ...init,
      headers: {
        "Cache-Control": "no-store",
        ...init.headers
      }
    }),
    new URL("https://optiyou.co/_json")
  );
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): Response {
  return jsonResponse({
    error: {
      code,
      message,
      details
    }
  }, { status });
}

export function withResponseHeaders(response: Response, url: URL): Response {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }

  if (STATIC_ASSET_PATTERN.test(url.pathname)) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "no-store");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new HttpError(415, "unsupported_media_type", "Send JSON with content-type application/json.");
  }

  return request.json();
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
