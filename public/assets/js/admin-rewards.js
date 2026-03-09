/* ── Admin Rewards Management ───────────────────────────────────────────── */

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Claims ────────────────────────────────────────────────────────────────
async function loadClaims(status = "claimed") {
  const res = await api.adminListClaims(status).catch(() => null);
  const body = document.getElementById("claims-body");

  if (!res?.success) {
    body.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#dc2626;padding:24px;">Failed to load claims</td></tr>`;
    return;
  }

  const claims = res.claims;
  document.getElementById("stat-pending").textContent = claims.filter(c => c.status === "claimed").length;

  if (!claims.length) {
    body.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#6b7280;padding:32px;">No pending claims 🎉</td></tr>`;
    return;
  }

  body.innerHTML = claims.map((c) => `
    <tr>
      <td>
        <div style="font-weight:600;">${esc(c.user_name)}</div>
        <div style="font-size:12px;color:#6b7280;">${esc(c.user_email)}</div>
      </td>
      <td>
        <span style="font-size:20px;">${esc(c.reward_icon)}</span>
        <span style="margin-left:8px;font-weight:600;">${esc(c.reward_title)}</span>
        <div style="font-size:12px;color:#dc2626;font-weight:600;margin-top:2px;">−${c.points_required} pts will be deducted</div>
      </td>
      <td style="font-size:13px;color:#6b7280;">${fmtDate(c.claimed_at)}</td>
      <td style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm fulfill-btn" data-id="${c.id}" onclick="fulfillClaim(${c.id}, this)">
          ✅ Fulfill &amp; Deduct ${c.points_required} pts
        </button>
        <button class="btn btn-danger btn-sm reject-btn" data-id="${c.id}" onclick="rejectClaim(${c.id}, this)">
          ❌ Reject
        </button>
      </td>
    </tr>
  `).join("");
}

async function fulfillClaim(id, btn) {
  if (!confirm("Mark this reward as fulfilled? This confirms you've given the reward IRL.")) return;
  btn.disabled    = true;
  btn.textContent = "Fulfilling…";

  const alertEl = document.getElementById("claims-alert");
  const res = await api.adminFulfillClaim(id).catch(() => null);

  if (res?.success) {
    alertEl.textContent = "Reward marked as fulfilled! ✅";
    alertEl.className   = "alert alert-success show";
    alertEl.style.display = "block";
    setTimeout(() => { alertEl.style.display = "none"; }, 3000);
    await loadClaims("claimed");
    await loadStats();
  } else {
    btn.disabled    = false;
    btn.textContent = "✅ Mark Fulfilled";
    alert(res?.message || "Failed to fulfil claim.");
  }
}

async function rejectClaim(id, btn) {
  if (!confirm("Reject this claim? The reward will go back to 'unlocked' so the user can re-claim later.")) return;
  btn.disabled    = true;
  btn.textContent = "Rejecting…";

  const alertEl = document.getElementById("claims-alert");
  const res = await api.adminRejectClaim(id).catch(() => null);

  if (res?.success) {
    alertEl.textContent = "Claim rejected — reward reset to unlocked. ❌";
    alertEl.className   = "alert alert-success show";
    alertEl.style.display = "block";
    setTimeout(() => { alertEl.style.display = "none"; }, 3000);
    await loadClaims("claimed");
    await loadStats();
  } else {
    btn.disabled    = false;
    btn.textContent = "❌ Reject";
    alert(res?.message || "Failed to reject claim.");
  }
}

// ── Fulfilled history toggle ──────────────────────────────────────────────
let fulfilledLoaded = false;

async function toggleFulfilled() {
  const section = document.getElementById("fulfilled-section");
  const btn     = document.getElementById("toggle-fulfilled-btn");
  const visible = section.style.display !== "none";

  if (visible) {
    section.style.display = "none";
    btn.textContent = "Show";
    return;
  }

  section.style.display = "block";
  btn.textContent = "Hide";

  if (fulfilledLoaded) return;
  fulfilledLoaded = true;

  const res = await api.adminListClaims("fulfilled").catch(() => null);
  const body = document.getElementById("fulfilled-body");

  if (!res?.success || !res.claims.length) {
    body.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#6b7280;padding:24px;">No fulfilled claims yet</td></tr>`;
    return;
  }

  body.innerHTML = res.claims.map((c) => `
    <tr>
      <td><div style="font-weight:600;">${esc(c.user_name)}</div><div style="font-size:12px;color:#6b7280;">${esc(c.user_email)}</div></td>
      <td><span style="font-size:18px;">${esc(c.reward_icon)}</span> <span style="font-weight:600;">${esc(c.reward_title)}</span></td>
      <td style="font-size:13px;color:#6b7280;">${fmtDate(c.claimed_at)}</td>
      <td style="font-size:13px;color:#059669;">${fmtDate(c.fulfilled_at)}</td>
      <td style="font-size:13px;font-weight:700;color:#dc2626;">−${c.points_consumed ?? c.points_required} pts</td>
    </tr>
  `).join("");
}

window.toggleFulfilled = toggleFulfilled;

// ── Tiers ─────────────────────────────────────────────────────────────────
let allTiers = [];

async function loadTiers() {
  const res = await api.adminListRewardTiers().catch(() => null);
  const body = document.getElementById("tiers-body");

  if (!res?.success) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#dc2626;padding:24px;">Failed to load tiers</td></tr>`;
    return;
  }

  allTiers = res.tiers;
  document.getElementById("stat-tiers").textContent = allTiers.filter(t => t.active).length;

  if (!allTiers.length) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#6b7280;padding:24px;">No reward tiers defined</td></tr>`;
    return;
  }

  body.innerHTML = allTiers.map((t) => `
    <tr style="${!t.active ? 'opacity:0.5;' : ''}">
      <td style="font-size:26px;text-align:center;">${esc(t.icon)}</td>
      <td style="font-weight:600;">${esc(t.title)}</td>
      <td style="font-size:13px;color:#6b7280;max-width:220px;">${esc(t.description || "—")}</td>
      <td>
        <span style="font-weight:700;color:#7c3aed;">${t.points_required}</span>
        <span style="font-size:12px;color:#94a3b8;"> pts</span>
      </td>
      <td>
        ${t.active
          ? `<span style="color:#059669;font-size:12px;font-weight:600;">● Active</span>`
          : `<span style="color:#94a3b8;font-size:12px;font-weight:600;">○ Inactive</span>`}
      </td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openEditTier(${t.id})">✏️ Edit</button>
      </td>
    </tr>
  `).join("");
}

// ── Stats ─────────────────────────────────────────────────────────────────
async function loadStats() {
  const res = await api.adminListClaims("fulfilled").catch(() => null);
  document.getElementById("stat-fulfilled").textContent = res?.claims?.length ?? "—";
}

// ── Edit Tier Modal ───────────────────────────────────────────────────────
function openEditTier(id) {
  const tier = allTiers.find((t) => t.id === id);
  if (!tier) return;

  document.getElementById("edit-tier-id").value  = tier.id;
  document.getElementById("et-icon").value        = tier.icon || "";
  document.getElementById("et-title").value       = tier.title || "";
  document.getElementById("et-desc").value        = tier.description || "";
  document.getElementById("et-pts").value         = tier.points_required || "";
  document.getElementById("et-active").checked   = !!tier.active;

  const alertEl = document.getElementById("edit-tier-alert");
  alertEl.className   = "alert";
  alertEl.textContent = "";

  document.getElementById("edit-tier-overlay").style.display = "flex";
  document.body.style.overflow = "hidden";
  document.getElementById("et-title").focus();
}

function closeEditTier(force) {
  if (force === true || (force instanceof Event && force.target === document.getElementById("edit-tier-overlay"))) {
    document.getElementById("edit-tier-overlay").style.display = "none";
    document.body.style.overflow = "";
  }
}

async function saveTier() {
  const alertEl = document.getElementById("edit-tier-alert");
  alertEl.className   = "alert";
  alertEl.textContent = "";

  const id    = parseInt(document.getElementById("edit-tier-id").value, 10);
  const icon  = document.getElementById("et-icon").value.trim();
  const title = document.getElementById("et-title").value.trim();
  const desc  = document.getElementById("et-desc").value.trim();
  const pts   = parseInt(document.getElementById("et-pts").value, 10);
  const active = document.getElementById("et-active").checked;

  if (!title) { alertEl.className = "alert alert-error show"; alertEl.textContent = "Title is required."; return; }
  if (!icon)  { alertEl.className = "alert alert-error show"; alertEl.textContent = "Icon is required."; return; }
  if (!pts || pts < 1) { alertEl.className = "alert alert-error show"; alertEl.textContent = "Points must be at least 1."; return; }

  const btn = document.getElementById("save-tier-btn");
  btn.disabled    = true;
  btn.textContent = "Saving…";

  const res = await api.adminUpdateRewardTier(id, { icon, title, description: desc, points_required: pts, active }).catch(() => null);

  btn.disabled    = false;
  btn.textContent = "Save Changes";

  if (!res?.success) {
    alertEl.className   = "alert alert-error show";
    alertEl.textContent = res?.message || "Failed to save.";
    return;
  }

  closeEditTier(true);
  await loadTiers();
}

window.openEditTier  = openEditTier;
window.closeEditTier = closeEditTier;
window.saveTier      = saveTier;
window.fulfillClaim  = fulfillClaim;
window.rejectClaim   = rejectClaim;
window.loadClaims    = loadClaims;

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeEditTier(true);
});

// ── Bootstrap ─────────────────────────────────────────────────────────────
(async () => {
  const me = await api.me().catch(() => null);
  if (!me?.success || me.user.role !== "admin") {
    window.location.href = "/index.html";
    return;
  }

  document.getElementById("topbar-name").textContent = me.user.name;

  await Promise.all([loadTiers(), loadClaims("claimed"), loadStats()]);

  document.getElementById("skeleton").style.display = "none";
  document.getElementById("content").style.display  = "block";

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await api.logout();
    window.location.href = "/index.html";
  });
})();
