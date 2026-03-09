/* Challenges page — read-only for users, shows "Post Challenge" btn for admin */

// Extend the API client with challenge endpoints
api.listChallenges = () => apiFetch("/api/challenges");
api.downloadChallenge = (id) => `/api/challenges/${id}/download`; // returns URL string
api.deleteChallenge = (id) =>
  apiFetch(`/api/challenges/${id}`, { method: "DELETE" });

let allChallenges = [];
let currentRole   = "user";

function fmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return new Date(+y, +m - 1, +day).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
}

function daysLeft(dateStr) {
  const diff = Math.ceil(
    (new Date(dateStr) - new Date(new Date().toISOString().slice(0, 10))) /
      86400000
  );
  if (diff < 0) return null;
  if (diff === 0) return "Due today";
  return `${diff} day${diff === 1 ? "" : "s"} left`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCards(list) {
  const grid = document.getElementById("cards-grid");

  if (!list.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-state__icon">📋</div>
        <div>No challenges found.</div>
      </div>`;
    return;
  }

  grid.innerHTML = list
    .map((c) => {
      const expired = c.is_expired;
      const dl      = daysLeft(c.last_date);
      const tag     = expired
        ? `<span class="badge" style="background:#fee2e2;color:#991b1b;">Expired</span>`
        : `<span class="badge" style="background:#dcfce7;color:#166534;">Active</span>`;

      return `
        <div class="challenge-card ${expired ? "expired" : ""}" data-id="${c.id}">
          <div class="challenge-card__header">
            ${tag}
            ${!expired && dl ? `<span style="font-size:12px;color:#059669;font-weight:600;">${escHtml(dl)}</span>` : ""}
            ${currentRole === "admin" ? `
              <button class="btn btn-danger btn-sm del-btn" data-id="${c.id}" style="margin-left:auto;">
                Delete
              </button>` : ""}
          </div>
          <div class="challenge-card__title">${escHtml(c.title)}</div>
          ${c.description ? `<div class="challenge-card__desc">${escHtml(c.description)}</div>` : ""}
          <div class="challenge-card__meta">
            <span>📅 Deadline: <strong>${fmtDate(c.last_date)}</strong></span>
            <span style="color:#9ca3af;">·</span>
            <span>🗓 Posted: ${fmtDate(c.created_at?.slice(0, 10))}</span>
            <span style="color:#9ca3af;">·</span>
            <span>👤 ${escHtml(c.posted_by_name)}</span>
          </div>
          <div style="margin-top:14px;">
            <a
              href="/api/challenges/${c.id}/download"
              class="btn btn-outline btn-sm"
              download="${escHtml(c.pdf_name)}"
            >
              ⬇ Download PDF
            </a>
          </div>
        </div>`;
    })
    .join("");

  // Delete buttons (admin only)
  grid.querySelectorAll(".del-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!confirm("Delete this challenge? The PDF will also be removed.")) return;
      btn.disabled = true;
      btn.textContent = "Deleting…";
      const res = await api.deleteChallenge(btn.dataset.id).catch(() => null);
      if (!res?.success) {
        alert(res?.message || "Failed to delete.");
        btn.disabled = false;
        btn.textContent = "Delete";
        return;
      }
      allChallenges = allChallenges.filter((c) => String(c.id) !== btn.dataset.id);
      applyFilter(document.querySelector(".filter-btn.active")?.dataset.filter || "all");
    });
  });
}

function applyFilter(filter) {
  if (filter === "active")  renderCards(allChallenges.filter((c) => !c.is_expired));
  else if (filter === "expired") renderCards(allChallenges.filter((c) => c.is_expired));
  else renderCards(allChallenges);
}

// Filter buttons
document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach((b) => {
      b.className = "btn btn-ghost btn-sm filter-btn";
    });
    btn.className = "btn btn-outline btn-sm filter-btn active";
    applyFilter(btn.dataset.filter);
  });
});

// Logout
document.getElementById("logout-btn").addEventListener("click", async () => {
  await api.logout();
  window.location.href = "/index.html";
});

// ── Bootstrap ─────────────────────────────────────────────────────────────
(async () => {
  const me = await api.me().catch(() => null);
  if (!me || !me.success) {
    window.location.href = "/index.html";
    return;
  }

  currentRole = me.user.role;
  document.getElementById("topbar-name").textContent = me.user.name;

  if (currentRole === "admin") {
    document.getElementById("post-btn").style.display = "inline-flex";
  }

  document.getElementById("skeleton").style.display = "none";
  document.getElementById("content").style.display  = "block";

  const res = await api.listChallenges().catch(() => null);
  if (!res?.success) {
    document.getElementById("cards-grid").innerHTML =
      '<div class="empty-state"><div class="empty-state__icon">⚠️</div>Failed to load challenges.</div>';
    return;
  }

  allChallenges = res.challenges;
  renderCards(allChallenges);
})();
