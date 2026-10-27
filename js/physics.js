/**
 * ============================================================================
 * physics.js — Motor de física, fuerzas y resolución de restricciones
 * ============================================================================
 */

import { Vector2D } from "./vector.js";
import { ReferenceFrame } from "./reference_frame.js";

export class PhysicsEngine {
  constructor() {
    this.nodes = [];        // Body | Anchor
    this.connectors = [];   // Spring | Rod

    // Hoja técnica finita de dibujo (delimitada, cómoda para recorrer)
    this.sheet = { width: 1400, height: 900, padding: 20 };
    this.bounds = { width: this.sheet.width, height: this.sheet.height, padding: this.sheet.padding };

    // Sistema de Referencia Global (Ejes, Escala SI, Nivel Datum Ep=0)
    this.pixelsPerMeter = 100;     // 100 px = 1 metro (escala de laboratorio)
    this.referenceFrame = new ReferenceFrame(this, { pixelsPerMeter: this.pixelsPerMeter });

    // Parámetros físicos globales (Escala calibrada: 100 px = 1.0 m)
    this.gravityVal = 9.81;        // m/s²
    this.targetGravityVal = this.gravityVal;
    this.gravity = new Vector2D(0, this.gravityVal * this.pixelsPerMeter);

    this.defaultStiffness = 35.0;  // N/m (rango ideal 5..150 N/m)
    this.defaultDamping = 0.0;     // N·s/m (0.0 por defecto: sistema armónico ideal conservativo)
    this.defaultMass = 2.0;        // kg (rango ideal 0.2..10.0 kg)

    // Precisión y estabilidad numérica
    this.subSteps = 16;
    this.rodConstraintIterations = 10;
    this.isPaused = false;

    // Control temporal, repetibilidad y retroceso (Rewind)
    this.timeScale = 1.0;
    this.snapshot = null;
    this.simulationTime = 0;
    this.history = [];
    this.historyIndex = -1;
    this.maxHistoryFrames = 1800; // 30s a 60 fps

    // Hoja técnica finita de dibujo (delimitada, cómoda para recorrer)
    this.sheet = { width: 1400, height: 900, padding: 20 };
    this.bounds = { width: this.sheet.width, height: this.sheet.height, padding: this.sheet.padding };
    this.restitution = 0.35;
    this.friction = 0.96;
  }

  setTimeScale(scale) {
    if (isNaN(scale) || scale <= 0) return;
    this.timeScale = Math.max(0.05, Math.min(2.0, scale));
  }

  setGravity(val, isPaused = this.isPaused) {
    const g = Math.max(0, val);
    if (isPaused) {
      this.gravityVal = this.targetGravityVal = g;
      this.gravity.set(0, this.gravityVal * this.pixelsPerMeter);
    } else {
      this.targetGravityVal = g;
    }
  }

  setPixelsPerMeter(ppm) {
    if (isNaN(ppm) || ppm <= 0) return;
    this.pixelsPerMeter = ppm;
    if (this.referenceFrame) {
      this.referenceFrame.setPixelsPerMeter(ppm);
    }
    this.gravity.set(0, this.gravityVal * this.pixelsPerMeter);
  }

  setBodyMass(m, isPaused = this.isPaused) {
    this.defaultMass = Math.max(0.1, m);
    for (const node of this.nodes) {
      if (!node.isStatic && node.setMass) {
        node.setMass(this.defaultMass, isPaused);
      }
    }
  }

  setStiffness(k, isPaused = this.isPaused) {
    this.defaultStiffness = Math.max(1, k);
    // Actualizar resortes existentes que no tengan override manual
    for (const conn of this.connectors) {
      if (conn.type === "spring" && conn.setStiffness) {
        conn.setStiffness(this.defaultStiffness, isPaused);
      } else if (conn.type === "spring") {
        conn.stiffness = this.defaultStiffness;
      }
    }
  }

  setDamping(c) {
    this.defaultDamping = Math.max(0, c);
    for (const conn of this.connectors) {
      if (conn.type === "spring") {
        conn.damping = 0; // El amortiguamiento se aplica unificadamente sobre los cuerpos en movimiento
      }
    }
  }

  /**
   * Detecta dinámicamente qué parámetros físicos tienen efecto en el lienzo actual
   */
  getDetectableParameters() {
    const hasMasses = this.nodes.some((n) => !n.isStatic);
    const hasSprings = this.connectors.some((c) => c.type === "spring");
    const hasRods = this.connectors.some((c) => c.type === "rod");
    const hasRopes = this.connectors.some((c) => c.type === "rope");
    const hasAnchors = this.nodes.some((n) => n.isStatic);

    const canVaryGravity = hasMasses;
    const canVaryDamping = hasMasses || hasSprings || hasRopes || hasRods;

    const activeParamCount =
      (canVaryGravity ? 1 : 0) +
      (canVaryDamping ? 1 : 0);

    return {
      hasMasses,
      hasSprings,
      hasRods,
      hasRopes,
      hasAnchors,
      canVaryGravity,
      canVaryDamping,
      activeParamCount
    };
  }

  addNode(node) {
    if (!node.isStatic && this.defaultMass !== 2.0 && node.mass === 2.0) {
      node.setMass(this.defaultMass);
    }
    this.nodes.push(node);
    return node;
  }

  removeNode(node) {
    const idx = this.nodes.indexOf(node);
    if (idx !== -1) {
      this.nodes.splice(idx, 1);
    }
    // Remover automáticamente todos los conectores vinculados al nodo
    this.connectors = this.connectors.filter(
      (c) => c.nodeA !== node && c.nodeB !== node
    );
  }

  addConnector(connector) {
    // Evitar duplicados entre los mismos dos nodos
    const exists = this.connectors.some(
      (c) =>
        (c.nodeA === connector.nodeA && c.nodeB === connector.nodeB) ||
        (c.nodeA === connector.nodeB && c.nodeB === connector.nodeA)
    );
    if (!exists && connector.nodeA !== connector.nodeB) {
      if (connector.type === "spring") {
        connector.damping = 0; // El amortiguamiento se aplica de forma unificada a todos los cuerpos móviles
      }
      this.connectors.push(connector);
      return connector;
    }
    return null;
  }

  removeConnector(connector) {
    const idx = this.connectors.indexOf(connector);
    if (idx !== -1) {
      this.connectors.splice(idx, 1);
    }
  }

  clear() {
    this.nodes = [];
    this.connectors = [];
    this.snapshot = null;
    this.clearHistory();
  }

  /**
   * Guarda el estado inicial del montaje para repetibilidad experimental
   */
  saveSnapshot() {
    this.snapshot = {
      nodes: this.nodes.map((node) => ({
        node,
        x: node.position.x,
        y: node.position.y,
        vx: node.velocity.x,
        vy: node.velocity.y,
        mass: node.mass,
        radius: node.radius,
        railCenter: node.railCenter ? { x: node.railCenter.x, y: node.railCenter.y } : null,
        railLength: node.railLength,
        railAngle: node.railAngle,
        railFriction: node.railFriction,
        restitution: node.restitution,
        s: node.s,
        sVel: node.sVel,
        isMotorized: !!node.isMotorized,
        motorSpeed: node.motorSpeed,
        motorAmplitude: node.motorAmplitude,
        motorEnabled: node.motorEnabled,
        motorPhase: node.motorPhase,
        railY: node.railY !== undefined ? node.railY : null,
        hatchWidth: node.hatchWidth,
        hatchAngle: node.hatchAngle !== undefined ? node.hatchAngle : null
      })),
      connectors: this.connectors.map((c) => ({
        connector: c,
        stiffness: c.stiffness,
        restLength: c.restLength !== undefined ? c.restLength : 0,
        length: c.length !== undefined ? c.length : 0,
        lockX: !!c.lockX,
        lockY: !!c.lockY,
        lockedXVal: c.lockedXVal,
        lockedYVal: c.lockedYVal
      })),
      referenceFrame: this.referenceFrame ? {
        originX: this.referenceFrame.origin.x,
        originY: this.referenceFrame.origin.y,
        pixelsPerMeter: this.referenceFrame.pixelsPerMeter,
        potentialZeroY: this.referenceFrame.potentialZeroY,
        showAxes: this.referenceFrame.showAxes,
        showGrid: this.referenceFrame.showGrid,
        showPotentialZero: this.referenceFrame.showPotentialZero
      } : null
    };
    this.clearHistory();
    this.recordHistoryState();
  }

  /**
   * Restablece el montaje a sus posiciones y configuraciones iniciales con velocidad cero
   */
  restoreSnapshot() {
    if (!this.snapshot || !this.snapshot.nodes) {
      this.saveSnapshot();
      return false;
    }

    for (const item of this.snapshot.nodes) {
      if (this.nodes.includes(item.node)) {
        item.node.position.set(item.x, item.y);
        item.node.velocity.set(0, 0);
        item.node.force.set(0, 0);
        item.node.isDragging = false;
        if (item.node.type === "slider") {
          if (item.railCenter && item.node.railCenter) {
            item.node.railCenter.set(item.railCenter.x, item.railCenter.y);
          }
          if (item.railLength !== undefined && item.node.setRailLength) item.node.setRailLength(item.railLength);
          if (item.railAngle !== undefined && item.node.setRailAngle) item.node.setRailAngle(item.railAngle);
          if (item.railFriction !== undefined) item.node.railFriction = item.railFriction;
          if (item.restitution !== undefined) item.node.restitution = item.restitution;
          if (item.isMotorized !== undefined) item.node.isMotorized = item.isMotorized;
          if (item.motorSpeed !== undefined) item.node.motorSpeed = item.motorSpeed;
          if (item.motorAmplitude !== undefined) item.node.motorAmplitude = item.motorAmplitude;
          if (item.motorEnabled !== undefined) item.node.motorEnabled = item.motorEnabled;
          if (item.motorPhase !== undefined) item.node.motorPhase = item.motorPhase;
          item.node.s = item.s !== undefined ? item.s : 0;
          item.node.sVel = 0;
          if (item.node.updatePositionFromS) item.node.updatePositionFromS();
          item.node.velocity.set(0, 0);
        }
        if (item.mass !== undefined && !item.node.isStatic) {
          item.node.setMass(item.mass);
        }
        if (item.radius !== undefined && item.node.radius !== undefined) {
          item.node.radius = item.radius;
        }
        if (item.hatchWidth !== undefined && item.node.hatchWidth !== undefined) {
          item.node.hatchWidth = item.hatchWidth;
        }
        if (item.hatchAngle !== null && item.node.hatchAngle !== undefined) {
          item.node.hatchAngle = item.hatchAngle;
        }
      }
    }

    for (const item of (this.snapshot.connectors || [])) {
      if (this.connectors.includes(item.connector)) {
        if (item.stiffness !== undefined && item.connector.stiffness !== undefined) {
          item.connector.stiffness = item.stiffness;
        }
        if (item.restLength && item.connector.restLength !== undefined) {
          item.connector.restLength = item.restLength;
        }
        if (item.length && item.connector.length !== undefined) {
          item.connector.length = item.length;
        }
        if (item.connector.type === "spring") {
          item.connector.lockX = !!item.lockX;
          item.connector.lockY = !!item.lockY;
          item.connector.lockedXVal = item.lockedXVal;
          item.connector.lockedYVal = item.lockedYVal;
        }
      }
    }

    // Asegurar que todos los nodos queden en reposo y sin arrastre
    for (const node of this.nodes) {
      node.velocity.set(0, 0);
      node.force.set(0, 0);
      node.acceleration.set(0, 0);
      node.isDragging = false;
    }

    if (this.snapshot.referenceFrame && this.referenceFrame) {
      const rf = this.snapshot.referenceFrame;
      this.referenceFrame.origin.set(rf.originX, rf.originY);
      this.referenceFrame.pixelsPerMeter = rf.pixelsPerMeter;
      this.pixelsPerMeter = rf.pixelsPerMeter;
      this.referenceFrame.potentialZeroY = rf.potentialZeroY;
      this.referenceFrame.showAxes = rf.showAxes;
      this.referenceFrame.showGrid = rf.showGrid;
      this.referenceFrame.showPotentialZero = rf.showPotentialZero;
    }

    // Resolver restricciones geométricas de varillas y cuerdas inmediatamente
    this.solveConstraints(false);
    this.computeForcesAndAccelerations();
    this._initializedAccelerations = true;
    this.clearHistory();
    this.recordHistoryState();
    return true;
  }

  /**
   * Registra un fotograma en el historial de movimiento
   */
  recordHistoryState() {
    // Si se retrocedió en el tiempo y se reanuda la simulación física, truncar el futuro
    if (this.historyIndex >= 0 && this.historyIndex < this.history.length - 1) {
      this.history.length = this.historyIndex + 1;
    }

    const frame = {
      time: this.simulationTime,
      nodes: this.nodes.map((node) => ({
        node,
        x: node.position.x,
        y: node.position.y,
        vx: node.velocity.x,
        vy: node.velocity.y,
        fx: node.force.x,
        fy: node.force.y,
        isStatic: node.isStatic,
        s: node.s !== undefined ? node.s : null,
        sVel: node.sVel !== undefined ? node.sVel : null,
        railLength: node.railLength,
        railAngle: node.railAngle,
        railCenterX: node.railCenter ? node.railCenter.x : null,
        railCenterY: node.railCenter ? node.railCenter.y : null,
        railY: node.railY !== undefined ? node.railY : null,
        motorPhase: node.motorPhase !== undefined ? node.motorPhase : null,
        hatchAngle: node.hatchAngle !== undefined ? node.hatchAngle : null
      })),
      connectors: this.connectors.map((c) => ({
        connector: c,
        lockX: !!c.lockX,
        lockY: !!c.lockY,
        lockedXVal: c.lockedXVal,
        lockedYVal: c.lockedYVal
      }))
    };

    this.history.push(frame);
    if (this.history.length > this.maxHistoryFrames) {
      this.history.shift();
    }
    this.historyIndex = this.history.length - 1;
  }

  /**
   * Aplica un fotograma del historial restaurando posiciones y velocidades físicas exactas
   */
  applyHistoryFrame(frame) {
    if (!frame || !frame.nodes) return;
    this.simulationTime = frame.time;

    for (const item of frame.nodes) {
      if (this.nodes.includes(item.node)) {
        item.node.position.set(item.x, item.y);
        item.node.velocity.set(item.vx, item.vy);
        item.node.force.set(item.fx, item.fy);
        item.node.isDragging = false;
        if (item.node.type === "slider") {
          if (item.s !== null && item.node.s !== undefined) {
            item.node.s = item.s;
            item.node.sVel = item.sVel || 0;
          }
          if (item.railLength !== undefined && item.node.railLength !== undefined) {
            item.node.railLength = item.railLength;
          }
          if (item.railAngle !== undefined && item.node.railAngle !== undefined) {
            item.node.railAngle = item.railAngle;
          }
          if (item.railCenterX != null && item.node.railCenter) {
            item.node.railCenter.set(item.railCenterX, item.railCenterY);
          }
          if (item.motorPhase != null && item.node.motorPhase !== undefined) {
            item.node.motorPhase = item.motorPhase;
          }
          if (item.node.updatePositionFromS) item.node.updatePositionFromS();
        }
        if (item.hatchAngle !== null && item.node.hatchAngle !== undefined) {
          item.node.hatchAngle = item.hatchAngle;
        }
      }
    }

    if (frame.connectors) {
      for (const item of frame.connectors) {
        if (this.connectors.includes(item.connector) && item.connector.type === "spring") {
          item.connector.lockX = !!item.lockX;
          item.connector.lockY = !!item.lockY;
          item.connector.lockedXVal = item.lockedXVal;
          item.connector.lockedYVal = item.lockedYVal;
        }
      }
    }

    this.solveConstraints(false);
  }

  /**
   * Retrocede un fotograma en el historial grabado
   */
  stepBackward() {
    if (this.history.length === 0) return false;
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.applyHistoryFrame(this.history[this.historyIndex]);
      return true;
    } else if (this.historyIndex === 0) {
      this.applyHistoryFrame(this.history[0]);
      return false;
    }
    return false;
  }

  /**
   * Avanza un fotograma: desde el historial si existe o simulando física si estamos al final
   */
  stepForward(dt) {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.applyHistoryFrame(this.history[this.historyIndex]);
      return true;
    } else {
      this.step(dt, true);
      return true;
    }
  }

  /**
   * Salta a un fotograma específico en el historial
   */
  seekHistoryIndex(index) {
    if (index < 0 || index >= this.history.length) return;
    this.historyIndex = index;
    this.applyHistoryFrame(this.history[this.historyIndex]);
  }

  /**
   * Limpia el búfer de historial
   */
  clearHistory() {
    this.history = [];
    this.historyIndex = -1;
    this.simulationTime = 0;
  }

  /**
   * Evalúa las fuerzas físicas netas y calcula las aceleraciones instantáneas
   * correspondientes a las posiciones actuales (Gravedad, Resortes, Amortiguamiento, Tensiones)
   */
  computeForcesAndAccelerations(subDt = (1 / 60) / this.subSteps) {
    // 1. Resetear fuerzas acumuladas y aplicar gravedad / amortiguamiento
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      node.force.set(0, 0);
      if (node.isStatic || node.isDragging) continue;

      if (node.type !== "slider") {
        let cancelsGravityY = false;
        let cancelsForceX = false;
        for (let j = 0; j < this.connectors.length; j++) {
          const conn = this.connectors[j];
          if (conn.type === "spring" && (conn.nodeA === node || conn.nodeB === node)) {
            if (conn.lockY) cancelsGravityY = true;
            if (conn.lockX) cancelsForceX = true;
          }
        }

        if (!cancelsGravityY) {
          node.applyForce(Vector2D.mult(this.gravity, node.mass));
        }

        if (this.defaultDamping > 0) {
          const fDamp = Vector2D.mult(node.velocity, -this.defaultDamping);
          if (cancelsGravityY) fDamp.y = 0;
          if (cancelsForceX) fDamp.x = 0;
          node.applyForce(fDamp);
        }
      }
    }

    // 2. Fuerzas elásticas de resortes y conectores
    for (let i = 0; i < this.connectors.length; i++) {
      const conn = this.connectors[i];
      if (conn.type === "spring") {
        conn.update(subDt, this.pixelsPerMeter);
      } else if (conn.update) {
        conn.update(subDt);
      }
    }

    // 3. Fuerzas sobre carros en rieles
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      if (node.type === "slider" && !node.isDragging && (!node.isMotorized || !node.motorEnabled)) {
        if (node.computeForces) {
          node.computeForces(this.gravity, this.defaultDamping);
        }
      }
    }

    // 4. Cancelación de componente radial para varillas rígidas y cuerdas en tensión
    // La tensión interna anula la fuerza normal, garantizando conservación estricta de energía
    for (let i = 0; i < this.connectors.length; i++) {
      const conn = this.connectors[i];
      if (conn.type === "rod" || conn.type === "rope") {
        const delta = Vector2D.sub(conn.nodeB.position, conn.nodeA.position);
        const r = delta.mag();
        if (r > 0.0001) {
          const normal = Vector2D.mult(delta, 1 / r);
          const aPinned = conn.nodeA.isStatic || conn.nodeA.isDragging || (conn.nodeA.isMotorized && conn.nodeA.motorEnabled);
          const bPinned = conn.nodeB.isStatic || conn.nodeB.isDragging || (conn.nodeB.isMotorized && conn.nodeB.motorEnabled);

          if (aPinned && !bPinned) {
            const fRad = conn.nodeB.force.dot(normal);
            if (conn.type === "rod" || fRad > 0) {
              conn.nodeB.force.sub(Vector2D.mult(normal, fRad));
            }
          } else if (bPinned && !aPinned) {
            const fRad = conn.nodeA.force.dot(normal);
            if (conn.type === "rod" || fRad < 0) {
              conn.nodeA.force.sub(Vector2D.mult(normal, fRad));
            }
          }
        }
      }
    }

    // 5. Asignar aceleración a los cuerpos libres
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      if (!node.isStatic && !node.isDragging && node.type !== "slider") {
        node.acceleration.copy(node.force).mult(node.invMass);
      }
    }
  }

  /**
   * Bucle de simulación física simpléctica de segundo orden (Velocity Verlet)
   * Conserva de manera estricta la energía mecánica total (E_k + E_p) en ausencia de disipación
   */
  step(dt, force = false) {
    if (this.isPaused && !force) return;

    this.simulationTime += dt;

    // Transición suave y continua de gravedad global al manipular deslizadores
    if (this.targetGravityVal !== undefined && this.gravityVal !== this.targetGravityVal) {
      const factor = 1 - Math.exp(-12.0 * dt);
      this.gravityVal += (this.targetGravityVal - this.gravityVal) * factor;
      if (Math.abs(this.gravityVal - this.targetGravityVal) < 0.01) {
        this.gravityVal = this.targetGravityVal;
      }
      this.gravity.set(0, this.gravityVal * this.pixelsPerMeter);
    }

    const subDt = dt / this.subSteps;

    // Asegurar que las aceleraciones iniciales estén sincronizadas
    if (!this._initializedAccelerations) {
      this.computeForcesAndAccelerations(subDt);
      this._initializedAccelerations = true;
    }

    for (let s = 0; s < this.subSteps; s++) {
      // 1. FASE 1: Kick medio de velocidad y drift de posición (Velocity Verlet)
      for (let i = 0; i < this.nodes.length; i++) {
        const node = this.nodes[i];
        if (node.isStatic || node.isDragging) continue;

        if (node.integratePhase1) {
          node.integratePhase1(subDt, this.gravity, this.pixelsPerMeter);
        } else {
          node.integrate(subDt, this.gravity, this.pixelsPerMeter);
        }
      }

      // 2. Restricciones geométricas de posición (Position Based Dynamics)
      for (let iter = 0; iter < this.rodConstraintIterations; iter++) {
        for (let i = 0; i < this.connectors.length; i++) {
          const conn = this.connectors[i];
          if (conn.type === "rod" || conn.type === "rope") {
            conn.solvePositionConstraint();
          }
        }
      }

      // Imponer restricciones de guía lineal 1D según los resortes con bloqueo uniaxial
      for (let i = 0; i < this.connectors.length; i++) {
        const conn = this.connectors[i];
        if (conn.type === "spring") {
          if (conn.lockY) {
            const ly = (conn.lockedYVal != null) ? conn.lockedYVal : (conn.nodeA.isStatic ? conn.nodeA.position.y : (conn.nodeB.isStatic ? conn.nodeB.position.y : conn.nodeA.position.y));
            conn.lockedYVal = ly;
            if (!conn.nodeA.isStatic && !conn.nodeA.isDragging) conn.nodeA.position.y = ly;
            if (!conn.nodeB.isStatic && !conn.nodeB.isDragging) conn.nodeB.position.y = ly;
          }
          if (conn.lockX) {
            const lx = (conn.lockedXVal != null) ? conn.lockedXVal : (conn.nodeA.isStatic ? conn.nodeA.position.x : (conn.nodeB.isStatic ? conn.nodeB.position.x : conn.nodeA.position.x));
            conn.lockedXVal = lx;
            if (!conn.nodeA.isStatic && !conn.nodeA.isDragging) conn.nodeA.position.x = lx;
            if (!conn.nodeB.isStatic && !conn.nodeB.isDragging) conn.nodeB.position.x = lx;
          }
        }
      }

      // Restricción de riel estricto para Soportes de Riel
      for (let i = 0; i < this.nodes.length; i++) {
        const node = this.nodes[i];
        if (node.type === "slider" && !node.isDragging && (!node.isMotorized || !node.motorEnabled)) {
          if (node.projectOnRail) node.projectOnRail();
        }
      }

      // Restricción de límites de la hoja finita
      this.resolveBounds();

      // 3. Evaluación de fuerzas y aceleraciones en las nuevas posiciones x(t + dt)
      this.computeForcesAndAccelerations(subDt);

      // 4. FASE 2: Kick final de velocidad v(t + dt) en fase con la posición
      for (let i = 0; i < this.nodes.length; i++) {
        const node = this.nodes[i];
        if (node.isStatic || node.isDragging) continue;

        if (node.integratePhase2) {
          node.integratePhase2(subDt);
        }
      }

      // 5. Restricciones cinemáticas de velocidad (RATTLE / Varillas / Cuerdas / Rieles)
      for (let i = 0; i < this.connectors.length; i++) {
        const conn = this.connectors[i];
        if (conn.type === "rod" || conn.type === "rope") {
          conn.solveVelocityConstraint();
        }
        if (conn.type === "spring") {
          if (conn.lockY) {
            if (!conn.nodeA.isStatic && !conn.nodeA.isDragging) conn.nodeA.velocity.y = 0;
            if (!conn.nodeB.isStatic && !conn.nodeB.isDragging) conn.nodeB.velocity.y = 0;
          }
          if (conn.lockX) {
            if (!conn.nodeA.isStatic && !conn.nodeA.isDragging) conn.nodeA.velocity.x = 0;
            if (!conn.nodeB.isStatic && !conn.nodeB.isDragging) conn.nodeB.velocity.x = 0;
          }
        }
      }

      for (let i = 0; i < this.nodes.length; i++) {
        const node = this.nodes[i];
        if (node.type === "slider" && !node.isDragging && (!node.isMotorized || !node.motorEnabled)) {
          if (node.projectVelocityOnRail) node.projectVelocityOnRail();
        }
      }
    }

    // Registrar fotograma en el historial de movimiento
    this.recordHistoryState();
  }

  /**
   * Resuelve restricciones geométricas y cinemáticas de varillas rígidas y cuerdas inelásticas
   * (Position Based Dynamics con sub-iteraciones)
   */
  solveConstraints(solveVelocity = true) {
    const rigidConnectors = this.connectors.filter(
      (c) => c.type === "rod" || c.type === "rope"
    );
    if (rigidConnectors.length === 0) return;

    for (let iter = 0; iter < this.rodConstraintIterations; iter++) {
      for (let i = 0; i < rigidConnectors.length; i++) {
        rigidConnectors[i].solvePositionConstraint();
      }
    }
    if (solveVelocity) {
      for (let i = 0; i < rigidConnectors.length; i++) {
        rigidConnectors[i].solveVelocityConstraint();
      }
    }
  }

  solveRodConstraints(solveVelocity = true) {
    this.solveConstraints(solveVelocity);
  }

  resolveBounds() {
    const pad = this.sheet ? this.sheet.padding : 20;
    const minX = pad;
    const maxX = (this.sheet ? this.sheet.width : 1400) - pad;
    const minY = pad;
    const maxY = (this.sheet ? this.sheet.height : 900) - pad;

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      if (node.isStatic) continue;

      // Si es un Soporte de Riel, su plataforma se mantiene fiel al recorrido del riel
      if (node.type === "slider") {
        if (node.projectOnRail) {
          node.projectOnRail();
        }
        continue;
      }

      if (node.isDragging) continue;

      const r = node.radius || 20;

      // 1. Límite inferior (borde inferior de la hoja)
      if (node.position.y + r >= maxY) {
        node.position.y = maxY - r;

        // Rebote o reposo según umbral cinético
        if (node.velocity.y > 0) {
          if (node.velocity.y < 0.25 * this.pixelsPerMeter) {
            node.velocity.y = 0;
          } else {
            node.velocity.y = -node.velocity.y * this.restitution;
          }
        }

        // Fricción tangencial en la superficie inferior
        node.velocity.x *= this.friction;
        if (Math.abs(node.velocity.x) < 0.02) {
          node.velocity.x = 0;
        }
      }

      // 2. Límite superior (borde superior de la hoja)
      if (node.position.y - r <= minY) {
        node.position.y = minY + r;
        if (node.velocity.y < 0) {
          node.velocity.y = -node.velocity.y * this.restitution;
        }
      }

      // 3. Límite izquierdo (borde lateral izquierdo)
      if (node.position.x - r <= minX) {
        node.position.x = minX + r;
        if (node.velocity.x < 0) {
          node.velocity.x = -node.velocity.x * this.restitution;
        }
      }

      // 4. Límite derecho (borde lateral derecho)
      if (node.position.x + r >= maxX) {
        node.position.x = maxX - r;
        if (node.velocity.x > 0) {
          node.velocity.x = -node.velocity.x * this.restitution;
        }
      }
    }
  }

  /**
   * Búsqueda espacial de nodos bajo el puntero
   */
  findNodeAt(point, margin = 6) {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      if (node.containsPoint && node.containsPoint(point)) {
        return node;
      }
      const radius = (node.radius || 16) + margin;
      if (node.position.dist(point) <= radius) {
        return node;
      }
    }
    return null;
  }

  /**
   * Búsqueda espacial de conectores bajo el puntero
   */
  findConnectorAt(point, tolerance = 12) {
    for (let i = this.connectors.length - 1; i >= 0; i--) {
      const conn = this.connectors[i];
      if (conn.isPointNear(point, tolerance)) {
        return conn;
      }
    }
    return null;
  }

  /**
   * Cálculo de telemetría de energía mecánica exacta (Joules en SI)
   * E_total = E_cinética + E_elástica + E_gravitatoria
   */
  calculateTelemetry() {
    const ppm = this.pixelsPerMeter;
    const maxY = (this.sheet ? this.sheet.height : 900) - (this.sheet ? this.sheet.padding : 20);

    let kineticEnergy = 0;
    let elasticEnergy = 0;
    let gravitationalEnergy = 0;
    let movingBodies = 0;
    let avgSpeed = 0;

    for (const node of this.nodes) {
      if (!node.isStatic) {
        // Velocidad en m/s
        const speedM = node.velocity.mag() / ppm;
        kineticEnergy += 0.5 * node.mass * speedM * speedM;
        avgSpeed += speedM;

        // Altura respecto al nivel cero de energía potencial gravitatoria (Datum) en metros
        const heightM = this.referenceFrame
          ? this.referenceFrame.getGravitationalHeight(node.position.y)
          : (maxY - node.position.y) / ppm;
        gravitationalEnergy += node.mass * this.gravityVal * heightM;

        movingBodies++;
      }
    }

    for (const conn of this.connectors) {
      if (conn.type === "spring") {
        const elongM = (conn.currentLength - conn.restLength) / ppm;
        elasticEnergy += 0.5 * conn.stiffness * elongM * elongM;
      }
    }

    if (movingBodies > 0) avgSpeed /= movingBodies;

    const potentialEnergy = elasticEnergy + gravitationalEnergy;
    const totalEnergy = kineticEnergy + potentialEnergy;

    return {
      nodeCount: this.nodes.length,
      connectorCount: this.connectors.length,
      kineticEnergy,
      elasticEnergy,
      gravitationalEnergy,
      potentialEnergy,
      totalEnergy,
      avgSpeed
    };
  }
}
