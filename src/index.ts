interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  CANONICAL_HOST: string;
}

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};

const STATIC_ASSET_PATTERN =
  /\.(?:avif|css|gif|ico|jpg|jpeg|js|json|png|svg|txt|webmanifest|webp|woff2?)$/i;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === `www.${env.CANONICAL_HOST}`) {
      url.hostname = env.CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === "/_health") {
      return json({
        ok: true,
        service: "optiyou",
        environment: env.ENVIRONMENT,
        timestamp: new Date().toISOString()
      });
    }

    if (url.pathname === "/_version") {
      return json({
        service: "optiyou",
        environment: env.ENVIRONMENT,
        deployed_by: "cloudflare-workers",
        repository: "MisterKaden/Optiyou"
      });
    }

    const response = await env.ASSETS.fetch(request);
    return withResponseHeaders(response, url);
  }
};

function json(payload: Record<string, unknown>, init: ResponseInit = {}): Response {
  return withResponseHeaders(
    Response.json(payload, {
      ...init,
      headers: {
        "Cache-Control": "no-store",
        ...init.headers
      }
    }),
    new URL("https://optiyou.co/_health")
  );
}

function withResponseHeaders(response: Response, url: URL): Response {
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

