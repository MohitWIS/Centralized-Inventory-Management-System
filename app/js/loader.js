/* Loads the Creator reports behind one module (dashboards.<key>.reports) into raw sources for
   C.model.build. Shared by the module pages (app.js) and the management console (console.js). */
(function (C) {
  "use strict";
  const U = C.util;
  const L = (C.loader = {});
  L.SOURCES = ["items", "itemMaster", "transactions", "requests", "requestLines", "purchaseRequests", "purchaseLines", "batches", "people"];
  // sources that only enrich others — if one can't be loaded the pages work without it, so no error toast
  L.OPTIONAL = new Set(["people"]);
  // reports this user can't open — skipped on later refreshes this session (saves API calls)
  L.denied = new Set();

  // at most maxParallelRequests reports in flight, across every module being loaded
  let active = 0;
  const queue = [];
  function limited(fn) {
    return new Promise((resolve, reject) => {
      const run = () => {
        active++;
        fn().then(resolve, reject).finally(() => { active--; if (queue.length) queue.shift()(); });
      };
      if (active < (C.config.maxParallelRequests || 6)) run(); else queue.push(run);
    });
  }

  /* Returns { <source>: {report, tried, state: ok|error|unconfigured, records, truncated, error, fallbackFrom} }.
     cache (optional, a Map) shares fetches between modules that use the same report. */
  L.loadRaw = async function (dash, cache) {
    cache = cache || new Map();
    const raw = {};
    const fetchOnce = (report, criteria) => {
      const k = report + "|" + (criteria || "");
      if (!cache.has(k)) cache.set(k, limited(() => C.api.fetchAll(report, { criteria: criteria })));
      return cache.get(k);
    };
    await Promise.all(L.SOURCES.map(async (s) => {
      const list = U.list((dash.reports || {})[s]);
      if (!list.length) { raw[s] = { report: "", state: "unconfigured", records: [] }; return; }
      const criteria = (dash.criteria || {})[s];
      const failed = [];
      for (let i = 0; i < list.length; i++) { // first report that loads wins (All_ first, My_ as fallback)
        const report = list[i], last = i === list.length - 1;
        if (L.denied.has(report) && !last) { failed.push({ report: report, error: "no access (skipped this session)", denied: true }); continue; }
        try {
          const res = await fetchOnce(report, criteria);
          raw[s] = { report: report, tried: list, state: "ok", records: res.records, truncated: res.truncated, fallbackFrom: failed };
          return;
        } catch (e) {
          const denied = C.api.isAccessError(e);
          if (denied) L.denied.add(report);
          failed.push({ report: report, error: C.api.errorMessage(e), denied: denied });
          if (!denied) break; // fall back only when the report can't be opened — not on timeouts or other errors
        }
      }
      // name the report that actually broke (not the All_ report this user was expected to be refused)
      const shown = (failed.find((f) => !f.denied) || failed[failed.length - 1]).report;
      raw[s] = { report: shown, tried: list, state: "error", error: failed.map((f) => (list.length > 1 ? f.report + ": " : "") + f.error).join(" · "), records: [] };
    }));
    return raw;
  };
})(window.CIMS = window.CIMS || {});
