/**
 * API client — sends cookies automatically (credentials: 'include').
 * All responses are returned as plain objects.
 */
async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "include",
  });
  return res.json();
}

const api = {
  /** POST /api/auth/request-otp */
  requestOtp(email, name) {
    return apiFetch("/api/auth/request-otp", {
      method: "POST",
      body: JSON.stringify({ email, name }),
    });
  },

  /** POST /api/auth/verify-otp */
  verifyOtp(email, otp) {
    return apiFetch("/api/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, otp }),
    });
  },

  /** POST /api/auth/logout */
  logout() {
    return apiFetch("/api/auth/logout", { method: "POST" });
  },

  /** GET /api/user/me */
  me() {
    return apiFetch("/api/user/me");
  },

  /** GET /api/admin/users */
  listUsers() {
    return apiFetch("/api/admin/users");
  },

  /** DELETE /api/admin/users/:id */
  deleteUser(id) {
    return apiFetch(`/api/admin/users/${id}`, { method: "DELETE" });
  },
};
