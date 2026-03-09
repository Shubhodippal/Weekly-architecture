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

export async function sendNewChallengeEmail({ to, name, challengeTitle, description, deadline }) {
  const deadlineFormatted = new Date(deadline + "T00:00:00").toLocaleDateString(undefined, {
    day: "numeric", month: "long", year: "numeric",
  });

  const res = await fetch(EMAIL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to,
      subject: `Challenge Accepted — New Challenge: "${challengeTitle}"`,
      text: `Hi ${name},\n\nA new challenge has just been posted on Challenge Accepted!\n\n📌 ${challengeTitle}\n${description ? description + "\n" : ""}\n📅 Deadline: ${deadlineFormatted}\n\nLog in now to view and submit your solution before the deadline.\n\nThe challenge is live. Are you?\nChallenge Accepted`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
          <div style="text-align:center;margin-bottom:16px;">
            <div style="display:inline-block;background:#4f46e5;border-radius:50%;width:56px;height:56px;line-height:56px;font-size:24px;color:white;text-align:center;">🎯</div>
          </div>
          <h1 style="color:#4f46e5;margin:0 0 4px;font-size:20px;text-align:center;font-weight:700;">Challenge Accepted</h1>
          <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0 0 24px;font-style:italic;">The challenge is live. Are you?</p>

          <h2 style="color:#111827;margin:0 0 4px;font-size:18px;text-align:center;">🚀 New Challenge Posted!</h2>
          <p style="color:#6b7280;text-align:center;margin:0 0 20px;font-size:14px;">Hi <strong style="color:#111827;">${name}</strong>, a new challenge is waiting for you.</p>

          <div style="padding:18px 20px;border:1.5px solid #c7d2fe;border-radius:10px;background:#eef2ff;margin-bottom:20px;">
            <div style="font-size:11px;text-transform:uppercase;font-weight:700;color:#4f46e5;letter-spacing:.06em;margin-bottom:6px;">Challenge</div>
            <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:${description ? "10px" : "0"}">${challengeTitle}</div>
            ${description ? `<div style="font-size:14px;color:#374151;line-height:1.6;">${description}</div>` : ""}
          </div>

          <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
            <span style="font-size:20px;">📅</span>
            <div>
              <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">Submission Deadline</div>
              <div style="font-size:15px;font-weight:700;color:#dc2626;">${deadlineFormatted}</div>
            </div>
          </div>

          <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">Log in to <strong style="color:#4f46e5;">Challenge Accepted</strong> to view the challenge and submit your solution.</p>
        </div>`,
    }),
  });
  if (!res.ok) throw new Error(`Email API error: ${res.status}`);
  return res.json();
}

export async function sendEvaluationEmail({ to, name, challengeTitle, grade, points, remark }) {
  const pointsColor = points > 0 ? "#059669" : points < 0 ? "#dc2626" : "#d97706";
  const pointsStr   = points > 0 ? `+${points}` : `${points}`;

  const gradeColors = {
    "Wrong":             { bg: "#fee2e2", text: "#dc2626" },
    "Partially Correct": { bg: "#fef3c7", text: "#d97706" },
    "Almost Correct":    { bg: "#dbeafe", text: "#2563eb" },
    "Correct":           { bg: "#d1fae5", text: "#059669" },
  };
  const gc = gradeColors[grade] || { bg: "#f1f5f9", text: "#374151" };

  const res = await fetch(EMAIL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to,
      subject: `Challenge Accepted — Your result for "${challengeTitle}"`,
      text: `Hi ${name},\n\nYour submission for "${challengeTitle}" has been evaluated.\n\nGrade: ${grade}\nPoints: ${pointsStr}\n${remark ? `\nRemarks:\n${remark}` : ""}\n\nThe challenge is live. Are you?\nChallenge Accepted`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
          <div style="text-align:center;margin-bottom:16px;">
            <div style="display:inline-block;background:#4f46e5;border-radius:50%;width:56px;height:56px;line-height:56px;font-size:24px;color:white;text-align:center;">🎯</div>
          </div>
          <h1 style="color:#4f46e5;margin:0 0 4px;font-size:20px;text-align:center;font-weight:700;">Challenge Accepted</h1>
          <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0 0 24px;font-style:italic;">The challenge is live. Are you?</p>

          <h2 style="color:#111827;margin:0 0 4px;font-size:18px;text-align:center;">Your Submission Has Been Graded</h2>
          <p style="color:#6b7280;text-align:center;margin:0 0 20px;font-size:14px;">Hi <strong style="color:#111827;">${name}</strong>, here are your results for <strong style="color:#111827;">${challengeTitle}</strong>.</p>

          <div style="display:flex;gap:12px;justify-content:center;margin-bottom:20px;flex-wrap:wrap;">
            <div style="padding:14px 28px;border-radius:8px;background:${gc.bg};text-align:center;min-width:120px;">
              <div style="font-size:11px;color:${gc.text};font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Grade</div>
              <div style="font-size:18px;font-weight:700;color:${gc.text};">${grade}</div>
            </div>
            <div style="padding:14px 28px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;min-width:120px;">
              <div style="font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Points</div>
              <div style="font-size:30px;font-weight:700;color:${pointsColor};">${pointsStr}</div>
            </div>
          </div>

          ${remark ? `
          <div style="padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:20px;">
            <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px;">💬 Remarks from evaluator</div>
            <p style="margin:0;font-size:14px;color:#374151;white-space:pre-wrap;">${remark}</p>
          </div>` : ""}

          <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">Every challenge is a chance to grow. Keep it up! 🚀</p>
        </div>`,
    }),
  });
  if (!res.ok) throw new Error(`Email API error: ${res.status}`);
  return res.json();
}
