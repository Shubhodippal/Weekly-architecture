/* Admin panel logic */

function fmt(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "Z").toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let allUsers = [];

async function loadUsers() {
  const res = await api.listUsers().catch(() => null);
  if (!res || !res.success) {
    document.getElementById("table-body").innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:#6b7280;padding:32px">Failed to load users.</td></tr>';
    return;
  }

  allUsers = res.users;
  const admins = allUsers.filter((u) => u.role === "admin").length;
  const users  = allUsers.filter((u) => u.role === "user").length;

  document.getElementById("stat-total").textContent  = res.total;
  document.getElementById("stat-admins").textContent = admins;
  document.getElementById("stat-users").textContent  = users;

  renderTable(allUsers);
}

function renderTable(users) {
  const tbody = document.getElementById("table-body");
  if (!users.length) {
    tbody.innerHTML =
      '<tr><td colspan="6"><div class="empty-state"><div class="empty-state__icon">👥</div>No users found.</div></td></tr>';
    return;
  }

  tbody.innerHTML = users
    .map(
      (u) => `
      <tr data-id="${u.id}">
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:34px;height:34px;border-radius:50%;background:#4f46e5;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0;">
              ${escHtml(u.name.charAt(0).toUpperCase())}
            </div>
            <div>
              <div style="font-weight:600;color:#111827;">${escHtml(u.name)}</div>
            </div>
          </div>
        </td>
        <td style="color:#6b7280;">${escHtml(u.email)}</td>
        <td><span class="badge badge-${u.role}">${u.role === "admin" ? "⭐ Admin" : "👤 User"}</span></td>
        <td>${fmt(u.last_login)}</td>
        <td>${fmt(u.created_at)}</td>
        <td>
          <button
            class="btn btn-danger btn-sm delete-btn"
            data-id="${u.id}"
            data-name="${escHtml(u.name)}"
            ${u.role === "admin" ? "disabled title='Cannot delete admin'" : ""}
          >
            Delete
          </button>
        </td>
      </tr>`
    )
    .join("");

  // Attach delete handlers
  tbody.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", handleDelete);
  });
}

async function handleDelete(e) {
  const btn  = e.currentTarget;
  const id   = btn.dataset.id;
  const name = btn.dataset.name;

  if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;

  btn.disabled = true;
  btn.textContent = "Deleting…";

  const res = await api.deleteUser(id).catch(() => null);
  if (!res || !res.success) {
    alert(res?.message || "Failed to delete user.");
    btn.disabled = false;
    btn.textContent = "Delete";
    return;
  }

  // Remove row from DOM
  btn.closest("tr").remove();

  // Update stats
  allUsers = allUsers.filter((u) => String(u.id) !== String(id));
  const admins = allUsers.filter((u) => u.role === "admin").length;
  document.getElementById("stat-total").textContent  = allUsers.length;
  document.getElementById("stat-admins").textContent = admins;
  document.getElementById("stat-users").textContent  = allUsers.length - admins;
}

// Search / filter
document.getElementById("search").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  const filtered = allUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.includes(q)
  );
  renderTable(filtered);
});

// Logout
document.getElementById("logout-btn").addEventListener("click", async () => {
  await api.logout();
  window.location.href = "/index.html";
});

// ── Bootstrap ─────────────────────────────────────────────────────────────
(async () => {
  const res = await api.me().catch(() => null);

  if (!res || !res.success) {
    window.location.href = "/index.html";
    return;
  }

  if (res.user.role !== "admin") {
    window.location.href = "/dashboard.html";
    return;
  }

  document.getElementById("topbar-name").textContent = res.user.name;
  document.getElementById("skeleton").style.display = "none";
  document.getElementById("content").style.display  = "block";

  await loadUsers();
})();
