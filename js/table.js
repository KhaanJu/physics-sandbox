/**
 * ============================================================================
 * table.js — Gestor y Ventana de Tabulación de Datos Temporales
 * Permite registrar y tabular variables físicas respecto al tiempo
 * con saltos temporales configurables (Δt) tanto en vivo como desde historial.
 * ============================================================================
 */

import { Vector2D } from "./vector.js";

export class DataTableManager {
  constructor(engine, input, app) {
    this.engine = engine;
    this.input = input;
    this.app = app;

    this.isOpen = false;
    this.isRecording = false;
    this.dtSample = 0.10; // Salto temporal por defecto (100 ms)
    this.nextSampleTime = 0.0;
    this.selectedTargetId = "system"; // "system" | entity.id

    // Almacenamiento de filas de datos
    this.columns = [];
    this.rows = [];
    this.maxRows = 3000;

    // Elementos DOM
    this.panel = null;
    this.targetSelect = null;
    this.dtInput = null;
    this.presetBtns = [];
    this.btnRecord = null;
    this.btnRecordIcon = null;
    this.btnRecordText = null;
    this.btnGenHistory = null;
    this.btnClear = null;
    this.btnExport = null;
    this.badgeStatus = null;
    this.tableHead = null;
    this.tableBody = null;
    this.rowCountEl = null;
    this.timeRangeEl = null;
  }

  initDOM() {
    this.panel = document.getElementById("data-table-panel");
    this.targetSelect = document.getElementById("table-target-select");
    this.dtInput = document.getElementById("table-dt-input");
    this.presetBtns = Array.from(document.querySelectorAll("#table-dt-presets .preset-btn"));
    this.btnRecord = document.getElementById("btn-table-record");
    this.btnRecordIcon = document.getElementById("btn-table-record-icon");
    this.btnRecordText = document.getElementById("btn-table-record-text");
    this.btnGenHistory = document.getElementById("btn-table-generate-history");
    this.btnClear = document.getElementById("btn-table-clear");
    this.btnExport = document.getElementById("btn-table-export-csv");
    this.badgeStatus = document.getElementById("badge-table-status");
    this.tableHead = document.getElementById("data-table-head");
    this.tableBody = document.getElementById("data-table-body-rows");
    this.rowCountEl = document.getElementById("table-row-count");
    this.timeRangeEl = document.getElementById("table-time-range");

    const btnClose = document.getElementById("btn-close-data-table");
    const btnToolTable = document.getElementById("btn-tool-table");

    if (btnClose) {
      btnClose.addEventListener("click", () => this.close());
    }

    if (btnToolTable) {
      btnToolTable.addEventListener("click", () => this.toggle());
    }

    if (this.targetSelect) {
      this.targetSelect.addEventListener("change", (e) => {
        this.selectedTargetId = e.target.value;
        this.updateColumns();
        // Si hay historial grabado, re-tabular automáticamente con el nuevo target
        if (this.engine.history && this.engine.history.length > 1) {
          this.generateFromHistory();
        } else {
          this.clearTable();
        }
      });
    }

    if (this.dtInput) {
      this.dtInput.addEventListener("change", (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
          this.setDtSample(val);
        }
      });
    }

    this.presetBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const dt = parseFloat(btn.dataset.dt);
        if (!isNaN(dt)) {
          this.setDtSample(dt);
        }
      });
    });

    if (this.btnRecord) {
      this.btnRecord.addEventListener("click", () => this.toggleRecording());
    }

    if (this.btnGenHistory) {
      this.btnGenHistory.addEventListener("click", () => this.generateFromHistory());
    }

    if (this.btnClear) {
      this.btnClear.addEventListener("click", () => this.clearTable());
    }

    if (this.btnExport) {
      this.btnExport.addEventListener("click", () => this.exportCSV());
    }

    this.updateColumns();
    this.updateTargetList();
  }

  setDtSample(dt) {
    this.dtSample = Math.max(0.005, Math.min(10.0, dt));
    if (this.dtInput) {
      this.dtInput.value = this.dtSample.toFixed(2);
    }
    this.presetBtns.forEach((btn) => {
      const bDt = parseFloat(btn.dataset.dt);
      btn.classList.toggle("active", Math.abs(bDt - this.dtSample) < 0.001);
    });

    if (this.engine.history && this.engine.history.length > 1) {
      this.generateFromHistory();
    }
  }

  open() {
    if (!this.panel) return;
    this.isOpen = true;
    this.panel.classList.remove("is-hidden");
    const btnToolTable = document.getElementById("btn-tool-table");
    if (btnToolTable) btnToolTable.classList.add("active");

    // Traer al frente
    document.querySelectorAll(".hud-panel").forEach((p) => {
      p.style.zIndex = "30";
    });
    this.panel.style.zIndex = "40";

    this.updateTargetList();

    // Si la tabla está vacía y hay historial acumulado, tabularlo automáticamente
    if (this.rows.length === 0 && this.engine.history && this.engine.history.length > 10) {
      this.generateFromHistory();
    }
  }

  close() {
    if (!this.panel) return;
    this.isOpen = false;
    this.panel.classList.add("is-hidden");
    const btnToolTable = document.getElementById("btn-tool-table");
    if (btnToolTable) btnToolTable.classList.remove("active");
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  updateTargetList() {
    if (!this.targetSelect) return;
    const currentVal = this.selectedTargetId;
    this.targetSelect.innerHTML = "";

    // 1. Opción general de sistema
    const optSys = document.createElement("option");
    optSys.value = "system";
    optSys.textContent = "Todo el Sistema (Energía, Rapidez y Trabajo)";
    this.targetSelect.appendChild(optSys);

    // 2. Nodos individuales
    for (let i = 0; i < this.engine.nodes.length; i++) {
      const node = this.engine.nodes[i];
      const opt = document.createElement("option");
      opt.value = node.id;
      if (node.type === "slider") {
        opt.textContent = `Riel: ${node.label || "Riel"} [m = ${node.mass.toFixed(1)} kg]`;
      } else if (node.type === "body") {
        opt.textContent = `Masa: ${node.label || "m"} [m = ${node.mass.toFixed(2)} kg]`;
      } else if (node.type === "anchor") {
        opt.textContent = `Soporte Fijo: ${node.label || "Soporte"}`;
      } else {
        opt.textContent = `Nodo: ${node.id}`;
      }
      this.targetSelect.appendChild(opt);
    }

    // 3. Conectores individuales
    const ppm = this.engine.pixelsPerMeter || 100;
    for (let i = 0; i < this.engine.connectors.length; i++) {
      const conn = this.engine.connectors[i];
      const opt = document.createElement("option");
      opt.value = conn.id;
      if (conn.type === "spring") {
        opt.textContent = `Resorte [k = ${conn.stiffness.toFixed(0)} N/m, L₀ = ${(conn.restLength / ppm).toFixed(2)} m]`;
      } else if (conn.type === "rod") {
        const isPendulum = (conn.nodeA && conn.nodeA.isStatic) || (conn.nodeB && conn.nodeB.isStatic);
        opt.textContent = isPendulum ? `Péndulo (Varilla) [L = ${(conn.length / ppm).toFixed(2)} m]` : `Varilla Rígida [L = ${(conn.length / ppm).toFixed(2)} m]`;
      } else if (conn.type === "rope") {
        const isPendulum = (conn.nodeA && conn.nodeA.isStatic) || (conn.nodeB && conn.nodeB.isStatic);
        opt.textContent = isPendulum ? `Péndulo (Cuerda) [L = ${(conn.length / ppm).toFixed(2)} m]` : `Cuerda Inelástica [L = ${(conn.length / ppm).toFixed(2)} m]`;
      } else {
        opt.textContent = `Conector: ${conn.id}`;
      }
      this.targetSelect.appendChild(opt);
    }

    // Restaurar selección previa si existe
    const hasCurrent = Array.from(this.targetSelect.options).some(o => o.value === currentVal);
    if (hasCurrent) {
      this.targetSelect.value = currentVal;
      this.selectedTargetId = currentVal;
    } else {
      this.targetSelect.value = "system";
      this.selectedTargetId = "system";
    }

    this.updateColumns();
  }

  updateColumns() {
    if (this.selectedTargetId === "system") {
      this.columns = [
        { key: "t", label: "t (s)", align: "center" },
        { key: "ek", label: "E_cinética (J)", align: "right" },
        { key: "ep", label: "E_potencial (J)", align: "right" },
        { key: "em", label: "E_mecánica (J)", align: "right" },
        { key: "vavg", label: "|v|_media (m/s)", align: "right" }
      ];
    } else {
      const node = this.engine.nodes.find(n => n.id === this.selectedTargetId);
      const conn = this.engine.connectors.find(c => c.id === this.selectedTargetId);

      if (node) {
        if (node.type === "slider") {
          this.columns = [
            { key: "t", label: "t (s)", align: "center" },
            { key: "s", label: "s (m)", align: "right" },
            { key: "vs", label: "v_s (m/s)", align: "right" },
            { key: "x", label: "X (m)", align: "right" },
            { key: "y", label: "Y (m)", align: "right" },
            { key: "h", label: "h (m)", align: "right" },
            { key: "v", label: "|v| (m/s)", align: "right" },
            { key: "ek", label: "E_cinética (J)", align: "right" },
            { key: "ep", label: "E_potencial (J)", align: "right" },
            { key: "em", label: "E_mecánica (J)", align: "right" }
          ];
        } else {
          // Masa puntual o soporte
          this.columns = [
            { key: "t", label: "t (s)", align: "center" },
            { key: "x", label: "X (m)", align: "right" },
            { key: "y", label: "Y (m)", align: "right" },
            { key: "h", label: "h (m)", align: "right" },
            { key: "vx", label: "v_x (m/s)", align: "right" },
            { key: "vy", label: "v_y (m/s)", align: "right" },
            { key: "v", label: "|v| (m/s)", align: "right" },
            { key: "ek", label: "E_cinética (J)", align: "right" },
            { key: "ep", label: "E_potencial (J)", align: "right" },
            { key: "em", label: "E_mecánica (J)", align: "right" }
          ];
        }
      } else if (conn) {
        if (conn.type === "spring") {
          this.columns = [
            { key: "t", label: "t (s)", align: "center" },
            { key: "l", label: "Long. L (m)", align: "right" },
            { key: "dx", label: "Deform. Δx (m)", align: "right" },
            { key: "f", label: "Fuerza |F| (N)", align: "right" },
            { key: "ep", label: "E_elástica (J)", align: "right" },
            { key: "ek", label: "E_cinética (J)", align: "right" },
            { key: "em", label: "E_mecánica (J)", align: "right" }
          ];
        } else {
          // Péndulo (Cuerda o Varilla Rígida)
          this.columns = [
            { key: "t", label: "t (s)", align: "center" },
            { key: "angle", label: "Ángulo θ (°)", align: "right" },
            { key: "h", label: "h (m)", align: "right" },
            { key: "v", label: "Rapidez v (m/s)", align: "right" },
            { key: "ek", label: "E_cinética (J)", align: "right" },
            { key: "ep", label: "E_potencial (J)", align: "right" },
            { key: "em", label: "E_mecánica (J)", align: "right" },
            { key: "tension", label: "Tensión T (N)", align: "right" }
          ];
        }
      } else {
        this.columns = [
          { key: "t", label: "t (s)", align: "center" },
          { key: "em", label: "E_mecánica (J)", align: "right" }
        ];
      }
    }

    this.renderHeader();
  }

  renderHeader() {
    if (!this.tableHead) return;
    let html = "<tr>";
    for (const col of this.columns) {
      const style = col.align === "center" ? ' style="text-align:center;"' : "";
      html += `<th${style}>${col.label}</th>`;
    }
    html += "</tr>";
    this.tableHead.innerHTML = html;
  }

  toggleRecording() {
    this.isRecording = !this.isRecording;
    if (this.isRecording) {
      this.nextSampleTime = this.engine.simulationTime;
      if (this.btnRecord) this.btnRecord.classList.add("is-recording");
      if (this.btnRecordIcon) this.btnRecordIcon.textContent = "⏹";
      if (this.btnRecordText) this.btnRecordText.textContent = "Detener";
      if (this.badgeStatus) {
        this.badgeStatus.textContent = "GRABANDO";
        this.badgeStatus.style.background = "#ffebee";
        this.badgeStatus.style.color = "#c62828";
      }
      // Capturar la primera muestra inmediatamente
      this.captureCurrentLiveSample();
    } else {
      if (this.btnRecord) this.btnRecord.classList.remove("is-recording");
      if (this.btnRecordIcon) this.btnRecordIcon.textContent = "⏺";
      if (this.btnRecordText) this.btnRecordText.textContent = "Grabar en Vivo";
      if (this.badgeStatus) {
        this.badgeStatus.textContent = "PAUSADO";
        this.badgeStatus.style.background = "#f0f0f0";
        this.badgeStatus.style.color = "#111111";
      }
    }
  }

  /**
   * Se ejecuta en cada ciclo de simulación para recolectar datos a saltos de dtSample
   */
  onSimulationStep() {
    if (!this.isRecording || this.engine.isPaused) return;

    const curTime = this.engine.simulationTime;
    if (curTime >= this.nextSampleTime - 0.0001) {
      this.captureCurrentLiveSample();
      this.nextSampleTime = curTime + this.dtSample;
    }
  }

  captureCurrentLiveSample() {
    const t = this.engine.simulationTime;
    const row = this.extractValuesFromEngine(t);
    if (!row) return;

    this.rows.push(row);
    if (this.rows.length > this.maxRows) {
      this.rows.shift();
    }

    this.renderRowAppend(row);
    this.updateStatusInfo();
  }

  extractValuesFromEngine(simTime) {
    const ppm = this.engine.pixelsPerMeter;
    const rf = this.engine.referenceFrame;
    const g = this.engine.gravityVal;
    const maxY = (this.engine.sheet ? this.engine.sheet.height : 900) - 20;

    const safeDec = (val, dec = 3) => {
      if (typeof val !== "number" || isNaN(val)) return (0).toFixed(dec);
      const limit = Math.pow(10, -dec) / 2;
      return Math.abs(val) < limit ? (0).toFixed(dec) : val.toFixed(dec);
    };

    if (this.selectedTargetId === "system") {
      const tel = this.engine.calculateTelemetry();
      return {
        t: safeDec(simTime, 2),
        ek: safeDec(tel.kineticEnergy, 2),
        ep: safeDec(tel.potentialEnergy, 2),
        em: safeDec(tel.totalEnergy, 2),
        vavg: safeDec(tel.avgSpeed, 2)
      };
    }

    const node = this.engine.nodes.find(n => n.id === this.selectedTargetId);
    if (node) {
      const xM = rf ? rf.toPhysicalX(node.position.x) : (node.position.x / ppm);
      const yM = rf ? rf.toPhysicalY(node.position.y) : (node.position.y / ppm);
      const hM = rf ? rf.getGravitationalHeight(node.position.y) : (Math.max(0, maxY - (node.radius || 20) - node.position.y) / ppm);
      const vPhys = rf ? rf.toPhysicalVel(node.velocity) : { x: node.velocity.x / ppm, y: node.velocity.y / ppm };
      const vM = node.velocity.mag() / ppm;
      const mass = node.isStatic ? 0 : (node.mass || 2.0);
      const ek = 0.5 * mass * vM * vM;

      // Ep gravitatoria + elástica de resortes conectados a esta masa
      let ep = mass * g * hM;
      for (const c of this.engine.connectors) {
        if (c.type === "spring" && (c.nodeA === node || c.nodeB === node)) {
          const curL = (c.currentLength !== undefined ? c.currentLength : c.nodeA.position.dist(c.nodeB.position)) / ppm;
          const restL = c.restLength / ppm;
          const dx = curL - restL;
          const other = (c.nodeA === node) ? c.nodeB : c.nodeA;
          const factor = other.isStatic ? 1.0 : 0.5;
          ep += factor * 0.5 * c.stiffness * dx * dx;
        }
      }
      const em = ek + ep;

      if (node.type === "slider") {
        const sM = (node.s || 0) / ppm;
        const vsM = (node.sVel || 0) / ppm;
        return {
          t: safeDec(simTime, 2),
          s: safeDec(sM, 3),
          vs: safeDec(vsM, 3),
          x: safeDec(xM, 3),
          y: safeDec(yM, 3),
          h: safeDec(hM, 3),
          v: safeDec(vM, 3),
          ek: safeDec(ek, 3),
          ep: safeDec(ep, 3),
          em: safeDec(em, 3)
        };
      } else {
        return {
          t: safeDec(simTime, 2),
          x: safeDec(xM, 3),
          y: safeDec(yM, 3),
          h: safeDec(hM, 3),
          vx: safeDec(vPhys.x, 3),
          vy: safeDec(vPhys.y, 3),
          v: safeDec(vM, 3),
          ek: safeDec(ek, 3),
          ep: safeDec(ep, 3),
          em: safeDec(em, 3)
        };
      }
    }

    const conn = this.engine.connectors.find(c => c.id === this.selectedTargetId);
    if (conn) {
      if (conn.type === "spring") {
        const curL = (conn.currentLength !== undefined ? conn.currentLength : conn.nodeA.position.dist(conn.nodeB.position)) / ppm;
        const restL = conn.restLength / ppm;
        const deltaX = curL - restL;
        const forceN = Math.abs(conn.currentForce !== undefined ? conn.currentForce : conn.stiffness * deltaX);
        const ep = 0.5 * conn.stiffness * deltaX * deltaX;

        let ek = 0;
        if (!conn.nodeA.isStatic) {
          const vA = conn.nodeA.velocity.mag() / ppm;
          ek += 0.5 * conn.nodeA.mass * vA * vA;
        }
        if (!conn.nodeB.isStatic) {
          const vB = conn.nodeB.velocity.mag() / ppm;
          ek += 0.5 * conn.nodeB.mass * vB * vB;
        }
        const em = ek + ep;

        return {
          t: safeDec(simTime, 2),
          l: safeDec(curL, 3),
          dx: (deltaX >= 0 ? `+${safeDec(deltaX, 3)}` : safeDec(deltaX, 3)),
          f: safeDec(forceN, 2),
          ep: safeDec(ep, 3),
          ek: safeDec(ek, 3),
          em: safeDec(em, 3)
        };
      } else {
        // Péndulo (Cuerda o Varilla Rígida)
        const pivot = (conn.nodeA.isStatic || (!conn.nodeB.isStatic && conn.nodeA.position.y <= conn.nodeB.position.y))
          ? conn.nodeA : conn.nodeB;
        const bob = (pivot === conn.nodeA) ? conn.nodeB : conn.nodeA;

        const dxPx = bob.position.x - pivot.position.x;
        const dyPx = bob.position.y - pivot.position.y;
        // Ángulo de deflexión theta: 0° vertical hacia abajo, positivo derecha, negativo izquierda
        const angleRad = Math.atan2(dxPx, dyPx);
        const angleDeg = angleRad * (180 / Math.PI);

        const lengthM = (conn.length || Math.hypot(dxPx, dyPx)) / ppm;
        const vM = bob.velocity.mag() / ppm;
        const mass = bob.isStatic ? 0 : (bob.mass || 2.0);

        const hM = rf ? rf.getGravitationalHeight(bob.position.y) : (Math.max(0, maxY - (bob.radius || 20) - bob.position.y) / ppm);
        const ek = 0.5 * mass * vM * vM;
        const ep = mass * g * hM;
        const em = ek + ep;

        let tension = 0;
        if (lengthM > 0.001 && mass > 0) {
          tension = mass * (g * Math.cos(angleRad) + (vM * vM) / lengthM);
          if (conn.type === "rope" && tension < 0) tension = 0;
        }

        return {
          t: safeDec(simTime, 2),
          angle: safeDec(angleDeg, 1),
          h: safeDec(hM, 3),
          v: safeDec(vM, 3),
          ek: safeDec(ek, 3),
          ep: safeDec(ep, 3),
          em: safeDec(em, 3),
          tension: safeDec(tension, 2)
        };
      }
    }

    return null;
  }

  /**
   * Extrae del búfer del historial todas las muestras a intervalos exactos de dtSample
   */
  generateFromHistory() {
    const history = this.engine.history;
    if (!history || history.length === 0) {
      this.clearTable();
      return;
    }

    this.rows = [];
    const tStart = history[0].time;
    const tEnd = history[history.length - 1].time;
    const dt = this.dtSample;

    let targetTime = tStart;
    let histIdx = 0;

    while (targetTime <= tEnd + 0.0001) {
      while (histIdx < history.length - 1 && history[histIdx + 1].time <= targetTime) {
        histIdx++;
      }

      const frame = history[histIdx];
      const row = this.extractValuesFromFrame(frame, targetTime);
      if (row) {
        this.rows.push(row);
      }

      targetTime += dt;
      if (this.rows.length >= this.maxRows) break;
    }

    this.renderFullTable();
    this.updateStatusInfo();
  }

  extractValuesFromFrame(frame, displayTime) {
    const ppm = this.engine.pixelsPerMeter;
    const rf = this.engine.referenceFrame;
    const g = this.engine.gravityVal;
    const maxY = (this.engine.sheet ? this.engine.sheet.height : 900) - 20;

    const safeDec = (val, dec = 3) => {
      if (typeof val !== "number" || isNaN(val)) return (0).toFixed(dec);
      const limit = Math.pow(10, -dec) / 2;
      return Math.abs(val) < limit ? (0).toFixed(dec) : val.toFixed(dec);
    };

    if (this.selectedTargetId === "system") {
      let kineticEnergy = 0;
      let gravitationalEnergy = 0;
      let movingBodies = 0;
      let avgSpeed = 0;

      for (const item of frame.nodes) {
        if (!item.isStatic) {
          const speedM = Math.hypot(item.vx, item.vy) / ppm;
          const mass = item.node ? item.node.mass : 2.0;
          kineticEnergy += 0.5 * mass * speedM * speedM;
          avgSpeed += speedM;
          const heightM = rf ? rf.getGravitationalHeight(item.y) : (Math.max(0, maxY - 20 - item.y) / ppm);
          gravitationalEnergy += mass * g * heightM;
          movingBodies++;
        }
      }

      let elasticEnergy = 0;
      for (const conn of this.engine.connectors) {
        if (conn.type === "spring") {
          const nA = frame.nodes.find(n => n.node === conn.nodeA);
          const nB = frame.nodes.find(n => n.node === conn.nodeB);
          if (nA && nB) {
            const dist = Math.hypot(nB.x - nA.x, nB.y - nA.y);
            const deltaM = (dist - conn.restLength) / ppm;
            elasticEnergy += 0.5 * conn.stiffness * deltaM * deltaM;
          }
        }
      }

      const potEnergy = gravitationalEnergy + elasticEnergy;
      const totEnergy = kineticEnergy + potEnergy;
      const vAvg = movingBodies > 0 ? (avgSpeed / movingBodies) : 0;

      return {
        t: safeDec(displayTime, 2),
        ek: safeDec(kineticEnergy, 2),
        ep: safeDec(potEnergy, 2),
        em: safeDec(totEnergy, 2),
        vavg: safeDec(vAvg, 2)
      };
    }

    const nodeItem = frame.nodes.find(n => n.node && n.node.id === this.selectedTargetId);
    if (nodeItem) {
      const xM = rf ? rf.toPhysicalX(nodeItem.x) : (nodeItem.x / ppm);
      const yM = rf ? rf.toPhysicalY(nodeItem.y) : (nodeItem.y / ppm);
      const hM = rf ? rf.getGravitationalHeight(nodeItem.y) : (Math.max(0, maxY - 20 - nodeItem.y) / ppm);
      const vPhys = rf ? rf.toPhysicalVel({ x: nodeItem.vx, y: nodeItem.vy }) : { x: nodeItem.vx / ppm, y: nodeItem.vy / ppm };
      const vM = Math.hypot(nodeItem.vx, nodeItem.vy) / ppm;
      const mass = nodeItem.isStatic ? 0 : (nodeItem.node ? nodeItem.node.mass : 2.0);
      const ek = 0.5 * mass * vM * vM;

      let ep = mass * g * hM;
      for (const c of this.engine.connectors) {
        if (c.type === "spring" && (c.nodeA === nodeItem.node || c.nodeB === nodeItem.node)) {
          const nA = frame.nodes.find(n => n.node === c.nodeA);
          const nB = frame.nodes.find(n => n.node === c.nodeB);
          if (nA && nB) {
            const dist = Math.hypot(nB.x - nA.x, nB.y - nA.y);
            const deltaM = (dist - c.restLength) / ppm;
            const otherIsStatic = (c.nodeA === nodeItem.node) ? c.nodeB.isStatic : c.nodeA.isStatic;
            const factor = otherIsStatic ? 1.0 : 0.5;
            ep += factor * 0.5 * c.stiffness * deltaM * deltaM;
          }
        }
      }
      const em = ek + ep;

      if (nodeItem.node && nodeItem.node.type === "slider") {
        const sM = (nodeItem.s !== null ? nodeItem.s : 0) / ppm;
        const vsM = (nodeItem.sVel !== null ? nodeItem.sVel : 0) / ppm;
        return {
          t: safeDec(displayTime, 2),
          s: safeDec(sM, 3),
          vs: safeDec(vsM, 3),
          x: safeDec(xM, 3),
          y: safeDec(yM, 3),
          h: safeDec(hM, 3),
          v: safeDec(vM, 3),
          ek: safeDec(ek, 3),
          ep: safeDec(ep, 3),
          em: safeDec(em, 3)
        };
      } else {
        return {
          t: safeDec(displayTime, 2),
          x: safeDec(xM, 3),
          y: safeDec(yM, 3),
          h: safeDec(hM, 3),
          vx: safeDec(vPhys.x, 3),
          vy: safeDec(vPhys.y, 3),
          v: safeDec(vM, 3),
          ek: safeDec(ek, 3),
          ep: safeDec(ep, 3),
          em: safeDec(em, 3)
        };
      }
    }

    const conn = this.engine.connectors.find(c => c.id === this.selectedTargetId);
    if (conn) {
      const nA = frame.nodes.find(n => n.node === conn.nodeA);
      const nB = frame.nodes.find(n => n.node === conn.nodeB);
      if (nA && nB) {
        const dist = Math.hypot(nB.x - nA.x, nB.y - nA.y);
        const curL = dist / ppm;

        if (conn.type === "spring") {
          const restL = conn.restLength / ppm;
          const deltaX = curL - restL;
          const forceN = Math.abs(conn.stiffness * deltaX);
          const ep = 0.5 * conn.stiffness * deltaX * deltaX;

          let ek = 0;
          if (!nA.isStatic) {
            const vA = Math.hypot(nA.vx, nA.vy) / ppm;
            const massA = conn.nodeA ? conn.nodeA.mass : 2.0;
            ek += 0.5 * massA * vA * vA;
          }
          if (!nB.isStatic) {
            const vB = Math.hypot(nB.vx, nB.vy) / ppm;
            const massB = conn.nodeB ? conn.nodeB.mass : 2.0;
            ek += 0.5 * massB * vB * vB;
          }
          const em = ek + ep;

          return {
            t: safeDec(displayTime, 2),
            l: safeDec(curL, 3),
            dx: (deltaX >= 0 ? `+${safeDec(deltaX, 3)}` : safeDec(deltaX, 3)),
            f: safeDec(forceN, 2),
            ep: safeDec(ep, 3),
            ek: safeDec(ek, 3),
            em: safeDec(em, 3)
          };
        } else {
          // Péndulo (Cuerda o Varilla Rígida)
          const pivot = (nA.isStatic || (!nB.isStatic && nA.y <= nB.y)) ? nA : nB;
          const bob = (pivot === nA) ? nB : nA;
          const bobNode = (pivot === nA) ? conn.nodeB : conn.nodeA;

          const dxPx = bob.x - pivot.x;
          const dyPx = bob.y - pivot.y;
          const angleRad = Math.atan2(dxPx, dyPx);
          const angleDeg = angleRad * (180 / Math.PI);

          const lengthM = (conn.length || dist) / ppm;
          const vM = Math.hypot(bob.vx, bob.vy) / ppm;
          const mass = bob.isStatic ? 0 : (bobNode ? bobNode.mass : 2.0);

          const hM = rf ? rf.getGravitationalHeight(bob.y) : (Math.max(0, maxY - 20 - bob.y) / ppm);
          const ek = 0.5 * mass * vM * vM;
          const ep = mass * g * hM;
          const em = ek + ep;

          let tension = 0;
          if (lengthM > 0.001 && mass > 0) {
            tension = mass * (g * Math.cos(angleRad) + (vM * vM) / lengthM);
            if (conn.type === "rope" && tension < 0) tension = 0;
          }

          return {
            t: safeDec(displayTime, 2),
            angle: safeDec(angleDeg, 1),
            h: safeDec(hM, 3),
            v: safeDec(vM, 3),
            ek: safeDec(ek, 3),
            ep: safeDec(ep, 3),
            em: safeDec(em, 3),
            tension: safeDec(tension, 2)
          };
        }
      }
    }

    return null;
  }

  renderFullTable() {
    if (!this.tableBody) return;
    if (this.rows.length === 0) {
      this.tableBody.innerHTML = `
        <tr class="table-empty-row">
          <td colspan="${this.columns.length}">Sin datos tabulados. Presiona "Grabar en Vivo" o "Tabular Historial".</td>
        </tr>`;
      return;
    }

    let html = "";
    for (let i = 0; i < this.rows.length; i++) {
      html += this.buildRowHTML(this.rows[i]);
    }
    this.tableBody.innerHTML = html;

    // Scroll automático al final
    const container = this.panel ? this.panel.querySelector(".table-scroll-container") : null;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  renderRowAppend(row) {
    if (!this.tableBody) return;
    // Si estaba el mensaje vacío, limpiarlo
    if (this.rows.length === 1) {
      this.tableBody.innerHTML = "";
    }

    const tr = document.createElement("tr");
    tr.innerHTML = this.buildRowCells(row);
    this.tableBody.appendChild(tr);

    const container = this.panel ? this.panel.querySelector(".table-scroll-container") : null;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  buildRowHTML(row) {
    return `<tr>${this.buildRowCells(row)}</tr>`;
  }

  buildRowCells(row) {
    let cells = "";
    for (const col of this.columns) {
      const val = row[col.key] !== undefined ? row[col.key] : "—";
      const style = col.align === "center" ? ' style="text-align:center;"' : "";
      cells += `<td${style}>${val}</td>`;
    }
    return cells;
  }

  clearTable() {
    this.rows = [];
    if (this.tableBody) {
      this.tableBody.innerHTML = `
        <tr class="table-empty-row">
          <td colspan="${this.columns.length}">Sin datos tabulados. Presiona "Grabar en Vivo" o "Tabular Historial".</td>
        </tr>`;
    }
    this.updateStatusInfo();
  }

  updateStatusInfo() {
    if (this.rowCountEl) {
      this.rowCountEl.textContent = `${this.rows.length} filas registradas`;
    }
    if (this.timeRangeEl) {
      if (this.rows.length > 0) {
        const tFirst = this.rows[0].t;
        const tLast = this.rows[this.rows.length - 1].t;
        this.timeRangeEl.textContent = `t ∈ [${tFirst}s .. ${tLast}s]`;
      } else {
        this.timeRangeEl.textContent = `Δt = ${this.dtSample.toFixed(2)} s`;
      }
    }
  }

  exportCSV() {
    if (this.rows.length === 0) {
      alert("No hay datos en la tabla para exportar.");
      return;
    }

    const headers = this.columns.map(c => `"${c.label.replace(/"/g, '""')}"`);
    const csvLines = [headers.join(",")];

    for (const row of this.rows) {
      const line = this.columns.map(c => {
        const val = row[c.key] !== undefined ? row[c.key] : "";
        return `"${val}"`;
      });
      csvLines.push(line.join(","));
    }

    const csvContent = csvLines.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const targetName = this.selectedTargetId === "system" ? "sistema" : `objeto_${this.selectedTargetId}`;
    link.setAttribute("href", url);
    link.setAttribute("download", `datos_fisica_${targetName}_dt${this.dtSample.toFixed(2)}s.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
