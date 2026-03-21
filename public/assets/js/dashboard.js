/* ── Unified home dashboard (challenges feed + admin modal) ─────────────── */

// ── Globals ───────────────────────────────────────────────────────────────
let allChallenges   = [];
let currentUser     = null;
let pendingUnlocks  = [];   // reward unlocks not yet acted on
let unlockQueueIdx  = 0;    // which pending unlock we're showing
const commentsByChallenge = new Map();
const commentSortByChallenge = new Map();

function renderLeaderboard(leaderboard = [], meRow = null) {
  const el = document.getElementById("leaderboard-list");
  if (!el) return;

  if (!leaderboard.length) {
    el.innerHTML = '<div class="comments-empty">No leaderboard data yet.</div>';
    return;
  }

  el.innerHTML = `
    <div class="leaderboard-rows">
      ${leaderboard.map((row) => `
        <div class="leaderboard-row ${row.is_me ? "leaderboard-row--me" : ""}">
          <div class="leaderboard-rank">#${row.rank}</div>
          <div class="leaderboard-meta">
            <div class="leaderboard-name">${esc(initials(row.name))}</div>
            <div class="leaderboard-sub">🔥 ${row.current_streak}d streak</div>
          </div>
          <div class="leaderboard-points">${row.total_points}</div>
        </div>
      `).join("")}
      ${meRow && !leaderboard.some((row) => row.is_me) ? `
        <div class="leaderboard-divider"></div>
        <div class="leaderboard-row leaderboard-row--me">
          <div class="leaderboard-rank">#${meRow.rank}</div>
          <div class="leaderboard-meta">
            <div class="leaderboard-name">${esc(initials(meRow.name))}</div>
            <div class="leaderboard-sub">🔥 ${meRow.current_streak}d streak</div>
          </div>
          <div class="leaderboard-points">${meRow.total_points}</div>
        </div>
      ` : ""}
    </div>`;
}

async function loadLeaderboard() {
  const res = await api.leaderboard().catch(() => null);
  if (!res?.success) return;
  renderLeaderboard(res.leaderboard || [], res.me || null);
}

// ── Helpers ───────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return "Never";
  const s = d.length > 10 ? d : d + "T00:00:00";
  return new Date(s).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtDateTime(d) {
  if (!d) return "—";
  const normalized = String(d).includes("T") ? String(d) : String(d).replace(" ", "T") + "Z";
  const dt = new Date(normalized);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function toDateTimeInputValue(d) {
  if (!d) return "";
  const normalized = String(d).includes("T") ? String(d) : String(d).replace(" ", "T") + "Z";
  const dt = new Date(normalized);
  if (Number.isNaN(dt.getTime())) return "";
  const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
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

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function formatCommentContent(content) {
  const safe = esc(content || "");
  return safe.replace(/(^|\s)@([a-zA-Z0-9_]{2,32})/g, '$1<span class="comment-mention">@$2</span>');
}

function timeAgo(input) {
  if (!input) return "just now";
  const d = new Date(input + (String(input).includes("T") ? "" : "Z"));
  const sec = Math.max(1, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return fmtDate(input);
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
    const scheduled = isAdmin && c.is_published === false;
    const commentSort = commentSortByChallenge.get(c.id) || "top";

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
          ${scheduled ? `<span class="pill pill--blue">Scheduled</span>` : ""}
        </div>
      </div>

      <div class="feed-card__title">${esc(c.title)}</div>
      ${c.description ? `<div class="feed-card__desc">${esc(c.description)}</div>` : ""}

      <div class="feed-card__deadline">
        📅 Deadline: <strong>${fmtDate(c.last_date)}</strong>
        ${scheduled ? `<div style="margin-top:6px;">🕒 Publishes: <strong>${esc(fmtDateTime(c.publish_at))}</strong></div>` : ""}
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
          ? `
             ${expired
               ? `<button class="btn btn-ghost btn-sm" disabled>🔒 Closed</button>`
               : `<button class="btn btn-primary btn-sm submit-btn" data-id="${c.id}">✍️ Enter Solution</button>`}
             <button class="btn btn-outline btn-sm ai-hints-btn" data-id="${c.id}">🤖 AI Hints</button>`
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

      <section class="comments-section" data-challenge-id="${c.id}">
        <div class="comments-section__head">
          <div class="comments-section__title-wrap">
            <span>💬 Comments</span>
            <span class="comments-count" id="comment-count-${c.id}">...</span>
          </div>
          <div class="comments-section__tools">
            <label class="comment-sort-label" for="comment-sort-${c.id}">Sort:</label>
            <select class="comment-sort-select" id="comment-sort-${c.id}" data-challenge-id="${c.id}">
              <option value="top" ${commentSort === "top" ? "selected" : ""}>Top</option>
              <option value="newest" ${commentSort === "newest" ? "selected" : ""}>Newest</option>
            </select>
          </div>
        </div>

        <form class="comment-form" data-challenge-id="${c.id}">
          <textarea
            class="comment-input"
            id="comment-input-${c.id}"
            maxlength="2000"
            placeholder="Add a public comment..."
            required
          ></textarea>
          <div class="comment-form__actions">
            <button type="submit" class="btn btn-primary btn-sm">Comment</button>
          </div>
        </form>

        <div class="comments-list" id="comments-list-${c.id}">
          <div class="comments-loading">Loading comments…</div>
        </div>
      </section>
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

  el.querySelectorAll(".ai-hints-btn").forEach((btn) => {
    btn.addEventListener("click", () => openAiHintsModal(btn.dataset.id));
  });

  el.querySelectorAll(".view-submissions-btn").forEach((btn) => {
    btn.addEventListener("click", () => openViewSubmissionsModal(btn.dataset.id));
  });

  setupCommentSections(list);
}

function countComments(nodes = []) {
  return nodes.reduce((acc, node) => acc + 1 + countComments(node.replies || []), 0);
}

function renderCommentItem(challengeId, comment, isReply = false) {
  const badge = comment.author_role === "admin"
    ? '<span class="comment-role-badge">Admin</span>'
    : "";
  const pinned = comment.is_pinned && !isReply
    ? '<span class="comment-pinned-badge">Pinned</span>'
    : "";
  const edited = comment.updated_at && comment.updated_at !== comment.created_at
    ? '<span class="comment-edited">(edited)</span>'
    : "";
  const replies = comment.replies || [];
  const showMoreNeeded = replies.length > 2;
  const hiddenForViewer = comment.is_hidden && currentUser?.role !== "admin";
  const contentHtml = hiddenForViewer
    ? '<em style="color:#6b7280;">This comment is hidden by admin.</em>'
    : formatCommentContent(comment.content);
  const reportLabel = comment.is_reported_by_me ? "Reported" : "Report";

  return `
    <div class="comment-item ${isReply ? "comment-item--reply" : ""}" data-comment-id="${comment.id}">
      <div class="comment-avatar">${esc(comment.author_name?.charAt(0)?.toUpperCase() || "U")}</div>
      <div class="comment-main">
        <div class="comment-meta">
          <span class="comment-author">${esc(comment.author_name || "User")}</span>
          ${badge}
          ${pinned}
          <span class="comment-time">${esc(timeAgo(comment.created_at))}</span>
          ${edited}
        </div>
        <div class="comment-content" id="comment-content-${comment.id}">${contentHtml}</div>

        <form class="comment-edit-form" id="edit-form-${comment.id}" data-comment-id="${comment.id}" style="display:none;">
          <textarea class="comment-input comment-input--reply" id="edit-input-${comment.id}" maxlength="2000" required>${esc(comment.content)}</textarea>
          <div class="comment-form__actions">
            <button type="submit" class="btn btn-primary btn-sm">Save</button>
            <button type="button" class="btn btn-ghost btn-sm comment-edit-cancel" data-comment-id="${comment.id}">Cancel</button>
          </div>
        </form>

        <div class="comment-actions">
          <button type="button" class="comment-link-btn comment-react-btn ${comment.my_reaction === "like" ? "comment-link-btn--active" : ""}" data-comment-id="${comment.id}" data-reaction="like" data-current="${esc(comment.my_reaction || "")}">👍 ${comment.likes_count || 0}</button>
          <button type="button" class="comment-link-btn comment-react-btn ${comment.my_reaction === "dislike" ? "comment-link-btn--active" : ""}" data-comment-id="${comment.id}" data-reaction="dislike" data-current="${esc(comment.my_reaction || "")}">👎 ${comment.dislikes_count || 0}</button>
          ${!hiddenForViewer ? `<button type="button" class="comment-link-btn comment-reply-toggle" data-comment-id="${comment.id}">Reply</button>` : ""}
          ${comment.can_pin ? `<button type="button" class="comment-link-btn comment-pin-toggle" data-comment-id="${comment.id}" data-is-pinned="${comment.is_pinned ? "1" : "0"}">${comment.is_pinned ? "Unpin" : "Pin"}</button>` : ""}
          ${comment.can_hide ? `<button type="button" class="comment-link-btn comment-hide-toggle" data-comment-id="${comment.id}" data-is-hidden="${comment.is_hidden ? "1" : "0"}">${comment.is_hidden ? "Unhide" : "Hide"}</button>` : ""}
          ${!comment.can_hide && !comment.is_mine ? `<button type="button" class="comment-link-btn comment-report-btn" data-comment-id="${comment.id}" data-reported="${comment.is_reported_by_me ? "1" : "0"}">${reportLabel}</button>` : ""}
          ${comment.can_edit && !hiddenForViewer ? `<button type="button" class="comment-link-btn comment-edit-toggle" data-comment-id="${comment.id}">Edit</button>` : ""}
          ${comment.can_delete ? `<button type="button" class="comment-link-btn comment-delete-btn" data-comment-id="${comment.id}">Delete</button>` : ""}
        </div>

        <form class="comment-reply-form" id="reply-form-${comment.id}" data-challenge-id="${challengeId}" data-parent-id="${comment.id}" style="display:none;">
          <textarea class="comment-input comment-input--reply" id="reply-input-${comment.id}" maxlength="2000" placeholder="Write a reply..." required></textarea>
          <div class="comment-form__actions">
            <button type="submit" class="btn btn-primary btn-sm">Reply</button>
            <button type="button" class="btn btn-ghost btn-sm comment-reply-cancel" data-comment-id="${comment.id}">Cancel</button>
          </div>
        </form>

        ${!hiddenForViewer && replies.length
          ? `<div class="comment-replies" id="comment-replies-${comment.id}">
              ${replies.map((r, idx) => `<div class="comment-reply-wrap ${idx > 1 ? "comment-reply-hidden" : ""}">${renderCommentItem(challengeId, r, true)}</div>`).join("")}
              ${showMoreNeeded ? `<button type="button" class="comment-link-btn comment-show-more-btn" data-comment-id="${comment.id}" data-state="collapsed">View ${replies.length - 2} more replies</button>` : ""}
            </div>`
          : ""}
      </div>
    </div>`;
}

function renderComments(challengeId, comments = [], errorMessage = "") {
  const listEl = document.getElementById(`comments-list-${challengeId}`);
  const countEl = document.getElementById(`comment-count-${challengeId}`);
  if (!listEl || !countEl) return;

  if (errorMessage) {
    listEl.innerHTML = `<div class="comments-error">${esc(errorMessage)}</div>`;
    countEl.textContent = "0";
    return;
  }

  const total = countComments(comments);
  countEl.textContent = `${total} ${total === 1 ? "comment" : "comments"}`;

  if (!comments.length) {
    listEl.innerHTML = `<div class="comments-empty">No comments yet. Start the discussion.</div>`;
    return;
  }

  listEl.innerHTML = comments.map((c) => renderCommentItem(challengeId, c)).join("");
  bindCommentActions(challengeId);
}

async function loadComments(challengeId, sortOverride) {
  const sort = sortOverride || commentSortByChallenge.get(challengeId) || "top";
  commentSortByChallenge.set(challengeId, sort);
  const res = await api.listChallengeComments(challengeId, sort).catch(() => null);
  if (!res?.success) {
    renderComments(challengeId, [], res?.message || "Failed to load comments.");
    return;
  }
  commentsByChallenge.set(challengeId, res.comments || []);
  renderComments(challengeId, res.comments || []);
}

function bindCommentActions(challengeId) {
  const listEl = document.getElementById(`comments-list-${challengeId}`);
  if (!listEl) return;

  listEl.querySelectorAll(".comment-reply-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const form = document.getElementById(`reply-form-${btn.dataset.commentId}`);
      if (!form) return;
      const next = form.style.display === "none" ? "block" : "none";
      form.style.display = next;
      if (next === "block") {
        const input = document.getElementById(`reply-input-${btn.dataset.commentId}`);
        if (input) input.focus();
      }
    });
  });

  listEl.querySelectorAll(".comment-reply-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      const form = document.getElementById(`reply-form-${btn.dataset.commentId}`);
      if (form) form.style.display = "none";
    });
  });

  listEl.querySelectorAll(".comment-edit-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const commentId = btn.dataset.commentId;
      const form = document.getElementById(`edit-form-${commentId}`);
      const content = document.getElementById(`comment-content-${commentId}`);
      if (!form || !content) return;
      const next = form.style.display === "none" ? "block" : "none";
      form.style.display = next;
      content.style.display = next === "block" ? "none" : "block";
      if (next === "block") {
        const input = document.getElementById(`edit-input-${commentId}`);
        if (input) input.focus();
      }
    });
  });

  listEl.querySelectorAll(".comment-edit-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      const commentId = btn.dataset.commentId;
      const form = document.getElementById(`edit-form-${commentId}`);
      const content = document.getElementById(`comment-content-${commentId}`);
      if (form) form.style.display = "none";
      if (content) content.style.display = "block";
    });
  });

  listEl.querySelectorAll(".comment-show-more-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const commentId = btn.dataset.commentId;
      const container = document.getElementById(`comment-replies-${commentId}`);
      if (!container) return;

      const hidden = container.querySelectorAll(".comment-reply-hidden");
      const isCollapsed = btn.dataset.state !== "expanded";

      hidden.forEach((item) => {
        item.style.display = isCollapsed ? "block" : "none";
      });

      btn.dataset.state = isCollapsed ? "expanded" : "collapsed";
      btn.textContent = isCollapsed
        ? "Hide replies"
        : `View ${hidden.length} more replies`;
    });
  });

  listEl.querySelectorAll(".comment-react-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const current = btn.dataset.current || "";
      const target = btn.dataset.reaction;
      const next = current === target ? null : target;
      btn.disabled = true;
      const res = await api.reactComment(btn.dataset.commentId, next).catch(() => null);
      if (!res?.success) {
        alert(res?.message || "Failed to react to comment.");
        btn.disabled = false;
        return;
      }
      await loadComments(challengeId);
    });
  });

  listEl.querySelectorAll(".comment-pin-toggle").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const isPinned = btn.dataset.isPinned === "1";
      btn.disabled = true;
      const res = await api.pinComment(btn.dataset.commentId, !isPinned).catch(() => null);
      if (!res?.success) {
        alert(res?.message || "Failed to update pin status.");
        btn.disabled = false;
        return;
      }
      await loadComments(challengeId);
    });
  });

  listEl.querySelectorAll(".comment-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this comment and its replies?")) return;
      btn.disabled = true;
      const res = await api.deleteComment(btn.dataset.commentId).catch(() => null);
      if (!res?.success) {
        alert(res?.message || "Failed to delete comment.");
        btn.disabled = false;
        return;
      }
      await loadComments(challengeId);
    });
  });

  listEl.querySelectorAll(".comment-report-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.dataset.reported === "1") {
        alert("You already reported this comment.");
        return;
      }
      const reason = prompt("Optional reason for reporting this comment:", "") || "";
      btn.disabled = true;
      const res = await api.reportComment(btn.dataset.commentId, reason).catch(() => null);
      if (!res?.success) {
        alert(res?.message || "Failed to report comment.");
        btn.disabled = false;
        return;
      }
      await loadComments(challengeId);
    });
  });

  listEl.querySelectorAll(".comment-hide-toggle").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const isHidden = btn.dataset.isHidden === "1";
      let reason = "";
      if (!isHidden) reason = prompt("Optional hide reason:", "") || "";
      btn.disabled = true;
      const res = await api.hideComment(btn.dataset.commentId, !isHidden, reason).catch(() => null);
      if (!res?.success) {
        alert(res?.message || "Failed to update hidden status.");
        btn.disabled = false;
        return;
      }
      await loadComments(challengeId);
    });
  });

  listEl.querySelectorAll(".comment-reply-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const parentId = form.dataset.parentId;
      const input = document.getElementById(`reply-input-${parentId}`);
      const content = input?.value?.trim() || "";
      if (!content) return;

      const submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn) submitBtn.disabled = true;

      const res = await api.postChallengeComment(challengeId, {
        parent_id: Number(parentId),
        content,
      }).catch(() => null);

      if (!res?.success) {
        alert(res?.message || "Failed to post reply.");
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      await loadComments(challengeId);
    });
  });

  listEl.querySelectorAll(".comment-edit-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const commentId = form.dataset.commentId;
      const input = document.getElementById(`edit-input-${commentId}`);
      const content = input?.value?.trim() || "";
      if (!content) return;

      const submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn) submitBtn.disabled = true;

      const res = await api.editComment(commentId, { content }).catch(() => null);

      if (!res?.success) {
        alert(res?.message || "Failed to update comment.");
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      await loadComments(challengeId);
    });
  });
}

function setupCommentSections(challenges) {
  document.querySelectorAll(".comment-sort-select").forEach((select) => {
    select.addEventListener("change", async () => {
      const challengeId = Number(select.dataset.challengeId);
      const sort = select.value === "newest" ? "newest" : "top";
      commentSortByChallenge.set(challengeId, sort);
      await loadComments(challengeId, sort);
    });
  });

  document.querySelectorAll(".comment-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const challengeId = Number(form.dataset.challengeId);
      const input = document.getElementById(`comment-input-${challengeId}`);
      const content = input?.value?.trim() || "";
      if (!content) return;

      const submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn) submitBtn.disabled = true;

      const res = await api.postChallengeComment(challengeId, { content }).catch(() => null);
      if (!res?.success) {
        alert(res?.message || "Failed to post comment.");
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      input.value = "";
      if (submitBtn) submitBtn.disabled = false;
      await loadComments(challengeId);
    });
  });

  challenges.forEach((c) => {
    if (!commentSortByChallenge.has(c.id)) commentSortByChallenge.set(c.id, "top");
    loadComments(c.id);
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
  else if (activeFilter === "scheduled") renderFeed(allChallenges.filter((c) => c.is_published === false));
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

const headerAiPostBtn = document.getElementById("btn-ai-post-now");
const headerReportsBtn = document.getElementById("btn-reported-comments");
function showAiPostAlert(message, type = "error") {
  const el = document.getElementById("ai-post-modal-alert");
  if (!el) return;
  el.textContent = message;
  el.className = `alert alert-${type} show`;
}

function clearAiPostAlert() {
  const el = document.getElementById("ai-post-modal-alert");
  if (!el) return;
  el.textContent = "";
  el.className = "alert";
}

function openAiPostModal() {
  clearAiPostAlert();
  document.getElementById("ai-post-modal-overlay").style.display = "flex";
  document.body.style.overflow = "hidden";
  document.getElementById("ai-topic").focus();
}

function closeAiPostModal(force) {
  if (force === true || (force && force.target === document.getElementById("ai-post-modal-overlay"))) {
    document.getElementById("ai-post-modal-overlay").style.display = "none";
    document.body.style.overflow = "";
  }
}

window.closeAiPostModal = closeAiPostModal;

if (headerAiPostBtn) {
  headerAiPostBtn.addEventListener("click", openAiPostModal);
}

function closeReportedCommentsModal(force) {
  if (force === true || (force && force.target === document.getElementById("reported-comments-overlay"))) {
    document.getElementById("reported-comments-overlay").style.display = "none";
    document.body.style.overflow = "";
  }
}

window.closeReportedCommentsModal = closeReportedCommentsModal;

async function loadReportedComments() {
  const listEl = document.getElementById("reported-comments-list");
  if (!listEl) return;

  listEl.innerHTML = '<p style="color:#9ca3af;text-align:center;">Loading reports…</p>';
  const res = await api.adminListCommentReports().catch(() => null);
  if (!res?.success) {
    listEl.innerHTML = `<p style="color:#ef4444;text-align:center;">${esc(res?.message || "Failed to load reports")}</p>`;
    return;
  }

  const rows = res.reports || [];
  if (!rows.length) {
    listEl.innerHTML = '<p style="color:#6b7280;text-align:center;">No reported comments.</p>';
    return;
  }

  listEl.innerHTML = rows.map((r) => `
    <div class="vs-item" data-comment-id="${r.comment_id}">
      <div class="vs-item__header">
        <div class="vs-item__avatar">🚩</div>
        <div class="vs-item__meta">
          <strong>${esc(r.comment_author || "User")}</strong>
          <span class="vs-item__email">Challenge: ${esc(r.challenge_title || "—")}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap;justify-content:flex-end;">
          <span class="pill pill--red">${Number(r.report_count || 0)} reports</span>
          ${Number(r.is_hidden) === 1 ? '<span class="pill pill--blue">Hidden</span>' : ''}
        </div>
      </div>
      <div class="vs-item__text">${esc(r.content || "")}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:8px;white-space:pre-wrap;">
        <strong>Reasons:</strong> ${esc((r.reasons || "(no reason)").replace(/\s\|\|\s/g, " | "))}
      </div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">
        Reported by: ${esc(r.reported_by || "—")}
      </div>
      ${r.hidden_reason ? `<div style="font-size:12px;color:#6b7280;margin-top:4px;"><strong>Hidden reason:</strong> ${esc(r.hidden_reason)}</div>` : ""}
      <div class="grade-panel__actions" style="margin-top:10px;">
        <button class="btn btn-outline btn-sm report-hide-btn" data-comment-id="${r.comment_id}" data-hidden="${Number(r.is_hidden) === 1 ? "1" : "0"}">${Number(r.is_hidden) === 1 ? "Unhide" : "Hide"}</button>
        <button class="btn btn-danger btn-sm report-delete-btn" data-comment-id="${r.comment_id}">Delete</button>
        <button class="btn btn-ghost btn-sm report-clear-btn" data-comment-id="${r.comment_id}">Clear Reports</button>
      </div>
    </div>
  `).join('<hr class="vs-divider" />');

  listEl.querySelectorAll(".report-hide-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const isHidden = btn.dataset.hidden === "1";
      const reason = !isHidden ? (prompt("Optional hide reason:", "") || "") : "";
      btn.disabled = true;
      const result = await api.hideComment(btn.dataset.commentId, !isHidden, reason).catch(() => null);
      if (!result?.success) {
        alert(result?.message || "Failed to update hide status.");
        btn.disabled = false;
        return;
      }
      await loadReportedComments();
      await loadChallenges();
    });
  });

  listEl.querySelectorAll(".report-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this comment?")) return;
      btn.disabled = true;
      const result = await api.deleteComment(btn.dataset.commentId).catch(() => null);
      if (!result?.success) {
        alert(result?.message || "Failed to delete comment.");
        btn.disabled = false;
        return;
      }
      await loadReportedComments();
      await loadChallenges();
    });
  });

  listEl.querySelectorAll(".report-clear-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const result = await api.adminClearCommentReports(btn.dataset.commentId).catch(() => null);
      if (!result?.success) {
        alert(result?.message || "Failed to clear reports.");
        btn.disabled = false;
        return;
      }
      await loadReportedComments();
    });
  });
}

async function openReportedCommentsModal() {
  document.getElementById("reported-comments-overlay").style.display = "flex";
  document.body.style.overflow = "hidden";
  await loadReportedComments();
}

if (headerReportsBtn) {
  headerReportsBtn.addEventListener("click", openReportedCommentsModal);
}

document.getElementById("ai-post-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAiPostAlert();

  const model = document.getElementById("ai-model").value;
  const topic = document.getElementById("ai-topic").value.trim();
  const difficulty = document.getElementById("ai-difficulty").value;
  const keyPointsRaw = document.getElementById("ai-key-points").value;
  const extraNotes = document.getElementById("ai-extra-notes").value.trim();

  if (!topic) {
    showAiPostAlert("Topic is required.");
    return;
  }

  const submitBtn = document.getElementById("ai-post-submit-btn");
  const submitSpinner = document.getElementById("ai-post-submit-spinner");
  submitBtn.disabled = true;
  submitSpinner.style.display = "inline-block";

  const res = await api.triggerAutoChallenge({
    model,
    topic,
    difficulty,
    keyPoints: keyPointsRaw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    extraNotes,
  }).catch(() => null);

  submitBtn.disabled = false;
  submitSpinner.style.display = "none";

  if (!res?.success) {
    showAiPostAlert(res?.message || "Failed to trigger AI challenge.");
    return;
  }

  if (res.result?.status === "created") {
    closeAiPostModal(true);
    alert(`✅ New AI challenge posted: ${res.result.title}`);
    await loadChallenges();
    return;
  }

  if (res.result?.status === "skipped_recent") {
    showAiPostAlert("Skipped because a recent AI challenge already exists.", "info");
    return;
  }

  if (res.result?.status === "disabled") {
    showAiPostAlert("Auto-post is disabled in environment settings.", "info");
    return;
  }

  showAiPostAlert("AI challenge trigger executed.", "success");
});

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
  document.getElementById("e-publish-at").value   = toDateTimeInputValue(challenge.publish_at);
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
  const publishAt  = document.getElementById("e-publish-at").value;
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
  if (publishAt) fd.append("publish_at", publishAt);
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
  const publishAt  = document.getElementById("c-publish-at").value;
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
  if (publishAt) fd.append("publish_at", publishAt);
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
  document.getElementById("c-publish-at").value = "";

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
    document.getElementById("btn-ai-post-now").style.display    = "inline-flex";
    document.getElementById("btn-reported-comments").style.display = "inline-flex";
    document.getElementById("btn-post-challenge").style.display  = "inline-flex";
    document.getElementById("filter-scheduled").style.display    = "inline-block";
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
  document.getElementById("user-streak").textContent     = `Streak: ${me.user.current_streak || 0}d (best ${me.user.best_streak || 0}d)`;

  // Points widget (non-admin users)
  if (role !== "admin" && me.user.total_points !== undefined) {
    const ptEl = document.getElementById("user-points");
    ptEl.style.display = "block";
    document.getElementById("points-value").textContent = me.user.total_points;
  }

  // Set min date for new challenges
  document.getElementById("c-date").min = new Date().toISOString().slice(0, 10);
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById("c-publish-at").value = nowLocal;

  // Show layout
  document.getElementById("skeleton").style.display = "none";
  document.getElementById("content").style.display  = "flex";

  await loadChallenges();
  await loadLeaderboard();

  // Load rewards (non-admin only)
  if (role !== "admin") await loadRewards();
})();

// ══════════════════════════════════════════════════════════════════════════
// Submit Solution Modal
// ══════════════════════════════════════════════════════════════════════════
let submitChallengeId = null;
let existingSubmissionId = null;
let removeExistingFile = false;

let aiHintsCurrentChallengeId = null;
const aiHintsCacheByChallenge = new Map();

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

// ── AI Hints (view-only, sequential unlock) ─────────────────────────────
function resetHintCards() {
  for (let level = 1; level <= 4; level += 1) {
    const card = document.getElementById(`ai-hint-card-${level}`);
    const text = document.getElementById(`ai-hint-text-${level}`);
    const btn = document.getElementById(`ai-hint-${level}`);
    if (card) card.classList.add("ai-hint-card--locked");
    if (btn) {
      btn.disabled = level !== 1;
      btn.textContent = level === 1 ? "🔓 Reveal Hint 1" : `🔒 Reveal Hint ${level}`;
    }
    if (text) {
      if (level === 1) text.textContent = "Locked until you reveal this hint.";
      if (level === 2) text.textContent = "Unlocks after Hint 1.";
      if (level === 3) text.textContent = "Unlocks after Hint 2.";
      if (level === 4) text.textContent = "Unlocks after Hint 3.";
    }
  }
}

function renderUnlockedHints(challengeId) {
  const state = aiHintsCacheByChallenge.get(challengeId) || { hints: [], unlockedLevel: 0 };
  const hints = state.hints || [];
  const unlocked = Number(state.unlockedLevel) || 0;

  for (let level = 1; level <= 4; level += 1) {
    const card = document.getElementById(`ai-hint-card-${level}`);
    const text = document.getElementById(`ai-hint-text-${level}`);
    const btn = document.getElementById(`ai-hint-${level}`);
    if (!card || !text || !btn) continue;

    if (level <= unlocked) {
      card.classList.remove("ai-hint-card--locked");
      const hint = hints[level - 1];
      text.textContent = String(hint?.text || hint || "Hint unavailable.");
      btn.disabled = true;
      btn.textContent = `✅ Hint ${level} revealed`;
      continue;
    }

    card.classList.add("ai-hint-card--locked");
    btn.disabled = level !== unlocked + 1;
    btn.textContent = level === unlocked + 1 ? `🔓 Reveal Hint ${level}` : `🔒 Reveal Hint ${level}`;
  }
}

function setAiHintsLoading(isLoading, text = "Generating hints…") {
  const wrap = document.getElementById("ai-hints-loading");
  const textEl = document.getElementById("ai-hints-loading-text");
  if (!wrap) return;
  wrap.style.display = isLoading ? "inline-flex" : "none";
  if (textEl) textEl.textContent = text;
}

async function ensureHintsLoaded(challengeId, triggerLevel) {
  const state = aiHintsCacheByChallenge.get(challengeId);
  if (state && Array.isArray(state.hints)) return true;
  return true;
}

async function loadPersistentHintsState(challengeId) {
  setAiHintsLoading(true, "Loading hint progress…");
  const res = await api.getHints(challengeId).catch(() => null);
  setAiHintsLoading(false);
  if (!res?.success || !Array.isArray(res.hints)) return false;

  const normalized = res.hints.slice(0, 4).map((h, idx) => ({
    level: Number(h?.level) || idx + 1,
    text: String(h?.text || "").trim(),
  }));

  aiHintsCacheByChallenge.set(challengeId, {
    hints: normalized,
    unlockedLevel: Number(res.unlockedLevel) || 0,
  });
  return true;
}

async function openAiHintsModal(challengeId) {
  aiHintsCurrentChallengeId = Number(challengeId);

  const challenge = allChallenges.find((c) => String(c.id) === String(challengeId));
  const titleEl = document.getElementById("ai-hints-title");
  if (titleEl) {
    titleEl.textContent = challenge ? `🤖 AI Hints — ${challenge.title}` : "🤖 AI Hints";
  }

  resetHintCards();

  const loaded = await loadPersistentHintsState(aiHintsCurrentChallengeId);
  if (!loaded) {
    const hintText1 = document.getElementById("ai-hint-text-1");
    if (hintText1) hintText1.textContent = "Could not load hints right now. Please try again.";
  }

  renderUnlockedHints(aiHintsCurrentChallengeId);

  const overlay = document.getElementById("ai-hints-modal-overlay");
  if (overlay) {
    overlay.style.display = "flex";
    document.body.style.overflow = "hidden";
  }
}

function closeAiHintsModal(force) {
  if (force === true || (force && force.target === document.getElementById("ai-hints-modal-overlay"))) {
    const overlay = document.getElementById("ai-hints-modal-overlay");
    if (overlay) overlay.style.display = "none";
    setAiHintsLoading(false);
    document.body.style.overflow = "";
  }
}

window.closeAiHintsModal = closeAiHintsModal;

async function revealHint(level) {
  if (!aiHintsCurrentChallengeId) return;
  const challengeId = aiHintsCurrentChallengeId;
  const state = aiHintsCacheByChallenge.get(challengeId) || { hints: [], unlockedLevel: 0 };
  const unlocked = Number(state.unlockedLevel) || 0;

  if (level !== unlocked + 1) return;

  const loaded = await ensureHintsLoaded(challengeId, level);
  if (!loaded) return;

  setAiHintsLoading(true, `Generating hint ${level}…`);
  const res = await api.getHints(challengeId, level).catch(() => null);
  setAiHintsLoading(false);
  if (!res?.success || !Array.isArray(res.hints)) {
    console.error("[AI Hints API Error]", res);
    const text = document.getElementById(`ai-hint-text-${level}`);
    const detail = res?.error?.message || res?.error?.stack || "";
    if (text) text.textContent = `${res?.message || "Could not unlock this hint right now."}${detail ? `\n\n${detail}` : ""}`;
    return;
  }

  const normalized = res.hints.slice(0, 4).map((h, idx) => ({
    level: Number(h?.level) || idx + 1,
    text: String(h?.text || "").trim(),
  }));

  aiHintsCacheByChallenge.set(challengeId, {
    hints: normalized,
    unlockedLevel: Number(res.unlockedLevel) || unlocked,
  });

  renderUnlockedHints(challengeId);
}

document.getElementById("ai-hint-1")?.addEventListener("click", () => revealHint(1));
document.getElementById("ai-hint-2")?.addEventListener("click", () => revealHint(2));
document.getElementById("ai-hint-3")?.addEventListener("click", () => revealHint(3));
document.getElementById("ai-hint-4")?.addEventListener("click", () => revealHint(4));

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

  if (res.feedback) {
    solAlert(`Saved!\n\nAI feedback:\n${res.feedback}`, "success");
  } else {
    closeSubmitModal(true);
  }
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
        ${s.plagiarism_percent !== null && s.plagiarism_percent !== undefined
          ? `<div class="vs-plagiarism ${s.plagiarism_percent >= 70 ? "vs-plagiarism--high" : s.plagiarism_percent >= 40 ? "vs-plagiarism--mid" : "vs-plagiarism--low"}">
               <div><strong>Similarity score: ${s.plagiarism_percent}%</strong>${s.plagiarism_with ? ` (closest: ${esc(s.plagiarism_with)})` : ""}</div>
               ${s.plagiarism_details
                 ? `<div class="vs-plagiarism__meta">
                      <span>Risk: <strong>${esc((s.plagiarism_details.risk_level || "low").toUpperCase())}</strong></span>
                      <span>Words: <strong>${s.plagiarism_details.compared_word_count || 0}</strong></span>
                    </div>
                    <div class="vs-plagiarism__breakdown">
                      <span>Unique words: ${s.plagiarism_details.unique_word_jaccard ?? 0}%</span>
                      <span>3-gram phrases: ${s.plagiarism_details.phrase_overlap_3gram ?? 0}%</span>
                      <span>Char pattern: ${s.plagiarism_details.char_pattern_similarity ?? 0}%</span>
                      <span>Longest run: ${s.plagiarism_details.longest_common_run_words ?? 0} words</span>
                    </div>
                    ${(s.plagiarism_details.overlap_phrases || []).length
                      ? `<div class="vs-plagiarism__phrases">Shared phrases: ${(s.plagiarism_details.overlap_phrases || []).map((p) => `“${esc(p)}”`).join(", ")}</div>`
                      : ""}`
                 : ""}
             </div>`
          : ""}
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
