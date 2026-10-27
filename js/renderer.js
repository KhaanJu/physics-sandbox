/**
 * ============================================================================
 * renderer.js — Renderizado esquemático vectorial tipo Engineering Schematic
 * ============================================================================
 */

import { Vector2D } from "./vector.js";

import "./gpu_patch.js";

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    // willReadFrequently fuerza un canvas por software: evita fallos de rasterizado por GPU en Firefox/Linux
    this.ctx = canvas.getContext("2d", { willReadFrequently: true });
    this.dpr = (typeof window !== "undefined" && window.devicePixelRatio) ? window.devicePixelRatio : 1;

    // Hoja técnica finita de dibujo (1400 x 900 mm)
    this.sheet = {
      width: 1400,
      height: 900,
      padding: 20
    };

    // Cámara 2D acotada para navegar cómodamente sin demorarse
    this.camera = {
      x: 0,
      y: 0,
      zoom: 1.0,
      minZoom: 0.45,
      maxZoom: 2.5
    };

    this.gridSpacing = 25;
    this.majorGridSpacing = 100;
    this.strokeColor = "#111111";
    this.accentDeleteColor = "#d32f2f";

    this.resize();
    if (typeof window !== "undefined") {
      window.addEventListener("resize", () => {
        this.resize();
        this.clampCamera();
      });

      if (typeof ResizeObserver !== "undefined") {
        this.resizeObserver = new ResizeObserver(() => {
          this.checkResize();
        });
        this.resizeObserver.observe(this.canvas);
      }
    }
  }

  screenToWorld(screenX, screenY) {
    this.validateCamera();
    return new Vector2D(
      (screenX - this.camera.x) / this.camera.zoom,
      (screenY - this.camera.y) / this.camera.zoom
    );
  }

  worldToScreen(worldX, worldY) {
    this.validateCamera();
    return new Vector2D(
      worldX * this.camera.zoom + this.camera.x,
      worldY * this.camera.zoom + this.camera.y
    );
  }

  validateCamera() {
    if (isNaN(this.camera.zoom) || !isFinite(this.camera.zoom) || this.camera.zoom <= 0.1) {
      this.camera.zoom = 1.0;
    }
    if (isNaN(this.camera.x) || !isFinite(this.camera.x) || isNaN(this.camera.y) || !isFinite(this.camera.y)) {
      this.resetView();
    }
    if (isNaN(this.camera.x) || !isFinite(this.camera.x)) this.camera.x = 0;
    if (isNaN(this.camera.y) || !isFinite(this.camera.y)) this.camera.y = 0;
  }

  /**
   * Limita la cámara para que la hoja finita nunca se pierda en el vacío
   */
  clampCamera() {
    this.validateCamera();
    const zoom = this.camera.zoom;
    const w = this.width > 0 ? this.width : (typeof window !== "undefined" ? window.innerWidth : 1280);
    const h = this.height > 0 ? this.height : (typeof window !== "undefined" ? window.innerHeight : 800);

    const marginX = Math.min(260, w * 0.35);
    const marginY = Math.min(200, h * 0.35);

    const minX = -(this.sheet.width * zoom - marginX);
    const maxX = w - marginX;
    const minY = -(this.sheet.height * zoom - marginY);
    const maxY = h - marginY;

    if (minX <= maxX) {
      this.camera.x = Math.max(minX, Math.min(maxX, isNaN(this.camera.x) ? 0 : this.camera.x));
    }
    if (minY <= maxY) {
      this.camera.y = Math.max(minY, Math.min(maxY, isNaN(this.camera.y) ? 0 : this.camera.y));
    }
  }

  zoomAt(screenX, screenY, factor) {
    this.validateCamera();
    const worldBefore = this.screenToWorld(screenX, screenY);
    const newZoom = Math.min(this.camera.maxZoom, Math.max(this.camera.minZoom, this.camera.zoom * factor));
    this.camera.zoom = newZoom;
    this.camera.x = screenX - worldBefore.x * newZoom;
    this.camera.y = screenY - worldBefore.y * newZoom;
    this.clampCamera();
  }

  resetView() {
    const w = this.width > 0 ? this.width : (typeof window !== "undefined" ? window.innerWidth : 1280);
    const h = this.height > 0 ? this.height : (typeof window !== "undefined" ? window.innerHeight : 800);
    const fitZoom = Math.min(
      1.0,
      Math.min(
        (w - 60) / this.sheet.width,
        (h - 60) / this.sheet.height
      )
    );
    this.camera.zoom = Math.max(this.camera.minZoom, Number(fitZoom.toFixed(2)));
    this.camera.x = Math.round((w - this.sheet.width * this.camera.zoom) / 2);
    this.camera.y = Math.round((h - this.sheet.height * this.camera.zoom) / 2);
    this.clampCamera();
  }

  resize() {
    this.dpr = (typeof window !== "undefined" && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : (typeof window !== "undefined" ? window.innerWidth : 1280);
    const h = rect.height > 0 ? rect.height : (typeof window !== "undefined" ? window.innerHeight : 800);

    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);

    if (this.ctx) {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(this.dpr, this.dpr);
    }
    this.width = w;
    this.height = h;
  }

  checkResize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : (typeof window !== "undefined" ? window.innerWidth : 1280);
    const h = rect.height > 0 ? rect.height : (typeof window !== "undefined" ? window.innerHeight : 800);
    const targetW = Math.floor(w * this.dpr);
    const targetH = Math.floor(h * this.dpr);

    if (this.canvas.width !== targetW || this.canvas.height !== targetH || this.width <= 0 || this.height <= 0) {
      this.resize();
      this.resetView();
    }
  }

  clear() {
    // Fondo de tablero / mesa técnica fuera de la hoja
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = "#ebebe7";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /**
   * Renderiza la hoja técnica finita de trabajo con cuadrícula milimetrada y márgenes
   */
  drawSheet(referenceFrame = null) {
    const ctx = this.ctx;
    const sheet = this.sheet;
    const zoom = this.camera.zoom;

    ctx.save();

    // 1. Sombra lineal proyectada de la hoja sobre la mesa de dibujo
    ctx.fillStyle = "rgba(17, 17, 17, 0.09)";
    ctx.fillRect(8, 8, sheet.width, sheet.height);

    // 2. Fondo blanco puro de la hoja de dibujo técnico
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sheet.width, sheet.height);

    // 3. Cuadrícula métrica técnica referenciada al origen de coordenadas
    const showGrid = referenceFrame ? referenceFrame.showGrid : true;
    if (showGrid) {
      const origX = referenceFrame ? referenceFrame.origin.x : this.majorGridSpacing;
      const origY = referenceFrame ? referenceFrame.origin.y : this.majorGridSpacing;
      const ppm = referenceFrame ? referenceFrame.pixelsPerMeter : this.majorGridSpacing;
      const majorStep = ppm; // 1.0 metro
      const minorStep = ppm >= 80 ? ppm / 4 : ppm / 2; // 0.25m o 0.5m

      // Líneas secundarias de cuadrícula
      if (zoom >= 0.45) {
        ctx.lineWidth = 0.5 / zoom;
        ctx.strokeStyle = "rgba(17, 17, 17, 0.05)";
        ctx.beginPath();
        for (let x = origX + minorStep; x < sheet.width; x += minorStep) {
          ctx.moveTo(x, 0); ctx.lineTo(x, sheet.height);
        }
        for (let x = origX - minorStep; x > 0; x -= minorStep) {
          ctx.moveTo(x, 0); ctx.lineTo(x, sheet.height);
        }
        for (let y = origY + minorStep; y < sheet.height; y += minorStep) {
          ctx.moveTo(0, y); ctx.lineTo(sheet.width, y);
        }
        for (let y = origY - minorStep; y > 0; y -= minorStep) {
          ctx.moveTo(0, y); ctx.lineTo(sheet.width, y);
        }
        ctx.stroke();
      }

      // Líneas principales de cuadrícula (cada 1.0 m)
      ctx.lineWidth = 1.0 / zoom;
      ctx.strokeStyle = "rgba(17, 17, 17, 0.12)";
      ctx.beginPath();
      for (let x = origX + majorStep; x < sheet.width; x += majorStep) {
        ctx.moveTo(x, 0); ctx.lineTo(x, sheet.height);
      }
      for (let x = origX - majorStep; x > 0; x -= majorStep) {
        ctx.moveTo(x, 0); ctx.lineTo(x, sheet.height);
      }
      for (let y = origY + majorStep; y < sheet.height; y += majorStep) {
        ctx.moveTo(0, y); ctx.lineTo(sheet.width, y);
      }
      for (let y = origY - majorStep; y > 0; y -= majorStep) {
        ctx.moveTo(0, y); ctx.lineTo(sheet.width, y);
      }
      ctx.stroke();
    }

    // 4. Margen interior técnico de dibujo (recuadro interior)
    const pad = sheet.padding;
    ctx.lineWidth = 1.0 / zoom;
    ctx.strokeStyle = "rgba(17, 17, 17, 0.3)";
    ctx.strokeRect(pad, pad, sheet.width - 2 * pad, sheet.height - 2 * pad);

    // 5. Borde exterior de la hoja finita
    ctx.lineWidth = 2.0 / zoom;
    ctx.strokeStyle = this.strokeColor;
    ctx.strokeRect(0, 0, sheet.width, sheet.height);

    // 6. Rótulo de formato técnico en la esquina inferior derecha
    ctx.font = `bold ${Math.max(8, 9 / zoom)}px monospace`;
    ctx.fillStyle = "rgba(17, 17, 17, 0.45)";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(`HOJA FINITA: ${sheet.width} × ${sheet.height} mm`, sheet.width - pad - 6, sheet.height - pad - 5);

    ctx.restore();
  }

  /**
   * Renderiza el Sistema de Referencia Global:
   * Ejes Cartesianos graduados (+X, +Y), Origen (0,0) interactivo y Nivel Cero de Ep Gravitatoria (Datum)
   */
  drawReferenceFrame(referenceFrame, inputState = {}) {
    if (!referenceFrame) return;

    const ctx = this.ctx;
    const sheet = this.sheet;
    const zoom = this.camera.zoom;
    const ox = referenceFrame.origin.x;
    const oy = referenceFrame.origin.y;
    const ppm = referenceFrame.pixelsPerMeter;

    ctx.save();

    // 1. Nivel Cero de Energía Potencial Gravitatoria (Datum line)
    if (referenceFrame.showPotentialZero) {
      const zy = referenceFrame.potentialZeroY;
      const isHovered = referenceFrame.isHoveredDatum;
      const isDragging = referenceFrame.isDraggingDatum;

      // Resaltado magnético si está imantado a un punto clave
      if (referenceFrame.isSnappedDatum) {
        ctx.save();
        ctx.lineWidth = 5.0 / zoom;
        ctx.strokeStyle = "rgba(46, 125, 50, 0.4)";
        ctx.beginPath();
        ctx.moveTo(sheet.padding, zy);
        ctx.lineTo(sheet.width - sheet.padding, zy);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.lineWidth = (isHovered || isDragging) ? 2.4 / zoom : 1.5 / zoom;
      ctx.strokeStyle = referenceFrame.isSnappedDatum ? "#1b5e20" : (isDragging ? "#2e7d32" : (isHovered ? "#2e7d32" : "#388e3c"));
      ctx.setLineDash([8 / zoom, 5 / zoom]);

      ctx.beginPath();
      ctx.moveTo(sheet.padding, zy);
      ctx.lineTo(sheet.width - sheet.padding, zy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Rótulo técnico del datum con retroalimentación de imantación
      const yPhys = referenceFrame.getPotentialZeroPhysical();
      const safeY = Math.abs(yPhys) < 0.005 ? 0 : yPhys;
      let badgeText;
      if (referenceFrame.snapLabel) {
        badgeText = referenceFrame.snapLabel;
      } else if (isHovered && !isDragging) {
        badgeText = `Ep = 0 (${safeY >= 0 ? '+' : ''}${safeY.toFixed(2)}m) [Doble clic: Cero]`;
      } else {
        badgeText = `Ep = 0 (Datum: ${safeY >= 0 ? '+' : ''}${safeY.toFixed(2)}m)`;
      }

      const fontSize = Math.max(9, 10 / zoom);
      ctx.font = `bold ${fontSize}px monospace`;
      const textMetrics = ctx.measureText(badgeText);
      const textW = textMetrics.width;
      const badgeH = fontSize + 6 / zoom;
      const badgeX = sheet.width - sheet.padding - textW - 14 / zoom;
      const badgeY = zy - badgeH / 2;

      ctx.fillStyle = referenceFrame.isSnappedDatum ? "#c8e6c9" : ((isHovered || isDragging) ? "#e8f5e9" : "#ffffff");
      ctx.strokeStyle = (referenceFrame.isSnappedDatum || isDragging) ? "#1b5e20" : "#2e7d32";
      ctx.lineWidth = 1.0 / zoom;
      ctx.fillRect(badgeX, badgeY, textW + 10 / zoom, badgeH);
      ctx.strokeRect(badgeX, badgeY, textW + 10 / zoom, badgeH);

      ctx.fillStyle = "#1b5e20";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(badgeText, badgeX + 5 / zoom, zy);

      // Manijas de arrastre en los extremos del datum
      const handleR = (isHovered || isDragging ? 6 : 4.5) / zoom;
      ctx.fillStyle = isDragging ? "#1b5e20" : (isHovered ? "#2e7d32" : "#ffffff");
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      ctx.arc(sheet.padding + 10 / zoom, zy, handleR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(badgeX - 8 / zoom, zy, handleR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }

    // 2. Ejes Cartesianos Graduados (X e Y)
    if (referenceFrame.showAxes) {
      const isHoveredOrig = referenceFrame.isHoveredOrigin;
      const isDraggingOrig = referenceFrame.isDraggingOrigin;

      ctx.save();
      ctx.lineWidth = 1.8 / zoom;
      ctx.strokeStyle = "#1a237e"; // Azul oscuro técnico
      ctx.lineCap = "square";

      // --- EJE X (Horizontal a y = oy) ---
      if (oy >= sheet.padding && oy <= sheet.height - sheet.padding) {
        ctx.beginPath();
        ctx.moveTo(sheet.padding, oy);
        ctx.lineTo(sheet.width - sheet.padding, oy);
        ctx.stroke();

        // Flecha en extremo derecho (+X)
        const arrowSize = 9 / zoom;
        const arrowX = sheet.width - sheet.padding;
        ctx.beginPath();
        ctx.moveTo(arrowX, oy);
        ctx.lineTo(arrowX - arrowSize, oy - arrowSize * 0.45);
        ctx.lineTo(arrowX - arrowSize, oy + arrowSize * 0.45);
        ctx.closePath();
        ctx.fillStyle = "#1a237e";
        ctx.fill();

        // Rótulo de eje "+X (m)"
        ctx.font = `bold ${Math.max(9, 10 / zoom)}px monospace`;
        ctx.fillStyle = "#1a237e";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText("+X (m)", arrowX - 12 / zoom, oy - 4 / zoom);

        // Graduaciones (ticks) y números sobre Eje X
        const tickMajor = 8 / zoom;
        const tickMinor = 4 / zoom;
        const fontSizeTick = Math.max(8, 8.5 / zoom);
        ctx.font = `${fontSizeTick}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        // Graduaciones a la derecha del origen (+X)
        let meterX = 1;
        while (true) {
          const px = ox + meterX * ppm;
          if (px > sheet.width - sheet.padding - 20 / zoom) break;

          ctx.beginPath();
          ctx.moveTo(px, oy - tickMajor);
          ctx.lineTo(px, oy + tickMajor);
          ctx.stroke();

          ctx.fillText(`+${meterX}`, px, oy + tickMajor + 2 / zoom);

          // Submúltiplo a 0.5m
          const halfPx = px - 0.5 * ppm;
          if (halfPx < sheet.width - sheet.padding) {
            ctx.beginPath();
            ctx.moveTo(halfPx, oy - tickMinor);
            ctx.lineTo(halfPx, oy + tickMinor);
            ctx.stroke();
          }

          meterX++;
        }

        // Graduaciones a la izquierda del origen (-X)
        meterX = 1;
        while (true) {
          const px = ox - meterX * ppm;
          if (px < sheet.padding + 10 / zoom) break;

          ctx.beginPath();
          ctx.moveTo(px, oy - tickMajor);
          ctx.lineTo(px, oy + tickMajor);
          ctx.stroke();

          ctx.fillText(`-${meterX}`, px, oy + tickMajor + 2 / zoom);

          const halfPx = px + 0.5 * ppm;
          if (halfPx > sheet.padding) {
            ctx.beginPath();
            ctx.moveTo(halfPx, oy - tickMinor);
            ctx.lineTo(halfPx, oy + tickMinor);
            ctx.stroke();
          }

          meterX++;
        }
      }

      // --- EJE Y (Vertical a x = ox) ---
      if (ox >= sheet.padding && ox <= sheet.width - sheet.padding) {
        ctx.beginPath();
        ctx.moveTo(ox, sheet.height - sheet.padding);
        ctx.lineTo(ox, sheet.padding);
        ctx.stroke();

        // Flecha en extremo superior (+Y)
        const arrowSize = 9 / zoom;
        const arrowY = sheet.padding;
        ctx.beginPath();
        ctx.moveTo(ox, arrowY);
        ctx.lineTo(ox - arrowSize * 0.45, arrowY + arrowSize);
        ctx.lineTo(ox + arrowSize * 0.45, arrowY + arrowSize);
        ctx.closePath();
        ctx.fillStyle = "#1a237e";
        ctx.fill();

        // Rótulo de eje "+Y (m)"
        ctx.font = `bold ${Math.max(9, 10 / zoom)}px monospace`;
        ctx.fillStyle = "#1a237e";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("+Y (m)", ox + 8 / zoom, arrowY + 6 / zoom);

        // Graduaciones (ticks) y números sobre Eje Y
        const tickMajor = 8 / zoom;
        const tickMinor = 4 / zoom;
        const fontSizeTick = Math.max(8, 8.5 / zoom);
        ctx.font = `${fontSizeTick}px monospace`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";

        // Graduaciones hacia arriba del origen (+Y físico)
        let meterY = 1;
        while (true) {
          const py = referenceFrame.yAxisUp ? (oy - meterY * ppm) : (oy + meterY * ppm);
          if (py < sheet.padding + 20 / zoom) break;

          ctx.beginPath();
          ctx.moveTo(ox - tickMajor, py);
          ctx.lineTo(ox + tickMajor, py);
          ctx.stroke();

          ctx.fillText(`+${meterY}`, ox - tickMajor - 2 / zoom, py);

          const halfPy = referenceFrame.yAxisUp ? (py + 0.5 * ppm) : (py - 0.5 * ppm);
          if (halfPy > sheet.padding) {
            ctx.beginPath();
            ctx.moveTo(ox - tickMinor, halfPy);
            ctx.lineTo(ox + tickMinor, halfPy);
            ctx.stroke();
          }

          meterY++;
        }

        // Graduaciones hacia abajo del origen (-Y físico)
        meterY = 1;
        while (true) {
          const py = referenceFrame.yAxisUp ? (oy + meterY * ppm) : (oy - meterY * ppm);
          if (py > sheet.height - sheet.padding - 10 / zoom) break;

          ctx.beginPath();
          ctx.moveTo(ox - tickMajor, py);
          ctx.lineTo(ox + tickMajor, py);
          ctx.stroke();

          ctx.fillText(`-${meterY}`, ox - tickMajor - 2 / zoom, py);

          const halfPy = referenceFrame.yAxisUp ? (py - 0.5 * ppm) : (py + 0.5 * ppm);
          if (halfPy < sheet.height - sheet.padding) {
            ctx.beginPath();
            ctx.moveTo(ox - tickMinor, halfPy);
            ctx.lineTo(ox + tickMinor, halfPy);
            ctx.stroke();
          }

          meterY++;
        }
      }

      // --- MANIPULADOR Y DIANA DEL ORIGEN (0, 0) ---
      ctx.save();
      const targetR = (isHoveredOrig || isDraggingOrig ? 12 : 9) / zoom;

      // Círculo exterior de la diana
      ctx.lineWidth = (isHoveredOrig || isDraggingOrig ? 2.6 : 1.8) / zoom;
      ctx.strokeStyle = isDraggingOrig ? "#d32f2f" : (isHoveredOrig ? "#0d47a1" : "#1a237e");
      ctx.fillStyle = isDraggingOrig ? "rgba(211, 47, 47, 0.18)" : (isHoveredOrig ? "rgba(13, 71, 161, 0.18)" : "#ffffff");
      ctx.beginPath();
      ctx.arc(ox, oy, targetR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Cruz reticular
      const crossArm = targetR + 4 / zoom;
      ctx.beginPath();
      ctx.moveTo(ox - crossArm, oy); ctx.lineTo(ox + crossArm, oy);
      ctx.moveTo(ox, oy - crossArm); ctx.lineTo(ox, oy + crossArm);
      ctx.stroke();

      // Punto central
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(ox, oy, 2.5 / zoom, 0, Math.PI * 2);
      ctx.fill();

      // Rótulo pill "(0, 0)"
      const origFontSize = Math.max(8.5, 9.5 / zoom);
      ctx.font = `bold ${origFontSize}px monospace`;
      const origText = "(0, 0)";
      const origTextW = ctx.measureText(origText).width;
      const origPadX = 4 / zoom;
      const origPadY = 2 / zoom;
      const pillX = ox + targetR + 4 / zoom;
      const pillY = oy + 3 / zoom;

      ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
      ctx.strokeStyle = ctx.strokeStyle;
      ctx.lineWidth = 0.8 / zoom;
      ctx.fillRect(pillX - origPadX, pillY - origPadY, origTextW + origPadX * 2, origFontSize + origPadY * 2);
      ctx.strokeRect(pillX - origPadX, pillY - origPadY, origTextW + origPadX * 2, origFontSize + origPadY * 2);

      ctx.fillStyle = ctx.strokeStyle;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(origText, pillX, pillY);

      ctx.restore();
      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * Soporte fijo: Estructura esquemática técnica de ingeniería (apoyo articulado de base rígida con perno)
   */
  drawAnchor(anchor, isHovered = false, isSelected = false, isDeleteMode = false) {
    const ctx = this.ctx;
    const pos = anchor.position;
    const width = anchor.hatchWidth || 44;
    const halfW = width / 2;

    ctx.save();
    ctx.lineWidth = isHovered || isSelected ? 2.4 : 1.8;
    ctx.strokeStyle = isDeleteMode && isHovered ? this.accentDeleteColor : this.strokeColor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Dirección normal hacia el exterior (hacia el techo/pared, fuera del perno)
    const angle = anchor.hatchAngle !== undefined ? anchor.hatchAngle : -Math.PI / 2;
    const normX = Math.cos(angle);
    const normY = Math.sin(angle);

    // Dirección paralela a la superficie de montaje (pared o techo)
    const barAngle = angle + Math.PI / 2;
    const dirX = Math.cos(barAngle);
    const dirY = Math.sin(barAngle);

    // La base rígida está separada 14px en la dirección normal
    const baseDist = 14;
    const baseX = pos.x + normX * baseDist;
    const baseY = pos.y + normY * baseDist;

    // Extremos de la placa base de apoyo
    const pBaseA_x = baseX - dirX * halfW;
    const pBaseA_y = baseY - dirY * halfW;
    const pBaseB_x = baseX + dirX * halfW;
    const pBaseB_y = baseY + dirY * halfW;

    // 1. Placa base rígida
    ctx.beginPath();
    ctx.moveTo(pBaseA_x, pBaseA_y);
    ctx.lineTo(pBaseB_x, pBaseB_y);
    ctx.stroke();

    // 2. Rayado diagonal a 45° detrás de la placa base (simboliza terreno/empotramiento rígido)
    ctx.lineWidth = 1.2;
    const spacing = 6;
    const hatchLen = 8;
    const hatchCount = Math.floor(width / spacing);
    const hatchDirX = (normX + dirX) * 0.707;
    const hatchDirY = (normY + dirY) * 0.707;

    ctx.beginPath();
    for (let i = 0; i <= hatchCount; i++) {
      const t = (i * spacing) - halfW;
      const ox = baseX + dirX * t;
      const oy = baseY + dirY * t;
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + hatchDirX * hatchLen, oy + hatchDirY * hatchLen);
    }
    ctx.stroke();

    // 3. Brazos estructurales en "V" / soporte triangular hacia el perno articular
    ctx.lineWidth = isHovered || isSelected ? 2.0 : 1.6;
    const legSpan = Math.min(14, halfW * 0.65);
    ctx.beginPath();
    ctx.moveTo(baseX - dirX * legSpan, baseY - dirY * legSpan);
    ctx.lineTo(pos.x, pos.y);
    ctx.lineTo(baseX + dirX * legSpan, baseY + dirY * legSpan);
    ctx.stroke();

    // 4. Perno articular central (pivote en pos.x, pos.y)
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.stroke();

    // Orificio central del perno
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = isDeleteMode && isHovered ? this.accentDeleteColor : this.strokeColor;
    ctx.fill();

    // Indicador visual de selección y manija de rotación técnica
    if (isSelected) {
      const handleR = 38;
      ctx.save();
      // Aro de rotación punteado
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.0;
      ctx.strokeStyle = "rgba(17, 17, 17, 0.4)";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, handleR, 0, Math.PI * 2);
      ctx.stroke();

      // Línea radial hacia la manija de rotación
      const handleX = pos.x + normX * handleR;
      const handleY = pos.y + normY * handleR;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(handleX, handleY);
      ctx.stroke();

      // Manija de giro circular (knob interactivo)
      ctx.setLineDash([]);
      ctx.fillStyle = "#ffffff";
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = this.strokeColor;
      ctx.beginPath();
      ctx.arc(handleX, handleY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Centro de la manija
      ctx.fillStyle = this.strokeColor;
      ctx.beginPath();
      ctx.arc(handleX, handleY, 2, 0, Math.PI * 2);
      ctx.fill();

      // Lectura del ángulo en grados técnicos
      const deg = Math.round(angle * 180 / Math.PI);
      ctx.font = "bold 9px monospace";
      ctx.textAlign = normX >= 0 ? "left" : "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = this.strokeColor;
      ctx.fillText(`${deg}°`, handleX + (normX >= 0 ? 9 : -9), handleY);

      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * Masa libre puntual: Esfera esquemática técnica con retícula de centro de masa
   */
  drawBody(body, isHovered = false, isSelected = false, isDeleteMode = false) {
    const ctx = this.ctx;
    const pos = body.position;
    const r = body.radius || 20;

    ctx.save();
    ctx.lineWidth = body.isDragging || isHovered || isSelected ? 2.4 : 1.8;
    ctx.strokeStyle = isDeleteMode && isHovered ? this.accentDeleteColor : this.strokeColor;

    // 1. Contorno circular de la masa (fondo blanco opaco para aislar de la rejilla de fondo)
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.stroke();

    // 2. Símbolo técnico de centro de masa (retícula ortogonal limpia)
    const arm = r * 0.72;
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = isDeleteMode && isHovered ? this.accentDeleteColor : "rgba(17, 17, 17, 0.7)";
    ctx.beginPath();
    ctx.moveTo(pos.x - arm, pos.y);
    ctx.lineTo(pos.x + arm, pos.y);
    ctx.moveTo(pos.x, pos.y - arm);
    ctx.lineTo(pos.x, pos.y + arm);
    ctx.stroke();

    // Aro central del retículo
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = isDeleteMode && isHovered ? this.accentDeleteColor : this.strokeColor;
    ctx.stroke();

    // Punto exacto del centro de gravedad
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 1.0, 0, Math.PI * 2);
    ctx.fillStyle = isDeleteMode && isHovered ? this.accentDeleteColor : this.strokeColor;
    ctx.fill();

    // 3. Aro exterior dinámico al arrastrar o estar seleccionado
    if (body.isDragging || isSelected) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = this.strokeColor;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 4. Etiqueta técnica minimalista [m = X.X kg]
    ctx.font = '10px "SF Mono", monospace';
    ctx.fillStyle = isDeleteMode && isHovered ? this.accentDeleteColor : "#333333";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`[m = ${body.mass.toFixed(1)} kg]`, pos.x + r + 6, pos.y);

    ctx.restore();
  }

  /**
   * Riel con Plataforma Deslizante (Linear Rail & Carriage / Slider):
   * Renderiza el riel con sus topes de carrera, escala métrica, y la plataforma móvil con rodillos y perno.
   */
  drawSlider(slider, isHovered = false, isSelected = false, isDeleteMode = false) {
    const ctx = this.ctx;
    const stroke = isDeleteMode && isHovered ? this.accentDeleteColor : this.strokeColor;
    const center = slider.railCenter || slider.position;
    const len = slider.railLength || 400;
    const angle = slider.railAngle || 0;
    const halfL = len / 2;
    const dir = slider.getDir ? slider.getDir() : new Vector2D(Math.cos(angle), Math.sin(angle));
    const normal = slider.getNormal ? slider.getNormal() : new Vector2D(-Math.sin(angle), Math.cos(angle));

    const p1 = Vector2D.sub(center, Vector2D.mult(dir, halfL));
    const p2 = Vector2D.add(center, Vector2D.mult(dir, halfL));

    ctx.save();

    // 1. Riel guía lineal (Rail Track)
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = isSelected ? 2.2 : 1.8;

    // Barra principal del riel
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Segunda guía paralela sutil para dar aspecto de riel técnico ranurado (Air-track / Optical Rail)
    ctx.save();
    ctx.strokeStyle = "rgba(17, 17, 17, 0.4)";
    ctx.lineWidth = 1.0;
    const railOffset = Vector2D.mult(normal, -6);
    ctx.beginPath();
    ctx.moveTo(p1.x + railOffset.x, p1.y + railOffset.y);
    ctx.lineTo(p2.x + railOffset.x, p2.y + railOffset.y);
    ctx.stroke();

    // Graduaciones métricas / tics cada 50 px (0.5 m)
    const tickSpacing = 50;
    const numTicks = Math.floor(len / tickSpacing);
    ctx.strokeStyle = "rgba(17, 17, 17, 0.35)";
    ctx.lineWidth = 1.0;
    for (let i = -Math.floor(numTicks / 2); i <= Math.floor(numTicks / 2); i++) {
      const tPos = Vector2D.add(center, Vector2D.mult(dir, i * tickSpacing));
      ctx.beginPath();
      ctx.moveTo(tPos.x, tPos.y);
      ctx.lineTo(tPos.x + normal.x * -4, tPos.y + normal.y * -4);
      ctx.stroke();
    }
    ctx.restore();

    // Topes mecánicos / parachoques en los extremos del riel (p1 y p2)
    const bumperLen = 10;
    [-1, 1].forEach((sign) => {
      const pt = sign === -1 ? p1 : p2;
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = stroke;
      ctx.beginPath();
      ctx.moveTo(pt.x - normal.x * bumperLen, pt.y - normal.y * bumperLen);
      ctx.lineTo(pt.x + normal.x * bumperLen, pt.y + normal.y * bumperLen);
      ctx.stroke();

      // Placa de tope rayada
      ctx.lineWidth = 1.4;
      const bNorm = Vector2D.mult(dir, sign * 4);
      ctx.beginPath();
      ctx.moveTo(pt.x + bNorm.x - normal.x * (bumperLen - 2), pt.y + bNorm.y - normal.y * (bumperLen - 2));
      ctx.lineTo(pt.x + bNorm.x + normal.x * (bumperLen - 2), pt.y + bNorm.y + normal.y * (bumperLen - 2));
      ctx.stroke();
    });

    // Indicador técnico de cota del riel al estar seleccionado
    if (isSelected) {
      const ppm = 100;
      const lenM = (len / ppm).toFixed(2);
      const deg = Math.round(angle * 180 / Math.PI);
      ctx.font = '9px "SF Mono", monospace';
      ctx.fillStyle = "#666666";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const midRail = Vector2D.add(center, Vector2D.mult(normal, -12));
      const desc = slider.isMotorized
        ? `Riel Motorizado: ${lenM}m | ${deg}° | v = ${(slider.motorSpeed || 1.5).toFixed(1)} m/s`
        : `Riel: ${lenM}m | ${deg}°`;
      ctx.fillText(desc, midRail.x, midRail.y);
    }

    // Límites de carrera de vaivén para el riel motorizado (zona de inversión sin choque)
    if (slider.isMotorized) {
      const maxA = slider.sMax * Math.max(0.3, Math.min(0.95, slider.motorAmplitude || 0.90));
      ctx.save();
      ctx.strokeStyle = "rgba(17, 17, 17, 0.4)";
      ctx.lineWidth = 1.0;
      ctx.setLineDash([2, 2]);
      [-maxA, maxA].forEach((sLim) => {
        const limPt = Vector2D.add(center, Vector2D.mult(dir, sLim));
        ctx.beginPath();
        ctx.moveTo(limPt.x - normal.x * 5, limPt.y - normal.y * 5);
        ctx.lineTo(limPt.x + normal.x * 5, limPt.y + normal.y * 5);
        ctx.stroke();
      });
      ctx.restore();
    }
    ctx.restore();

    // 2. Pequeña plataforma / carro móvil (Carriage)
    const pos = slider.position;
    const w = slider.width || 46;
    const h = slider.height || 16;
    const halfW = w / 2;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);

    ctx.lineWidth = slider.isDragging || isHovered || isSelected ? 2.2 : 1.6;
    ctx.strokeStyle = stroke;
    ctx.fillStyle = "#ffffff";

    // Bloque del cuerpo de la plataforma
    const blockX = -halfW;
    const blockY = -h - 2;
    const blockH = h - 2;

    ctx.beginPath();
    try {
      if (ctx.roundRect) {
        ctx.roundRect(blockX, blockY, w, blockH, [3]);
      } else {
        ctx.rect(blockX, blockY, w, blockH);
      }
    } catch (e) {
      ctx.rect(blockX, blockY, w, blockH);
    }
    ctx.fill();
    ctx.stroke();

    // Carcasa superior de motor si es un Riel Motorizado
    if (slider.isMotorized) {
      const mBoxW = 20;
      const mBoxH = 7;
      ctx.save();
      ctx.fillStyle = slider.motorEnabled ? "#ffffff" : "#f2f2f2";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.rect(-mBoxW / 2, blockY - mBoxH, mBoxW, mBoxH);
      ctx.fill();
      ctx.stroke();

      ctx.font = '700 7px "SF Mono", monospace';
      ctx.fillStyle = stroke;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("M", 0, blockY - mBoxH / 2 + 0.5);
      ctx.restore();
    }

    // Cojinetes / ruedas de rodadura apoyadas en el riel
    const rollerR = 3.5;
    const rollerOffset = 13;
    [-rollerOffset, rollerOffset].forEach((rx) => {
      ctx.beginPath();
      ctx.arc(rx, -2, rollerR, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(rx, -2, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = stroke;
      ctx.fill();
    });

    // Soporte hacia el perno articular inferior (origen 0,0)
    ctx.beginPath();
    ctx.moveTo(-7, -2);
    ctx.lineTo(0, 0);
    ctx.lineTo(7, -2);
    ctx.stroke();

    // Perno articular inferior de conexión
    ctx.beginPath();
    ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = stroke;
    ctx.fill();

    // Indicador de traslación 1D en la plataforma
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = "rgba(17, 17, 17, 0.45)";
    ctx.beginPath();
    ctx.moveTo(-9, blockY + blockH / 2);
    ctx.lineTo(9, blockY + blockH / 2);
    ctx.moveTo(-6, blockY + blockH / 2 - 2);
    ctx.lineTo(-9, blockY + blockH / 2);
    ctx.lineTo(-6, blockY + blockH / 2 + 2);
    ctx.moveTo(6, blockY + blockH / 2 - 2);
    ctx.lineTo(9, blockY + blockH / 2);
    ctx.lineTo(6, blockY + blockH / 2 + 2);
    ctx.stroke();

    // Indicador visual de selección / arrastre
    if (slider.isDragging || isSelected) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = stroke;
      const extraTop = slider.isMotorized ? 11 : 4;
      ctx.strokeRect(blockX - 4, blockY - extraTop, w + 8, h + extraTop + 6);
      ctx.restore();
    }

    // Etiqueta técnica minimalista
    ctx.font = '10px "SF Mono", monospace';
    ctx.fillStyle = isDeleteMode && isHovered ? this.accentDeleteColor : "#333333";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const labelText = slider.isMotorized
      ? `[MOTOR: ${slider.motorEnabled ? `${(Math.abs(slider.sVel || 0) / 100).toFixed(2)} m/s` : "OFF"}]`
      : `[M = ${slider.mass.toFixed(1)} kg]`;
    ctx.fillText(labelText, halfW + 6, blockY + blockH / 2);

    ctx.restore();

    ctx.restore();
  }

  /**
   * Resorte elástico procedural en zigzag (/\/\/\)
   */
  drawSpring(p1, p2, options = {}, isHovered = false, isDeleteMode = false) {
    const ctx = this.ctx;
    const delta = Vector2D.sub(p2, p1);
    const dist = delta.mag();
    if (dist < 1) return;

    const u = Vector2D.mult(delta, 1 / dist); // Paralelo
    const v = u.perpendicular();              // Perpendicular

    const coils = options.coils || 12;
    const amplitude = options.amplitude !== undefined ? options.amplitude : 12;
    const lead = Math.min(options.leadLength || 14, dist * 0.15);

    ctx.save();
    ctx.lineWidth = isHovered ? 2.5 : 1.8;
    ctx.strokeStyle = isDeleteMode && isHovered ? this.accentDeleteColor : this.strokeColor;
    ctx.lineJoin = "miter";
    ctx.lineCap = "round";
    ctx.miterLimit = 3;

    if (options.isDashed) {
      ctx.setLineDash([4, 4]);
    }

    ctx.beginPath();

    // 1. Origen y tramo recto de inicio (lead-in)
    ctx.moveTo(p1.x, p1.y);
    const startLead = Vector2D.add(p1, Vector2D.mult(u, lead));
    ctx.lineTo(startLead.x, startLead.y);

    // 2. Zigzag dinámico
    const endLeadDist = dist - lead;
    const activeLength = Math.max(0, endLeadDist - lead);
    const stepLength = activeLength / coils;

    for (let i = 1; i <= coils; i++) {
      const t = lead + (i - 0.5) * stepLength;
      const side = (i % 2 === 1) ? 1 : -1;
      const peak = Vector2D.add(
        Vector2D.add(p1, Vector2D.mult(u, t)),
        Vector2D.mult(v, side * amplitude)
      );
      ctx.lineTo(peak.x, peak.y);
    }

    // 3. Tramo recto final (lead-out)
    const endLead = Vector2D.add(p1, Vector2D.mult(u, endLeadDist));
    ctx.lineTo(endLead.x, endLead.y);
    ctx.lineTo(p2.x, p2.y);

    ctx.stroke();

    // Terminales / anillas de sujeción
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, 2.5, 0, Math.PI * 2);
    ctx.arc(p2.x, p2.y, 2.5, 0, Math.PI * 2);
    ctx.stroke();

    // Guía lineal esquemática de restricción de eje del resorte 1D (si lockX o lockY están activos)
    if (options.lockX || options.lockY) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.0;
      ctx.strokeStyle = "rgba(17, 17, 17, 0.4)";
      const sheetW = this.sheet ? this.sheet.width : 1600;
      const sheetH = this.sheet ? this.sheet.height : 1000;

      if (options.lockX) {
        // Riel vertical: el resorte guía en Y
        const lx = (options.lockedXVal != null) ? options.lockedXVal : (p1.x + p2.x) / 2;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, sheetH);
        ctx.stroke();

        // Topes de riel en bordes de hoja
        ctx.setLineDash([]);
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(lx - 6, 0);
        ctx.lineTo(lx + 6, 0);
        ctx.moveTo(lx - 6, sheetH);
        ctx.lineTo(lx + 6, sheetH);
        ctx.stroke();

        // Rótulo técnico
        ctx.font = 'bold 9px "SF Mono", monospace';
        ctx.fillStyle = "#111111";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText("[Guía Resorte 1D: Solo Y]", lx + 8, Math.min(p1.y, p2.y) + 4);
      }

      if (options.lockY) {
        // Riel horizontal: el resorte guía en X (ideal para sistemas acoplados 1D)
        const ly = (options.lockedYVal != null) ? options.lockedYVal : (p1.y + p2.y) / 2;
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(0, ly);
        ctx.lineTo(sheetW, ly);
        ctx.stroke();

        // Topes de riel en bordes de hoja
        ctx.setLineDash([]);
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(0, ly - 6);
        ctx.lineTo(0, ly + 6);
        ctx.moveTo(sheetW, ly - 6);
        ctx.lineTo(sheetW, ly + 6);
        ctx.stroke();

        // Rótulo técnico
        ctx.font = 'bold 9px "SF Mono", monospace';
        ctx.fillStyle = "#111111";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText("[Guía Resorte 1D: Solo X]", Math.min(p1.x, p2.x) + 4, ly - 8);
      }

      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * Varilla rígida (Rod): Línea continua simple con pivotes articulares
   */
  drawRod(p1, p2, options = {}, isHovered = false, isDeleteMode = false) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = isHovered ? 3.0 : 2.2;
    ctx.strokeStyle = isDeleteMode && isHovered ? this.accentDeleteColor : this.strokeColor;
    ctx.lineCap = "round";

    if (options.isDashed) {
      ctx.setLineDash([4, 4]);
    }

    // Línea continua de la barra rígida
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Pequeños aros pivote en los extremos
    const pinR = options.pinRadius || 3.5;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, pinR, 0, Math.PI * 2);
    ctx.arc(p2.x, p2.y, pinR, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Cuerda flexible inelástica (Rope):
   * - Si está templada/tensa: línea 100% recta y tensada sin ninguna curvatura
   * - Si está destensada (slack): curva combeada hacia abajo por gravedad
   */
  drawRope(p1, p2, options = {}, isHovered = false, isDeleteMode = false) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = isHovered ? 2.4 : 1.6;
    ctx.strokeStyle = isDeleteMode && isHovered ? this.accentDeleteColor : this.strokeColor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (options.isDashed) {
      ctx.setLineDash([4, 4]);
    }

    // Evaluación precisa: si la cuerda está templada/tensa o en previsualización, es estrictamente recta
    const isTaut = options.isDashed || options.isTaut === true ||
      (options.nominalLength !== undefined && options.centerDist !== undefined && options.centerDist >= options.nominalLength - 1.0);

    ctx.beginPath();
    if (isTaut) {
      // Cuerda templada / tensada: línea totalmente recta
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    } else {
      // Cuerda floja (slack): curvatura catenaria por gravedad únicamente cuando no está completamente estirada
      const centerDist = options.centerDist !== undefined ? options.centerDist : p1.dist(p2);
      const nominalLen = options.nominalLength !== undefined ? options.nominalLength : centerDist;
      const slack = Math.max(0, nominalLen - centerDist);
      const sag = Math.min(120, slack * 0.75 + Math.sqrt(Math.max(0, nominalLen * nominalLen - centerDist * centerDist)) * 0.2);

      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2 + sag;
      ctx.moveTo(p1.x, p1.y);
      ctx.quadraticCurveTo(midX, midY, p2.x, p2.y);
    }
    ctx.stroke();

    // Gazas / nudos esquemáticos en los extremos
    ctx.fillStyle = isDeleteMode && isHovered ? this.accentDeleteColor : this.strokeColor;
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, 2.0, 0, Math.PI * 2);
    ctx.arc(p2.x, p2.y, 2.0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Calcula los puntos de anclaje visuales en el perímetro de masas o el perno del soporte
   */
  getConnectionEndpoints(nodeA, nodeB) {
    if (!nodeA || !nodeB) {
      return { p1: new Vector2D(), p2: new Vector2D() };
    }
    const posA = nodeA.position ? nodeA.position : (nodeA.x !== undefined ? nodeA : new Vector2D());
    const posB = nodeB.position ? nodeB.position : (nodeB.x !== undefined ? nodeB : new Vector2D());
    const delta = Vector2D.sub(posB, posA);
    const dist = delta.mag();
    if (dist < 0.001) {
      return { p1: posA.clone(), p2: posB.clone() };
    }

    const u = Vector2D.mult(delta, 1 / dist);
    const offsetA = (nodeA.type === "body") ? (nodeA.radius || 20) : 0;
    const offsetB = (nodeB.type === "body") ? (nodeB.radius || 20) : 0;

    let p1 = posA.clone();
    let p2 = posB.clone();
    if (dist > offsetA + offsetB + 4) {
      p1 = Vector2D.add(posA, Vector2D.mult(u, offsetA));
      p2 = Vector2D.sub(posB, Vector2D.mult(u, offsetB));
    }

    return { p1, p2 };
  }

  /**
   * Previsualización fantasma al conectar dos nodos (resorte, varilla o cuerda en curso)
   */
  drawConnectingPreview(nodeA, targetPos, type) {
    if (!nodeA || !targetPos) return;
    const endpoints = this.getConnectionEndpoints(nodeA, { position: targetPos, type: "preview" });

    if (type === "spring") {
      this.drawSpring(endpoints.p1, endpoints.p2, { isDashed: true, coils: 10, amplitude: 10 });
    } else if (type === "rod") {
      this.drawRod(endpoints.p1, endpoints.p2, { isDashed: true });
    } else if (type === "rope") {
      this.drawRope(endpoints.p1, endpoints.p2, { isDashed: true });
    }
  }

  /**
   * Renderiza el estado completo de la simulación
   */
  render(engine, inputState) {
    this.checkResize();
    this.clear();

    const ctx = this.ctx;
    ctx.save();

    try {
      // Aplicar transformación 2D de la cámara (Pan y Zoom)
      this.validateCamera();
      ctx.translate(this.camera.x, this.camera.y);
      ctx.scale(this.camera.zoom, this.camera.zoom);

      this.drawSheet(engine.referenceFrame);
      this.drawReferenceFrame(engine.referenceFrame, inputState);

      const isDeleteMode = inputState.activeTool === "delete";

      // 1. Dibujar conectores (resortes y varillas)
      for (const conn of engine.connectors) {
        if (!conn || !conn.nodeA || !conn.nodeB) continue;
        const isHovered = inputState.hoveredConnector === conn;
        const isSelected = inputState.selectedEntity === conn;
        const endpoints = this.getConnectionEndpoints(conn.nodeA, conn.nodeB);

        if (conn.type === "spring") {
          this.drawSpring(
            endpoints.p1,
            endpoints.p2,
            {
              coils: conn.coils,
              amplitude: conn.amplitude,
              lockX: conn.lockX,
              lockY: conn.lockY,
              lockedXVal: conn.lockedXVal,
              lockedYVal: conn.lockedYVal
            },
            isHovered || isSelected,
            isDeleteMode
          );
        } else if (conn.type === "rod") {
          this.drawRod(
            endpoints.p1,
            endpoints.p2,
            { pinRadius: conn.pinRadius },
            isHovered || isSelected,
            isDeleteMode
          );
        } else if (conn.type === "rope") {
          const centerDist = conn.nodeA.position && conn.nodeB.position ? conn.nodeA.position.dist(conn.nodeB.position) : 0;
          const isTaut = conn.isTaut || centerDist >= (conn.length - 1.2);
          this.drawRope(
            endpoints.p1,
            endpoints.p2,
            {
              isTaut: isTaut,
              centerDist: centerDist,
              nominalLength: conn.length
            },
            isHovered || isSelected,
            isDeleteMode
          );
        }
      }

      // 2. Previsualización de conexión activa (arrastrando hacia nodo B)
      if (inputState.selectedNodeA && inputState.currentMousePos) {
        this.drawConnectingPreview(
          inputState.selectedNodeA,
          inputState.currentMousePos,
          inputState.activeTool
        );
      }

      // 3. Dibujar nodos (soportes fijos y masas)
      for (const node of engine.nodes) {
        if (!node || !node.position) continue;
        const isHovered = inputState.hoveredNode === node;
        const isSelected = inputState.selectedNodeA === node || inputState.selectedEntity === node;

        if (node.type === "anchor") {
          this.drawAnchor(node, isHovered, isSelected, isDeleteMode);
        } else if (node.type === "body") {
          this.drawBody(node, isHovered, isSelected, isDeleteMode);
        } else if (node.type === "slider") {
          this.drawSlider(node, isHovered, isSelected, isDeleteMode);
        }
      }
    } catch (err) {
      console.error("Renderer error during render loop:", err);
    } finally {
      ctx.restore();
    }
  }
}
