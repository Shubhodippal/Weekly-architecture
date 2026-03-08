import { router } from "./router.js";
import { CORS } from "./config.js";

export default {
  async fetch(request, env) {
    // CORS pre-flight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const { pathname } = new URL(request.url);

    // API routes ? worker
    if (pathname.startsWith("/api/")) {
      return router(request, env);
    }

    // Static assets ? Cloudflare Assets binding
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
