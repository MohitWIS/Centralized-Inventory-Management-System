/* Core helpers: value normalisation, dates, formatting, DOM builder, icons. */
(function (C) {
  "use strict";
  const U = (C.util = {});
  const cfg = () => C.config || {};

  /* ---------- value normalisation ---------- */
  U.norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");

  // Creator returns lookups as {display_value, ID} (v1) or {zc_display_value, ID} (v2).
  U.text = function text(v) {
    if (v == null) return "";
    if (Array.isArray(v)) return v.map(text).filter(Boolean).join(", ");
    if (typeof v === "object") {
      const d = v.zc_display_value != null ? v.zc_display_value : v.display_value != null ? v.display_value : v.value != null ? v.value : v.name;
      return text(d);
    }
    return String(v).trim();
  };

  U.num = function (v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    const s = U.text(v).replace(/[^0-9.\-]/g, "");
    if (!s || s === "-" || s === ".") return null;
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  };

  /* ---------- dates ---------- */
  const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  function mk(y, mo, d, hh, mm, ss, ap) {
    let h = hh ? +hh : 0;
    if (ap) {
      ap = ap.toLowerCase();
      if (ap === "pm" && h < 12) h += 12;
      if (ap === "am" && h === 12) h = 0;
    }
    const dt = new Date(y, mo, d, h, mm ? +mm : 0, ss ? +ss : 0);
    return isNaN(dt) ? null : dt;
  }
  const TIME = "(?:[ T,]+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\s*([AaPp][Mm])?)?";
  const RX_DMONY = new RegExp("^(\\d{1,2})[-\\s/]([A-Za-z]{3,})[-\\s/,]+(\\d{4})" + TIME);
  const RX_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
  const RX_NUM = new RegExp("^(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{4})" + TIME);
  const RX_MONDY = /^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/;

  U.parseDate = function (v) {
    if (v == null || v === "") return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    const s = U.text(v);
    if (!s) return null;
    let m = s.match(RX_DMONY); // 11-Sep-2026 [10:30:00 AM]  (Creator default)
    if (m && MON[m[2].slice(0, 3).toLowerCase()] != null) return mk(+m[3], MON[m[2].slice(0, 3).toLowerCase()], +m[1], m[4], m[5], m[6], m[7]);
    m = s.match(RX_ISO);
    if (m) return mk(+m[1], +m[2] - 1, +m[3], m[4], m[5], m[6]);
    m = s.match(RX_NUM);
    if (m) {
      const dmy = String(cfg().dateOrder || "DMY").toUpperCase() !== "MDY";
      return mk(+m[3], (dmy ? +m[2] : +m[1]) - 1, dmy ? +m[1] : +m[2], m[4], m[5], m[6], m[7]);
    }
    m = s.match(RX_MONDY);
    if (m && MON[m[1].slice(0, 3).toLowerCase()] != null) return mk(+m[3], MON[m[1].slice(0, 3).toLowerCase()], +m[2]);
    const t = Date.parse(s);
    return isNaN(t) ? null : new Date(t);
  };

  U.startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  U.addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  U.addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
  U.today = () => U.startOfDay(new Date());
  U.daysBetween = (a, b) => Math.round((U.startOfDay(b) - U.startOfDay(a)) / 86400000);
  const pad = (n) => String(n).padStart(2, "0");
  U.monthKey = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1);
  U.dayKey = (d) => U.monthKey(d) + "-" + pad(d.getDate());
  U.keyToDate = (k) => { const p = k.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2] || 1); };

  /* ---------- periods ---------- */
  U.PERIODS = [
    { key: "this_month", label: "This month" },
    { key: "last_30", label: "Last 30 days" },
    { key: "last_90", label: "Last 90 days" },
    { key: "this_quarter", label: "This quarter" },
    { key: "this_fy", label: "This financial year" },
    { key: "last_12m", label: "Last 12 months" },
    { key: "all", label: "All time" }
  ];
  U.periodRange = function (key, now) {
    now = now || new Date();
    const t = U.startOfDay(now);
    const end = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59, 999);
    const fy0 = (cfg().fiscalYearStartMonth || 4) - 1;
    let from = null;
    if (key === "this_month") from = new Date(t.getFullYear(), t.getMonth(), 1);
    else if (key === "last_30") from = U.addDays(t, -29);
    else if (key === "last_90") from = U.addDays(t, -89);
    else if (key === "last_12m") from = U.addMonths(t, -11);
    else if (key === "this_quarter") {
      const offset = (t.getMonth() - fy0 + 12) % 12;
      from = new Date(t.getFullYear(), t.getMonth() - (offset % 3), 1);
    } else if (key === "this_fy") {
      const y = t.getMonth() >= fy0 ? t.getFullYear() : t.getFullYear() - 1;
      from = new Date(y, fy0, 1);
    }
    const p = U.PERIODS.find((x) => x.key === key) || U.PERIODS[0];
    return { key: p.key, label: p.label, from, to: end };
  };
  U.inRange = (d, r) => !!d && (!r.from || d >= r.from) && d <= r.to;

  /* ---------- formatting ---------- */
  const nfCache = {};
  function nf(opts) {
    const k = JSON.stringify(opts);
    return nfCache[k] || (nfCache[k] = new Intl.NumberFormat(cfg().locale || "en-IN", opts));
  }
  U.fmtNum = (n, digits) => (n == null || isNaN(n) ? "—" : nf({ maximumFractionDigits: digits == null ? (Math.abs(n) < 10 && n % 1 ? 1 : 0) : digits }).format(n));
  U.fmtCompact = (n) => (n == null || isNaN(n) ? "—" : Math.abs(n) < 100000 ? U.fmtNum(n) : nf({ notation: "compact", maximumFractionDigits: 1 }).format(n));
  U.fmtMoney = function (n, compact) {
    if (n == null || isNaN(n)) return "—";
    const big = Math.abs(n) >= 100000;
    // whole rupees show no paise; small non-whole amounts keep two decimals
    const digits = compact && big ? 1 : compact || Math.abs(n) >= 1000 || Number.isInteger(n) ? 0 : 2;
    return nf({ style: "currency", currency: cfg().currency || "INR", notation: compact && big ? "compact" : "standard", minimumFractionDigits: digits === 2 ? 2 : 0, maximumFractionDigits: digits }).format(n);
  };
  U.fmtPct = (n) => (n == null || isNaN(n) ? "—" : nf({ maximumFractionDigits: n < 10 && n % 1 ? 1 : 0 }).format(n) + "%");
  U.fmtDate = (d) => (d ? d.toLocaleDateString(cfg().locale || "en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
  U.fmtShort = (d) => (d ? d.toLocaleDateString(cfg().locale || "en-IN", { day: "numeric", month: "short" }) : "—");
  U.fmtTime = (d) => (d ? d.toLocaleTimeString(cfg().locale || "en-IN", { hour: "numeric", minute: "2-digit" }) : "");
  U.monthLabel = (key, withYear) => U.keyToDate(key).toLocaleDateString(cfg().locale || "en-IN", withYear ? { month: "short", year: "numeric" } : { month: "short" });
  U.plural = (n, one, many) => U.fmtNum(n) + " " + (n === 1 ? one : many || (/[^aeiou]y$/i.test(one) ? one.slice(0, -1) + "ies" : one + "s"));
  U.initials = (name) => String(name || "?").split(/[\s._@-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

  /* ---------- aggregation ---------- */
  U.sum = (rows, f) => rows.reduce((s, r) => s + (f(r) || 0), 0);
  U.group = function (rows, keyFn, valFn) {
    const m = new Map();
    for (const r of rows) {
      const k = keyFn(r) || "Unspecified";
      let e = m.get(k);
      if (!e) m.set(k, (e = { key: k, value: 0, count: 0, rows: [] }));
      e.value += valFn ? valFn(r) || 0 : 1;
      e.count++;
      e.rows.push(r);
    }
    return [...m.values()].sort((a, b) => b.value - a.value);
  };
  U.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.list = (v) => (Array.isArray(v) ? v : [v]).filter(Boolean); // a report setting may be one name or a fallback list

  /* ---------- DOM builder (strings become text nodes — never HTML) ---------- */
  function append(el, kids) {
    for (const k of kids) {
      if (k == null || k === false || k === "") continue;
      if (Array.isArray(k)) append(el, k);
      else if (k instanceof Node) el.appendChild(k);
      else el.appendChild(document.createTextNode(String(k)));
    }
  }
  C.h = function (tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
        else if (k === "dataset") Object.assign(el.dataset, v);
        else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    append(el, kids);
    return el;
  };
  C.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  /* ---------- icons (static, trusted SVG markup — 24px grid, stroke style) ---------- */
  const I = {
    sparkles: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.13a.5.5 0 0 1 .96 0l1.58 6.13a2 2 0 0 0 1.44 1.44l6.13 1.58a.5.5 0 0 1 0 .96l-6.13 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0z"/><path d="M20 3v4M22 5h-4M4 17v2M5 18H3"/>',
    coffee: '<path d="M10 2v2M14 2v2M6 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/>',
    pen: '<path d="M12 20h9"/><path d="M16.38 3.62a1 1 0 0 1 3 3L7.37 18.64a2 2 0 0 1-.86.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.85z"/>',
    package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    send: '<path d="M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.63l-19 6.5a.5.5 0 0 0-.02.93l7.93 3.18a2 2 0 0 1 1.11 1.11z"/><path d="m21.85 2.15-10.94 10.94"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    trend: '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
    clipboard: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
    layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65M22 12.65l-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    updown: '<path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M2 14h4M10 8h4M18 16h4"/>',
    book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    warehouse: '<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12M6 14h12"/><rect width="12" height="12" x="6" y="10"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    calendar: '<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    external: '<path d="M15 3h6v6M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    xCircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.22-8.56"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    pin: '<path d="M20 10c0 5-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
    building: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    grid: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    chevLeft: '<path d="m15 18-6-6 6-6"/>',
    chevRight: '<path d="m9 18 6-6-6-6"/>',
    arrowUp: '<path d="m5 12 7-7 7 7M12 19V5"/>',
    arrowDown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    minus: '<path d="M5 12h14"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    hourglass: '<path d="M5 22h14M5 2h14"/><path d="M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>',
    award: '<path d="m15.48 12.89 1.51 8.53a.5.5 0 0 1-.81.47l-3.58-2.69a1 1 0 0 0-1.2 0l-3.59 2.69a.5.5 0 0 1-.81-.47l1.51-8.53"/><circle cx="12" cy="8" r="6"/>',
    kanban: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    rupee: '<path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3"/><path d="M9 13c6.67 0 6.67-10 0-10"/>',
    filePlus: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M9 15h6M12 18v-6"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    tag: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1"/>',
    bell: '<path d="M10.27 21a2 2 0 0 0 3.46 0"/><path d="M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'
  };
  C.icon = function (name, cls) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("class", "i" + (cls ? " " + cls : ""));
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = I[name] || I.package;
    return s;
  };
})(window.CIMS = window.CIMS || {});
