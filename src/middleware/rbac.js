import { json } from "../utils/response.js";

/**
 * Returns an error Response if the session does not have the admin role,
 * otherwise returns null (no error).
 */
export function requireAdmin(session) {
  if (!session) {
    return json({ success: false, message: "Not authenticated" }, 401);
  }
  if (session.role !== "admin") {
    return json({ success: false, message: "Forbidden: admin access required" }, 403);
  }
  return null;
}
