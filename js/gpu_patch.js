/**
 * ============================================================================
 * gpu_patch.js — Compatibilidad de trazos en Canvas 2D (Skia/WebRender, Linux)
 * ============================================================================
 * Algunas GPUs/drivers descartan ctx.stroke() / ctx.strokeRect() sólidos.
 * Se detecta en tiempo de ejecución y se aplica la estrategia más ligera que funcione:
 *   0) trazo nativo (no se parchea nada)
 *   1) dash continuo imperceptible
 *   2) trazo emulado con rellenos (fill), que siempre se rasterizan
 */
(function () {
  if (typeof CanvasRenderingContext2D === "undefined" || typeof document === "undefined") return;
  const proto = CanvasRenderingContext2D.prototype;
  if (proto._gpuStrokePatched) return;

  const origStroke = proto.stroke;
  const origStrokeRect = proto.strokeRect;

  // Prueba: ¿se ve un trazo horizontal de 4px en un canvas de 16x16?
  function strokeVisible(mode) {
    try {
      const c = document.createElement("canvas");
      c.width = 16; c.height = 16;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.strokeStyle = "#000";
      g.lineWidth = 4;
      if (mode === "dash") g.setLineDash([100000, 0.001]);
      g.beginPath();
      g.moveTo(1, 8);
      g.lineTo(15, 8);
      origStroke.call(g);
      const d = g.getImageData(8, 8, 1, 1).data;
      return d[3] > 40;
    } catch (e) {
      return false;
    }
  }

  let strategy = "native";
  const forced = /[?&]stroke=(native|dash|fill)/.exec(typeof location !== "undefined" ? location.search : "");
  const isFirefox = typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);
  if (forced) {
    strategy = forced[1];
  } else if (!strokeVisible("native")) {
    strategy = strokeVisible("dash") ? "dash" : "fill";
  }
  proto._gpuStrokePatched = true;
  proto._gpuStrokeStrategy = strategy;
  if (typeof console !== "undefined") console.info("[gpu_patch] estrategia de trazo:", strategy);
  if (strategy === "native") return;

  if (strategy === "dash") {
    proto.stroke = function () {
      if (this.getLineDash().length === 0) {
        this.save();
        this.setLineDash([100000, 0.001]);
        const r = origStroke.apply(this, arguments);
        this.restore();
        return r;
      }
      return origStroke.apply(this, arguments);
    };
    proto.strokeRect = function () {
      if (this.getLineDash().length === 0) {
        this.save();
        this.setLineDash([100000, 0.001]);
        const r = origStrokeRect.apply(this, arguments);
        this.restore();
        return r;
      }
      return origStrokeRect.apply(this, arguments);
    };
    return;
  }

  // ---------- Estrategia "fill": seguimiento de la ruta y trazo emulado ----------
  const origBegin = proto.beginPath;
  const origMove = proto.moveTo;
  const origLine = proto.lineTo;
  const origArc = proto.arc;
  const origRect = proto.rect;
  const origClose = proto.closePath;
  const origRound = proto.roundRect;
  const origQuad = proto.quadraticCurveTo;
  const origBez = proto.bezierCurveTo;
  const origEllipse = proto.ellipse;

  function P(ctx) {
    if (!ctx._pp) ctx._pp = { subs: [], cur: null };
    return ctx._pp;
  }
  function startSub(pp, x, y) {
    pp.cur = { pts: [[x, y]], closed: false };
    pp.subs.push(pp.cur);
  }
  function addPt(pp, x, y) {
    if (!pp.cur) startSub(pp, x, y);
    else pp.cur.pts.push([x, y]);
  }

  proto.beginPath = function () {
    this._pp = { subs: [], cur: null };
    return origBegin.call(this);
  };
  proto.moveTo = function (x, y) {
    startSub(P(this), x, y);
    return origMove.call(this, x, y);
  };
  proto.lineTo = function (x, y) {
    addPt(P(this), x, y);
    return origLine.call(this, x, y);
  };
  proto.closePath = function () {
    const pp = P(this);
    if (pp.cur) {
      pp.cur.closed = true;
      const f = pp.cur.pts[0];
      pp.cur = { pts: [[f[0], f[1]]], closed: false };
      pp.subs.push(pp.cur);
    }
    return origClose.call(this);
  };
  proto.arc = function (x, y, r, a0, a1, ccw) {
    const pp = P(this);
    let d = a1 - a0;
    const TAU = Math.PI * 2;
    if (!ccw) {
      if (d >= TAU) d = TAU; else if (d < 0) d = ((d % TAU) + TAU) % TAU;
    } else {
      if (d <= -TAU) d = -TAU; else if (d > 0) d = -(((-d) % TAU + TAU) % TAU);
    }
    const n = Math.max(6, Math.ceil(Math.abs(d) / 0.12));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (d * i) / n;
      addPt(pp, x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    return origArc.call(this, x, y, r, a0, a1, ccw);
  };
  proto.ellipse = function (x, y, rx, ry, rot, a0, a1, ccw) {
    const pp = P(this);
    let d = a1 - a0;
    const TAU = Math.PI * 2;
    if (!ccw) { if (d >= TAU) d = TAU; else if (d < 0) d = ((d % TAU) + TAU) % TAU; }
    else { if (d <= -TAU) d = -TAU; else if (d > 0) d = -(((-d) % TAU + TAU) % TAU); }
    const n = Math.max(8, Math.ceil(Math.abs(d) / 0.12));
    const cr = Math.cos(rot), sr = Math.sin(rot);
    for (let i = 0; i <= n; i++) {
      const a = a0 + (d * i) / n;
      const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
      addPt(pp, x + ex * cr - ey * sr, y + ex * sr + ey * cr);
    }
    return origEllipse.apply(this, arguments);
  };
  proto.rect = function (x, y, w, h) {
    const pp = P(this);
    startSub(pp, x, y);
    pp.cur.pts.push([x + w, y], [x + w, y + h], [x, y + h]);
    pp.cur.closed = true;
    pp.cur = null;
    return origRect.call(this, x, y, w, h);
  };
  if (origRound) {
    proto.roundRect = function (x, y, w, h) {
      const pp = P(this);
      startSub(pp, x, y);
      pp.cur.pts.push([x + w, y], [x + w, y + h], [x, y + h]);
      pp.cur.closed = true;
      pp.cur = null;
      return origRound.apply(this, arguments);
    };
  }
  proto.quadraticCurveTo = function (cx, cy, x, y) {
    const pp = P(this);
    const s = pp.cur ? pp.cur.pts[pp.cur.pts.length - 1] : [cx, cy];
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, u = 1 - t;
      addPt(pp, u * u * s[0] + 2 * u * t * cx + t * t * x, u * u * s[1] + 2 * u * t * cy + t * t * y);
    }
    return origQuad.call(this, cx, cy, x, y);
  };
  proto.bezierCurveTo = function (c1x, c1y, c2x, c2y, x, y) {
    const pp = P(this);
    const s = pp.cur ? pp.cur.pts[pp.cur.pts.length - 1] : [c1x, c1y];
    for (let i = 1; i <= 16; i++) {
      const t = i / 16, u = 1 - t;
      addPt(
        pp,
        u * u * u * s[0] + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x,
        u * u * u * s[1] + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y
      );
    }
    return origBez.apply(this, arguments);
  };

  // Emula el trazo con rellenos usando la ruta normal del contexto (sin Path2D).
  // Los cuadriláteros y las circunferencias comparten orientación para que "nonzero" no deje huecos.
  function fillStrokeGeometry(ctx, subs, lw) {
    const h = lw / 2;
    origBegin.call(ctx);
    for (const sub of subs) {
      const pts = sub.pts;
      const n = pts.length;
      if (n < 2 && !sub.closed) continue;
      const segs = sub.closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) continue;
        const nx = (-dy / len) * h, ny = (dx / len) * h;
        origMove.call(ctx, a[0] + nx, a[1] + ny);
        origLine.call(ctx, b[0] + nx, b[1] + ny);
        origLine.call(ctx, b[0] - nx, b[1] - ny);
        origLine.call(ctx, a[0] - nx, a[1] - ny);
        origClose.call(ctx);
      }
      if (lw > 1.2) {
        for (let i = 0; i < n; i++) {
          origMove.call(ctx, pts[i][0] + h, pts[i][1]);
          origArc.call(ctx, pts[i][0], pts[i][1], h, 0, Math.PI * 2, true);
          origClose.call(ctx);
        }
      }
    }
    ctx.fill();
  }

  // Restaura la ruta original del usuario tras usar la ruta para rellenar
  function replayPath(ctx, subs) {
    origBegin.call(ctx);
    for (const sub of subs) {
      if (!sub.pts.length) continue;
      origMove.call(ctx, sub.pts[0][0], sub.pts[0][1]);
      for (let i = 1; i < sub.pts.length; i++) origLine.call(ctx, sub.pts[i][0], sub.pts[i][1]);
      if (sub.closed) origClose.call(ctx);
    }
  }

  proto.stroke = function () {
    if (this.getLineDash().length > 0) return origStroke.apply(this, arguments);
    const pp = P(this);
    if (!pp.subs.length) return;
    const subs = pp.subs.map((s) => ({ pts: s.pts.slice(), closed: s.closed }));
    this.save();
    this.fillStyle = this.strokeStyle;
    fillStrokeGeometry(this, subs, this.lineWidth);
    this.restore();
    replayPath(this, subs);
  };

  proto.strokeRect = function (x, y, w, h) {
    if (this.getLineDash().length > 0) return origStrokeRect.apply(this, arguments);
    const sub = { pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true };
    const saved = P(this).subs.map((s) => ({ pts: s.pts.slice(), closed: s.closed }));
    this.save();
    this.fillStyle = this.strokeStyle;
    fillStrokeGeometry(this, [sub], this.lineWidth);
    this.restore();
    replayPath(this, saved);
  };
})();
