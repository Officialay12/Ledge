// @ts-nocheck
const MIN_PRELOAD_MS = 900;
function showBusy(e) {
  const t = document.getElementById("busy-indicator"),
    n = document.getElementById("busy-label");
  t && (n && (n.textContent = e || "saving…"), t.classList.add("show"));
}
function hideBusy() {
  const e = document.getElementById("busy-indicator");
  e && e.classList.remove("show");
}
function hidePreloader() {
  const e = document.getElementById("preloader");
  e && e.classList.add("hidden");
}
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
    (e) => `<option value="${e}">${e}</option>`,
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
    return new Intl.NumberFormat(void 0, {
      style: "currency",
      currency: currentCurrency,
    });
  } catch (e) {
    return new Intl.NumberFormat(void 0, {
      style: "currency",
      currency: "USD",
    });
  }
}
function currencyDecimals() {
  return currencyFormatter().resolvedOptions().maximumFractionDigits;
}
function money(e) {
  const t = currencyFormatter();
  return e < 0 ? "-" + t.format(Math.abs(e)) : t.format(e);
}
function populateCurrencySelect() {
  const e = document.getElementById("currency-select");
  ((e.innerHTML = CURRENCIES.map(
    ([e, t]) => `<option value="${e}">${e} — ${t}</option>`,
  ).join("")),
    (e.value = currentCurrency));
}
function applyCurrencyToInputs() {
  const e = currencyDecimals(),
    t = 0 === e ? "1" : (1 / Math.pow(10, e)).toString(),
    n = document.getElementById("exp-amount");
  ((n.step = t), (n.placeholder = 0 === e ? "0" : "0." + "0".repeat(e)));
}
const todayStr = () => new Date().toISOString().slice(0, 10),
  dayLabel = (e) =>
    new Date(e + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "narrow",
    });
document.getElementById("today-badge").textContent =
  new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
let expenses = [],
  habits = [],
  recurringTemplates = [],
  currentKind = "debit",
  householdId = null;
function isShared() {
  return !!householdId;
}
function scopedKey(e) {
  return isShared() ? `household:${householdId}:${e}` : e;
}
async function loadKey(e) {
  showBusy("loading…");
  try {
    const t = await window.storage.get(scopedKey(e), isShared());
    return t ? JSON.parse(t.value) : null;
  } catch (e) {
    return null;
  } finally {
    hideBusy();
  }
}
async function saveKey(e, t) {
  showBusy("saving…");
  try {
    await window.storage.set(scopedKey(e), JSON.stringify(t), isShared());
  } catch (t) {
    console.error(`save ${e} failed`, t);
  } finally {
    hideBusy();
  }
}
async function loadData() {
  try {
    const e = await window.storage.get("device-settings"),
      t = e ? JSON.parse(e.value) : null;
    (t && t.currency && (currentCurrency = t.currency),
      t && t.householdId && (householdId = t.householdId));
  } catch (e) {}
  if (
    ((expenses = (await loadKey("expenses")) || []),
    (habits = (await loadKey("habits")) || []),
    (recurringTemplates = (await loadKey("recurring")) || []),
    isShared())
  )
    try {
      const e = await window.storage.get(scopedKey("settings"), !0),
        t = e ? JSON.parse(e.value) : null;
      t && t.currency && (currentCurrency = t.currency);
    } catch (e) {}
  (generateDueRecurring(),
    populateCurrencySelect(),
    populateCategorySelect(),
    applyCurrencyToInputs(),
    updateHouseholdUI(),
    renderExpenses(),
    renderHabits());
}
async function saveDeviceSettings() {
  showBusy("saving…");
  try {
    await window.storage.set(
      "device-settings",
      JSON.stringify({ currency: currentCurrency, householdId: householdId }),
      !1,
    );
  } catch (e) {
    console.error("save device settings failed", e);
  } finally {
    hideBusy();
  }
}
async function saveSettings() {
  (await saveDeviceSettings(),
    isShared() && (await saveKey("settings", { currency: currentCurrency })));
}
async function saveExpenses() {
  await saveKey("expenses", expenses);
}
async function saveHabits() {
  await saveKey("habits", habits);
}
async function saveRecurring() {
  await saveKey("recurring", recurringTemplates);
}
function daysInMonth(e, t) {
  return new Date(e, t + 1, 0).getDate();
}
function generateDueRecurring() {
  if (0 === recurringTemplates.length) return;
  const e = new Date(),
    t = e.getFullYear(),
    n = e.getMonth(),
    a = `${t}-${String(n + 1).padStart(2, "0")}`;
  let s = !1;
  (recurringTemplates.forEach((r) => {
    if (expenses.some((e) => e.recurringId === r.id && e.generatedMonth === a))
      return;
    const i = Math.min(r.dayOfMonth, daysInMonth(t, n));
    if (e.getDate() < i) return;
    const o = `${t}-${String(n + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    (expenses.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      desc: r.desc,
      amount: r.amount,
      kind: r.kind,
      category: r.category,
      date: o,
      recurringId: r.id,
      generatedMonth: a,
    }),
      (s = !0));
  }),
    s && saveExpenses());
}
function updateHouseholdUI() {
  const e = document.getElementById("household-toggle"),
    t = document.getElementById("household-status");
  isShared()
    ? ((e.textContent = "Shared: " + householdId),
      (t.textContent = `You're viewing the shared ledger for code "${householdId}". Anyone with this code sees the same data.`))
    : ((e.textContent = "Personal"),
      (t.textContent =
        "You're on your own private ledger. No one else can see it."));
}
function last7Days() {
  const e = [];
  for (let t = 6; t >= 0; t--) {
    const n = new Date();
    (n.setDate(n.getDate() - t), e.push(n.toISOString().slice(0, 10)));
  }
  return e;
}
function computeStreak(e) {
  let t = 0,
    n = new Date();
  for (;;) {
    const a = n.toISOString().slice(0, 10);
    if (!e.completions || !e.completions[a]) break;
    (t++, n.setDate(n.getDate() - 1));
  }
  return t;
}
function tallySVG(e) {
  return `<svg viewBox="0 0 16 24"><line x1="8" y1="2" x2="8" y2="22" stroke="${e ? "var(--habit)" : "var(--habit-off)"}" stroke-width="2.4" stroke-linecap="round"/></svg>`;
}
function renderExpenses() {
  const e = document.getElementById("ledger-rows");
  0 === expenses.length
    ? (e.innerHTML =
        '<div class="empty">No entries yet. Add your first line above.</div>')
    : (e.innerHTML = expenses
        .slice()
        .reverse()
        .map((e) => {
          const t = "debit" === e.kind ? "-" : "+",
            n = "debit" === e.kind ? "debit" : "credit",
            a = new Date(e.date + "T00:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }),
            s = currencyFormatter().format(e.amount),
            r = e.category
              ? `<span class="cat-tag">${escapeHtml(e.category)}</span>`
              : "",
            i = e.recurringId ? '<span class="recur-tag">monthly</span>' : "";
          return `<div class="ledger-row">\n        <span class="d">${a}</span>\n        <span class="desc-cell">${r}<span class="desc-text">${escapeHtml(e.desc)}</span>${i}</span>\n        <span class="amt ${n}">${t}${s}</span>\n        <span class="rm" data-id="${e.id}" title="Remove">×</span>\n      </div>`;
        })
        .join(""));
  const t = expenses.reduce(
      (e, t) => e + ("debit" === t.kind ? -t.amount : t.amount),
      0,
    ),
    n = document.getElementById("balance-value");
  ((n.textContent = money(t)),
    (n.className = "value" + (t < 0 ? " neg" : t > 0 ? " pos" : "")),
    e.querySelectorAll(".rm").forEach((e) => {
      e.addEventListener("click", async () => {
        ((expenses = expenses.filter((t) => t.id !== e.dataset.id)),
          await saveExpenses(),
          renderExpenses());
      });
    }),
    renderMonthlyTotals());
}
function monthKey(e) {
  return e.slice(0, 7);
}
function monthLabel(e) {
  const [t, n] = e.split("-");
  return new Date(parseInt(t), parseInt(n) - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}
function populateMonthSelect() {
  const e = document.getElementById("month-select"),
    t = Array.from(new Set(expenses.map((e) => monthKey(e.date)))),
    n = todayStr().slice(0, 7);
  (t.includes(n) || t.push(n), t.sort().reverse());
  const a = e.value;
  ((e.innerHTML = t
    .map((e) => `<option value="${e}">${monthLabel(e)}</option>`)
    .join("")),
    (e.value = t.includes(a) ? a : n));
}
function renderMonthlyTotals() {
  populateMonthSelect();
  const e = document.getElementById("month-select").value,
    t = document.getElementById("monthly-totals-body"),
    n = expenses.filter((t) => monthKey(t.date) === e),
    a = n.filter((e) => "debit" === e.kind).reduce((e, t) => e + t.amount, 0),
    s = n.filter((e) => "credit" === e.kind).reduce((e, t) => e + t.amount, 0),
    r = s - a,
    i = currencyFormatter(),
    o = {};
  n.filter((e) => "debit" === e.kind).forEach((e) => {
    const t = e.category || "Other";
    o[t] = (o[t] || 0) + e.amount;
  });
  const c = Math.max(1, ...Object.values(o)),
    d = Object.entries(o)
      .sort((e, t) => t[1] - e[1])
      .map(
        ([e, t]) =>
          `\n    <div class="cat-bar-row">\n      <span class="cat-bar-label">${escapeHtml(e)}</span>\n      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${((t / c) * 100).toFixed(0)}%"></div></div>\n      <span class="cat-bar-amt">${i.format(t)}</span>\n    </div>`,
      )
      .join("");
  t.innerHTML = `\n    <div class="ms-totals">\n      <div class="ms-stat"><span class="ms-label">Spent</span><span class="ms-value debit">${i.format(a)}</span></div>\n      <div class="ms-stat"><span class="ms-label">Received</span><span class="ms-value credit">${i.format(s)}</span></div>\n      <div class="ms-stat"><span class="ms-label">Net</span><span class="ms-value">${r < 0 ? "-" + i.format(Math.abs(r)) : i.format(r)}</span></div>\n    </div>\n    ${d ? `<div class="cat-breakdown">${d}</div>` : '<div class="empty" style="padding:0.4rem 0;">No spending logged for this month yet.</div>'}\n  `;
}
function renderHabits() {
  const e = document.getElementById("habit-list");
  if (0 === habits.length)
    return void (e.innerHTML =
      '<div class="empty">No habits yet. Add one above to start tallying.</div>');
  const t = last7Days();
  ((e.innerHTML = habits
    .map((e) => {
      const n = computeStreak(e),
        a = t
          .map((t) => {
            const n = !(!e.completions || !e.completions[t]);
            return `<div class="tally-day" data-habit="${e.id}" data-day="${t}">\n        <div class="tally-mark">${tallySVG(n)}</div>\n        <div class="tally-lbl">${dayLabel(t)}</div>\n      </div>`;
          })
          .join("");
      return `<div class="habit-row">\n      <div class="habit-top">\n        <span class="habit-name">${escapeHtml(e.name)}</span>\n        <span style="display:flex; align-items:center; gap:0.6rem;">\n          <span class="streak">${n} day streak</span>\n          <button type="button" class="heatmap-toggle" data-habit="${e.id}">year view</button>\n          <span class="habit-rm" data-id="${e.id}" title="Remove habit">×</span>\n        </span>\n      </div>\n      <div class="tally">${a}</div>\n      <div class="heatmap-wrap" id="heatmap-${e.id}" style="display:none;"></div>\n    </div>`;
    })
    .join("")),
    e.querySelectorAll(".tally-day").forEach((e) => {
      e.addEventListener("click", async () => {
        const t = e.dataset.habit,
          n = e.dataset.day,
          a = habits.find((e) => e.id === t);
        a &&
          (a.completions || (a.completions = {}),
          (a.completions[n] = !a.completions[n]),
          await saveHabits(),
          renderHabits());
      });
    }),
    e.querySelectorAll(".habit-rm").forEach((e) => {
      e.addEventListener("click", async () => {
        ((habits = habits.filter((t) => t.id !== e.dataset.id)),
          await saveHabits(),
          renderHabits());
      });
    }),
    e.querySelectorAll(".heatmap-toggle").forEach((e) => {
      e.addEventListener("click", () => {
        const t = e.dataset.habit,
          n = document.getElementById("heatmap-" + t);
        if ("none" !== n.style.display)
          ((n.style.display = "none"), (e.textContent = "year view"));
        else {
          (renderHeatmap(
            n,
            habits.find((e) => e.id === t),
          ),
            (n.style.display = "block"),
            (e.textContent = "hide year view"));
        }
      });
    }));
}
function renderHeatmap(e, t) {
  const n = new Date();
  n.setHours(0, 0, 0, 0);
  const a = n.getDay(),
    s = new Date(n);
  s.setDate(s.getDate() - 370 - (6 - a));
  let r = "";
  const i = new Date(s);
  for (let e = 0; e < 378; e++) {
    const e = i.toISOString().slice(0, 10),
      a = !(!t.completions || !t.completions[e]),
      s = e === todayStr();
    ((r +=
      i > n
        ? '<div style="width:9px; height:9px;"></div>'
        : `<div class="heatmap-cell${a ? " done" : ""}${s ? " today" : ""}" data-habit="${t.id}" data-day="${e}" title="${e}${a ? " — done" : ""}"></div>`),
      i.setDate(i.getDate() + 1));
  }
  ((e.innerHTML = `<div class="heatmap-grid">${r}</div><div class="heatmap-legend">Past year, one square per day — click any square to toggle it</div>`),
    e.querySelectorAll(".heatmap-cell").forEach((e) => {
      e.addEventListener("click", async () => {
        const t = e.dataset.habit,
          n = e.dataset.day,
          a = habits.find((e) => e.id === t);
        if (!a) return;
        (a.completions || (a.completions = {}),
          (a.completions[n] = !a.completions[n]),
          await saveHabits(),
          renderHabits());
        const s = document.getElementById("heatmap-" + t),
          r = document.querySelector(`.heatmap-toggle[data-habit="${t}"]`);
        (renderHeatmap(
          s,
          habits.find((e) => e.id === t),
        ),
          (s.style.display = "block"),
          r && (r.textContent = "hide year view"));
      });
    }));
}
function escapeHtml(e) {
  const t = document.createElement("div");
  return ((t.textContent = e), t.innerHTML);
}
function downloadFile(e, t, n) {
  const a = new Blob([t], { type: n }),
    s = URL.createObjectURL(a),
    r = document.createElement("a");
  ((r.href = s),
    (r.download = e),
    document.body.appendChild(r),
    r.click(),
    document.body.removeChild(r),
    URL.revokeObjectURL(s));
}
function csvField(e) {
  const t = String(e);
  return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
function exportCSV() {
  const e = [["Date", "Description", "Category", "Type", "Amount", "Currency"]];
  expenses
    .slice()
    .sort((e, t) => e.date.localeCompare(t.date))
    .forEach((t) => {
      e.push([
        t.date,
        t.desc,
        t.category || "Other",
        t.kind,
        t.amount.toFixed(currencyDecimals()),
        currentCurrency,
      ]);
    });
  const t = e.map((e) => e.map(csvField).join(",")).join("\n");
  downloadFile(`ledger-expenses-${todayStr()}.csv`, t, "text/csv");
}
function downloadBackup() {
  const e = {
    version: 2,
    exportedAt: new Date().toISOString(),
    expenses: expenses,
    habits: habits,
    recurringTemplates: recurringTemplates,
    settings: { currency: currentCurrency },
  };
  downloadFile(
    `ledger-backup-${todayStr()}.json`,
    JSON.stringify(e, null, 2),
    "application/json",
  );
}
async function restoreFromBackup(e) {
  const t = await e.text();
  let n;
  try {
    n = JSON.parse(t);
  } catch (e) {
    return void alert(
      "That file doesn't look like a valid backup — it couldn't be read as JSON.",
    );
  }
  if (!Array.isArray(n.expenses) || !Array.isArray(n.habits))
    return void alert(
      "That file doesn't look like a ledger backup — it's missing expenses or habits.",
    );
  confirm(
    "Restoring will replace everything currently in this ledger with the contents of this backup. Continue?",
  ) &&
    ((expenses = n.expenses),
    (habits = n.habits),
    (recurringTemplates = Array.isArray(n.recurringTemplates)
      ? n.recurringTemplates
      : []),
    n.settings &&
      n.settings.currency &&
      (currentCurrency = n.settings.currency),
    await saveExpenses(),
    await saveHabits(),
    await saveRecurring(),
    await saveSettings(),
    populateCurrencySelect(),
    applyCurrencyToInputs(),
    renderExpenses(),
    renderHabits(),
    alert("Backup restored."));
}
(document.getElementById("export-csv-btn").addEventListener("click", exportCSV),
  document
    .getElementById("backup-json-btn")
    .addEventListener("click", downloadBackup),
  document.getElementById("restore-input").addEventListener("change", (e) => {
    const t = e.target.files[0];
    (t && restoreFromBackup(t), (e.target.value = ""));
  }),
  document.getElementById("month-select").addEventListener("change", () => {
    renderMonthlyTotals();
  }),
  document.getElementById("household-toggle").addEventListener("click", () => {
    const e = document.getElementById("household-section");
    e.style.display = "none" === e.style.display ? "block" : "none";
  }),
  document
    .getElementById("household-join-btn")
    .addEventListener("click", async () => {
      const e = document
        .getElementById("household-code")
        .value.trim()
        .toLowerCase()
        .replace(/\s+/g, "-");
      if (!e) return;
      confirm(
        `Join the shared ledger "${e}"? Anyone with this code can see and edit it. Your current personal data stays untouched and separate.`,
      ) && ((householdId = e), await saveDeviceSettings(), await loadData());
    }),
  document
    .getElementById("household-leave-btn")
    .addEventListener("click", async () => {
      ((householdId = null), await saveDeviceSettings(), await loadData());
    }),
  document.getElementById("guide-toggle").addEventListener("click", () => {
    const e = document.getElementById("guide-section"),
      t = document.getElementById("guide-toggle"),
      n = "none" !== e.style.display;
    ((e.style.display = n ? "none" : "block"),
      (t.textContent = n ? "How to use" : "Hide guide"));
  }),
  document
    .getElementById("currency-select")
    .addEventListener("change", async (e) => {
      ((currentCurrency = e.target.value),
        applyCurrencyToInputs(),
        await saveSettings(),
        renderExpenses());
    }),
  document.getElementById("kind-debit").addEventListener("click", () => {
    ((currentKind = "debit"),
      document.getElementById("kind-debit").classList.add("active"),
      document.getElementById("kind-credit").classList.remove("active"));
  }),
  document.getElementById("kind-credit").addEventListener("click", () => {
    ((currentKind = "credit"),
      document.getElementById("kind-credit").classList.add("active"),
      document.getElementById("kind-debit").classList.remove("active"));
  }),
  document
    .getElementById("expense-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const t = document.getElementById("exp-desc").value.trim();
      let n = parseFloat(document.getElementById("exp-amount").value);
      if (!t || isNaN(n) || n <= 0) return;
      const a = currencyDecimals();
      n = Math.round(n * Math.pow(10, a)) / Math.pow(10, a);
      const s = document.getElementById("exp-category").value || "Other",
        r = document.getElementById("exp-recurring").checked,
        i = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          desc: t,
          amount: n,
          kind: currentKind,
          category: s,
          date: todayStr(),
        };
      if (r) {
        const e = "tmpl-" + i.id,
          a = new Date().getDate();
        (recurringTemplates.push({
          id: e,
          desc: t,
          amount: n,
          kind: currentKind,
          category: s,
          dayOfMonth: a,
        }),
          (i.recurringId = e),
          (i.generatedMonth = todayStr().slice(0, 7)),
          await saveRecurring());
      }
      (expenses.push(i),
        await saveExpenses(),
        renderExpenses(),
        e.target.reset(),
        (document.getElementById("exp-recurring").checked = !1));
    }));
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
function guessCategory(e) {
  for (const t of e) {
    const e = t.toLowerCase();
    for (const [t, n] of Object.entries(CATEGORY_KEYWORDS))
      if (n.includes(e)) return t;
  }
  return "Other";
}
function parseQuickAdd(e) {
  const t = e.trim().split(/\s+/);
  if (0 === t.length) return null;
  let n = -1,
    a = null;
  for (let e = t.length - 1; e >= 0; e--) {
    const s = parseFloat(t[e].replace(/,/g, ""));
    if (!isNaN(s) && s > 0) {
      ((a = s), (n = e));
      break;
    }
  }
  if (null === a) return null;
  const s = t.filter((e, t) => t !== n);
  let r = "debit";
  const i = s.findIndex((e) =>
    ["credit", "income", "received", "refund"].includes(e.toLowerCase()),
  );
  -1 !== i && ((r = "credit"), s.splice(i, 1));
  let o = null;
  const c = s[s.length - 1];
  if (c) {
    const e = CATEGORIES.find(
      (e) =>
        e.toLowerCase().startsWith(c.toLowerCase()) ||
        c.toLowerCase() === e.toLowerCase(),
    );
    e && ((o = e), s.pop());
  }
  o || (o = guessCategory(s));
  return {
    desc: s.join(" ").trim() || "Untitled",
    amount: a,
    kind: r,
    category: o,
  };
}
(document
  .getElementById("quick-add-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const t = document.getElementById("quick-add-input"),
      n = parseQuickAdd(t.value);
    if (!n)
      return void alert(
        'Couldn\'t find an amount in that line — try something like "coffee 1500".',
      );
    const a = currencyDecimals(),
      s = Math.round(n.amount * Math.pow(10, a)) / Math.pow(10, a);
    (expenses.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      desc: n.desc,
      amount: s,
      kind: n.kind,
      category: n.category,
      date: todayStr(),
    }),
      await saveExpenses(),
      renderExpenses(),
      (t.value = ""));
  }),
  document
    .getElementById("habit-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const t = document.getElementById("habit-name").value.trim();
      t &&
        (habits.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name: t,
          completions: {},
        }),
        await saveHabits(),
        renderHabits(),
        e.target.reset());
    }),
  (async function () {
    const e = Date.now();
    await loadData();
    const t = Date.now() - e,
      n = Math.max(0, MIN_PRELOAD_MS - t);
    setTimeout(hidePreloader, n);
  })());
