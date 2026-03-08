import { generateOTP, sha256Hex } from "../../utils/crypto.js";
import { sendOTPEmail } from "../../utils/email.js";
import { json } from "../../utils/response.js";
import { ADMIN_EMAIL } from "../../config.js";

export async function handleRequestOtp(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, message: "Invalid JSON body" }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  const name = (body.name || "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ success: false, message: "A valid email is required" }, 400);
  }

  // Look up existing user
  let user = await env.DB.prepare(
    "SELECT id, name, role FROM users WHERE email = ?"
  )
    .bind(email)
    .first();

  if (!user) {
    if (!name) {
      return json(
        { success: false, message: "Name is required for new accounts", newUser: true },
        400
      );
    }
    const role = email === ADMIN_EMAIL ? "admin" : "user";
    await env.DB.prepare(
      "INSERT INTO users (name, email, role) VALUES (?, ?, ?)"
    )
      .bind(name, email, role)
      .run();
    user = await env.DB.prepare(
      "SELECT id, name, role FROM users WHERE email = ?"
    )
      .bind(email)
      .first();
  }

  // Invalidate prior unused OTPs for this email
  await env.DB.prepare(
    "UPDATE otps SET used = 1 WHERE email = ? AND used = 0"
  )
    .bind(email)
    .run();

  // Generate OTP and store its hash
  const otp = generateOTP();
  const otpHash = await sha256Hex(otp);
  await env.DB.prepare("INSERT INTO otps (email, otp_hash) VALUES (?, ?)")
    .bind(email, otpHash)
    .run();

  try {
    await sendOTPEmail({ to: email, name: user.name, otp });
  } catch {
    return json({ success: false, message: "Failed to send OTP email" }, 502);
  }

  return json({ success: true, message: "OTP sent to your email address" });
}
