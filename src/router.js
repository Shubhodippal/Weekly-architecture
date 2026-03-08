import { handleRequestOtp } from "./handlers/auth/requestOtp.js";
import { handleVerifyOtp } from "./handlers/auth/verifyOtp.js";
import { handleLogout } from "./handlers/auth/logout.js";
import { handleMe } from "./handlers/user/me.js";
import { handleListUsers } from "./handlers/admin/listUsers.js";
import { handleDeleteUser } from "./handlers/admin/deleteUser.js";
import { json } from "./utils/response.js";

export async function router(request, env) {
  const { pathname } = new URL(request.url);
  const method = request.method;

  try {
    // Auth routes
    if (method === "POST" && pathname === "/api/auth/request-otp")
      return handleRequestOtp(request, env);

    if (method === "POST" && pathname === "/api/auth/verify-otp")
      return handleVerifyOtp(request, env);

    if (method === "POST" && pathname === "/api/auth/logout")
      return handleLogout(request, env);

    // User routes
    if (method === "GET" && pathname === "/api/user/me")
      return handleMe(request, env);

    // Admin routes
    if (method === "GET" && pathname === "/api/admin/users")
      return handleListUsers(request, env);

    const deleteMatch = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if (method === "DELETE" && deleteMatch)
      return handleDeleteUser(request, env, deleteMatch[1]);

    return json({ success: false, message: "Not found" }, 404);
  } catch (err) {
    console.error("[router]", err);
    return json({ success: false, message: "Internal server error" }, 500);
  }
}
