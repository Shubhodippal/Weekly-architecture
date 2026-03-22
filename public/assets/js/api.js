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

  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    if (data && typeof data === "object") {
      return {
        success: false,
        status: res.status,
        ...data,
      };
    }
    return {
      success: false,
      status: res.status,
      message: raw || `HTTP ${res.status}`,
    };
  }

  if (data && typeof data === "object") return data;
  return { success: true, data: raw };
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

  /** GET /api/leaderboard */
  leaderboard() {
    return apiFetch("/api/leaderboard");
  },

  /** GET /api/admin/users */
  listUsers() {
    return apiFetch("/api/admin/users");
  },

  /** DELETE /api/admin/users/:id */
  deleteUser(id) {
    return apiFetch(`/api/admin/users/${id}`, { method: "DELETE" });
  },

  /** PATCH /api/admin/users/:id/points */
  adjustPoints(id, points, reason) {
    return apiFetch(`/api/admin/users/${id}/points`, {
      method: "PATCH",
      body: JSON.stringify({ points, reason }),
    });
  },

  /** GET /api/admin/grading/settings */
  adminGetGradingSettings() {
    return apiFetch("/api/admin/grading/settings");
  },

  /** PATCH /api/admin/grading/settings */
  adminUpdateGradingSettings(points) {
    return apiFetch("/api/admin/grading/settings", {
      method: "PATCH",
      body: JSON.stringify(points),
    });
  },

  /** POST /api/admin/challenges/auto-post */
  triggerAutoChallenge(payload = {}) {
    return apiFetch("/api/admin/challenges/auto-post", {
      method: "POST",
      body: JSON.stringify(payload),
    });
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

  /** PATCH /api/challenges/:id (multipart) */
  editChallenge(id, formData) {
    return fetch(`/api/challenges/${id}`, {
      method: "PATCH",
      body: formData,
      credentials: "include",
    }).then((r) => r.json());
  },

  /** POST /api/challenges/:id/expire */
  expireChallenge(id) {
    return apiFetch(`/api/challenges/${id}/expire`, { method: "POST" });
  },

  /** POST /api/challenges/:id/reopen */
  reopenChallenge(id, last_date) {
    return apiFetch(`/api/challenges/${id}/reopen`, {
      method: "POST",
      body: JSON.stringify({ last_date }),
    });
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

  /** PATCH /api/submissions/:id/grade (admin) */
  gradeSubmission(submissionId, grade, remark) {
    return apiFetch(`/api/submissions/${submissionId}/grade`, {
      method: "PATCH",
      body: JSON.stringify({ grade, remark }),
    });
  },

  /** GET /api/challenges/:id/comments */
  listChallengeComments(challengeId, sort = "top") {
    const q = sort === "newest" ? "newest" : "top";
    return apiFetch(`/api/challenges/${challengeId}/comments?sort=${q}`);
  },

  /** POST /api/challenges/:id/comments */
  postChallengeComment(challengeId, payload) {
    return apiFetch(`/api/challenges/${challengeId}/comments`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** DELETE /api/comments/:id */
  deleteComment(commentId) {
    return apiFetch(`/api/comments/${commentId}`, { method: "DELETE" });
  },

  /** PATCH /api/comments/:id */
  editComment(commentId, payload) {
    return apiFetch(`/api/comments/${commentId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  /** POST /api/comments/:id/reaction */
  reactComment(commentId, reaction) {
    return apiFetch(`/api/comments/${commentId}/reaction`, {
      method: "POST",
      body: JSON.stringify({ reaction }),
    });
  },

  /** PATCH /api/comments/:id/pin */
  pinComment(commentId, is_pinned) {
    return apiFetch(`/api/comments/${commentId}/pin`, {
      method: "PATCH",
      body: JSON.stringify({ is_pinned }),
    });
  },

  /** POST /api/comments/:id/report */
  reportComment(commentId, reason = "") {
    return apiFetch(`/api/comments/${commentId}/report`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },

  /** PATCH /api/comments/:id/hide */
  hideComment(commentId, is_hidden, reason = "") {
    return apiFetch(`/api/comments/${commentId}/hide`, {
      method: "PATCH",
      body: JSON.stringify({ is_hidden, reason }),
    });
  },

  /** GET /api/admin/comments/reports */
  adminListCommentReports() {
    return apiFetch("/api/admin/comments/reports");
  },

  /** DELETE /api/admin/comments/:id/reports */
  adminClearCommentReports(commentId) {
    return apiFetch(`/api/admin/comments/${commentId}/reports`, { method: "DELETE" });
  },

  // ── Rewards (user) ───────────────────────────────────────────────────────

  /** GET /api/rewards */
  listRewards() {
    return apiFetch("/api/rewards");
  },

  /** POST /api/rewards/:id/claim */
  claimReward(id) {
    return apiFetch(`/api/rewards/${id}/claim`, { method: "POST" });
  },

  /** POST /api/rewards/:id/pass */
  passReward(id) {
    return apiFetch(`/api/rewards/${id}/pass`, { method: "POST" });
  },

  // ── Rewards (admin) ──────────────────────────────────────────────────────

  /** GET /api/admin/rewards/tiers */
  adminListRewardTiers() {
    return apiFetch("/api/admin/rewards/tiers");
  },

  /** PATCH /api/admin/rewards/tiers/:id */
  adminUpdateRewardTier(id, data) {
    return apiFetch(`/api/admin/rewards/tiers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  /** GET /api/admin/rewards/claims?status=claimed|fulfilled|all */
  adminListClaims(status = "claimed") {
    return apiFetch(`/api/admin/rewards/claims?status=${status}`);
  },

  /** PATCH /api/admin/rewards/claims/:id/fulfill */
  adminFulfillClaim(id) {
    return apiFetch(`/api/admin/rewards/claims/${id}/fulfill`, { method: "PATCH" });
  },

  /** PATCH /api/admin/rewards/claims/:id/reject */
  adminRejectClaim(id) {
    return apiFetch(`/api/admin/rewards/claims/${id}/reject`, { method: "PATCH" });
  },

  // ── AI assistance ───────────────────────────────────────────────────────

  /** GET /api/points/finance */
  getPointsFinanceOverview() {
    return apiFetch("/api/points/finance");
  },

  /** POST /api/points/finance/open */
  openPointsFinance(payload) {
    return apiFetch("/api/points/finance/open", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** POST /api/points/finance/:id/close */
  closePointsFinance(id) {
    return apiFetch(`/api/points/finance/${id}/close`, { method: "POST" });
  },

  /** GET /api/banking/overview */
  getBankingOverview() {
    return apiFetch("/api/banking/overview");
  },

  /** POST /api/banking/credit-card/apply */
  applyCreditCard() {
    return apiFetch("/api/banking/credit-card/apply", { method: "POST" });
  },

  /** POST /api/banking/debit/spend */
  bankingDebitSpend(amount, note = "") {
    return apiFetch("/api/banking/debit/spend", {
      method: "POST",
      body: JSON.stringify({ amount, note }),
    });
  },

  /** POST /api/banking/credit/spend */
  bankingCreditSpend(amount, note = "") {
    return apiFetch("/api/banking/credit/spend", {
      method: "POST",
      body: JSON.stringify({ amount, note }),
    });
  },

  /** POST /api/banking/credit/pay */
  bankingCreditPay(amount) {
    return apiFetch("/api/banking/credit/pay", {
      method: "POST",
      body: JSON.stringify({ amount }),
    });
  },

  /** POST /api/banking/investments/fd */
  openFdInvestment(payload) {
    return apiFetch("/api/banking/investments/fd", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** POST /api/banking/investments/rd */
  openRdInvestment(payload) {
    return apiFetch("/api/banking/investments/rd", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** POST /api/banking/investments/:id/close */
  closeBankingInvestment(id) {
    return apiFetch(`/api/banking/investments/${id}/close`, { method: "POST" });
  },

  /** POST /api/ai/hints */
  getHints(challengeId, revealLevel = null) {
    return apiFetch("/api/ai/hints", {
      method: "POST",
      body: JSON.stringify({
        challengeId,
        ...(revealLevel ? { revealLevel } : {}),
      }),
    });
  },
};
