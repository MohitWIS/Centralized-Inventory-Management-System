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
        if (hgt > 0.5) { col = svg("path", { class: "col", d: colPath(cx - bw / 2, yy, bw, hgt, 4) }); s.appendChild(col); }
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
