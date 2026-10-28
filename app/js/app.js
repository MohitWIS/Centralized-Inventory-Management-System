/* Page bootstrap: header, section tabs, period filter, data loading, data-sources panel.
   Each HTML page sets <body data-dashboard="housekeeping|pantry|stationery">. */
(function (C) {
  "use strict";
  const h = C.h, U = C.util, ui = C.ui;
  const SOURCES = C.loader.SOURCES;
  const SOURCE_LABEL = {
    items: "Current stock", itemMaster: "Item master (prices)", transactions: "Stock ledger", requests: "Requests",
    requestLines: "Requested items", purchaseRequests: "Purchase requests", purchaseLines: "Purchase request items", batches: "Batches (expiry)",
    people: "People (departments)"
  };
  const KEY_FIELDS = {
    items: ["item", "itemCode", "stock", "reorderLevel", "unit"],
    itemMaster: ["item", "itemCode", "unitPrice"],
    transactions: ["date", "item", "txnType", "quantity"],
    requests: ["requestNo", "date", "status", "employee"],
    requestLines: ["requestNo", "item", "quantity"],
    purchaseRequests: ["requestNo", "date", "status"],
    purchaseLines: ["requestNo"],
    batches: ["item", "expiryDate", "stock"],
    people: ["employee", "department"]
  };
  const state = { key: null, dash: null, tab: "overview", subs: {}, period: "this_month", model: null, rendered: {}, apiReady: false };

  function sectionEl(tab) { return document.querySelector('[data-section="' + tab + '"]'); }
  function tabs() { return Array.prototype.slice.call(document.querySelectorAll(".nav [data-tab]")); }

  /* ---------- navigation ---------- */
  function readHash() {
    let h = location.hash.replace(/^#/, "");
    try { h = decodeURIComponent(h); } catch (e) { /* malformed hash — use it as is */ }
    const parts = h.split("/");
    if (parts[0] && sectionEl(parts[0])) state.tab = parts[0];
    if (parts[1]) state.subs[state.tab] = parts[1];
  }
  function writeHash() {
    const sub = state.subs[state.tab];
    try { history.replaceState(null, "", "#" + state.tab + (sub ? "/" + sub : "")); } catch (e) { /* sandboxed */ }
  }
  function selectTab(tab) {
    state.tab = tab;
    tabs().forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    document.querySelectorAll("[data-section]").forEach((s) => { s.hidden = s.dataset.section !== tab; });
    if (!state.rendered[tab]) renderSection(tab);
    writeHash();
  }
  function setTabCount(tab, n) {
    const b = tabs().find((x) => x.dataset.tab === tab);
    if (!b) return;
    const old = b.querySelector(".count");
    if (old) old.remove();
    if (n > 0) b.appendChild(h("span", { class: "count", title: n + " pending" }, U.fmtCompact(n)));
  }

  function ctx() {
    return {
      cfg: C.config, key: state.key, dash: state.dash, model: state.model, range: U.periodRange(state.period),
      sub: (sec) => state.subs[sec],
      setSub: (sec, id) => { state.subs[sec] = id; writeHash(); renderSection(sec); },
      go: (tab, sub) => { if (sub) state.subs[tab] = sub; state.rendered[tab] = false; selectTab(tab); window.scrollTo({ top: 0, behavior: "smooth" }); },
      refresh: () => load(true),
      openSources: openSources
    };
  }

  function renderSection(tab) {
    const el = sectionEl(tab);
    if (!el || !state.model) return;
    const view = C.views[tab];
    C.clear(el);
    try {
      el.appendChild(view ? view(ctx()) : ui.empty({ title: "Nothing here yet" }));
    } catch (e) {
      console.error(e);
      el.appendChild(ui.card({ body: ui.empty({ icon: "alert", tone: "crit", title: "This section could not be displayed", text: String((e && e.message) || e) }) }));
    }
    state.rendered[tab] = true;
  }
  function rerender() {
    state.rendered = {};
    if (!state.model) return;
    state.updatedEl.textContent = "Updated " + U.fmtTime(state.loadedAt);
    setTabCount("requests", state.model.requests.filter((r) => r.group === "pending").length);
    renderSection(state.tab);
  }

  /* ---------- header ---------- */
  function renderTopbar() {
    const cfg = C.config, dash = state.dash;
    const periodSel = h("select", { "aria-label": "Period" }, U.PERIODS.map((p) => h("option", { value: p.key, selected: p.key === state.period }, p.label)));
    periodSel.addEventListener("change", () => { state.period = periodSel.value; rerender(); });
    state.refreshBtn = h("button", { class: "btn icon", type: "button", title: "Refresh data", "aria-label": "Refresh data" }, C.icon("refresh"));
    state.refreshBtn.addEventListener("click", () => load(true));
    const srcBtn = h("button", { class: "btn", type: "button" }, C.icon("database"), "Data sources");
    srcBtn.addEventListener("click", openSources);
    state.updatedEl = h("span", { class: "updated" });
    const switcher = cfg.showDashboardSwitcher && !cfg.dashboards[cfg.onlyDashboard] ? h("nav", { class: "switcher", "aria-label": "Dashboards" },
      h("a", { href: C.api.pageHref("widget.html") }, C.icon("grid"), "Console"),
      Object.keys(cfg.dashboards).map((k) => {
        const d = cfg.dashboards[k];
        return h("a", { href: C.api.pageHref(d.page), "aria-current": k === state.key ? "page" : null }, C.icon(d.icon), d.label);
      })) : null;
    const printBtn = h("button", { class: "btn icon", type: "button", title: "Print this view", "aria-label": "Print this view", onclick: () => window.print() }, C.icon("printer"));
    C.clear(document.getElementById("topbar")).append(
      h("div", { class: "brand" }, h("div", { class: "brand-mark" }, C.icon(dash.icon)),
        h("div", null, h("div", { class: "brand-eyebrow" }, cfg.orgName + " · " + cfg.productName), h("h1", null, dash.title))),
      switcher || "", h("div", { class: "topbar-spacer" }),
      h("div", { class: "controls" }, state.updatedEl, h("label", { class: "select" }, C.icon("calendar"), periodSel), srcBtn, printBtn, state.refreshBtn));
  }

  /* ---------- loading ---------- */
  function showSkeleton() {
    const el = sectionEl(state.tab);
    C.clear(el).appendChild(h("div", { class: "stack" },
      h("div", { class: "kpis" }, Array.from({ length: 10 }, () => ui.skeleton(118))),
      h("div", { class: "grid grid-main" }, ui.skeleton(320), ui.skeleton(320))));
  }
  function showFatal(e) {
    const outside = e && e.kind === "outside";
    const reports = Array.from(new Set(SOURCES.map((s) => U.list(state.dash.reports[s])[0]).filter(Boolean)));
    const text = outside
      ? ["Upload the zip made by ", h("code", null, "zet pack"), " in Creator → Settings → Widgets, set the index file to ", h("code", null, "/" + state.dash.page), ", then add the widget to a page. It will read: ", reports.join(", "), "."]
      : C.api.errorMessage(e);
    const retry = h("button", { class: "btn primary", type: "button" }, C.icon("refresh"), "Try again");
    retry.addEventListener("click", () => load(false));
    C.clear(sectionEl(state.tab)).appendChild(ui.card({ body: ui.empty({
      icon: outside ? "database" : "alert", tone: outside ? "accent" : "crit",
      title: outside ? "Open this dashboard inside Zoho Creator" : "Could not load data from Zoho Creator",
      text: text, action: outside ? null : retry
    }) }));
    state.rendered = {};
  }

  async function load(isRefresh) {
    if (state.loading) return state.loading; // a refresh while loading joins the load in progress
    state.loading = doLoad(isRefresh).finally(() => { state.loading = null; });
    return state.loading;
  }
  async function doLoad(isRefresh) {
    if (isRefresh) { document.body.classList.add("is-refreshing"); state.refreshBtn.classList.add("spin"); }
    else showSkeleton();
    try {
      if (!state.apiReady) { await C.api.init(); state.apiReady = true; }
      const raw = await C.loader.loadRaw(state.dash);
      state.model = C.model.build(raw, state.key);
      state.loadedAt = new Date();
      rerender();
      const failed = SOURCES.filter((s) => raw[s].state === "error" && !C.loader.OPTIONAL.has(s));
      if (failed.length) ui.toast("Could not load " + Array.from(new Set(failed.map((s) => raw[s].report))).join(", ") + " — see Data sources", "crit");
      else if (isRefresh) ui.toast("Dashboard refreshed", "good");
    } catch (e) {
      console.error(e);
      showFatal(e);
    } finally {
      document.body.classList.remove("is-refreshing");
      if (state.refreshBtn) state.refreshBtn.classList.remove("spin");
    }
  }

  /* ---------- data sources panel (field detection diagnostics) ---------- */
  function sampleKV(rec) {
    return h("div", { class: "kv" }, Object.keys(rec).filter((k) => k !== "ID").slice(0, 40).map((k) => {
      const v = U.text(rec[k]);
      return h("span", null, h("b", null, k), v ? (v.length > 40 ? v.slice(0, 40) + "…" : v) : "—");
    }));
  }
  function openSources() {
    const m = state.model, dash = state.dash, api = C.api.ctx || {};
    const body = [ui.note(["Application ", h("b", null, api.appName || "—"), api.owner ? " · account " + api.owner : "", api.env ? " · " + api.env.replace(/^\//, "") : "", api.user ? " · signed in as " + api.user : ""])];
    if (m && m.excludedCount) body.push(ui.note([h("b", null, U.plural(m.excludedCount, "record")), " hidden as test data (item names matching ", h("code", null, "excludeItems"), " in js/config.js)."]));
    SOURCES.forEach((s) => {
      const list = U.list(dash.reports[s]);
      const src = m ? m.sources[s] : { state: list.length ? "notloaded" : "unconfigured", report: list[0], records: [] };
      const badge = src.state === "ok" ? ui.badge(U.plural(src.records.length, "record") + (src.truncated ? " (capped)" : ""), "good", "checkCircle")
        : src.state === "error" ? ui.badge("Error", "crit", "xCircle")
          : src.state === "notloaded" ? ui.badge("Not loaded", "", "clock") : ui.badge("Not configured", "", "minus");
      const rows = [["Report", src.report || "—"]];
      if (list.length > 1) rows.push(["Tried in order", list.join(" → ")]);
      if (src.fallbackFrom && src.fallbackFrom.length) rows.push(["Fallback", src.fallbackFrom.map((f) => f.report + " couldn't be loaded (" + f.error + ")").join(" · ") + " — showing " + src.report + " instead"]);
      if (src.state === "error") rows.push(["Error", src.error]);
      if (src.state === "unconfigured") rows.push(["Set it in", "js/config.js → dashboards." + state.key + ".reports." + s]);
      if (src.state === "ok" && src.records.length) {
        const map = src.fieldMap || {};
        const found = Object.keys(map).filter((k) => map[k]);
        const pinned = src.overrides || {};
        rows.push(["Detected", found.length ? found.map((k) => k + " → " + map[k] + (pinned[k] && pinned[k] === map[k] ? " (pinned)" : "")).join(" · ") : "none"]);
        if (src.badOverrides && src.badOverrides.length) rows.push(["Not found", src.badOverrides.join(", ") + " — check dashboards." + state.key + ".fields." + s + " in js/config.js"]);
        const missing = KEY_FIELDS[s].filter((k) => !map[k]);
        if (missing.length) rows.push(["Missing", missing.join(", ") + " — add the link name to config.fields, or pin it in dashboards." + state.key + ".fields." + s]);
        if (s === "items") {
          rows.push(["Stock status", m.stockStatusFrom === "report"
            ? "from Creator field " + m.stockStatusField + (m.statusMismatches.length ? " · " + U.plural(m.statusMismatches.length, "item") + " disagree with the quantities" : "")
            : "calculated: 0 or less = out of stock, at or below reorder level = low" + (m.stockStatusField ? " (Creator field " + m.stockStatusField + " not used)" : "")]);
        }
        if (s === "people") rows.push(["Departments", U.fmtNum(m.peopleLinked || 0) + " of " + U.plural(m.requests.length, "request") + " matched to a person with a department"]);
        if (s === "requests" || s === "purchaseRequests") {
          const list = s === "requests" ? m.requests : m.purchases;
          rows.push(["Items", U.fmtNum(list.filter((r) => r.hasLines).length) + " of " + U.plural(list.length, "request") + " have item lines" +
            ((dash.lineLevel || {})[s] ? " (rows grouped by request no.)" : "")]);
        }
        if (src.lineFieldMap) rows.push(["Subform fields", Object.keys(src.lineFieldMap).filter((k) => src.lineFieldMap[k]).map((k) => k + " → " + src.lineFieldMap[k]).join(" · ")]);
        const usedKeys = new Set(found.map((k) => map[k]));
        const extra = Object.keys(src.records[0]).filter((k) => !usedKeys.has(k) && k !== "ID");
        if (extra.length) rows.push(["Other fields", extra.join(", ")]);
        rows.push(["Sample record", sampleKV(src.records[0])]);
      }
      body.push(h("div", { class: "src" }, h("div", { class: "src-head" }, h("b", null, SOURCE_LABEL[s]), badge),
        h("dl", null, rows.map((r) => [h("dt", null, r[0]), h("dd", null, r[1])]))));
    });
    ui.drawer({ title: "Data sources", icon: "database", body });
  }

  /* ---------- boot ---------- */
  function boot() {
    const key = document.body.getAttribute("data-dashboard");
    const only = C.config.dashboards[C.config.onlyDashboard] ? C.config.onlyDashboard : "";
    if (only && key !== only) { location.replace(C.api.pageHref(C.config.dashboards[only].page) + location.hash); return; } // single-store mode
    const dash = C.config.dashboards[key];
    if (!dash) { document.body.textContent = "Unknown dashboard: " + key; return; }
    state.key = key;
    state.dash = dash;
    if (U.PERIODS.some((p) => p.key === C.config.defaultPeriod)) state.period = C.config.defaultPeriod;
    document.documentElement.style.setProperty("--accent", dash.accent);
    document.title = dash.title + " · " + C.config.orgName;
    readHash();
    renderTopbar();
    tabs().forEach((b) => { if (b.dataset.icon && !b.querySelector("svg")) b.insertBefore(C.icon(b.dataset.icon), b.firstChild); });
    tabs().forEach((b) => b.addEventListener("click", () => selectTab(b.dataset.tab)));
    tabs().forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)));
    document.querySelectorAll("[data-section]").forEach((s) => { s.hidden = s.dataset.section !== state.tab; });
    load(false);
  }
  C.app = { state, load };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window.CIMS = window.CIMS || {});
