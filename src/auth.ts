import type { MiddlewareHandler } from "hono";
import type { Env } from "./types";

/**
 * Minimal HTTP Basic Auth middleware, written by hand rather than relying
 * on a specific version of Hono's built-in basicAuth — this needs to read
 * the password from c.env (a per-request Cloudflare secret), and the
 * exact callback shape for that varies across Hono versions.
 *
 * Fails CLOSED: if DASHBOARD_PASSWORD isn't set as a secret, every
 * protected route returns 500 rather than silently allowing access.
 * Set it once via `wrangler secret put DASHBOARD_PASSWORD` and this never
 * comes up again.
 */
export function requireAuth(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const password = c.env.DASHBOARD_PASSWORD;
    if (!password) {
      return c.text(
        "Server misconfigured: DASHBOARD_PASSWORD secret is not set. Run: wrangler secret put DASHBOARD_PASSWORD",
        500
      );
    }
    const username = c.env.DASHBOARD_USERNAME || "admin";

    const authHeader = c.req.header("Authorization");
    const unauthorized = () => {
      c.header("WWW-Authenticate", 'Basic realm="Stock Notifier", charset="UTF-8"');
      return c.text("Authentication required", 401);
    };

    if (!authHeader || !authHeader.startsWith("Basic ")) {
      return unauthorized();
    }

    let decoded: string;
    try {
      decoded = atob(authHeader.slice("Basic ".length));
    } catch {
      return unauthorized();
    }

    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) return unauthorized();

    const providedUser = decoded.slice(0, separatorIndex);
    const providedPass = decoded.slice(separatorIndex + 1);

    if (providedUser !== username || providedPass !== password) {
      return unauthorized();
    }

    await next();
  };
}
