// admin.js — Ledger admin panel
// Talks only to /api/admin (a single consolidated endpoint, routed by
// ?action=), which requires the signed session cookie set by the login
// action. This page manages ONLY household (shared) ledgers — personal
// ledgers live solely in each user's own browser storage and are never
// visible to this panel or to the server.

const CATEGORIES = [
  "Food & dining",
  "Transport",
  "Housing",
  "Utilities",
  "Health",
  "Shopping",
  "Entertainment",
  "Education",
  "Income",
  "Savings & investing",
  "Other",
];

const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "NGN",
  "JPY",
  "CNY",
  "INR",
  "CAD",
  "AUD",
  "CHF",
  "ZAR",
  "GHS",
  "KES",
  "EGP",
  "AED",
  "SAR",
  "BRL",
  "MXN",
  "KRW",
  "SGD",
  "HKD",
  "SEK",
  "NOK",
  "PLN",
  "TRY",
  "RUB",
  "NZD",
  "THB",
  "PHP",
  "PKR",
];

let households = [];
let selectedCode = null;
let detailData = null; // { expenses, habits, recurring, settings, meta }
let isDirty = false;

/* ---------- API helpers ---------- */
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (res.status === 401) {
    showLogin();
    throw new Error("Session expired");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ---------- Screen switching ---------- */
function showLogin() {
  document.getElementById("dashboard").style.display = "none";
  document.getElementById("login-screen").style.display = "flex";
}
function showDashboard() {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("dashboard").style.display = "flex";
}

/* ---------- Login ---------- */
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  const submitBtn = document.getElementById("login-submit");
  errorEl.textContent = "";
  submitBtn.disabled = true;
  try {
    await api("/api/admin?action=login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    document.getElementById("login-password").value = "";
    showDashboard();
    await loadHouseholds();
  } catch (err) {
    errorEl.textContent = err.message || "Login failed";
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  try {
    await api("/api/admin?action=logout", { method: "POST" });
  } catch {}
  households = [];
  selectedCode = null;
  detailData = null;
  showLogin();
});

/* ---------- Household list ---------- */
function relativeTime(ts) {
  if (!ts) return "never synced";
  const diffMs = Date.now() - ts;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

async function loadHouseholds() {
  const listEl = document.getElementById("household-list");
  listEl.innerHTML = `<div class="household-list-empty">Loading…</div>`;
  try {
    const data = await api("/api/admin?action=households");
    households = data.households || [];
    document.getElementById("household-count").textContent =
      `${households.length} household${households.length === 1 ? "" : "s"}`;
    renderHouseholdList();
  } catch (err) {
    listEl.innerHTML = `<div class="household-list-empty">${escapeHtml(err.message)}</div>`;
  }
}

function renderHouseholdList() {
  const listEl = document.getElementById("household-list");
  const query = document
    .getElementById("household-search")
    .value.trim()
    .toLowerCase();
  const filtered = households.filter((h) =>
    h.code.toLowerCase().includes(query),
  );

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="household-list-empty">No household codes found.</div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map(
      (h) => `
      <div class="household-row ${h.code === selectedCode ? "active" : ""}" data-code="${escapeHtml(h.code)}">
        <div class="household-row-code">${escapeHtml(h.code)}</div>
        <div class="household-row-updated">${relativeTime(h.updatedAt)}</div>
      </div>`,
    )
    .join("");

  listEl.querySelectorAll(".household-row").forEach((row) => {
    row.addEventListener("click", () => openHousehold(row.dataset.code));
  });
}

document
  .getElementById("household-search")
  .addEventListener("input", renderHouseholdList);
document
  .getElementById("refresh-btn")
  .addEventListener("click", loadHouseholds);

/* ---------- Household detail ---------- */
async function openHousehold(code) {
  if (
    isDirty &&
    !confirm(
      "You have unsaved changes for the current household. Discard them?",
    )
  ) {
    return;
  }
  selectedCode = code;
  isDirty = false;
  renderHouseholdList();

  document.getElementById("empty-state").style.display = "flex";
  document.getElementById("detail-content").style.display = "none";

  try {
    detailData = await api(
      `/api/admin?action=household&code=${encodeURIComponent(code)}`,
    );
    detailData.expenses = detailData.expenses || [];
    detailData.habits = detailData.habits || [];
    detailData.recurring = detailData.recurring || [];
    detailData.settings = detailData.settings || { currency: "USD" };
    renderDetail();
  } catch (err) {
    alert(err.message || "Failed to load household");
  }
}

function markDirty() {
  isDirty = true;
  document.getElementById("save-btn").disabled = false;
}

function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function renderDetail() {
  document.getElementById("empty-state").style.display = "none";
  document.getElementById("detail-content").style.display = "block";
  document.getElementById("save-btn").disabled = true;

  document.getElementById("detail-code").textContent = selectedCode;
  const meta = detailData.meta || {};
  document.getElementById("detail-meta").textContent = meta.updatedAt
    ? `Last synced ${relativeTime(meta.updatedAt)}`
    : "Never synced";

  renderBalanceSummary();
  renderExpensesTable();
  renderHabitsTable();
  renderRecurringTable();
  renderSettings();
}

function renderBalanceSummary() {
  const expenses = detailData.expenses;
  const credits = expenses
    .filter((e) => e.kind === "credit")
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const debits = expenses
    .filter((e) => e.kind === "debit")
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const net = credits - debits;
  document.getElementById("balance-summary").innerHTML = `
    <div class="item"><span class="label">Credits</span><span class="value credit">+${credits.toFixed(2)}</span></div>
    <div class="item"><span class="label">Debits</span><span class="value debit">-${debits.toFixed(2)}</span></div>
    <div class="item"><span class="label">Net balance</span><span class="value">${net.toFixed(2)}</span></div>
    <div class="item"><span class="label">Entries</span><span class="value">${expenses.length}</span></div>
  `;
}

/* -- Expenses table -- */
function renderExpensesTable() {
  const tbody = document.getElementById("expenses-tbody");
  document.getElementById("expenses-count").textContent =
    detailData.expenses.length;

  if (detailData.expenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="no-rows">No expenses recorded.</td></tr>`;
    return;
  }

  tbody.innerHTML = detailData.expenses
    .map(
      (e, i) => `
    <tr data-index="${i}">
      <td><input type="date" value="${e.date || ""}" data-field="date"></td>
      <td><input type="text" value="${escapeHtml(e.desc || "")}" data-field="desc"></td>
      <td><input type="number" step="0.01" value="${e.amount ?? 0}" data-field="amount"></td>
      <td>
        <select data-field="kind">
          <option value="debit" ${e.kind === "debit" ? "selected" : ""}>debit</option>
          <option value="credit" ${e.kind === "credit" ? "selected" : ""}>credit</option>
        </select>
      </td>
      <td>
        <select data-field="category">
          ${CATEGORIES.map((c) => `<option value="${c}" ${e.category === c ? "selected" : ""}>${c}</option>`).join("")}
        </select>
      </td>
      <td><button type="button" class="row-delete-btn" title="Delete row">×</button></td>
    </tr>`,
    )
    .join("");

  wireTableRow(
    tbody,
    detailData.expenses,
    ["date", "desc", "amount", "kind", "category"],
    renderBalanceSummary,
  );
}

/* -- Habits table -- */
function habitStreak(habit) {
  let streak = 0;
  let d = new Date();
  for (;;) {
    const key = d.toISOString().slice(0, 10);
    if (!habit.completions || !habit.completions[key]) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function renderHabitsTable() {
  const tbody = document.getElementById("habits-tbody");
  document.getElementById("habits-count").textContent =
    detailData.habits.length;

  if (detailData.habits.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="no-rows">No habits tracked.</td></tr>`;
    return;
  }

  tbody.innerHTML = detailData.habits
    .map((h, i) => {
      const daysLogged = h.completions
        ? Object.values(h.completions).filter(Boolean).length
        : 0;
      return `
    <tr data-index="${i}">
      <td><input type="text" value="${escapeHtml(h.name || "")}" data-field="name"></td>
      <td style="color:var(--text-dim); font-family:'IBM Plex Mono',monospace;">${daysLogged}</td>
      <td style="color:var(--text-dim); font-family:'IBM Plex Mono',monospace;">${habitStreak(h)}</td>
      <td><button type="button" class="row-delete-btn" title="Delete row">×</button></td>
    </tr>`;
    })
    .join("");

  wireTableRow(tbody, detailData.habits, ["name"], null);
}

/* -- Recurring table -- */
function renderRecurringTable() {
  const tbody = document.getElementById("recurring-tbody");
  document.getElementById("recurring-count").textContent =
    detailData.recurring.length;

  if (detailData.recurring.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="no-rows">No recurring templates.</td></tr>`;
    return;
  }

  tbody.innerHTML = detailData.recurring
    .map(
      (r, i) => `
    <tr data-index="${i}">
      <td><input type="text" value="${escapeHtml(r.desc || "")}" data-field="desc"></td>
      <td><input type="number" step="0.01" value="${r.amount ?? 0}" data-field="amount"></td>
      <td>
        <select data-field="kind">
          <option value="debit" ${r.kind === "debit" ? "selected" : ""}>debit</option>
          <option value="credit" ${r.kind === "credit" ? "selected" : ""}>credit</option>
        </select>
      </td>
      <td>
        <select data-field="category">
          ${CATEGORIES.map((c) => `<option value="${c}" ${r.category === c ? "selected" : ""}>${c}</option>`).join("")}
        </select>
      </td>
      <td><input type="number" min="1" max="31" value="${r.dayOfMonth ?? 1}" data-field="dayOfMonth"></td>
      <td><button type="button" class="row-delete-btn" title="Delete row">×</button></td>
    </tr>`,
    )
    .join("");

  wireTableRow(
    tbody,
    detailData.recurring,
    ["desc", "amount", "kind", "category", "dayOfMonth"],
    null,
  );
}

/* -- Settings -- */
function renderSettings() {
  const select = document.getElementById("settings-currency");
  select.innerHTML = CURRENCIES.map(
    (c) => `<option value="${c}">${c}</option>`,
  ).join("");
  select.value = detailData.settings.currency || "USD";
  select.onchange = () => {
    detailData.settings.currency = select.value;
    markDirty();
  };
}

/* -- Generic row wiring: edits mark dirty + update the underlying array; delete removes the row -- */
function wireTableRow(tbody, dataArray, fields, onChangeExtra) {
  tbody.querySelectorAll("tr[data-index]").forEach((tr) => {
    const idx = Number(tr.dataset.index);

    fields.forEach((field) => {
      const input = tr.querySelector(`[data-field="${field}"]`);
      if (!input) return;
      input.addEventListener("input", () => {
        const value =
          input.type === "number" ? Number(input.value) : input.value;
        dataArray[idx][field] = value;
        markDirty();
        if (onChangeExtra) onChangeExtra();
      });
    });

    const delBtn = tr.querySelector(".row-delete-btn");
    if (delBtn) {
      delBtn.addEventListener("click", () => {
        dataArray.splice(idx, 1);
        markDirty();
        // Re-render whichever table this row belonged to, by identity.
        if (dataArray === detailData.expenses)
          (renderExpensesTable(), renderBalanceSummary());
        else if (dataArray === detailData.habits) renderHabitsTable();
        else if (dataArray === detailData.recurring) renderRecurringTable();
      });
    }
  });
}

/* ---------- Add-row buttons ---------- */
document.getElementById("add-expense-btn").addEventListener("click", () => {
  detailData.expenses.push({
    id: genId(),
    desc: "",
    amount: 0,
    kind: "debit",
    category: "Other",
    date: new Date().toISOString().slice(0, 10),
  });
  markDirty();
  renderExpensesTable();
  renderBalanceSummary();
});

document.getElementById("add-habit-btn").addEventListener("click", () => {
  detailData.habits.push({ id: genId(), name: "", completions: {} });
  markDirty();
  renderHabitsTable();
});

document.getElementById("add-recurring-btn").addEventListener("click", () => {
  detailData.recurring.push({
    id: genId(),
    desc: "",
    amount: 0,
    kind: "debit",
    category: "Other",
    dayOfMonth: 1,
  });
  markDirty();
  renderRecurringTable();
});

/* ---------- Save / delete ---------- */
document.getElementById("save-btn").addEventListener("click", async () => {
  const btn = document.getElementById("save-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const result = await api(
      `/api/admin?action=household&code=${encodeURIComponent(selectedCode)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          expenses: detailData.expenses,
          habits: detailData.habits,
          recurring: detailData.recurring,
          settings: detailData.settings,
        }),
      },
    );
    isDirty = false;
    detailData.meta = { updatedAt: result.updatedAt };
    document.getElementById("detail-meta").textContent =
      `Last synced ${relativeTime(result.updatedAt)}`;
    await loadHouseholds();
    renderHouseholdList();
  } catch (err) {
    alert(err.message || "Save failed");
    btn.disabled = false;
  } finally {
    btn.textContent = "Save changes";
  }
});

document
  .getElementById("delete-household-btn")
  .addEventListener("click", async () => {
    if (!selectedCode) return;
    const confirmed = confirm(
      `Permanently delete household "${selectedCode}"? This removes all its expenses, habits, and recurring items for everyone using that code. This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      await api(
        `/api/admin?action=household&code=${encodeURIComponent(selectedCode)}`,
        { method: "DELETE" },
      );
      selectedCode = null;
      detailData = null;
      isDirty = false;
      document.getElementById("empty-state").style.display = "flex";
      document.getElementById("detail-content").style.display = "none";
      await loadHouseholds();
    } catch (err) {
      alert(err.message || "Delete failed");
    }
  });

window.addEventListener("beforeunload", (e) => {
  if (isDirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

/* ---------- Boot: check for an existing session ---------- */
(async function boot() {
  try {
    const { authenticated } = await api("/api/admin?action=session");
    if (authenticated) {
      showDashboard();
      await loadHouseholds();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
})();
