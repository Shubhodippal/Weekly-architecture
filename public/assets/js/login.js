/* Login page logic — two-step wizard: email → OTP */

const $ = (id) => document.getElementById(id);

let currentEmail = "";

// ── Helpers ──────────────────────────────────────────────────────────────
function showAlert(id, msg, type = "error") {
  const el = $(id);
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
}
function hideAlert(id) {
  const el = $(id);
  el.className = "alert";
  el.textContent = "";
}
function setLoading(btnId, spinnerId, loading) {
  $(btnId).disabled = loading;
  $(spinnerId).style.display = loading ? "inline-block" : "none";
}
function setStep(step) {
  $("step-email").classList.toggle("active", step === 1);
  $("step-otp").classList.toggle("active", step === 2);
  $("step-email").classList.toggle("done", step > 1);

  $("email-section").style.display = step === 1 ? "block" : "none";
  $("otp-section").style.display = step === 2 ? "block" : "none";
}

// ── Step 1: Request OTP ───────────────────────────────────────────────────
$("email-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert("email-alert");

  const email = $("email").value.trim().toLowerCase();
  const name  = $("name").value.trim();

  setLoading("email-btn", "email-spinner", true);
  const res = await api.requestOtp(email, name);
  setLoading("email-btn", "email-spinner", false);

  if (!res.success) {
    // Backend asks for name (new user, name field was hidden)
    if (res.newUser && !name) {
      $("name-group").style.display = "block";
      $("name").required = true;
      $("name").focus();
      showAlert("email-alert", "Looks like you're new! Please enter your name.", "info");
      return;
    }
    showAlert("email-alert", res.message || "Something went wrong.");
    return;
  }

  currentEmail = email;
  $("otp-email-hint").textContent = email;
  setStep(2);
  $("otp").focus();
});

// ── Step 2: Verify OTP ────────────────────────────────────────────────────
$("otp-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert("otp-alert");

  const otp = $("otp").value.trim();
  if (otp.length !== 6 || !/^\d+$/.test(otp)) {
    showAlert("otp-alert", "Please enter the 6-digit code from your email.");
    return;
  }

  setLoading("otp-btn", "otp-spinner", true);
  const res = await api.verifyOtp(currentEmail, otp);
  setLoading("otp-btn", "otp-spinner", false);

  if (!res.success) {
    showAlert("otp-alert", res.message || "Invalid OTP.");
    $("otp").value = "";
    $("otp").focus();
    return;
  }

  // Redirect based on role (admins land on dashboard by default)
  window.location.href = "/dashboard.html";
});

// ── Resend OTP ────────────────────────────────────────────────────────────
$("resend-btn").addEventListener("click", async () => {
  hideAlert("otp-alert");
  $("resend-btn").disabled = true;
  $("resend-btn").textContent = "Sending...";
  const res = await api.requestOtp(currentEmail, "");
  $("resend-btn").textContent = "Resend OTP";
  $("resend-btn").disabled = false;
  const type = res.success ? "success" : "error";
  showAlert("otp-alert", res.success ? "New OTP sent!" : res.message, type);
});

// ── Back to email ──────────────────────────────────────────────────────────
$("back-btn").addEventListener("click", () => {
  hideAlert("otp-alert");
  $("otp").value = "";
  setStep(1);
});

// ── OTP auto-submit ────────────────────────────────────────────────────────
$("otp").addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
  if (e.target.value.length === 6) {
    document.getElementById("otp-form").requestSubmit();
  }
});

// ── Init: redirect if already logged in ───────────────────────────────────
(async () => {
  const res = await api.me().catch(() => null);
  if (res && res.success) {
    window.location.href = "/dashboard.html";
  }
})();
