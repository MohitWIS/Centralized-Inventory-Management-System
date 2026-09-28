/* UI kit: cards, KPI tiles, badges, tables, pills, dialogs, toasts. */
(function (C) {
  "use strict";
  const h = C.h, U = C.util;
  const ui = (C.ui = {});

  /* Request status → badge tone/icon, and the validated stack colour order. */
  const STATUS_UI = {
    pending: ["warn", "clock"], approved: ["info", "check"], processing: ["violet", "loader"],
    completed: ["good", "checkCircle"], rejected: ["crit", "xCircle"], other: ["", "info"]
  };
  ui.STATUS_ORDER = ["completed", "approved", "processing", "pending", "rejected", "other"];
  ui.STATUS_COLOR = { completed: "#0ca30c", approved: "#2a78d6", processing: "#4a3aa7", pending: "#eda100", rejected: "#d03b3b", other: "#b4b2a9" };

  ui.card = function (o) {
    const head = o.title || o.actions ? h("div", { class: "card-head" },
      h("div", { class: "titles" }, o.title ? h("h3", { class: "card-title" }, o.title) : null, o.sub ? h("p", { class: "card-sub" }, o.sub) : null),
      o.actions && o.actions.length ? h("div", { class: "card-actions" }, o.actions) : null) : null;
    const body = o.bodyNode || h("div", { class: "card-body" }, o.body);
    return h("section", { class: "card" + (o.flush ? " flush" : "") + (o.className ? " " + o.className : "") }, head, body);
  };

  ui.sectionHead = (title, text, actions) => h("div", { class: "section-head" },
    h("div", null, h("h2", null, title), text ? h("p", null, text) : null),
    actions ? h("div", { class: "card-actions" }, actions) : null);

  function deltaChip(d) {
    if (!d || d.pct == null || !isFinite(d.pct)) return null;
    const dir = Math.abs(d.pct) < 0.5 ? "flat" : d.pct > 0 ? "up" : "down";
    const cls = dir === "flat" || d.upIsGood == null ? "flat" : (dir === "up") === d.upIsGood ? "up" : "down";
    return h("span", { class: "delta " + cls, title: d.title || null }, C.icon(dir === "up" ? "arrowUp" : dir === "down" ? "arrowDown" : "minus"), U.fmtPct(Math.abs(d.pct)));
  }
  ui.kpi = function (o) {
    const el = h(o.onClick ? "button" : "div", { class: "kpi", type: o.onClick ? "button" : null, title: o.title || null },
      h("div", { class: "kpi-top" }, h("span", { class: "kpi-label" }, o.label), h("span", { class: "tone-tile tone-" + (o.tone || "accent") }, C.icon(o.icon || "package"))),
      h("div", { class: "kpi-value" }, o.value, o.unit ? h("span", { class: "unit" }, o.unit) : null),
      h("div", { class: "kpi-sub" }, deltaChip(o.delta), o.sub || null));
    if (o.onClick) el.addEventListener("click", o.onClick);
    return el;
  };

  ui.badge = (label, tone, icon) => h("span", { class: "badge " + (tone || "") + (icon ? "" : " plain") }, icon ? C.icon(icon) : null, label);
  ui.statusBadge = function (group, label) {
    const s = STATUS_UI[group] || STATUS_UI.other;
    return ui.badge(label || C.model.GROUP_LABEL[group] || "—", s[0], s[1]);
  };
  const STOCK_TEXT = { out: "Out of stock", low: "Low stock", ok: "In stock", unknown: "Unknown" };
  // Accepts a status string, or an item — then flags items whose Creator status disagrees with the quantities.
  ui.stockBadge = function (arg) {
    const item = arg && typeof arg === "object" ? arg : null;
    const status = item ? item.stockStatus : arg;
    const badge = status === "out" ? ui.badge(STOCK_TEXT.out, "crit", "ban")
      : status === "low" ? ui.badge(STOCK_TEXT.low, "warn", "alert")
        : status === "ok" ? ui.badge(STOCK_TEXT.ok, "good", "check") : ui.badge(STOCK_TEXT.unknown, "", "minus");
    if (!item || !item.statusMismatch) return badge;
    const flag = h("span", { class: "flag", tabindex: "0", role: "img", "aria-label": "Creator says " + item.reportStatusLabel + "; by quantity " + STOCK_TEXT[item.calcStatus].toLowerCase() }, C.icon("info"));
    C.charts.bindTip(flag, () => ({ title: "Creator and quantity disagree", rows: [
      { value: item.reportStatusLabel || "—", label: "in Creator" },
      { value: STOCK_TEXT[item.calcStatus], label: U.fmtNum(item.stock) + " in stock · reorder at " + U.fmtNum(item.reorderLevel) }
    ] }));
    return h("span", { class: "status-cell" }, badge, flag);
  };
  ui.priorityBadge = function (p) {
    if (!p) return "—";
    const n = U.norm(p);
    if (/urgent|critical/.test(n)) return ui.badge(p, "crit", "flag");
    if (/high/.test(n)) return ui.badge(p, "warn", "flag");
    if (/low/.test(n)) return ui.badge(p, "", "flag");
    return ui.badge(p, "info", "flag");
  };

  ui.meter = (v, max, tone) => h("div", { class: "meter " + (tone || "") }, h("span", { style: { width: Math.max(0, Math.min(100, max ? (v / max) * 100 : 0)) + "%" } }));
  ui.avatar = (name) => h("span", { class: "avatar", "aria-hidden": "true" }, U.initials(name));
  ui.person = (name, sub) => (name ? h("div", { class: "item-cell" }, ui.avatar(name), h("div", null, name, sub ? h("span", { class: "sub" }, sub) : null)) : "—");
  ui.cell = (title, sub) => h("div", null, title || "—", sub ? h("span", { class: "sub" }, sub) : null);

  ui.empty = (o) => h("div", { class: "empty" },
    h("span", { class: "tone-tile tone-" + (o.tone || "neutral") }, C.icon(o.icon || "inbox")),
    h("h4", null, o.title), o.text ? h("p", null, o.text) : null, o.action || null);
  ui.note = (content, tone) => h("div", { class: "note " + (tone || "") }, C.icon(tone === "warn" ? "alert" : "info"), h("div", null, content));
  ui.skeleton = (height, style) => h("div", { class: "skeleton", style: Object.assign({ height: height + "px" }, style || {}) });

  ui.pills = function (items, active, onChange) {
    const row = h("div", { class: "pills", role: "tablist" });
    items.forEach((it) => {
      const b = h("button", { class: "pill", role: "tab", type: "button", "aria-selected": String(it.id === active) },
        it.icon ? C.icon(it.icon) : null, it.label, it.count != null ? h("span", { class: "n" }, U.fmtCompact(it.count)) : null);
      b.addEventListener("click", () => onChange(it.id));
      row.appendChild(b);
    });
    return row;
  };
  ui.seg = function (opts, active, onChange) {
    const wrap = h("div", { class: "seg", role: "group" });
    const btns = opts.map((o) => {
      const b = h("button", { type: "button", "aria-pressed": String(o.id === active) }, o.label);
      b.addEventListener("click", () => { btns.forEach((x) => x.setAttribute("aria-pressed", String(x === b))); onChange(o.id); });
      return b;
    });
    btns.forEach((b) => wrap.appendChild(b));
    return wrap;
  };

  /* ---------- sortable, searchable, paged table ---------- */
  // column: {key, label, num, money, date, value(row), render(row), strong, className, sort:false}
  function cmp(a, b) {
    if (a instanceof Date) a = +a;
    if (b instanceof Date) b = +b;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  }
  const blank = (v) => v == null || v === "" || (typeof v === "number" && isNaN(v));
  function cellText(c, r) {
    const v = c.value ? c.value(r) : r[c.key];
    if (v instanceof Date) return U.fmtDate(v);
    if (typeof v === "number") return c.money ? U.fmtMoney(v) : U.fmtNum(v);
    return blank(v) ? "—" : String(v);
  }
  ui.table = function (o) {
    const cols = o.columns;
    const pageSize = o.pageSize || 10;
    let q = "", page = 0;
    let sortKey = o.sort ? o.sort.key : null, sortDir = o.sort ? o.sort.dir || "desc" : "asc";
    const texts = new WeakMap();
    const search = (r) => {
      // a column may add searchable text beyond its value (e.g. the code and brand shown under an item name)
      if (!texts.has(r)) texts.set(r, cols.map((c) => cellText(c, r) + (c.search ? " " + c.search(r) : "")).join(" ").toLowerCase());
      return texts.get(r);
    };
    const countEl = h("span", { class: "tbl-count" });
    const input = o.search === false ? null : h("input", { type: "search", placeholder: o.placeholder || "Search…", "aria-label": "Search" });
    const toolbar = h("div", { class: "tbl-toolbar" }, input ? h("label", { class: "search" }, C.icon("search"), input) : null, h("span", { class: "grow" }), countEl, o.toolbar || null);
    const thead = h("thead"), tbody = h("tbody");
    const foot = h("div", { class: "tbl-foot" });

    function render() {
      C.clear(thead).appendChild(h("tr", null, cols.map((c) => {
        const sortable = c.sort !== false;
        const th = h("th", { class: (c.num || c.money ? "num " : "") + (sortable ? "sortable" : ""), scope: "col", "aria-sort": sortKey === c.key ? (sortDir === "asc" ? "ascending" : "descending") : null },
          c.label, sortKey === c.key ? h("span", { class: "arrow" }, sortDir === "asc" ? "↑" : "↓") : null);
        if (sortable) th.addEventListener("click", () => {
          if (sortKey === c.key) sortDir = sortDir === "asc" ? "desc" : "asc";
          else { sortKey = c.key; sortDir = c.num || c.money || c.date ? "desc" : "asc"; }
          page = 0; render();
        });
        return th;
      })));
      let rows = o.rows;
      if (q) rows = rows.filter((r) => search(r).indexOf(q) >= 0);
      if (sortKey) {
        const col = cols.find((c) => c.key === sortKey);
        const val = col && (col.value || ((r) => r[col.key]));
        if (val) {
          const dir = sortDir === "asc" ? 1 : -1;
          rows = rows.slice().sort((a, b) => {
            const va = val(a), vb = val(b);
            if (blank(va) || blank(vb)) return blank(va) === blank(vb) ? 0 : blank(va) ? 1 : -1;
            return cmp(va, vb) * dir;
          });
        }
      }
      const pages = Math.max(1, Math.ceil(rows.length / pageSize));
      page = Math.min(page, pages - 1);
      const slice = rows.slice(page * pageSize, (page + 1) * pageSize);
      C.clear(tbody);
      if (!slice.length) tbody.appendChild(h("tr", null, h("td", { class: "tbl-empty", colspan: cols.length }, q ? "No matches for “" + q + "”" : o.empty || "Nothing to show yet")));
      slice.forEach((r) => tbody.appendChild(h("tr", null, cols.map((c) =>
        h("td", { class: [c.num || c.money ? "num" : "", c.strong ? "strong" : "", c.className || ""].join(" ").trim() || null }, c.render ? c.render(r) : cellText(c, r))))));
      countEl.textContent = U.plural(rows.length, o.noun || "record");
      C.clear(foot);
      foot.hidden = rows.length <= pageSize;
      if (!foot.hidden) {
        const prev = h("button", { class: "btn sm icon", type: "button", "aria-label": "Previous page", disabled: page === 0 }, C.icon("chevLeft"));
        const next = h("button", { class: "btn sm icon", type: "button", "aria-label": "Next page", disabled: page >= pages - 1 }, C.icon("chevRight"));
        prev.addEventListener("click", () => { page--; render(); });
        next.addEventListener("click", () => { page++; render(); });
        foot.append(h("span", null, U.fmtNum(page * pageSize + 1) + "–" + U.fmtNum(Math.min(rows.length, (page + 1) * pageSize)) + " of " + U.fmtNum(rows.length)),
          h("div", { class: "pager" }, h("span", null, "Page " + (page + 1) + " of " + pages), prev, next));
      }
    }
    if (input) input.addEventListener("input", U.debounce(() => { q = input.value.trim().toLowerCase(); page = 0; render(); }, 150));
    render();
    return h("div", null, toolbar, h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" }, thead, tbody)), foot);
  };

  /* Card with a Chart / Table toggle — every chart has a table twin. */
  ui.chartCard = function (o) {
    const body = h("div", { class: "card-body" });
    let mode = "chart";
    function paint() {
      C.clear(body);
      if (mode === "chart") {
        body.className = "card-body fill";
        body.appendChild(o.chart() || ui.empty({ icon: "chart", title: o.emptyTitle || "No data for this period", text: o.emptyText || null }));
      } else {
        body.className = "card-body flush-table";
        body.appendChild(ui.table(Object.assign({ search: false, pageSize: 8 }, o.table)));
      }
    }
    paint();
    const seg = o.table ? ui.seg([{ id: "chart", label: "Chart" }, { id: "table", label: "Table" }], "chart", (id) => { mode = id; paint(); }) : null;
    return ui.card({ title: o.title, sub: o.sub, actions: [].concat(o.actions || [], seg ? [seg] : []), bodyNode: body, className: o.className });
  };

  /* ---------- overlays ---------- */
  ui.toast = function (msg, tone) {
    let host = document.querySelector(".toasts");
    if (!host) { host = h("div", { class: "toasts", role: "status", "aria-live": "polite" }); document.body.appendChild(host); }
    const t = h("div", { class: "toast " + (tone || "") }, C.icon(tone === "crit" ? "alert" : tone === "good" ? "checkCircle" : "info"), h("span", null, msg));
    host.appendChild(t);
    setTimeout(() => t.remove(), 4500);
  };
  ui.confirm = function (o) {
    return new Promise((resolve) => {
      const ov = h("div", { class: "overlay" });
      const ok = h("button", { class: "btn " + (o.tone === "crit" ? "danger" : "primary"), type: "button" }, o.confirmLabel || "Confirm");
      const cancel = h("button", { class: "btn", type: "button" }, "Cancel");
      const md = h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": o.title },
        h("h3", null, o.title), h("p", null, o.message), h("div", { class: "row" }, cancel, ok));
      const onKey = (e) => { if (e.key === "Escape") done(false); };
      function done(v) { ov.remove(); md.remove(); document.removeEventListener("keydown", onKey); resolve(v); }
      ok.addEventListener("click", () => done(true));
      cancel.addEventListener("click", () => done(false));
      ov.addEventListener("click", () => done(false));
      document.addEventListener("keydown", onKey);
      document.body.append(ov, md);
      ok.focus();
    });
  };
  ui.drawer = function (o) {
    const ov = h("div", { class: "overlay" });
    const closeBtn = h("button", { class: "btn icon ghost", type: "button", "aria-label": "Close" }, C.icon("x"));
    const dr = h("aside", { class: "drawer", role: "dialog", "aria-modal": "true", "aria-label": o.title },
      h("div", { class: "drawer-head" }, o.icon ? h("span", { class: "tone-tile tone-accent" }, C.icon(o.icon)) : null, h("h3", null, o.title), closeBtn),
      h("div", { class: "drawer-body" }, o.body));
    const onKey = (e) => { if (e.key === "Escape") close(); };
    function close() { ov.remove(); dr.remove(); document.removeEventListener("keydown", onKey); }
    closeBtn.addEventListener("click", close);
    ov.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    document.body.append(ov, dr);
    closeBtn.focus();
    return { close };
  };
})(window.CIMS = window.CIMS || {});
