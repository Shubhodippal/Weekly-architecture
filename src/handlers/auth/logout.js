import { getSessionId } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";

export async function handleLogout(request, env) {
  const sessionId = getSessionId(request);
  if (sessionId) {
    await env.SESSIONS.delete(`session:${sessionId}`);
  }
  return json(
    { success: true, message: "Logged out successfully" },
    200,
    { "Set-Cookie": "session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0" }
  );
}
