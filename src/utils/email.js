import { EMAIL_API, OTP_EXPIRY_MINUTES } from "../config.js";

export async function sendOTPEmail({ to, name, otp }) {
  const res = await fetch(EMAIL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to,
      subject: "Challenge Accepted — Your Login Code",
      text: `Hi ${name},\n\nYour one-time login code for Challenge Accepted is: ${otp}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share it with anyone.\n\nThe challenge is live. Are you?`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
          <div style="text-align:center;margin-bottom:16px;">
            <div style="display:inline-block;background:#4f46e5;border-radius:50%;width:56px;height:56px;line-height:56px;font-size:24px;color:white;text-align:center;">🎯</div>
          </div>
          <h1 style="color:#4f46e5;margin:0 0 4px;font-size:20px;text-align:center;font-weight:700;">Challenge Accepted</h1>
          <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0 0 24px;font-style:italic;">The challenge is live. Are you?</p>
          <h2 style="color:#111827;margin:0 0 8px;font-size:22px;text-align:center;">Verification Code</h2>
          <p style="color:#6b7280;text-align:center;margin:0 0 24px;">Hi <strong style="color:#111827;">${name}</strong>, use the code below to sign in.</p>
          <div style="font-size:42px;font-weight:700;letter-spacing:12px;text-align:center;padding:20px;background:#f8fafc;border:2px dashed #e2e8f0;border-radius:8px;color:#4f46e5;margin:0 0 24px;">
            ${otp}
          </div>
          <p style="color:#9ca3af;font-size:13px;text-align:center;margin:0;">
            Expires in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>. Do not share this code.
          </p>
        </div>`,
    }),
  });
  if (!res.ok) throw new Error(`Email API error: ${res.status}`);
  return res.json();
}
