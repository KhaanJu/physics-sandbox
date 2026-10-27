/**
 * ============================================================================
 * entities.js — Clases y modelos de entidades del Sandbox
 * (Body, Anchor, Spring, Rod)
 * ============================================================================
 */

import { Vector2D } from "./vector.js";

let entityIdCounter = 0;
export function generateId(prefix = "entity") {
  return `${prefix}_${++entityIdCounter}`;
}

/**
 * Masa libre puntual con propiedades inerciales
 */
export class Body {
  constructor(options = {}) {
    this.id = options.id || generateId("body");
    this.type = "body";

    this.position = options.position ? options.position.clone() : new Vector2D();
    this.prevPosition = this.position.clone();
    this.velocity = options.velocity ? options.velocity.clone() : new Vector2D();
    this.acceleration = new Vector2D();
    this.force = new Vector2D();

    this.mass = options.mass !== undefined ? options.mass : 2.0;
    this.targetMass = this.mass;
    this.invMass = 1 / Math.max(0.0001, this.mass);
    this.isStatic = false;

    this.radius = options.radius !== undefined ? options.radius : 20;
    this.label = options.label || "m";

    // Estados de interacción
    this.isDragging = false;
    this.dragOffset = new Vector2D();
    this.isHovered = false;
  }

  setMass(m, isPaused = false) {
    const val = Math.max(0.001, m);
    if (isPaused) {
      this.mass = this.targetMass = val;
      this.invMass = 1 / this.mass;
    } else {
      this.targetMass = val;
    }
  }

  applyForce(f) {
    if (this.isDragging) return;
    this.force.add(f);
  }

  /**
   * Fase 1 de Velocity Verlet: Kick medio de velocidad y drift de posición
   * v(t + 1/2 dt) = v(t) + 1/2 a(t) * dt
   * x(t + dt) = x(t) + v(t + 1/2 dt) * dt
   */
  integratePhase1(dt) {
    if (this.isDragging) return;

    // Transición suave de masa en caliente (evita choques impulsivos al mover sliders)
    if (this.targetMass !== undefined && this.mass !== this.targetMass) {
      const factor = 1 - Math.exp(-12.0 * dt);
      this.mass += (this.targetMass - this.mass) * factor;
      if (Math.abs(this.mass - this.targetMass) < 0.005) {
        this.mass = this.targetMass;
      }
      this.invMass = 1 / Math.max(0.0001, this.mass);
    }

    this.velocity.add(Vector2D.mult(this.acceleration, 0.5 * dt));
    this.prevPosition.copy(this.position);
    this.position.add(Vector2D.mult(this.velocity, dt));
  }

  /**
   * Fase 2 de Velocity Verlet: Kick final de velocidad con aceleración en nueva posición
   * a(t + dt) = F(t + dt) * invMass
   * v(t + dt) = v(t + 1/2 dt) + 1/2 a(t + dt) * dt
   */
  integratePhase2(dt) {
    if (this.isDragging) {
      this.force.set(0, 0);
      return;
    }

    this.acceleration.copy(this.force).mult(this.invMass);
    this.velocity.add(Vector2D.mult(this.acceleration, 0.5 * dt));

    if (this.velocity.clampMag) {
      this.velocity.clampMag(3500);
    }
    this.force.set(0, 0);
  }

  /**
   * Integración numérica simpléctica completa (para compatibilidad de llamada única)
   */
  integrate(dt) {
    this.integratePhase1(dt);
    this.integratePhase2(dt);
  }

  containsPoint(point) {
    // Tolerancia generosa (+10px) para facilitar la captura con ratón o pantalla táctil
    return this.position.dist(point) <= (this.radius + 10);
  }
}

/**
 * Soporte: Soporte rígido fijo al espacio con rayado diagonal (masa infinita, posición estática)
 */
export class Anchor {
  constructor(options = {}) {
    this.id = options.id || generateId("anchor");
    this.type = "anchor";

    this.position = options.position ? options.position.clone() : new Vector2D();
    this.prevPosition = this.position.clone();
    this.velocity = new Vector2D();
    this.acceleration = new Vector2D();
    this.force = new Vector2D();

    this.mass = Infinity;
    this.invMass = 0;
    this.isStatic = true;

    this.radius = options.radius !== undefined ? options.radius : 5;
    this.label = options.label || "Soporte";

    // Inclinación o ángulo del soporte rayado (hatching) en radianes (por defecto hacia arriba: -PI/2)
    this.hatchAngle = options.hatchAngle !== undefined ? options.hatchAngle : -Math.PI / 2;
    this.hatchWidth = options.hatchWidth !== undefined ? options.hatchWidth : 44;

    this.isDragging = false;
    this.isHovered = false;
  }

  applyForce() {
    // Los soportes fijos no responden a fuerzas externas
  }

  integrate() {
    // Posición invariable
    this.velocity.set(0, 0);
    this.force.set(0, 0);
  }

  containsPoint(point) {
    // 1. Cerca del pivote articular (tolerancia de 16px)
    if (this.position.dist(point) <= 16) return true;

    // 2. Cerca de la placa base de soporte y la armadura triangular
    const angle = this.hatchAngle !== undefined ? this.hatchAngle : -Math.PI / 2;
    const barAngle = angle + Math.PI / 2;
    const norm = new Vector2D(Math.cos(angle), Math.sin(angle));
    const dir = new Vector2D(Math.cos(barAngle), Math.sin(barAngle));
    const baseCenter = Vector2D.add(this.position, Vector2D.mult(norm, 14));
    const halfW = (this.hatchWidth || 44) / 2;
    const pA = Vector2D.sub(baseCenter, Vector2D.mult(dir, halfW));
    const pB = Vector2D.add(baseCenter, Vector2D.mult(dir, halfW));

    return distPointToSegment(point, pA, pB) <= 12;
  }

  getRotationHandlePos(distance = 38) {
    const angle = this.hatchAngle !== undefined ? this.hatchAngle : -Math.PI / 2;
    return new Vector2D(
      this.position.x + Math.cos(angle) * distance,
      this.position.y + Math.sin(angle) * distance
    );
  }

  containsRotationHandle(point, tolerance = 14) {
    const hPos = this.getRotationHandlePos(38);
    return point.dist(hPos) <= tolerance;
  }
}

/**
 * Riel con Plataforma Deslizante (Linear Rail & Carriage / Slider):
 * Riel lineal con parámetros propios (longitud, inclinación/ángulo, fricción, restitución)
 * a lo largo del cual se desplaza dinámicamente una pequeña plataforma / carro móvil con masa M.
 */
export class Slider {
  constructor(options = {}) {
    this.id = options.id || generateId("slider");
    this.type = "slider";

    // Posición del centro geométrico del riel
    const initPos = options.position ? options.position.clone() : new Vector2D(500, 200);
    this.railCenter = options.railCenter ? options.railCenter.clone() : initPos.clone();

    // Parámetros propios del riel
    this.railLength = options.railLength !== undefined ? options.railLength : 400; // Longitud nominal (px)
    this.railAngle = options.railAngle !== undefined ? options.railAngle : 0;       // Inclinación en radianes (0 = horizontal)
    this.railFriction = options.railFriction !== undefined ? options.railFriction : 0; // Coeficiente de rozamiento dinámico
    this.restitution = options.restitution !== undefined ? options.restitution : 0.75; // Coeficiente de rebote en topes

    // Dimensiones de la pequeña plataforma / carro móvil
    this.width = options.width || 46;
    this.height = options.height || 16;
    this.radius = 16;
    this.label = options.label || "Riel con Carro";

    // Masa inercial de la plataforma
    this.mass = options.mass !== undefined ? options.mass : 5.0;
    this.targetMass = this.mass;
    this.invMass = 1 / Math.max(0.0001, this.mass);
    this.isStatic = false;

    this.targetRailLength = this.railLength;
    this.targetRailAngle = this.railAngle;

    // Coordenada s de la plataforma a lo largo del riel: s ∈ [-sMax, sMax]
    this.sMax = Math.max(10, (this.railLength - this.width) / 2);
    this.s = options.s !== undefined ? options.s : 0;
    this.sVel = options.sVel !== undefined ? options.sVel : 0;

    // Posición y velocidad en coordenadas del mundo de la plataforma
    this.position = new Vector2D();
    this.prevPosition = new Vector2D();
    this.velocity = new Vector2D();
    this.acceleration = new Vector2D();
    this.force = new Vector2D();

    this.updatePositionFromS();
    this.prevPosition.copy(this.position);

    // Compatibilidad retroactiva
    this.railY = this.railCenter.y;

    // Estados de interacción
    this.isDragging = false;
    this.dragTarget = "carriage"; // "carriage" | "rail"
    this.dragOffset = new Vector2D();
    this.isHovered = false;
  }

  get carriageLength() {
    return this.width || 46;
  }

  getDir() {
    return new Vector2D(Math.cos(this.railAngle), Math.sin(this.railAngle));
  }

  getNormal() {
    return new Vector2D(-Math.sin(this.railAngle), Math.cos(this.railAngle));
  }

  getRailEndpoints() {
    const dir = this.getDir();
    const halfL = this.railLength / 2;
    return {
      p1: Vector2D.sub(this.railCenter, Vector2D.mult(dir, halfL)),
      p2: Vector2D.add(this.railCenter, Vector2D.mult(dir, halfL))
    };
  }

  setRailLength(len, isPaused = false) {
    const val = Math.max(120, Math.min(1200, len));
    if (isPaused) {
      this.railLength = this.targetRailLength = val;
      this.sMax = Math.max(10, (this.railLength - this.carriageLength) / 2);
      this.s = Math.max(-this.sMax, Math.min(this.sMax, this.s));
      this.updatePositionFromS();
    } else {
      this.targetRailLength = val;
    }
  }

  setRailAngle(angle, isPaused = false) {
    if (isPaused) {
      this.railAngle = this.targetRailAngle = angle;
      this.updatePositionFromS();
    } else {
      this.targetRailAngle = angle;
    }
  }

  setMass(m, isPaused = false) {
    const val = Math.max(0.1, m);
    if (isPaused) {
      this.mass = this.targetMass = val;
      this.invMass = 1 / this.mass;
    } else {
      this.targetMass = val;
    }
  }

  updatePositionFromS() {
    if (isNaN(this.s)) this.s = 0;
    const maxS = this.sMax !== undefined ? this.sMax : Math.max(10, (this.railLength - this.carriageLength) / 2);
    this.s = Math.max(-maxS, Math.min(maxS, this.s));
    const dir = this.getDir();
    this.position.x = this.railCenter.x + dir.x * this.s;
    this.position.y = this.railCenter.y + dir.y * this.s;
    this.velocity.x = dir.x * (this.sVel || 0);
    this.velocity.y = dir.y * (this.sVel || 0);
    this.railY = this.railCenter.y;
  }

  projectOnRail() {
    const dir = this.getDir();
    const relX = this.position.x - this.railCenter.x;
    const relY = this.position.y - this.railCenter.y;
    const maxS = this.sMax !== undefined ? this.sMax : Math.max(10, (this.railLength - this.carriageLength) / 2);
    const rawS = relX * dir.x + relY * dir.y;
    this.s = isNaN(rawS) ? 0 : Math.max(-maxS, Math.min(maxS, rawS));
    this.updatePositionFromS();
  }

  projectVelocityOnRail() {
    const dir = this.getDir();
    this.sVel = this.velocity.dot(dir);
    this.velocity.x = dir.x * this.sVel;
    this.velocity.y = dir.y * this.sVel;
  }

  applyForce(f) {
    if (this.isDragging) return;
    this.force.add(f);
  }

  /**
   * Fase 1 de Velocity Verlet: Kick medio de velocidad tangencial y drift de posición s
   */
  integratePhase1(dt) {
    // Transiciones continuas de parámetros en caliente
    if (this.targetRailAngle !== undefined && this.railAngle !== this.targetRailAngle) {
      let diff = this.targetRailAngle - this.railAngle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) < 0.001) {
        this.railAngle = this.targetRailAngle;
      } else {
        const factor = 1 - Math.exp(-12.0 * dt);
        this.railAngle += diff * factor;
      }
      this.updatePositionFromS();
    }

    if (this.targetRailLength !== undefined && this.railLength !== this.targetRailLength) {
      const factor = 1 - Math.exp(-12.0 * dt);
      this.railLength += (this.targetRailLength - this.railLength) * factor;
      if (Math.abs(this.railLength - this.targetRailLength) < 0.5) {
        this.railLength = this.targetRailLength;
      }
      this.sMax = Math.max(10, (this.railLength - this.carriageLength) / 2);
      this.s = Math.max(-this.sMax, Math.min(this.sMax, this.s));
      this.updatePositionFromS();
    }

    if (this.targetMass !== undefined && this.mass !== this.targetMass) {
      const factor = 1 - Math.exp(-12.0 * dt);
      this.mass += (this.targetMass - this.mass) * factor;
      if (Math.abs(this.mass - this.targetMass) < 0.005) {
        this.mass = this.targetMass;
      }
      this.invMass = 1 / Math.max(0.0001, this.mass);
    }

    if (this.isDragging) {
      this.force.set(0, 0);
      this.sVel = 0;
      this.velocity.set(0, 0);
      this.updatePositionFromS();
      return;
    }

    // Kick medio de velocidad: v_s(t + 1/2 dt) = v_s(t) + 1/2 a * dt
    this.sVel = (this.sVel || 0) + 0.5 * (this.accel || 0) * dt;

    // Drift de posición a lo largo del riel: s(t + dt) = s(t) + v_s(t + 1/2 dt) * dt
    this.s = (this.s || 0) + this.sVel * dt;
    this.prevPosition.copy(this.position);
    this.updatePositionFromS();
  }

  /**
   * Evaluación de aceleración tangencial a lo largo del riel
   */
  computeForces(gravity, defaultDamping = 0) {
    if (this.isDragging) {
      this.accel = 0;
      this.acceleration.set(0, 0);
      return;
    }

    const dir = this.getDir();
    const fParallel = this.force.dot(dir);
    const fgParallel = this.mass * gravity.dot(dir);
    let netF = fParallel + fgParallel;

    if (this.railFriction > 0 && Math.abs(this.sVel) > 0.001) {
      const normal = this.getNormal();
      const fn = Math.abs(this.mass * gravity.dot(normal) + this.force.dot(normal));
      const fFric = Math.min(Math.abs(netF) + 15, this.railFriction * fn) * Math.sign(this.sVel);
      netF -= fFric;
    }

    if (defaultDamping > 0) {
      netF -= defaultDamping * this.sVel;
    }

    this.accel = netF * this.invMass;
    this.acceleration.copy(dir).mult(this.accel);
  }

  /**
   * Fase 2 de Velocity Verlet: Kick final de velocidad tangencial y topes mecánicos
   */
  integratePhase2(dt) {
    if (this.isDragging) {
      this.force.set(0, 0);
      return;
    }

    // Kick 2: v_s(t + dt) = v_s(t + 1/2 dt) + 1/2 a(t + dt) * dt
    this.sVel = (this.sVel || 0) + 0.5 * (this.accel || 0) * dt;

    // Rebote elástico contra los topes mecánicos en los extremos del riel
    const maxS = this.sMax !== undefined ? this.sMax : Math.max(10, (this.railLength - this.carriageLength) / 2);
    if (this.s >= maxS) {
      this.s = maxS;
      if (this.sVel > 0) {
        this.sVel = -this.sVel * (this.restitution !== undefined ? this.restitution : 0.75);
        if (Math.abs(this.sVel) < 0.05) this.sVel = 0;
      }
    } else if (this.s <= -maxS) {
      this.s = -maxS;
      if (this.sVel < 0) {
        this.sVel = -this.sVel * (this.restitution !== undefined ? this.restitution : 0.75);
        if (Math.abs(this.sVel) < 0.05) this.sVel = 0;
      }
    }

    this.updatePositionFromS();
    if (this.velocity && this.velocity.clampMag) {
      this.velocity.clampMag(3500);
    }
    this.force.set(0, 0);
  }

  /**
   * Integración numérica a lo largo del riel considerando fuerzas transmitidas,
   * componente gravitatoria a lo largo de la inclinación del riel, rozamiento y topes elásticos
   */
  integrate(dt, gravity = new Vector2D(0, 981)) {
    this.integratePhase1(dt);
    this.computeForces(gravity, 0);
    this.integratePhase2(dt);
  }

  containsPoint(point) {
    // 1. Verificar si el punto está sobre la plataforma o su perno de conexión
    if (this.position.dist(point) <= 18) return true;
    const halfW = this.width / 2 + 8;
    const halfH = this.height / 2 + 8;
    const dir = this.getDir();
    const normal = this.getNormal();
    const dx = point.x - this.position.x;
    const dy = point.y - this.position.y;
    if (Math.abs(dx * dir.x + dy * dir.y) <= halfW && Math.abs(dx * normal.x + dy * normal.y) <= halfH) {
      return true;
    }

    // 2. Verificar si está cerca de la barra del riel
    const ends = this.getRailEndpoints();
    return distPointToSegment(point, ends.p1, ends.p2) <= 14;
  }

  containsCarriage(point) {
    if (this.position.dist(point) <= 18) return true;
    const halfW = this.width / 2 + 8;
    const halfH = this.height / 2 + 8;
    const dir = this.getDir();
    const normal = this.getNormal();
    const dx = point.x - this.position.x;
    const dy = point.y - this.position.y;
    return Math.abs(dx * dir.x + dy * dir.y) <= halfW && Math.abs(dx * normal.x + dy * normal.y) <= halfH;
  }
}

export const Rail = Slider;
export const RailSlider = Slider;
export const Riel = Slider;

/**
 * Riel Motorizado (Motorized Rail Slider / Linear Actuator):
 * Variante activa que acciona mecánicamente la plataforma mediante un motor eléctrico,
 * desplazándola de extremo a extremo en vaivén continuo armónico con velocidad ajustable
 * sin colisionar con los topes de carrera.
 */
export class MotorizedSlider extends Slider {
  constructor(options = {}) {
    super({
      ...options,
      label: options.label || "Riel Motorizado",
      mass: options.mass !== undefined ? options.mass : 8.0
    });
    this.isMotorized = true;
    this.sliderType = "motorized";
    this.motorSpeed = options.motorSpeed !== undefined ? options.motorSpeed : 1.5; // m/s
    this.targetMotorSpeed = this.motorSpeed;
    this.motorAmplitude = options.motorAmplitude !== undefined ? options.motorAmplitude : 0.90; // 90% carrera
    this.targetMotorAmplitude = this.motorAmplitude;
    this.motorEnabled = options.motorEnabled !== undefined ? options.motorEnabled : true;
    this.motorPhase = options.motorPhase !== undefined ? options.motorPhase : 0; // rad
    this.motorProfile = options.motorProfile || "harmonic";
  }

  setMotorSpeed(v, isPaused = false) {
    const val = Math.max(0.05, Math.min(8.0, v));
    if (isPaused) {
      this.motorSpeed = this.targetMotorSpeed = val;
    } else {
      this.targetMotorSpeed = val;
    }
  }

  setMotorAmplitude(ratio, isPaused = false) {
    const val = Math.max(0.3, Math.min(0.95, ratio));
    if (isPaused) {
      this.motorAmplitude = this.targetMotorAmplitude = val;
    } else {
      this.targetMotorAmplitude = val;
    }
  }

  setMotorEnabled(enabled) {
    this.motorEnabled = !!enabled;
    if (!this.motorEnabled) {
      this.sVel = 0;
      this.velocity.set(0, 0);
    }
  }

  integrate(dt, gravity = new Vector2D(0, 981), ppm = 100) {
    // Transiciones continuas de ángulo y longitud del riel
    if (this.targetRailAngle !== undefined && this.railAngle !== this.targetRailAngle) {
      let diff = this.targetRailAngle - this.railAngle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) < 0.001) {
        this.railAngle = this.targetRailAngle;
      } else {
        const factor = 1 - Math.exp(-12.0 * dt);
        this.railAngle += diff * factor;
      }
      this.updatePositionFromS();
    }

    if (this.targetRailLength !== undefined && this.railLength !== this.targetRailLength) {
      const factor = 1 - Math.exp(-12.0 * dt);
      this.railLength += (this.targetRailLength - this.railLength) * factor;
      if (Math.abs(this.railLength - this.targetRailLength) < 0.5) {
        this.railLength = this.targetRailLength;
      }
      this.sMax = Math.max(10, (this.railLength - this.carriageLength) / 2);
    }

    // Transición suave de velocidad y amplitud del actuador lineal
    if (this.targetMotorSpeed !== undefined && this.motorSpeed !== this.targetMotorSpeed) {
      const factor = 1 - Math.exp(-12.0 * dt);
      this.motorSpeed += (this.targetMotorSpeed - this.motorSpeed) * factor;
      if (Math.abs(this.motorSpeed - this.targetMotorSpeed) < 0.005) {
        this.motorSpeed = this.targetMotorSpeed;
      }
    }

    if (this.targetMotorAmplitude !== undefined && this.motorAmplitude !== this.targetMotorAmplitude) {
      const factor = 1 - Math.exp(-12.0 * dt);
      this.motorAmplitude += (this.targetMotorAmplitude - this.motorAmplitude) * factor;
      if (Math.abs(this.motorAmplitude - this.targetMotorAmplitude) < 0.002) {
        this.motorAmplitude = this.targetMotorAmplitude;
      }
    }

    if (this.isDragging) {
      this.force.set(0, 0);
      this.sVel = 0;
      this.velocity.set(0, 0);
      this.updatePositionFromS();
      const maxA = this.sMax * Math.max(0.3, Math.min(0.95, this.motorAmplitude));
      if (maxA > 1) {
        const clampedS = Math.max(-maxA, Math.min(maxA, this.s));
        this.motorPhase = Math.asin(clampedS / maxA);
      }
      return;
    }

    if (!this.motorEnabled) {
      this.sVel = 0;
      this.velocity.set(0, 0);
      this.updatePositionFromS();
      this.force.set(0, 0);
      return;
    }

    // Amplitud de carrera sin chocar contra el límite (extremo a extremo seguro)
    const maxA = this.sMax * Math.max(0.3, Math.min(0.95, this.motorAmplitude));
    const vPeak = this.motorSpeed * ppm;
    const omega = maxA > 1 ? (vPeak / maxA) : 1;

    this.motorPhase += omega * dt;
    if (this.motorPhase > 2 * Math.PI) {
      this.motorPhase -= 2 * Math.PI;
    } else if (this.motorPhase < 0) {
      this.motorPhase += 2 * Math.PI;
    }

    this.s = maxA * Math.sin(this.motorPhase);
    this.sVel = maxA * omega * Math.cos(this.motorPhase);

    this.updatePositionFromS();
    if (this.velocity && this.velocity.clampMag) {
      this.velocity.clampMag(3500);
    }
    this.force.set(0, 0);
  }

  integratePhase1(dt, gravity = new Vector2D(0, 981), ppm = 100) {
    if (this.motorEnabled) {
      this.integrate(dt, gravity, ppm);
    } else {
      super.integratePhase1(dt);
    }
  }

  computeForces(gravity, defaultDamping = 0) {
    if (!this.motorEnabled) {
      super.computeForces(gravity, defaultDamping);
    }
  }

  integratePhase2(dt) {
    if (!this.motorEnabled) {
      super.integratePhase2(dt);
    }
  }
}

export const MotorizedRail = MotorizedSlider;
export const RielMotorizado = MotorizedSlider;

// Alias exportados para máxima claridad semántica
export const Soporte = Anchor;
export const Muelle = Anchor; // Alias para compatibilidad retroactiva

/**
 * Resorte: Conector elástico bajo la Ley de Hooke y amortiguamiento lineal
 */
export class Spring {
  constructor(nodeA, nodeB, options = {}) {
    this.id = options.id || generateId("spring");
    this.type = "spring";

    this.nodeA = nodeA;
    this.nodeB = nodeB;

    // Longitud en reposo (L0). Por defecto es la distancia de colocación
    this.restLength = options.restLength !== undefined ? options.restLength : nodeA.position.dist(nodeB.position);
    this.targetRestLength = this.restLength;
    this.stiffness = options.stiffness !== undefined ? options.stiffness : 35; // k (N/m)
    this.targetStiffness = this.stiffness;
    this.damping = options.damping !== undefined ? options.damping : 0;        // c (N·s/m), 0 por defecto para MAS conservativo

    // Restricciones de eje propias del resorte para oscilaciones guiadas y acopladas 1D
    this.lockX = !!options.lockX;
    this.lockY = !!options.lockY;
    this.lockedXVal = options.lockedXVal !== undefined ? options.lockedXVal : null;
    this.lockedYVal = options.lockedYVal !== undefined ? options.lockedYVal : null;

    // Parámetros de renderizado en zigzag
    this.coils = options.coils || 12;
    this.amplitude = options.amplitude || 12;
    this.leadLength = options.leadLength || 14;

    this.currentLength = nodeA.position.dist(nodeB.position);
    this.currentForce = 0;
    this.isHovered = false;
  }

  setStiffness(k, isPaused = false) {
    const val = Math.max(1, k);
    if (isPaused) {
      this.stiffness = this.targetStiffness = val;
    } else {
      this.targetStiffness = val;
    }
  }

  setRestLength(L, isPaused = false) {
    const val = Math.max(10, L);
    if (isPaused) {
      this.restLength = this.targetRestLength = val;
    } else {
      this.targetRestLength = val;
    }
  }

  setLockX(locked) {
    this.lockX = !!locked;
    if (this.lockX) {
      // Tomar como referencia X el nodo anclado si existe, o el nodo A
      this.lockedXVal = this.nodeA.isStatic ? this.nodeA.position.x : (this.nodeB.isStatic ? this.nodeB.position.x : this.nodeA.position.x);
      if (!this.nodeA.isStatic) {
        this.nodeA.position.x = this.lockedXVal;
        this.nodeA.velocity.x = 0;
        this.nodeA.force.x = 0;
      }
      if (!this.nodeB.isStatic) {
        this.nodeB.position.x = this.lockedXVal;
        this.nodeB.velocity.x = 0;
        this.nodeB.force.x = 0;
      }
    } else {
      this.lockedXVal = null;
    }
  }

  setLockY(locked) {
    this.lockY = !!locked;
    if (this.lockY) {
      // Tomar como referencia Y el nodo anclado si existe, o el nodo A
      this.lockedYVal = this.nodeA.isStatic ? this.nodeA.position.y : (this.nodeB.isStatic ? this.nodeB.position.y : this.nodeA.position.y);
      if (!this.nodeA.isStatic) {
        this.nodeA.position.y = this.lockedYVal;
        this.nodeA.velocity.y = 0;
        this.nodeA.force.y = 0;
      }
      if (!this.nodeB.isStatic) {
        this.nodeB.position.y = this.lockedYVal;
        this.nodeB.velocity.y = 0;
        this.nodeB.force.y = 0;
      }
    } else {
      this.lockedYVal = null;
    }
  }

  update(dt, ppm = 100) {
    // Transición suave de parámetros en caliente
    if (this.targetRestLength !== undefined && this.restLength !== this.targetRestLength) {
      const factor = 1 - Math.exp(-12.0 * dt);
      this.restLength += (this.targetRestLength - this.restLength) * factor;
      if (Math.abs(this.restLength - this.targetRestLength) < 0.1) {
        this.restLength = this.targetRestLength;
      }
    }
    if (this.targetStiffness !== undefined && this.stiffness !== this.targetStiffness) {
      const factor = 1 - Math.exp(-12.0 * dt);
      this.stiffness += (this.targetStiffness - this.stiffness) * factor;
      if (Math.abs(this.stiffness - this.targetStiffness) < 0.1) {
        this.stiffness = this.targetStiffness;
      }
    }

    // 1. Resorte con eje Y bloqueado (oscilación puramente horizontal en X, gravedad equilibrada por el riel)
    if (this.lockY) {
      const dxPx = this.nodeB.position.x - this.nodeA.position.x;
      const distPx = Math.abs(dxPx);
      this.currentLength = distPx;
      if (distPx < 0.0001) return;

      const sign = dxPx >= 0 ? 1 : -1;
      const elongationM = (distPx - this.restLength) / ppm;
      const fHookeN = -this.stiffness * elongationM;

      const relVxM = (this.nodeB.velocity.x - this.nodeA.velocity.x) / ppm;
      const fDampN = -this.damping * relVxM * sign;

      const totalFN = fHookeN + fDampN;
      this.currentForce = totalFN;

      const fSimX = totalFN * ppm * sign;
      this.nodeB.applyForce(new Vector2D(fSimX, 0));
      this.nodeA.applyForce(new Vector2D(-fSimX, 0));
      return;
    }

    // 2. Resorte con eje X bloqueado (oscilación puramente vertical en Y)
    if (this.lockX) {
      const dyPx = this.nodeB.position.y - this.nodeA.position.y;
      const distPx = Math.abs(dyPx);
      this.currentLength = distPx;
      if (distPx < 0.0001) return;

      const sign = dyPx >= 0 ? 1 : -1;
      const elongationM = (distPx - this.restLength) / ppm;
      const fHookeN = -this.stiffness * elongationM;

      const relVyM = (this.nodeB.velocity.y - this.nodeA.velocity.y) / ppm;
      const fDampN = -this.damping * relVyM * sign;

      const totalFN = fHookeN + fDampN;
      this.currentForce = totalFN;

      const fSimY = totalFN * ppm * sign;
      this.nodeB.applyForce(new Vector2D(0, fSimY));
      this.nodeA.applyForce(new Vector2D(0, -fSimY));
      return;
    }

    // 3. Resorte 2D estándar
    const delta = Vector2D.sub(this.nodeB.position, this.nodeA.position);
    const dist = delta.mag();
    this.currentLength = dist;

    if (dist < 0.0001) return;

    const normal = Vector2D.mult(delta, 1 / dist);
    const elongationMeters = (dist - this.restLength) / ppm;
    const fHookeNewtons = -this.stiffness * elongationMeters;

    const relVelPx = Vector2D.sub(this.nodeB.velocity, this.nodeA.velocity);
    const relVelMeters = relVelPx.dot(normal) / ppm;
    const fDampingNewtons = -this.damping * relVelMeters;

    const totalFNewtons = fHookeNewtons + fDampingNewtons;
    this.currentForce = totalFNewtons;

    const forceSim = totalFNewtons * ppm;
    this.nodeB.applyForce(Vector2D.mult(normal, forceSim));
    this.nodeA.applyForce(Vector2D.mult(normal, -forceSim));
  }

  isPointNear(point, tolerance = 12) {
    return distPointToSegment(point, this.nodeA.position, this.nodeB.position) <= tolerance;
  }
}

function solvePositionConstraintPair(nodeA, nodeB, targetLength, isRope = false) {
  const pA = nodeA.position;
  const pB = nodeB.position;

  const delta = Vector2D.sub(pB, pA);
  const currentDist = delta.mag();
  if (currentDist < 0.0001) {
    return { isTaut: false };
  }

  const diff = currentDist - targetLength;
  if (isRope) {
    if (diff <= 0) {
      return { isTaut: false };
    }
  }

  const normal = Vector2D.mult(delta, 1 / currentDist);

  const aStatic = nodeA.isStatic;
  const bStatic = nodeB.isStatic;
  if (aStatic && bStatic) return { isTaut: true };

  const aIsSlider = nodeA.type === "slider";
  const bIsSlider = nodeB.type === "slider";

  const aDrag = nodeA.isDragging;
  const bDrag = nodeB.isDragging;

  // 1. Si el nodo A es soporte fijo (Anchor)
  if (aStatic) {
    if (bIsSlider) {
      const reqB = Vector2D.mult(normal, -diff);
      const dirB = nodeB.getDir();
      const ds = reqB.dot(dirB);
      const oldS = nodeB.s;
      const maxS = nodeB.sMax;
      nodeB.s = Math.max(-maxS, Math.min(maxS, oldS + ds));
      nodeB.updatePositionFromS();
    } else {
      nodeB.position.sub(Vector2D.mult(normal, diff));
    }
    return { isTaut: true };
  }

  // 2. Si el nodo B es soporte fijo (Anchor)
  if (bStatic) {
    if (aIsSlider) {
      const reqA = Vector2D.mult(normal, diff);
      const dirA = nodeA.getDir();
      const ds = reqA.dot(dirA);
      const oldS = nodeA.s;
      const maxS = nodeA.sMax;
      nodeA.s = Math.max(-maxS, Math.min(maxS, oldS + ds));
      nodeA.updatePositionFromS();
    } else {
      nodeA.position.add(Vector2D.mult(normal, diff));
    }
    return { isTaut: true };
  }

  // 2b. Si el nodo A es un Riel Motorizado activo, su motor gobierna la posición cinemática
  if (aIsSlider && nodeA.isMotorized && nodeA.motorEnabled && !aDrag) {
    if (bIsSlider && !bDrag) {
      const reqB = Vector2D.mult(normal, -diff);
      const dirB = nodeB.getDir();
      const ds = reqB.dot(dirB);
      nodeB.s = Math.max(-nodeB.sMax, Math.min(nodeB.sMax, nodeB.s + ds));
      nodeB.updatePositionFromS();
    } else {
      nodeB.position.sub(Vector2D.mult(normal, diff));
    }
    return { isTaut: true };
  }

  // 2c. Si el nodo B es un Riel Motorizado activo
  if (bIsSlider && nodeB.isMotorized && nodeB.motorEnabled && !bDrag) {
    if (aIsSlider && !aDrag) {
      const reqA = Vector2D.mult(normal, diff);
      const dirA = nodeA.getDir();
      const ds = reqA.dot(dirA);
      nodeA.s = Math.max(-nodeA.sMax, Math.min(nodeA.sMax, nodeA.s + ds));
      nodeA.updatePositionFromS();
    } else {
      nodeA.position.add(Vector2D.mult(normal, diff));
    }
    return { isTaut: true };
  }

  // 3. Si ambos son Sliders pasivos
  if (aIsSlider && bIsSlider) {
    if (!aDrag) {
      const reqA = Vector2D.mult(normal, diff * 0.5);
      const dirA = nodeA.getDir();
      const dsA = reqA.dot(dirA);
      nodeA.s = Math.max(-nodeA.sMax, Math.min(nodeA.sMax, nodeA.s + dsA));
      nodeA.updatePositionFromS();
    }
    if (!bDrag) {
      const reqB = Vector2D.mult(normal, -diff * 0.5);
      const dirB = nodeB.getDir();
      const dsB = reqB.dot(dirB);
      nodeB.s = Math.max(-nodeB.sMax, Math.min(nodeB.sMax, nodeB.s + dsB));
      nodeB.updatePositionFromS();
    }
    return { isTaut: true };
  }

  // 4. Si el nodo A es Slider y el nodo B es masa libre
  if (aIsSlider && !bIsSlider) {
    if (aDrag) {
      // El usuario arrastra el carro: el carro se queda en su posición del riel y la masa se ajusta
      nodeB.position.sub(Vector2D.mult(normal, diff));
      return { isTaut: true };
    }

    let fA = 1.0;
    if (!bDrag) {
      const wA = nodeA.invMass;
      const wB = nodeB.invMass;
      const wSum = wA + wB;
      fA = wSum > 0 ? (wA / wSum) : 0.5;
    }

    const reqDispA = Vector2D.mult(normal, diff * fA);
    const dirA = nodeA.getDir();
    const ds = reqDispA.dot(dirA);
    const oldS = nodeA.s;
    const maxS = nodeA.sMax;
    const newS = Math.max(-maxS, Math.min(maxS, oldS + ds));
    nodeA.s = newS;
    nodeA.updatePositionFromS();

    const actualDeltaA = Vector2D.mult(dirA, newS - oldS);
    const deltaB = Vector2D.sub(actualDeltaA, Vector2D.mult(normal, diff));
    nodeB.position.add(deltaB);
    return { isTaut: true };
  }

  // 5. Si el nodo B es Slider y el nodo A es masa libre
  if (bIsSlider && !aIsSlider) {
    if (bDrag) {
      nodeA.position.add(Vector2D.mult(normal, diff));
      return { isTaut: true };
    }

    let fB = 1.0;
    if (!aDrag) {
      const wA = nodeA.invMass;
      const wB = nodeB.invMass;
      const wSum = wA + wB;
      fB = wSum > 0 ? (wB / wSum) : 0.5;
    }

    const reqDispB = Vector2D.mult(normal, -diff * fB);
    const dirB = nodeB.getDir();
    const ds = reqDispB.dot(dirB);
    const oldS = nodeB.s;
    const maxS = nodeB.sMax;
    const newS = Math.max(-maxS, Math.min(maxS, oldS + ds));
    nodeB.s = newS;
    nodeB.updatePositionFromS();

    const actualDeltaB = Vector2D.mult(dirB, newS - oldS);
    const deltaA = Vector2D.add(actualDeltaB, Vector2D.mult(normal, diff));
    nodeA.position.add(deltaA);
    return { isTaut: true };
  }

  // 6. Dos partículas libres estándar
  if (aDrag && !bDrag) {
    nodeB.position.sub(Vector2D.mult(normal, diff));
    return { isTaut: true };
  }
  if (bDrag && !aDrag) {
    nodeA.position.add(Vector2D.mult(normal, diff));
    return { isTaut: true };
  }

  const wA = nodeA.invMass;
  const wB = nodeB.invMass;
  const wSum = wA + wB;
  if (wSum === 0) return { isTaut: true };

  const corrA = diff * (wA / wSum);
  const corrB = diff * (wB / wSum);
  nodeA.position.add(Vector2D.mult(normal, corrA));
  nodeB.position.sub(Vector2D.mult(normal, corrB));
  return { isTaut: true };
}

/**
 * Varilla rígida inelástica (Rod) que mantiene una distancia fija invariable
 * Implementada mediante resolución de restricción de distancia (Distance Constraint)
 */
export class Rod {
  constructor(nodeA, nodeB, options = {}) {
    this.id = options.id || generateId("rod");
    this.type = "rod";

    this.nodeA = nodeA;
    this.nodeB = nodeB;

    // Distancia fija invariable
    this.length = options.length !== undefined ? options.length : nodeA.position.dist(nodeB.position);
    this.targetLength = this.length;
    this.pinRadius = options.pinRadius || 3.5;
    this.isHovered = false;
  }

  setLength(L, isPaused = false) {
    const val = Math.max(10, L);
    if (isPaused) {
      this.length = this.targetLength = val;
    } else {
      this.targetLength = val;
    }
  }

  update(dt) {
    if (this.targetLength !== undefined && this.length !== this.targetLength) {
      const factor = 1 - Math.exp(-12.0 * dt);
      this.length += (this.targetLength - this.length) * factor;
      if (Math.abs(this.length - this.targetLength) < 0.1) {
        this.length = this.targetLength;
      }
    }
  }

  /**
   * Resuelve la restricción de distancia geométrica (Position Based Dynamics)
   * Garantiza rigidez perfecta tanto en ejecución como al arrastrar en pausa
   */
  solvePositionConstraint() {
    solvePositionConstraintPair(this.nodeA, this.nodeB, this.length, false);
  }

  /**
   * Proyecta velocidades a lo largo del eje de la varilla para eliminar
   * la velocidad radial relativa sin inyectar aceleración tangencial espuria
   */
  solveVelocityConstraint() {
    const delta = Vector2D.sub(this.nodeB.position, this.nodeA.position);
    const currentDist = delta.mag();
    if (currentDist < 0.0001) return;

    const normal = Vector2D.mult(delta, 1 / currentDist);
    const relVel = Vector2D.sub(this.nodeB.velocity, this.nodeA.velocity);
    const normalVel = relVel.dot(normal);

    const aPinned = this.nodeA.isStatic || this.nodeA.isDragging || (this.nodeA.isMotorized && this.nodeA.motorEnabled);
    const bPinned = this.nodeB.isStatic || this.nodeB.isDragging || (this.nodeB.isMotorized && this.nodeB.motorEnabled);

    if (aPinned && !bPinned) {
      this.nodeB.velocity.sub(Vector2D.mult(normal, normalVel));
      if (this.nodeB.type === "slider") {
        if (this.nodeB.projectVelocityOnRail) this.nodeB.projectVelocityOnRail();
        else this.nodeB.velocity.y = 0;
      }
      return;
    }
    if (bPinned && !aPinned) {
      this.nodeA.velocity.add(Vector2D.mult(normal, normalVel));
      if (this.nodeA.type === "slider") {
        if (this.nodeA.projectVelocityOnRail) this.nodeA.projectVelocityOnRail();
        else this.nodeA.velocity.y = 0;
      }
      return;
    }

    const wA = aPinned ? 0 : this.nodeA.invMass;
    const wB = bPinned ? 0 : this.nodeB.invMass;
    const wSum = wA + wB;
    if (wSum === 0) return;

    // Impulso para anular la componente radial de velocidad relativa
    const impulse = normalVel / wSum;
    if (!aPinned) {
      this.nodeA.velocity.add(Vector2D.mult(normal, impulse * wA));
    }
    if (!bPinned) {
      this.nodeB.velocity.sub(Vector2D.mult(normal, impulse * wB));
    }

    if (this.nodeA.type === "slider") {
      if (this.nodeA.projectVelocityOnRail) this.nodeA.projectVelocityOnRail();
      else this.nodeA.velocity.y = 0;
    }
    if (this.nodeB.type === "slider") {
      if (this.nodeB.projectVelocityOnRail) this.nodeB.projectVelocityOnRail();
      else this.nodeB.velocity.y = 0;
    }
  }

  isPointNear(point, tolerance = 12) {
    return distPointToSegment(point, this.nodeA.position, this.nodeB.position) <= tolerance;
  }
}

/**
 * Cuerda ideal flexible inelástica (Rope) para péndulo simple y ligaduras mecánicas
 * - Restricción unilateral: C(r_A, r_B) = ||r_B - r_A|| - L_0 <= 0
 * - Inelástica: no permite elongación superior a L_0 (tensión T > 0)
 * - Flexible: si dist < L_0, la tensión se anula (T = 0) y no resiste compresión ni flexión
 */
export class Rope {
  constructor(nodeA, nodeB, options = {}) {
    this.id = options.id || generateId("rope");
    this.type = "rope";

    this.nodeA = nodeA;
    this.nodeB = nodeB;

    // Longitud nominal máxima fija (L_0)
    const initDist = nodeA.position.dist(nodeB.position);
    this.length = options.length !== undefined ? options.length : Math.max(10, initDist);
    this.targetLength = this.length;
    this.isTaut = true; // Estado de tensión
    this.tension = 0;   // Estimación escalar de fuerza de tensión
    this.isHovered = false;
  }

  setLength(L, isPaused = false) {
    const val = Math.max(10, L);
    if (isPaused) {
      this.length = this.targetLength = val;
    } else {
      this.targetLength = val;
    }
  }

  update(dt) {
    if (this.targetLength !== undefined && this.length !== this.targetLength) {
      const factor = 1 - Math.exp(-12.0 * dt);
      this.length += (this.targetLength - this.length) * factor;
      if (Math.abs(this.length - this.targetLength) < 0.1) {
        this.length = this.targetLength;
      }
    }
  }

  /**
   * Resuelve la restricción de posición unilateral (PBD):
   * Si ||r_B - r_A|| > L_0 se proyectan posiciones para anular elongación.
   * Si ||r_B - r_A|| <= L_0, no se aplica fuerza ni restricción (cuerda floja).
   */
  solvePositionConstraint() {
    const res = solvePositionConstraintPair(this.nodeA, this.nodeB, this.length, true);
    this.isTaut = res ? res.isTaut : false;
  }

  /**
   * Resuelve la restricción de velocidad en la cuerda (choque inelástico de tensado):
   * Anula la velocidad de alejamiento normal sin transformar espuriamente la velocidad radial en tangencial
   */
  solveVelocityConstraint() {
    const delta = Vector2D.sub(this.nodeB.position, this.nodeA.position);
    const currentDist = delta.mag();
    if (currentDist < this.length - 0.5) {
      this.isTaut = false;
      return;
    }

    const normal = Vector2D.mult(delta, 1 / Math.max(0.0001, currentDist));
    const relVel = Vector2D.sub(this.nodeB.velocity, this.nodeA.velocity);
    const normalVel = relVel.dot(normal);

    // Solo se aplica si las partículas intentan alejarse aún más (normalVel > 0)
    if (normalVel <= 0) return;

    const aPinned = this.nodeA.isStatic || this.nodeA.isDragging || (this.nodeA.isMotorized && this.nodeA.motorEnabled);
    const bPinned = this.nodeB.isStatic || this.nodeB.isDragging || (this.nodeB.isMotorized && this.nodeB.motorEnabled);

    if (aPinned && !bPinned) {
      this.nodeB.velocity.sub(Vector2D.mult(normal, normalVel));
      if (this.nodeB.type === "slider") {
        if (this.nodeB.projectVelocityOnRail) this.nodeB.projectVelocityOnRail();
        else this.nodeB.velocity.y = 0;
      }
      return;
    }
    if (bPinned && !aPinned) {
      this.nodeA.velocity.add(Vector2D.mult(normal, normalVel));
      if (this.nodeA.type === "slider") {
        if (this.nodeA.projectVelocityOnRail) this.nodeA.projectVelocityOnRail();
        else this.nodeA.velocity.y = 0;
      }
      return;
    }

    const wA = aPinned ? 0 : this.nodeA.invMass;
    const wB = bPinned ? 0 : this.nodeB.invMass;
    const wSum = wA + wB;
    if (wSum === 0) return;

    const impulse = normalVel / wSum;
    if (!aPinned) {
      this.nodeA.velocity.add(Vector2D.mult(normal, impulse * wA));
    }
    if (!bPinned) {
      this.nodeB.velocity.sub(Vector2D.mult(normal, impulse * wB));
    }

    if (this.nodeA.type === "slider") {
      if (this.nodeA.projectVelocityOnRail) this.nodeA.projectVelocityOnRail();
      else this.nodeA.velocity.y = 0;
    }
    if (this.nodeB.type === "slider") {
      if (this.nodeB.projectVelocityOnRail) this.nodeB.projectVelocityOnRail();
      else this.nodeB.velocity.y = 0;
    }
  }

  isPointNear(point, tolerance = 12) {
    return distPointToSegment(point, this.nodeA.position, this.nodeB.position) <= tolerance;
  }
}

/**
 * Función matemática auxiliar: distancia mínima de un punto a un segmento rectilíneo
 */
export function distPointToSegment(p, a, b) {
  const ab = Vector2D.sub(b, a);
  const ap = Vector2D.sub(p, a);
  const abLenSq = ab.magSq();

  if (abLenSq === 0) return p.dist(a);

  // Proyección escalar clamped entre [0, 1]
  const t = Math.max(0, Math.min(1, ap.dot(ab) / abLenSq));
  const projection = Vector2D.add(a, Vector2D.mult(ab, t));
  return p.dist(projection);
}
