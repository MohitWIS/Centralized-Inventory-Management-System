/* Data model: turns raw Creator records into items, transactions, requests, purchase orders,
   batches and consumption lines, detecting field link names from the config candidates and
   joining related reports (request lines, item-master prices, ledger issues). */
(function (C) {
  "use strict";
  const U = C.util;
  const M = (C.model = {});
  const SOURCES = ["items", "itemMaster", "transactions", "requests", "requestLines", "purchaseRequests", "purchaseLines", "batches", "people"];
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
  const sumOrNull = (rows, f) => (rows.some((r) => f(r) != null) ? U.sum(rows, f) : null);
  const maxDate = (ds) => ds.reduce((a, d) => (d && (!a || d > a) ? d : a), null);

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

  // Per-module pins from config (dashboards.<name>.fields.<report>) win over detection.
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
    if (/reject|cancel|declin|denied|notapprov|unapprov|disapprov/.test(n)) return "rejected";
    if (/pending|await|submit|waiting/.test(n)) return "pending";
    if (/complet|issued|deliver|close|fulfil|done|resolv|receiv|updated/.test(n)) return "completed";
    if (/approv|accept|sanction/.test(n)) return "approved";
    if (/progress|process|assign|order|hold/.test(n)) return "processing";
    return "other";
  };
  M.txnKind = function (label, qty) {
    const n = U.norm(label);
    if (/opening/.test(n)) return "opening";
    if (TXN.has(n)) return TXN.get(n);
    if (/adjust|discard|damage|expir|writeoff|correct|lost/.test(n)) return "adjustment";
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
  M.isOut = (t) => t.kind === "out" || t.kind === "issue";

  function priorityRank(p) {
    const list = (C.config.priorities || []).map(U.norm);
    const i = list.indexOf(U.norm(p));
    return i < 0 ? 99 : i;
  }

  const lineFrom = (lr) => ({ item: lr.t("item"), code: lr.t("itemCode"), unit: lr.t("unit"), qty: lr.n("quantity"), issuedQty: lr.n("issuedQty"), unitPrice: lr.n("unitPrice"), amount: lr.n("amount") });
  const hasContent = (l) => !!l.item || l.qty != null;

  // Rebuild a request's headline item / quantity / amount from its lines.
  function summarise(req) {
    const named = req.lines.map((l) => l.item).filter(Boolean);
    if (named.length) req.item = Array.from(new Set(named)).join(", ");
    const qty = sumOrNull(req.lines, (l) => l.qty);
    if (qty != null) req.qty = qty;
    const iss = sumOrNull(req.lines, (l) => l.issuedQty);
    if (iss != null) req.issuedQty = iss;
    if (req.amount == null) req.amount = sumOrNull(req.lines, (l) => l.amount);
  }

  function normRequest(rec, map, source, ctx) {
    const r = reader(rec, map);
    const status = r.t("status");
    const who = r.raw("employee"); // a user lookup {ID, Name, zc_display_value} links to the user master by ID
    const req = {
      id: rec.ID, source, raw: rec,
      no: r.t("requestNo") || (rec.ID ? "#" + String(rec.ID).slice(-6) : "—"),
      date: r.d("date"), item: r.t("item"), code: r.t("itemCode"), qty: r.n("quantity"), issuedQty: r.n("issuedQty"),
      department: r.t("department"), employee: r.t("employee"), employeeId: who && typeof who === "object" && who.ID ? String(who.ID) : "", email: r.t("email"),
      status: status || "—", group: M.statusGroup(status),
      priority: r.t("priority"), location: r.t("location"), assignedTo: r.t("assignedTo"),
      dueDate: r.d("dueDate"), returnedDate: r.d("returnedDate"), returnStatus: r.t("returnStatus"),
      completedDate: r.d("completedDate"), unitPrice: r.n("unitPrice"), amount: r.n("amount"),
      vendor: r.t("vendor"), remarks: r.t("remarks"), lines: [], hasLines: false
    };
    req.priorityRank = priorityRank(req.priority);
    const li = r.raw("lineItems");
    if (isSubformRows(li)) {
      ctx.lineMap = ctx.lineMap || M.resolveFields(li, C.config.fields);
      for (const row of li) { const line = lineFrom(reader(row, ctx.lineMap)); if (hasContent(line)) req.lines.push(line); }
      req.hasLines = req.lines.length > 0;
    }
    if (!req.lines.length) req.lines.push({ item: req.item, code: req.code, qty: req.qty, issuedQty: req.issuedQty, unitPrice: req.unitPrice, amount: req.amount });
    summarise(req);
    return req;
  }

  // Line-level reports (one row per requested item): merge rows that share a request number.
  function groupByNo(list) {
    const out = [], byNo = new Map();
    for (const r of list) {
      const k = U.norm(r.no);
      const g = k && byNo.get(k);
      if (!g) {
        const first = Object.assign({}, r, { lines: r.lines.slice(), hasLines: true, rows: [r] });
        if (k) byNo.set(k, first);
        out.push(first);
        continue;
      }
      g.rows.push(r);
      g.lines.push.apply(g.lines, r.lines);
      if (r.date && (!g.date || r.date < g.date)) g.date = r.date;
      if (r.completedDate && (!g.completedDate || r.completedDate > g.completedDate)) g.completedDate = r.completedDate;
      if (!g.remarks && r.remarks) g.remarks = r.remarks;
    }
    for (const g of out) {
      if (g.rows.length < 2) { delete g.rows; continue; }
      g.qty = g.issuedQty = g.amount = null;
      summarise(g);
      // a request is only as far along as its least advanced line
      const order = ["pending", "approved", "processing", "completed", "rejected", "other"];
      const groups = g.rows.map((r) => r.group);
      const open = groups.filter((x) => x !== "rejected");
      const least = (open.length ? open : groups).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
      const pick = g.rows.find((r) => r.group === least) || g.rows[0];
      g.group = least; g.status = pick.status;
      delete g.rows;
    }
    return out;
  }

  // Lines from a lines report — flat rows, or a header report with an item subform — keyed by request no.
  function collectLines(src) {
    const byNo = new Map();
    if (!src || src.state !== "ok" || !src.records.length) return byNo;
    const map = src.fieldMap;
    const add = (no, line) => {
      const k = U.norm(no);
      if (!k || !hasContent(line)) return;
      if (!byNo.has(k)) byNo.set(k, []);
      byNo.get(k).push(line);
    };
    if (map.lineItems) {
      const sample = [];
      for (const rec of src.records) { const v = rec[map.lineItems]; if (isSubformRows(v)) sample.push.apply(sample, v); if (sample.length >= 60) break; }
      const lmap = src.lineFieldMap = M.resolveFields(sample, C.config.fields);
      for (const rec of src.records) {
        const v = rec[map.lineItems];
        if (isSubformRows(v)) for (const row of v) add(U.text(rec[map.requestNo]), lineFrom(reader(row, lmap)));
      }
    } else {
      for (const rec of src.records) { const r = reader(rec, map); add(r.t("requestNo"), lineFrom(r)); }
    }
    return byNo;
  }
  function attachLines(reqs, byNo) {
    if (!byNo.size) return;
    for (const req of reqs) {
      if (req.hasLines) continue;
      const ls = byNo.get(U.norm(req.no));
      if (!ls || !ls.length) continue;
      req.lines = ls.map((l) => Object.assign({}, l));
      req.hasLines = true;
      req.qty = req.issuedQty = null;
      summarise(req);
    }
  }

  /* raw: { <source>: {report, state, error, records, truncated} } for each of SOURCES */
  M.build = function (raw, key) {
    const cfg = C.config;
    STATUS = vocab(cfg.statusGroups || {});
    TXN = vocab(cfg.transactionTypes || {});
    RETURNED = new Set((cfg.returnedValues || []).map(U.norm));
    const EXCL = (cfg.excludeItems || []).map((p) => { try { return new RegExp(p, "i"); } catch (e) { return null; } }).filter(Boolean);
    const excluded = (name) => !!name && EXCL.some((rx) => rx.test(name));
    const m = { key, sources: {}, items: [], txns: [], requests: [], purchases: [], batches: [], excludedCount: 0 };

    const dash = (cfg.dashboards || {})[key] || {};
    for (const name of SOURCES) {
      const s = Object.assign({ name, records: [], state: "unconfigured" }, raw[name]);
      s.fieldMap = s.records.length ? M.resolveFields(s.records, cfg.fields) : {};
      if (name === "items" && s.records.length) tuneItemsMap(s.records, s.fieldMap);
      s.overrides = (dash.fields || {})[name] || {};
      s.badOverrides = applyOverrides(s.fieldMap, s.overrides, s.records);
      m.sources[name] = s;
    }
    const S = m.sources;
    const skip = (name) => { if (excluded(name)) { m.excludedCount++; return true; } return false; };

    /* item master (prices, units, minimum levels) — joined to stock items by code, else name */
    const master = S.itemMaster.records.map((rec) => {
      const r = reader(rec, S.itemMaster.fieldMap);
      return { name: r.t("item"), code: r.t("itemCode"), unitPrice: r.n("unitPrice"), gstRate: r.n("gstRate"), reorderLevel: r.n("reorderLevel"),
        unit: r.t("unit"), brand: r.t("brand"), category: r.t("category"), subCategory: r.t("subCategory"), expiry: r.d("expiryDate") };
    }).filter((x) => x.name || x.code);
    const masterByCode = new Map(master.filter((x) => x.code).map((x) => [U.norm(x.code), x]));
    const masterByName = new Map(master.filter((x) => x.name).map((x) => [U.norm(x.name), x]));
    const masterOf = (code, name) => (code && masterByCode.get(U.norm(code))) || (name && masterByName.get(U.norm(name))) || null;
    m.itemMaster = master;

    /* items */
    const useReport = String(cfg.stockStatusFrom || "report").trim().toLowerCase() !== "numbers";
    m.items = S.items.records.map((rec) => {
      const r = reader(rec, S.items.fieldMap);
      const it = {
        id: rec.ID, raw: rec, name: r.t("item") || r.t("itemCode") || "Unnamed item", code: r.t("itemCode"),
        category: r.t("category"), subCategory: r.t("subCategory"), unit: r.t("unit"), brand: r.t("brand"),
        stock: r.n("stock"), reorderLevel: r.n("reorderLevel"), reorderQty: r.n("reorderQty"),
        unitPrice: r.n("unitPrice"), expiry: r.d("expiryDate"), location: r.t("location")
      };
      const mi = masterOf(it.code, it.name);
      if (mi) {
        for (const f of ["unitPrice", "reorderLevel", "gstRate", "expiry"]) if (it[f] == null && mi[f] != null) it[f] = mi[f];
        for (const f of ["unit", "brand", "category", "subCategory"]) if (!it[f] && mi[f]) it[f] = mi[f];
      }
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
    }).filter((it) => !skip(it.name));
    m.stockStatusField = S.items.fieldMap.stockStatus || null;
    m.stockStatusFrom = useReport && m.items.some((i) => i.reportStatus) ? "report" : "numbers";
    m.statusMismatches = m.items.filter((i) => i.statusMismatch);
    m.itemIndex = new Map(m.items.map((i) => [U.norm(i.name), i]));
    const codeIndex = new Map(m.items.filter((i) => i.code).map((i) => [U.norm(i.code), i]));
    m.priceOf = (line) => {
      if (line.unitPrice != null) return line.unitPrice;
      const it = (line.code && codeIndex.get(U.norm(line.code))) || m.itemIndex.get(U.norm(line.item));
      if (it && it.unitPrice != null) return it.unitPrice;
      const mi = masterOf(line.code, line.item);
      return mi && mi.unitPrice != null ? mi.unitPrice : null;
    };

    /* transactions (stock ledger) */
    m.txns = S.transactions.records.map((rec) => {
      const r = reader(rec, S.transactions.fieldMap);
      const typeLabel = r.t("txnType");
      const q0 = r.n("quantity");
      const kind = M.txnKind(typeLabel, q0);
      const qty = q0 == null ? null : Math.abs(q0);
      // out / issue reduce stock; so do discards, damage, expiry and losses (or a negative adjustment)
      const minus = M.isOut({ kind }) || (kind === "adjustment" && ((q0 != null && q0 < 0) || /discard|damage|expir|writeoff|lost/.test(U.norm(typeLabel))));
      const signed = qty == null ? 0 : minus ? -qty : qty;
      const t = {
        id: rec.ID, raw: rec, date: r.d("date"), item: r.t("item"), code: r.t("itemCode"), kind, typeLabel: typeLabel || M.KIND_LABEL[kind], qty, signed,
        unitPrice: r.n("unitPrice"), amount: r.n("amount"), department: r.t("department"), employee: r.t("employee"),
        reference: r.t("requestNo"), balance: r.n("balance"), remarks: r.t("remarks"), vendor: r.t("vendor"),
        dueDate: r.d("dueDate"), returnedDate: r.d("returnedDate"), returnStatus: r.t("returnStatus")
      };
      if (t.amount == null && qty != null) { const p = m.priceOf(t); t.amount = p != null ? qty * p : null; }
      return t;
    }).filter((t) => !skip(t.item)).sort((a, b) => (a.date || 0) - (b.date || 0));

    /* requests: header rows (+ joined item lines), or item rows grouped by request no. */
    const dropExcluded = (list) => list.filter((req) => {
      if (!req.hasLines) return !skip(req.item);
      const kept = req.lines.filter((l) => !skip(l.item));
      if (!kept.length) return false;
      if (kept.length !== req.lines.length) { req.lines = kept; req.qty = req.issuedQty = req.amount = null; summarise(req); }
      return true;
    });
    const rctx = {}, pctx = {};
    let reqs = S.requests.records.map((rec) => normRequest(rec, S.requests.fieldMap, "requests", rctx));
    if ((dash.lineLevel || {}).requests) reqs = groupByNo(reqs);
    attachLines(reqs, collectLines(S.requestLines));
    m.requests = dropExcluded(reqs);

    // requesters' departments from the user master: by user lookup ID, else email, else name
    const byId = new Map(), byEmail = new Map(), byName = new Map();
    for (const rec of S.people.records) {
      const r = reader(rec, S.people.fieldMap);
      const dept = r.t("department");
      if (!dept) continue;
      if (rec.ID) byId.set(String(rec.ID), dept);
      const e = U.norm(r.t("email")), n = U.norm(r.t("employee"));
      if (e && !byEmail.has(e)) byEmail.set(e, dept);
      if (n && !byName.has(n)) byName.set(n, dept);
    }
    m.peopleLinked = 0;
    m.peopleLoaded = byId.size > 0;
    if (byId.size) for (const req of m.requests) {
      if (req.department) continue;
      const d = (req.employeeId && byId.get(req.employeeId)) || (req.email && byEmail.get(U.norm(req.email))) || (req.employee && byName.get(U.norm(req.employee)));
      if (d) { req.department = d; m.peopleLinked++; }
    }
    // who raised requests that still have no department (their user record has none, or they aren't in it)
    m.requestersWithoutDept = Array.from(new Set(m.requests.filter((r) => !r.department && r.employee).map((r) => r.employee)));

    // ledger entries that reference a request tell us when (and how much) was issued against it
    const outByRef = new Map();
    for (const t of m.txns) if (M.isOut(t) && t.reference) {
      const k = U.norm(t.reference);
      if (!outByRef.has(k)) outByRef.set(k, []);
      outByRef.get(k).push(t);
    }
    const reqByNo = new Map(m.requests.map((r) => [U.norm(r.no), r]));
    for (const req of m.requests) {
      const ts = outByRef.get(U.norm(req.no));
      if (!ts) continue;
      req.ledger = ts;
      if (!req.completedDate) req.completedDate = maxDate(ts.map((t) => t.date));
      for (const l of req.lines) {
        if (l.issuedQty != null) continue;
        const mine = ts.filter((t) => (l.code && t.code ? U.norm(t.code) === U.norm(l.code) : U.norm(t.item) === U.norm(l.item)));
        if (mine.length) l.issuedQty = U.sum(mine, (t) => t.qty);
      }
      if (req.issuedQty == null) req.issuedQty = U.sum(ts, (t) => t.qty);
    }

    /* purchase orders (+ joined item lines) */
    const purchases = S.purchaseRequests.records.map((rec) => normRequest(rec, S.purchaseRequests.fieldMap, "purchaseRequests", pctx));
    attachLines(purchases, collectLines(S.purchaseLines));
    m.purchases = dropExcluded(purchases).map((p) => {
      if (p.amount == null) {
        const priced = p.lines.map((l) => { const price = m.priceOf(l); return price != null && l.qty != null ? l.qty * price : null; });
        if (priced.some((v) => v != null)) p.amount = U.sum(priced, (v) => v);
      }
      return p;
    });

    /* batches (expiry) */
    m.batches = S.batches.records.map((rec) => {
      const r = reader(rec, S.batches.fieldMap);
      const b = { id: rec.ID, item: r.t("item"), code: r.t("itemCode"), batch: r.t("batch"), expiry: r.d("expiryDate"), qty: r.n("stock") != null ? r.n("stock") : r.n("quantity") };
      const it = (b.code && codeIndex.get(U.norm(b.code))) || m.itemIndex.get(U.norm(b.item));
      b.unit = it ? it.unit : "";
      b.unitPrice = m.priceOf(b);
      b.value = b.qty != null && b.unitPrice != null ? Math.max(b.qty, 0) * b.unitPrice : null;
      return b;
    }).filter((b) => (b.item || b.code) && !skip(b.item));
    // an item's expiry = its earliest batch that still has stock
    for (const b of m.batches) {
      if (!b.expiry || !(b.qty > 0)) continue;
      const it = (b.code && codeIndex.get(U.norm(b.code))) || m.itemIndex.get(U.norm(b.item));
      if (it && (!it.expiry || b.expiry < it.expiry)) it.expiry = b.expiry;
    }

    /* consumption lines — the ledger's Consumed / issue entries, else fulfilled requests */
    const mode = String(cfg.consumptionFrom || "auto").toLowerCase();
    const outs = m.txns.filter(M.isOut);
    const fulfilled = m.requests.filter((r) => r.group === "completed");
    if (mode !== "requests" && outs.length) {
      m.consumptionSource = "transactions";
      m.consumption = outs.map((t) => {
        const req = t.reference ? reqByNo.get(U.norm(t.reference)) : null;
        return { date: t.date, item: t.item || "Unspecified", code: t.code, qty: t.qty || 0, value: t.amount,
          department: t.department || (req && req.department) || "", employee: t.employee || (req && req.employee) || "", ref: t.reference };
      });
    } else if (mode !== "transactions" && fulfilled.length) {
      m.consumptionSource = "requests";
      m.consumption = [];
      for (const r of fulfilled) {
        for (const l of r.lines) {
          const qty = l.issuedQty != null ? l.issuedQty : l.qty;
          const price = m.priceOf(l);
          const value = price != null && qty != null ? qty * price : r.lines.length === 1 ? r.amount : l.amount;
          m.consumption.push({ date: r.completedDate || r.date, item: l.item || "Unspecified", code: l.code, qty: qty || 0, value: value != null ? value : null, department: r.department, employee: r.employee, ref: r.no });
        }
      }
    } else {
      m.consumptionSource = null;
      m.consumption = [];
    }
    m.hasValues = m.consumption.some((c) => c.value != null);
    m.hasDepartments = m.consumption.some((c) => c.department);

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
