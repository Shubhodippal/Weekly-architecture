/* ── Unified home dashboard (challenges feed + admin modal) ─────────────── */

// ── Globals ───────────────────────────────────────────────────────────────
let allChallenges   = [];
let currentUser     = null;
let pendingUnlocks  = [];   // reward unlocks not yet acted on
let unlockQueueIdx  = 0;    // which pending unlock we're showing

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
             <div class="accept-toggle ${expired ? 'accept-toggle--off' : 'accept-toggle--on'} accept-toggle-btn" data-id="${c.id}" title="${expired ? 'Click to reopen challenge' : 'Click to stop accepting responses'}" style="cursor:pointer;">
               <div class="accept-toggle__track"></div>
               <span class="accept-toggle__label">${expired ? 'Closed' : 'Accepting'}</span>
             </div>
             <button class="btn btn-outline btn-sm edit-btn" data-id="${c.id}">✏️ Edit</button>
             <button class="btn btn-danger btn-sm del-btn" data-id="${c.id}">Delete</button>`
        }
      </div>

      ${expired && (c.answer_description || c.has_answer) ? `
      <div style="margin-top:14px;padding:14px 16px;background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;">
        <div style="font-size:13px;font-weight:600;color:#7c3aed;margin-bottom:8px;">💡 Answer Revealed</div>
        ${c.answer_description ? `<div style="font-size:14px;color:#374151;white-space:pre-wrap;margin-bottom:10px;">${esc(c.answer_description)}</div>` : ""}
        ${c.has_answer ? `
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm toggle-answer-btn" data-id="${c.id}">📋 View Answer PDF</button>
            <a href="/api/challenges/${c.id}/answer" class="btn btn-ghost btn-sm" download="${esc(c.answer_name || 'answer.pdf')}">⬇ Download Answer</a>
          </div>
          <div class="pdf-inline-viewer" id="answer-viewer-${c.id}" style="display:none;margin-top:10px;">
            <iframe src="/api/challenges/${c.id}/answer?inline=1" class="pdf-iframe" title="Answer" loading="lazy"></iframe>
          </div>` : ""}
      </div>` : ""}

      ${!isAdmin && c.my_grade ? (() => {
        const gradeLabels = { wrong: "Wrong", partial: "Partially Correct", almost: "Almost Correct", correct: "Correct", not_attempted: "Not Attempted" };
        const gradeClasses = { wrong: "grade-badge--wrong", partial: "grade-badge--partial", almost: "grade-badge--almost", correct: "grade-badge--correct", not_attempted: "grade-badge--not_attempted" };
        const pts = c.my_points;
        const ptsColor = pts > 0 ? "#059669" : pts < 0 ? "#dc2626" : "#d97706";
        return `
        <div style="margin-top:12px;padding:12px 16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;">
          <div style="font-size:12px;font-weight:700;color:#0369a1;margin-bottom:8px;">📊 Your Evaluation</div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span class="grade-badge ${gradeClasses[c.my_grade] || ''}">${gradeLabels[c.my_grade] || c.my_grade}</span>
            <span class="pts-badge" style="color:${ptsColor};">${pts > 0 ? '+' : ''}${pts} pts</span>
          </div>
          ${c.my_remark ? `<div style="margin-top:8px;font-size:13px;color:#374151;white-space:pre-wrap;border-top:1px solid #e0f2fe;padding-top:8px;"><span style="font-weight:600;color:#0369a1;">💬 Remark:</span> ${esc(c.my_remark)}</div>` : ""}
        </div>`;
      })() : ""}

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

  el.querySelectorAll(".toggle-answer-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const viewer = document.getElementById(`answer-viewer-${btn.dataset.id}`);
      const open   = viewer.style.display === "none";
      viewer.style.display = open ? "block" : "none";
      btn.textContent = open ? "✖ Close Answer" : "📋 View Answer PDF";
    });
  });

  el.querySelectorAll(".accept-toggle-btn").forEach((tog) => {
    tog.addEventListener("click", async () => {
      const id    = tog.dataset.id;
      const isOn  = tog.classList.contains("accept-toggle--on");
      if (isOn) {
        // ON → OFF: expire immediately
        if (!confirm("Stop accepting responses? This will close the challenge immediately and reveal the answer to users.")) return;
        tog.style.opacity = "0.5"; tog.style.pointerEvents = "none";
        const res = await api.expireChallenge(id).catch(() => null);
        tog.style.opacity = ""; tog.style.pointerEvents = "";
        if (res?.success) {
          await loadChallenges();
        } else {
          alert(res?.message || "Failed to close challenge.");
        }
      } else {
        // OFF → ON: open reopen modal to pick new deadline
        openReopenModal(id);
      }
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
  document.getElementById("e-title").value        = challenge.title || "";
  document.getElementById("e-desc").value         = challenge.description || "";
  document.getElementById("e-date").value         = challenge.last_date || "";
  document.getElementById("e-answer-desc").value  = challenge.answer_description || "";
  document.getElementById("e-remove-answer").value = "0";

  // Show current answer file if present
  const answerRow = document.getElementById("e-current-answer");
  if (challenge.answer_name) {
    document.getElementById("e-current-answer-name").textContent = `📋 ${challenge.answer_name}`;
    answerRow.style.display = "flex";
  } else {
    answerRow.style.display = "none";
  }

  // Reset answer drop zone
  const eAnswerPdf = document.getElementById("e-answer-pdf");
  eAnswerPdf.value = "";
  eAnswerPdf._file = null;
  document.getElementById("e-answer-drop-label").textContent = "Click or drag & drop new answer PDF here";
  document.getElementById("e-answer-drop-zone").classList.remove("drop-zone--selected");

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

// ── Edit modal: answer PDF drop zone & remove button ─────────────────────
const eAnswerDropZone  = document.getElementById("e-answer-drop-zone");
const eAnswerPdfInput  = document.getElementById("e-answer-pdf");
const eAnswerDropLabel = document.getElementById("e-answer-drop-label");

eAnswerDropZone.addEventListener("dragover",  (e) => { e.preventDefault(); eAnswerDropZone.classList.add("drop-zone--hover"); });
eAnswerDropZone.addEventListener("dragleave", () => eAnswerDropZone.classList.remove("drop-zone--hover"));
eAnswerDropZone.addEventListener("drop", (e) => {
  e.preventDefault(); eAnswerDropZone.classList.remove("drop-zone--hover");
  const file = e.dataTransfer.files[0];
  if (file) setEditAnswerFile(file);
});
eAnswerPdfInput.addEventListener("change", () => { if (eAnswerPdfInput.files[0]) setEditAnswerFile(eAnswerPdfInput.files[0]); });

function setEditAnswerFile(file) {
  if (!file || file.type !== "application/pdf") {
    const alertEl = document.getElementById("edit-modal-alert");
    alertEl.textContent = "Answer file must be a PDF.";
    alertEl.className = "alert alert-error show";
    return;
  }
  eAnswerPdfInput._file = file;
  eAnswerDropLabel.textContent = `✅ ${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
  eAnswerDropZone.classList.add("drop-zone--selected");
  // Clear any pending "remove" flag since we're uploading a new file
  document.getElementById("e-remove-answer").value = "0";
}

document.getElementById("e-remove-answer-btn").addEventListener("click", () => {
  document.getElementById("e-remove-answer").value = "1";
  document.getElementById("e-current-answer").style.display = "none";
  // Also clear any newly selected file
  eAnswerPdfInput.value = ""; eAnswerPdfInput._file = null;
  eAnswerDropLabel.textContent = "Click or drag & drop new answer PDF here";
  eAnswerDropZone.classList.remove("drop-zone--selected");
});

// ── Reopen Challenge Modal ──────────────────────────────────────────────────
let reopenChallengeId = null;

function openReopenModal(challengeId) {
  reopenChallengeId = challengeId;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const dateInput = document.getElementById("reopen-date");
  dateInput.min   = tomorrow;
  dateInput.value = "";
  const alertEl = document.getElementById("reopen-modal-alert");
  alertEl.className   = "alert";
  alertEl.textContent = "";
  document.getElementById("reopen-modal-overlay").style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeReopenModal(force) {
  if (force === true || (force instanceof Event && force.target === document.getElementById("reopen-modal-overlay"))) {
    document.getElementById("reopen-modal-overlay").style.display = "none";
    document.body.style.overflow = "";
    reopenChallengeId = null;
  }
}

async function confirmReopen() {
  const date    = document.getElementById("reopen-date").value;
  const alertEl = document.getElementById("reopen-modal-alert");
  if (!date) {
    alertEl.className   = "alert alert-error show";
    alertEl.textContent = "Please pick a deadline.";
    return;
  }
  const btn = document.getElementById("reopen-confirm-btn");
  btn.disabled    = true;
  btn.textContent = "Reopening…";
  const res = await api.reopenChallenge(reopenChallengeId, date).catch(() => null);
  btn.disabled    = false;
  btn.textContent = "🔓 Reopen";
  if (!res?.success) {
    alertEl.className   = "alert alert-error show";
    alertEl.textContent = res?.message || "Failed to reopen.";
    return;
  }
  closeReopenModal(true);
  await loadChallenges();
}

window.closeReopenModal = closeReopenModal;
window.confirmReopen    = confirmReopen;

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closePostModal(true);
    closeEditModal(true);
    closeSubmitModal(true);
    closeViewSubmissionsModal(true);
    closeReopenModal(true);
    closeRewardPopup();
  }
});

document.getElementById("edit-challenge-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const alertEl = document.getElementById("edit-modal-alert");
  alertEl.className = "alert"; alertEl.textContent = "";

  const title      = document.getElementById("e-title").value.trim();
  const desc       = document.getElementById("e-desc").value.trim();
  const date       = document.getElementById("e-date").value;
  const answerDesc = document.getElementById("e-answer-desc").value.trim();
  const removeAns  = document.getElementById("e-remove-answer").value;
  const eAnswerPdf = document.getElementById("e-answer-pdf");
  const answerFile = eAnswerPdf._file || eAnswerPdf.files[0];

  if (!title) { alertEl.className = "alert alert-error show"; alertEl.textContent = "Title is required."; return; }
  if (!date)  { alertEl.className = "alert alert-error show"; alertEl.textContent = "Deadline is required."; return; }

  const btn = document.getElementById("edit-submit-btn");
  btn.disabled = true; btn.textContent = "Saving…";

  const fd = new FormData();
  fd.append("title", title);
  fd.append("description", desc);
  fd.append("last_date", date);
  fd.append("answer_description", answerDesc);
  if (removeAns === "1") fd.append("remove_answer_pdf", "1");
  if (answerFile) fd.append("answer_pdf", answerFile, answerFile.name);

  const res = await api.editChallenge(editingChallengeId, fd).catch(() => null);

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
    const isExp = res.challenge.last_date < now;
    allChallenges[idx] = {
      ...allChallenges[idx],
      ...res.challenge,
      is_expired:         isExp,
      answer_description: isExp ? res.challenge.answer_description : null,
      answer_name:        isExp ? res.challenge.answer_name        : null,
      has_answer:         isExp ? !!res.challenge.answer_name      : false,
    };
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

// ── Answer PDF drag & drop for post modal ────────────────────────────────
const answerDropZone  = document.getElementById("answer-drop-zone");
const answerPdfInput  = document.getElementById("c-answer-pdf");
const answerDropLabel = document.getElementById("answer-drop-label");

function setAnswerFile(file) {
  if (!file || file.type !== "application/pdf") {
    modalAlert("Answer file must be a PDF.", "error"); return;
  }
  answerPdfInput._file = file;
  answerDropLabel.textContent = `✅ ${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
  answerDropZone.classList.add("drop-zone--selected");
}

answerDropZone.addEventListener("dragover", (e) => { e.preventDefault(); answerDropZone.classList.add("drop-zone--hover"); });
answerDropZone.addEventListener("dragleave", () => answerDropZone.classList.remove("drop-zone--hover"));
answerDropZone.addEventListener("drop", (e) => {
  e.preventDefault(); answerDropZone.classList.remove("drop-zone--hover");
  if (e.dataTransfer.files[0]) setAnswerFile(e.dataTransfer.files[0]);
});
answerPdfInput.addEventListener("change", () => { if (answerPdfInput.files[0]) setAnswerFile(answerPdfInput.files[0]); });

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

  const title      = document.getElementById("c-title").value.trim();
  const desc       = document.getElementById("c-desc").value.trim();
  const date       = document.getElementById("c-date").value;
  const file       = pdfInput._file || pdfInput.files[0];
  const answerDesc = document.getElementById("c-answer-desc").value.trim();
  const answerFile = answerPdfInput._file || answerPdfInput.files[0];

  if (!title) return modalAlert("Title is required.");
  if (!date)  return modalAlert("Deadline is required.");
  if (!file)  return modalAlert("Please attach a PDF file.");

  const fd = new FormData();
  fd.append("title", title);
  fd.append("description", desc);
  fd.append("last_date", date);
  fd.append("pdf", file, file.name);
  if (answerDesc) fd.append("answer_description", answerDesc);
  if (answerFile) fd.append("answer_pdf", answerFile, answerFile.name);

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
  answerPdfInput._file = null;
  answerDropLabel.textContent = "Click or drag & drop answer PDF here";
  answerDropZone.classList.remove("drop-zone--selected");

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

// ══════════════════════════════════════════════════════════════════════════
// Reward System
// ══════════════════════════════════════════════════════════════════════════

const REWARD_STATUS_ICON = {
  locked:    "🔒",
  unlocked:  "✨",
  claimed:   "⏳",
  passed:    "⏭",
  fulfilled: "✅",
};
const REWARD_STATUS_LABEL = {
  locked:    "Locked",
  unlocked:  "Ready to claim!",
  claimed:   "Pending…",
  passed:    "Skipped",
  fulfilled: "Fulfilled ✅",
};
const REWARD_STATUS_COLOR = {
  locked:    "#94a3b8",
  unlocked:  "#f59e0b",
  claimed:   "#3b82f6",
  passed:    "#cbd5e1",
  fulfilled: "#059669",
};

async function loadRewards() {
  const res = await api.listRewards().catch(() => null);
  if (!res?.success) return;

  // Store full list globally so popup can reference next tiers
  window._allRewards = res.rewards;

  renderRewardsSidebar(res.rewards);

  pendingUnlocks = res.new_unlocks || [];
  unlockQueueIdx = 0;
  if (pendingUnlocks.length > 0) {
    // Small delay so the page finishes rendering first
    setTimeout(showNextRewardPopup, 800);
  }
}

function renderRewardsSidebar(rewards) {
  const wrapper = document.getElementById("rewards-sidebar-wrapper");
  const list    = document.getElementById("rewards-sidebar-list");
  if (!wrapper || !list) return;

  if (!rewards || !rewards.length) return;

  wrapper.style.display = "block";
  list.innerHTML = rewards.map((r) => {
    const locked  = r.status === "locked";
    const isPassed = r.status === "passed";
    return `
    <div class="reward-tier-row reward-tier-row--${r.status}">
      <div class="reward-tier-row__icon">${locked ? "🔒" : esc(r.icon)}</div>
      <div class="reward-tier-row__info">
        <div class="reward-tier-row__name${locked ? " reward-tier-row__name--blur" : ""}">${locked ? "Hidden reward" : esc(r.title)}</div>
        <div class="reward-tier-row__pts">${locked ? `🔒 Unlock at ${r.points_required} pts` : `${r.points_required} pts`}</div>
        ${isPassed ? `<button class="reward-reclaim-btn" onclick="doClaimPassedReward(${r.id}, this)">😬 Still want it? Claim now</button>` : ""}
      </div>
      <div class="reward-tier-row__status" style="color:${REWARD_STATUS_COLOR[r.status] || "#94a3b8"};" title="${REWARD_STATUS_LABEL[r.status] || ""}">
        ${locked ? "" : (REWARD_STATUS_ICON[r.status] || "")}
      </div>
    </div>`;
  }).join("");
}

// ── Surprise popup ────────────────────────────────────────────────────────

function spawnConfetti() {
  const container = document.getElementById("reward-confetti");
  if (!container) return;
  container.innerHTML = "";
  const colors = ["#f59e0b","#3b82f6","#10b981","#f43f5e","#8b5cf6","#ec4899","#f97316"];
  for (let i = 0; i < 48; i++) {
    const p = document.createElement("div");
    p.className = "confetti-piece";
    p.style.cssText = [
      `left:${Math.random() * 100}%`,
      `background:${colors[Math.floor(Math.random() * colors.length)]}`,
      `width:${6 + Math.random() * 8}px`,
      `height:${6 + Math.random() * 8}px`,
      `border-radius:${Math.random() > 0.5 ? "50%" : "2px"}`,
      `animation-delay:${Math.random() * 0.6}s`,
      `animation-duration:${1.8 + Math.random() * 1.4}s`,
      `--dx:${(Math.random() - 0.5) * 140}px`,
    ].join(";");
    container.appendChild(p);
  }
}

function showNextRewardPopup() {
  if (unlockQueueIdx >= pendingUnlocks.length) {
    // All acted on — reload sidebar to reflect final statuses
    loadRewards();
    return;
  }

  const reward = pendingUnlocks[unlockQueueIdx];

  // Find the next locked/higher tier to show as motivation
  const allRewards = window._allRewards || [];
  const next = allRewards.find(
    (r) => r.points_required > reward.points_required && (r.status === "locked" || !r.status)
  );
  const nextHint = next
    ? `🎯 Next up: ${next.icon || "🔒"} ${next.title || "Hidden reward"} at ${next.points_required} pts`
    : "🏆 This is the highest reward tier!";

  // Populate next-tier hint in both before/after sections
  const hintBefore = document.getElementById("reward-next-hint-before");
  const hintAfter  = document.getElementById("reward-next-hint-after");
  if (hintBefore) hintBefore.textContent = nextHint;
  if (hintAfter)  hintAfter.textContent  = nextHint;

  // Update save button label with the next reward name
  const saveBtn = document.getElementById("reward-save-btn");
  if (saveBtn) {
    saveBtn.textContent = next
      ? `💾 Save — hold out for ${next.icon || "🔒"} ${next.title || "bigger reward"}`
      : "💾 Save for later";
  }

  // Reset to "before reveal" state
  document.getElementById("reward-before").style.display = "";
  document.getElementById("reward-after").style.display  = "none";
  document.getElementById("reward-bounce-icon").textContent = "🎁";
  document.getElementById("reward-icon").textContent  = reward.icon;
  document.getElementById("reward-title").textContent = reward.title;
  document.getElementById("reward-desc").textContent  = reward.description || "";
  document.getElementById("reward-pts").textContent   = `🎯 ${reward.points_required} pts milestone`;

  const claimBtn = document.getElementById("reward-claim-btn");
  claimBtn.disabled    = false;
  claimBtn.textContent = "🎁 Claim Reward!";

  document.getElementById("reward-popup-overlay").style.display = "flex";
  document.body.style.overflow = "hidden";
  spawnConfetti();
}

function revealReward() {
  document.getElementById("reward-before").style.display = "none";
  document.getElementById("reward-after").style.display  = "";
  spawnConfetti();
}

async function doClaimReward() {
  const reward = pendingUnlocks[unlockQueueIdx];
  const btn    = document.getElementById("reward-claim-btn");
  btn.disabled    = true;
  btn.textContent = "Claiming…";

  const res = await api.claimReward(reward.id).catch(() => null);
  if (res?.success) {
    btn.textContent = "✅ Claimed! Admin will be in touch 🎉";
    setTimeout(() => {
      closeRewardPopup();
      unlockQueueIdx++;
      setTimeout(showNextRewardPopup, 400);
    }, 1500);
  } else {
    btn.disabled    = false;
    btn.textContent = "🎁 Claim Reward!";
    alert(res?.message || "Failed to claim. Please try again.");
  }
}

async function doPassReward() {
  const reward = pendingUnlocks[unlockQueueIdx];
  await api.passReward(reward.id).catch(() => null);
  closeRewardPopup();
  unlockQueueIdx++;
  setTimeout(showNextRewardPopup, 400);
}

function closeRewardPopup() {
  document.getElementById("reward-popup-overlay").style.display = "none";
  document.body.style.overflow = "";
}

async function doClaimPassedReward(rewardId, btn) {
  const confirmed = window.confirm("Are you sure you want to claim this reward now? 🎁\nYour points will be deducted once the admin fulfills it.");
  if (!confirmed) return;
  btn.disabled    = true;
  btn.textContent = "Claiming…";
  const res = await api.claimReward(rewardId).catch(() => null);
  if (res?.success) {
    btn.textContent = "✅ Claimed! Admin will reach out 🎉";
    setTimeout(() => loadRewards(), 1400);
  } else {
    btn.disabled    = false;
    btn.textContent = "😬 Still want it? Claim now";
    alert(res?.message || "Could not claim. Please try again.");
  }
}

window.revealReward        = revealReward;
window.doClaimReward       = doClaimReward;
window.doPassReward        = doPassReward;
window.closeRewardPopup    = closeRewardPopup;
window.doClaimPassedReward = doClaimPassedReward;

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
    document.getElementById("btn-post-challenge").style.display  = "inline-flex";
    document.getElementById("btn-manage-users").style.display    = "inline-flex";
    document.getElementById("btn-rewards").style.display         = "inline-flex";
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

  // Points widget (non-admin users)
  if (role !== "admin" && me.user.total_points !== undefined) {
    const ptEl = document.getElementById("user-points");
    ptEl.style.display = "block";
    document.getElementById("points-value").textContent = me.user.total_points;
  }

  // Set min date for new challenges
  document.getElementById("c-date").min = new Date().toISOString().slice(0, 10);

  // Show layout
  document.getElementById("skeleton").style.display = "none";
  document.getElementById("content").style.display  = "flex";

  await loadChallenges();

  // Load rewards (non-admin only)
  if (role !== "admin") await loadRewards();
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
let vsCurrentChallengeId = null;

const GRADE_LABELS = {
  wrong:        "Wrong",
  partial:      "Partially Correct",
  almost:       "Almost Correct",
  correct:      "Correct",
  not_attempted:"Not Attempted",
};

async function openViewSubmissionsModal(challengeId) {
  vsCurrentChallengeId = challengeId;
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

  listEl.innerHTML = res.submissions.map((s) => {
    const isNA = s.grade === "not_attempted";

    const badgeHtml = s.grade && !isNA
      ? `<span class="grade-badge grade-badge--${s.grade}">${GRADE_LABELS[s.grade]}</span>
         <span class="pts-badge" style="color:${s.points > 0 ? "#059669" : s.points < 0 ? "#dc2626" : "#d97706"};">
           ${s.points > 0 ? "+" : ""}${s.points} pts
         </span>`
      : "";

    const gradeOpt = (val, label) =>
      `<option value="${val}" ${s.grade === val ? "selected" : ""}>${label}</option>`;

    return `
    <div class="vs-item" data-submission-id="${s.id}">
      <div class="vs-item__header">
        <div class="vs-item__avatar">${esc(s.user_name.charAt(0).toUpperCase())}</div>
        <div class="vs-item__meta">
          <strong>${esc(s.user_name)}</strong>
          <span class="vs-item__email">${esc(s.user_email)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-left:auto;flex-wrap:wrap;justify-content:flex-end;">
          ${isNA
            ? `<span class="grade-badge grade-badge--not_attempted">Did Not Submit</span>
               <span class="pts-badge" style="color:#dc2626;">−10 pts</span>`
            : `${badgeHtml}<span class="vs-item__date">${fmtDate(s.submitted_at)}</span>`}
        </div>
      </div>

      ${isNA ? "" : `
        ${s.solution_text
          ? `<div class="vs-item__text">${esc(s.solution_text)}</div>`
          : `<em style="color:#9ca3af;font-size:13px;">No text solution provided.</em>`}
        ${s.has_file
          ? `<a href="/api/submissions/${s.id}/file" target="_blank" class="btn btn-outline btn-sm" style="margin-top:8px;">📎 ${esc(s.file_name || "View file")}</a>`
          : ""}

        <div class="grade-panel">
          <div class="grade-panel__row">
            <label>Grade</label>
            <select class="grade-select form-input" style="max-width:240px;font-size:13px;">
              <option value="">— Select grade —</option>
              ${gradeOpt("wrong",   "❌ Wrong (0 pts)")}
              ${gradeOpt("partial", "🔶 Partially Correct (5 pts)")}
              ${gradeOpt("almost",  "🔷 Almost Correct (15 pts)")}
              ${gradeOpt("correct", "✅ Correct (20 pts)")}
            </select>
          </div>
          <div class="grade-panel__row">
            <label>Remark</label>
            <textarea class="grade-remark form-input" rows="2" placeholder="Optional remarks for the user…" style="font-size:13px;">${esc(s.remark || "")}</textarea>
          </div>
          <div class="grade-panel__actions">
            ${s.evaluated_at ? `<span style="font-size:11px;color:#9ca3af;">Last evaluated ${fmtDate(s.evaluated_at)}</span>` : ""}
            <button class="btn btn-primary btn-sm grade-save-btn">💾 Save Grade</button>
          </div>
          <div class="grade-alert" style="display:none;margin-top:8px;"></div>
        </div>
      `}
    </div>`;
  }).join('<hr class="vs-divider" />');

  // Attach grade-save handlers
  listEl.querySelectorAll(".grade-save-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const item    = btn.closest(".vs-item");
      const subId   = item.dataset.submissionId;
      const grade   = item.querySelector(".grade-select").value;
      const remark  = item.querySelector(".grade-remark").value.trim();
      const alertEl = item.querySelector(".grade-alert");

      alertEl.style.display = "none";
      if (!grade) {
        alertEl.style.display = "block";
        alertEl.className = "grade-alert";
        alertEl.style.background = "#fee2e2";
        alertEl.style.color = "#dc2626";
        alertEl.textContent = "Please select a grade before saving.";
        return;
      }

      btn.disabled = true; btn.textContent = "Saving…";
      const res = await api.gradeSubmission(subId, grade, remark).catch(() => null);
      btn.disabled = false; btn.textContent = "💾 Save Grade";

      if (!res?.success) {
        alertEl.style.display = "block";
        alertEl.style.background = "#fee2e2";
        alertEl.style.color = "#dc2626";
        alertEl.textContent = res?.message || "Failed to save grade.";
        return;
      }

      const pts = res.points;
      alertEl.style.display = "block";
      alertEl.style.background = "#d1fae5";
      alertEl.style.color = "#065f46";
      alertEl.textContent = `✅ Graded: ${GRADE_LABELS[grade]} (${pts >= 0 ? "+" : ""}${pts} pts). Email sent to user.`;

      // Refresh list after short delay to show updated badges
      setTimeout(() => openViewSubmissionsModal(vsCurrentChallengeId), 1400);
    });
  });
}

function closeViewSubmissionsModal(force) {
  if (force === true || (force && force.target === document.getElementById("view-submissions-overlay"))) {
    document.getElementById("view-submissions-overlay").style.display = "none";
    document.body.style.overflow = "";
  }
}

window.openViewSubmissionsModal  = openViewSubmissionsModal;
window.closeViewSubmissionsModal = closeViewSubmissionsModal;
