import { handleApiRequest, handleIngestionQueue } from "./http/api.ts";
import { jsonResponse, withResponseHeaders } from "./http/responses.ts";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === `www.${env.CANONICAL_HOST}`) {
      url.hostname = env.CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === "/_health") {
      return jsonResponse({
        ok: true,
        service: "optiyou",
        environment: env.ENVIRONMENT,
        timestamp: new Date().toISOString()
      });
    }

    if (url.pathname === "/_version") {
      return jsonResponse({
        service: "optiyou",
        environment: env.ENVIRONMENT,
        deployed_by: "cloudflare-workers",
        repository: "MisterKaden/Optiyou",
        platform: "cloudflare-first-product-intelligence",
        methodology: env.METHODOLOGY_VERSION
      });
    }

    if (url.pathname.startsWith("/v1/")) {
      return handleApiRequest(request, env, ctx);
    }

    const response = await env.ASSETS.fetch(request);
    return withResponseHeaders(response, url);
  },

  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    await handleIngestionQueue(batch, env);
  }
};
