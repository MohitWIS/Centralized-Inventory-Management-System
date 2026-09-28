/* Section views shared by all three dashboards:
   1. Overview (+ 2. Quick actions)  3. Inventory management  4. Request management */
(function (C) {
  "use strict";
  const h = C.h, U = C.util, ui = C.ui, CH = C.charts, M = C.model;
  const V = (C.views = C.views || {});
  const K = (C.vk = {});
  const SRC_LABEL = { items: "item master", transactions: "stock ledger", requests: "requests", purchaseRequests: "purchase requests" };
  const STOCK_RANK = { out: 0, low: 1, ok: 2, unknown: 3 };
  const CONS_TAB = { housekeeping: ["inventory", "issue-return"], pantry: ["pantry", "consumption"], stationery: ["stationery", "cost"] };

  /* ================= shared helpers (also used by views-modules.js) ================= */
  K.valFn = (m) => (m.hasValues ? (c) => c.value || 0 : (c) => c.qty || 0);
  K.fmtVal = (m) => (m.hasValues ? (n) => U.fmtMoney(n) : (n) => U.fmtNum(n));
  K.tickVal = (m) => (m.hasValues ? (n) => U.fmtMoney(n, true) : U.fmtCompact);
  K.valLabel = (m) => (m.hasValues ? "value" : "units");
  K.inPeriod = (rows, range, f) => rows.filter((r) => U.inRange(f ? f(r) : r.date, range));
  K.kpiRow = (tiles) => h("div", { class: "kpis" }, tiles);
  K.tat = (r) => (r.date && r.completedDate ? (r.completedDate - r.date) / 3600000 : null);
  K.fmtDur = (hrs) => (hrs == null || hrs < 0 ? "—" : hrs < 24 ? U.fmtNum(hrs, hrs < 10 ? 1 : 0) + " h" : U.fmtNum(hrs / 24, 1) + " d");
  K.avg = (xs) => (xs.length ? U.sum(xs, (x) => x) / xs.length : null);
  K.linkBtn = (label, fn) => h("button", { class: "btn sm ghost", type: "button", onclick: fn }, label, C.icon("arrowRight"));

  K.open = function (kind, name) {
    if (!name) return;
    try { C.api.open(kind, name); } catch (e) { ui.toast("Could not open " + name + ": " + C.api.errorMessage(e), "crit"); }
  };
  // The report a source actually loaded from (config may list fallbacks), else the first configured.
  K.report = (ctx, source) => (ctx.model && ctx.model.sources[source] && ctx.model.sources[source].report) || U.list(ctx.dash.reports[source])[0] || "";
  // True when requests come from the per-user fallback (the viewer can't open the team-wide All_ report).
  K.limited = (ctx) => !!(ctx.model && ctx.model.sources.requests && (ctx.model.sources.requests.fallbackFrom || []).length);
  K.limitedNote = (ctx) => {
    const src = ctx.model.sources.requests;
    return ui.note(["Showing your own requests from ", h("b", null, src.report), " — ", src.fallbackFrom.map((f) => f.report).join(", "),
      " can't be opened with your access, so team-wide figures and approvals aren't available."], "warn");
  };
  // Which "new …" actions to offer — shared by Quick actions and Request management.
  K.newActions = (ctx) => {
    const forms = ctx.dash.forms || {}, pr = K.report(ctx, "purchaseRequests"), rq = K.report(ctx, "requests");
    return { pr: pr, rq: rq, showPR: !!forms.purchaseRequest || !!pr, showReq: !!forms.request || (!!rq && rq !== pr) };
  };
  K.openNew = function (ctx, formKey, reportKey) {
    const f = (ctx.dash.forms || {})[formKey], r = K.report(ctx, reportKey);
    if (f) K.open("Form", f);
    else if (r) K.open("Report", r);
    else ui.toast("Set dashboards." + ctx.key + ".forms." + formKey + " in js/config.js", "crit");
  };
  K.openBtn = (ctx, source) => {
    const r = K.report(ctx, source);
    return r ? h("button", { class: "btn sm", type: "button", onclick: () => K.open("Report", r) }, "Open in Creator", C.icon("external")) : null;
  };

  /* Empty state when a report is not configured / failed / has no rows. */
  K.guardEmpty = function (ctx, source, what) {
    const s = ctx.model.sources[source];
    if (s.state === "ok" && s.records.length) return null;
    const btn = h("button", { class: "btn", type: "button", onclick: ctx.openSources }, C.icon("database"), "Data sources");
    if (s.state === "unconfigured") return ui.empty({ icon: "database", tone: "accent", title: "Connect the " + SRC_LABEL[source] + " report", text: ["Add its link name to ", h("code", null, "dashboards." + ctx.key + ".reports." + source), " in js/config.js to see " + (what || "this view") + "."], action: btn });
    if (s.state === "error") return ui.empty({ icon: "alert", tone: "crit", title: "Could not load " + s.report, text: s.error, action: btn });
    return ui.empty({ icon: "inbox", title: "No records in " + s.report + " yet", text: "Records added in Creator appear here after a refresh." });
  };
  K.guard = (ctx, source, what) => { const e = K.guardEmpty(ctx, source, what); return e ? ui.card({ body: e }) : null; };

  /* ---------- request tables ---------- */
  const waitBadge = (d) => ui.badge(d <= 0 ? "Today" : U.plural(d, "day"), d > 7 ? "crit" : d > 3 ? "warn" : "", "clock");
  const age = (r) => (r.date ? U.daysBetween(r.date, new Date()) : null);
  K.requestColumns = function (o) {
    o = o || {};
    const cols = [
      { key: "no", label: "Request", strong: true, value: (r) => r.no },
      { key: "date", label: "Date", date: true, value: (r) => r.date, render: (r) => U.fmtDate(r.date) },
      { key: "item", label: "Item", value: (r) => r.item, render: (r) => ui.cell(r.item, r.remarks) },
      { key: "qty", label: "Qty", num: true, value: (r) => r.qty },
      { key: "employee", label: "Requested by", value: (r) => r.employee, render: (r) => ui.person(r.employee, r.department) }
    ];
    if (o.location) cols.push({ key: "location", label: "Location", value: (r) => r.location });
    if (o.assignee) cols.push({ key: "assignedTo", label: "Assigned to", value: (r) => r.assignedTo, render: (r) => (r.assignedTo ? ui.person(r.assignedTo) : ui.badge("Unassigned", "warn", "user")) });
    if (o.priority) cols.push({ key: "priority", label: "Priority", value: (r) => r.priorityRank, render: (r) => ui.priorityBadge(r.priority) });
    if (o.waiting) cols.push({ key: "waiting", label: "Waiting", num: true, value: age, render: (r) => (r.date ? waitBadge(age(r)) : "—") });
    if (o.turnaround) cols.push({ key: "tat", label: "Turnaround", num: true, value: K.tat, render: (r) => K.fmtDur(K.tat(r)) });
    cols.push({ key: "status", label: "Status", value: (r) => r.status, render: (r) => ui.statusBadge(r.group, r.status) });
    if (o.actions) cols.push(o.actions);
    return cols;
  };
  K.requestsTable = (ctx, rows, o) => {
    o = o || {};
    return ui.table({ columns: K.requestColumns(o), rows: rows, noun: "request", placeholder: "Search requests, items, people…", sort: o.sort || { key: "date", dir: "desc" }, pageSize: o.pageSize || 10, empty: o.empty });
  };

  /* ---------- stock tables ---------- */
  // Hide optional columns that are empty for every row (e.g. a stock report without categories or prices).
  K.dropEmpty = (cols, rows) => cols.filter((c) => !c.optional || rows.some((r) => { const v = c.value ? c.value(r) : r[c.key]; return v != null && v !== ""; }));
  K.stockCols = function (meter) {
    const cols = [
      { key: "name", label: "Item", strong: true, value: (i) => i.name, search: (i) => [i.code, i.brand].join(" "), render: (i) => ui.cell(i.name, [i.code, i.brand].filter(Boolean).join(" · ")) },
      { key: "category", label: "Category", optional: true, value: (i) => i.subCategory || i.category, render: (i) => ui.cell(i.subCategory || i.category || "—", i.subCategory ? i.category : "") },
      { key: "stock", label: "In stock", num: true, value: (i) => i.stock, render: (i) => (i.stock == null ? "—" : U.fmtNum(i.stock) + (i.unit ? " " + i.unit : "")) },
      { key: "reorderLevel", label: "Reorder at", num: true, value: (i) => i.reorderLevel }
    ];
    if (meter) cols.push({ key: "level", label: "Level", sort: false, className: "meter-cell", render: (i) => (i.stock == null || !i.reorderLevel ? "—" : ui.meter(i.stock, i.reorderLevel * 3, i.stockStatus === "out" ? "crit" : i.stockStatus === "low" ? "warn" : "good")) });
    cols.push(
      { key: "unitPrice", label: "Unit price", optional: true, money: true, value: (i) => i.unitPrice },
      { key: "value", label: "Value", optional: true, money: true, value: (i) => i.value },
      { key: "status", label: "Status", value: (i) => STOCK_RANK[i.stockStatus], render: (i) => ui.stockBadge(i) });
    return cols;
  };
  K.byReport = (m) => m.stockStatusFrom === "report"; // badges follow Creator's Status, not quantities
  /* Explains items whose Creator stock status disagrees with their quantities. */
  K.statusNote = function (ctx) {
    const m = ctx.model, list = m.statusMismatches || [];
    if (!list.length) return null;
    const ex = list[0];
    return ui.note([
      h("b", null, U.plural(list.length, "item")), " where Creator's ", h("code", null, m.stockStatusField || "stock status"), " doesn't match the quantity — e.g. ",
      h("b", null, ex.name), " is “" + ex.reportStatusLabel + "” in Creator with " + U.fmtNum(ex.stock) + " in stock (reorder at " + U.fmtNum(ex.reorderLevel) + "). ",
      m.stockStatusFrom === "report"
        ? ["Badges follow Creator; set ", h("code", null, 'stockStatusFrom: "numbers"'), " in js/config.js to use the quantities instead."]
        : ["Badges follow the quantities; set ", h("code", null, 'stockStatusFrom: "report"'), " in js/config.js to follow Creator."]
    ], "warn");
  };
  K.currentStock = function (ctx) {
    const g = K.guard(ctx, "items", "current stock");
    if (g) return g;
    const m = ctx.model;
    const low = m.items.filter((i) => i.stockStatus === "low").length, out = m.items.filter((i) => i.stockStatus === "out").length;
    const value = U.sum(m.items, (i) => i.value);
    return h("div", { class: "stack" },
      K.statusNote(ctx),
      K.kpiRow([
        ui.kpi({ label: "Items tracked", value: U.fmtNum(m.items.length), icon: "package" }),
        ui.kpi({ label: "Units in stock", value: U.fmtCompact(U.sum(m.items, (i) => Math.max(i.stock || 0, 0))), icon: "warehouse", tone: "info" }),
        ui.kpi({ label: "Stock value", value: value ? U.fmtMoney(value, true) : "—", icon: "rupee", tone: "good", sub: value ? "at unit price" : "no unit prices recorded" }),
        ui.kpi({ label: "Low / out of stock", value: U.fmtNum(low + out), icon: "alert", tone: low + out ? "warn" : "good", sub: U.fmtNum(out) + " out of stock", onClick: () => ctx.go("inventory", "reorder") })
      ]),
      ui.card({ title: "Current stock", sub: "Live balance per item against its reorder level", actions: [K.openBtn(ctx, "items")], flush: true,
        body: ui.table({ columns: K.dropEmpty(K.stockCols(true), m.items), rows: m.items, noun: "item", placeholder: "Search items…", sort: { key: "status", dir: "asc" }, pageSize: 12 }) }));
  };
  K.reorderList = function (ctx) {
    const g = K.guard(ctx, "items", "low stock alerts");
    if (g) return g;
    const m = ctx.model;
    const prItems = new Set(m.purchases.filter(M.isOpen).map((p) => U.norm(p.item)));
    const rows = m.items.filter((i) => i.stockStatus === "low" || i.stockStatus === "out").map((i) => {
      // only suggest quantities the numbers support (Creator's Status can list items without a stock figure)
      const stock = i.stock == null ? null : Math.max(i.stock, 0), lvl = i.reorderLevel;
      const suggest = i.reorderQty || (stock != null && lvl != null ? Math.max(lvl * 2 - stock, lvl, 1) : null);
      return Object.assign({}, i, { shortfall: stock != null && lvl != null ? Math.max(lvl - stock, 0) : null, suggest: suggest, estCost: suggest != null && i.unitPrice != null ? suggest * i.unitPrice : null, hasPR: prItems.has(U.norm(i.name)) });
    });
    const est = U.sum(rows, (i) => i.estCost);
    const prBtn = h("button", { class: "btn primary sm", type: "button", onclick: () => K.openNew(ctx, "purchaseRequest", "purchaseRequests") }, C.icon("cart"), "New purchase request");
    const cols = [
      { key: "name", label: "Item", strong: true, value: (i) => i.name, search: (i) => [i.code, i.brand, i.category, i.subCategory].join(" "), render: (i) => ui.cell(i.name, i.subCategory || i.category || i.brand) },
      { key: "stock", label: "In stock", num: true, value: (i) => i.stock },
      { key: "reorderLevel", label: "Reorder at", num: true, value: (i) => i.reorderLevel },
      { key: "shortfall", label: "Shortfall", num: true, value: (i) => i.shortfall },
      { key: "suggest", label: "Suggested order", num: true, value: (i) => i.suggest, render: (i) => (i.suggest == null ? "—" : h("b", null, U.fmtNum(i.suggest) + (i.unit ? " " + i.unit : ""))) },
      { key: "estCost", label: "Est. cost", money: true, value: (i) => i.estCost },
      { key: "hasPR", label: "Purchase request", value: (i) => (i.hasPR ? 0 : 1), render: (i) => (i.hasPR ? ui.badge("Raised", "info", "cart") : ui.badge("Not raised", "", "minus")) },
      { key: "status", label: "Status", value: (i) => STOCK_RANK[i.stockStatus], render: (i) => ui.stockBadge(i) }
    ];
    return h("div", { class: "stack" },
      K.statusNote(ctx),
      rows.length ? ui.note([h("b", null, U.plural(rows.length, "item")), K.byReport(m) ? " marked Low / Out of Stock in Creator" : " at or below the reorder level", est ? " · estimated reorder cost " + U.fmtMoney(est) : "", " · " + U.fmtNum(rows.filter((r) => !r.hasPR).length) + " without an open purchase request"], "warn") : null,
      ui.card({ title: "Low stock & reorder", sub: "Suggested order = reorder quantity, or enough to reach twice the reorder level", actions: [prBtn], flush: true,
        body: rows.length ? ui.table({ columns: cols, rows: rows, noun: "item", sort: { key: "status", dir: "asc" }, pageSize: 12 }) : ui.empty({ icon: "checkCircle", tone: "good", title: K.byReport(m) ? "No items are marked Low or Out of Stock in Creator" : "Every item is above its reorder level" }) }));
  };

  /* ---------- chart cards ---------- */
  K.groupCard = function (ctx, o) {
    const m = ctx.model, vf = K.valFn(m), fmt = K.fmtVal(m);
    const lines = K.inPeriod(m.consumption, ctx.range);
    const groups = U.group(lines, o.key, vf);
    const total = U.sum(groups, (g) => g.value);
    const rows = groups.map((g) => ({ label: g.key, value: g.value, qty: U.sum(g.rows, (c) => c.qty), count: g.count, share: total ? (g.value / total) * 100 : 0, sub: U.plural(g.count, "issue") }));
    const cols = [{ key: "label", label: o.label, strong: true }, { key: "qty", label: "Units", num: true }]
      .concat(m.hasValues ? [{ key: "value", label: "Value", money: true }] : [])
      .concat([{ key: "count", label: "Issues", num: true }, { key: "share", label: "Share", num: true, render: (r) => U.fmtPct(r.share) }]);
    return ui.chartCard({
      title: o.title, sub: ctx.range.label + (m.hasValues ? " · by value" : " · by units"), actions: o.actions,
      chart: () => CH.bars(rows, { format: fmt, limit: o.limit || 12, valueLabel: K.valLabel(m) }),
      table: { columns: cols, rows: rows, sort: { key: m.hasValues ? "value" : "qty", dir: "desc" }, noun: o.noun || "row", search: rows.length > 8 },
      emptyText: m.consumptionSource ? "Nothing was issued in this period." : "Consumption is calculated from completed requests or ledger issues."
    });
  };
  K.trendCard = function (ctx, o) {
    const m = ctx.model;
    const vf = o.valFn || K.valFn(m);
    const fmt = o.format || K.fmtVal(m);
    const points = o.days ? M.byDay(o.rows, o.days, vf, o.dateFn) : M.byMonth(o.rows, o.months || 12, vf, o.dateFn);
    points.forEach((p) => { p.sub = U.plural(p.count, o.countNoun || "issue", o.countMany); });
    const cols = [{ key: "key", label: o.days ? "Day" : "Month", render: (p) => p.full }, { key: "value", label: o.valueHeader || (m.hasValues ? "Value" : "Units"), num: true, render: (p) => fmt(p.value) }];
    if (!o.countless) cols.push({ key: "count", label: o.countHeader || "Issues", num: true });
    return ui.chartCard({
      title: o.title, sub: o.sub, actions: o.actions, className: o.className,
      chart: () => (points.some((p) => p.value > 0) ? CH.columns(points, { format: fmt, tickFormat: o.tickFormat || K.tickVal(m), valueLabel: o.valueLabel || "", height: o.height, label: o.title }) : null),
      table: { columns: cols, rows: points, sort: { key: "key", dir: "desc" }, noun: o.days ? "day" : "month", pageSize: o.days ? 10 : 12 }
    });
  };
  K.statusStack = function (rows, onClick) {
    const segs = ui.STATUS_ORDER.map((g) => ({ id: g, label: M.GROUP_LABEL[g], value: rows.filter((r) => r.group === g).length, color: ui.STATUS_COLOR[g] })).filter((s) => s.value > 0);
    return CH.stack(segs, { onClick: onClick });
  };
  K.statusCard = function (ctx, rows, title, sub) {
    const segs = ui.STATUS_ORDER.map((g) => ({ id: g, label: M.GROUP_LABEL[g], value: rows.filter((r) => r.group === g).length })).filter((s) => s.value > 0);
    return ui.chartCard({ title: title, sub: sub, chart: () => K.statusStack(rows, () => ctx.go("requests", "tracking")),
      table: { columns: [{ key: "label", label: "Status", render: (s) => ui.statusBadge(s.id) }, { key: "value", label: "Requests", num: true }], rows: segs, sort: { key: "value", dir: "desc" }, noun: "status", search: false } });
  };
  const miniReq = (x) => h("div", { class: "mini-row" },
    h("div", { style: { minWidth: 0 } }, h("div", { class: "mini-name ellipsis" }, x.item || x.no), h("div", { class: "mini-sub" }, [x.no, x.employee, U.fmtShort(x.date)].filter(Boolean).join(" · "))),
    ui.statusBadge(x.group, x.status));

  /* ================= 1. Overview + 2. Quick actions ================= */
  function quickActions(ctx) {
    const d = ctx.dash, m = ctx.model, na = K.newActions(ctx), pr = na.pr;
    const qa = (o) => h("button", { class: "qa" + (o.primary ? " primary" : ""), type: "button", onclick: o.run, title: o.external ? "Opens in Zoho Creator" : null },
      h("span", { class: "tone-tile tone-" + (o.tone || "accent") }, C.icon(o.icon)),
      h("span", null, h("span", { class: "qa-title" }, o.title), h("span", { class: "qa-desc" }, o.desc)),
      o.external ? h("span", { class: "qa-ext" }, C.icon("external")) : null);
    const low = m.items.filter((i) => i.stockStatus === "low" || i.stockStatus === "out").length;
    const pend = m.requests.filter((r) => r.group === "pending").length;
    return ui.card({ title: "Quick actions", sub: "Raise purchase requests and jump to common tasks", body: h("div", { class: "qa-grid" }, [
      na.showPR && qa({ primary: true, icon: "cart", title: "New purchase request", desc: "Raise a purchase request in Creator", external: true, run: () => K.openNew(ctx, "purchaseRequest", "purchaseRequests") }),
      pr && qa({ icon: "clipboard", tone: "violet", title: "Purchase requests", desc: U.plural(m.purchases.filter(M.isOpen).length, "open request") + " · view all", external: true, run: () => K.open("Report", pr) }),
      na.showReq && qa({ primary: !na.showPR, icon: "filePlus", title: "New " + d.label.toLowerCase() + " request", desc: "Submit an item request in Creator", external: true, run: () => K.openNew(ctx, "request", "requests") }),
      !K.limited(ctx) && qa({ icon: "shield", tone: "warn", title: "Approve requests", desc: pend ? U.plural(pend, "request") + " waiting" : "Nothing waiting", run: () => ctx.go("requests", "approvals") }),
      qa({ icon: "alert", tone: "crit", title: "Reorder list", desc: low ? U.plural(low, "item") + " need stock" : "All items stocked", run: () => ctx.go("inventory", "reorder") }),
      qa({ icon: "book", tone: "info", title: "Stock ledger", desc: "Every stock movement", run: () => ctx.go("inventory", "ledger") })
    ].filter(Boolean)) });
  }

  V.overview = function (ctx) {
    const m = ctx.model, r = ctx.range, dash = ctx.dash, S = m.sources, cfg = ctx.cfg;
    const itemsOk = S.items.state === "ok" && m.items.length > 0;
    const low = m.items.filter((i) => i.stockStatus === "low"), out = m.items.filter((i) => i.stockStatus === "out");
    const pending = m.requests.filter((x) => x.group === "pending");
    const periodReq = K.inPeriod(m.requests, r);
    const cons = K.inPeriod(m.consumption, r);
    const openPR = m.purchases.filter(M.isOpen);
    const now = new Date();
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const pStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const pEnd = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth(), 0).getDate()), 23, 59, 59);
    const mtd = U.sum(m.consumption.filter((c) => c.date && c.date >= mStart), (c) => c.qty);
    const prev = U.sum(m.consumption.filter((c) => c.date && c.date >= pStart && c.date <= pEnd), (c) => c.qty);
    const stockValue = U.sum(m.items, (i) => i.value);
    const lower = r.label.toLowerCase();
    const cTab = CONS_TAB[ctx.key] || ["inventory", "issue-return"];
    const connect = (src) => (S[src].state === "error" ? "couldn't load the " : "connect the ") + SRC_LABEL[src];
    // a 0 is only a real answer when the data loaded — otherwise show "—"
    const reqOk = S.requests.state === "ok", consOk = reqOk || !!m.consumptionSource;

    const tiles = [
      ui.kpi({ label: "Total stock items", icon: "package", value: itemsOk ? U.fmtNum(m.items.length) : "—", sub: itemsOk ? (stockValue ? U.fmtMoney(stockValue, true) + " stock value" : "in the item master") : connect("items"), onClick: () => ctx.go("inventory", "item-master") }),
      ui.kpi({ label: "Low stock items", icon: "alert", tone: "warn", value: itemsOk ? U.fmtNum(low.length) : "—", sub: itemsOk ? (K.byReport(m) ? "marked Low Stock in Creator" : "at or below reorder level") : connect("items"), onClick: () => ctx.go("inventory", "reorder") }),
      ui.kpi({ label: "Out of stock", icon: "ban", tone: "crit", value: itemsOk ? U.fmtNum(out.length) : "—", sub: itemsOk ? (out.length ? "need immediate reorder" : "every item available") : connect("items"), onClick: () => ctx.go("inventory", "reorder") }),
      ui.kpi({ label: "Pending requests", icon: "clock", tone: "warn", value: reqOk ? U.fmtNum(pending.length) : "—", sub: reqOk ? "awaiting approval" : connect("requests"), onClick: () => ctx.go("requests", "pending") }),
      ui.kpi({ label: "Items issued", icon: "send", tone: "info", value: consOk ? U.fmtCompact(U.sum(cons, (c) => c.qty)) : "—", unit: consOk ? "units" : null, sub: consOk ? U.plural(cons.length, "issue") + " · " + lower : connect("requests"), onClick: () => ctx.go("inventory", "issue-return") }),
      ui.kpi({ label: "Pending / overdue returns", icon: "undo", tone: m.overdueReturns.length ? "crit" : "neutral", value: m.returnsTracked ? U.fmtNum(m.pendingReturns.length) : "—",
        sub: m.returnsTracked ? U.fmtNum(m.overdueReturns.length) + " overdue" : "no return dates recorded", onClick: () => ctx.go("inventory", "issue-return") }),
      ui.kpi({ label: "Pending purchase requests", icon: "cart", tone: "violet", value: S.purchaseRequests.state === "ok" ? U.fmtNum(openPR.length) : "—",
        sub: S.purchaseRequests.state === "ok" ? U.fmtNum(openPR.filter((p) => p.group === "pending").length) + " awaiting approval" : connect("purchaseRequests"), title: "Open " + K.report(ctx, "purchaseRequests") + " in Creator", onClick: () => K.open("Report", K.report(ctx, "purchaseRequests")) }),
      ui.kpi({ label: "Monthly consumption", icon: "trend", value: consOk ? U.fmtCompact(mtd) : "—", unit: consOk ? "units" : null, delta: consOk ? { pct: prev ? ((mtd - prev) / prev) * 100 : null, upIsGood: null, title: "vs the same days last month" } : null, sub: consOk ? "month to date" : connect("requests"), onClick: () => ctx.go(cTab[0], cTab[1]) }),
      ui.kpi({ label: dash.label + " requests", icon: "clipboard", value: reqOk ? U.fmtNum(periodReq.length) : "—", sub: reqOk ? U.fmtNum(periodReq.filter(M.isOpen).length) + " open · " + lower : connect("requests"), onClick: () => ctx.go("requests", "tracking") }),
      ui.kpi({ label: dash.label + " consumption", icon: "wallet", tone: "good", value: !consOk ? "—" : m.hasValues ? U.fmtMoney(U.sum(cons, (c) => c.value), true) : U.fmtCompact(U.sum(cons, (c) => c.qty)), unit: consOk && !m.hasValues ? "units" : null,
        sub: consOk ? U.plural(new Set(cons.map((c) => U.norm(c.item))).size, "item") + " · " + lower : connect("requests"), onClick: () => ctx.go(cTab[0], cTab[1]) })
    ];

    const alerts = [];
    if (out.length) alerts.push(["ban", U.plural(out.length, "item") + " out of stock", () => ctx.go("inventory", "reorder")]);
    if (low.length) alerts.push(["alert", U.plural(low.length, "item") + " running low", () => ctx.go("inventory", "reorder")]);
    if (pending.length && !K.limited(ctx)) alerts.push(["shield", U.plural(pending.length, "request") + " to approve", () => ctx.go("requests", "approvals")]);
    if (m.overdueReturns.length) alerts.push(["undo", U.plural(m.overdueReturns.length, "return") + " overdue", () => ctx.go("inventory", "issue-return")]);
    if (m.statusMismatches.length) alerts.push(["info", U.plural(m.statusMismatches.length, "stock status", "stock statuses") + " to check", () => ctx.go("inventory", "item-master")]);
    const expiring = m.items.filter((i) => i.expiry && (i.stock || 0) > 0 && U.daysBetween(new Date(), i.expiry) <= (cfg.nearExpiryDays || 30));
    if (expiring.length) alerts.push(["hourglass", U.plural(expiring.length, "item") + " expired or expiring", () => (ctx.key === "pantry" ? ctx.go("pantry", "expiry") : ctx.go("inventory", "current"))]);
    const errs = Object.keys(S).map((k) => S[k]).filter((s) => s.state === "error");

    const recent = m.requests.slice().sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, 5);
    const ratio = (i) => (i.stock == null ? 1e9 : i.stock / (i.reorderLevel || 1));
    const lowList = out.concat(low).sort((a, b) => STOCK_RANK[a.stockStatus] - STOCK_RANK[b.stockStatus] || ratio(a) - ratio(b)).slice(0, 7);
    const statusCard = ui.card({ title: "Requests by status", sub: r.label + " · " + U.plural(periodReq.length, "request"), actions: [K.linkBtn("Track", () => ctx.go("requests", "tracking"))],
      body: h("div", null, K.statusStack(periodReq, () => ctx.go("requests", "tracking")) || ui.empty({ icon: "inbox", title: "No requests in this period" }),
        recent.length ? h("div", { class: "mini", style: { marginTop: "18px" } }, h("div", { class: "mini-sub", style: { marginBottom: "8px", fontWeight: 600 } }, "Latest requests"), recent.map(miniReq)) : null) });
    const lowCard = ui.card({ title: "Low stock watchlist", sub: itemsOk ? U.plural(low.length + out.length, "item") + (K.byReport(m) ? " marked Low / Out of Stock" : " at or below reorder level") : "Track stock by connecting the item master",
      actions: itemsOk ? [K.linkBtn("Reorder list", () => ctx.go("inventory", "reorder"))] : null,
      body: !itemsOk ? K.guardEmpty(ctx, "items", "stock levels") : lowList.length ? h("div", { class: "mini" }, lowList.map((i) => h("div", { class: "mini-row" },
        h("div", { style: { minWidth: 0 } }, h("div", { class: "mini-name ellipsis" }, i.name),
          i.stock != null && i.reorderLevel != null
            ? h("div", { class: "meter-row", style: { marginTop: "7px", maxWidth: "340px" } }, ui.meter(i.stock, (i.reorderLevel || 1) * 2, i.stockStatus === "out" ? "crit" : "warn"), h("span", { class: "mini-sub" }, U.fmtNum(i.stock) + " of " + U.fmtNum(i.reorderLevel) + " min"))
            : h("div", { class: "mini-sub", style: { marginTop: "4px" } }, i.stock != null ? U.fmtNum(i.stock) + " in stock" : "“" + (i.reportStatusLabel || "Low") + "” in Creator")),
        ui.stockBadge(i)))) : ui.empty({ icon: "checkCircle", tone: "good", title: K.byReport(m) ? "Nothing is marked Low or Out of Stock in Creator" : "Everything is above its reorder level" }) });

    return h("div", { class: "stack" },
      errs.length ? ui.note(["Could not load ", h("b", null, Array.from(new Set(errs.map((s) => s.report))).join(", ")), " — open Data sources for details."], "warn") : null,
      K.limited(ctx) ? K.limitedNote(ctx) : null,
      alerts.length ? h("div", { class: "attention" }, h("strong", null, C.icon("bell"), "Needs attention"), h("div", { class: "chips" }, alerts.map((a) => h("button", { type: "button", onclick: a[2] }, C.icon(a[0]), a[1])))) : null,
      h("div", { class: "kpis five" }, tiles),
      quickActions(ctx),
      h("div", { class: "grid grid-main" }, K.trendCard(ctx, { title: "Consumption trend", sub: "Last 12 months · " + (m.hasValues ? "value issued" : "units issued"), rows: m.consumption, months: 12 }), statusCard),
      h("div", { class: "grid grid-2" }, K.groupCard(ctx, { title: "Top consumed items", label: "Item", key: (c) => c.item, limit: 8, noun: "item" }), lowCard));
  };

  /* ================= 3. Inventory management ================= */
  const INV_TABS = [
    { id: "item-master", label: "Item master", icon: "package" },
    { id: "categories", label: "Category & sub-category", icon: "layers" },
    { id: "stock-in-out", label: "Stock in / out", icon: "updown" },
    { id: "issue-return", label: "Item issue & return", icon: "repeat" },
    { id: "adjustments", label: "Stock adjustment", icon: "sliders" },
    { id: "ledger", label: "Stock ledger", icon: "book" },
    { id: "current", label: "Current stock", icon: "warehouse" },
    { id: "reorder", label: "Low stock & reorder", icon: "alert" },
    { id: "valuation", label: "Stock valuation", icon: "rupee" }
  ];
  const INV = {};
  const kindBadge = (t) => {
    const s = { opening: ["", "flag"], in: ["good", "arrowDown"], out: ["warn", "arrowUp"], issue: ["info", "send"], return: ["violet", "undo"], adjustment: ["crit", "sliders"] }[t.kind] || ["", "info"];
    return ui.badge(t.typeLabel, s[0], s[1]);
  };
  K.ledgerCols = (withBalance) => [
    { key: "date", label: "Date", date: true, value: (t) => t.date, render: (t) => U.fmtDate(t.date) },
    { key: "reference", label: "Reference", value: (t) => t.reference },
    { key: "item", label: "Item", strong: true, value: (t) => t.item },
    { key: "kind", label: "Type", value: (t) => t.typeLabel, render: kindBadge },
    { key: "in", label: "In", num: true, value: (t) => (t.signed > 0 ? t.signed : null), render: (t) => (t.signed > 0 ? "+" + U.fmtNum(t.signed) : "") },
    { key: "out", label: "Out", num: true, value: (t) => (t.signed < 0 ? -t.signed : null), render: (t) => (t.signed < 0 ? "−" + U.fmtNum(-t.signed) : "") },
    withBalance ? { key: "balance", label: "Balance", num: true, strong: true, value: (t) => t.runBalance } : null,
    { key: "party", label: "Party", value: (t) => t.employee || t.vendor || t.department, render: (t) => (t.employee ? ui.person(t.employee, t.department) : t.vendor || t.department || "—") },
    { key: "remarks", label: "Remarks", value: (t) => t.remarks }
  ].filter(Boolean);

  INV["item-master"] = (ctx) => K.guard(ctx, "items", "the item master") || h("div", { class: "stack" }, K.statusNote(ctx), ui.card({
    title: "Item master", sub: U.plural(ctx.model.items.length, "item") + " in " + K.report(ctx, "items"), actions: [K.openBtn(ctx, "items")], flush: true,
    body: ui.table({ columns: K.dropEmpty([
      { key: "code", label: "Code", optional: true, value: (i) => i.code },
      { key: "name", label: "Item", strong: true, value: (i) => i.name },
      { key: "brand", label: "Brand", optional: true, value: (i) => i.brand },
      { key: "category", label: "Category", optional: true, value: (i) => i.category },
      { key: "subCategory", label: "Sub-category", optional: true, value: (i) => i.subCategory },
      { key: "unit", label: "Unit", optional: true, value: (i) => i.unit },
      { key: "unitPrice", label: "Unit price", optional: true, money: true, value: (i) => i.unitPrice },
      { key: "reorderLevel", label: "Reorder at", num: true, value: (i) => i.reorderLevel },
      { key: "stock", label: "In stock", num: true, value: (i) => i.stock },
      { key: "status", label: "Status", value: (i) => STOCK_RANK[i.stockStatus], render: (i) => ui.stockBadge(i) }
    ], ctx.model.items), rows: ctx.model.items, noun: "item", placeholder: "Search items…", sort: { key: "name", dir: "asc" }, pageSize: 15 })
  }));

  INV.categories = function (ctx) {
    const g = K.guard(ctx, "items", "categories");
    if (g) return g;
    const m = ctx.model, hasVal = m.items.some((i) => i.value != null);
    const rows = [];
    U.group(m.items, (i) => i.category || "Uncategorised").forEach((cat) => U.group(cat.rows, (i) => i.subCategory || "General").forEach((sub) => rows.push({
      category: cat.key, sub: sub.key, items: sub.count, units: U.sum(sub.rows, (i) => Math.max(i.stock || 0, 0)),
      alerts: sub.rows.filter((i) => i.stockStatus === "low" || i.stockStatus === "out").length, value: U.sum(sub.rows, (i) => i.value)
    })));
    const cats = new Set(rows.map((r) => r.category));
    const bars = rows.map((r) => ({ label: cats.size > 1 ? r.category + " › " + r.sub : r.sub, value: hasVal ? r.value : r.items, sub: U.plural(r.items, "item") })).sort((a, b) => b.value - a.value);
    return h("div", { class: "stack" },
      K.kpiRow([
        ui.kpi({ label: "Categories", value: U.fmtNum(cats.size), icon: "layers" }),
        ui.kpi({ label: "Sub-categories", value: U.fmtNum(rows.length), icon: "tag", tone: "info" }),
        ui.kpi({ label: "Items", value: U.fmtNum(m.items.length), icon: "package", tone: "violet" }),
        ui.kpi({ label: "Largest sub-category", value: bars[0] ? bars[0].label : "—", icon: "award", tone: "good", sub: bars[0] ? (hasVal ? U.fmtMoney(bars[0].value, true) + " stock value" : bars[0].sub) : "" })
      ]),
      ui.chartCard({ title: "Stock by sub-category", sub: hasVal ? "Stock value at unit price" : "Number of items", chart: () => CH.bars(bars, { format: hasVal ? (n) => U.fmtMoney(n) : U.fmtNum, limit: 14 }),
        table: { columns: [{ key: "category", label: "Category", strong: true }, { key: "sub", label: "Sub-category" }, { key: "items", label: "Items", num: true }, { key: "units", label: "Units in stock", num: true },
          { key: "alerts", label: "Low / out", num: true, render: (r) => (r.alerts ? ui.badge(String(r.alerts), "warn", "alert") : "0") }, { key: "value", label: "Value", money: true }], rows: rows, sort: { key: "category", dir: "asc" }, noun: "sub-category", search: true } }));
  };

  INV["stock-in-out"] = function (ctx) {
    const g = K.guard(ctx, "transactions", "stock in / out");
    if (g) return g;
    const m = ctx.model, r = ctx.range;
    const ins = m.txns.filter((t) => t.kind === "in"), outs = m.txns.filter((t) => t.kind === "out" || t.kind === "issue");
    const pIn = K.inPeriod(ins, r), pOut = K.inPeriod(outs, r);
    const qin = U.sum(pIn, (t) => t.qty), qout = U.sum(pOut, (t) => t.qty);
    const units = { valFn: (t) => t.qty, format: U.fmtNum, tickFormat: U.fmtCompact, valueHeader: "Units", countHeader: "Entries", countNoun: "entry", countMany: "entries" };
    return h("div", { class: "stack" },
      K.kpiRow([
        ui.kpi({ label: "Stock in", value: U.fmtCompact(qin), unit: "units", icon: "arrowDown", tone: "good", sub: U.plural(pIn.length, "receipt") + " · " + r.label.toLowerCase() }),
        ui.kpi({ label: "Stock out", value: U.fmtCompact(qout), unit: "units", icon: "arrowUp", tone: "warn", sub: U.plural(pOut.length, "issue") + " · " + r.label.toLowerCase() }),
        ui.kpi({ label: "Net movement", value: (qin - qout > 0 ? "+" : "") + U.fmtCompact(qin - qout), unit: "units", icon: "updown", tone: qin >= qout ? "good" : "crit", sub: qin >= qout ? "stock building up" : "stock drawing down" }),
        ui.kpi({ label: "Value received", value: U.fmtMoney(U.sum(pIn, (t) => t.amount), true), icon: "rupee", tone: "info", sub: r.label.toLowerCase() })
      ]),
      h("div", { class: "grid grid-2" },
        K.trendCard(ctx, Object.assign({ title: "Stock in", sub: "Units received · last 12 months", rows: ins }, units)),
        K.trendCard(ctx, Object.assign({ title: "Stock out", sub: "Units issued or consumed · last 12 months", rows: outs }, units))),
      ui.card({ title: "Movements", sub: r.label, flush: true, body: ui.table({ columns: K.ledgerCols(false), rows: pIn.concat(pOut), noun: "movement", placeholder: "Search item, reference, person…", sort: { key: "date", dir: "desc" } }) }));
  };

  INV["issue-return"] = function (ctx) {
    const m = ctx.model, r = ctx.range;
    if (!m.consumptionSource && !m.returnsTracked) return K.guard(ctx, "requests", "issues and returns") || K.guard(ctx, "transactions", "issues and returns") || ui.card({ body: ui.empty({ icon: "repeat", title: "No issues recorded yet", text: "Issued items come from completed requests (status Issued / Completed) or Issue entries in the stock ledger." }) });
    const issues = K.inPeriod(m.consumption, r);
    const retTx = K.inPeriod(m.txns.filter((t) => t.kind === "return"), r);
    const retReq = m.requests.filter((x) => x.returnedDate && U.inRange(x.returnedDate, r));
    const returned = retTx.length ? U.sum(retTx, (t) => t.qty) : U.sum(retReq, (x) => x.issuedQty || x.qty);
    const today = U.today();
    const dueBadge = (x) => { const d = U.daysBetween(today, x.dueDate); return d < 0 ? ui.badge(U.plural(-d, "day") + " overdue", "crit", "alert") : ui.badge(d === 0 ? "Due today" : "Due in " + U.plural(d, "day"), d <= 3 ? "warn" : "info", "clock"); };
    const pend = m.pendingReturns.slice().sort((a, b) => a.dueDate - b.dueDate);
    return h("div", { class: "stack" },
      K.kpiRow([
        ui.kpi({ label: "Items issued", value: U.fmtCompact(U.sum(issues, (c) => c.qty)), unit: "units", icon: "send", tone: "info", sub: U.plural(issues.length, "issue") + " · " + r.label.toLowerCase() }),
        ui.kpi({ label: "Items returned", value: U.fmtCompact(returned), unit: "units", icon: "undo", tone: "violet", sub: r.label.toLowerCase() }),
        ui.kpi({ label: "Pending returns", value: m.returnsTracked ? U.fmtNum(m.pendingReturns.length) : "—", icon: "clock", tone: "warn", sub: m.returnsTracked ? "not yet returned" : "no return dates recorded" }),
        ui.kpi({ label: "Overdue returns", value: m.returnsTracked ? U.fmtNum(m.overdueReturns.length) : "—", icon: "alert", tone: m.overdueReturns.length ? "crit" : m.returnsTracked ? "good" : "neutral", sub: m.returnsTracked ? "past the return date" : "" })
      ]),
      m.returnsTracked ? ui.card({ title: "Pending & overdue returns", sub: "Returnable items that have not come back yet", flush: true, body: ui.table({ columns: [
        { key: "item", label: "Item", strong: true, value: (x) => x.item },
        { key: "qty", label: "Qty", num: true, value: (x) => x.issuedQty || x.qty },
        { key: "employee", label: "Issued to", value: (x) => x.employee, render: (x) => ui.person(x.employee, x.department) },
        { key: "issued", label: "Issued on", date: true, value: (x) => x.completedDate || x.date, render: (x) => U.fmtDate(x.completedDate || x.date) },
        { key: "due", label: "Return by", date: true, value: (x) => x.dueDate, render: (x) => U.fmtDate(x.dueDate) },
        { key: "state", label: "Status", value: (x) => x.dueDate, render: dueBadge }
      ], rows: pend, noun: "item", sort: { key: "due", dir: "asc" }, empty: "Everything issued has been returned." }) })
        : ui.note(["Return tracking needs a return due date on requests or ledger entries (for example ", h("code", null, "Expected_Return_Date"), "). Add its link name to ", h("code", null, "config.fields.dueDate"), " if it has a different name."]),
      ui.card({ title: "Items issued", sub: r.label, flush: true, body: ui.table({ columns: [
        { key: "date", label: "Date", date: true, value: (c) => c.date, render: (c) => U.fmtDate(c.date) },
        { key: "ref", label: "Reference", value: (c) => c.ref },
        { key: "item", label: "Item", strong: true, value: (c) => c.item },
        { key: "qty", label: "Qty", num: true, value: (c) => c.qty },
        { key: "value", label: "Value", money: true, value: (c) => c.value },
        { key: "employee", label: "Issued to", value: (c) => c.employee, render: (c) => ui.person(c.employee, c.department) }
      ], rows: issues, noun: "issue", sort: { key: "date", dir: "desc" } }) }));
  };

  INV.adjustments = function (ctx) {
    const g = K.guard(ctx, "transactions", "stock adjustments");
    if (g) return g;
    const m = ctx.model, r = ctx.range;
    const adj = K.inPeriod(m.txns.filter((t) => t.kind === "adjustment"), r);
    const net = U.sum(adj, (t) => t.signed);
    const byReason = U.group(adj, (t) => t.typeLabel, (t) => Math.abs(t.signed)).map((x) => ({ label: x.key, value: x.value, sub: U.plural(x.count, "entry", "entries") }));
    const byItem = U.group(adj, (t) => t.item, (t) => Math.abs(t.signed));
    return h("div", { class: "stack" },
      K.kpiRow([
        ui.kpi({ label: "Adjustments", value: U.fmtNum(adj.length), icon: "sliders", sub: r.label.toLowerCase() }),
        ui.kpi({ label: "Net change", value: (net > 0 ? "+" : "") + U.fmtNum(net), unit: "units", icon: "updown", tone: net < 0 ? "crit" : "good" }),
        ui.kpi({ label: "Written-off value", value: U.fmtMoney(U.sum(adj.filter((t) => t.signed < 0), (t) => t.amount), true), icon: "rupee", tone: "warn", sub: "damaged, expired or lost" }),
        ui.kpi({ label: "Most adjusted item", value: byItem[0] ? byItem[0].key : "—", icon: "package", tone: "violet", sub: byItem[0] ? U.fmtNum(byItem[0].value) + " units" : "" })
      ]),
      h("div", { class: "grid grid-main" },
        ui.card({ title: "Adjustment entries", sub: r.label, flush: true, body: ui.table({ columns: K.ledgerCols(false), rows: adj, noun: "entry", placeholder: "Search…", sort: { key: "date", dir: "desc" }, pageSize: 8 }) }),
        ui.chartCard({ title: "By reason", sub: "Units adjusted", chart: () => CH.bars(byReason, { format: U.fmtNum, valueLabel: "units" }),
          table: { columns: [{ key: "label", label: "Reason", strong: true }, { key: "value", label: "Units", num: true }], rows: byReason, sort: { key: "value", dir: "desc" }, noun: "reason", search: false }, emptyText: "No adjustments in this period." })));
  };

  INV.ledger = function (ctx) {
    const g = K.guard(ctx, "transactions", "the stock ledger");
    if (g) return g;
    const m = ctx.model, r = ctx.range;
    const run = new Map();
    m.txns.forEach((t) => {
      const k = U.norm(t.item);
      const b = t.balance != null ? t.balance : (run.get(k) || 0) + t.signed;
      run.set(k, b);
      t.runBalance = b;
    });
    const rows = K.inPeriod(m.txns, r);
    return ui.card({ title: "Stock ledger", sub: r.label + " · " + U.plural(rows.length, "entry", "entries") + " · running balance per item", actions: [K.openBtn(ctx, "transactions")], flush: true,
      body: ui.table({ columns: K.ledgerCols(true), rows: rows, noun: "entry", placeholder: "Search item, reference, person…", sort: { key: "date", dir: "desc" }, pageSize: 15 }) });
  };

  INV.current = K.currentStock;
  INV.reorder = K.reorderList;

  INV.valuation = function (ctx) {
    const g = K.guard(ctx, "items", "stock valuation");
    if (g) return g;
    const m = ctx.model;
    const priced = m.items.filter((i) => i.value != null);
    if (!priced.length) return ui.card({ body: ui.empty({ icon: "rupee", title: "No unit prices on the item master", text: "Stock valuation needs a unit price field (for example Unit_Price) next to current stock." }) });
    const total = U.sum(priced, (i) => i.value);
    const bySub = U.group(priced, (i) => i.subCategory || i.category || "Uncategorised", (i) => i.value).map((x) => ({ label: x.key, value: x.value, sub: U.plural(x.count, "item") }));
    const top = priced.slice().sort((a, b) => b.value - a.value).map((i) => ({ label: i.name, value: i.value, sub: U.fmtNum(i.stock) + " × " + U.fmtMoney(i.unitPrice) }));
    return h("div", { class: "stack" },
      K.kpiRow([
        ui.kpi({ label: "Total stock value", value: U.fmtMoney(total, true), icon: "rupee", tone: "good", sub: "at unit price" }),
        ui.kpi({ label: "Items valued", value: U.fmtNum(priced.length), icon: "package", sub: "of " + U.fmtNum(m.items.length) + " items" }),
        ui.kpi({ label: "Average per item", value: U.fmtMoney(total / priced.length, true), icon: "chart", tone: "info" }),
        ui.kpi({ label: "Largest share", value: bySub[0] ? bySub[0].label : "—", icon: "award", tone: "violet", sub: bySub[0] ? U.fmtPct((bySub[0].value / total) * 100) + " of stock value" : "" })
      ]),
      h("div", { class: "grid grid-2" },
        ui.chartCard({ title: "Value by sub-category", chart: () => CH.bars(bySub, { format: (n) => U.fmtMoney(n), limit: 10 }), table: { columns: [{ key: "label", label: "Sub-category", strong: true }, { key: "value", label: "Value", money: true }], rows: bySub, sort: { key: "value", dir: "desc" }, search: false } }),
        ui.chartCard({ title: "Most valuable stock", chart: () => CH.bars(top, { format: (n) => U.fmtMoney(n), limit: 10 }), table: { columns: [{ key: "label", label: "Item", strong: true }, { key: "value", label: "Value", money: true }], rows: top, sort: { key: "value", dir: "desc" } } })),
      ui.card({ title: "Valuation by item", flush: true, body: ui.table({ columns: [
        { key: "name", label: "Item", strong: true, value: (i) => i.name, search: (i) => [i.code, i.brand, i.category, i.subCategory].join(" "), render: (i) => ui.cell(i.name, i.subCategory || i.category || i.brand) },
        { key: "stock", label: "In stock", num: true, value: (i) => i.stock },
        { key: "unitPrice", label: "Unit price", money: true, value: (i) => i.unitPrice },
        { key: "value", label: "Value", money: true, strong: true, value: (i) => i.value },
        { key: "share", label: "Share", num: true, value: (i) => i.value / total, render: (i) => U.fmtPct((i.value / total) * 100) }
      ], rows: priced, noun: "item", sort: { key: "value", dir: "desc" } }) }));
  };

  V.inventory = function (ctx) {
    const m = ctx.model;
    const sub = INV[ctx.sub("inventory")] ? ctx.sub("inventory") : "item-master";
    const alerts = m.items.filter((i) => i.stockStatus === "low" || i.stockStatus === "out").length;
    const tabs = INV_TABS.map((t) => Object.assign({}, t, t.id === "reorder" && alerts ? { count: alerts } : {}));
    return h("div", null,
      ui.sectionHead("Inventory management", ctx.dash.label + " items, stock movement and valuation"),
      ui.pills(tabs, sub, (id) => ctx.setSub("inventory", id)),
      INV[sub](ctx));
  };

  /* ================= 4. Request management ================= */
  const REQ_TABS = [
    { id: "create", label: "Create new request", icon: "filePlus" },
    { id: "pending", label: "Pending requests", icon: "clock" },
    { id: "approvals", label: "Approval management", icon: "shield" },
    { id: "decided", label: "Approved / rejected", icon: "checkCircle" },
    { id: "processing", label: "Processing & completed", icon: "truck" },
    { id: "tracking", label: "Request status tracking", icon: "route" }
  ];
  const REQ = {};

  REQ.create = function (ctx) {
    const d = ctx.dash, m = ctx.model, na = K.newActions(ctx);
    const big = (icon, title, desc, run, primary, external) => h("button", { class: "qa" + (primary ? " primary" : ""), type: "button", onclick: run, style: { padding: "20px" } },
      h("span", { class: "tone-tile tone-accent" }, C.icon(icon)), h("span", null, h("span", { class: "qa-title" }, title), h("span", { class: "qa-desc" }, desc)),
      external ? h("span", { class: "qa-ext" }, C.icon("external")) : null);
    const latest = m.requests.slice().sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, 60);
    return h("div", { class: "stack" },
      ui.card({ title: "Create a new request", sub: "Requests are submitted in Zoho Creator and appear here after a refresh", body: h("div", { class: "qa-grid" },
        na.showPR ? big("cart", "New purchase request", "Raise a purchase request in Zoho Creator", () => K.openNew(ctx, "purchaseRequest", "purchaseRequests"), true, true) : null,
        na.showReq ? big("filePlus", "New " + d.label.toLowerCase() + " request", "Submit an item request in Zoho Creator", () => K.openNew(ctx, "request", "requests"), !na.showPR, true) : null,
        big("refresh", "Refresh dashboard", "Load requests you have just submitted", ctx.refresh)) }),
      K.guard(ctx, "requests") || ui.card({ title: "Latest requests", sub: "Most recent first", flush: true, body: K.requestsTable(ctx, latest, { pageSize: 8 }) }));
  };

  REQ.pending = function (ctx) {
    const g = K.guard(ctx, "requests", "pending requests");
    if (g) return g;
    const rows = ctx.model.requests.filter((r) => r.group === "pending");
    const ages = rows.map(age).filter((x) => x != null);
    return h("div", { class: "stack" },
      K.kpiRow([
        ui.kpi({ label: "Pending requests", value: U.fmtNum(rows.length), icon: "clock", tone: "warn", sub: "all time" }),
        ui.kpi({ label: "Waiting over 3 days", value: U.fmtNum(ages.filter((a) => a > 3).length), icon: "alert", tone: "crit" }),
        ui.kpi({ label: "Units requested", value: U.fmtCompact(U.sum(rows, (r) => r.qty)), icon: "package", tone: "info" }),
        ui.kpi({ label: "Oldest request", value: ages.length ? U.plural(Math.max.apply(null, ages), "day") : "—", icon: "hourglass", tone: "neutral" })
      ]),
      ui.card({ title: "Pending requests", sub: "Oldest first", actions: [K.linkBtn("Approve", () => ctx.go("requests", "approvals"))], flush: true,
        body: K.requestsTable(ctx, rows, { waiting: true, priority: rows.some((r) => r.priority), sort: { key: "date", dir: "asc" }, empty: "No pending requests." }) }));
  };

  REQ.approvals = function (ctx) {
    const g = K.guard(ctx, "requests", "approvals");
    if (g) return g;
    const m = ctx.model, cfg = ctx.cfg, src = m.sources.requests;
    const field = src.fieldMap.status;
    const rows = m.requests.filter((r) => r.group === "pending");
    const limited = K.limited(ctx); // per-user fallback report: this viewer isn't an approver
    const can = cfg.enableApprovalActions && !!field && !limited;
    async function act(r, approve) {
      const value = approve ? cfg.approvalValues.approve : cfg.approvalValues.reject;
      const ok = await ui.confirm({ title: (approve ? "Approve " : "Reject ") + r.no + "?", message: (r.item || "Request") + " · " + U.fmtNum(r.qty) + " for " + (r.employee || "—") + ". " + field + " will be set to “" + value + "”.", confirmLabel: approve ? "Approve" : "Reject", tone: approve ? null : "crit" });
      if (!ok) return;
      try {
        const data = {};
        data[field] = value;
        await C.api.update(src.report, r.id, data);
        ui.toast(r.no + " marked " + value, "good");
        ctx.refresh();
      } catch (e) { ui.toast("Could not update " + r.no + ": " + C.api.errorMessage(e), "crit"); }
    }
    const actions = can ? { key: "act", label: "Decision", sort: false, className: "actions", render: (r) => [
      h("button", { class: "btn sm good", type: "button", onclick: () => act(r, true) }, C.icon("check"), "Approve"),
      h("button", { class: "btn sm danger", type: "button", onclick: () => act(r, false) }, C.icon("x"), "Reject")] } : null;
    return h("div", { class: "stack" },
      limited ? K.limitedNote(ctx)
      : !cfg.enableApprovalActions ? ui.note(["Approve / Reject buttons are switched off (", h("code", null, "enableApprovalActions"), " in js/config.js)."])
        : !field ? ui.note(["No status field was detected in " + src.report + ", so decisions can't be saved. Add its link name to ", h("code", null, "config.fields.status"), "."], "warn")
          : ui.note(["Approving sets ", h("b", null, field), " to “" + cfg.approvalValues.approve + "”, rejecting sets it to “" + cfg.approvalValues.reject + "”, directly on " + src.report + "."]),
      ui.card({ title: "Awaiting approval", sub: U.plural(rows.length, "request") + " · oldest first", flush: true,
        body: K.requestsTable(ctx, rows, { waiting: true, priority: rows.some((r) => r.priority), actions: actions, sort: { key: "date", dir: "asc" }, empty: "No requests are waiting for approval." }) }));
  };

  REQ.decided = function (ctx) {
    const g = K.guard(ctx, "requests", "approved and rejected requests");
    if (g) return g;
    const rows = K.inPeriod(ctx.model.requests, ctx.range);
    const approved = rows.filter((x) => x.group === "approved"), rejected = rows.filter((x) => x.group === "rejected");
    const accepted = rows.filter((x) => x.group === "approved" || x.group === "processing" || x.group === "completed").length;
    const rate = accepted + rejected.length ? (accepted / (accepted + rejected.length)) * 100 : null;
    const holder = h("div");
    const paint = (f) => { C.clear(holder).appendChild(K.requestsTable(ctx, f === "approved" ? approved : f === "rejected" ? rejected : approved.concat(rejected), { empty: "No requests in this state for the period." })); };
    paint("all");
    return h("div", { class: "stack" },
      K.kpiRow([
        ui.kpi({ label: "Approved", value: U.fmtNum(approved.length), icon: "check", tone: "info", sub: "approved, not yet processed" }),
        ui.kpi({ label: "Rejected", value: U.fmtNum(rejected.length), icon: "xCircle", tone: "crit", sub: ctx.range.label.toLowerCase() }),
        ui.kpi({ label: "Approval rate", value: U.fmtPct(rate), icon: "gauge", tone: "good", sub: "of decided requests" }),
        ui.kpi({ label: "Decided", value: U.fmtNum(accepted + rejected.length), icon: "shield", sub: ctx.range.label.toLowerCase() })
      ]),
      ui.card({ title: "Approved & rejected requests", sub: ctx.range.label, actions: [ui.seg([{ id: "all", label: "All" }, { id: "approved", label: "Approved" }, { id: "rejected", label: "Rejected" }], "all", paint)], flush: true, body: holder }));
  };

  REQ.processing = function (ctx) {
    const g = K.guard(ctx, "requests", "processing and completed requests");
    if (g) return g;
    const m = ctx.model;
    const inFlight = m.requests.filter((x) => x.group === "processing" || x.group === "approved");
    const done = K.inPeriod(m.requests.filter((x) => x.group === "completed"), ctx.range, (x) => x.completedDate || x.date);
    const tats = done.map(K.tat).filter((x) => x != null && x >= 0);
    return h("div", { class: "stack" },
      K.kpiRow([
        ui.kpi({ label: "In processing", value: U.fmtNum(inFlight.length), icon: "truck", tone: "violet", sub: "approved or being processed" }),
        ui.kpi({ label: "Completed", value: U.fmtNum(done.length), icon: "checkCircle", tone: "good", sub: ctx.range.label.toLowerCase() }),
        ui.kpi({ label: "Average turnaround", value: K.fmtDur(K.avg(tats)), icon: "gauge", tone: "info", sub: "request to completion" }),
        ui.kpi({ label: "Units issued", value: U.fmtCompact(U.sum(done, (x) => x.issuedQty != null ? x.issuedQty : x.qty)), icon: "send" })
      ]),
      ui.card({ title: "Processing", sub: "Approved and in-progress requests", flush: true, body: K.requestsTable(ctx, inFlight, { waiting: true, sort: { key: "date", dir: "asc" }, pageSize: 8, empty: "Nothing is being processed right now." }) }),
      ui.card({ title: "Completed", sub: ctx.range.label, flush: true, body: K.requestsTable(ctx, done, { turnaround: true, pageSize: 8 }) }));
  };

  REQ.tracking = function (ctx) {
    const g = K.guard(ctx, "requests", "request tracking");
    if (g) return g;
    const rows = K.inPeriod(ctx.model.requests, ctx.range);
    const stages = ["pending", "approved", "processing", "completed", "rejected"];
    let active = null;
    const holder = h("div");
    const title = h("span");
    const paint = () => {
      title.textContent = active ? M.GROUP_LABEL[active] + " requests" : "All requests";
      C.clear(holder).appendChild(K.requestsTable(ctx, active ? rows.filter((x) => x.group === active) : rows, { pageSize: 12 }));
    };
    const tones = { pending: "warn", approved: "", processing: "", completed: "good", rejected: "crit" };
    const els = stages.map((s) => {
      const n = rows.filter((x) => x.group === s).length;
      const b = h("button", { class: "stage", type: "button", "aria-pressed": "false" },
        h("div", { class: "top" }, ui.statusBadge(s), h("span", { class: "muted", style: { fontSize: "12px" } }, U.fmtPct(rows.length ? (n / rows.length) * 100 : 0))),
        h("div", { class: "cnt" }, U.fmtNum(n)), ui.meter(n, rows.length, tones[s]));
      b.addEventListener("click", () => { active = active === s ? null : s; els.forEach((x, i) => x.setAttribute("aria-pressed", String(stages[i] === active))); paint(); });
      return b;
    });
    paint();
    return h("div", { class: "stack" },
      h("div", { class: "pipeline" }, els),
      ui.card({ title: title, sub: ctx.range.label + " · click a stage to filter · search by request number", flush: true, body: holder }));
  };

  V.requests = function (ctx) {
    const pend = ctx.model.requests.filter((r) => r.group === "pending").length;
    const sub = REQ[ctx.sub("requests")] ? ctx.sub("requests") : "pending";
    const tabs = REQ_TABS.map((t) => Object.assign({}, t, (t.id === "pending" || t.id === "approvals") && pend ? { count: pend } : {}));
    return h("div", null,
      ui.sectionHead("Request management", "From " + (K.report(ctx, "requests") || "the request report") + " — raise, approve and track requests"),
      ui.pills(tabs, sub, (id) => ctx.setSub("requests", id)),
      REQ[sub](ctx));
  };
})(window.CIMS = window.CIMS || {});
