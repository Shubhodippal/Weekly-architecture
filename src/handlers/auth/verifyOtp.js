import { sha256Hex, generateSessionId } from "../../utils/crypto.js";
import { json } from "../../utils/response.js";
import { SESSION_TTL_SECONDS, ADMIN_EMAIL } from "../../config.js";

export async function handleVerifyOtp(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, message: "Invalid JSON body" }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  const otp = (body.otp || "").trim();

  if (!email || !otp) {
    return json({ success: false, message: "Email and OTP are required" }, 400);
  }

  const otpHash = await sha256Hex(otp);

  // Find a valid, unused, non-expired OTP record
  const record = await env.DB.prepare(
    `SELECT id FROM otps
     WHERE email = ?
       AND otp_hash = ?
       AND used = 0
       AND created_at > datetime('now', '-10 minutes')`
  )
    .bind(email, otpHash)
    .first();

  if (!record) {
    return json({ success: false, message: "Invalid or expired OTP" }, 401);
  }

  // Mark OTP as used
  await env.DB.prepare("UPDATE otps SET used = 1 WHERE id = ?")
    .bind(record.id)
    .run();

  // Update last_login and ensure admin role is set correctly
  await env.DB.prepare(
    "UPDATE users SET last_login = datetime('now'), role = CASE WHEN email = ? THEN 'admin' ELSE role END WHERE email = ?"
  )
    .bind(ADMIN_EMAIL, email)
    .run();

  const user = await env.DB.prepare(
    "SELECT id, name, email, role, last_login FROM users WHERE email = ?"
  )
    .bind(email)
    .first();

  if (!user) {
    return json({ success: false, message: "User not found" }, 404);
  }

  // Create KV session (server-side, no JWT needed)
  const sessionId = generateSessionId();
  await env.SESSIONS.put(
    `session:${sessionId}`,
    JSON.stringify({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
    }),
    { expirationTtl: SESSION_TTL_SECONDS }
  );

  const cookieFlags = `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;

  return json(
    {
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        last_login: user.last_login,
      },
    },
    200,
    { "Set-Cookie": `session=${sessionId}; ${cookieFlags}` }
  );
}
