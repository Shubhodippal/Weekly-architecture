const GRADE_ORDER = ["wrong", "partial", "almost", "correct"];
const GRADE_LABELS = {
  wrong: "Wrong",
  partial: "Partially Correct",
  almost: "Almost Correct",
  correct: "Correct",
};
const DEFAULT_POINTS = {
  wrong: 0,
  partial: 5,
  almost: 15,
  correct: 20,
};
const HINT_LEVELS = [1, 2, 3, 4];
const DEFAULT_HINT_COSTS = {
  1: 0,
  2: 5,
  3: 10,
  4: 15,
};
const DEFAULT_FINANCE_RATES = {
  fd: 8,
  rd: 10,
};
const DEFAULT_BANKING_META = {
  credit_annual_rate: 12,
  credit_monthly_rate: 12,
  default_credit_limit: 500,
};

let currentSettings = { ...DEFAULT_POINTS };
let currentHintCosts = { ...DEFAULT_HINT_COSTS };
let currentFinanceRates = { ...DEFAULT_FINANCE_RATES };
let currentBankingMeta = { ...DEFAULT_BANKING_META };

function byId(id) {
  return document.getElementById(id);
}

function fmtPts(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

function showAlert(message, type = "info") {
  const el = byId("grading-alert");
  if (!el) return;
  el.textContent = message;
  el.className = `alert alert-${type} show`;
}

function clearAlert() {
  const el = byId("grading-alert");
  if (!el) return;
  el.textContent = "";
  el.className = "alert";
}

function setInputs(settings) {
  byId("grade-wrong").value = settings.wrong;
  byId("grade-partial").value = settings.partial;
  byId("grade-almost").value = settings.almost;
  byId("grade-correct").value = settings.correct;
}

function setHintInputs(costs) {
  byId("hint-cost-1").value = 0;
  byId("hint-cost-2").value = costs[2];
  byId("hint-cost-3").value = costs[3];
  byId("hint-cost-4").value = costs[4];
}

function setFinanceInputs(rates) {
  byId("finance-rate-fd").value = rates.fd;
  byId("finance-rate-rd").value = rates.rd;
}

function setBankingInputs(meta) {
  byId("banking-credit-rate").value = meta.credit_monthly_rate ?? meta.credit_annual_rate;
  byId("banking-credit-limit").value = meta.default_credit_limit;
}

function setStats(settings) {
  byId("stat-wrong").textContent = settings.wrong;
  byId("stat-partial").textContent = settings.partial;
  byId("stat-almost").textContent = settings.almost;
  byId("stat-correct").textContent = settings.correct;
}

function renderPreview(settings) {
  const preview = byId("grading-preview");
  preview.innerHTML = GRADE_ORDER.map((grade) => `
    <div class="grading-preview__row">
      <span class="grading-preview__grade">${GRADE_LABELS[grade]}</span>
      <span class="grading-preview__points">${fmtPts(settings[grade])} pts</span>
    </div>
  `).join("");
}

function renderHintCostPreview(costs) {
  const preview = byId("hint-cost-preview");
  preview.innerHTML = HINT_LEVELS.map((level) => `
    <div class="grading-preview__row">
      <span class="grading-preview__grade">Hint ${level}</span>
      <span class="grading-preview__points">${fmtPts(costs[level])} pts</span>
    </div>
  `).join("");
}

function renderFinanceRatePreview(rates) {
  const preview = byId("finance-rate-preview");
  preview.innerHTML = `
    <div class="grading-preview__row">
      <span class="grading-preview__grade">FD Annual Interest</span>
      <span class="grading-preview__points">${rates.fd}%</span>
    </div>
    <div class="grading-preview__row">
      <span class="grading-preview__grade">RD Annual Interest</span>
      <span class="grading-preview__points">${rates.rd}%</span>
    </div>
    <div class="grading-preview__row">
      <span class="grading-preview__grade">Credit Monthly Compound Interest</span>
      <span class="grading-preview__points">${currentBankingMeta.credit_monthly_rate ?? currentBankingMeta.credit_annual_rate}%</span>
    </div>
    <div class="grading-preview__row">
      <span class="grading-preview__grade">Default Credit Limit</span>
      <span class="grading-preview__points">${currentBankingMeta.default_credit_limit} pts</span>
    </div>
  `;
}

function readInputs() {
  const next = {};
  for (const grade of GRADE_ORDER) {
    const input = byId(`grade-${grade}`);
    const value = parseInt(input.value, 10);
    if (Number.isNaN(value)) {
      throw new Error(`${GRADE_LABELS[grade]} must be an integer`);
    }
    next[grade] = value;
  }
  return next;
}

function readHintInputs() {
  const next = { 1: 0 };
  for (const level of [2, 3, 4]) {
    const value = parseInt(byId(`hint-cost-${level}`).value, 10);
    if (Number.isNaN(value) || value < 0) {
      throw new Error(`Hint ${level} cost must be a non-negative integer`);
    }
    next[level] = value;
  }
  return next;
}

function readFinanceInputs() {
  const fd = Number.parseFloat(byId("finance-rate-fd").value);
  const rd = Number.parseFloat(byId("finance-rate-rd").value);
  if (Number.isNaN(fd) || fd < 0) {
    throw new Error("FD interest rate must be a non-negative number");
  }
  if (Number.isNaN(rd) || rd < 0) {
    throw new Error("RD interest rate must be a non-negative number");
  }
  return {
    fd: Number(fd.toFixed(2)),
    rd: Number(rd.toFixed(2)),
  };
}

function readBankingInputs() {
  const creditMonthlyRate = Number.parseFloat(byId("banking-credit-rate").value);
  const defaultCreditLimit = Number.parseInt(byId("banking-credit-limit").value, 10);

  if (Number.isNaN(creditMonthlyRate) || creditMonthlyRate < 0) {
    throw new Error("Credit monthly interest must be a non-negative number");
  }
  if (!Number.isInteger(defaultCreditLimit) || defaultCreditLimit < 0) {
    throw new Error("Default credit limit must be a non-negative integer");
  }

  return {
    credit_monthly_rate: Number(creditMonthlyRate.toFixed(2)),
    default_credit_limit: defaultCreditLimit,
  };
}

function bindPreviewListeners() {
  const handler = () => {
    try {
      renderPreview(readInputs());
      renderHintCostPreview(readHintInputs());
      currentBankingMeta = readBankingInputs();
      renderFinanceRatePreview(readFinanceInputs());
      clearAlert();
    } catch {
      // Keep previous preview if inputs are temporarily invalid while typing.
    }
  };

  for (const grade of GRADE_ORDER) {
    byId(`grade-${grade}`).addEventListener("input", handler);
  }
  for (const level of [2, 3, 4]) {
    byId(`hint-cost-${level}`).addEventListener("input", handler);
  }
  byId("finance-rate-fd").addEventListener("input", handler);
  byId("finance-rate-rd").addEventListener("input", handler);
  byId("banking-credit-rate").addEventListener("input", handler);
  byId("banking-credit-limit").addEventListener("input", handler);
}

async function loadSettings() {
  const res = await api.adminGetGradingSettings().catch(() => null);
  if (!res?.success || !res.settings) {
    showAlert(res?.message || "Failed to load grading settings.", "error");
    return false;
  }

  currentSettings = { ...DEFAULT_POINTS, ...res.settings };
  currentHintCosts = { ...DEFAULT_HINT_COSTS, ...(res.hint_costs || {}) };
  currentFinanceRates = { ...DEFAULT_FINANCE_RATES, ...(res.finance_rates || {}) };
  currentBankingMeta = { ...DEFAULT_BANKING_META, ...(res.banking_meta || {}) };
  currentHintCosts[1] = 0;
  setInputs(currentSettings);
  setHintInputs(currentHintCosts);
  setFinanceInputs(currentFinanceRates);
  setBankingInputs(currentBankingMeta);
  setStats(currentSettings);
  renderPreview(currentSettings);
  renderHintCostPreview(currentHintCosts);
  renderFinanceRatePreview(currentFinanceRates);
  clearAlert();
  return true;
}

async function saveSettings() {
  let pointsPayload;
  let hintCostPayload;
  let financeRatesPayload;
  let bankingMetaPayload;
  try {
    pointsPayload = readInputs();
    hintCostPayload = readHintInputs();
    financeRatesPayload = readFinanceInputs();
    bankingMetaPayload = readBankingInputs();
  } catch (err) {
    showAlert(err.message || "Please enter valid numbers.", "error");
    return;
  }

  const btn = byId("save-grading-btn");
  btn.disabled = true;
  btn.textContent = "Saving...";

  const res = await api.adminUpdateGradingSettings({
    points: pointsPayload,
    hint_costs: hintCostPayload,
    finance_rates: financeRatesPayload,
    banking_meta: bankingMetaPayload,
  }).catch(() => null);

  btn.disabled = false;
  btn.textContent = "Save Settings";

  if (!res?.success || !res.settings) {
    showAlert(res?.message || "Failed to save settings.", "error");
    return;
  }

  currentSettings = { ...DEFAULT_POINTS, ...res.settings };
  currentHintCosts = { ...DEFAULT_HINT_COSTS, ...(res.hint_costs || {}) };
  currentFinanceRates = { ...DEFAULT_FINANCE_RATES, ...(res.finance_rates || {}) };
  currentBankingMeta = { ...DEFAULT_BANKING_META, ...(res.banking_meta || {}) };
  currentHintCosts[1] = 0;
  setInputs(currentSettings);
  setHintInputs(currentHintCosts);
  setFinanceInputs(currentFinanceRates);
  setBankingInputs(currentBankingMeta);
  setStats(currentSettings);
  renderPreview(currentSettings);
  renderHintCostPreview(currentHintCosts);
  renderFinanceRatePreview(currentFinanceRates);
  showAlert("Grading, hint, FD/RD rates, and banking controls saved successfully.", "success");
}

byId("save-grading-btn")?.addEventListener("click", saveSettings);
byId("reload-grading-btn")?.addEventListener("click", loadSettings);

byId("logout-btn")?.addEventListener("click", async () => {
  await api.logout().catch(() => null);
  window.location.href = "/index.html";
});

(async () => {
  const me = await api.me().catch(() => null);
  if (!me?.success) {
    window.location.href = "/index.html";
    return;
  }
  if (me.user.role !== "admin") {
    window.location.href = "/dashboard.html";
    return;
  }

  byId("topbar-name").textContent = me.user.name;
  bindPreviewListeners();
  await loadSettings();

  byId("skeleton").style.display = "none";
  byId("content").style.display = "block";
})();
