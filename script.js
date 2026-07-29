// @ts-nocheck

/* =========================================================================
   Preloader / busy indicator
   ========================================================================= */
const MIN_PRELOAD_MS = 900;

function showBusy(label) {
  const el = document.getElementById("busy-indicator");
  const lbl = document.getElementById("busy-label");
  if (!el) return;
  if (lbl) lbl.textContent = label || "saving…";
  el.classList.add("show");
}

function hideBusy() {
  const el = document.getElementById("busy-indicator");
  if (el) el.classList.remove("show");
}

function hidePreloader() {
  const el = document.getElementById("preloader");
  if (el) el.classList.add("hidden");
}

/* =========================================================================
   Categories & currencies
   ========================================================================= */
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

function populateCategorySelect() {
  document.getElementById("exp-category").innerHTML = CATEGORIES.map(
    (c) => `<option value="${c}">${c}</option>`,
  ).join("");
}

const CURRENCIES = [
  ["USD", "US Dollar"],
  ["EUR", "Euro"],
  ["GBP", "British Pound"],
  ["NGN", "Nigerian Naira"],
  ["JPY", "Japanese Yen"],
  ["CNY", "Chinese Yuan"],
  ["INR", "Indian Rupee"],
  ["CAD", "Canadian Dollar"],
  ["AUD", "Australian Dollar"],
  ["CHF", "Swiss Franc"],
  ["ZAR", "South African Rand"],
  ["GHS", "Ghanaian Cedi"],
  ["KES", "Kenyan Shilling"],
  ["EGP", "Egyptian Pound"],
  ["AED", "UAE Dirham"],
  ["SAR", "Saudi Riyal"],
  ["BRL", "Brazilian Real"],
  ["MXN", "Mexican Peso"],
  ["KRW", "South Korean Won"],
  ["SGD", "Singapore Dollar"],
  ["HKD", "Hong Kong Dollar"],
  ["SEK", "Swedish Krona"],
  ["NOK", "Norwegian Krone"],
  ["PLN", "Polish Zloty"],
  ["TRY", "Turkish Lira"],
  ["RUB", "Russian Ruble"],
  ["NZD", "New Zealand Dollar"],
  ["THB", "Thai Baht"],
  ["PHP", "Philippine Peso"],
  ["PKR", "Pakistani Rupee"],
];

let currentCurrency = "USD";

function currencyFormatter() {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currentCurrency,
    });
  } catch (e) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
    });
  }
}

function currencyDecimals() {
  return currencyFormatter().resolvedOptions().maximumFractionDigits;
}

function money(amount) {
  const f = currencyFormatter();
  return amount < 0 ? "-" + f.format(Math.abs(amount)) : f.format(amount);
}

function populateCurrencySelect() {
  const el = document.getElementById("currency-select");
  el.innerHTML = CURRENCIES.map(
    ([code, name]) => `<option value="${code}">${code} — ${name}</option>`,
  ).join("");
  el.value = currentCurrency;
}

function applyCurrencyToInputs() {
  const decimals = currencyDecimals();
  const step = decimals === 0 ? "1" : (1 / Math.pow(10, decimals)).toString();
  const input = document.getElementById("exp-amount");
  input.step = step;
  input.placeholder = decimals === 0 ? "0" : "0." + "0".repeat(decimals);
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const dayLabel = (dateStr) =>
  new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "narrow",
  });

document.getElementById("today-badge").textContent =
  new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

/* =========================================================================
   State
   ========================================================================= */
let expenses = [];
let habits = [];
let recurringTemplates = [];
let currentKind = "debit";
let householdId = null;

function isShared() {
  return !!householdId;
}

// True when running standalone (e.g. on Vercel) rather than inside a
// Claude artifact preview. Set by storage-shim.js only when it had to
// install the localStorage fallback (i.e. no native window.storage).
const IS_STANDALONE_DEPLOY = !!window.__usingLocalStorageShim;

function scopedKey(key) {
  return isShared() ? `household:${householdId}:${key}` : key;
}

/* =========================================================================
   Storage backend
   - Personal data: window.storage (native in Claude artifacts, or the
     localStorage-backed shim when standalone).
   - Shared/household data: the /api/household endpoint (real database,
     syncs across devices) when standalone; falls back to window.storage's
     "shared" scope when previewed inside a Claude artifact.
   ========================================================================= */
async function kvFetch(method, key, value) {
  const url = `/api/household?code=${encodeURIComponent(householdId)}&key=${encodeURIComponent(key)}`;
  const opts = { method };
  if (method === "POST") {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify({ value });
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    let msg = "Household request failed";
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch (e) {}
    throw new Error(msg);
  }
  return res.json();
}

let householdError = null;

async function loadKey(key) {
  showBusy(isShared() ? "syncing…" : "loading…");
  try {
    if (isShared()) {
      if (IS_STANDALONE_DEPLOY) {
        const data = await kvFetch("GET", key);
        householdError = null;
        return data.value ? JSON.parse(data.value) : null;
      }
      const t = await window.storage.get(scopedKey(key), true);
      return t ? JSON.parse(t.value) : null;
    }
    const t = await window.storage.get(key, false);
    return t ? JSON.parse(t.value) : null;
  } catch (e) {
    if (isShared() && IS_STANDALONE_DEPLOY)
      householdError = e.message || "Sync failed";
    return null;
  } finally {
    hideBusy();
  }
}

async function saveKey(key, val) {
  showBusy(isShared() ? "syncing…" : "saving…");
  try {
    if (isShared()) {
      if (IS_STANDALONE_DEPLOY) {
        const data = await kvFetch("POST", key, JSON.stringify(val));
        if (typeof data.updatedAt === "number")
          lastKnownUpdatedAt = data.updatedAt;
        householdError = null;
      } else {
        await window.storage.set(scopedKey(key), JSON.stringify(val), true);
      }
    } else {
      await window.storage.set(key, JSON.stringify(val), false);
    }
  } catch (e) {
    console.error(`save ${key} failed`, e);
    if (isShared() && IS_STANDALONE_DEPLOY)
      householdError = e.message || "Sync failed";
  } finally {
    hideBusy();
  }
}

/* -------- Merge-safe save for shared arrays (expenses / habits / recurring) --------
   Fetches the current remote state immediately before writing, unions it
   with local changes by id, and applies any explicit local deletions.
   This means two people editing a shared ledger around the same time both
   keep their changes instead of one silently overwriting the other. */
async function mergeSaveArrayKey(key, localArray, deletedIds, combineFn) {
  if (!isShared() || !IS_STANDALONE_DEPLOY) {
    await saveKey(key, localArray);
    return localArray;
  }
  let remoteArray = [];
  try {
    const remote = await loadKey(key);
    if (Array.isArray(remote)) remoteArray = remote;
  } catch (e) {}

  const byId = new Map();
  remoteArray.forEach((item) => {
    if (!deletedIds.has(item.id)) byId.set(item.id, item);
  });
  localArray.forEach((item) => {
    if (deletedIds.has(item.id)) return;
    const existing = byId.get(item.id);
    byId.set(item.id, combineFn ? combineFn(existing, item) : item);
  });

  const merged = Array.from(byId.values());
  await saveKey(key, merged);
  return merged;
}

function combineHabit(remote, local) {
  if (!remote) return local;
  if (!local) return remote;
  return {
    ...remote,
    ...local,
    completions: {
      ...(remote.completions || {}),
      ...(local.completions || {}),
    },
  };
}

async function persistExpenses(deletedIds = []) {
  expenses = await mergeSaveArrayKey(
    "expenses",
    expenses,
    new Set(deletedIds),
    null,
  );
}
async function persistHabits(deletedIds = []) {
  habits = await mergeSaveArrayKey(
    "habits",
    habits,
    new Set(deletedIds),
    combineHabit,
  );
}
async function persistRecurring(deletedIds = []) {
  recurringTemplates = await mergeSaveArrayKey(
    "recurring",
    recurringTemplates,
    new Set(deletedIds),
    null,
  );
}

/* =========================================================================
   Household real-time sync (polling)
   ========================================================================= */
let lastKnownUpdatedAt = 0;
let pollTimer = null;
let lastSyncedAt = null;

function manageHouseholdPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (!IS_STANDALONE_DEPLOY || !isShared()) return;

  pollTimer = setInterval(async () => {
    try {
      const meta = await kvFetch("GET", "__meta");
      const remoteUpdatedAt = meta.value ? JSON.parse(meta.value).updatedAt : 0;
      if (remoteUpdatedAt && remoteUpdatedAt > lastKnownUpdatedAt) {
        lastKnownUpdatedAt = remoteUpdatedAt;
        expenses = (await loadKey("expenses")) || [];
        habits = (await loadKey("habits")) || [];
        recurringTemplates = (await loadKey("recurring")) || [];
        renderExpenses();
        renderHabits();
      }
      lastSyncedAt = Date.now();
      householdError = null;
    } catch (e) {
      householdError = e.message || "Sync failed";
    }
    updateHouseholdUI();
  }, 3000);
}

/* =========================================================================
   Data load / device settings
   ========================================================================= */
async function loadData() {
  try {
    const e = await window.storage.get("device-settings");
    const t = e ? JSON.parse(e.value) : null;
    if (t && t.currency) currentCurrency = t.currency;
    if (t && t.householdId) householdId = t.householdId;
  } catch (e) {}

  expenses = (await loadKey("expenses")) || [];
  habits = (await loadKey("habits")) || [];
  recurringTemplates = (await loadKey("recurring")) || [];

  if (isShared()) {
    try {
      if (IS_STANDALONE_DEPLOY) {
        const meta = await kvFetch("GET", "__meta");
        lastKnownUpdatedAt = meta.value ? JSON.parse(meta.value).updatedAt : 0;
        const settingsData = await kvFetch("GET", "settings");
        if (settingsData.value) {
          const s = JSON.parse(settingsData.value);
          if (s.currency) currentCurrency = s.currency;
        }
      } else {
        const t = await window.storage.get(scopedKey("settings"), true);
        const s = t ? JSON.parse(t.value) : null;
        if (s && s.currency) currentCurrency = s.currency;
      }
    } catch (e) {}
  }

  await generateDueRecurring();
  populateCurrencySelect();
  populateCategorySelect();
  applyCurrencyToInputs();
  updateHouseholdUI();
  renderExpenses();
  renderHabits();
  manageHouseholdPolling();
}

async function saveDeviceSettings() {
  showBusy("saving…");
  try {
    await window.storage.set(
      "device-settings",
      JSON.stringify({ currency: currentCurrency, householdId: householdId }),
      false,
    );
  } catch (e) {
    console.error("save device settings failed", e);
  } finally {
    hideBusy();
  }
}

async function saveSettings() {
  await saveDeviceSettings();
  if (isShared()) await saveKey("settings", { currency: currentCurrency });
}

/* =========================================================================
   Recurring expenses
   ========================================================================= */
function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

async function generateDueRecurring() {
  if (recurringTemplates.length === 0) return;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthKeyStr = `${year}-${String(month + 1).padStart(2, "0")}`;
  let generated = false;

  recurringTemplates.forEach((tmpl) => {
    if (
      expenses.some(
        (e) => e.recurringId === tmpl.id && e.generatedMonth === monthKeyStr,
      )
    )
      return;
    const day = Math.min(tmpl.dayOfMonth, daysInMonth(year, month));
    if (now.getDate() < day) return;
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    expenses.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      desc: tmpl.desc,
      amount: tmpl.amount,
      kind: tmpl.kind,
      category: tmpl.category,
      date,
      recurringId: tmpl.id,
      generatedMonth: monthKeyStr,
    });
    generated = true;
  });

  if (generated) await persistExpenses();
}

/* =========================================================================
   Household UI
   ========================================================================= */
function updateHouseholdUI() {
  const toggle = document.getElementById("household-toggle");
  const status = document.getElementById("household-status");

  if (isShared()) {
    toggle.textContent = "Shared: " + householdId;
    let syncNote = "";
    if (IS_STANDALONE_DEPLOY) {
      if (householdError) {
        syncNote = ` <span class="sync-bad">⚠ ${escapeHtml(householdError)}</span>`;
      } else {
        const secondsAgo = lastSyncedAt
          ? Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000))
          : null;
        syncNote = ` <span class="sync-live"><span class="sync-dot"></span>${
          secondsAgo === null ? "syncing…" : `synced ${secondsAgo}s ago`
        }</span>`;
      }
    }
    status.innerHTML = `You're viewing the shared ledger for code "${escapeHtml(householdId)}". Anyone with this code sees the same data.${syncNote}`;
  } else {
    toggle.textContent = "Personal";
    status.textContent =
      "You're on your own private ledger. No one else can see it.";
  }
}

/* =========================================================================
   Habits helpers
   ========================================================================= */
function last7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function computeStreak(habit) {
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

function tallySVG(done) {
  return `<svg viewBox="0 0 16 24"><line x1="8" y1="2" x2="8" y2="22" stroke="${
    done ? "var(--habit)" : "var(--habit-off)"
  }" stroke-width="2.4" stroke-linecap="round"/></svg>`;
}

/* =========================================================================
   Rendering — expenses
   ========================================================================= */
function renderExpenses() {
  const container = document.getElementById("ledger-rows");

  if (expenses.length === 0) {
    container.innerHTML =
      '<div class="empty">No entries yet. Add your first line above.</div>';
  } else {
    container.innerHTML = expenses
      .slice()
      .reverse()
      .map((e) => {
        const sign = e.kind === "debit" ? "-" : "+";
        const kindClass = e.kind === "debit" ? "debit" : "credit";
        const dateLabel = new Date(e.date + "T00:00:00").toLocaleDateString(
          "en-US",
          { month: "short", day: "numeric" },
        );
        const amountStr = currencyFormatter().format(e.amount);
        const catTag = e.category
          ? `<span class="cat-tag">${escapeHtml(e.category)}</span>`
          : "";
        const recurTag = e.recurringId
          ? '<span class="recur-tag">monthly</span>'
          : "";
        return `<div class="ledger-row">
        <div class="ledger-row-top">
          <div class="ledger-row-desc">${catTag}<span class="desc-text">${escapeHtml(e.desc)}</span></div>
          <span class="amt ${kindClass}">${sign}${amountStr}</span>
          <span class="rm" data-id="${e.id}" title="Remove">×</span>
        </div>
        <div class="ledger-row-meta"><span class="d">${dateLabel}</span>${recurTag}</div>
      </div>`;
      })
      .join("");
  }

  const balance = expenses.reduce(
    (sum, e) => sum + (e.kind === "debit" ? -e.amount : e.amount),
    0,
  );
  const balanceEl = document.getElementById("balance-value");
  balanceEl.textContent = money(balance);
  balanceEl.className =
    "value" + (balance < 0 ? " neg" : balance > 0 ? " pos" : "");

  container.querySelectorAll(".rm").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = el.dataset.id;
      expenses = expenses.filter((e) => e.id !== id);
      renderExpenses(); // optimistic: update immediately
      await persistExpenses([id]);
      renderExpenses(); // reconcile with any concurrent remote changes
    });
  });

  renderMonthlyTotals();
}

function monthKey(date) {
  return date.slice(0, 7);
}

function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function populateMonthSelect() {
  const el = document.getElementById("month-select");
  const months = Array.from(new Set(expenses.map((e) => monthKey(e.date))));
  const current = todayStr().slice(0, 7);
  if (!months.includes(current)) months.push(current);
  months.sort().reverse();
  const prevValue = el.value;
  el.innerHTML = months
    .map((m) => `<option value="${m}">${monthLabel(m)}</option>`)
    .join("");
  el.value = months.includes(prevValue) ? prevValue : current;
}

function renderMonthlyTotals() {
  populateMonthSelect();
  const selected = document.getElementById("month-select").value;
  const body = document.getElementById("monthly-totals-body");
  const monthExpenses = expenses.filter((e) => monthKey(e.date) === selected);

  const spent = monthExpenses
    .filter((e) => e.kind === "debit")
    .reduce((s, e) => s + e.amount, 0);
  const received = monthExpenses
    .filter((e) => e.kind === "credit")
    .reduce((s, e) => s + e.amount, 0);
  const net = received - spent;
  const fmt = currencyFormatter();

  const byCategory = {};
  monthExpenses
    .filter((e) => e.kind === "debit")
    .forEach((e) => {
      const cat = e.category || "Other";
      byCategory[cat] = (byCategory[cat] || 0) + e.amount;
    });

  const max = Math.max(1, ...Object.values(byCategory));
  const bars = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([cat, amt]) => `
    <div class="cat-bar-row">
      <span class="cat-bar-label">${escapeHtml(cat)}</span>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${((amt / max) * 100).toFixed(0)}%"></div></div>
      <span class="cat-bar-amt">${fmt.format(amt)}</span>
    </div>`,
    )
    .join("");

  body.innerHTML = `
    <div class="ms-totals">
      <div class="ms-stat"><span class="ms-label">Spent</span><span class="ms-value debit">${fmt.format(spent)}</span></div>
      <div class="ms-stat"><span class="ms-label">Received</span><span class="ms-value credit">${fmt.format(received)}</span></div>
      <div class="ms-stat"><span class="ms-label">Net</span><span class="ms-value">${
        net < 0 ? "-" + fmt.format(Math.abs(net)) : fmt.format(net)
      }</span></div>
    </div>
    ${bars ? `<div class="cat-breakdown">${bars}</div>` : '<div class="empty" style="padding:0.4rem 0;">No spending logged for this month yet.</div>'}
  `;
}

/* =========================================================================
   Rendering — habits
   ========================================================================= */
function renderHabits() {
  const container = document.getElementById("habit-list");

  if (habits.length === 0) {
    container.innerHTML =
      '<div class="empty">No habits yet. Add one above to start tallying.</div>';
    return;
  }

  const days = last7Days();
  container.innerHTML = habits
    .map((h) => {
      const streak = computeStreak(h);
      const tally = days
        .map((d) => {
          const done = !!(h.completions && h.completions[d]);
          return `<div class="tally-day" data-habit="${h.id}" data-day="${d}">
        <div class="tally-mark">${tallySVG(done)}</div>
        <div class="tally-lbl">${dayLabel(d)}</div>
      </div>`;
        })
        .join("");
      return `<div class="habit-row">
      <div class="habit-top">
        <span class="habit-name">${escapeHtml(h.name)}</span>
        <span style="display:flex; align-items:center; gap:0.6rem;">
          <span class="streak">${streak} day streak</span>
          <button type="button" class="heatmap-toggle" data-habit="${h.id}">year view</button>
          <span class="habit-rm" data-id="${h.id}" title="Remove habit">×</span>
        </span>
      </div>
      <div class="tally">${tally}</div>
      <div class="heatmap-wrap" id="heatmap-${h.id}" style="display:none;"></div>
    </div>`;
    })
    .join("");

  container.querySelectorAll(".tally-day").forEach((el) => {
    el.addEventListener("click", async () => {
      const habitId = el.dataset.habit;
      const day = el.dataset.day;
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return;
      habit.completions = habit.completions || {};
      habit.completions[day] = !habit.completions[day];
      renderHabits(); // optimistic
      await persistHabits();
      renderHabits(); // reconcile
    });
  });

  container.querySelectorAll(".habit-rm").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = el.dataset.id;
      habits = habits.filter((h) => h.id !== id);
      renderHabits(); // optimistic
      await persistHabits([id]);
      renderHabits(); // reconcile
    });
  });

  container.querySelectorAll(".heatmap-toggle").forEach((el) => {
    el.addEventListener("click", () => {
      const habitId = el.dataset.habit;
      const wrap = document.getElementById("heatmap-" + habitId);
      if (wrap.style.display !== "none") {
        wrap.style.display = "none";
        el.textContent = "year view";
      } else {
        renderHeatmap(
          wrap,
          habits.find((h) => h.id === habitId),
        );
        wrap.style.display = "block";
        el.textContent = "hide year view";
      }
    });
  });
}

function renderHeatmap(container, habit) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const start = new Date(today);
  start.setDate(start.getDate() - 370 - (6 - dow));

  let cellsHtml = "";
  const cursor = new Date(start);
  for (let i = 0; i < 378; i++) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const done = !!(habit.completions && habit.completions[dateStr]);
    const isToday = dateStr === todayStr();
    cellsHtml +=
      cursor > today
        ? '<div style="width:9px; height:9px;"></div>'
        : `<div class="heatmap-cell${done ? " done" : ""}${isToday ? " today" : ""}" data-habit="${habit.id}" data-day="${dateStr}" title="${dateStr}${done ? " — done" : ""}"></div>`;
    cursor.setDate(cursor.getDate() + 1);
  }

  container.innerHTML = `<div class="heatmap-grid">${cellsHtml}</div><div class="heatmap-legend">Past year, one square per day — click any square to toggle it</div>`;

  container.querySelectorAll(".heatmap-cell").forEach((cell) => {
    cell.addEventListener("click", async () => {
      const habitId = cell.dataset.habit;
      const day = cell.dataset.day;
      const h = habits.find((x) => x.id === habitId);
      if (!h) return;
      h.completions = h.completions || {};
      h.completions[day] = !h.completions[day];
      renderHabits();
      await persistHabits();
      renderHabits();
      const wrap = document.getElementById("heatmap-" + habitId);
      const toggleBtn = document.querySelector(
        `.heatmap-toggle[data-habit="${habitId}"]`,
      );
      if (wrap) {
        renderHeatmap(
          wrap,
          habits.find((x) => x.id === habitId),
        );
        wrap.style.display = "block";
      }
      if (toggleBtn) toggleBtn.textContent = "hide year view";
    });
  });
}

/* =========================================================================
   Utilities
   ========================================================================= */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvField(val) {
  const s = String(val);
  return /["\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportCSV() {
  const rows = [
    ["Date", "Description", "Category", "Type", "Amount", "Currency"],
  ];
  expenses
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((e) => {
      rows.push([
        e.date,
        e.desc,
        e.category || "Other",
        e.kind,
        e.amount.toFixed(currencyDecimals()),
        currentCurrency,
      ]);
    });
  const csv = rows.map((r) => r.map(csvField).join(",")).join("\n");
  downloadFile(`ledger-expenses-${todayStr()}.csv`, csv, "text/csv");
}

function downloadBackup() {
  const backup = {
    version: 2,
    exportedAt: new Date().toISOString(),
    expenses,
    habits,
    recurringTemplates,
    settings: { currency: currentCurrency },
  };
  downloadFile(
    `ledger-backup-${todayStr()}.json`,
    JSON.stringify(backup, null, 2),
    "application/json",
  );
}

async function restoreFromBackup(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    alert(
      "That file doesn't look like a valid backup — it couldn't be read as JSON.",
    );
    return;
  }
  if (!Array.isArray(data.expenses) || !Array.isArray(data.habits)) {
    alert(
      "That file doesn't look like a ledger backup — it's missing expenses or habits.",
    );
    return;
  }
  if (
    !confirm(
      "Restoring will replace everything currently in this ledger with the contents of this backup. Continue?",
    )
  )
    return;

  expenses = data.expenses;
  habits = data.habits;
  recurringTemplates = Array.isArray(data.recurringTemplates)
    ? data.recurringTemplates
    : [];
  if (data.settings && data.settings.currency)
    currentCurrency = data.settings.currency;

  // A restore is an explicit full replace, so bypass the merge logic —
  // even on a shared ledger, this should overwrite, not merge.
  await saveKey("expenses", expenses);
  await saveKey("habits", habits);
  await saveKey("recurring", recurringTemplates);
  await saveSettings();

  populateCurrencySelect();
  applyCurrencyToInputs();
  renderExpenses();
  renderHabits();
  alert("Backup restored.");
}

/* =========================================================================
   Event wiring
   ========================================================================= */
document.getElementById("export-csv-btn").addEventListener("click", exportCSV);
document
  .getElementById("backup-json-btn")
  .addEventListener("click", downloadBackup);
document.getElementById("restore-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) restoreFromBackup(file);
  e.target.value = "";
});
document
  .getElementById("month-select")
  .addEventListener("change", () => renderMonthlyTotals());

document.getElementById("household-toggle").addEventListener("click", () => {
  const section = document.getElementById("household-section");
  section.style.display = section.style.display === "none" ? "block" : "none";
});

document
  .getElementById("household-join-btn")
  .addEventListener("click", async () => {
    const code = document
      .getElementById("household-code")
      .value.trim()
      .toLowerCase()
      .replace(/\s+/g, "-");
    if (!code) return;
    if (
      !confirm(
        `Join the shared ledger "${code}"? Anyone with this code can see and edit it. Your current personal data stays untouched and separate.`,
      )
    )
      return;
    householdId = code;
    lastKnownUpdatedAt = 0;
    lastSyncedAt = null;
    householdError = null;
    await saveDeviceSettings();
    await loadData();
  });

document
  .getElementById("household-leave-btn")
  .addEventListener("click", async () => {
    householdId = null;
    await saveDeviceSettings();
    await loadData();
  });

document.getElementById("guide-toggle").addEventListener("click", () => {
  const section = document.getElementById("guide-section");
  const btn = document.getElementById("guide-toggle");
  const isOpen = section.style.display !== "none";
  section.style.display = isOpen ? "none" : "block";
  btn.textContent = isOpen ? "How to use" : "Hide guide";
});

document
  .getElementById("currency-select")
  .addEventListener("change", async (e) => {
    currentCurrency = e.target.value;
    applyCurrencyToInputs();
    renderExpenses(); // optimistic
    await saveSettings();
  });

document.getElementById("kind-debit").addEventListener("click", () => {
  currentKind = "debit";
  document.getElementById("kind-debit").classList.add("active");
  document.getElementById("kind-credit").classList.remove("active");
});
document.getElementById("kind-credit").addEventListener("click", () => {
  currentKind = "credit";
  document.getElementById("kind-credit").classList.add("active");
  document.getElementById("kind-debit").classList.remove("active");
});

document
  .getElementById("expense-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const desc = document.getElementById("exp-desc").value.trim();
    let amount = parseFloat(document.getElementById("exp-amount").value);
    if (!desc || isNaN(amount) || amount <= 0) return;

    const decimals = currencyDecimals();
    amount =
      Math.round(amount * Math.pow(10, decimals)) / Math.pow(10, decimals);
    const category = document.getElementById("exp-category").value || "Other";
    const recurring = document.getElementById("exp-recurring").checked;

    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      desc,
      amount,
      kind: currentKind,
      category,
      date: todayStr(),
    };

    if (recurring) {
      const tmplId = "tmpl-" + entry.id;
      const dayOfMonth = new Date().getDate();
      recurringTemplates.push({
        id: tmplId,
        desc,
        amount,
        kind: currentKind,
        category,
        dayOfMonth,
      });
      entry.recurringId = tmplId;
      entry.generatedMonth = todayStr().slice(0, 7);
    }

    expenses.push(entry);
    renderExpenses(); // optimistic
    e.target.reset();
    document.getElementById("exp-recurring").checked = false;

    if (recurring) await persistRecurring();
    await persistExpenses();
    renderExpenses(); // reconcile
  });

const CATEGORY_KEYWORDS = {
  "Food & dining": [
    "coffee",
    "lunch",
    "dinner",
    "breakfast",
    "food",
    "restaurant",
    "snack",
    "groceries",
    "grocery",
    "pizza",
    "suya",
    "rice",
  ],
  Transport: [
    "uber",
    "bolt",
    "taxi",
    "bus",
    "fuel",
    "petrol",
    "fare",
    "transport",
    "flight",
    "train",
  ],
  Housing: ["rent", "mortgage", "landlord"],
  Utilities: [
    "electricity",
    "light",
    "water",
    "internet",
    "wifi",
    "airtime",
    "data",
  ],
  Health: ["pharmacy", "doctor", "hospital", "medicine", "drugs"],
  Shopping: ["clothes", "shoes", "shopping", "amazon", "jumia"],
  Entertainment: ["netflix", "movie", "cinema", "spotify", "games", "party"],
  Education: ["school", "tuition", "books", "course"],
  Income: ["salary", "pay", "wage", "freelance", "bonus"],
  "Savings & investing": ["savings", "invest", "stocks"],
};

function guessCategory(words) {
  for (const w of words) {
    const lw = w.toLowerCase();
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.includes(lw)) return cat;
    }
  }
  return "Other";
}

function parseQuickAdd(line) {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length === 0) return null;

  let amountIndex = -1;
  let amount = null;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const num = parseFloat(tokens[i].replace(/,/g, ""));
    if (!isNaN(num) && num > 0) {
      amount = num;
      amountIndex = i;
      break;
    }
  }
  if (amount === null) return null;

  const rest = tokens.filter((_, i) => i !== amountIndex);
  let kind = "debit";
  const creditIdx = rest.findIndex((w) =>
    ["credit", "income", "received", "refund"].includes(w.toLowerCase()),
  );
  if (creditIdx !== -1) {
    kind = "credit";
    rest.splice(creditIdx, 1);
  }

  let category = null;
  const last = rest[rest.length - 1];
  if (last) {
    const match = CATEGORIES.find(
      (c) =>
        c.toLowerCase().startsWith(last.toLowerCase()) ||
        last.toLowerCase() === c.toLowerCase(),
    );
    if (match) {
      category = match;
      rest.pop();
    }
  }
  if (!category) category = guessCategory(rest);

  return { desc: rest.join(" ").trim() || "Untitled", amount, kind, category };
}

document
  .getElementById("quick-add-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("quick-add-input");
    const parsed = parseQuickAdd(input.value);
    if (!parsed) {
      alert(
        'Couldn\'t find an amount in that line — try something like "coffee 1500".',
      );
      return;
    }
    const decimals = currencyDecimals();
    const amount =
      Math.round(parsed.amount * Math.pow(10, decimals)) /
      Math.pow(10, decimals);
    expenses.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      desc: parsed.desc,
      amount,
      kind: parsed.kind,
      category: parsed.category,
      date: todayStr(),
    });
    renderExpenses(); // optimistic
    input.value = "";
    await persistExpenses();
    renderExpenses(); // reconcile
  });

document.getElementById("habit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("habit-name").value.trim();
  if (!name) return;
  habits.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    completions: {},
  });
  renderHabits(); // optimistic
  e.target.reset();
  await persistHabits();
  renderHabits(); // reconcile
});

/* =========================================================================
   PWA: service worker, offline banner, install prompt
   ========================================================================= */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("service worker registration failed", err);
    });
  });
}

function updateOfflineBanner() {
  const banner = document.getElementById("offline-banner");
  if (!banner) return;
  banner.classList.toggle("show", !navigator.onLine);
}
window.addEventListener("online", updateOfflineBanner);
window.addEventListener("offline", updateOfflineBanner);

// Custom "Install app" button — browsers that support installable PWAs
// (Chrome, Edge, most Android browsers) fire this instead of showing their
// own prompt immediately, so we hold onto it and offer our own button.
// iOS Safari never fires this event; it has no install prompt to trigger,
// only the "Add to Home Screen" flow in the browser's own share menu, so
// the button there simply stays hidden.
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById("install-btn");
  if (btn) btn.classList.add("available");
  maybeShowInstallPopup(); // now that we actually have a prompt to offer
});

document.getElementById("install-btn").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById("install-btn").classList.remove("available");
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const btn = document.getElementById("install-btn");
  if (btn) btn.classList.remove("available");
  hideInstallPopup();
  setInstallPopupState({ installed: true });
});

/* ---------- First-run "Install Ledger" popup ---------- */
// Storage key lives in the personal (non-shared) scope, deliberately kept
// separate from household data — install status is a per-browser/device
// fact, not something that should sync to anyone sharing a household code.
const INSTALL_POPUP_KEY = "pwa-install-popup";
const INSTALL_SNOOZE_DAYS = 14;

function isRunningStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true // legacy iOS flag
  );
}

function isIOSDevice() {
  const ua = window.navigator.userAgent;
  const isAppleTouch = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as "Macintosh" but has touch support — distinguish
  // it from an actual Mac.
  const isIpadOS13 = ua.includes("Macintosh") && navigator.maxTouchPoints > 1;
  return isAppleTouch || isIpadOS13;
}

async function getInstallPopupState() {
  try {
    const result = await window.storage.get(INSTALL_POPUP_KEY, false);
    return result ? JSON.parse(result.value) : {};
  } catch {
    return {};
  }
}

async function setInstallPopupState(state) {
  try {
    await window.storage.set(INSTALL_POPUP_KEY, JSON.stringify(state), false);
  } catch (err) {
    console.warn("could not persist install popup state", err);
  }
}

function showInstallPopup(variant) {
  const backdrop = document.getElementById("install-popup-backdrop");
  const standard = document.getElementById("install-popup-standard");
  const ios = document.getElementById("install-popup-ios");
  if (!backdrop) return;
  standard.style.display = variant === "ios" ? "none" : "block";
  ios.style.display = variant === "ios" ? "block" : "none";
  backdrop.classList.add("show");
}

function hideInstallPopup() {
  document.getElementById("install-popup-backdrop")?.classList.remove("show");
}

async function dismissInstallPopup() {
  hideInstallPopup();
  await setInstallPopupState({ dismissedAt: Date.now() });
}

async function maybeShowInstallPopup() {
  if (isRunningStandalone()) return; // already installed/opened as an app

  const state = await getInstallPopupState();
  if (state.installed) return;
  if (state.dismissedAt) {
    const daysSince = (Date.now() - state.dismissedAt) / (1000 * 60 * 60 * 24);
    if (daysSince < INSTALL_SNOOZE_DAYS) return;
  }

  if (isIOSDevice()) {
    showInstallPopup("ios");
    return;
  }

  // Non-iOS: only show once the browser has actually offered an install
  // prompt (deferredInstallPrompt set by beforeinstallprompt above).
  // Browsers that don't support installable PWAs never fire that event,
  // so this correctly stays silent there instead of showing a dead button.
  if (deferredInstallPrompt) {
    showInstallPopup("standard");
  }
}

document
  .getElementById("install-popup-close")
  .addEventListener("click", dismissInstallPopup);
document
  .getElementById("install-popup-later-btn")
  .addEventListener("click", dismissInstallPopup);
document
  .getElementById("install-popup-ios-got-it-btn")
  .addEventListener("click", dismissInstallPopup);
document
  .getElementById("install-popup-backdrop")
  .addEventListener("click", (e) => {
    if (e.target.id === "install-popup-backdrop") dismissInstallPopup();
  });

document
  .getElementById("install-popup-install-btn")
  .addEventListener("click", async () => {
    hideInstallPopup();
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById("install-btn")?.classList.remove("available");
    if (outcome !== "accepted") {
      await setInstallPopupState({ dismissedAt: Date.now() });
    }
  });

// Honors the manifest's app shortcuts (long-press the install icon on
// Android/desktop) by focusing the relevant field once the app is ready.
function handleShortcutAction() {
  const action = new URLSearchParams(window.location.search).get("action");
  if (!action) return;
  if (action === "quick-add") {
    document.getElementById("quick-add-input")?.focus();
  } else if (action === "habits") {
    document
      .getElementById("habit-section")
      ?.scrollIntoView({ behavior: "smooth" });
    document.getElementById("habit-name")?.focus();
  }
  // Clean the query string so refreshing/sharing the URL later doesn't
  // keep re-triggering the shortcut.
  history.replaceState(null, "", window.location.pathname);
}

/* =========================================================================
   Boot
   ========================================================================= */
(async function boot() {
  updateOfflineBanner();
  const start = Date.now();
  await loadData();
  const elapsed = Date.now() - start;
  const wait = Math.max(0, MIN_PRELOAD_MS - elapsed);
  setTimeout(() => {
    hidePreloader();
    handleShortcutAction();
    // Small extra delay after the preloader clears so the install popup
    // never competes with it — nobody wants two overlays at once.
    setTimeout(maybeShowInstallPopup, 900);
  }, wait);
})();
