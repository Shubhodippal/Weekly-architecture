const RD_DAYS = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

const PAYOUT_LABELS = {
  monthly: "Monthly payout",
  quarterly: "Quarterly payout",
  yearly: "Yearly payout",
  closure: "Payout at closure",
  reinvest: "Reinvest",
};

let bankingSnapshot = null;

function byId(id) {
  return document.getElementById(id);
}

function fmtPts(value) {
  return `${Number(value || 0).toLocaleString()} pts`;
}

function fmtDateTime(value) {
  if (!value) return "—";
  const normalized = String(value).includes("T") ? String(value) : String(value).replace(" ", "T") + "Z";
  const dt = new Date(normalized);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function showAlert(message, type = "info") {
  const el = byId("invest-alert");
  if (!el) return;
  if (!message) {
    el.className = "alert";
    el.textContent = "";
    return;
  }
  el.textContent = message;
  el.className = `alert alert-${type} show`;
}

function extractSnapshot(data) {
  if (!data || typeof data !== "object") return null;
  if (data.debit_balance === undefined || !Array.isArray(data.cards) || !Array.isArray(data.investments)) {
    return null;
  }
  return {
    debit_balance: Number(data.debit_balance || 0),
    credit_balance: Number(data.credit_balance || 0),
    credit_available: Number(data.credit_available || 0),
    finance_rates: data.finance_rates || { fd: 0, rd: 0 },
    banking_meta: data.banking_meta || {},
    cards: data.cards || [],
    investments: data.investments || [],
  };
}

function renderSummary(snapshot) {
  byId("summary-debit").textContent = Number(snapshot.debit_balance || 0).toLocaleString();
  byId("summary-credit").textContent = Number(snapshot.credit_balance || 0).toLocaleString();
  byId("summary-credit-available").textContent = Number(snapshot.credit_available || 0).toLocaleString();
  byId("debit-balance-inline").textContent = fmtPts(snapshot.debit_balance);

  const fdRate = Number(snapshot.finance_rates?.fd || 0);
  const rdRate = Number(snapshot.finance_rates?.rd || 0);
  byId("fd-rate-chip").textContent = `Rate: ${fdRate}% p.a.`;
  byId("rd-rate-chip").textContent = `Rate: ${rdRate}% p.a.`;
}

function renderCards(snapshot) {
  const cardsMeta = byId("cards-meta");
  const debitCard = (snapshot.cards || []).find((c) => c.card_type === "debit");
  const creditCard = (snapshot.cards || []).find((c) => c.card_type === "credit");

  byId("debit-last4").textContent = debitCard ? `•••• ${debitCard.card_last4}` : "••••";
  byId("debit-status").textContent = debitCard ? String(debitCard.status || "active").toUpperCase() : "ACTIVE";

  const placeholder = byId("credit-card-placeholder");
  const live = byId("credit-card-live");

  if (!creditCard || String(creditCard.status) !== "active") {
    byId("credit-last4").textContent = "Not issued";
    placeholder.style.display = "grid";
    live.style.display = "none";
    const applyBtn = byId("credit-apply-btn");
    applyBtn.disabled = false;
    cardsMeta.textContent = "Debit card is auto-issued for every user.";
    return;
  }

  placeholder.style.display = "none";
  live.style.display = "block";

  byId("credit-last4").textContent = `•••• ${creditCard.card_last4}`;
  byId("credit-status").textContent = String(creditCard.status || "active").toUpperCase();
  byId("credit-limit").textContent = fmtPts(creditCard.credit_limit);
  byId("credit-outstanding").textContent = fmtPts(creditCard.outstanding_balance);
  byId("credit-apr").textContent = `${Number(creditCard.annual_interest_rate || 0)}%`;
  cardsMeta.textContent = `Credit available: ${fmtPts(snapshot.credit_available)}`;
}

function renderInvestments(snapshot) {
  const list = byId("investments-list");
  const investments = snapshot.investments || [];
  byId("invest-count").textContent = `${investments.length} plan${investments.length === 1 ? "" : "s"}`;

  if (!investments.length) {
    list.innerHTML = `<div class="empty-state">No investments yet.</div>`;
    return;
  }

  list.innerHTML = investments.map((inv) => {
    const isClosed = String(inv.status) === "closed";
    const isMatured = !isClosed && Boolean(inv.can_close);
    const statusClass = isClosed
      ? "investment-item__status--closed"
      : isMatured
        ? "investment-item__status--matured"
        : "investment-item__status--active";
    const statusText = isClosed ? "Closed" : isMatured ? "Matured" : "Active";
    const plan = String(inv.plan_type || "fd").toUpperCase();
    const payoutMode = PAYOUT_LABELS[String(inv.payout_mode || "closure")] || String(inv.payout_mode || "closure");
    const rdMeta = plan === "RD"
      ? `<div><span>Recurring</span><strong>${fmtPts(inv.recurring_amount)} • ${String(inv.recurring_frequency || "-")}</strong></div>
         <div><span>Installments</span><strong>${inv.installments_paid}/${inv.installments_total}</strong></div>`
      : "";

    return `
      <article class="investment-item">
        <div class="investment-item__head">
          <div class="investment-item__title">${plan} #${inv.id}</div>
          <div class="investment-item__status ${statusClass}">${statusText}</div>
        </div>
        <div class="investment-item__meta">
          <div><span>Principal</span><strong>${fmtPts(inv.principal_points)}</strong></div>
          <div><span>Annual rate</span><strong>${Number(inv.annual_rate || 0)}%</strong></div>
          <div><span>Payout mode</span><strong>${payoutMode}</strong></div>
          <div><span>Opened</span><strong>${fmtDateTime(inv.opened_at)}</strong></div>
          <div><span>Maturity</span><strong>${fmtDateTime(inv.maturity_at)}</strong></div>
          <div><span>Accrued interest</span><strong>${fmtPts(inv.accrued_interest_points || 0)}</strong></div>
          ${rdMeta}
        </div>
        <div class="investment-item__actions">
          ${inv.can_close ? `<button class="btn btn-primary btn-sm js-close-investment" data-id="${inv.id}">Close & Credit</button>` : ""}
        </div>
      </article>
    `;
  }).join("");

  list.querySelectorAll(".js-close-investment").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number.parseInt(btn.dataset.id, 10);
      if (!id) return;
      btn.disabled = true;
      btn.textContent = "Closing...";
      const res = await api.closeBankingInvestment(id).catch(() => null);
      btn.disabled = false;
      btn.textContent = "Close & Credit";
      applySnapshotResponse(res, "Investment closed and credited.");
    });
  });
}

function renderAll(snapshot) {
  renderSummary(snapshot);
  renderCards(snapshot);
  renderInvestments(snapshot);
}

function applySnapshotResponse(res, successMsg = "") {
  if (!res?.success) {
    showAlert(res?.message || "Action failed.", "error");
    return false;
  }
  const next = extractSnapshot(res);
  if (next) {
    bankingSnapshot = next;
    renderAll(next);
  }
  showAlert(res.message || successMsg || "Updated successfully.", "success");
  return true;
}

async function loadOverview() {
  const res = await api.getBankingOverview().catch(() => null);
  if (!res?.success) {
    showAlert(res?.message || "Could not load banking overview.", "error");
    return;
  }
  const snapshot = extractSnapshot(res);
  if (!snapshot) {
    showAlert("Unexpected banking response format.", "error");
    return;
  }
  bankingSnapshot = snapshot;
  renderAll(snapshot);
}

function updateRdTenurePreview() {
  const freq = String(byId("rd-frequency")?.value || "monthly");
  const installments = Number.parseInt(byId("rd-installments")?.value, 10);
  const days = (RD_DAYS[freq] || 30) * (Number.isInteger(installments) && installments > 0 ? installments : 0);
  byId("rd-tenure-preview").textContent = `Maturity duration: ~${days} days`;
}

async function handleApplyCreditCard() {
  const btn = byId("credit-apply-btn");
  btn.disabled = true;
  btn.textContent = "Applying...";
  const res = await api.applyCreditCard().catch(() => null);
  btn.disabled = false;
  btn.textContent = "Apply for Credit Card";
  applySnapshotResponse(res, "Credit card activated.");
}

async function handleDebitSpend(e) {
  e.preventDefault();
  const amount = Number.parseInt(byId("debit-amount").value, 10);
  const note = String(byId("debit-note").value || "").trim();
  if (!Number.isInteger(amount) || amount <= 0) {
    showAlert("Enter a valid debit spend amount.", "error");
    return;
  }

  const btn = byId("debit-spend-btn");
  btn.disabled = true;
  btn.textContent = "Processing...";
  const res = await api.bankingDebitSpend(amount, note).catch(() => null);
  btn.disabled = false;
  btn.textContent = "Debit Spend";
  if (applySnapshotResponse(res, "Debit transaction completed.")) {
    byId("debit-amount").value = "";
    byId("debit-note").value = "";
  }
}

async function handleCreditSpend(e) {
  e.preventDefault();
  const amount = Number.parseInt(byId("credit-spend-amount").value, 10);
  const note = String(byId("credit-spend-note").value || "").trim();
  if (!Number.isInteger(amount) || amount <= 0) {
    showAlert("Enter a valid credit spend amount.", "error");
    return;
  }

  const btn = byId("credit-spend-btn");
  btn.disabled = true;
  btn.textContent = "Processing...";
  const res = await api.bankingCreditSpend(amount, note).catch(() => null);
  btn.disabled = false;
  btn.textContent = "Spend via Credit";
  if (applySnapshotResponse(res, "Credit spend recorded.")) {
    byId("credit-spend-amount").value = "";
    byId("credit-spend-note").value = "";
  }
}

async function handleCreditPay(e) {
  e.preventDefault();
  const amount = Number.parseInt(byId("credit-pay-amount").value, 10);
  if (!Number.isInteger(amount) || amount <= 0) {
    showAlert("Enter a valid credit payment amount.", "error");
    return;
  }

  const btn = byId("credit-pay-btn");
  btn.disabled = true;
  btn.textContent = "Paying...";
  const res = await api.bankingCreditPay(amount).catch(() => null);
  btn.disabled = false;
  btn.textContent = "Pay Credit Bill";
  if (applySnapshotResponse(res, "Credit payment successful.")) {
    byId("credit-pay-amount").value = "";
  }
}

async function handleOpenFd(e) {
  e.preventDefault();
  const principalPoints = Number.parseInt(byId("fd-principal").value, 10);
  const tenureDays = Number.parseInt(byId("fd-tenure").value, 10);
  const payoutMode = String(byId("fd-payout-mode").value || "closure");

  if (!Number.isInteger(principalPoints) || principalPoints <= 0) {
    showAlert("FD principal must be a positive integer.", "error");
    return;
  }
  if (!Number.isInteger(tenureDays) || tenureDays < 1 || tenureDays > 3650) {
    showAlert("FD tenure must be between 1 and 3650 days.", "error");
    return;
  }

  const btn = byId("fd-open-btn");
  btn.disabled = true;
  btn.textContent = "Opening...";
  const res = await api.openFdInvestment({
    principal_points: principalPoints,
    tenure_days: tenureDays,
    payout_mode: payoutMode,
  }).catch(() => null);
  btn.disabled = false;
  btn.textContent = "Open FD";
  if (applySnapshotResponse(res, "FD opened successfully.")) {
    byId("fd-principal").value = "";
  }
}

async function handleOpenRd(e) {
  e.preventDefault();
  const recurringAmount = Number.parseInt(byId("rd-amount").value, 10);
  const recurringFrequency = String(byId("rd-frequency").value || "monthly");
  const installmentsTotal = Number.parseInt(byId("rd-installments").value, 10);
  const payoutMode = String(byId("rd-payout-mode").value || "closure");

  if (!Number.isInteger(recurringAmount) || recurringAmount <= 0) {
    showAlert("RD recurring amount must be a positive integer.", "error");
    return;
  }
  if (!Number.isInteger(installmentsTotal) || installmentsTotal < 1 || installmentsTotal > 240) {
    showAlert("RD installments must be between 1 and 240.", "error");
    return;
  }

  const btn = byId("rd-open-btn");
  btn.disabled = true;
  btn.textContent = "Opening...";
  const res = await api.openRdInvestment({
    recurring_amount: recurringAmount,
    recurring_frequency: recurringFrequency,
    installments_total: installmentsTotal,
    payout_mode: payoutMode,
  }).catch(() => null);
  btn.disabled = false;
  btn.textContent = "Open RD";
  if (applySnapshotResponse(res, "RD opened successfully.")) {
    byId("rd-amount").value = "";
  }
}

byId("logout-btn")?.addEventListener("click", async () => {
  await api.logout().catch(() => null);
  window.location.href = "/index.html";
});

byId("credit-apply-btn")?.addEventListener("click", handleApplyCreditCard);
byId("debit-spend-form")?.addEventListener("submit", handleDebitSpend);
byId("credit-spend-form")?.addEventListener("submit", handleCreditSpend);
byId("credit-pay-form")?.addEventListener("submit", handleCreditPay);
byId("fd-form")?.addEventListener("submit", handleOpenFd);
byId("rd-form")?.addEventListener("submit", handleOpenRd);
byId("rd-frequency")?.addEventListener("change", updateRdTenurePreview);
byId("rd-installments")?.addEventListener("input", updateRdTenurePreview);

(async () => {
  const me = await api.me().catch(() => null);
  if (!me?.success) {
    window.location.href = "/index.html";
    return;
  }

  byId("topbar-name").textContent = me.user.name || "User";
  updateRdTenurePreview();
  await loadOverview();
})();
