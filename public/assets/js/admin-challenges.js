/* Admin challenge posting page */

// Extend API
api.postChallenge = (formData) =>
  fetch("/api/challenges", {
    method: "POST",
    body: formData,
    credentials: "include",
  }).then((r) => r.json());

api.listChallenges = () => apiFetch("/api/challenges");
api.deleteChallenge = (id) =>
  apiFetch(`/api/challenges/${id}`, { method: "DELETE" });

function fmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return new Date(+y, +m - 1, +day).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Drag & drop ────────────────────────────────────────────────────────────
const dropZone  = document.getElementById("drop-zone");
const pdfInput  = document.getElementById("pdf");
const dropLabel = document.getElementById("drop-label");

function setFile(file) {
  if (!file || file.type !== "application/pdf") {
    showAlert("form-alert", "Only PDF files are accepted.", "error");
    return;
  }
  pdfInput._selectedFile = file;
  dropLabel.textContent  = `✅ ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  dropZone.style.borderColor = "#4f46e5";
  dropZone.style.background  = "#ede9fe";
}

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.style.borderColor = "#4f46e5";
});
dropZone.addEventListener("dragleave", () => {
  dropZone.style.borderColor = "#e2e8f0";
});
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) setFile(file);
});
pdfInput.addEventListener("change", () => {
  if (pdfInput.files[0]) setFile(pdfInput.files[0]);
});

// ── Helpers ────────────────────────────────────────────────────────────────
function showAlert(id, msg, type = "error") {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  el.style.display = "";
}
function hideAlert(id) {
  const el = document.getElementById(id);
  el.className = "alert";
  el.textContent = "";
}

// Set minimum date to today
document.getElementById("last_date").min = new Date().toISOString().slice(0, 10);

// ── Form submit ────────────────────────────────────────────────────────────
document.getElementById("challenge-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert("form-alert");
  document.getElementById("form-success").style.display = "none";

  const title       = document.getElementById("title").value.trim();
  const description = document.getElementById("description").value.trim();
  const lastDate    = document.getElementById("last_date").value;
  const file        = pdfInput._selectedFile || pdfInput.files[0];

  if (!title)    return showAlert("form-alert", "Title is required.");
  if (!lastDate) return showAlert("form-alert", "Submission deadline is required.");
  if (!file)     return showAlert("form-alert", "Please attach a PDF file.");

  const fd = new FormData();
  fd.append("title", title);
  fd.append("description", description);
  fd.append("last_date", lastDate);
  fd.append("pdf", file, file.name);

  // Show progress UI
  const btn        = document.getElementById("submit-btn");
  const spinner    = document.getElementById("submit-spinner");
  const progWrap   = document.getElementById("progress-wrap");
  const progBar    = document.getElementById("progress-bar");

  btn.disabled            = true;
  spinner.style.display   = "inline-block";
  progWrap.style.display  = "block";

  // Fake progress (R2 upload has no progress events via fetch)
  let pct = 0;
  const ticker = setInterval(() => {
    pct = Math.min(pct + Math.random() * 15, 90);
    progBar.style.width = pct + "%";
  }, 300);

  const res = await api.postChallenge(fd).catch(() => null);

  clearInterval(ticker);
  progBar.style.width = "100%";

  btn.disabled          = false;
  spinner.style.display = "none";

  setTimeout(() => { progWrap.style.display = "none"; progBar.style.width = "0%"; }, 800);

  if (!res?.success) {
    showAlert("form-alert", res?.message || "Failed to post challenge.");
    return;
  }

  // Reset form
  document.getElementById("challenge-form").reset();
  pdfInput._selectedFile    = null;
  dropLabel.textContent     = "Click to select PDF";
  dropZone.style.borderColor = "#e2e8f0";
  dropZone.style.background  = "#fafbff";

  const successEl           = document.getElementById("form-success");
  successEl.textContent     = `✅ "${res.challenge.title}" posted successfully!`;
  successEl.style.display   = "block";
  successEl.className       = "alert alert-success show";

  await loadRecent();
});

// ── Recent challenges ──────────────────────────────────────────────────────
async function loadRecent() {
  const res = await api.listChallenges().catch(() => null);
  const container = document.getElementById("recent-list");
  if (!res?.success || !res.challenges.length) {
    container.innerHTML = `<div style="color:#9ca3af;font-size:14px;">No challenges yet.</div>`;
    return;
  }

  const recent = res.challenges.slice(0, 5);
  container.innerHTML = recent
    .map(
      (c) => `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px 18px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <div style="font-weight:600;color:#111827;">${escHtml(c.title)}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:2px;">
            Deadline: ${fmtDate(c.last_date)} &nbsp;·&nbsp;
            ${c.is_expired
              ? '<span style="color:#dc2626;">Expired</span>'
              : '<span style="color:#059669;">Active</span>'}
          </div>
        </div>
        <button class="btn btn-danger btn-sm del-recent" data-id="${c.id}">Delete</button>
      </div>`
    )
    .join("");

  container.querySelectorAll(".del-recent").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this challenge?")) return;
      btn.disabled = true;
      btn.textContent = "Deleting…";
      const r = await api.deleteChallenge(btn.dataset.id).catch(() => null);
      if (r?.success) {
        await loadRecent();
      } else {
        alert(r?.message || "Failed to delete.");
        btn.disabled = false;
        btn.textContent = "Delete";
      }
    });
  });
}

// Logout
document.getElementById("logout-btn").addEventListener("click", async () => {
  await api.logout();
  window.location.href = "/index.html";
});

// ── Bootstrap ──────────────────────────────────────────────────────────────
(async () => {
  const me = await api.me().catch(() => null);
  if (!me?.success) { window.location.href = "/index.html"; return; }
  if (me.user.role !== "admin") { window.location.href = "/dashboard.html"; return; }

  document.getElementById("topbar-name").textContent = me.user.name;
  document.getElementById("skeleton").style.display = "none";
  document.getElementById("content").style.display  = "block";

  await loadRecent();
})();
