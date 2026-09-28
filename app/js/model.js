/* Data model: turns raw Creator records into items, transactions, requests and
   consumption lines, detecting field link names from the config candidates. */
(function (C) {
  "use strict";
  const U = C.util;
  const M = (C.model = {});
  const LOOKUP_KEYS = { display_value: 1, zc_display_value: 1, ID: 1 };

  function isSubformRows(v) {
    return Array.isArray(v) && v.length > 0 && v[0] && typeof v[0] === "object" && Object.keys(v[0]).some((k) => !LOOKUP_KEYS[k]);
  }

  /* Map each logical field to the first candidate link name present in the data.
     Creator numbers a re-added field's link name (Item -> Item1, Item_ID -> Item_ID1),
     so a second pass matches candidates against names with that trailing number removed. */
  M.resolveFields = function (records, fields) {
    const keys = new Map();   // normalised link name -> link name
    const loose = new Map();  // normalised name minus trailing digits -> link name
    const rich = new Set();
    for (const r of records.slice(0, 60)) {
      for (const k of Object.keys(r)) {
        const n = U.norm(k);
        if (!keys.has(n)) keys.set(n, k);
        const bare = n.replace(/\d+$/, "");
        if (bare && bare !== n && !loose.has(bare)) loose.set(bare, k);
        if (isSubformRows(r[k])) rich.add(k);
      }
    }
    const map = {};
    const used = new Set();
    const claim = (logical, lookup) => {
      for (const cand of fields[logical]) {
        const hit = lookup.get(U.norm(cand));
        if (!hit || used.has(hit)) continue;
        if ((logical === "lineItems") !== rich.has(hit)) continue;
        map[logical] = hit;
        used.add(hit);
        return;
      }
    };
    for (const logical in fields) { map[logical] = null; claim(logical, keys); }
    for (const logical in fields) if (!map[logical]) claim(logical, loose);
    return map;
  };

  function reader(rec, map) {
    return {
      t: (f) => (map[f] ? U.text(rec[map[f]]) : ""),
      n: (f) => (map[f] ? U.num(rec[map[f]]) : null),
      d: (f) => (map[f] ? U.parseDate(rec[map[f]]) : null),
      raw: (f) => (map[f] ? rec[map[f]] : undefined)
    };
  }
  /* ---------- stock status ---------- */
  M.parseStockStatus = function (label) {
    const s = String(label || "").toLowerCase().replace(/[-_]+/g, " "); // "Out-of-Stock", "In_Stock"
    if (!s.trim()) return null;
    if (/out\s*of\s*stock|stock\s*out|no\s*stock|not\s*(in\s*stock|available)|unavailable|sold\s*out|exhausted/.test(s)) return "out";
    if (/insufficient|inadequate|shortage|\blow\b|reorder|below|minimum|running\s*(low|out)/.test(s)) return "low"; // before "sufficient"
    if (/in\s*stock|available|sufficient|adequate|healthy|\bok\b/.test(s)) return "ok";
    return null;
  };

  // Stock reports: find the report's own status field (by name, else by values such as
  // "In Stock"), and make sure the field read as on-hand stock actually holds numbers.
  function tuneItemsMap(records, map) {
    const sample = records.slice(0, 60);
    const keys = [];
    for (const r of sample) for (const k of Object.keys(r)) if (keys.indexOf(k) < 0) keys.push(k);
    const share = (key, test) => {
      let n = 0, hit = 0;
      for (const r of sample) { const t = U.text(r[key]); if (!t) continue; n++; if (test(t)) hit++; }
      return n ? hit / n : 0;
    };
    const NUM = /^[-+]?\d[\d,]*(\.\d+)?$/; // plain numbers only — not codes like ITM-0036 or dates
    const numeric = (key) => !!key && share(key, (t) => NUM.test(t.trim())) >= 0.5;
    if (!map.stockStatus) {
      // a column not already used for another field (except the generic "status"), filled on most
      // rows, whose values are nearly all stock words and only a handful of distinct labels
      const taken = new Set(Object.keys(map).filter((k) => k !== "status" && map[k]).map((k) => map[k]));
      let bestScore = 0;
      for (const k of keys) {
        if (k === "ID" || taken.has(k)) continue;
        let n = 0, hit = 0;
        const distinct = new Set();
        for (const r of sample) {
          const t = U.text(r[k]);
          if (!t) continue;
          n++;
          distinct.add(t.toLowerCase());
          if (M.parseStockStatus(t)) hit++;
        }
        if (n < sample.length * 0.5 || hit / n < 0.9 || distinct.size > 6) continue;
        const score = hit / n + (/status|avail/i.test(k) ? 1 : 0);
        if (score > bestScore) { bestScore = score; map.stockStatus = k; }
      }
    }
    if (map.stock && (map.stock === map.stockStatus || !numeric(map.stock))) map.stock = null;
    // stock reports often call the on-hand figure "Quantity" or "Balance"
    if (!map.stock) map.stock = [map.balance, map.quantity].find(numeric) || null;
    return map;
  }

  // Per-dashboard pins from config (dashboards.<name>.fields.<report>) win over detection.
  function applyOverrides(map, ov, records) {
    const present = new Set();
    for (const r of records.slice(0, 60)) for (const k of Object.keys(r)) present.add(k);
    const bad = [];
    for (const k in ov || {}) {
      const v = ov[k];
      if (v === false || v === "none") map[k] = null;
      else if (v && (!records.length || present.has(v))) map[k] = v;
      else if (v) bad.push(k + " → " + v); // pinned field isn't in this report: keep the detected one
    }
    return bad;
  }

  function vocab(groups) {
    const idx = new Map();
    for (const g in groups) for (const v of groups[g]) idx.set(U.norm(v), g);
    return idx;
  }

  let STATUS = new Map(), TXN = new Map(), RETURNED = new Set();
  M.statusGroup = function (label) {
    if (!label) return "other";
    const n = U.norm(label);
    if (STATUS.has(n)) return STATUS.get(n);
    if (/reject|cancel|declin|denied/.test(n)) return "rejected";
    if (/pending|await|submit|waiting/.test(n)) return "pending";
    if (/progress|process|assign|order|hold/.test(n)) return "processing";
    if (/complet|issued|deliver|close|fulfil|done|resolv|receiv/.test(n)) return "completed";
    if (/approv|accept|sanction/.test(n)) return "approved";
    return "other";
  };
  M.txnKind = function (label, qty) {
    const n = U.norm(label);
    if (/opening/.test(n)) return "opening";
    if (TXN.has(n)) return TXN.get(n);
    if (/adjust|damage|expir|writeoff|correct|lost/.test(n)) return "adjustment";
    if (/return/.test(n)) return "return";
    if (/issue/.test(n)) return "issue";
    if (/^(stockin|inward|purchase|receiv|grn)/.test(n)) return "in";
    if (/^(stockout|outward|consum|used)/.test(n)) return "out";
    return qty != null && qty < 0 ? "out" : "in";
  };
  M.KIND_LABEL = { opening: "Opening stock", in: "Stock in", out: "Stock out", issue: "Issue", return: "Return", adjustment: "Adjustment" };
  M.GROUP_LABEL = { pending: "Pending", approved: "Approved", processing: "Processing", completed: "Completed", rejected: "Rejected", other: "Other" };
  M.isOpen = (r) => r.group === "pending" || r.group === "approved" || r.group === "processing";
  M.isReturned = (r) => !!r.returnedDate || RETURNED.has(U.norm(r.returnStatus));

  function priorityRank(p) {
    const list = (C.config.priorities || []).map(U.norm);
    const i = list.indexOf(U.norm(p));
    return i < 0 ? 99 : i;
  }

  function normRequest(rec, map, source, ctx) {
    const r = reader(rec, map);
    const status = r.t("status");
    const req = {
      id: rec.ID, source, raw: rec,
      no: r.t("requestNo") || (rec.ID ? "#" + String(rec.ID).slice(-6) : "—"),
      date: r.d("date"), item: r.t("item"), qty: r.n("quantity"), issuedQty: r.n("issuedQty"),
      department: r.t("department"), employee: r.t("employee"), status: status || "—", group: M.statusGroup(status),
      priority: r.t("priority"), location: r.t("location"), assignedTo: r.t("assignedTo"),
      dueDate: r.d("dueDate"), returnedDate: r.d("returnedDate"), returnStatus: r.t("returnStatus"),
      completedDate: r.d("completedDate"), unitPrice: r.n("unitPrice"), amount: r.n("amount"),
      vendor: r.t("vendor"), remarks: r.t("remarks"), lines: []
    };
    req.priorityRank = priorityRank(req.priority);
    const li = r.raw("lineItems");
    if (isSubformRows(li)) {
      ctx.lineMap = ctx.lineMap || M.resolveFields(li, C.config.fields);
      for (const row of li) {
        const lr = reader(row, ctx.lineMap);
        const line = { item: lr.t("item"), qty: lr.n("quantity"), issuedQty: lr.n("issuedQty"), unitPrice: lr.n("unitPrice"), amount: lr.n("amount") };
        if (line.item || line.qty != null) req.lines.push(line);
      }
    }
    if (!req.lines.length) req.lines.push({ item: req.item, qty: req.qty, issuedQty: req.issuedQty, unitPrice: req.unitPrice, amount: req.amount });
    if (!req.item) req.item = req.lines.map((l) => l.item).filter(Boolean).join(", ");
    if (req.qty == null) req.qty = req.lines.some((l) => l.qty != null) ? U.sum(req.lines, (l) => l.qty) : null;
    return req;
  }

  /* raw: { items|transactions|requests|purchaseRequests: {report, state, error, records, truncated} } */
  M.build = function (raw, key) {
    const cfg = C.config;
    STATUS = vocab(cfg.statusGroups || {});
    TXN = vocab(cfg.transactionTypes || {});
    RETURNED = new Set((cfg.returnedValues || []).map(U.norm));
    const m = { key, sources: {}, items: [], txns: [], requests: [], purchases: [] };

    const dash = (cfg.dashboards || {})[key] || {};
    for (const name of ["items", "transactions", "requests", "purchaseRequests"]) {
      const s = Object.assign({ name, records: [], state: "unconfigured" }, raw[name]);
      s.fieldMap = s.records.length ? M.resolveFields(s.records, cfg.fields) : {};
      if (name === "items" && s.records.length) tuneItemsMap(s.records, s.fieldMap);
      s.overrides = (dash.fields || {})[name] || {};
      s.badOverrides = applyOverrides(s.fieldMap, s.overrides, s.records);
      m.sources[name] = s;
    }

    /* items */
    const S = m.sources;
    const useReport = String(cfg.stockStatusFrom || "report").trim().toLowerCase() !== "numbers";
    m.items = S.items.records.map((rec) => {
      const r = reader(rec, S.items.fieldMap);
      const it = {
        id: rec.ID, raw: rec, name: r.t("item") || r.t("itemCode") || "Unnamed item", code: r.t("itemCode"),
        category: r.t("category"), subCategory: r.t("subCategory"), unit: r.t("unit"), brand: r.t("brand"),
        stock: r.n("stock"), reorderLevel: r.n("reorderLevel"), reorderQty: r.n("reorderQty"),
        unitPrice: r.n("unitPrice"), expiry: r.d("expiryDate"), location: r.t("location")
      };
      it.value = it.stock != null && it.unitPrice != null ? Math.max(it.stock, 0) * it.unitPrice : null;
      // calculated from quantities, and as Creator reports it (if the stock report has a status field)
      it.calcStatus = it.stock == null ? "unknown" : it.stock <= 0 ? "out" : it.reorderLevel != null && it.stock <= it.reorderLevel ? "low" : "ok";
      it.reportStatusLabel = r.t("stockStatus");
      it.reportStatus = M.parseStockStatus(it.reportStatusLabel);
      it.stockStatus = useReport && it.reportStatus ? it.reportStatus : it.calcStatus;
      // without a reorder level the numbers can only tell "out" from "not out", so only flag that
      const judgeLow = it.reorderLevel != null;
      it.statusMismatch = cfg.flagStatusMismatches !== false && !!it.reportStatus && it.calcStatus !== "unknown" &&
        (judgeLow ? it.reportStatus !== it.calcStatus : (it.reportStatus === "out") !== (it.calcStatus === "out"));
      return it;
    });
    m.stockStatusField = S.items.fieldMap.stockStatus || null;
    m.stockStatusFrom = useReport && m.items.some((i) => i.reportStatus) ? "report" : "numbers";
    m.statusMismatches = m.items.filter((i) => i.statusMismatch);
    m.itemIndex = new Map(m.items.map((i) => [U.norm(i.name), i]));
    m.priceOf = (line) => {
      if (line.unitPrice != null) return line.unitPrice;
      const it = m.itemIndex.get(U.norm(line.item));
      return it && it.unitPrice != null ? it.unitPrice : null;
    };

    /* transactions */
    m.txns = S.transactions.records.map((rec) => {
      const r = reader(rec, S.transactions.fieldMap);
      const typeLabel = r.t("txnType");
      const q0 = r.n("quantity");
      const kind = M.txnKind(typeLabel, q0);
      const qty = q0 == null ? null : kind === "adjustment" ? q0 : Math.abs(q0);
      const signed = qty == null ? 0 : kind === "issue" || kind === "out" ? -qty : qty;
      const t = {
        id: rec.ID, raw: rec, date: r.d("date"), item: r.t("item"), kind, typeLabel: typeLabel || M.KIND_LABEL[kind], qty, signed,
        unitPrice: r.n("unitPrice"), amount: r.n("amount"), department: r.t("department"), employee: r.t("employee"),
        reference: r.t("requestNo"), balance: r.n("balance"), remarks: r.t("remarks"), vendor: r.t("vendor"),
        dueDate: r.d("dueDate"), returnedDate: r.d("returnedDate"), returnStatus: r.t("returnStatus")
      };
      if (t.amount == null && qty != null) { const p = m.priceOf(t); t.amount = p != null ? Math.abs(qty) * p : null; }
      return t;
    }).sort((a, b) => (a.date || 0) - (b.date || 0));

    /* requests + purchase requests */
    const rctx = {}, pctx = {};
    m.requests = S.requests.records.map((rec) => normRequest(rec, S.requests.fieldMap, "requests", rctx));
    m.purchases = S.purchaseRequests.records.map((rec) => {
      const p = normRequest(rec, S.purchaseRequests.fieldMap, "purchaseRequests", pctx);
      if (p.amount == null && p.qty != null) { const price = m.priceOf(p); p.amount = price != null ? p.qty * price : null; }
      return p;
    });

    /* consumption lines — from fulfilled requests when available, else ledger issues */
    const fulfilled = m.requests.filter((r) => r.group === "completed");
    if (fulfilled.length) {
      m.consumptionSource = "requests";
      m.consumption = [];
      for (const r of fulfilled) {
        for (const l of r.lines) {
          const qty = l.issuedQty != null ? l.issuedQty : l.qty;
          const price = m.priceOf(l);
          const value = price != null && qty != null ? qty * price : r.lines.length === 1 ? r.amount : l.amount;
          m.consumption.push({ date: r.completedDate || r.date, item: l.item || "Unspecified", qty: qty || 0, value: value != null ? value : null, department: r.department, employee: r.employee, ref: r.no });
        }
      }
    } else {
      const outs = m.txns.filter((t) => t.kind === "issue" || t.kind === "out");
      m.consumptionSource = outs.length ? "transactions" : null;
      m.consumption = outs.map((t) => ({ date: t.date, item: t.item || "Unspecified", qty: t.qty || 0, value: t.amount, department: t.department, employee: t.employee, ref: t.reference }));
    }
    m.hasValues = m.consumption.some((c) => c.value != null);

    /* returns — requests or ledger issues that carry a return due date */
    const today = U.today();
    const returnables = m.requests.filter((r) => r.dueDate && r.group !== "rejected" && r.group !== "pending")
      .concat(m.txns.filter((t) => t.kind === "issue" && t.dueDate));
    m.pendingReturns = returnables.filter((r) => !M.isReturned(r));
    m.overdueReturns = m.pendingReturns.filter((r) => r.dueDate < today);
    m.returnsTracked = returnables.length > 0;
    return m;
  };

  /* Time buckets ending with the current month / day. */
  M.byMonth = function (rows, months, valFn, dateFn) {
    dateFn = dateFn || ((r) => r.date);
    const now = new Date();
    const keys = [];
    for (let i = months - 1; i >= 0; i--) keys.push(U.monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    const acc = new Map(keys.map((k) => [k, { key: k, value: 0, count: 0 }]));
    for (const r of rows) {
      const d = dateFn(r);
      if (!d) continue;
      const e = acc.get(U.monthKey(d));
      if (e) { e.value += valFn ? valFn(r) || 0 : 1; e.count++; }
    }
    return keys.map((k) => Object.assign(acc.get(k), { label: U.monthLabel(k), full: U.monthLabel(k, true) }));
  };
  M.byDay = function (rows, days, valFn, dateFn) {
    dateFn = dateFn || ((r) => r.date);
    const t = U.today();
    const keys = [];
    for (let i = days - 1; i >= 0; i--) keys.push(U.dayKey(U.addDays(t, -i)));
    const acc = new Map(keys.map((k) => [k, { key: k, value: 0, count: 0 }]));
    for (const r of rows) {
      const d = dateFn(r);
      if (!d) continue;
      const e = acc.get(U.dayKey(d));
      if (e) { e.value += valFn ? valFn(r) || 0 : 1; e.count++; }
    }
    return keys.map((k) => Object.assign(acc.get(k), { label: U.fmtShort(U.keyToDate(k)), full: U.fmtDate(U.keyToDate(k)) }));
  };
})(window.CIMS = window.CIMS || {});
