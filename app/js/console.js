/* Management console (widget.html): one command centre across Housekeeping, Pantry and Stationery —
   combined KPIs, what needs attention, quick actions, module summaries, trends and watchlists.
   Each module's own page (housekeeping.html …) has the detailed sections. */
(function (C) {
  "use strict";
  const h = C.h, U = C.util, ui = C.ui, CH = C.charts, M = C.model, K = C.vk;
  const state = { period: "this_month", models: {}, errors: {}, loadedAt: null, qaKey: null, loading: null };
  const cfg = () => C.config;
  const KEYS = () => Object.keys(cfg().dashboards);
  const dashOf = (k) => cfg().dashboards[k];
  const root = () => document.getElementById("console");

  /* ---------- helpers ---------- */
  function ctxFor(k) {
    return {
      cfg: cfg(), key: k, dash: dashOf(k), model: state.models[k], range: U.periodRange(state.period),
      sub: () => null, setSub: () => {}, go: (tab, sub) => goTo(k, tab, sub), refresh: () => load(true), openSources: () => goTo(k)
    };
  }
  // open a module page, optionally at a section: housekeeping.html?<creator params>#inventory/reorder
  function goTo(k, tab, sub) {
    location.href = C.api.pageHref(dashOf(k).page) + (tab ? "#" + tab + (sub ? "/" + sub : "") : "");
  }
  const loaded = () => KEYS().filter((k) => state.models[k]);
  const all = (fn) => [].concat.apply([], loaded().map((k) => fn(state.models[k], k).map((x) => Object.assign({ _k: k }, x))));
  const sumBy = (fn) => U.sum(loaded(), (k) => fn(state.models[k], k) || 0);
  const perModule = (fn, fmt) => loaded().map((k) => dashOf(k).label + " " + (fmt || U.fmtNum)(fn(state.models[k], k) || 0)).join(" · ");
  const ok = (k, src) => state.models[k] && state.models[k].sources[src].state === "ok";
  const tag = (k) => h("span", { class: "mod-tag", style: { "--accent": dashOf(k).accent } }, C.icon(dashOf(k).icon), dashOf(k).label);
  const lowOut = (m) => m.items.filter((i) => i.stockStatus === "low" || i.stockStatus === "out");
  const valueOf = (m) => (m.hasValues ? (c) => c.value || 0 : (c) => c.qty || 0);
  const anyValues = () => loaded().some((k) => state.models[k].hasValues);

  /* ---------- header ---------- */
  function renderTopbar() {
    const periodSel = h("select", { "aria-label": "Period" }, U.PERIODS.map((p) => h("option", { value: p.key, selected: p.key === state.period }, p.label)));
    periodSel.addEventListener("change", () => { state.period = periodSel.value; render(); });
    state.refreshBtn = h("button", { class: "btn icon", type: "button", title: "Refresh data", "aria-label": "Refresh data", onclick: () => load(true) }, C.icon("refresh"));
    state.updatedEl = h("span", { class: "updated" });
    const switcher = h("nav", { class: "switcher", "aria-label": "Dashboards" },
      h("a", { href: C.api.pageHref("widget.html"), "aria-current": "page" }, C.icon("grid"), "Console"),
      KEYS().map((k) => h("a", { href: C.api.pageHref(dashOf(k).page) }, C.icon(dashOf(k).icon), dashOf(k).label)));
    C.clear(document.getElementById("topbar")).append(
      h("div", { class: "brand" }, h("div", { class: "brand-mark" }, C.icon("warehouse")),
        h("div", null, h("div", { class: "brand-eyebrow" }, cfg().orgName + " · " + cfg().productName), h("h1", null, "Management Console"))),
      switcher, h("div", { class: "topbar-spacer" }),
      h("div", { class: "controls" }, state.updatedEl, h("label", { class: "select" }, C.icon("calendar"), periodSel),
        h("button", { class: "btn icon", type: "button", title: "Print this view", "aria-label": "Print this view", onclick: () => window.print() }, C.icon("printer")), state.refreshBtn));
  }

  /* ---------- loading ---------- */
  function showSkeleton() {
    C.clear(root()).appendChild(h("div", { class: "stack" },
      h("div", { class: "kpis five" }, Array.from({ length: 10 }, () => ui.skeleton(118))),
      ui.skeleton(150), h("div", { class: "grid grid-3" }, ui.skeleton(240), ui.skeleton(240), ui.skeleton(240))));
  }
  function load(isRefresh) {
    if (state.loading) return state.loading;
    state.loading = doLoad(isRefresh).finally(() => { state.loading = null; });
    return state.loading;
  }
  async function doLoad(isRefresh) {
    if (isRefresh) { document.body.classList.add("is-refreshing"); state.refreshBtn.classList.add("spin"); } else showSkeleton();
    try {
      await C.api.init();
      const cache = new Map(); // a report used by two modules is fetched once
      const models = {}, errors = {};
      await Promise.all(KEYS().map(async (k) => {
        try { models[k] = C.model.build(await C.loader.loadRaw(dashOf(k), cache), k); }
        catch (e) { console.error(e); errors[k] = C.api.errorMessage(e); }
      }));
      state.models = models; state.errors = errors; state.loadedAt = new Date();
      render();
      const failed = [];
      loaded().forEach((k) => { const S = state.models[k].sources; Object.keys(S).forEach((s) => { if (S[s].state === "error" && !C.loader.OPTIONAL.has(s)) failed.push(S[s].report); }); });
      if (failed.length) ui.toast("Could not load " + Array.from(new Set(failed)).join(", "), "crit");
      else if (isRefresh) ui.toast("Console refreshed", "good");
    } catch (e) {
      console.error(e);
      const outside = e && e.kind === "outside";
      const retry = h("button", { class: "btn primary", type: "button", onclick: () => load(false) }, C.icon("refresh"), "Try again");
      C.clear(root()).appendChild(ui.card({ body: ui.empty({
        icon: outside ? "database" : "alert", tone: outside ? "accent" : "crit",
        title: outside ? "Open this console inside Zoho Creator" : "Could not load data from Zoho Creator",
        text: outside ? ["Upload the zip made by ", h("code", null, "zet pack"), " in Creator → Settings → Widgets, set the index file to ", h("code", null, "/widget.html"), ", then add the widget to a page."] : C.api.errorMessage(e),
        action: outside ? null : retry }) }));
    } finally {
      document.body.classList.remove("is-refreshing");
      if (state.refreshBtn) state.refreshBtn.classList.remove("spin");
    }
  }

  /* ---------- sections ---------- */
  function kpiTiles(range) {
    const lower = range.label.toLowerCase();
    const inP = (rows, f) => K.inPeriod(rows, range, f);
    const now = new Date();
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const pStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const pEnd = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth(), 0).getDate()), 23, 59, 59);
    const money = anyValues();
    const val = (c) => (money ? c.value || 0 : c.qty || 0);
    const cons = all((m) => m.consumption);
    const mtd = U.sum(cons.filter((c) => c.date && c.date >= mStart), val);
    const prev = U.sum(cons.filter((c) => c.date && c.date >= pStart && c.date <= pEnd), val);
    const fmtV = (n) => (money ? U.fmtMoney(n, true) : U.fmtCompact(n));
    const itemsOk = loaded().some((k) => ok(k, "items"));
    const returns = loaded().some((k) => state.models[k].returnsTracked);
    const hk = state.models.housekeeping, ps = ["pantry", "stationery"].filter((k) => state.models[k]);
    const psCons = [].concat.apply([], ps.map((k) => inP(state.models[k].consumption)));
    const psVal = (c) => (ps.some((k) => state.models[k].hasValues) ? c.value || 0 : c.qty || 0);
    const hkReq = hk ? inP(hk.requests) : [];
    const low = (m) => m.items.filter((i) => i.stockStatus === "low").length;
    const out = (m) => m.items.filter((i) => i.stockStatus === "out").length;
    const pend = (m) => m.requests.filter((r) => r.group === "pending").length;
    const issued = (m) => U.sum(inP(m.consumption), (c) => c.qty);
    const openPR = (m) => m.purchases.filter(M.isOpen).length;
    return [
      ui.kpi({ label: "Total stock items", icon: "package", value: itemsOk ? U.fmtNum(sumBy((m) => m.items.length)) : "—", sub: perModule((m) => m.items.length) }),
      ui.kpi({ label: "Low stock items", icon: "alert", tone: "warn", value: U.fmtNum(sumBy(low)), sub: perModule(low) }),
      ui.kpi({ label: "Out of stock", icon: "ban", tone: "crit", value: U.fmtNum(sumBy(out)), sub: perModule(out) }),
      ui.kpi({ label: "Pending requests", icon: "clock", tone: "warn", value: U.fmtNum(sumBy(pend)), sub: perModule(pend) }),
      ui.kpi({ label: "Items issued", icon: "send", tone: "info", value: U.fmtCompact(sumBy(issued)), unit: "units", sub: lower + " · " + perModule(issued, U.fmtCompact) }),
      ui.kpi({ label: "Pending / overdue returns", icon: "undo", tone: "neutral", value: returns ? U.fmtNum(sumBy((m) => m.pendingReturns.length)) : "—",
        sub: returns ? U.fmtNum(sumBy((m) => m.overdueReturns.length)) + " overdue" : "returns aren't tracked in Creator yet" }),
      ui.kpi({ label: "Pending purchase requests", icon: "cart", tone: "violet", value: U.fmtNum(sumBy(openPR)), sub: perModule(openPR) }),
      ui.kpi({ label: "Monthly consumption", icon: "trend", value: fmtV(mtd), unit: money ? null : "units", sub: "month to date",
        delta: { pct: prev ? ((mtd - prev) / prev) * 100 : null, upIsGood: null, title: "vs the same days last month" } }),
      ui.kpi({ label: "Housekeeping requests", icon: "sparkles", value: hk ? U.fmtNum(hkReq.length) : "—", sub: hk ? U.fmtNum(hkReq.filter(M.isOpen).length) + " open · " + lower : "",
        onClick: hk ? () => goTo("housekeeping", "requests", "tracking") : null }),
      ui.kpi({ label: "Pantry & stationery consumption", icon: "wallet", tone: "good", value: ps.length ? (ps.some((k) => state.models[k].hasValues) ? U.fmtMoney(U.sum(psCons, psVal), true) : U.fmtCompact(U.sum(psCons, psVal))) : "—",
        sub: ps.map((k) => dashOf(k).label + " " + (state.models[k].hasValues ? U.fmtMoney(U.sum(inP(state.models[k].consumption), psVal), true) : U.fmtCompact(U.sum(inP(state.models[k].consumption), psVal)))).join(" · ") + " · " + lower })
    ];
  }

  function attention() {
    const chips = [];
    const near = cfg().nearExpiryDays || 30;
    loaded().forEach((k) => {
      const m = state.models[k], L = dashOf(k).label;
      const out = m.items.filter((i) => i.stockStatus === "out").length, low = m.items.filter((i) => i.stockStatus === "low").length;
      const pend = m.requests.filter((r) => r.group === "pending").length;
      const exp = m.batches.filter((b) => b.expiry && b.qty > 0 && U.daysBetween(new Date(), b.expiry) <= near).length ||
        m.items.filter((i) => i.expiry && (i.stock || 0) > 0 && U.daysBetween(new Date(), i.expiry) <= near).length;
      if (out) chips.push(["ban", L + ": " + U.plural(out, "item") + " out of stock", () => goTo(k, "inventory", "reorder")]);
      if (low) chips.push(["alert", L + ": " + U.plural(low, "item") + " running low", () => goTo(k, "inventory", "reorder")]);
      if (pend) chips.push(["shield", L + ": " + U.plural(pend, "request") + " to approve", () => goTo(k, "requests", "approvals")]);
      if (exp) chips.push(["hourglass", L + ": " + U.plural(exp, k === "pantry" ? "batch" : "item", k === "pantry" ? "batches" : null) + " expired or expiring", () => goTo(k, k === "pantry" ? "pantry" : "inventory", k === "pantry" ? "expiry" : "current")]);
    });
    if (!chips.length) return null;
    return h("div", { class: "attention" }, h("strong", null, C.icon("bell"), "Needs attention"),
      h("div", { class: "chips" }, chips.map((a) => h("button", { type: "button", onclick: a[2] }, C.icon(a[0]), a[1]))));
  }

  function quickActions() {
    const keys = loaded();
    if (!keys.length) return null;
    if (!state.qaKey || !state.models[state.qaKey]) state.qaKey = keys[0];
    const grid = h("div", { class: "qa-grid" });
    const paint = () => { C.clear(grid).append.apply(grid, K.quickActionButtons(ctxFor(state.qaKey))); grid.style.setProperty("--accent", dashOf(state.qaKey).accent); };
    paint();
    const seg = ui.seg(keys.map((k) => ({ id: k, label: dashOf(k).label })), state.qaKey, (k) => { state.qaKey = k; paint(); });
    return ui.card({ title: "Quick actions", sub: "Open the Creator forms for everyday tasks — pick the store", actions: [seg], body: grid, className: "qa-card" });
  }

  function moduleCard(k, range) {
    const m = state.models[k], d = dashOf(k);
    const S = m.sources;
    const lo = lowOut(m).length;
    const pend = m.requests.filter((r) => r.group === "pending").length;
    const cons = K.inPeriod(m.consumption, range);
    const value = U.sum(m.items, (i) => i.value);
    const errs = Object.keys(S).filter((s) => S[s].state === "error" && !C.loader.OPTIONAL.has(s));
    const row = (icon, label, v, tone, go) => h("button", { class: "mod-row", type: "button", onclick: go },
      h("span", { class: "tone-tile tone-" + (tone || "neutral") }, C.icon(icon)), h("span", { class: "mod-label" }, label), h("b", null, v));
    return h("section", { class: "card mod-card", style: { "--accent": d.accent } },
      h("div", { class: "mod-head" }, h("div", { class: "brand-mark" }, C.icon(d.icon)),
        h("div", { class: "titles" }, h("h3", { class: "card-title" }, d.label), h("p", { class: "card-sub" }, U.plural(m.items.length, "item") + (value ? " · " + U.fmtMoney(value, true) + " in stock" : ""))),
        h("button", { class: "btn sm", type: "button", onclick: () => goTo(k) }, "Open", C.icon("arrowRight"))),
      h("div", { class: "mod-rows" },
        row("alert", "Low / out of stock", U.fmtNum(lo), lo ? "warn" : "good", () => goTo(k, "inventory", "reorder")),
        row("clock", "Pending requests", U.fmtNum(pend), pend ? "warn" : "neutral", () => goTo(k, "requests", "pending")),
        row("send", "Issued · " + range.label.toLowerCase(), m.hasValues ? U.fmtMoney(U.sum(cons, (c) => c.value), true) : U.fmtCompact(U.sum(cons, (c) => c.qty)) + " units", "info", () => goTo(k, "inventory", "issue-return")),
        row("cart", "Open purchase requests", U.fmtNum(m.purchases.filter(M.isOpen).length), "violet", () => goTo(k, "requests", "tracking"))),
      errs.length ? h("div", { class: "mod-err" }, C.icon("alert"), "Couldn't load " + errs.map((s) => S[s].report).join(", ")) : null);
  }

  function trendCard() {
    const money = anyValues();
    const keys = loaded();
    const series = keys.map((k) => M.byMonth(state.models[k].consumption, 12, money ? (c) => c.value || 0 : (c) => c.qty || 0));
    const fmt = money ? (n) => U.fmtMoney(n) : U.fmtNum;
    const points = series[0] ? series[0].map((p, i) => ({ key: p.key, label: p.label, full: p.full,
      value: U.sum(series, (s) => s[i].value), parts: keys.map((k, j) => series[j][i].value),
      sub: keys.map((k, j) => dashOf(k).label + " " + fmt(series[j][i].value)).join(" · ") })) : [];
    const cols = [{ key: "key", label: "Month", render: (p) => p.full, text: (p) => p.full }]
      .concat(keys.map((k, j) => ({ key: "m" + j, label: dashOf(k).label, num: !money, money: money, value: (p) => p.parts[j] })))
      .concat([{ key: "value", label: "Total", num: !money, money: money, strong: true }]);
    return ui.chartCard({ title: "Consumption trend", sub: "Last 12 months · " + (money ? "value issued" : "units issued") + " · all stores",
      chart: () => (points.some((p) => p.value > 0) ? CH.columns(points, { format: fmt, tickFormat: money ? (n) => U.fmtMoney(n, true) : U.fmtCompact, label: "Consumption trend" }) : null),
      table: { columns: cols, rows: points, sort: { key: "key", dir: "desc" }, noun: "month", pageSize: 12 } });
  }

  function statusCard(range) {
    const rows = all((m) => K.inPeriod(m.requests, range));
    const stack = K.statusStack(rows, null);
    const byMod = loaded().map((k) => { const r = rows.filter((x) => x._k === k); return { k: k, total: r.length, pending: r.filter((x) => x.group === "pending").length, done: r.filter((x) => x.group === "completed").length }; });
    return ui.card({ title: "Requests by status", sub: range.label + " · " + U.plural(rows.length, "request") + " across all stores",
      body: h("div", null, stack || ui.empty({ icon: "inbox", title: "No requests in this period" }),
        h("div", { class: "mini", style: { marginTop: "16px" } }, byMod.map((b) => h("button", { class: "mini-row mini-btn", type: "button", onclick: () => goTo(b.k, "requests", "tracking") },
          h("div", null, tag(b.k)), h("div", { class: "mini-sub" }, U.plural(b.total, "request") + " · " + U.fmtNum(b.pending) + " pending · " + U.fmtNum(b.done) + " issued"))))) });
  }

  function watchlist() {
    const STOCK_RANK = { out: 0, low: 1 };
    const items = all((m) => lowOut(m)).sort((a, b) => STOCK_RANK[a.stockStatus] - STOCK_RANK[b.stockStatus] || (a.stock || 0) - (b.stock || 0));
    return ui.card({ title: "Low stock watchlist", sub: U.plural(items.length, "item") + " low or out of stock across all stores", flush: true,
      body: ui.table({ title: "Low stock watchlist", columns: [
        { key: "name", label: "Item", strong: true, value: (i) => i.name },
        { key: "_k", label: "Store", value: (i) => dashOf(i._k).label, render: (i) => tag(i._k) },
        { key: "stock", label: "In stock", num: true, value: (i) => i.stock, text: (i) => (i.stock == null ? "" : U.fmtNum(i.stock) + (i.unit ? " " + i.unit : "")) },
        { key: "reorderLevel", label: "Minimum", num: true, value: (i) => i.reorderLevel },
        { key: "status", label: "Status", value: (i) => STOCK_RANK[i.stockStatus], text: (i) => ui.STOCK_TEXT[i.stockStatus], render: (i) => ui.stockBadge(i) }
      ], rows: items, noun: "item", placeholder: "Search items…", sort: { key: "status", dir: "asc" }, pageSize: 8, empty: "Every item is in stock." }) });
  }

  function expiring() {
    const near = cfg().nearExpiryDays || 30, t = U.today();
    const rows = all((m) => m.batches.filter((b) => b.expiry && b.qty > 0).map((b) => Object.assign({}, b, { days: U.daysBetween(t, b.expiry) })))
      .filter((b) => b.days <= near);
    const badge = (b) => (b.days < 0 ? ui.badge("Expired " + U.plural(-b.days, "day") + " ago", "crit", "ban") : b.days === 0 ? ui.badge("Today", "crit", "alert") : ui.badge(U.plural(b.days, "day") + " left", b.days <= 7 ? "warn" : "info", "hourglass"));
    return ui.card({ title: "Expired & expiring soon", sub: "Batches with stock expiring within " + near + " days", flush: true,
      body: ui.table({ title: "Expiring batches", columns: [
        { key: "item", label: "Item", strong: true, value: (b) => b.item, search: (b) => b.batch, render: (b) => ui.cell(b.item, b.batch) },
        { key: "_k", label: "Store", value: (b) => dashOf(b._k).label, render: (b) => tag(b._k) },
        { key: "qty", label: "Qty", num: true, value: (b) => b.qty },
        { key: "expiry", label: "Expiry", date: true, value: (b) => b.expiry, render: (b) => U.fmtDate(b.expiry) },
        { key: "days", label: "Status", value: (b) => b.days, text: (b) => (b.days < 0 ? "Expired" : U.plural(b.days, "day") + " left"), render: badge }
      ], rows: rows, noun: "batch", search: rows.length > 8, sort: { key: "days", dir: "asc" }, pageSize: 8, empty: "Nothing expires in the next " + near + " days." }) });
  }

  function render() {
    if (!loaded().length && !Object.keys(state.errors).length) return;
    const range = U.periodRange(state.period);
    state.updatedEl.textContent = state.loadedAt ? "Updated " + U.fmtTime(state.loadedAt) : "";
    const errs = Object.keys(state.errors);
    C.clear(root()).appendChild(h("div", { class: "stack" },
      errs.length ? ui.note(["Could not build ", h("b", null, errs.map((k) => dashOf(k).label).join(", ")), ": " + errs.map((k) => state.errors[k]).join(" · ")], "warn") : null,
      attention(),
      h("div", { class: "kpis five" }, kpiTiles(range)),
      quickActions(),
      h("div", { class: "grid grid-3" }, loaded().map((k) => moduleCard(k, range))),
      h("div", { class: "grid grid-main" }, trendCard(), statusCard(range)),
      h("div", { class: "grid grid-2" }, watchlist(), expiring())));
  }

  /* ---------- boot ---------- */
  function boot() {
    if (C.config.defaultPeriod && U.PERIODS.some((p) => p.key === C.config.defaultPeriod)) state.period = C.config.defaultPeriod;
    document.title = "Management Console · " + C.config.orgName;
    renderTopbar();
    load(false);
  }
  C.console = { state, load };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window.CIMS = window.CIMS || {});
