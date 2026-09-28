/* Module sections: 5. Housekeeping  6. Pantry  7. Stationery management. */
(function (C) {
  "use strict";
  const h = C.h, U = C.util, ui = C.ui, CH = C.charts, M = C.model, K = C.vk;
  const V = (C.views = C.views || {});

  function moduleView(ctx, sec, title, text, tabs, handlers, def) {
    const sub = handlers[ctx.sub(sec)] ? ctx.sub(sec) : def;
    return h("div", null, ui.sectionHead(title, text), ui.pills(tabs, sub, (id) => ctx.setSub(sec, id)), handlers[sub](ctx));
  }
  const need = (ctx, what) => K.guard(ctx, "requests", what);
  const noCons = (ctx) => need(ctx, "consumption") || ui.card({ body: ui.empty({ icon: "trend", title: "No consumption recorded yet", text: "Consumption is calculated from completed requests (status Issued / Completed) or Issue entries in the stock ledger." }) });
  const ageDays = (x) => (x.date ? U.daysBetween(x.date, new Date()) : 0);
  const byUrgency = (a, b) => a.priorityRank - b.priorityRank || (a.date || 0) - (b.date || 0);
  const noField = (label, key, example) => ui.note(["No " + label + " field was detected. Add its link name (for example ", h("code", null, example), ") to ", h("code", null, "config.fields." + key), "."], "warn");

  /* ================= 5. Housekeeping management ================= */
  const HK_TABS = [
    { id: "requests", label: "Housekeeping requests", icon: "clipboard" },
    { id: "assignment", label: "Task assignment", icon: "users" },
    { id: "priority", label: "Priority management", icon: "flag" },
    { id: "location", label: "Location-wise requests", icon: "pin" },
    { id: "board", label: "Pending / in-progress / completed", icon: "kanban" },
    { id: "performance", label: "Performance reports", icon: "award" }
  ];
  const HK = {};

  HK.requests = function (ctx) {
    const g = need(ctx, "housekeeping requests");
    if (g) return g;
    const m = ctx.model, rows = K.inPeriod(m.requests, ctx.range);
    const open = m.requests.filter(M.isOpen);
    const done = rows.filter((r) => r.group === "completed");
    return h("div", { class: "stack" },
      K.kpiRow([
        ui.kpi({ label: "Requests", value: U.fmtNum(rows.length), icon: "clipboard", sub: ctx.range.label.toLowerCase() }),
        ui.kpi({ label: "Open now", value: U.fmtNum(open.length), icon: "clock", tone: "warn", sub: U.fmtNum(open.filter((r) => !r.assignedTo).length) + " unassigned", onClick: () => ctx.setSub("housekeeping", "board") }),
        ui.kpi({ label: "Completed", value: U.fmtNum(done.length), icon: "checkCircle", tone: "good", sub: rows.length ? U.fmtPct((done.length / rows.length) * 100) + " of requests" : "" }),
        ui.kpi({ label: "Avg completion time", value: K.fmtDur(K.avg(done.map(K.tat).filter((x) => x != null && x >= 0))), icon: "gauge", tone: "info", sub: "request to completion" })
      ]),
      h("div", { class: "grid grid-main" },
        K.trendCard(ctx, { title: "Requests per month", sub: "Last 12 months", rows: m.requests, valFn: () => 1, format: U.fmtNum, tickFormat: U.fmtCompact, valueHeader: "Requests", countless: true, countNoun: "request" }),
        K.statusCard(ctx, rows, "Status mix", ctx.range.label)),
      ui.card({ title: "Housekeeping requests", sub: ctx.range.label, actions: [K.openBtn(ctx, "requests")], flush: true, body: K.requestsTable(ctx, rows, { location: true, assignee: true, priority: true }) }));
  };

  HK.assignment = function (ctx) {
    const g = need(ctx, "task assignment");
    if (g) return g;
    const m = ctx.model, r = ctx.range;
    const open = m.requests.filter(M.isOpen);
    const unassigned = open.filter((x) => !x.assignedTo);
    const staff = U.group(m.requests.filter((x) => x.assignedTo), (x) => x.assignedTo).map((s) => ({
      name: s.key, open: s.rows.filter(M.isOpen).length, total: s.count,
      done: s.rows.filter((x) => x.group === "completed" && U.inRange(x.completedDate || x.date, r)).length
    }));
    const bars = staff.map((s) => ({ label: s.name, value: s.open, sub: U.fmtNum(s.done) + " completed · " + r.label.toLowerCase() })).sort((a, b) => b.value - a.value);
    return h("div", { class: "stack" },
      m.sources.requests.fieldMap.assignedTo ? null : noField("assignee", "assignedTo", "Assigned_To"),
      K.kpiRow([
        ui.kpi({ label: "Open tasks", value: U.fmtNum(open.length), icon: "clipboard" }),
        ui.kpi({ label: "Unassigned", value: U.fmtNum(unassigned.length), icon: "user", tone: unassigned.length ? "warn" : "good", sub: "need an owner" }),
        ui.kpi({ label: "Staff with tasks", value: U.fmtNum(staff.filter((s) => s.open).length), icon: "users", tone: "info", sub: "of " + U.fmtNum(staff.length) + " staff" }),
        ui.kpi({ label: "Busiest", value: bars[0] && bars[0].value ? bars[0].label : "—", icon: "award", tone: "violet", sub: bars[0] && bars[0].value ? U.plural(bars[0].value, "open task") : "" })
      ]),
      h("div", { class: "grid grid-main" },
        ui.card({ title: "Unassigned tasks", sub: "Assign an owner in Creator", actions: [K.openBtn(ctx, "requests")], flush: true,
          body: K.requestsTable(ctx, unassigned.sort(byUrgency), { location: true, priority: true, waiting: true, sort: { key: "priority", dir: "asc" }, pageSize: 8, empty: "Every open task has an owner." }) }),
        ui.chartCard({ title: "Workload by staff", sub: "Open tasks per person", chart: () => CH.bars(bars, { format: U.fmtNum, valueLabel: "open tasks" }), emptyText: "Nobody has open tasks.",
          table: { columns: [{ key: "name", label: "Staff", render: (s) => ui.person(s.name) }, { key: "open", label: "Open", num: true }, { key: "done", label: "Completed", num: true }, { key: "total", label: "All time", num: true }], rows: staff, sort: { key: "open", dir: "desc" }, noun: "staff member", search: false } })));
  };

  HK.priority = function (ctx) {
    const g = need(ctx, "priorities");
    if (g) return g;
    const m = ctx.model;
    const open = m.requests.filter(M.isOpen).sort(byUrgency);
    const groups = U.group(open, (x) => x.priority || "No priority").sort((a, b) => a.rows[0].priorityRank - b.rows[0].priorityRank);
    const toneOf = (p) => { const n = U.norm(p); return /urgent|critical/.test(n) ? "crit" : /high/.test(n) ? "warn" : /low/.test(n) ? "neutral" : "info"; };
    return h("div", { class: "stack" },
      m.sources.requests.fieldMap.priority ? null : noField("priority", "priority", "Priority"),
      groups.length ? K.kpiRow(groups.slice(0, 5).map((gp) => ui.kpi({ label: gp.key, value: U.fmtNum(gp.count), icon: "flag", tone: toneOf(gp.key), sub: "open · oldest " + U.plural(Math.max.apply(null, gp.rows.map(ageDays)), "day") }))) : null,
      ui.card({ title: "Open tasks by priority", sub: "Most urgent and oldest first", flush: true,
        body: ui.table({ columns: K.requestColumns({ priority: true, location: true, assignee: true, waiting: true }), rows: open, noun: "task", placeholder: "Search tasks…", sort: { key: "priority", dir: "asc" }, empty: "No open tasks." }) }));
  };

  HK.location = function (ctx) {
    const g = need(ctx, "location-wise requests");
    if (g) return g;
    const m = ctx.model;
    if (!m.sources.requests.fieldMap.location) return ui.card({ body: ui.empty({ icon: "pin", title: "No location field detected", text: ["Add the link name of your location / floor / area field to ", h("code", null, "config.fields.location"), "."] }) });
    const rows = K.inPeriod(m.requests, ctx.range);
    const data = U.group(rows, (x) => x.location || "Unspecified").map((gp) => ({
      label: gp.key, value: gp.count, open: gp.rows.filter(M.isOpen).length, done: gp.rows.filter((x) => x.group === "completed").length,
      top: (U.group(gp.rows, (x) => x.item)[0] || {}).key || "—", sub: U.fmtNum(gp.rows.filter(M.isOpen).length) + " open"
    }));
    return h("div", { class: "stack" },
      ui.chartCard({ title: "Requests by location", sub: ctx.range.label, chart: () => CH.bars(data, { format: U.fmtNum, valueLabel: "requests", limit: 14 }),
        table: { columns: [{ key: "label", label: "Location", strong: true }, { key: "value", label: "Requests", num: true }, { key: "open", label: "Open", num: true }, { key: "done", label: "Completed", num: true }, { key: "top", label: "Most requested item" }], rows: data, sort: { key: "value", dir: "desc" }, noun: "location" } }),
      ui.card({ title: "Open tasks by location", flush: true, body: K.requestsTable(ctx, m.requests.filter(M.isOpen), { location: true, assignee: true, priority: true, sort: { key: "location", dir: "asc" } }) }));
  };

  HK.board = function (ctx) {
    const g = need(ctx, "the task board");
    if (g) return g;
    const m = ctx.model;
    const doneAt = (x) => x.completedDate || x.date;
    const lanes = [
      { title: "Pending", icon: "clock", tone: "warn", rows: m.requests.filter((x) => x.group === "pending" || x.group === "approved").sort(byUrgency) },
      { title: "In progress", icon: "loader", tone: "violet", rows: m.requests.filter((x) => x.group === "processing").sort(byUrgency) },
      { title: "Completed", icon: "checkCircle", tone: "good", rows: K.inPeriod(m.requests.filter((x) => x.group === "completed"), ctx.range, doneAt).sort((a, b) => (doneAt(b) || 0) - (doneAt(a) || 0)) }
    ];
    const task = (x) => h("div", { class: "task" },
      h("div", { class: "task-title" }, x.remarks || x.item || x.no),
      h("div", { class: "task-meta" },
        h("span", null, C.icon("tag"), x.no),
        x.item && x.remarks ? h("span", null, C.icon("package"), x.item + (x.qty != null ? " × " + U.fmtNum(x.qty) : "")) : null,
        x.location ? h("span", null, C.icon("pin"), x.location) : null,
        h("span", null, C.icon("calendar"), U.fmtShort(x.date))),
      h("div", { class: "task-foot" }, x.assignedTo ? ui.person(x.assignedTo) : ui.badge("Unassigned", "warn", "user"), x.priority ? ui.priorityBadge(x.priority) : ui.statusBadge(x.group, x.status)));
    return h("div", { class: "stack" },
      ui.note("Pending includes approved tasks that have not started. Completed shows " + ctx.range.label.toLowerCase() + "."),
      h("div", { class: "board" }, lanes.map((l) => h("div", { class: "lane" },
        h("div", { class: "lane-head" },
          h("span", { style: { display: "inline-flex", alignItems: "center", gap: "8px" } }, h("span", { class: "tone-tile tone-" + l.tone, style: { width: "26px", height: "26px", borderRadius: "8px" } }, C.icon(l.icon)), l.title),
          ui.badge(U.fmtNum(l.rows.length), "")),
        h("div", { class: "lane-list" },
          l.rows.length ? l.rows.slice(0, 40).map(task) : h("div", { class: "tbl-empty" }, "Nothing here"),
          l.rows.length > 40 ? h("div", { class: "mini-sub", style: { textAlign: "center", padding: "6px" } }, "+ " + U.fmtNum(l.rows.length - 40) + " more") : null)))));
  };

  HK.performance = function (ctx) {
    const g = need(ctx, "performance reports");
    if (g) return g;
    const m = ctx.model, r = ctx.range;
    const rows = K.inPeriod(m.requests, r).filter((x) => x.assignedTo);
    const staff = U.group(rows, (x) => x.assignedTo).map((s) => {
      const done = s.rows.filter((x) => x.group === "completed");
      return { name: s.key, assigned: s.count, done: done.length, rate: s.count ? (done.length / s.count) * 100 : 0,
        tat: K.avg(done.map(K.tat).filter((x) => x != null && x >= 0)), open: m.requests.filter((x) => x.assignedTo === s.key && M.isOpen(x)).length };
    });
    const doneTotal = U.sum(staff, (s) => s.done);
    const best = staff.slice().sort((a, b) => b.done - a.done)[0];
    return h("div", { class: "stack" },
      m.sources.requests.fieldMap.assignedTo ? null : noField("assignee", "assignedTo", "Assigned_To"),
      K.kpiRow([
        ui.kpi({ label: "Tasks assigned", value: U.fmtNum(rows.length), icon: "clipboard", sub: r.label.toLowerCase() }),
        ui.kpi({ label: "Completion rate", value: U.fmtPct(rows.length ? (doneTotal / rows.length) * 100 : null), icon: "gauge", tone: "good", sub: U.fmtNum(doneTotal) + " completed" }),
        ui.kpi({ label: "Avg completion time", value: K.fmtDur(K.avg(rows.filter((x) => x.group === "completed").map(K.tat).filter((x) => x != null && x >= 0))), icon: "clock", tone: "info" }),
        ui.kpi({ label: "Top performer", value: best ? best.name : "—", icon: "award", tone: "violet", sub: best ? U.plural(best.done, "task") + " completed" : "" })
      ]),
      h("div", { class: "grid grid-main" },
        ui.card({ title: "Staff performance", sub: r.label, flush: true, body: ui.table({ columns: [
          { key: "name", label: "Staff", value: (s) => s.name, render: (s) => ui.person(s.name) },
          { key: "assigned", label: "Assigned", num: true },
          { key: "done", label: "Completed", num: true },
          { key: "rate", label: "Completion", value: (s) => s.rate, className: "meter-cell", render: (s) => h("div", { class: "meter-row" }, ui.meter(s.rate, 100, s.rate >= 80 ? "good" : s.rate >= 50 ? "warn" : "crit"), h("span", { class: "mini-sub" }, U.fmtPct(s.rate))) },
          { key: "tat", label: "Avg time", num: true, value: (s) => s.tat, render: (s) => K.fmtDur(s.tat) },
          { key: "open", label: "Open now", num: true }
        ], rows: staff, noun: "staff member", sort: { key: "done", dir: "desc" }, search: false, empty: "No assigned tasks in this period." }) }),
        K.trendCard(ctx, { title: "Tasks completed per month", sub: "Last 12 months", rows: m.requests.filter((x) => x.group === "completed"), dateFn: (x) => x.completedDate || x.date, valFn: () => 1, format: U.fmtNum, tickFormat: U.fmtCompact, valueHeader: "Completed", countless: true })));
  };

  V.housekeeping = (ctx) => moduleView(ctx, "housekeeping", "Housekeeping management", "Tasks from " + (K.report(ctx, "requests") ||"the housekeeping report") + " — assignment, priorities, locations and staff performance", HK_TABS, HK, "requests");

  /* ================= 6. Pantry management ================= */
  const PN_TABS = [
    { id: "stock", label: "Pantry stock", icon: "warehouse" },
    { id: "consumption", label: "Daily / monthly consumption", icon: "trend" },
    { id: "items", label: "Item-wise consumption", icon: "package" },
    { id: "departments", label: "Department-wise consumption", icon: "building" },
    { id: "alerts", label: "Low stock alerts", icon: "bell" },
    { id: "expiry", label: "Expiry tracking", icon: "hourglass" },
    { id: "expense", label: "Expense tracking", icon: "wallet" }
  ];
  const PN = {};
  PN.stock = K.currentStock;
  PN.alerts = K.reorderList;
  PN.items = (ctx) => (ctx.model.consumptionSource ? K.groupCard(ctx, { title: "Item-wise consumption", label: "Item", key: (c) => c.item, limit: 15, noun: "item" }) : noCons(ctx));
  PN.departments = (ctx) => (ctx.model.consumptionSource ? K.groupCard(ctx, { title: "Department-wise consumption", label: "Department", key: (c) => c.department || "Unspecified", noun: "department" }) : noCons(ctx));

  PN.consumption = function (ctx) {
    const m = ctx.model;
    if (!m.consumptionSource) return noCons(ctx);
    const vf = K.valFn(m), t = U.today();
    const fmt = m.hasValues ? (n) => U.fmtMoney(n, true) : (n) => U.fmtNum(n, 0);
    const since = (d) => U.sum(m.consumption.filter((c) => c.date && c.date >= d), vf);
    return h("div", { class: "stack" },
      K.kpiRow([
        ui.kpi({ label: "Today", value: fmt(since(t)), icon: "calendar", sub: "consumed so far" }),
        ui.kpi({ label: "Last 7 days", value: fmt(since(U.addDays(t, -6))), icon: "trend", tone: "info" }),
        ui.kpi({ label: "This month", value: fmt(since(new Date(t.getFullYear(), t.getMonth(), 1))), icon: "chart", tone: "violet", sub: "month to date" }),
        ui.kpi({ label: "Daily average", value: fmt(since(U.addDays(t, -29)) / 30), icon: "gauge", tone: "good", sub: "last 30 days" })
      ]),
      K.trendCard(ctx, { title: "Daily consumption", sub: "Last 30 days · " + K.valLabel(m), rows: m.consumption, days: 30 }),
      K.trendCard(ctx, { title: "Monthly consumption", sub: "Last 12 months · " + K.valLabel(m), rows: m.consumption, months: 12 }));
  };

  PN.expiry = function (ctx) {
    const g = K.guard(ctx, "items", "expiry tracking");
    if (g) return g;
    const m = ctx.model, near = ctx.cfg.nearExpiryDays || 30, t = U.today();
    const rows = m.items.filter((i) => i.expiry).map((i) => Object.assign({}, i, { days: U.daysBetween(t, i.expiry) }));
    if (!rows.length) return ui.card({ body: ui.empty({ icon: "hourglass", title: "No expiry dates on the item master", text: ["Add an expiry date field (for example ", h("code", null, "Expiry_Date"), ") to the item master, or put its link name in ", h("code", null, "config.fields.expiryDate"), "."] }) });
    const expired = rows.filter((i) => i.days < 0), soon = rows.filter((i) => i.days >= 0 && i.days <= near);
    const badge = (i) => (i.days < 0 ? ui.badge("Expired " + U.plural(-i.days, "day") + " ago", "crit", "ban")
      : i.days === 0 ? ui.badge("Expires today", "crit", "alert")
        : ui.badge(U.plural(i.days, "day") + " left", i.days <= 7 ? "warn" : i.days <= near ? "info" : "good", i.days <= near ? "hourglass" : "check"));
    return h("div", { class: "stack" },
      K.kpiRow([
        ui.kpi({ label: "Expired", value: U.fmtNum(expired.length), icon: "ban", tone: "crit", sub: "remove from stock" }),
        ui.kpi({ label: "Expiring in 7 days", value: U.fmtNum(soon.filter((i) => i.days <= 7).length), icon: "alert", tone: "warn" }),
        ui.kpi({ label: "Expiring in " + near + " days", value: U.fmtNum(soon.length), icon: "hourglass", tone: "info" }),
        ui.kpi({ label: "Value at risk", value: U.fmtMoney(U.sum(expired.concat(soon), (i) => i.value) || null, true), icon: "rupee", tone: "violet", sub: "expired + near-expiry stock" })
      ]),
      ui.card({ title: "Expiry tracking", sub: "Items with an expiry date, soonest first", flush: true, body: ui.table({ columns: [
        { key: "name", label: "Item", strong: true, value: (i) => i.name, render: (i) => ui.cell(i.name, i.subCategory || i.category) },
        { key: "stock", label: "In stock", num: true, value: (i) => i.stock },
        { key: "expiry", label: "Expiry date", date: true, value: (i) => i.expiry, render: (i) => U.fmtDate(i.expiry) },
        { key: "days", label: "Status", value: (i) => i.days, render: badge },
        { key: "value", label: "Stock value", money: true, value: (i) => i.value }
      ], rows: rows, noun: "item", sort: { key: "days", dir: "asc" } }) }));
  };

  PN.expense = function (ctx) {
    const m = ctx.model, r = ctx.range;
    const buys = m.purchases.filter((p) => p.group !== "rejected" && p.amount != null);
    const lines = K.inPeriod(m.consumption, r);
    const consVal = U.sum(lines, (c) => c.value);
    const avgMonthly = U.sum(M.byMonth(m.consumption, 12, (c) => c.value || 0), (p) => p.value) / 12;
    const money = { format: (n) => U.fmtMoney(n), tickFormat: (n) => U.fmtMoney(n, true) };
    const catOf = (c) => { const it = m.itemIndex.get(U.norm(c.item)); return (it && (it.subCategory || it.category)) || "Other"; };
    return h("div", { class: "stack" },
      m.hasValues ? null : ui.note(["Expenses need prices — add a unit price (", h("code", null, "Unit_Price"), ") or amount field to requests or the item master."], "warn"),
      K.kpiRow([
        ui.kpi({ label: "Consumption value", value: U.fmtMoney(consVal, true), icon: "wallet", tone: "good", sub: r.label.toLowerCase() }),
        ui.kpi({ label: "Purchases raised", value: buys.length ? U.fmtMoney(U.sum(K.inPeriod(buys, r), (p) => p.amount), true) : "—", icon: "cart", tone: "violet", sub: buys.length ? "purchase requests, excl. rejected" : "no amounts on purchase requests" }),
        ui.kpi({ label: "Average per month", value: U.fmtMoney(avgMonthly, true), icon: "chart", tone: "info", sub: "last 12 months" }),
        ui.kpi({ label: "Average per issue", value: U.fmtMoney(lines.length ? consVal / lines.length : null), icon: "rupee", sub: r.label.toLowerCase() })
      ]),
      h("div", { class: "grid grid-2" },
        K.trendCard(ctx, Object.assign({ title: "Pantry expense by month", sub: "Value consumed · last 12 months", rows: m.consumption, valFn: (c) => c.value || 0, valueHeader: "Value" }, money)),
        K.trendCard(ctx, Object.assign({ title: "Purchase requests by month", sub: "Amount raised · last 12 months", rows: buys, valFn: (p) => p.amount || 0, valueHeader: "Amount", countHeader: "Requests", countNoun: "request" }, money))),
      K.groupCard(ctx, { title: "Expense by category", label: "Category", key: catOf, noun: "category" }));
  };

  V.pantry = (ctx) => moduleView(ctx, "pantry", "Pantry management", "Stock, consumption, expiry and expenses — requests from " + (K.report(ctx, "requests") ||"the pantry report"), PN_TABS, PN, "consumption");

  /* ================= 7. Stationery management ================= */
  const ST_TABS = [
    { id: "stock", label: "Stationery stock", icon: "warehouse" },
    { id: "employees", label: "Employee-wise issue", icon: "users" },
    { id: "departments", label: "Department-wise consumption", icon: "building" },
    { id: "items", label: "Item-wise consumption", icon: "package" },
    { id: "pending", label: "Pending requests", icon: "clock" },
    { id: "cost", label: "Monthly consumption & cost", icon: "chart" }
  ];
  const ST = { stock: K.currentStock, items: PN.items, departments: PN.departments };

  ST.employees = function (ctx) {
    const m = ctx.model;
    if (!m.consumptionSource) return noCons(ctx);
    const lines = K.inPeriod(m.consumption, ctx.range), vf = K.valFn(m), fmt = K.fmtVal(m);
    const people = U.group(lines, (c) => c.employee || "Unspecified", vf).map((gp) => ({
      name: gp.key, dept: (U.group(gp.rows, (c) => c.department)[0] || {}).key || "", issues: gp.count, metric: gp.value,
      units: U.sum(gp.rows, (c) => c.qty), value: U.sum(gp.rows, (c) => c.value),
      last: gp.rows.reduce((d, c) => (c.date && (!d || c.date > d) ? c.date : d), null)
    }));
    const bars = people.map((p) => ({ label: p.name, value: p.metric, sub: p.dept }));
    return h("div", { class: "stack" },
      K.kpiRow([
        ui.kpi({ label: "Employees served", value: U.fmtNum(people.length), icon: "users", sub: ctx.range.label.toLowerCase() }),
        ui.kpi({ label: "Units issued", value: U.fmtCompact(U.sum(lines, (c) => c.qty)), icon: "send", tone: "info" }),
        ui.kpi({ label: "Value issued", value: m.hasValues ? U.fmtMoney(U.sum(lines, (c) => c.value), true) : "—", icon: "wallet", tone: "good" }),
        ui.kpi({ label: "Average per employee", value: people.length ? (m.hasValues ? U.fmtMoney(U.sum(people, (p) => p.metric) / people.length, true) : U.fmtNum(U.sum(people, (p) => p.metric) / people.length, 0)) : "—", icon: "user", tone: "violet", sub: K.valLabel(m) })
      ]),
      h("div", { class: "grid grid-main" },
        ui.card({ title: "Employee-wise issue", sub: ctx.range.label, flush: true, body: ui.table({ columns: [
          { key: "name", label: "Employee", value: (p) => p.name, render: (p) => ui.person(p.name, p.dept) },
          { key: "dept", label: "Department", value: (p) => p.dept },
          { key: "issues", label: "Issues", num: true },
          { key: "units", label: "Units", num: true },
          { key: "value", label: "Value", money: true, value: (p) => (m.hasValues ? p.value : null) },
          { key: "last", label: "Last issue", date: true, value: (p) => p.last, render: (p) => U.fmtDate(p.last) }
        ], rows: people, noun: "employee", placeholder: "Search employees or departments…", sort: { key: m.hasValues ? "value" : "units", dir: "desc" } }) }),
        ui.chartCard({ title: "Top employees", sub: "By " + K.valLabel(m), chart: () => CH.bars(bars, { format: fmt, limit: 10, valueLabel: K.valLabel(m) }),
          table: { columns: [{ key: "label", label: "Employee", strong: true }, { key: "value", label: m.hasValues ? "Value" : "Units", num: true, render: (b) => fmt(b.value) }], rows: bars, sort: { key: "value", dir: "desc" }, search: false } })));
  };

  ST.pending = function (ctx) {
    const g = need(ctx, "pending requests");
    if (g) return g;
    const rows = ctx.model.requests.filter(M.isOpen);
    const n = (grp) => rows.filter((x) => x.group === grp).length;
    return h("div", { class: "stack" },
      K.kpiRow([
        ui.kpi({ label: "Open requests", value: U.fmtNum(rows.length), icon: "inbox" }),
        ui.kpi({ label: "Awaiting approval", value: U.fmtNum(n("pending")), icon: "clock", tone: "warn", onClick: () => ctx.go("requests", "approvals") }),
        ui.kpi({ label: "Approved, not issued", value: U.fmtNum(n("approved")), icon: "check", tone: "info" }),
        ui.kpi({ label: "Processing", value: U.fmtNum(n("processing")), icon: "truck", tone: "violet" })
      ]),
      ui.card({ title: "Pending stationery requests", sub: "Not yet issued or rejected · oldest first", actions: [K.openBtn(ctx, "requests")], flush: true,
        body: K.requestsTable(ctx, rows, { waiting: true, sort: { key: "date", dir: "asc" }, empty: "No pending requests." }) }));
  };

  ST.cost = function (ctx) {
    const m = ctx.model;
    if (!m.consumptionSource) return noCons(ctx);
    const r = ctx.range, lines = K.inPeriod(m.consumption, r);
    const cost = M.byMonth(m.consumption, 12, (c) => c.value || 0);
    const units = M.byMonth(m.consumption, 12, (c) => c.qty || 0);
    const t = U.today();
    const mtd = U.sum(m.consumption.filter((c) => c.date && c.date >= new Date(t.getFullYear(), t.getMonth(), 1)), (c) => c.value);
    const people = new Set(lines.map((c) => c.employee).filter(Boolean)).size;
    const topItem = U.group(lines, (c) => c.item, (c) => c.value || 0)[0];
    const table = cost.map((p, i) => ({ key: p.key, full: p.full, issues: p.count, units: units[i].value, cost: p.value, avg: p.count ? p.value / p.count : null }));
    return h("div", { class: "stack" },
      m.hasValues ? null : ui.note(["Cost analysis needs prices — add a unit price (", h("code", null, "Unit_Price"), ") or amount field to requests or the item master."], "warn"),
      K.kpiRow([
        ui.kpi({ label: "Cost this month", value: U.fmtMoney(mtd, true), icon: "wallet", tone: "good", sub: "month to date" }),
        ui.kpi({ label: "Average monthly cost", value: U.fmtMoney(U.sum(cost, (p) => p.value) / 12, true), icon: "chart", tone: "info", sub: "last 12 months" }),
        ui.kpi({ label: "Cost per employee", value: people ? U.fmtMoney(U.sum(lines, (c) => c.value) / people, true) : "—", icon: "user", tone: "violet", sub: r.label.toLowerCase() }),
        ui.kpi({ label: "Top cost item", value: topItem && topItem.value ? topItem.key : "—", icon: "award", tone: "warn", sub: topItem && topItem.value ? U.fmtMoney(topItem.value) + " · " + r.label.toLowerCase() : "" })
      ]),
      h("div", { class: "grid grid-2" },
        K.trendCard(ctx, { title: "Monthly consumption", sub: "Units issued · last 12 months", rows: m.consumption, valFn: (c) => c.qty || 0, format: U.fmtNum, tickFormat: U.fmtCompact, valueHeader: "Units" }),
        K.trendCard(ctx, { title: "Monthly cost", sub: "Value issued · last 12 months", rows: m.consumption, valFn: (c) => c.value || 0, format: (n) => U.fmtMoney(n), tickFormat: (n) => U.fmtMoney(n, true), valueHeader: "Cost" })),
      ui.card({ title: "Cost analysis by month", flush: true, body: ui.table({ columns: [
        { key: "key", label: "Month", render: (p) => p.full },
        { key: "issues", label: "Issues", num: true },
        { key: "units", label: "Units", num: true },
        { key: "cost", label: "Cost", money: true },
        { key: "avg", label: "Avg per issue", money: true }
      ], rows: table, noun: "month", sort: { key: "key", dir: "desc" }, search: false, pageSize: 12 }) }));
  };

  V.stationery = (ctx) => moduleView(ctx, "stationery", "Stationery management", "Issues, consumption and cost — requests from " + (K.report(ctx, "requests") ||"the stationery report"), ST_TABS, ST, "employees");
})(window.CIMS = window.CIMS || {});
