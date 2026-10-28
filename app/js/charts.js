/* Lightweight charts (no external library): ranked bars, time columns, 100% stack.
   Thin marks, 4px rounded data-ends, hairline grid, hover + focus tooltips. */
(function (C) {
  "use strict";
  const h = C.h, U = C.util;
  const CH = (C.charts = {});
  const NS = "http://www.w3.org/2000/svg";
  const OTHER = "#b4b2a9";

  function svg(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------- tooltip (one shared element) ---------- */
  let tipEl = null;
  CH.tip = {
    show(evt, title, rows) {
      if (!tipEl) { tipEl = h("div", { class: "tip", role: "tooltip" }); document.body.appendChild(tipEl); }
      C.clear(tipEl);
      if (title) tipEl.appendChild(h("div", { class: "t-title" }, title));
      (rows || []).forEach((r) => tipEl.appendChild(h("div", { class: "t-row" },
        r.color ? h("span", { class: "t-key", style: { background: r.color } }) : null,
        h("span", { class: "t-val" }, r.value), r.label ? h("span", { class: "t-lab" }, r.label) : null)));
      tipEl.classList.add("show");
      let x, y;
      if (evt && evt.clientX != null && evt.type !== "focus") { x = evt.clientX; y = evt.clientY; }
      else { const rc = evt.currentTarget.getBoundingClientRect(); x = rc.left + rc.width / 2; y = rc.top; }
      const w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
      let left = x + 14, top = y - hh - 12;
      if (left + w > window.innerWidth - 8) left = x - w - 14;
      if (top < 8) top = y + 18;
      tipEl.style.left = Math.max(8, left) + "px";
      tipEl.style.top = top + "px";
    },
    hide() { if (tipEl) tipEl.classList.remove("show"); }
  };
  CH.bindTip = function (el, fn) {
    const show = (e) => { const t = fn(); CH.tip.show(e, t.title, t.rows); };
    el.addEventListener("pointermove", show);
    el.addEventListener("pointerleave", CH.tip.hide);
    el.addEventListener("focus", show);
    el.addEventListener("blur", CH.tip.hide);
    el.addEventListener("keydown", (e) => { if (e.key === "Escape") CH.tip.hide(); });
  };

  /* ---------- ranked horizontal bars ---------- */
  // rows: [{label, value, sub?}]  opts: {format, limit, valueLabel, onClick, color}
  CH.bars = function (rows, opts) {
    opts = opts || {};
    const fmt = opts.format || U.fmtNum;
    const limit = opts.limit || 10;
    let list = rows.filter((r) => r.value > 0).slice(0, limit);
    const rest = rows.filter((r) => r.value > 0).slice(limit);
    if (rest.length) list = list.concat([{ label: "Other (" + rest.length + ")", value: U.sum(rest, (r) => r.value), other: true }]);
    if (!list.length) return null;
    const max = Math.max.apply(null, list.map((r) => r.value)) || 1;
    return h("div", { class: "bars", role: "list" }, list.map((r) => {
      const pct = (r.value / max) * 100;
      const row = h("div", { class: "bar-row", role: "listitem", tabindex: "0" },
        h("div", { class: "bar-label", title: r.label }, r.label),
        h("div", { class: "bar-track" },
          h("div", { class: "bar-fill", style: { width: "calc(" + pct.toFixed(2) + "% - " + (pct * 0.8).toFixed(1) + "px)", background: r.other ? OTHER : opts.color || "" } }),
          h("span", { class: "bar-value" }, fmt(r.value))));
      CH.bindTip(row, () => ({ title: r.label, rows: [{ value: fmt(r.value), label: opts.valueLabel || "" }].concat(r.sub ? [{ value: "", label: r.sub }] : []) }));
      if (opts.onClick && !r.other) { row.style.cursor = "pointer"; row.addEventListener("click", () => opts.onClick(r)); }
      return row;
    }));
  };

  /* ---------- time columns (SVG, redrawn on resize) ---------- */
  function niceTicks(max, count) {
    if (!(max > 0)) return [0, 1];
    const raw = max / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    let step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
    if (step < 1 && max >= 1) step = 1;
    const out = [];
    for (let v = 0; v < max + step * 0.999; v += step) out.push(+v.toFixed(6));
    if (out[out.length - 1] < max) out.push(+(out[out.length - 1] + step).toFixed(6));
    return out;
  }
  function colPath(x, y, w, hgt, r) {
    r = Math.min(r, w / 2, hgt);
    return "M" + x + "," + (y + hgt) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (y + hgt) + "Z";
  }
  // points: [{label, full?, value}]  opts: {format, tickFormat, height, valueLabel, label}
  CH.columns = function (points, opts) {
    opts = opts || {};
    const fmt = opts.format || U.fmtNum;
    const tickFmt = opts.tickFormat || U.fmtCompact;
    const H0 = opts.height || 230;
    // min-height, and grows to fill its card when the card is stretched by the grid row
    const box = h("div", { class: "chart-box", style: { minHeight: H0 + "px" } });
    let lastW = 0, lastH = 0;
    function draw() {
      const W = Math.round(box.clientWidth);
      const H = Math.max(H0, Math.round(box.clientHeight));
      if (!W || (W === lastW && H === lastH)) return;
      lastW = W;
      lastH = H;
      C.clear(box);
      const maxV = Math.max(0, ...points.map((p) => p.value));
      const ticks = niceTicks(maxV, 4);
      const top = ticks[ticks.length - 1] || 1;
      const tickW = Math.max(...ticks.map((t) => tickFmt(t).length)) * 6.6 + 12;
      const padL = Math.max(34, tickW), padR = 6, padT = 22, padB = 26;
      const iw = W - padL - padR, ih = H - padT - padB;
      const y = (v) => padT + ih - (v / top) * ih;
      const band = iw / Math.max(points.length, 1);
      const bw = Math.max(3, Math.min(24, band * 0.6));
      const s = svg("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": opts.label || "Column chart" });
      // vertical gradient in the page colour (stop colours come from css .g-top / .g-bot)
      const gid = "cg" + Math.random().toString(36).slice(2, 8);
      const grad = svg("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
      grad.appendChild(svg("stop", { offset: "0", class: "g-top" }));
      grad.appendChild(svg("stop", { offset: "1", class: "g-bot" }));
      const defs = svg("defs", {}); defs.appendChild(grad); s.appendChild(defs);
      ticks.forEach((t) => {
        const yy = Math.round(y(t)) + 0.5;
        s.appendChild(svg("line", { class: t === 0 ? "baseline" : "gridline", x1: padL, x2: W - padR, y1: yy, y2: yy }));
        s.appendChild(svg("text", { class: "tick", x: padL - 8, y: yy + 4, "text-anchor": "end" }, tickFmt(t)));
      });
      const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(iw / 46))));
      let maxI = -1;
      points.forEach((p, i) => { if (p.value > 0 && (maxI < 0 || p.value > points[maxI].value)) maxI = i; });
      const labelled = new Set([maxI, points.length - 1]);
      points.forEach((p, i) => {
        const cx = padL + band * i + band / 2;
        const v = Math.max(0, p.value);
        const yy = y(v), hgt = padT + ih - yy;
        let col = null;
        if (hgt > 0.5) { col = svg("path", { class: "col", fill: "url(#" + gid + ")", d: colPath(cx - bw / 2, yy, bw, hgt, 4) }); s.appendChild(col); }
        if (i % every === 0 || (i === points.length - 1 && (points.length - 1) % every > every / 2)) {
          s.appendChild(svg("text", { class: "tick", x: cx, y: H - 8, "text-anchor": "middle" }, p.label));
        }
        if (labelled.has(i) && v > 0) s.appendChild(svg("text", { class: "cap", x: cx, y: yy - 7, "text-anchor": "middle" }, tickFmt(v)));
        const hit = svg("rect", { class: "hit", x: padL + band * i, y: padT, width: band, height: ih, tabindex: "0" });
        const show = (e) => { if (col) col.classList.add("on"); CH.tip.show(e, p.full || p.label, [{ value: fmt(p.value), label: opts.valueLabel || "" }].concat(p.sub ? [{ value: "", label: p.sub }] : [])); };
        const hide = () => { if (col) col.classList.remove("on"); CH.tip.hide(); };
        hit.addEventListener("pointermove", show);
        hit.addEventListener("pointerleave", hide);
        hit.addEventListener("focus", show);
        hit.addEventListener("blur", hide);
        s.appendChild(hit);
      });
      box.appendChild(s);
    }
    if (window.ResizeObserver) new ResizeObserver(draw).observe(box);
    else setTimeout(draw, 0);
    return box;
  };

  /* ---------- stacked columns: one column per day, one segment per series ---------- */
  // points: [{label, full, values: {<series id>: n}}]  series: [{id, label, color}] in stacking order
  CH.stackedColumns = function (points, series, opts) {
    opts = opts || {};
    const H0 = opts.height || 220;
    const tot = (p) => series.reduce((s, x) => s + (p.values[x.id] || 0), 0);
    if (!points.some((p) => tot(p) > 0)) return null;
    const box = h("div", { class: "chart-box", style: { minHeight: H0 + "px" } });
    let lastW = 0, lastH = 0;
    function draw() {
      const W = Math.round(box.clientWidth), H = Math.max(H0, Math.round(box.clientHeight));
      if (!W || (W === lastW && H === lastH)) return;
      lastW = W; lastH = H;
      C.clear(box);
      const ticks = niceTicks(Math.max(...points.map(tot)), 4), top = ticks[ticks.length - 1] || 1;
      const padL = Math.max(28, Math.max(...ticks.map((t) => U.fmtCompact(t).length)) * 6.6 + 12), padR = 6, padT = 12, padB = 26;
      const iw = W - padL - padR, ih = H - padT - padB, y = (v) => padT + ih - (v / top) * ih;
      const band = iw / points.length, bw = Math.max(4, Math.min(24, band * 0.62));
      const s = svg("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": opts.label || "Stacked column chart" });
      ticks.forEach((t) => {
        const yy = Math.round(y(t)) + 0.5;
        s.appendChild(svg("line", { class: t === 0 ? "baseline" : "gridline", x1: padL, x2: W - padR, y1: yy, y2: yy }));
        s.appendChild(svg("text", { class: "tick", x: padL - 8, y: yy + 4, "text-anchor": "end" }, U.fmtCompact(t)));
      });
      const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(iw / 46))));
      points.forEach((p, i) => {
        const x = padL + band * i + (band - bw) / 2;
        const segs = series.filter((sr) => p.values[sr.id] > 0);
        let base = 0;
        segs.forEach((sr, j) => {
          const v = p.values[sr.id], y0 = y(base), y1 = y(base + v);
          const hgt = y0 - y1 - (j > 0 ? 2 : 0); // 2px surface gap between segments
          base += v;
          if (hgt <= 0.3) return;
          s.appendChild(j === segs.length - 1
            ? svg("path", { d: colPath(x, y1, bw, hgt, 3), fill: sr.color })
            : svg("rect", { x: x, y: y1, width: bw, height: hgt, fill: sr.color }));
        });
        // every n-th day, plus the last day when it isn't crowding the previous label
        if (i % every === 0 || (i === points.length - 1 && i % every > every / 2)) s.appendChild(svg("text", { class: "tick", x: x + bw / 2, y: H - 8, "text-anchor": "middle" }, p.label));
        const hit = svg("rect", { class: "hit", x: padL + band * i, y: padT, width: band, height: ih, tabindex: "0" });
        const show = (e) => CH.tip.show(e, p.full || p.label, segs.map((sr) => ({ value: U.fmtNum(p.values[sr.id]), label: sr.label, color: sr.color }))
          .concat([{ value: U.fmtNum(tot(p)), label: tot(p) ? "in total" : "no requests" }]));
        hit.addEventListener("pointermove", show);
        hit.addEventListener("pointerleave", CH.tip.hide);
        hit.addEventListener("focus", show);
        hit.addEventListener("blur", CH.tip.hide);
        s.appendChild(hit);
      });
      box.appendChild(s);
    }
    if (window.ResizeObserver) new ResizeObserver(draw).observe(box);
    else setTimeout(draw, 0);
    const legend = h("div", { class: "legend" }, series.map((sr) => {
      const n = points.reduce((a, p) => a + (p.values[sr.id] || 0), 0);
      return n ? h("span", { class: "key" }, h("span", { class: "sw", style: { background: sr.color } }), sr.label, h("b", null, U.fmtNum(n))) : null;
    }));
    return h("div", { class: "chart-stack" }, box, legend);
  };

  /* ---------- 100% stacked bar + legend ---------- */
  // segs: [{label, value, color}]
  CH.stack = function (segs, opts) {
    opts = opts || {};
    const fmt = opts.format || U.fmtNum;
    const total = U.sum(segs, (s) => s.value);
    if (!total) return null;
    const bar = h("div", { class: "stackbar", role: "img", "aria-label": segs.map((s) => s.label + " " + fmt(s.value)).join(", ") });
    segs.filter((s) => s.value > 0).forEach((s) => {
      const el = h("span", { tabindex: "0", style: { flex: s.value + " 1 0", background: s.color } });
      CH.bindTip(el, () => ({ title: s.label, rows: [{ value: fmt(s.value), label: U.fmtPct((s.value / total) * 100) + " of total", color: s.color }] }));
      if (opts.onClick) { el.style.cursor = "pointer"; el.addEventListener("click", () => opts.onClick(s)); }
      bar.appendChild(el);
    });
    const legend = h("div", { class: "legend" }, segs.map((s) =>
      h("span", { class: "key" }, h("span", { class: "sw", style: { background: s.color } }), s.label, h("b", null, fmt(s.value)))));
    return h("div", null, bar, legend);
  };
})(window.CIMS = window.CIMS || {});
