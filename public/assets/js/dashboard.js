/* Dashboard page logic */

function fmt(dateStr) {
  if (!dateStr) return "Never";
  return new Date(dateStr + "Z").toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

(async () => {
  const res = await api.me().catch(() => null);

  // If not authenticated, go to login
  if (!res || !res.success) {
    window.location.href = "/index.html";
    return;
  }

  const { user } = res;

  // Render avatar initial
  document.getElementById("avatar").textContent = user.name.charAt(0).toUpperCase();

  // Populate profile info
  document.getElementById("user-name").textContent    = user.name;
  document.getElementById("user-email").textContent   = user.email;
  document.getElementById("user-role-badge").textContent = user.role === "admin" ? "⭐ Admin" : "👤 User";
  document.getElementById("user-role-badge").className = `badge badge-${user.role}`;
  document.getElementById("user-last-login").textContent = fmt(user.last_login);
  document.getElementById("user-joined").textContent  = fmt(user.created_at);

  // Topbar
  document.getElementById("topbar-name").textContent = user.name;

  // Show admin quick card only for admin
  if (user.role === "admin") {
    document.getElementById("admin-card").style.display = "flex";
  }

  // Hide skeleton, show content
  document.getElementById("skeleton").style.display = "none";
  document.getElementById("content").style.display  = "block";
})();

// Logout
document.getElementById("logout-btn").addEventListener("click", async () => {
  await api.logout();
  window.location.href = "/index.html";
});
