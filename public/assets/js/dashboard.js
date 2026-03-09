/* ── Unified home dashboard (challenges feed + admin modal) ─────────────── */

// ── Globals ───────────────────────────────────────────────────────────────
let allChallenges = [];
let currentUser   = null;

// ── Helpers ───────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return "Never";
  const s = d.length > 10 ? d : d + "T00:00:00";
  return new Date(s).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
}

function daysLeft(dateStr) {
  const today = new Date(new Date().toISOString().slice(0, 10));
  const due   = new Date(dateStr);
  const diff  = Math.ceil((due - today) / 86400000);
  if (diff < 0)  return null;
  if (diff === 0) return "Due today";
  return `${diff}d left`;
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function showFeedAlert(msg) {
  document.getElementById("feed-list").innerHTML =
    `<div class="feed-empty"><div style="font-size:32px;">⚠️</div>${esc(msg)}</div>`;
}

// ── Feed rendering ────────────────────────────────────────────────────────
function renderFeed(list) {
  const el = document.getElementById("feed-list");

  if (!list.length) {
    el.innerHTML = `
      <div class="feed-empty">
        <div style="font-size:40px;">📋</div>
        <div>No challenges here yet.</div>
        ${currentUser.role === "admin" ? `<button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="openPostModal()">Post the first one</button>` : ""}
      </div>`;
    return;
  }

  el.innerHTML = list.map((c) => {
    const expired = c.is_expired;
    const dl      = daysLeft(c.last_date);
    const isAdmin = currentUser.role === "admin";

    return `
    <article class="feed-card ${expired ? "feed-card--expired" : ""}">
      <div class="feed-card__toprow">
        <div class="feed-card__meta-left">
          <div class="feed-avatar">${esc(c.posted_by_name.charAt(0).toUpperCase())}</div>
          <div>
            <div class="feed-card__poster">${esc(c.posted_by_name)}</div>
            <div class="feed-card__posted-at">${fmtDate(c.created_at)}</div>
          </div>
        </div>
        <div class="feed-card__badges">
          ${expired
            ? `<span class="pill pill--red">Expired</span>`
            : `<span class="pill pill--green">Active</span>
               ${dl ? `<span class="pill pill--blue">${esc(dl)}</span>` : ""}`
          }
        </div>
      </div>

      <div class="feed-card__title">${esc(c.title)}</div>
      ${c.description ? `<div class="feed-card__desc">${esc(c.description)}</div>` : ""}

      <div class="feed-card__deadline">
        📅 Deadline: <strong>${fmtDate(c.last_date)}</strong>
      </div>

      <div class="feed-card__actions">
        <button class="btn btn-primary btn-sm toggle-pdf-btn" data-id="${c.id}">
          📄 View PDF
        </button>
        <a href="/api/challenges/${c.id}/download"
           class="btn btn-outline btn-sm"
           download="${esc(c.pdf_name)}">
          ⬇ Download
        </a>
        ${!isAdmin
          ? (expired
              ? `<button class="btn btn-ghost btn-sm" disabled>🔒 Closed</button>`
              : `<button class="btn btn-primary btn-sm submit-btn" data-id="${c.id}">✍️ Enter Solution</button>`)
          : `<button class="btn btn-outline btn-sm view-submissions-btn" data-id="${c.id}">👁 View Submissions</button>
             <button class="btn btn-outline btn-sm edit-btn" data-id="${c.id}">✏️ Edit</button>
             <button class="btn btn-danger btn-sm del-btn" data-id="${c.id}">Delete</button>`
        }
      </div>

      <div class="pdf-inline-viewer" id="pdf-viewer-${c.id}" style="display:none;">
        <iframe
          src="/api/challenges/${c.id}/download?inline=1"
          class="pdf-iframe"
          title="${esc(c.title)}"
          loading="lazy"
        ></iframe>
      </div>
    </article>`;
  }).join("");

  // Delete handlers
  el.querySelectorAll(".toggle-pdf-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const viewer = document.getElementById(`pdf-viewer-${btn.dataset.id}`);
      const open   = viewer.style.display === "none";
      viewer.style.display = open ? "block" : "none";
      btn.textContent = open ? "✖ Close PDF" : "📄 View PDF";
    });
  });

  el.querySelectorAll(".del-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this challenge and its PDF?")) return;
      btn.disabled = true; btn.textContent = "…";
      const res = await api.deleteChallenge(btn.dataset.id).catch(() => null);
      if (res?.success) {
        allChallenges = allChallenges.filter((c) => String(c.id) !== btn.dataset.id);
        applyFilter();
        refreshStats();
      } else {
        alert(res?.message || "Failed to delete."); btn.disabled = false; btn.textContent = "Delete";
      }
    });
  });

  el.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = allChallenges.find((x) => String(x.id) === btn.dataset.id);
      if (c) openEditModal(c);
    });
  });

  el.querySelectorAll(".submit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openSubmitModal(btn.dataset.id));
  });

  el.querySelectorAll(".view-submissions-btn").forEach((btn) => {
    btn.addEventListener("click", () => openViewSubmissionsModal(btn.dataset.id));
  });
}

function refreshStats() {
  const active  = allChallenges.filter((c) => !c.is_expired).length;
  const expired = allChallenges.filter((c) => c.is_expired).length;
  document.getElementById("stat-total").textContent   = allChallenges.length;
  document.getElementById("stat-active").textContent  = active;
  document.getElementById("stat-expired").textContent = expired;
}

let activeFilter = "all";
function applyFilter() {
  if (activeFilter === "active")  renderFeed(allChallenges.filter((c) => !c.is_expired));
  else if (activeFilter === "expired") renderFeed(allChallenges.filter((c) => c.is_expired));
  else renderFeed(allChallenges);
}

document.querySelectorAll(".filter-pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-pill").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    applyFilter();
  });
});

// ── Logout ────────────────────────────────────────────────────────────────
document.getElementById("logout-btn").addEventListener("click", async () => {
  await api.logout();
  window.location.href = "/index.html";
});

// ── Topbar / header post button ───────────────────────────────────────────
const headerPostBtn = document.getElementById("btn-post-challenge");
if (headerPostBtn) headerPostBtn.addEventListener("click", openPostModal);

// ══════════════════════════════════════════════════════════════════════════
// Post Challenge Modal
// ══════════════════════════════════════════════════════════════════════════

function openPostModal() {
  document.getElementById("modal-overlay").style.display = "flex";
  document.body.style.overflow = "hidden";
  document.getElementById("c-title").focus();
  // Reset
  document.getElementById("modal-alert").className   = "alert";
  document.getElementById("modal-success").style.display = "none";
}

function closePostModal(force) {
  if (force === true || (force && force.target === document.getElementById("modal-overlay"))) {
    document.getElementById("modal-overlay").style.display = "none";
    document.body.style.overflow = "";
  }
}

// Expose globally for inline onclick
window.openPostModal  = openPostModal;
window.closePostModal = closePostModal;

// ══════════════════════════════════════════════════════════════════════════
// Edit Challenge Modal
// ══════════════════════════════════════════════════════════════════════════
let editingChallengeId = null;

function openEditModal(challenge) {
  editingChallengeId = challenge.id;
  document.getElementById("e-title").value = challenge.title || "";
  document.getElementById("e-desc").value  = challenge.description || "";
  document.getElementById("e-date").value  = challenge.last_date || "";
  document.getElementById("edit-modal-alert").className   = "alert";
  document.getElementById("edit-modal-alert").textContent = "";
  document.getElementById("edit-modal-overlay").style.display = "flex";
  document.body.style.overflow = "hidden";
  document.getElementById("e-title").focus();
}

function closeEditModal(force) {
  if (force === true || (force && force.target === document.getElementById("edit-modal-overlay"))) {
    document.getElementById("edit-modal-overlay").style.display = "none";
    document.body.style.overflow = "";
    editingChallengeId = null;
  }
}

window.openEditModal  = openEditModal;
window.closeEditModal = closeEditModal;

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closePostModal(true);
    closeEditModal(true);
    closeSubmitModal(true);
    closeViewSubmissionsModal(true);
  }
});

document.getElementById("edit-challenge-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const alertEl = document.getElementById("edit-modal-alert");
  alertEl.className = "alert"; alertEl.textContent = "";

  const title   = document.getElementById("e-title").value.trim();
  const desc    = document.getElementById("e-desc").value.trim();
  const date    = document.getElementById("e-date").value;

  if (!title) { alertEl.className = "alert alert-error show"; alertEl.textContent = "Title is required."; return; }
  if (!date)  { alertEl.className = "alert alert-error show"; alertEl.textContent = "Deadline is required."; return; }

  const btn = document.getElementById("edit-submit-btn");
  btn.disabled = true; btn.textContent = "Saving…";

  const res = await api.editChallenge(editingChallengeId, {
    title, description: desc, last_date: date,
  }).catch(() => null);

  btn.disabled = false; btn.textContent = "Save Changes";

  if (!res?.success) {
    alertEl.className = "alert alert-error show";
    alertEl.textContent = res?.message || "Failed to update.";
    return;
  }

  // Patch in-memory array and re-render
  const idx = allChallenges.findIndex((c) => String(c.id) === String(editingChallengeId));
  if (idx !== -1) {
    const now = new Date().toISOString().slice(0, 10);
    allChallenges[idx] = { ...allChallenges[idx], ...res.challenge, is_expired: res.challenge.last_date < now };
  }
  closeEditModal(true);
  applyFilter();
  refreshStats();
});

// ── Drag & drop PDF input ─────────────────────────────────────────────────
const dropZone  = document.getElementById("drop-zone");
const pdfInput  = document.getElementById("c-pdf");
const dropLabel = document.getElementById("drop-label");

function setFile(file) {
  if (!file || file.type !== "application/pdf") {
    modalAlert("Only PDF files are accepted.", "error"); return;
  }
  pdfInput._file = file;
  dropLabel.textContent  = `✅ ${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
  dropZone.classList.add("drop-zone--selected");
}

dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drop-zone--hover"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drop-zone--hover"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault(); dropZone.classList.remove("drop-zone--hover");
  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
});
pdfInput.addEventListener("change", () => { if (pdfInput.files[0]) setFile(pdfInput.files[0]); });

// ── Modal form helpers ────────────────────────────────────────────────────
function modalAlert(msg, type = "error") {
  const el = document.getElementById("modal-alert");
  el.textContent = msg;
  el.className   = `alert alert-${type} show`;
}
function clearModalAlert() {
  document.getElementById("modal-alert").className = "alert";
}

// ── Modal form submit ─────────────────────────────────────────────────────
document.getElementById("challenge-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearModalAlert();
  document.getElementById("modal-success").style.display = "none";

  const title = document.getElementById("c-title").value.trim();
  const desc  = document.getElementById("c-desc").value.trim();
  const date  = document.getElementById("c-date").value;
  const file  = pdfInput._file || pdfInput.files[0];

  if (!title) return modalAlert("Title is required.");
  if (!date)  return modalAlert("Deadline is required.");
  if (!file)  return modalAlert("Please attach a PDF file.");

  const fd = new FormData();
  fd.append("title", title);
  fd.append("description", desc);
  fd.append("last_date", date);
  fd.append("pdf", file, file.name);

  const btn     = document.getElementById("submit-btn");
  const spinner = document.getElementById("submit-spinner");
  const pwrap   = document.getElementById("progress-wrap");
  const pbar    = document.getElementById("progress-bar");

  btn.disabled = true; spinner.style.display = "inline-block"; pwrap.style.display = "block";

  let pct = 0;
  const tick = setInterval(() => { pct = Math.min(pct + Math.random() * 18, 88); pbar.style.width = pct + "%"; }, 250);

  const res = await api.postChallenge(fd).catch(() => null);

  clearInterval(tick); pbar.style.width = "100%";
  setTimeout(() => { pwrap.style.display = "none"; pbar.style.width = "0%"; }, 700);
  btn.disabled = false; spinner.style.display = "none";

  if (!res?.success) { modalAlert(res?.message || "Failed to post."); return; }

  // Success
  const successEl = document.getElementById("modal-success");
  successEl.textContent = `✅ "${res.challenge.title}" posted!`;
  successEl.style.display = "block";
  successEl.className = "alert alert-success show";

  // Reset form
  document.getElementById("challenge-form").reset();
  pdfInput._file = null;
  dropLabel.textContent = "Click or drag & drop PDF here";
  dropZone.classList.remove("drop-zone--selected");

  // Reload challenges and close modal after brief pause
  await loadChallenges();
  setTimeout(() => closePostModal(true), 1400);
});

// ── Load challenges ───────────────────────────────────────────────────────
async function loadChallenges() {
  const res = await api.listChallenges().catch(() => null);
  if (!res?.success) { showFeedAlert("Failed to load challenges."); return; }
  allChallenges = res.challenges;
  applyFilter();
  refreshStats();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────
(async () => {
  const me = await api.me().catch(() => null);
  if (!me?.success) { window.location.href = "/index.html"; return; }

  currentUser = me.user;
  const { name, email, role, last_login, created_at } = me.user;

  // Topbar
  document.getElementById("topbar-name").textContent = name;
  if (role === "admin") {
    const badge = document.getElementById("topbar-role-badge");
    badge.textContent = "⭐ Admin";
    badge.style.display = "inline-flex";
    document.getElementById("btn-post-challenge").style.display = "inline-flex";
    document.getElementById("btn-manage-users").style.display  = "inline-flex";
    document.getElementById("admin-sidebar-links").style.display = "block";
  }

  // Left sidebar profile
  document.getElementById("avatar").textContent    = name.charAt(0).toUpperCase();
  document.getElementById("user-name").textContent  = name;
  document.getElementById("user-email").textContent = email;
  const roleBadge = document.getElementById("user-role-badge");
  roleBadge.textContent = role === "admin" ? "⭐ Admin" : "👤 User";
  roleBadge.className   = `badge badge-${role}`;
  document.getElementById("user-last-login").textContent = fmtDate(last_login);
  document.getElementById("user-joined").textContent     = fmtDate(created_at);

  // Set min date for new challenges
  document.getElementById("c-date").min = new Date().toISOString().slice(0, 10);

  // Show layout
  document.getElementById("skeleton").style.display = "none";
  document.getElementById("content").style.display  = "flex";

  await loadChallenges();
})();

// ══════════════════════════════════════════════════════════════════════════
// Submit Solution Modal
// ══════════════════════════════════════════════════════════════════════════
let submitChallengeId = null;
let existingSubmissionId = null;
let removeExistingFile = false;

function solAlert(msg, type = "error") {
  const el = document.getElementById("submit-modal-alert");
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
}
function clearSolAlert() {
  const el = document.getElementById("submit-modal-alert");
  el.textContent = "";
  el.className = "alert";
}

async function openSubmitModal(challengeId) {
  submitChallengeId  = challengeId;
  existingSubmissionId = null;
  removeExistingFile = false;
  document.getElementById("submit-challenge-id").value = challengeId;
  document.getElementById("sol-text").value = "";
  document.getElementById("sol-file").value = "";
  document.getElementById("sol-drop-content").style.display = "";
  document.getElementById("sol-file-preview").style.display = "none";
  document.getElementById("sol-file-preview").textContent = "";
  document.getElementById("sol-current-file").style.display = "none";
  document.getElementById("sol-current-file-name").textContent = "";
  document.getElementById("sol-delete-btn").style.display = "none";
  clearSolAlert();

  document.getElementById("submit-modal-overlay").style.display = "flex";
  document.body.style.overflow = "hidden";

  // Load existing submission
  const res = await api.getMySubmission(challengeId).catch(() => null);
  if (res?.submission) {
    existingSubmissionId = res.submission.id;
    document.getElementById("sol-text").value = res.submission.solution_text || "";
    if (res.submission.has_file && res.submission.file_name) {
      document.getElementById("sol-current-file-name").textContent = `📎 ${res.submission.file_name}`;
      document.getElementById("sol-current-file").style.display = "flex";
    }
    document.getElementById("sol-delete-btn").style.display = "inline-flex";
  }

  document.getElementById("sol-text").focus();
}

function closeSubmitModal(force) {
  if (force === true || (force && force.target === document.getElementById("submit-modal-overlay"))) {
    document.getElementById("submit-modal-overlay").style.display = "none";
    document.body.style.overflow = "";
    submitChallengeId = null;
  }
}

function clearSubmissionFile() {
  removeExistingFile = true;
  document.getElementById("sol-current-file").style.display = "none";
  document.getElementById("sol-current-file-name").textContent = "";
}

window.closeSubmitModal   = closeSubmitModal;
window.clearSubmissionFile = clearSubmissionFile;

// File drag & drop for submission
const solDropZone = document.getElementById("sol-drop-zone");
const solFileInput = document.getElementById("sol-file");
const solDropContent = document.getElementById("sol-drop-content");
const solFilePreview = document.getElementById("sol-file-preview");

solDropZone.addEventListener("dragover", (e) => { e.preventDefault(); solDropZone.classList.add("drop-zone--hover"); });
solDropZone.addEventListener("dragleave", () => solDropZone.classList.remove("drop-zone--hover"));
solDropZone.addEventListener("drop", (e) => {
  e.preventDefault(); solDropZone.classList.remove("drop-zone--hover");
  const file = e.dataTransfer.files[0];
  if (file) showSolFilePreview(file);
});
solFileInput.addEventListener("change", () => {
  if (solFileInput.files[0]) showSolFilePreview(solFileInput.files[0]);
});

function showSolFilePreview(file) {
  solDropContent.style.display = "none";
  solFilePreview.style.display = "";
  solFilePreview.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
}

// Submit form handler
document.getElementById("submit-solution-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearSolAlert();

  const text = document.getElementById("sol-text").value.trim();
  const file = solFileInput.files[0];

  if (!text && !file && !existingSubmissionId) {
    solAlert("Please write a solution or attach a file."); return;
  }

  const fd = new FormData();
  fd.append("solution_text", text);
  if (file) fd.append("file", file, file.name);
  if (removeExistingFile) fd.append("remove_file", "1");

  const btn = document.getElementById("sol-submit-btn");
  btn.disabled = true; btn.textContent = "Saving…";

  const res = await api.submitSolution(submitChallengeId, fd).catch(() => null);

  btn.disabled = false; btn.textContent = "💾 Save Solution";

  if (!res?.success) {
    solAlert(res?.message || "Failed to save submission."); return;
  }

  closeSubmitModal(true);
});

// Delete submission handler
async function deleteMySubmission() {
  if (!confirm("Are you sure you want to delete your submission?")) return;
  const btn = document.getElementById("sol-delete-btn");
  btn.disabled = true; btn.textContent = "Deleting…";

  const res = await api.deleteMySubmission(submitChallengeId).catch(() => null);

  btn.disabled = false; btn.textContent = "🗑 Delete Submission";

  if (!res?.success) {
    solAlert(res?.message || "Failed to delete submission."); return;
  }

  closeSubmitModal(true);
}

window.deleteMySubmission = deleteMySubmission;

// ══════════════════════════════════════════════════════════════════════════
// View Submissions Modal (admin)
// ══════════════════════════════════════════════════════════════════════════
async function openViewSubmissionsModal(challengeId) {
  const listEl = document.getElementById("vs-list");
  listEl.innerHTML = `<p style="color:#9ca3af;text-align:center;">Loading…</p>`;
  document.getElementById("view-submissions-overlay").style.display = "flex";
  document.body.style.overflow = "hidden";

  const challenge = allChallenges.find((c) => String(c.id) === String(challengeId));
  document.getElementById("vs-title").textContent = `👁 Submissions — ${challenge ? challenge.title : ""}`;

  const res = await api.listSubmissions(challengeId).catch(() => null);
  if (!res?.success) {
    listEl.innerHTML = `<p style="color:#ef4444;text-align:center;">${esc(res?.message || "Failed to load.")}</p>`;
    return;
  }

  if (!res.submissions.length) {
    listEl.innerHTML = `<p style="color:#9ca3af;text-align:center;">No submissions yet.</p>`;
    return;
  }

  listEl.innerHTML = res.submissions.map((s) => `
    <div class="vs-item">
      <div class="vs-item__header">
        <div class="vs-item__avatar">${esc(s.user_name.charAt(0).toUpperCase())}</div>
        <div class="vs-item__meta">
          <strong>${esc(s.user_name)}</strong>
          <span class="vs-item__email">${esc(s.user_email)}</span>
        </div>
        <div class="vs-item__date">Submitted ${fmtDate(s.submitted_at)}</div>
      </div>
      ${s.solution_text
        ? `<div class="vs-item__text">${esc(s.solution_text)}</div>`
        : `<em style="color:#9ca3af;">No text solution.</em>`}
      ${s.has_file
        ? `<a href="/api/submissions/${s.id}/file" target="_blank" class="btn btn-outline btn-sm" style="margin-top:8px;">📎 ${esc(s.file_name || "View file")}</a>`
        : ""}
    </div>
  `).join('<hr class="vs-divider" />');
}

function closeViewSubmissionsModal(force) {
  if (force === true || (force && force.target === document.getElementById("view-submissions-overlay"))) {
    document.getElementById("view-submissions-overlay").style.display = "none";
    document.body.style.overflow = "";
  }
}

window.openViewSubmissionsModal  = openViewSubmissionsModal;
window.closeViewSubmissionsModal = closeViewSubmissionsModal;
