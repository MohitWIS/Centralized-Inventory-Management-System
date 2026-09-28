/* Zoho Creator SDK wrapper — live report data only.
   Uses the v2 JS API (ZOHO.CREATOR.DATA / UTIL) and falls back to v1 (ZOHO.CREATOR.API)
   if the v1 script is loaded instead. */
(function (C) {
  "use strict";
  const A = (C.api = { version: 0, ctx: {} });
  const NO_DATA = [3100, 9280];
  const TIMEOUT_MS = 45000;
  const sdk = () => window.ZOHO && window.ZOHO.CREATOR;

  function inFrame() {
    try { return window.self !== window.top; } catch (e) { return true; }
  }
  // The Creator site hosting this widget (its data centre: creatorapp.zoho.in, .com, .eu …).
  // Browsers often send no referrer into the widget frame, so also ask the frame's ancestors
  // (Chrome / Edge) and the query string Creator adds to the widget URL.
  function hostBase() {
    const creator = (s) => {
      try { const u = new URL(s); return /^creatorapp\.zoho\.[a-z.]+$/i.test(u.hostname) || /(^|\.)zohocreator\./i.test(u.hostname) ? u.origin : ""; }
      catch (e) { return ""; }
    };
    try {
      const anc = window.location.ancestorOrigins;
      if (anc) for (let i = anc.length - 1; i >= 0; i--) { const b = creator(anc[i]); if (b) return b; }
    } catch (e) { /* not supported */ }
    try {
      for (const v of new URLSearchParams(location.search).values()) { const b = creator(v); if (b) return b; }
    } catch (e) { /* no query string */ }
    return creator(document.referrer || "");
  }
  function parsed(e) {
    if (typeof e === "string") { try { return JSON.parse(e); } catch (_) { return { message: e }; } }
    if (e && typeof e.responseText === "string") { try { return JSON.parse(e.responseText); } catch (_) { return { message: e.responseText }; } }
    return e || {};
  }
  function withTimeout(promise, what) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Zoho Creator did not respond while " + what + ".")), TIMEOUT_MS))
    ]);
  }

  A.errorMessage = function (e) {
    const p = parsed(e);
    let msg = p.message || p.error || p.description || (e instanceof Error ? e.message : "");
    if (msg && typeof msg === "object") msg = msg.message || JSON.stringify(msg);
    if (!msg) { try { msg = JSON.stringify(p).slice(0, 240); } catch (_) { msg = String(e); } }
    return (p.code ? "[" + p.code + "] " : "") + msg;
  };
  // The report can't be opened by this user (or doesn't exist) — as opposed to a timeout or other failure.
  A.isAccessError = (e) => /permission|access|privilege|not\s*allowed|denied|forbidden|unauthori[sz]ed|not\s*authori[sz]ed|not\s*found|no\s*report|invalid\s*report|does\s*not\s*exist/i.test(A.errorMessage(e));
  function isNoData(e) {
    const p = parsed(e);
    if (NO_DATA.indexOf(Number(p.code)) >= 0) return true;
    return /no (records|data)/i.test(A.errorMessage(e));
  }
  function check(res) {
    const code = Number(res && res.code);
    if (code && code !== 3000) throw res;
    return res;
  }

  /* Read the app context from Creator. Throws a friendly error outside Creator. */
  A.init = async function () {
    const cfg = C.config;
    const Z = sdk();
    if (!Z) { const e = new Error("The Zoho Creator widget SDK (widgetsdk-min.js) did not load."); e.kind = "sdk"; throw e; }
    if (!inFrame()) { const e = new Error("This dashboard reads live data from your Creator reports, so it must be opened inside Zoho Creator."); e.kind = "outside"; throw e; }
    A.version = Z.DATA && Z.DATA.getRecords ? 2 : Z.API && Z.API.getAllRecords ? 1 : 0;
    if (!A.version) throw new Error("Unsupported Zoho Creator SDK version.");
    if (A.version === 1 && typeof Z.init === "function") await withTimeout(Z.init(), "initialising");
    let p = {};
    try { p = (await withTimeout(Z.UTIL.getInitParams(), "reading app details")) || {}; } catch (e) { p = {}; }
    A.ctx = {
      appName: cfg.appName || p.appLinkName || "",
      owner: cfg.ownerName || p.scope || "",
      env: p.envUrlFragment || "",
      user: p.loginUser || "",
      base: String(cfg.creatorBaseUrl || hostBase() || "https://creatorapp.zoho.com").replace(/\/+$/, "")
    };
    if (!A.ctx.appName) throw new Error("Could not detect the Creator application — set appName in js/config.js.");
    return A;
  };

  /* Fetch every record of a report (up to maxRecordsPerReport). */
  A.fetchAll = async function (report, opts) {
    opts = opts || {};
    const max = C.config.maxRecordsPerReport || 5000;
    const Z = sdk();
    const out = [];
    let truncated = false;

    if (A.version === 2) {
      const PAGE = 1000;
      let cursor = null;
      let fieldConfig = C.config.fieldConfig || null;
      for (let guard = 0; guard < 50; guard++) {
        const q = { app_name: A.ctx.appName, report_name: report, max_records: PAGE };
        if (fieldConfig) q.field_config = fieldConfig;
        if (opts.criteria) q.criteria = opts.criteria;
        if (cursor) q.record_cursor = cursor;
        let res;
        try {
          res = await withTimeout(Z.DATA.getRecords(q), "loading " + report);
        } catch (e) {
          if (isNoData(e)) break;
          // retry once with the report's default fields — but not for access / missing-report errors
          if (!fieldConfig || out.length || A.isAccessError(e)) throw e;
          fieldConfig = null;
          delete q.field_config;
          try { res = await withTimeout(Z.DATA.getRecords(q), "loading " + report); } catch (e2) { if (isNoData(e2)) break; throw e2; }
        }
        if (NO_DATA.indexOf(Number(res && res.code)) >= 0) break;
        check(res);
        const data = (res && res.data) || [];
        out.push.apply(out, data);
        cursor = (res && (res.record_cursor || res.recordCursor || (res.headers && (res.headers.record_cursor || res.headers["record-cursor"])))) || null;
        if (data.length < PAGE || !cursor) break; // a full page without a cursor is the last page
        if (out.length >= max) { truncated = true; break; }
      }
    } else {
      const PAGE = 200;
      for (let page = 1; page <= 100; page++) {
        const q = { appName: A.ctx.appName, reportName: report, page: page, pageSize: PAGE };
        if (opts.criteria) q.criteria = opts.criteria;
        let res;
        try { res = await withTimeout(Z.API.getAllRecords(q), "loading " + report); } catch (e) { if (isNoData(e)) break; throw e; }
        if (NO_DATA.indexOf(Number(res && res.code)) >= 0) break;
        check(res);
        const data = (res && res.data) || [];
        out.push.apply(out, data);
        if (data.length < PAGE) break;
        if (out.length >= max) { truncated = true; break; }
      }
    }
    return { records: out.slice(0, max), truncated: truncated };
  };

  /* Update fields of one record (used by Approve / Reject). */
  A.update = async function (report, id, data) {
    const Z = sdk();
    if (A.version === 2) return check(await withTimeout(Z.DATA.updateRecordById({ app_name: A.ctx.appName, report_name: report, id: String(id), payload: { data: data } }), "saving"));
    return check(await withTimeout(Z.API.updateRecord({ appName: A.ctx.appName, reportName: report, id: String(id), data: { data: data } }), "saving"));
  };

  /* Links into the Creator app. */
  A.url = function (kind, name) {
    const c = A.ctx;
    const env = c.env ? "/" + String(c.env).replace(/^\/+|\/+$/g, "") : ""; // "/environment/development", blank in production
    return (C.config.urlTemplate || "{base}/{owner}{env}/{app}/#{kind}:{name}")
      .replace("{base}", c.base || "https://creatorapp.zoho.com")
      .replace("{owner}", c.owner || "")
      .replace("{app}", c.appName || "")
      .replace("{env}", env)
      .replace("{kind}", kind)
      .replace("{name}", name);
  };
  A.open = function (kind, name) {
    const url = A.url(kind, name);
    sdk().UTIL.navigateParentURL({ action: "open", url: url, window: C.config.openLinksIn === "same" ? "same" : "new" });
    return url;
  };
  // Links between dashboard pages keep the query string the SDK relies on.
  A.pageHref = (page) => page + (location.search || "");
})(window.CIMS = window.CIMS || {});
