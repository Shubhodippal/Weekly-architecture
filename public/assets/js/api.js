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

  /** POST /api/challenges (multipart) */
  postChallenge(formData) {
    return fetch("/api/challenges", { method: "POST", body: formData, credentials: "include" }).then(r => r.json());
  },

  /** GET /api/challenges */
  listChallenges() {
    return apiFetch("/api/challenges");
  },

  /** DELETE /api/challenges/:id */
  deleteChallenge(id) {
    return apiFetch(`/api/challenges/${id}`, { method: "DELETE" });
  },

  /** PATCH /api/challenges/:id */
  editChallenge(id, body) {
    return apiFetch(`/api/challenges/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  },

  /** POST /api/challenges/:id/submit (multipart) */
  submitSolution(challengeId, formData) {
    return fetch(`/api/challenges/${challengeId}/submit`, {
      method: "POST",
      body: formData,
      credentials: "include",
    }).then(r => r.json());
  },

  /** GET /api/challenges/:id/my-submission */
  getMySubmission(challengeId) {
    return apiFetch(`/api/challenges/${challengeId}/my-submission`);
  },

  /** DELETE /api/challenges/:id/my-submission */
  deleteMySubmission(challengeId) {
    return apiFetch(`/api/challenges/${challengeId}/my-submission`, { method: "DELETE" });
  },

  /** GET /api/challenges/:id/submissions (admin) */
  listSubmissions(challengeId) {
    return apiFetch(`/api/challenges/${challengeId}/submissions`);
  },
};
