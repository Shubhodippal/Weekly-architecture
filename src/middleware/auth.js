import { json } from "../utils/response.js";

/** Extract session ID from httpOnly cookie */
export function getSessionId(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Validate session from KV. Returns { session, sessionId } on success
 * or { error: Response } on failure.
 */
export async function requireAuth(request, env) {
  const sessionId = getSessionId(request);
  if (!sessionId) {
    return { error: json({ success: false, message: "Not authenticated" }, 401) };
  }

  const raw = await env.SESSIONS.get(`session:${sessionId}`);
  if (!raw) {
    return { error: json({ success: false, message: "Session expired or invalid" }, 401) };
  }

  const session = JSON.parse(raw);
  if (session.expiresAt < Date.now()) {
    await env.SESSIONS.delete(`session:${sessionId}`);
    return { error: json({ success: false, message: "Session expired" }, 401) };
  }

  return { session, sessionId };
}
