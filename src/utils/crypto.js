/** SHA-256 hex digest */
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Cryptographically random 6-digit OTP */
export function generateOTP() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 900000 + 100000);
}

/** Cryptographically random session ID (UUID v4) */
export function generateSessionId() {
  return crypto.randomUUID();
}
