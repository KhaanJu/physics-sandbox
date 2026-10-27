/**
 * bundle.js — Bundle autónomo universal para 2D Physics Sandbox
 * Generado automáticamente a partir de los módulos en js/
 * Permite ejecución nativa directa tanto en http:// como en file:/// sin restricciones de CORS.
 */
(function() {
"use strict";


/* ==========================================================================
   FILE: js/vector.js
   ========================================================================== */
/**
 * ============================================================================
 * vector.js — Clase Vector2D para operaciones de álgebra lineal en 2D
 * ============================================================================
 */

class Vector2D {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  copy(v) {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  clone() {
    return new Vector2D(this.x, this.y);
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  mult(s) {
    this.x *= s;
    this.y *= s;
    return this;
  }

  div(s) {
    if (s !== 0) {
      this.x /= s;
      this.y /= s;
    }
    return this;
  }

  magSq() {
    return this.x * this.x + this.y * this.y;
  }

  mag() {
    return Math.sqrt(this.magSq());
  }

  normalize() {
    const m = this.mag();
    if (m > 0.000001) {
      this.div(m);
    } else {
      this.set(0, 0);
    }
    return this;
  }

  clampMag(max) {
    const mSq = this.magSq();
    if (mSq > max * max) {
      const m = Math.sqrt(mSq);
      if (m > 0.000001) {
        this.mult(max / m);
      }
    }
    return this;
  }

  dot(v) {
    return this.x * v.x + this.y * v.y;
  }

  dist(v) {
    return Math.hypot(this.x - v.x, this.y - v.y);
  }

  distSq(v) {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return dx * dx + dy * dy;
  }

  perpendicular() {
    // Vector unitario perpendicular a la izquierda (-y, x)
    return new Vector2D(-this.y, this.x);
  }

  angle() {
    return Math.atan2(this.y, this.x);
  }

  // Métodos estáticos auxiliares (operaciones puras sin mutación)
  static add(v1, v2) {
    return new Vector2D(v1.x + v2.x, v1.y + v2.y);
  }

  static sub(v1, v2) {
    return new Vector2D(v1.x - v2.x, v1.y - v2.y);
  }

  static mult(v, s) {
    return new Vector2D(v.x * s, v.y * s);
  }

  static div(v, s) {
    return new Vector2D(s !== 0 ? v.x / s : 0, s !== 0 ? v.y / s : 0);
  }

  static dist(v1, v2) {
    return Math.hypot(v1.x - v2.x, v1.y - v2.y);
  }

  static dot(v1, v2) {
    return v1.x * v2.x + v1.y * v2.y;
  }

  static fromAngle(angle, length = 1) {
    return new Vector2D(Math.cos(angle) * length, Math.sin(angle) * length);
  }
}


/* ==========================================================================
   FILE: js/entities.js
   ========================================================================== */
/**
 * ============================================================================
 * entities.js — Clases y modelos de entidades del Sandbox
 * (Body, Anchor, Spring, Rod)
 * ============================================================================
 */


let entityIdCounter = 0;
function generateId(prefix = "entity") {
  return `${prefix}_${++entityIdCounter}`;
}

/**
 * Masa libre puntual con propiedades inerciales
 */
class Body {
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
class Anchor {
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
class Slider {
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

const Rail = Slider;
const RailSlider = Slider;
const Riel = Slider;

/**
 * Riel Motorizado (Motorized Rail Slider / Linear Actuator):
 * Variante activa que acciona mecánicamente la plataforma mediante un motor eléctrico,
 * desplazándola de extremo a extremo en vaivén continuo armónico con velocidad ajustable
 * sin colisionar con los topes de carrera.
 */
class MotorizedSlider extends Slider {
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

const MotorizedRail = MotorizedSlider;
const RielMotorizado = MotorizedSlider;

// Alias exportados para máxima claridad semántica
const Soporte = Anchor;
const Muelle = Anchor; // Alias para compatibilidad retroactiva

/**
 * Resorte: Conector elástico bajo la Ley de Hooke y amortiguamiento lineal
 */
class Spring {
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
class Rod {
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
class Rope {
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
function distPointToSegment(p, a, b) {
  const ab = Vector2D.sub(b, a);
  const ap = Vector2D.sub(p, a);
  const abLenSq = ab.magSq();

  if (abLenSq === 0) return p.dist(a);

  // Proyección escalar clamped entre [0, 1]
  const t = Math.max(0, Math.min(1, ap.dot(ab) / abLenSq));
  const projection = Vector2D.add(a, Vector2D.mult(ab, t));
  return p.dist(projection);
}


/* ==========================================================================
   FILE: js/reference_frame.js
   ========================================================================== */
/**
 * ============================================================================
 * reference_frame.js — Sistema de Referencia Global Configurable
 * Centraliza las transformaciones de coordenadas, conversión píxeles/metros
 * en el Sistema Internacional (SI) y nivel cero de energía potencial gravitatoria.
 * ============================================================================
 */


class ReferenceFrame {
  constructor(engine, options = {}) {
    this.engine = engine;

    // Dimensiones de la hoja de trabajo técnica
    const sheetW = (engine && engine.sheet) ? engine.sheet.width : 1400;
    const sheetH = (engine && engine.sheet) ? engine.sheet.height : 900;

    // Origen de coordenadas (0, 0) en coordenadas de mundo (píxeles en la hoja técnica)
    // Por defecto: centrado horizontalmente y situado en la base técnica inferior (y = 750)
    const defaultX = options.originX !== undefined ? options.originX : Math.floor(sheetW / 2);
    const defaultY = options.originY !== undefined ? options.originY : (sheetH - 150);

    this.origin = new Vector2D(defaultX, defaultY);

    // Escala métrica: cantidad de píxeles que equivalen a 1.0 metro (SI)
    this.pixelsPerMeter = options.pixelsPerMeter !== undefined ? options.pixelsPerMeter : (engine ? engine.pixelsPerMeter : 100);

    // Nivel cero de energía potencial gravitatoria (Datum line) en coordenadas de mundo (Y píxeles)
    // Por defecto: alineado exactamente con la altura del origen de coordenadas (y = 0 m)
    this.potentialZeroY = options.potentialZeroY !== undefined ? options.potentialZeroY : this.origin.y;

    // Visibilidad de elementos de referencia
    this.showAxes = options.showAxes !== undefined ? options.showAxes : true;
    this.showGrid = options.showGrid !== undefined ? options.showGrid : true;
    this.showPotentialZero = options.showPotentialZero !== undefined ? options.showPotentialZero : true;
    this.showCursorCoords = options.showCursorCoords !== undefined ? options.showCursorCoords : true;

    // Convención física clásica: +Y apunta hacia arriba (ascenso), +X hacia la derecha
    this.yAxisUp = options.yAxisUp !== undefined ? options.yAxisUp : true;

    // Estados de interacción directa en lienzo
    this.isDraggingOrigin = false;
    this.isDraggingDatum = false;
    this.isHoveredOrigin = false;
    this.isHoveredDatum = false;
    this.isSnappedDatum = false;
    this.snapLabel = null;

    // Tolerancias de interacción en pantalla (píxeles de mundo)
    this.originHandleRadius = 14;
    this.datumHandleTolerance = 8;
  }

  // ==========================================================================
  // TRANSFORMACIONES DE COORDENADAS (MUNDO PIXELS <-> FÍSICA METROS SI)
  // ==========================================================================

  /**
   * Convierte una coordenada X del mundo (px) a coordenada física X en metros
   */
  toPhysicalX(worldX) {
    const val = (worldX - this.origin.x) / this.pixelsPerMeter;
    return Math.abs(val) < 1e-4 ? 0 : val;
  }

  /**
   * Convierte una coordenada Y del mundo (px) a coordenada física Y en metros
   * Según convención estándar: +Y apunta hacia arriba
   */
  toPhysicalY(worldY) {
    const val = this.yAxisUp
      ? (this.origin.y - worldY) / this.pixelsPerMeter
      : (worldY - this.origin.y) / this.pixelsPerMeter;
    return Math.abs(val) < 1e-4 ? 0 : val;
  }

  /**
   * Convierte un vector de posición de mundo a Vector2D físico en metros (SI)
   */
  toPhysicalPos(worldVecOrX, worldY = null) {
    if (typeof worldVecOrX === "number") {
      return new Vector2D(
        this.toPhysicalX(worldVecOrX),
        this.toPhysicalY(worldY !== null ? worldY : 0)
      );
    }
    if (!worldVecOrX) return new Vector2D(0, 0);
    return new Vector2D(
      this.toPhysicalX(worldVecOrX.x),
      this.toPhysicalY(worldVecOrX.y)
    );
  }

  /**
   * Convierte una coordenada física X en metros a coordenada X de mundo (px)
   */
  toWorldX(physX) {
    return this.origin.x + physX * this.pixelsPerMeter;
  }

  /**
   * Convierte una coordenada física Y en metros a coordenada Y de mundo (px)
   */
  toWorldY(physY) {
    if (this.yAxisUp) {
      return this.origin.y - physY * this.pixelsPerMeter;
    }
    return this.origin.y + physY * this.pixelsPerMeter;
  }

  /**
   * Convierte un vector de posición física en metros a Vector2D de mundo (px)
   */
  toWorldPos(physVecOrX, physY = null) {
    if (typeof physVecOrX === "number") {
      return new Vector2D(
        this.toWorldX(physVecOrX),
        this.toWorldY(physY !== null ? physY : 0)
      );
    }
    if (!physVecOrX) return new Vector2D(this.origin.x, this.origin.y);
    return new Vector2D(
      this.toWorldX(physVecOrX.x),
      this.toWorldY(physVecOrX.y)
    );
  }

  /**
   * Convierte una distancia escalar en píxeles a metros
   */
  toPhysicalDist(pixelDist) {
    return pixelDist / this.pixelsPerMeter;
  }

  /**
   * Convierte una distancia escalar en metros a píxeles
   */
  toWorldDist(physDist) {
    return physDist * this.pixelsPerMeter;
  }

  /**
   * Convierte un vector velocidad en px/s a velocidad vectorial física en m/s (SI)
   */
  toPhysicalVel(worldVel) {
    if (!worldVel) return new Vector2D(0, 0);
    return new Vector2D(
      worldVel.x / this.pixelsPerMeter,
      (this.yAxisUp ? -worldVel.y : worldVel.y) / this.pixelsPerMeter
    );
  }

  /**
   * Convierte un vector aceleración en px/s² a aceleración física en m/s² (SI)
   */
  toPhysicalAccel(worldAccel) {
    if (!worldAccel) return new Vector2D(0, 0);
    return new Vector2D(
      worldAccel.x / this.pixelsPerMeter,
      (this.yAxisUp ? -worldAccel.y : worldAccel.y) / this.pixelsPerMeter
    );
  }

  // ==========================================================================
  // ENERGÍA POTENCIAL GRAVITATORIA Y NIVEL DATUM (Ep = 0)
  // ==========================================================================

  /**
   * Altura física en metros de una coordenada Y respecto al nivel cero de energía potencial (Datum)
   * h > 0 si el cuerpo está por encima del nivel cero
   * h < 0 si el cuerpo está por debajo del nivel cero
   */
  getGravitationalHeight(worldY) {
    // En coordenadas de pantalla, menor Y es mayor altura (arriba)
    const val = (this.potentialZeroY - worldY) / this.pixelsPerMeter;
    return Math.abs(val) < 1e-4 ? 0 : val;
  }

  /**
   * Altura física en metros del nivel cero de energía potencial respecto al origen (0,0)
   */
  getPotentialZeroPhysical() {
    const val = this.toPhysicalY(this.potentialZeroY);
    return Math.abs(val) < 1e-4 ? 0 : val;
  }

  /**
   * Configura la altura física del nivel cero en metros respecto al origen
   */
  setPotentialZeroPhysical(yPhys) {
    if (Math.abs(yPhys) < 1e-4) {
      this.potentialZeroY = this.origin.y;
    } else {
      this.potentialZeroY = this.toWorldY(yPhys);
    }
  }

  /**
   * Configura directamente la posición en píxeles de mundo de la línea de nivel cero
   */
  setPotentialZeroY(yPx) {
    this.potentialZeroY = yPx;
  }

  /**
   * Alinea el nivel cero de energía potencial con el eje horizontal del origen (Y = 0)
   */
  alignPotentialZeroWithOrigin() {
    this.potentialZeroY = this.origin.y;
  }

  /**
   * Alinea el nivel cero de energía potencial con la base inferior de la hoja
   */
  alignPotentialZeroWithGround() {
    const sheetH = (this.engine && this.engine.sheet) ? this.engine.sheet.height : 900;
    const pad = (this.engine && this.engine.sheet) ? this.engine.sheet.padding : 20;
    this.potentialZeroY = sheetH - pad;
  }

  /**
   * Encuentra las coordenadas del punto más bajo alcanzable por un péndulo o cuerpo del sistema
   */
  findLowestSystemPoint(selectedEntity = null) {
    let lowest = null;

    if (selectedEntity && this.engine) {
      if (selectedEntity.type === "rod" || selectedEntity.type === "rope") {
        const pivot = selectedEntity.nodeA.isStatic ? selectedEntity.nodeA : (selectedEntity.nodeB.isStatic ? selectedEntity.nodeB : selectedEntity.nodeA);
        const bob = (pivot === selectedEntity.nodeA) ? selectedEntity.nodeB : selectedEntity.nodeA;
        const len = selectedEntity.length || Math.hypot(bob.position.x - pivot.position.x, bob.position.y - pivot.position.y);
        return { x: pivot.position.x, y: pivot.position.y + len };
      }
      if (selectedEntity.type === "body") {
        for (const conn of this.engine.connectors) {
          if ((conn.type === "rod" || conn.type === "rope") && (conn.nodeA === selectedEntity || conn.nodeB === selectedEntity)) {
            const pivot = (conn.nodeA === selectedEntity) ? conn.nodeB : conn.nodeA;
            const len = conn.length || Math.hypot(selectedEntity.position.x - pivot.position.x, selectedEntity.position.y - pivot.position.y);
            return { x: pivot.position.x, y: pivot.position.y + len };
          }
        }
        return { x: selectedEntity.position.x, y: selectedEntity.position.y };
      }
    }

    if (this.engine) {
      // Buscar cualquier péndulo en los conectores
      for (const conn of this.engine.connectors) {
        if (conn.type === "rod" || conn.type === "rope") {
          const pivot = conn.nodeA.isStatic ? conn.nodeA : (conn.nodeB.isStatic ? conn.nodeB : null);
          if (pivot) {
            const bob = (pivot === conn.nodeA) ? conn.nodeB : conn.nodeA;
            const len = conn.length || Math.hypot(bob.position.x - pivot.position.x, bob.position.y - pivot.position.y);
            const candY = pivot.position.y + len;
            if (!lowest || candY > lowest.y) {
              lowest = { x: pivot.position.x, y: candY };
            }
          }
        }
      }

      // Si no hay péndulos, buscar la masa más baja
      if (!lowest) {
        for (const node of this.engine.nodes) {
          if (!node.isStatic) {
            if (!lowest || node.position.y > lowest.y) {
              lowest = { x: node.position.x, y: node.position.y };
            }
          }
        }
      }
    }

    return lowest || { x: this.origin.x, y: this.origin.y };
  }

  /**
   * Alinea el nivel cero de energía potencial (Ep = 0) con el punto más bajo del péndulo o sistema
   */
  alignPotentialZeroWithLowestPoint(selectedEntity = null) {
    const pt = this.findLowestSystemPoint(selectedEntity);
    if (pt) {
      this.setPotentialZeroY(pt.y);
      return pt;
    }
    return null;
  }

  /**
   * Coloca el origen de coordenadas (0,0) en el punto más bajo del péndulo o sistema
   */
  alignOriginWithLowestPoint(selectedEntity = null) {
    const pt = this.findLowestSystemPoint(selectedEntity);
    if (pt) {
      this.setOrigin(pt.x, pt.y);
      return pt;
    }
    return null;
  }

  // ==========================================================================
  // CONFIGURACIÓN DE ORIGEN Y ESCALA MÉTRICA
  // ==========================================================================

  /**
   * Desplaza o establece el origen de coordenadas (0,0) en píxeles de mundo
   */
  setOrigin(x, y) {
    const sheetW = (this.engine && this.engine.sheet) ? this.engine.sheet.width : 1400;
    const sheetH = (this.engine && this.engine.sheet) ? this.engine.sheet.height : 900;
    const pad = (this.engine && this.engine.sheet) ? this.engine.sheet.padding : 20;

    // Limitar dentro de los bordes técnicos de la hoja
    this.origin.x = Math.max(pad, Math.min(sheetW - pad, x));
    this.origin.y = Math.max(pad, Math.min(sheetH - pad, y));
  }

  /**
   * Centra el origen de coordenadas exactamente en la hoja técnica
   */
  centerOriginInSheet() {
    const sheetW = (this.engine && this.engine.sheet) ? this.engine.sheet.width : 1400;
    const sheetH = (this.engine && this.engine.sheet) ? this.engine.sheet.height : 900;
    this.setOrigin(Math.floor(sheetW / 2), Math.floor(sheetH / 2));
  }

  /**
   * Sitúa el origen en la esquina inferior izquierda técnica
   */
  setOriginBottomLeft() {
    const sheetH = (this.engine && this.engine.sheet) ? this.engine.sheet.height : 900;
    this.setOrigin(150, sheetH - 120);
  }

  /**
   * Alinea el origen de coordenadas con una entidad física dada (cuerpo, soporte o carro)
   */
  setOriginAtEntity(entity) {
    if (!entity || !entity.position) return;
    this.setOrigin(entity.position.x, entity.position.y);
  }

  /**
   * Modifica la escala de conversión píxeles por metro sin modificar posiciones de entidades
   */
  setPixelsPerMeter(ppm) {
    const val = Math.max(10, Math.min(500, ppm));
    this.pixelsPerMeter = val;
    if (this.engine) {
      this.engine.pixelsPerMeter = val;
      this.engine.gravity.set(0, this.engine.gravityVal * val);
    }
  }

  // ==========================================================================
  // INTERACCIÓN ESPACIAL (DETECCIÓN DE IMPACTO BAJO EL PUNTERO)
  // ==========================================================================

  /**
   * Verifica si un punto en coordenadas de mundo está sobre el manipulador del origen (0,0)
   */
  containsOriginPoint(point, margin = 4) {
    if (!this.showAxes) return false;
    return this.origin.dist(point) <= (this.originHandleRadius + margin);
  }

  /**
   * Verifica si un punto en coordenadas de mundo está sobre la línea o manija de nivel cero Ep=0
   */
  containsDatumLine(point, margin = 6) {
    if (!this.showPotentialZero) return false;
    const sheetW = (this.engine && this.engine.sheet) ? this.engine.sheet.width : 1400;
    const pad = (this.engine && this.engine.sheet) ? this.engine.sheet.padding : 20;

    // Verificar si está dentro de la franja horizontal de la hoja y cerca de la línea Y
    if (point.x >= pad - 10 && point.x <= sheetW - pad + 10) {
      return Math.abs(point.y - this.potentialZeroY) <= (this.datumHandleTolerance + margin);
    }
    return false;
  }

  // ==========================================================================
  // FORMATEO DE MAGNITUDES FÍSICAS EN EL SISTEMA INTERNACIONAL
  // ==========================================================================

  formatPosition(worldVec) {
    if (!worldVec) return "X: 0.00 m, Y: 0.00 m";
    const xM = this.toPhysicalX(worldVec.x);
    const yM = this.toPhysicalY(worldVec.y);
    return `X: ${xM >= 0 ? "+" : ""}${xM.toFixed(2)} m, Y: ${yM >= 0 ? "+" : ""}${yM.toFixed(2)} m`;
  }

  formatSpeed(worldVel) {
    if (!worldVel) return "0.00 m/s";
    const speed = worldVel.mag() / this.pixelsPerMeter;
    return `${speed.toFixed(2)} m/s`;
  }

  formatVelocityVector(worldVel) {
    if (!worldVel) return "vx: 0.00 m/s, vy: 0.00 m/s";
    const vPhys = this.toPhysicalVel(worldVel);
    return `vx: ${vPhys.x >= 0 ? "+" : ""}${vPhys.x.toFixed(2)} m/s, vy: ${vPhys.y >= 0 ? "+" : ""}${vPhys.y.toFixed(2)} m/s`;
  }

  formatAccelerationVector(worldAccel) {
    if (!worldAccel) return "ax: 0.00 m/s², ay: 0.00 m/s²";
    const aPhys = this.toPhysicalAccel(worldAccel);
    return `ax: ${aPhys.x >= 0 ? "+" : ""}${aPhys.x.toFixed(2)} m/s², ay: ${aPhys.y >= 0 ? "+" : ""}${aPhys.y.toFixed(2)} m/s²`;
  }
}


/* ==========================================================================
   FILE: js/physics.js
   ========================================================================== */
/**
 * ============================================================================
 * physics.js — Motor de física, fuerzas y resolución de restricciones
 * ============================================================================
 */



class PhysicsEngine {
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


/* ==========================================================================
   FILE: js/gpu_patch.js
   ========================================================================== */
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


/* ==========================================================================
   FILE: js/renderer.js
   ========================================================================== */
/**
 * ============================================================================
 * renderer.js — Renderizado esquemático vectorial tipo Engineering Schematic
 * ============================================================================
 */



class Renderer {
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


/* ==========================================================================
   FILE: js/input.js
   ========================================================================== */
/**
 * ============================================================================
 * input.js — Gestión de herramientas, interacción y eventos del puntero
 * ============================================================================
 */



class InputController {
  constructor(canvas, engine, onToolChangeCallback, renderer = null) {
    this.canvas = canvas;
    this.engine = engine;
    this.onToolChange = onToolChangeCallback || (() => {});
    this.renderer = renderer;
    this.onZoomChange = null;
    this.onSceneModified = null;

    // Herramientas disponibles: 'select', 'anchor', 'mass', 'spring', 'rod', 'rope', 'delete'
    this.activeTool = "select";

    // Estados de interacción
    this.hoveredNode = null;
    this.hoveredConnector = null;
    this.selectedNodeA = null;    // Para conectar resortes y varillas
    this.draggedNode = null;

    // Selección e inspección contextual de objetos
    this.selectedEntity = null;
    this.isRotatingAnchor = false;
    this.rotatingAnchor = null;
    this.onEntitySelected = null;
    this.onEntityDoubleClicked = null;
    this.onEntityPropertyChange = null;

    // Estados de navegación tipo tablero digital (Pan)
    this.isPanning = false;
    this.panStartScreen = new Vector2D();
    this.cameraStart = { x: 0, y: 0 };

    // Estados de interacción con el sistema de referencia y nivel cero
    this.isDraggingOrigin = false;
    this.isDraggingDatum = false;
    this.onReferenceFrameChange = null;
    this.onCursorWorldMove = null;

    this.currentMousePos = new Vector2D();
    this.prevMousePos = new Vector2D();
    this.mouseVelocity = new Vector2D();

    this.initEvents();
  }

  selectEntity(entity) {
    if (this.selectedEntity !== entity) {
      this.selectedEntity = entity;
      if (this.onEntitySelected) {
        this.onEntitySelected(entity);
      }
    }
  }

  setTool(tool) {
    if (this.draggedNode) {
      this.draggedNode.isDragging = false;
      this.draggedNode = null;
    }
    // Asegurar que ningún nodo en el motor quede con isDragging = true
    for (const node of this.engine.nodes) {
      node.isDragging = false;
    }
    this.isRotatingAnchor = false;
    this.rotatingAnchor = null;
    this.isDraggingOrigin = false;
    this.isDraggingDatum = false;
    if (tool !== "select") {
      this.selectEntity(null);
    }
    this.activeTool = tool;
    this.selectedNodeA = null;
    this.updateCursor();
    this.onToolChange(this.activeTool);
  }

  triggerSceneModified() {
    if (this.onSceneModified) {
      this.onSceneModified();
    }
  }

  getPointerPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    if (this.renderer) {
      return this.renderer.screenToWorld(screenX, screenY);
    }
    return new Vector2D(screenX, screenY);
  }

  getScreenPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return new Vector2D(e.clientX - rect.left, e.clientY - rect.top);
  }

  updateCursor() {
    const c = this.canvas;
    c.className = ""; // Limpiar clases previas
    c.style.cursor = "";

    if (this.isPanning) {
      c.classList.add("cursor-grabbing");
      return;
    }

    if (this.isRotatingAnchor) {
      c.classList.add("cursor-crosshair");
      return;
    }

    if (this.isDraggingOrigin) {
      c.classList.add("cursor-grabbing");
      return;
    }

    if (this.isDraggingDatum) {
      c.style.cursor = "row-resize";
      return;
    }

    const rf = this.engine ? this.engine.referenceFrame : null;

    switch (this.activeTool) {
      case "select":
        if (
          this.selectedEntity &&
          this.selectedEntity.type === "anchor" &&
          this.selectedEntity.containsRotationHandle(this.currentMousePos)
        ) {
          c.classList.add("cursor-pointer");
        } else if (this.draggedNode) {
          c.classList.add("cursor-grabbing");
        } else if (this.hoveredNode) {
          c.classList.add("cursor-grab");
        } else if (rf && rf.showAxes && rf.containsOriginPoint(this.currentMousePos)) {
          c.classList.add("cursor-grab");
        } else if (rf && rf.showPotentialZero && rf.containsDatumLine(this.currentMousePos)) {
          c.style.cursor = "row-resize";
        } else if (this.hoveredConnector) {
          c.classList.add("cursor-pointer");
        } else {
          c.classList.add("cursor-default");
        }
        break;
      case "anchor":
      case "mass":
        c.classList.add("cursor-crosshair");
        break;
      case "spring":
      case "rod":
      case "rope":
        c.classList.add(this.hoveredNode ? "cursor-pointer" : "cursor-crosshair");
        break;
      case "delete":
        c.classList.add(this.hoveredNode || this.hoveredConnector ? "cursor-delete" : "cursor-default");
        break;
    }
  }

  initEvents() {
    const c = this.canvas;

    const onPointerDown = (e) => {
      // Clic central (rueda del ratón) activa Pan en cualquier herramienta
      if (e.button === 1) {
        this.isPanning = true;
        this.panStartScreen.copy(this.getScreenPos(e));
        if (this.renderer) {
          this.cameraStart = { x: this.renderer.camera.x, y: this.renderer.camera.y };
        }
        this.updateCursor();
        return;
      }

      const pos = this.getPointerPos(e);
      this.currentMousePos.copy(pos);
      this.prevMousePos.copy(pos);

      // Si hay un soporte seleccionado y se hace clic en su manija de rotación
      if (
        e.button === 0 &&
        this.selectedEntity &&
        this.selectedEntity.type === "anchor" &&
        this.selectedEntity.containsRotationHandle(pos)
      ) {
        this.isRotatingAnchor = true;
        this.rotatingAnchor = this.selectedEntity;
        this.updateCursor();
        return;
      }

      const targetNode = this.engine.findNodeAt(pos);
      const targetConnector = !targetNode ? this.engine.findConnectorAt(pos) : null;

      // 1. Herramienta: SELECT / SELECCIONAR, ARRASTRAR O PANEAR
      if (this.activeTool === "select") {
        if (e.button === 0) {
          let target = targetNode;
          if (!target) {
            for (let i = this.engine.nodes.length - 1; i >= 0; i--) {
              const n = this.engine.nodes[i];
              if (n.containsPoint(pos)) {
                target = n;
                break;
              }
            }
          }

          if (target) {
            this.selectEntity(target);
            this.draggedNode = target;
            target.isDragging = true;
            if (target.type === "slider") {
              const onCarriage = target.containsCarriage ? target.containsCarriage(pos) : true;
              target.dragTarget = onCarriage ? "carriage" : "rail";
              if (target.dragTarget === "rail") {
                target.dragOffset = Vector2D.sub(target.railCenter, pos);
              } else {
                target.dragOffset = Vector2D.sub(target.position, pos);
              }
              target.sVel = 0;
            } else {
              target.dragOffset = Vector2D.sub(target.position, pos);
            }
            target.velocity.set(0, 0);
            this.pointerHistory = [{ pos: pos.clone(), time: performance.now() }];
            this.updateCursor();
            return;
          }

          const rf = this.engine ? this.engine.referenceFrame : null;
          if (rf && rf.showAxes && rf.containsOriginPoint(pos)) {
            this.isDraggingOrigin = true;
            this.selectEntity(null);
            this.updateCursor();
            return;
          }

          if (rf && rf.showPotentialZero && rf.containsDatumLine(pos)) {
            this.isDraggingDatum = true;
            this.selectEntity(null);
            this.updateCursor();
            return;
          }

          if (targetConnector) {
            this.selectEntity(targetConnector);
            this.updateCursor();
            return;
          }

          // Clic en el vacío: deseleccionar e iniciar paneo
          this.selectEntity(null);
          this.isPanning = true;
          this.panStartScreen.copy(this.getScreenPos(e));
          if (this.renderer) {
            this.cameraStart = { x: this.renderer.camera.x, y: this.renderer.camera.y };
          }
          this.updateCursor();
        }
        return;
      }

      // 2. Herramienta: CREAR SOPORTE FIJO
      if (this.activeTool === "anchor") {
        if (!targetNode) {
          const sheet = this.engine.sheet || { width: 1400, height: 900, padding: 20 };
          const pad = sheet.padding + 10;
          pos.x = Math.max(pad, Math.min(sheet.width - pad, pos.x));
          pos.y = Math.max(pad, Math.min(sheet.height - pad, pos.y));

          // Determinar inclinación del soporte según cercanía a los bordes de la hoja
          let hatchAngle = -Math.PI / 2; // Techo
          if (pos.x < pad + 80) hatchAngle = Math.PI; // Pared izquierda
          else if (pos.x > sheet.width - pad - 80) hatchAngle = 0; // Pared derecha
          else if (pos.y > sheet.height - pad - 80) hatchAngle = Math.PI / 2; // Base inferior

          const anchor = new Anchor({
            position: pos,
            hatchAngle: hatchAngle
          });
          this.engine.addNode(anchor);
          this.triggerSceneModified();
          // Regresar de inmediato a la mano (arrastrar) y seleccionar el soporte para editarlo
          this.setTool("select");
          this.selectEntity(anchor);
        }
        return;
      }

      // 2b. Herramienta: CREAR SOPORTE DE RIEL CON PLATAFORMA (GUÍA LINEAL)
      if (this.activeTool === "slider") {
        if (!targetNode) {
          const sheet = this.engine.sheet || { width: 1400, height: 900, padding: 20 };
          const pad = sheet.padding + 30;
          pos.x = Math.max(pad + 100, Math.min(sheet.width - pad - 100, pos.x));
          pos.y = Math.max(pad + 20, Math.min(sheet.height - pad - 40, pos.y));

          const slider = new Slider({
            railCenter: pos,
            railLength: 400,
            railAngle: 0,
            mass: 5.0
          });
          this.engine.addNode(slider);
          this.triggerSceneModified();
          this.setTool("select");
          this.selectEntity(slider);
          // Sujetar la plataforma para permitir desplazarla de inmediato
          this.draggedNode = slider;
          slider.isDragging = true;
          slider.dragTarget = "carriage";
          slider.dragOffset.set(0, 0);
          slider.velocity.set(0, 0);
          slider.sVel = 0;
          this.pointerHistory = [{ pos: pos.clone(), time: performance.now() }];
          this.updateCursor();
        }
        return;
      }

      // 2c. Herramienta: CREAR RIEL MOTORIZADO (ACTUADOR LINEAL DE VAIVÉN)
      if (this.activeTool === "motorized_slider") {
        if (!targetNode) {
          const sheet = this.engine.sheet || { width: 1400, height: 900, padding: 20 };
          const pad = sheet.padding + 30;
          pos.x = Math.max(pad + 100, Math.min(sheet.width - pad - 100, pos.x));
          pos.y = Math.max(pad + 20, Math.min(sheet.height - pad - 40, pos.y));

          const slider = new MotorizedSlider({
            railCenter: pos,
            railLength: 400,
            railAngle: 0,
            mass: 8.0,
            motorSpeed: 1.5,
            motorAmplitude: 0.90
          });
          this.engine.addNode(slider);
          this.triggerSceneModified();
          this.setTool("select");
          this.selectEntity(slider);
          this.draggedNode = slider;
          slider.isDragging = true;
          slider.dragTarget = "carriage";
          slider.dragOffset.set(0, 0);
          slider.velocity.set(0, 0);
          slider.sVel = 0;
          this.pointerHistory = [{ pos: pos.clone(), time: performance.now() }];
          this.updateCursor();
        }
        return;
      }

      // 3. Herramienta: CREAR MASA LIBRE
      if (this.activeTool === "mass") {
        const r = 20;
        const sheet = this.engine.sheet || { width: 1400, height: 900, padding: 20 };
        const pad = sheet.padding + r;
        pos.x = Math.max(pad, Math.min(sheet.width - pad, pos.x));
        pos.y = Math.max(pad, Math.min(sheet.height - pad, pos.y));

        const body = new Body({
          position: pos,
          mass: this.engine.defaultMass || 2.0,
          radius: r
        });
        this.engine.addNode(body);
        this.triggerSceneModified();
        this.setTool("select");
        this.selectEntity(body);
        // Sujetar la masa para permitir arrastrarla de inmediato si se mantiene el puntero
        this.draggedNode = body;
        body.isDragging = true;
        body.dragOffset.set(0, 0);
        body.velocity.set(0, 0);
        this.pointerHistory = [{ pos: pos.clone(), time: performance.now() }];
        this.updateCursor();
        return;
      }

      // 4. Herramienta: CONECTAR RESORTE, VARILLA RÍGIDA O CUERDA
      if (this.activeTool === "spring" || this.activeTool === "rod" || this.activeTool === "rope") {
        if (!this.selectedNodeA) {
          // Paso 1: Seleccionar nodo A
          if (targetNode) {
            this.selectedNodeA = targetNode;
          }
        } else {
          // Paso 2: Conectar con nodo B
          if (targetNode && targetNode !== this.selectedNodeA) {
            let newConn = null;
            if (this.activeTool === "spring") {
              const nodeA = this.selectedNodeA;
              const nodeB = targetNode;
              const dx = nodeB.position.x - nodeA.position.x;
              const dy = nodeB.position.y - nodeA.position.y;
              const dist = Math.sqrt(dx * dx + dy * dy);

              // Detectar si la configuración es horizontal (por posición relativa o por orientación de soporte de pared)
              const isWallA = nodeA.type === "anchor" && (Math.abs(Math.sin(nodeA.hatchAngle !== undefined ? nodeA.hatchAngle : -Math.PI / 2)) < 0.25);
              const isWallB = nodeB.type === "anchor" && (Math.abs(Math.sin(nodeB.hatchAngle !== undefined ? nodeB.hatchAngle : -Math.PI / 2)) < 0.25);
              const isHorizontal = Math.abs(dx) >= Math.abs(dy) || Math.abs(dy) <= 50 || isWallA || isWallB;

              // Longitud natural (L0):
              // Para oscilador horizontal armónico: calibrar L0 al ~72% de la distancia de colocación
              // para generar una elongación inicial natural (Δx ≈ 28% de la longitud) y que oscile de inmediato al dar Play
              const restLength = isHorizontal
                ? Math.max(50, Math.round(dist * 0.72))
                : Math.max(50, Math.round(dist * 0.80));

              newConn = new Spring(nodeA, nodeB, {
                stiffness: this.engine.defaultStiffness,
                damping: this.engine.defaultDamping,
                restLength: restLength
              });

              if (isHorizontal) {
                newConn.setLockY(true);
              }

              this.engine.addConnector(newConn);
            } else if (this.activeTool === "rod") {
              newConn = new Rod(this.selectedNodeA, targetNode);
              this.engine.addConnector(newConn);
              this.engine.solveConstraints(false);
            } else if (this.activeTool === "rope") {
              newConn = new Rope(this.selectedNodeA, targetNode);
              this.engine.addConnector(newConn);
              this.engine.solveConstraints(false);
            }
            this.triggerSceneModified();
            this.selectedNodeA = null;
            // Regresar a la mano tras conectar con éxito y seleccionar el nuevo conector
            this.setTool("select");
            if (newConn) this.selectEntity(newConn);
          } else if (targetNode === this.selectedNodeA) {
            // Clic en el mismo nodo: deseleccionar sin salir de la herramienta
            this.selectedNodeA = null;
          }
          // Si hace clic en el vacío, no cancelar bruscamente para permitir reintentar el clic
        }
        return;
      }

      // 5. Herramienta: ELIMINAR ELEMENTO
      if (this.activeTool === "delete") {
        if (targetNode) {
          if (this.selectedEntity === targetNode) this.selectEntity(null);
          this.engine.removeNode(targetNode);
          this.hoveredNode = null;
          this.triggerSceneModified();
        } else if (targetConnector) {
          if (this.selectedEntity === targetConnector) this.selectEntity(null);
          this.engine.removeConnector(targetConnector);
          this.hoveredConnector = null;
          this.triggerSceneModified();
        }
        this.updateCursor();
        return;
      }
    };

    const onPointerMove = (e) => {
      // 1. Desplazamiento del lienzo digital (Pan) acotado a la hoja
      if (this.isPanning && this.renderer) {
        const screenPos = this.getScreenPos(e);
        const dx = screenPos.x - this.panStartScreen.x;
        const dy = screenPos.y - this.panStartScreen.y;
        this.renderer.camera.x = this.cameraStart.x + dx;
        this.renderer.camera.y = this.cameraStart.y + dy;
        this.renderer.clampCamera();
        this.updateCursor();
        return;
      }

      const pos = this.getPointerPos(e);
      this.currentMousePos.copy(pos);

      if (this.onCursorWorldMove) {
        this.onCursorWorldMove(pos);
      }

      const rf = this.engine ? this.engine.referenceFrame : null;

      // Arrastre del origen del sistema de referencia
      if (this.isDraggingOrigin && rf) {
        let targetX = pos.x;
        let targetY = pos.y;
        const snapRadius = 18;

        // Imantación vertical a Datum Ep=0
        if (Math.abs(targetY - rf.potentialZeroY) <= snapRadius) {
          targetY = rf.potentialZeroY;
        }

        // Imantación al punto más bajo del péndulo/sistema
        const lowestPt = rf.findLowestSystemPoint(this.selectedEntity);
        if (lowestPt) {
          if (Math.abs(targetX - lowestPt.x) <= snapRadius) targetX = lowestPt.x;
          if (Math.abs(targetY - lowestPt.y) <= snapRadius) targetY = lowestPt.y;
        }

        // Imantación a centro de hoja
        const sheet = (this.engine && this.engine.sheet) ? this.engine.sheet : { width: 1400, height: 900 };
        if (Math.abs(targetX - sheet.width / 2) <= snapRadius) targetX = sheet.width / 2;
        if (Math.abs(targetY - sheet.height / 2) <= snapRadius) targetY = sheet.height / 2;

        rf.setOrigin(targetX, targetY);
        if (this.onReferenceFrameChange) {
          this.onReferenceFrameChange(rf);
        }
        this.updateCursor();
        return;
      }

      // Arrastre del nivel cero de energía potencial (datum line)
      if (this.isDraggingDatum && rf) {
        let targetY = pos.y;
        const snapRadius = 18; // Radio de atracción magnética para ajuste exacto a cero

        let snapped = false;
        let snapLabel = null;

        // 1. Imantación fuerte al Origen cartesiano (Y = 0)
        if (Math.abs(targetY - rf.origin.y) <= snapRadius) {
          targetY = rf.origin.y;
          snapped = true;
          snapLabel = "🧲 Ep = 0 [ORIGEN (0.00 m)]";
        }

        // 2. Imantación fuerte al Punto Más Bajo del péndulo o sistema
        if (!snapped) {
          const lowestPt = rf.findLowestSystemPoint(this.selectedEntity);
          if (lowestPt && Math.abs(targetY - lowestPt.y) <= snapRadius) {
            targetY = lowestPt.y;
            snapped = true;
            snapLabel = "🧲 Ep = 0 [PUNTO MÁS BAJO]";
          }
        }

        // 3. Imantación al Suelo/Base
        if (!snapped) {
          const sheetH = (this.engine && this.engine.sheet) ? this.engine.sheet.height : 900;
          const pad = (this.engine && this.engine.sheet) ? this.engine.sheet.padding : 20;
          const floorY = sheetH - pad;
          if (Math.abs(targetY - floorY) <= snapRadius) {
            targetY = floorY;
            snapped = true;
            snapLabel = "🧲 Ep = 0 [SUELO]";
          }
        }

        // 4. Imantación a nodos de la escena (centro y base)
        if (!snapped && this.engine) {
          for (const node of this.engine.nodes) {
            if (Math.abs(targetY - node.position.y) <= 12) {
              targetY = node.position.y;
              snapped = true;
              snapLabel = `🧲 Ep = 0 [${node.type === "anchor" ? "SOPORTE" : "MASA"}]`;
              break;
            }
            const r = node.radius || 20;
            if (Math.abs(targetY - (node.position.y + r)) <= 12) {
              targetY = node.position.y + r;
              snapped = true;
              snapLabel = "🧲 Ep = 0 [BASE MASA]";
              break;
            }
          }
        }

        // 5. Imantación a la cuadrícula de alturas cada 0.10 m o 0.05 m
        if (!snapped) {
          const stepPx = 0.05 * rf.pixelsPerMeter;
          const dist = targetY - rf.origin.y;
          const nearest = Math.round(dist / stepPx);
          const gridY = rf.origin.y + nearest * stepPx;
          if (Math.abs(targetY - gridY) <= 6) {
            targetY = gridY;
            snapped = true;
          }
        }

        rf.isSnappedDatum = snapped;
        rf.snapLabel = snapLabel;
        rf.setPotentialZeroY(targetY);
        if (this.onReferenceFrameChange) {
          this.onReferenceFrameChange(rf);
        }
        this.updateCursor();
        return;
      }

      // 2. Rotación interactiva del soporte mediante su manija en pantalla
      if (this.isRotatingAnchor && this.rotatingAnchor) {
        const center = this.rotatingAnchor.position;
        let angle = Math.atan2(pos.y - center.y, pos.x - center.x);

        // Ajuste magnético (snap) a ángulos estándar ortogonales y a 45°
        const snapAngles = [
          -Math.PI, -3 * Math.PI / 4, -Math.PI / 2, -Math.PI / 4,
          0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI
        ];
        for (const snap of snapAngles) {
          const diff = Math.abs(angle - snap);
          const diffWrap = Math.abs(diff - 2 * Math.PI);
          if (diff < 0.12 || diffWrap < 0.12) {
            angle = snap;
            break;
          }
        }

        this.rotatingAnchor.hatchAngle = angle;
        if (this.onEntityPropertyChange) {
          this.onEntityPropertyChange(this.rotatingAnchor);
        }
        this.triggerSceneModified();
        this.updateCursor();
        return;
      }

      // 3. Arrastre de cuerpo físico o soporte delimitado a la hoja finita
      if (this.draggedNode) {
        const now = performance.now();
        this.pointerHistory = this.pointerHistory || [];
        this.pointerHistory.push({ pos: pos.clone(), time: now });
        if (this.pointerHistory.length > 5) this.pointerHistory.shift();

        const targetPos = Vector2D.add(pos, this.draggedNode.dragOffset);
        if (this.engine.sheet) {
          const r = this.draggedNode.radius || 20;
          const pad = this.engine.sheet.padding;
          targetPos.x = Math.max(pad + r, Math.min(this.engine.sheet.width - pad - r, targetPos.x));
          targetPos.y = Math.max(pad + r, Math.min(this.engine.sheet.height - pad - r, targetPos.y));
        }

        // Manejo específico para el Riel con Plataforma Deslizante
        if (this.draggedNode.type === "slider") {
          if (this.draggedNode.dragTarget === "rail") {
            const newCenter = Vector2D.add(pos, this.draggedNode.dragOffset);
            if (this.engine.sheet) {
              const pad = this.engine.sheet.padding + 40;
              newCenter.x = Math.max(pad, Math.min(this.engine.sheet.width - pad, newCenter.x));
              newCenter.y = Math.max(pad, Math.min(this.engine.sheet.height - pad, newCenter.y));
            }
            this.draggedNode.railCenter.copy(newCenter);
            this.draggedNode.updatePositionFromS();
            this.draggedNode.velocity.set(0, 0);
            this.draggedNode.sVel = 0;
          } else {
            const dir = this.draggedNode.getDir();
            const rel = Vector2D.sub(Vector2D.add(pos, this.draggedNode.dragOffset), this.draggedNode.railCenter);
            const rawS = rel.x * dir.x + rel.y * dir.y;
            const maxS = this.draggedNode.sMax !== undefined ? this.draggedNode.sMax : Math.max(10, (this.draggedNode.railLength - (this.draggedNode.carriageLength || 46)) / 2);
            const safeRawS = isNaN(rawS) ? 0 : rawS;
            this.draggedNode.s = Math.max(-maxS, Math.min(maxS, safeRawS));
            this.draggedNode.updatePositionFromS();
            this.draggedNode.velocity.set(0, 0);
            this.draggedNode.sVel = 0;
          }
          this.engine.solveConstraints(false);
          if (this.onEntityPropertyChange) {
            this.onEntityPropertyChange(this.draggedNode);
          }
          this.updateCursor();
          return;
        }

        // Restringir arrastre si la masa está conectada a un resorte con guía de eje (lockX / lockY)
        if (!this.draggedNode.isStatic) {
          for (const conn of this.engine.connectors) {
            if (conn.type === "spring" && (conn.nodeA === this.draggedNode || conn.nodeB === this.draggedNode)) {
              if (conn.lockX) {
                const lx = (conn.lockedXVal != null) ? conn.lockedXVal : (conn.nodeA.isStatic ? conn.nodeA.position.x : (conn.nodeB.isStatic ? conn.nodeB.position.x : conn.nodeA.position.x));
                targetPos.x = lx;
              }
              if (conn.lockY) {
                const ly = (conn.lockedYVal != null) ? conn.lockedYVal : (conn.nodeA.isStatic ? conn.nodeA.position.y : (conn.nodeB.isStatic ? conn.nodeB.position.y : conn.nodeA.position.y));
                targetPos.y = ly;
              }
            }
          }
        }

        this.draggedNode.position.copy(targetPos);
        this.draggedNode.velocity.set(0, 0);

        // Resolver restricciones de varillas y cuerdas de inmediato para mantener rigidez geométrica
        this.engine.solveConstraints(false);
        if (this.onEntityPropertyChange) {
          this.onEntityPropertyChange(this.draggedNode);
        }
      } else {
        // Detección de hover en espacio del mundo
        this.hoveredNode = this.engine.findNodeAt(pos);
        this.hoveredConnector = !this.hoveredNode ? this.engine.findConnectorAt(pos) : null;
        if (rf) {
          rf.isHoveredOrigin = rf.showAxes && rf.containsOriginPoint(pos);
          rf.isHoveredDatum = rf.showPotentialZero && rf.containsDatumLine(pos);
        }
      }

      this.updateCursor();
    };

    const onPointerUp = () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.updateCursor();
      }

      if (this.isDraggingOrigin) {
        this.isDraggingOrigin = false;
        if (this.onReferenceFrameChange) {
          this.onReferenceFrameChange(this.engine.referenceFrame);
        }
        this.triggerSceneModified();
        this.updateCursor();
      }

      if (this.isDraggingDatum) {
        this.isDraggingDatum = false;
        const rf = this.engine ? this.engine.referenceFrame : null;
        if (rf) {
          rf.isSnappedDatum = false;
          rf.snapLabel = null;
        }
        if (this.onReferenceFrameChange) {
          this.onReferenceFrameChange(rf);
        }
        this.triggerSceneModified();
        this.updateCursor();
      }

      if (this.isRotatingAnchor) {
        this.isRotatingAnchor = false;
        this.rotatingAnchor = null;
        this.triggerSceneModified();
        this.updateCursor();
      }

      const wasDragging = !!this.draggedNode;
      const wasStatic = wasDragging && this.draggedNode.isStatic;

      if (this.draggedNode) {
        this.draggedNode.isDragging = false;
        const now = performance.now();

        // Calcular velocidad de lanzamiento real basada en la ventana de tiempo reciente
        let throwVel = new Vector2D(0, 0);
        if (!this.engine.isPaused && this.pointerHistory && this.pointerHistory.length >= 2) {
          const last = this.pointerHistory[this.pointerHistory.length - 1];
          const first = this.pointerHistory[0];
          const dt = (last.time - first.time) / 1000;

          // Si el usuario sostuvo el cursor quieto antes de soltar (>70ms), velocidad = 0
          if (now - last.time < 70 && dt > 0.01) {
            throwVel = Vector2D.sub(last.pos, first.pos).div(dt);
            // Limitar velocidad de lanzamiento a un valor físicamente razonable
            const maxThrow = 800; // px/s (~8 m/s)
            if (throwVel.mag() > maxThrow) {
              throwVel.normalize().mult(maxThrow);
            }
          }
        }
        this.pointerHistory = [];

        if (!this.draggedNode.isStatic) {
          if (this.draggedNode.type === "slider") {
            if (this.draggedNode.dragTarget === "rail") {
              this.draggedNode.velocity.set(0, 0);
              this.draggedNode.sVel = 0;
            } else {
              const dir = this.draggedNode.getDir();
              const vProj = throwVel.x * dir.x + throwVel.y * dir.y;
              this.draggedNode.sVel = vProj;
              this.draggedNode.velocity.set(dir.x * vProj, dir.y * vProj);
            }
          } else {
            for (const conn of this.engine.connectors) {
              if (conn.type === "spring" && (conn.nodeA === this.draggedNode || conn.nodeB === this.draggedNode)) {
                if (conn.lockX) throwVel.x = 0;
                if (conn.lockY) throwVel.y = 0;
              }
            }
            this.draggedNode.velocity.copy(throwVel);
          }
        }

        this.draggedNode = null;
        this.updateCursor();
      }

      // Si se movió una masa o soporte, actualizar snapshot
      if (wasDragging && (this.engine.isPaused || wasStatic)) {
        this.triggerSceneModified();
      }

      // Seguridad: asegurar que todos los nodos queden libres al soltar el puntero
      for (const node of this.engine.nodes) {
        node.isDragging = false;
      }
    };

    // Zoom con rueda del ratón centrado exactamente en el cursor
    const onWheel = (e) => {
      e.preventDefault();
      if (!this.renderer) return;

      const rect = c.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      this.renderer.zoomAt(screenX, screenY, zoomFactor);

      if (this.onZoomChange) {
        this.onZoomChange(this.renderer.camera.zoom);
      }
    };

    // Atajos de teclado: Escape cancela selección / herramientas; Supr borra objeto seleccionado
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.selectEntity(null);
        this.selectedNodeA = null;
        this.setTool("select");
      } else if (e.key === "Delete") {
        if (this.selectedEntity) {
          const ent = this.selectedEntity;
          this.selectEntity(null);
          if (this.engine.nodes.includes(ent)) {
            this.engine.removeNode(ent);
          } else {
            this.engine.removeConnector(ent);
          }
          this.triggerSceneModified();
        }
      }
    });

    const onDblClick = (e) => {
      const pos = this.getPointerPos(e);
      const rf = this.engine ? this.engine.referenceFrame : null;

      // 1. Doble clic en la línea o rótulo de nivel cero (Ep = 0): Ajuste directo a cero absoluto
      if (rf && rf.showPotentialZero && rf.containsDatumLine(pos)) {
        const lowestPt = rf.findLowestSystemPoint(this.selectedEntity);
        const isAtLowest = lowestPt && Math.abs(rf.potentialZeroY - lowestPt.y) < 2.0;
        if (!isAtLowest && lowestPt) {
          rf.alignPotentialZeroWithLowestPoint(this.selectedEntity);
        } else {
          rf.alignPotentialZeroWithOrigin();
        }
        if (this.onReferenceFrameChange) this.onReferenceFrameChange(rf);
        this.triggerSceneModified();
        return;
      }

      // 2. Doble clic en el origen (0, 0): Centrado o ajuste al punto más bajo
      if (rf && rf.showAxes && rf.containsOriginPoint(pos)) {
        const lowestPt = rf.findLowestSystemPoint(this.selectedEntity);
        const isAtLowest = lowestPt && Math.abs(rf.origin.y - lowestPt.y) < 2.0 && Math.abs(rf.origin.x - lowestPt.x) < 2.0;
        if (!isAtLowest && lowestPt) {
          rf.alignOriginWithLowestPoint(this.selectedEntity);
        } else {
          const sheet = (this.engine && this.engine.sheet) ? this.engine.sheet : { width: 1400, height: 900 };
          rf.setOrigin(sheet.width / 2, sheet.height / 2);
        }
        if (this.onReferenceFrameChange) this.onReferenceFrameChange(rf);
        this.triggerSceneModified();
        return;
      }

      const targetNode = this.engine.findNodeAt(pos);
      const targetConnector = !targetNode ? this.engine.findConnectorAt(pos) : null;
      const target = targetNode || targetConnector;

      if (target) {
        this.selectEntity(target);
        if (this.onEntityDoubleClicked) {
          this.onEntityDoubleClicked(target, e);
        }
      }
    };

    c.addEventListener("pointerdown", onPointerDown);
    c.addEventListener("dblclick", onDblClick);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    c.addEventListener("wheel", onWheel, { passive: false });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
  }
}


/* ==========================================================================
   FILE: js/table.js
   ========================================================================== */
/**
 * ============================================================================
 * table.js — Gestor y Ventana de Tabulación de Datos Temporales
 * Permite registrar y tabular variables físicas respecto al tiempo
 * con saltos temporales configurables (Δt) tanto en vivo como desde historial.
 * ============================================================================
 */


class DataTableManager {
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


/* ==========================================================================
   FILE: js/main.js
   ========================================================================== */
/**
 * ============================================================================
 * main.js — Inicialización, bucle principal, gestión de UI y presets
 * ============================================================================
 */








if (typeof window !== "undefined") {
  window.Slider = Slider;
  window.MotorizedSlider = MotorizedSlider;
  window.Body = Body;
  window.Anchor = Anchor;
  window.Spring = Spring;
  window.Rod = Rod;
  window.Rope = Rope;
  window.Vector2D = Vector2D;
  window.ReferenceFrame = ReferenceFrame;
}

class PhysicsSandboxApp {
  constructor() {
    this.canvas = document.getElementById("canvas");
    this.engine = new PhysicsEngine();
    this.renderer = new Renderer(this.canvas);
    this.input = new InputController(
      this.canvas,
      this.engine,
      (activeTool) => this.syncToolbarUI(activeTool),
      this.renderer
    );
    this.tableManager = new DataTableManager(this.engine, this.input, this);
    this.editingEntity = null;
    this.input.onZoomChange = (zoom) => {
      this.updateZoomUI(zoom);
    };
    this.input.onEntityDoubleClicked = (entity) => this.openInspector(entity);
    this.input.onEntityPropertyChange = (entity) => {
      this.updateInspectorValues(entity);
    };
    this.input.onReferenceFrameChange = (rf) => {
      this.updateReferenceFrameUI();
      this.updateTelemetry();
      if (this.input.selectedEntity) {
        this.updateInspectorValues(this.input.selectedEntity);
      }
    };
    this.input.onCursorWorldMove = (pos) => {
      this.updateCursorCoordinates(pos);
    };
    this.hasModifiedSetup = false;

    this.input.onSceneModified = () => {
      this.hasModifiedSetup = true;
      if (this.engine.isPaused) {
        this.engine.saveSnapshot();
      }
      this.updateDynamicParametersUI();
      if (this.tableManager) this.tableManager.updateTargetList();
    };

    this.lastTime = performance.now();
    this.fixedDelta = 1 / 60;
    this.isRewinding = false;

    this.initDOM();
    this.setupDefaultScene();
    this.engine.saveSnapshot();
    this.centerView();
    this.updateZoomUI(this.renderer.camera.zoom);

    const urlParams = typeof window !== "undefined" && window.location ? new URLSearchParams(window.location.search) : null;
    if (urlParams) {
      if (urlParams.get("scene") === "horizontal") {
        this.engine.clear();
        const anchor = new Anchor({ position: new Vector2D(350, 380), hatchAngle: Math.PI });
        const mass = new Body({ position: new Vector2D(650, 380), mass: 2.0 });
        const spring = new Spring(anchor, mass, { stiffness: 35, damping: 0, restLength: 210 });
        spring.setLockY(true);
        this.engine.addNode(anchor);
        this.engine.addNode(mass);
        this.engine.addConnector(spring);
        this.engine.saveSnapshot();
        this.input.selectEntity(spring);
        this.openInspector(spring);
      } else if (urlParams.get("pendulum") === "1") {
        this.setupSimplePendulumScene();
      } else if (this.engine.nodes.length > 0) {
        if (urlParams.get("selectAnchor") === "1") {
          this.input.selectEntity(this.engine.nodes[0]);
          this.openInspector(this.engine.nodes[0]);
        } else if (urlParams.get("selectBody") === "1") {
          const body = this.engine.nodes.find((n) => n.type === "body");
          if (body) {
            this.input.selectEntity(body);
            this.openInspector(body);
          }
        } else if (urlParams.get("selectSpring") === "1") {
          const spring = this.engine.connectors.find((c) => c.type === "spring");
          if (spring) {
            this.input.selectEntity(spring);
            spring.setLockY(true);
            this.openInspector(spring);
          }
        }
      }

      if (urlParams.get("table") === "1" && this.tableManager) {
        this.tableManager.open();
        if (urlParams.get("tabulate") === "1") {
          setTimeout(() => {
            this.tableManager.generateFromHistory();
          }, 1400);
        }
      }

      if (urlParams.get("refFrame") === "1") {
        const btnRef = document.getElementById("btn-tool-ref-frame");
        if (btnRef) btnRef.click();
      }
    }

    this.startLoop();
  }

  setupDefaultScene() {
    const cx = this.engine.sheet ? Math.floor(this.engine.sheet.width / 2) : 700;
    const mRail = new MotorizedSlider({
      railCenter: new Vector2D(cx, 240),
      railLength: 460,
      railAngle: 0,
      mass: 8.0,
      motorSpeed: 1.5,
      motorAmplitude: 0.90
    });
    const bob = new Body({
      position: new Vector2D(cx, 420),
      mass: 2.0,
      radius: 20
    });
    const rod = new Rod(mRail, bob, { length: 180 });
    this.engine.addNode(mRail);
    this.engine.addNode(bob);
    this.engine.addConnector(rod);
  }

  setupSimplePendulumScene() {
    this.engine.clear();
    const cx = this.engine.sheet ? Math.floor(this.engine.sheet.width / 2) : 700;
    const cy = 200;
    const lengthPx = 200; // 2.0 m a 100 px/m
    const angleInitDeg = 45; // Ángulo inicial de 45°
    const angleRad = (angleInitDeg * Math.PI) / 180;

    const anchor = new Anchor({
      position: new Vector2D(cx, cy),
      radius: 12
    });

    const bobX = cx + lengthPx * Math.sin(angleRad);
    const bobY = cy + lengthPx * Math.cos(angleRad);

    const bob = new Body({
      position: new Vector2D(bobX, bobY),
      mass: 2.0,
      radius: 20
    });

    const rope = new Rope(anchor, bob, { length: lengthPx });

    this.engine.addNode(anchor);
    this.engine.addNode(bob);
    this.engine.addConnector(rope);

    // Configurar sistema de referencia:
    // El punto más bajo de la trayectoria es Y = cy + lengthPx = 400
    const lowestY = cy + lengthPx;
    if (this.engine.referenceFrame) {
      this.engine.referenceFrame.setOrigin(cx, lowestY);
      this.engine.referenceFrame.setPotentialZeroY(lowestY);
      this.updateReferenceFrameUI();
    }

    // Configurar parámetros ideales (sin amortiguamiento) para conservación perfecta de energía
    this.engine.damping = 0;
    const sliderDamping = document.getElementById("slider-damping");
    const valDamping = document.getElementById("val-damping");
    if (sliderDamping) sliderDamping.value = 0;
    if (valDamping) valDamping.textContent = "0.00 N·s/m";

    // Reanudar la simulación si estuviera pausada y rebobinar tiempo a 0
    this.engine.isPaused = false;
    this.engine.simulationTime = 0;
    this.engine.history = [];
    this.engine.historyIndex = -1;
    this.updateTimelineUI();
    this.updateDynamicParametersUI();

    // Seleccionar el péndulo para el inspector y la tabla
    this.input.selectedEntity = rope;
    if (this.tableManager) {
      this.tableManager.updateTargetList();
      this.tableManager.selectedTargetId = rope.id;
      const select = document.getElementById("table-target-select");
      if (select) select.value = rope.id;
      this.tableManager.updateColumns();
      this.tableManager.clearTable();
    }

    this.updateInspectorValues(rope);
    this.updateTelemetry();
    this.renderer.render(this.engine, this.input);
  }

  syncToolbarUI(activeTool) {
    const btnHand = document.getElementById("btn-tool-hand");
    const btnDelete = document.getElementById("btn-tool-delete");
    const btnAddToggle = document.getElementById("btn-add-toggle");
    const addToggleText = document.getElementById("add-toggle-text");
    const dropdown = document.getElementById("dropdown-add");

    // 1. Estado de la mano (Arrastrar): activa por defecto si no se agrega ni borra
    if (btnHand) {
      if (activeTool === "select") {
        btnHand.classList.add("active");
      } else {
        btnHand.classList.remove("active");
      }
    }

    // 2. Estado de borrar
    if (btnDelete) {
      if (activeTool === "delete") {
        btnDelete.classList.add("active");
      } else {
        btnDelete.classList.remove("active");
      }
    }

    // 3. Estado del menú de agregar objetos
    const isAdding = ["anchor", "slider", "motorized_slider", "mass", "spring", "rod", "rope"].includes(activeTool);
    if (btnAddToggle && addToggleText) {
      if (isAdding) {
        btnAddToggle.classList.add("active");
        const labels = {
          anchor: "➕ Soporte Fijo",
          slider: "➕ Riel con Plataforma",
          motorized_slider: "➕ Riel Motorizado",
          mass: "➕ Masa Libre",
          spring: "➕ Conectando Resorte",
          rod: "➕ Conectando Varilla",
          rope: "➕ Conectando Cuerda"
        };
        addToggleText.textContent = labels[activeTool] || "Agregar Objeto";
      } else {
        btnAddToggle.classList.remove("active");
        addToggleText.textContent = "Agregar Objeto";
        if (dropdown) dropdown.classList.remove("is-open");
      }
    }

    // Resaltar ítem del dropdown si aplica
    const dropdownItems = document.querySelectorAll(".dropdown-item");
    dropdownItems.forEach((item) => {
      if (item.dataset.tool === activeTool) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });
  }

  initDOM() {
    this.initDropdown();
    this.initDraggablePanels();
    this.initZoomUI();

    // 1. Botón Mano (Arrastrar)
    const btnHand = document.getElementById("btn-tool-hand");
    if (btnHand) {
      btnHand.addEventListener("click", () => {
        this.input.setTool("select");
      });
    }

    // 2. Botón Borrar (Toggle)
    const btnDelete = document.getElementById("btn-tool-delete");
    if (btnDelete) {
      btnDelete.addEventListener("click", () => {
        if (this.input.activeTool === "delete") {
          this.input.setTool("select");
        } else {
          this.input.setTool("delete");
        }
      });
    }

    // 3. Sliders de parámetros físicos globales (entorno)
    const sliderG = document.getElementById("slider-gravity");
    const sliderC = document.getElementById("slider-damping");

    const valG = document.getElementById("val-gravity");
    const valC = document.getElementById("val-damping");

    if (sliderG && valG) {
      sliderG.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        this.engine.setGravity(val, this.engine.isPaused);
        valG.textContent = `${val.toFixed(2)} m/s²`;
      });
    }

    if (sliderC && valC) {
      sliderC.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        this.engine.setDamping(val);
        valC.textContent = `${val.toFixed(2)} N·s/m`;
      });
    }

    // 4. Control de Escala Temporal (Cámara Lenta: 0.1x, 0.25x, 0.5x, 1.0x)
    const sliderTime = document.getElementById("slider-timescale");
    const valTime = document.getElementById("val-timescale");
    const timescalePresetBtns = document.querySelectorAll("#timescale-presets .preset-btn");

    const setTimeScale = (scale) => {
      if (isNaN(scale) || scale <= 0) return;
      this.engine.setTimeScale(scale);
      if (sliderTime) sliderTime.value = scale.toFixed(2);
      if (valTime) valTime.textContent = `${scale.toFixed(2)}x`;
      timescalePresetBtns.forEach((btn) => {
        const bScale = parseFloat(btn.dataset.scale);
        if (!isNaN(bScale)) {
          btn.classList.toggle("active", Math.abs(bScale - scale) < 0.01);
        }
      });
    };

    if (sliderTime) {
      sliderTime.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) setTimeScale(val);
      });
    }

    timescalePresetBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const scale = parseFloat(btn.dataset.scale);
        if (!isNaN(scale)) setTimeScale(scale);
      });
    });

    // 5. Scrubber de Línea de Tiempo (Historial de movimiento)
    const sliderTimeline = document.getElementById("slider-timeline");
    if (sliderTimeline) {
      sliderTimeline.addEventListener("input", (e) => {
        this.pauseSimulation();
        const idx = parseInt(e.target.value, 10);
        this.engine.seekHistoryIndex(idx);
        this.renderer.render(this.engine, this.input);
        this.updateTelemetry();
        this.updateTimelineUI();
      });
    }

    // 6. Botones de Transporte Temporal
    const btnPause = document.getElementById("btn-pause");
    const btnRewind = document.getElementById("btn-rewind");
    const btnStepBack = document.getElementById("btn-step-back");
    const btnStep = document.getElementById("btn-step");
    const btnResetState = document.getElementById("btn-reset-state");

    if (btnPause) {
      btnPause.addEventListener("click", () => this.togglePause());
    }

    if (btnRewind) {
      btnRewind.addEventListener("click", () => this.toggleRewind());
    }

    if (btnStepBack) {
      btnStepBack.addEventListener("click", () => this.doStepBack());
    }

    if (btnStep) {
      btnStep.addEventListener("click", () => this.doStepForward());
    }

    if (btnResetState) {
      btnResetState.addEventListener("click", () => this.doResetState());
    }

    // 7. Botón Limpiar Lienzo
    const btnClear = document.getElementById("btn-clear");
    if (btnClear) {
      btnClear.addEventListener("click", () => {
        this.engine.clear();
        this.hasModifiedSetup = true;
        this.input.selectedNodeA = null;
        this.input.setTool("select");
        this.updateDynamicParametersUI();
        this.updateTimelineUI();
        if (this.tableManager) {
          this.tableManager.updateTargetList();
          this.tableManager.clearTable();
        }
        this.renderer.render(this.engine, this.input);
        this.updateTelemetry();
      });
    }

    // 8. Ventana Cerrable de Inspección de Parámetros de Objeto (Doble clic)
    const btnCloseInspector = document.getElementById("btn-close-inspector");
    const btnDeleteInspector = document.getElementById("btn-insp-delete");
    const btnSpringLockX = document.getElementById("btn-spring-lock-x");
    const btnSpringLockY = document.getElementById("btn-spring-lock-y");

    const sliderAnchorAngle = document.getElementById("slider-insp-anchor-angle");
    const sliderAnchorWidth = document.getElementById("slider-insp-anchor-width");
    const btnAnchorRotateStep = document.getElementById("btn-insp-anchor-rotate");
    const anchorPresets = document.querySelectorAll("#inspector-anchor-presets .preset-btn");

    const sliderSelectedMass = document.getElementById("slider-insp-mass");
    const sliderSelectedRadius = document.getElementById("slider-insp-radius");
    const sliderSelectedStiffness = document.getElementById("slider-insp-stiffness");
    const sliderSelectedRestLength = document.getElementById("slider-insp-restlength");
    const sliderSelectedLength = document.getElementById("slider-insp-length");

    if (btnCloseInspector) {
      btnCloseInspector.addEventListener("click", () => this.closeInspector());
    }

    if (btnDeleteInspector) {
      btnDeleteInspector.addEventListener("click", () => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (!ent) return;
        this.closeInspector();
        this.input.selectEntity(null);
        if (ent.type === "anchor" || ent.type === "body" || ent.type === "slider") {
          this.engine.removeNode(ent);
        } else {
          this.engine.removeConnector(ent);
        }
        this.hasModifiedSetup = true;
        if (this.engine.isPaused) this.engine.saveSnapshot();
        this.updateDynamicParametersUI();
        this.renderer.render(this.engine, this.input);
        this.updateTelemetry();
      });
    }

    // Bloqueo de Eje X del Resorte (guía vertical / oscilación puramente en Y)
    if (btnSpringLockX) {
      btnSpringLockX.addEventListener("click", () => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && ent.type === "spring") {
          ent.setLockX(!ent.lockX);
          this.updateInspectorValues(ent);
          this.hasModifiedSetup = true;
          if (this.engine.isPaused) this.engine.saveSnapshot();
          this.renderer.render(this.engine, this.input);
        }
      });
    }

    // Bloqueo de Eje Y del Resorte (guía horizontal / oscilación acoplada 1D en X equilibrando gravedad)
    if (btnSpringLockY) {
      btnSpringLockY.addEventListener("click", () => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && ent.type === "spring") {
          ent.setLockY(!ent.lockY);
          if (ent.lockY && Math.abs(ent.currentLength - ent.restLength) < 2) {
            // Si estaba en equilibrio estático exacto, calibrar L0 para proporcionar elongación inicial
            ent.restLength = Math.max(50, Math.round(ent.currentLength * 0.75));
          }
          this.updateInspectorValues(ent);
          this.hasModifiedSetup = true;
          if (this.engine.isPaused) this.engine.saveSnapshot();
          this.renderer.render(this.engine, this.input);
        }
      });
    }

    // Orientación del soporte: Presets rápidos
    anchorPresets.forEach((btn) => {
      btn.addEventListener("click", () => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && ent.type === "anchor") {
          const deg = parseFloat(btn.dataset.angle);
          if (!isNaN(deg)) {
            ent.hatchAngle = deg * Math.PI / 180;
            this.updateInspectorValues(ent);
            this.hasModifiedSetup = true;
            if (this.engine.isPaused) this.engine.saveSnapshot();
            this.renderer.render(this.engine, this.input);
          }
        }
      });
    });

    // Orientación del soporte: Slider de ángulo continuo
    if (sliderAnchorAngle) {
      sliderAnchorAngle.addEventListener("input", (e) => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && ent.type === "anchor") {
          const deg = parseFloat(e.target.value);
          ent.hatchAngle = deg * Math.PI / 180;
          this.updateInspectorValues(ent);
          this.hasModifiedSetup = true;
          if (this.engine.isPaused) this.engine.saveSnapshot();
          this.renderer.render(this.engine, this.input);
        }
      });
    }

    // Orientación del soporte: Botón de giro por pasos (+45°)
    if (btnAnchorRotateStep) {
      btnAnchorRotateStep.addEventListener("click", () => {
        this.rotateSelectedAnchor(Math.PI / 4);
      });
    }

    // Ancho de placa del soporte
    if (sliderAnchorWidth) {
      sliderAnchorWidth.addEventListener("input", (e) => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && ent.type === "anchor") {
          ent.hatchWidth = parseInt(e.target.value, 10);
          this.updateInspectorValues(ent);
          this.hasModifiedSetup = true;
          if (this.engine.isPaused) this.engine.saveSnapshot();
          this.renderer.render(this.engine, this.input);
        }
      });
    }

    // Masa seleccionada
    if (sliderSelectedMass) {
      sliderSelectedMass.addEventListener("input", (e) => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && ent.type === "body") {
          const val = parseFloat(e.target.value);
          ent.setMass(val, this.engine.isPaused);
          this.updateInspectorValues(ent);
          this.hasModifiedSetup = true;
          if (this.engine.isPaused) this.engine.saveSnapshot();
          this.renderer.render(this.engine, this.input);
          this.updateTelemetry();
        }
      });
    }

    // Radio de la masa seleccionada
    if (sliderSelectedRadius) {
      sliderSelectedRadius.addEventListener("input", (e) => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && ent.type === "body") {
          const val = parseInt(e.target.value, 10);
          ent.radius = val;
          this.updateInspectorValues(ent);
          this.hasModifiedSetup = true;
          if (this.engine.isPaused) this.engine.saveSnapshot();
          this.renderer.render(this.engine, this.input);
        }
      });
    }

    // Rigidez del resorte seleccionado
    if (sliderSelectedStiffness) {
      sliderSelectedStiffness.addEventListener("input", (e) => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && ent.type === "spring") {
          const val = parseFloat(e.target.value);
          if (ent.setStiffness) ent.setStiffness(val, this.engine.isPaused);
          else ent.stiffness = val;
          this.updateInspectorValues(ent);
          this.hasModifiedSetup = true;
          if (this.engine.isPaused) this.engine.saveSnapshot();
          this.renderer.render(this.engine, this.input);
        }
      });
    }

    // Longitud natural del resorte seleccionado
    if (sliderSelectedRestLength) {
      sliderSelectedRestLength.addEventListener("input", (e) => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && ent.type === "spring") {
          const val = parseFloat(e.target.value);
          if (ent.setRestLength) ent.setRestLength(val, this.engine.isPaused);
          else ent.restLength = val;
          this.updateInspectorValues(ent);
          this.hasModifiedSetup = true;
          if (this.engine.isPaused) this.engine.saveSnapshot();
          this.renderer.render(this.engine, this.input);
        }
      });
    }

    // Longitud nominal de varilla o cuerda seleccionada
    if (sliderSelectedLength) {
      sliderSelectedLength.addEventListener("input", (e) => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && (ent.type === "rod" || ent.type === "rope")) {
          const val = parseFloat(e.target.value);
          if (ent.setLength) ent.setLength(val, this.engine.isPaused);
          else ent.length = val;
          if (this.engine.isPaused) {
            this.engine.solveConstraints(false);
            this.engine.saveSnapshot();
          }
          this.updateInspectorValues(ent);
          this.hasModifiedSetup = true;
          this.renderer.render(this.engine, this.input);
        }
      });
    }

    // Propiedades del Riel con Plataforma Deslizante (Slider)
    const sliderSelectedSliderMass = document.getElementById("slider-insp-slider-mass");
    if (sliderSelectedSliderMass) {
      sliderSelectedSliderMass.addEventListener("input", (e) => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && ent.type === "slider") {
          ent.setMass(parseFloat(e.target.value), this.engine.isPaused);
          this.updateInspectorValues(ent);
          this.hasModifiedSetup = true;
          if (this.engine.isPaused) this.engine.saveSnapshot();
          this.renderer.render(this.engine, this.input);
        }
      });
    }

    const sliderRailLength = document.getElementById("slider-insp-rail-length");
    if (sliderRailLength) {
      sliderRailLength.addEventListener("input", (e) => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && ent.type === "slider") {
          ent.setRailLength(parseFloat(e.target.value), this.engine.isPaused);
          this.updateInspectorValues(ent);
          this.hasModifiedSetup = true;
          if (this.engine.isPaused) this.engine.saveSnapshot();
          this.renderer.render(this.engine, this.input);
        }
      });
    }

    const sliderRailAngle = document.getElementById("slider-insp-rail-angle");
    if (sliderRailAngle) {
      sliderRailAngle.addEventListener("input", (e) => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && ent.type === "slider") {
          const rad = parseFloat(e.target.value) * (Math.PI / 180);
          ent.setRailAngle(rad, this.engine.isPaused);
          this.updateInspectorValues(ent);
          this.hasModifiedSetup = true;
          if (this.engine.isPaused) this.engine.saveSnapshot();
          this.renderer.render(this.engine, this.input);
        }
      });
    }

    const railPresets = document.querySelectorAll("#inspector-rail-presets .preset-btn");
    railPresets.forEach((btn) => {
      btn.addEventListener("click", () => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && ent.type === "slider") {
          const deg = parseFloat(btn.getAttribute("data-angle"));
          if (!isNaN(deg)) {
            ent.setRailAngle(deg * (Math.PI / 180), this.engine.isPaused);
            this.updateInspectorValues(ent);
            this.hasModifiedSetup = true;
            if (this.engine.isPaused) this.engine.saveSnapshot();
            this.renderer.render(this.engine, this.input);
          }
        }
      });
    });

    const btnRailRotate = document.getElementById("btn-insp-rail-rotate");
    if (btnRailRotate) {
      btnRailRotate.addEventListener("click", () => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && ent.type === "slider") {
          let deg = Math.round((ent.railAngle || 0) * (180 / Math.PI)) + 45;
          if (isNaN(deg)) deg = 45;
          if (deg > 180) deg -= 360;
          ent.setRailAngle(deg * (Math.PI / 180), this.engine.isPaused);
          this.updateInspectorValues(ent);
          this.hasModifiedSetup = true;
          if (this.engine.isPaused) this.engine.saveSnapshot();
          this.renderer.render(this.engine, this.input);
        }
      });
    }

    const sliderRailFriction = document.getElementById("slider-insp-rail-friction");
    if (sliderRailFriction) {
      sliderRailFriction.addEventListener("input", (e) => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && ent.type === "slider") {
          ent.railFriction = parseFloat(e.target.value);
          this.updateInspectorValues(ent);
          this.hasModifiedSetup = true;
          if (this.engine.isPaused) this.engine.saveSnapshot();
          this.renderer.render(this.engine, this.input);
        }
      });
    }

    const sliderRailRestitution = document.getElementById("slider-insp-rail-restitution");
    if (sliderRailRestitution) {
      sliderRailRestitution.addEventListener("input", (e) => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && ent.type === "slider") {
          ent.restitution = parseFloat(e.target.value);
          this.updateInspectorValues(ent);
          this.hasModifiedSetup = true;
          if (this.engine.isPaused) this.engine.saveSnapshot();
          this.renderer.render(this.engine, this.input);
        }
      });
    }

    // Controles del motor para el Riel Motorizado
    const sliderMotorSpeed = document.getElementById("slider-insp-motor-speed");
    if (sliderMotorSpeed) {
      sliderMotorSpeed.addEventListener("input", (e) => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && ent.isMotorized) {
          ent.setMotorSpeed(parseFloat(e.target.value), this.engine.isPaused);
          this.updateInspectorValues(ent);
          this.hasModifiedSetup = true;
          if (this.engine.isPaused) this.engine.saveSnapshot();
          this.renderer.render(this.engine, this.input);
        }
      });
    }

    const sliderMotorAmp = document.getElementById("slider-insp-motor-amp");
    if (sliderMotorAmp) {
      sliderMotorAmp.addEventListener("input", (e) => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && ent.isMotorized) {
          ent.setMotorAmplitude(parseFloat(e.target.value) / 100, this.engine.isPaused);
          this.updateInspectorValues(ent);
          this.hasModifiedSetup = true;
          if (this.engine.isPaused) this.engine.saveSnapshot();
          this.renderer.render(this.engine, this.input);
        }
      });
    }

    const btnMotorToggle = document.getElementById("btn-insp-motor-toggle");
    if (btnMotorToggle) {
      btnMotorToggle.addEventListener("click", () => {
        const ent = this.editingEntity || this.input.selectedEntity;
        if (ent && ent.isMotorized) {
          ent.setMotorEnabled(!ent.motorEnabled);
          this.updateInspectorValues(ent);
          this.hasModifiedSetup = true;
          if (this.engine.isPaused) this.engine.saveSnapshot();
          this.renderer.render(this.engine, this.input);
        }
      });
    }

    // Inicializar Gestor de Tabla de Datos Temporales
    if (this.tableManager) {
      this.tableManager.initDOM();
    }

    // Inicializar Sistema de Referencia Global
    this.initReferenceFrameUI();

    // Actualizar disponibilidad de parámetros en el inicio
    this.updateDynamicParametersUI();
    this.updateTimelineUI();

    // Atajos de teclado: Barra espaciadora para pausar y reanudar la simulación
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        this.togglePause();
      } else if (e.key === "Escape") {
        this.closeInspector();
        if (this.tableManager) this.tableManager.close();
        const panelRef = document.getElementById("reference-frame-panel");
        if (panelRef && !panelRef.classList.contains("is-hidden")) {
          panelRef.classList.add("is-hidden");
          const btnToolRef = document.getElementById("btn-tool-ref-frame");
          if (btnToolRef) btnToolRef.classList.remove("active");
        }
      }
    });

    // Ajuste responsivo del lienzo
    window.addEventListener("resize", () => {
      this.engine.bounds.width = this.renderer.width;
      this.engine.bounds.height = this.renderer.height;
    });
    this.engine.bounds.width = this.renderer.width;
    this.engine.bounds.height = this.renderer.height;
  }

  /**
   * Inicializa controles de navegación y zoom (Tablero Digital)
   */
  initZoomUI() {
    const btnIn = document.getElementById("btn-zoom-in");
    const btnOut = document.getElementById("btn-zoom-out");
    const btnReset = document.getElementById("btn-zoom-reset");

    const getCenter = () => {
      const rect = this.canvas.getBoundingClientRect();
      return { x: rect.width / 2, y: rect.height / 2 };
    };

    if (btnIn) {
      btnIn.addEventListener("click", () => {
        const c = getCenter();
        this.renderer.zoomAt(c.x, c.y, 1.25);
        this.updateZoomUI(this.renderer.camera.zoom);
      });
    }

    if (btnOut) {
      btnOut.addEventListener("click", () => {
        const c = getCenter();
        this.renderer.zoomAt(c.x, c.y, 0.8);
        this.updateZoomUI(this.renderer.camera.zoom);
      });
    }

    if (btnReset) {
      btnReset.addEventListener("click", () => {
        this.centerView();
        this.updateZoomUI(this.renderer.camera.zoom);
      });
    }
  }

  updateZoomUI(zoom) {
    const btnReset = document.getElementById("btn-zoom-reset");
    if (btnReset) {
      btnReset.textContent = `${Math.round(zoom * 100)}%`;
    }
  }

  centerView() {
    this.renderer.resetView();
  }

  /**
   * Menú plegable para agregar objetos
   */
  initDropdown() {
    const dropdown = document.getElementById("dropdown-add");
    const toggleBtn = document.getElementById("btn-add-toggle");
    const items = document.querySelectorAll(".dropdown-item");

    if (!dropdown || !toggleBtn) return;

    // Abrir/cerrar al hacer clic en el botón de toggle
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("is-open");
      const isOpen = dropdown.classList.contains("is-open");
      toggleBtn.setAttribute("aria-expanded", isOpen);
    });

    // Seleccionar herramienta desde el menú plegable
    items.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const tool = item.dataset.tool;
        if (tool === "preset_pendulum") {
          this.setupSimplePendulumScene();
        } else {
          this.input.setTool(tool);
        }
        dropdown.classList.remove("is-open");
        toggleBtn.setAttribute("aria-expanded", "false");
      });
    });

    // Cerrar al hacer clic en cualquier parte fuera del menú
    document.addEventListener("click", (e) => {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove("is-open");
        toggleBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  /**
   * Ventanas flotantes deslizables por toda la pantalla y minimizables (Parámetros y Telemetría)
   */
  initDraggablePanels() {
    this.setupDraggableWindow("hud-panel", "panel-header", "btn-minimize-panel");
    this.setupDraggableWindow("telemetry-panel", "telemetry-header", "btn-minimize-telemetry");
    this.setupDraggableWindow("timescale-panel", "timescale-header", "btn-minimize-timescale");
    this.setupDraggableWindow("object-inspector-panel", "inspector-header", "btn-minimize-inspector");
    this.setupDraggableWindow("data-table-panel", "data-table-header", "btn-minimize-data-table");
    this.setupDraggableWindow("reference-frame-panel", "reference-frame-header", "btn-minimize-ref-frame");
  }

  setupDraggableWindow(panelId, headerId, btnMinimizeId) {
    const panel = document.getElementById(panelId);
    const header = document.getElementById(headerId);
    const btnMinimize = document.getElementById(btnMinimizeId);

    if (!panel || !header) return;

    // --- 1. Lógica de Minimizar / Restaurar ---
    const toggleMinimize = (e) => {
      if (e) e.stopPropagation();
      panel.classList.toggle("is-minimized");
      const isMin = panel.classList.contains("is-minimized");
      if (btnMinimize) {
        btnMinimize.textContent = isMin ? "□" : "—";
        btnMinimize.title = isMin ? "Restaurar ventana" : "Minimizar ventana";
        btnMinimize.setAttribute("aria-label", isMin ? "Restaurar ventana" : "Minimizar ventana");
      }
    };

    if (btnMinimize) {
      btnMinimize.addEventListener("click", toggleMinimize);
    }
    // Doble clic en la cabecera para minimizar/expandir
    header.addEventListener("dblclick", toggleMinimize);

    // Traer la ventana al frente (z-index) al interactuar con ella
    const bringToFront = () => {
      document.querySelectorAll(".hud-panel").forEach((p) => {
        p.style.zIndex = "30";
      });
      panel.style.zIndex = "35";
    };

    panel.addEventListener("pointerdown", () => bringToFront());

    // --- 2. Lógica de Desplazamiento por toda la pantalla (Draggable) ---
    let isDraggingPanel = false;
    let startPointerX = 0;
    let startPointerY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    const onPointerDown = (e) => {
      // Ignorar si se hace clic en botones de la cabecera
      if (e.target.closest("button") || e.target.closest(".badge")) return;

      isDraggingPanel = true;
      startPointerX = e.clientX;
      startPointerY = e.clientY;

      const rect = panel.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      // Fijar posición exacta en coordenadas absolutas
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = `${initialLeft}px`;
      panel.style.top = `${initialTop}px`;
      header.style.cursor = "grabbing";
      bringToFront();

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    };

    const onPointerMove = (e) => {
      if (!isDraggingPanel) return;

      const deltaX = e.clientX - startPointerX;
      const deltaY = e.clientY - startPointerY;

      let newLeft = initialLeft + deltaX;
      let newTop = initialTop + deltaY;

      // Limitar dentro de los bordes visibles de la pantalla
      const panelWidth = panel.offsetWidth;
      const panelHeight = panel.offsetHeight;
      const maxLeft = Math.max(10, window.innerWidth - panelWidth - 10);
      const maxTop = Math.max(10, window.innerHeight - panelHeight - 10);

      newLeft = Math.max(10, Math.min(maxLeft, newLeft));
      newTop = Math.max(10, Math.min(maxTop, newTop));

      panel.style.left = `${newLeft}px`;
      panel.style.top = `${newTop}px`;
    };

    const onPointerUp = () => {
      if (isDraggingPanel) {
        isDraggingPanel = false;
        header.style.cursor = "grab";
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      }
    };

    header.addEventListener("pointerdown", onPointerDown);
  }


  /**
   * Detecta y actualiza dinámicamente qué parámetros pueden variarse en el HUD
   */
  updateDynamicParametersUI() {
    const params = this.engine.getDetectableParameters();

    const groupGravity = document.getElementById("group-gravity");
    const groupDamping = document.getElementById("group-damping");
    const emptyNotice = document.getElementById("params-empty-notice");
    const title = document.getElementById("params-section-title");

    // 1. Mostrar/Ocultar parámetro de gravedad global según la presencia de masas móviles
    if (groupGravity) {
      groupGravity.classList.toggle("is-hidden", !params.canVaryGravity);
    }

    // 2. Mostrar/Ocultar amortiguamiento (c) siempre que haya cuerpos con movimiento en el sistema
    if (groupDamping) {
      groupDamping.classList.toggle("is-hidden", !params.canVaryDamping);
    }

    // 3. Aviso de estado vacío y contador dinámico de parámetros globales activos
    const totalActive = (params.canVaryGravity ? 1 : 0) +
                        (params.canVaryDamping ? 1 : 0);

    if (emptyNotice) {
      emptyNotice.classList.toggle("is-hidden", totalActive > 0);
    }

    if (title) {
      title.textContent = totalActive > 0
        ? `Parámetros Globales (${totalActive})`
        : `Parámetros Globales (0)`;
    }
  }

  /**
   * Rota el soporte actualmente seleccionado o en edición (por defecto +45°)
   */
  rotateSelectedAnchor(deltaAngle = Math.PI / 4) {
    const ent = this.editingEntity || this.input.selectedEntity;
    if (ent && ent.type === "anchor") {
      let cur = (ent.hatchAngle !== undefined ? ent.hatchAngle : -Math.PI / 2) + deltaAngle;
      while (cur > Math.PI) cur -= 2 * Math.PI;
      while (cur < -Math.PI) cur += 2 * Math.PI;
      ent.hatchAngle = cur;
      this.updateInspectorValues(ent);
      this.hasModifiedSetup = true;
      if (this.engine.isPaused) this.engine.saveSnapshot();
      this.renderer.render(this.engine, this.input);
    }
  }

  /**
   * Despliega la ventana/menú cerrable de inspección y edición de parámetros específicos del objeto
   */
  openInspector(entity) {
    if (!entity) return;
    this.editingEntity = entity;
    const panel = document.getElementById("object-inspector-panel");
    const title = document.getElementById("inspector-title");
    const badge = document.getElementById("inspector-badge");
    const secAnchor = document.getElementById("inspector-sec-anchor");
    const secSlider = document.getElementById("inspector-sec-slider");
    const secBody = document.getElementById("inspector-sec-body");
    const secSpring = document.getElementById("inspector-sec-spring");
    const secConn = document.getElementById("inspector-sec-connector");

    if (!panel) return;

    if (secAnchor) secAnchor.classList.add("is-hidden");
    if (secSlider) secSlider.classList.add("is-hidden");
    if (secBody) secBody.classList.add("is-hidden");
    if (secSpring) secSpring.classList.add("is-hidden");
    if (secConn) secConn.classList.add("is-hidden");

    if (entity.type === "anchor") {
      if (title) title.textContent = "SOPORTE FIJO";
      if (badge) badge.textContent = "ANCLAJE";
      if (secAnchor) secAnchor.classList.remove("is-hidden");
    } else if (entity.type === "slider") {
      if (entity.isMotorized) {
        if (title) title.textContent = "RIEL MOTORIZADO";
        if (badge) badge.textContent = "ACTUADOR";
      } else {
        if (title) title.textContent = "RIEL CON PLATAFORMA";
        if (badge) badge.textContent = "GUÍA LINEAL";
      }
      if (secSlider) secSlider.classList.remove("is-hidden");
      const motorControls = document.getElementById("inspector-motor-controls");
      if (motorControls) {
        if (entity.isMotorized) {
          motorControls.classList.remove("is-hidden");
        } else {
          motorControls.classList.add("is-hidden");
        }
      }
    } else if (entity.type === "body") {
      if (title) title.textContent = "MASA PUNTUAL";
      if (badge) badge.textContent = "PARTÍCULA";
      if (secBody) secBody.classList.remove("is-hidden");
    } else if (entity.type === "spring") {
      if (title) title.textContent = "RESORTE ELÁSTICO";
      if (badge) badge.textContent = "HOOKE";
      if (secSpring) secSpring.classList.remove("is-hidden");
    } else if (entity.type === "rod") {
      if (title) title.textContent = "VARILLA RÍGIDA";
      if (badge) badge.textContent = "CONST-L";
      if (secConn) secConn.classList.remove("is-hidden");
    } else if (entity.type === "rope") {
      if (title) title.textContent = "CUERDA FLEXIBLE";
      if (badge) badge.textContent = "INELÁSTICA";
      if (secConn) secConn.classList.remove("is-hidden");
    }

    this.updateInspectorValues(entity);
    panel.classList.remove("is-hidden");
    // Traer al frente z-index
    document.querySelectorAll(".hud-panel").forEach((p) => {
      p.style.zIndex = "30";
    });
    panel.style.zIndex = "45";
    this.renderer.render(this.engine, this.input);
  }

  /**
   * Cierra el menú/ventana del inspector de objeto
   */
  closeInspector() {
    const panel = document.getElementById("object-inspector-panel");
    if (panel) {
      panel.classList.add("is-hidden");
    }
    this.editingEntity = null;
    this.renderer.render(this.engine, this.input);
  }

  /**
   * Sincroniza los valores y estados de bloqueo dentro del inspector con la entidad inspeccionada
   */
  updateInspectorValues(entity) {
    if (!entity) return;

    if (entity.type === "body") {
      const sliderMass = document.getElementById("slider-insp-mass");
      const valMass = document.getElementById("val-insp-mass");
      const sliderRadius = document.getElementById("slider-insp-radius");
      const valRadius = document.getElementById("val-insp-radius");
      const valPos = document.getElementById("val-insp-body-pos");
      const valVel = document.getElementById("val-insp-body-vel");

      if (sliderMass) sliderMass.value = entity.mass.toFixed(1);
      if (valMass) valMass.textContent = `${entity.mass.toFixed(2)} kg`;
      if (sliderRadius) sliderRadius.value = entity.radius || 20;
      if (valRadius) valRadius.textContent = `${entity.radius || 20} px`;

      const ppm = this.engine.pixelsPerMeter || 100;
      const rf = this.engine.referenceFrame;
      if (valPos) {
        if (rf) {
          const xM = rf.toPhysicalX(entity.position.x);
          const yM = rf.toPhysicalY(entity.position.y);
          valPos.textContent = `X: ${xM >= 0 ? "+" : ""}${xM.toFixed(2)} m, Y: ${yM >= 0 ? "+" : ""}${yM.toFixed(2)} m`;
        } else {
          const xM = (entity.position.x / ppm).toFixed(2);
          const yM = (entity.position.y / ppm).toFixed(2);
          valPos.textContent = `X: ${xM}m, Y: ${yM}m`;
        }
      }
      if (valVel) {
        const speed = (entity.velocity.mag() / ppm).toFixed(2);
        valVel.textContent = `${speed} m/s`;
      }
    } else if (entity.type === "anchor") {
      const sliderAngle = document.getElementById("slider-insp-anchor-angle");
      const valAngle = document.getElementById("val-insp-anchor-angle");
      const sliderWidth = document.getElementById("slider-insp-anchor-width");
      const valWidth = document.getElementById("val-insp-anchor-width");
      const presets = document.querySelectorAll("#inspector-anchor-presets .preset-btn");

      let deg = Math.round((entity.hatchAngle !== undefined ? entity.hatchAngle : -Math.PI / 2) * 180 / Math.PI);
      while (deg > 180) deg -= 360;
      while (deg < -180) deg += 360;

      let orient = "";
      if (Math.abs(deg - (-90)) <= 8) orient = " (Techo)";
      else if (Math.abs(deg - 90) <= 8) orient = " (Suelo)";
      else if (Math.abs(deg - 0) <= 8) orient = " (Pared Der)";
      else if (Math.abs(Math.abs(deg) - 180) <= 8) orient = " (Pared Izq)";

      if (valAngle) valAngle.textContent = `${deg}°${orient}`;
      if (sliderAngle) sliderAngle.value = deg;

      presets.forEach((btn) => {
        const bAngle = parseInt(btn.dataset.angle, 10);
        const match = Math.abs(bAngle - deg) < 8 || (Math.abs(bAngle) === 180 && Math.abs(deg) === 180);
        btn.classList.toggle("active", match);
      });

      const w = entity.hatchWidth || 44;
      if (sliderWidth) sliderWidth.value = w;
      if (valWidth) valWidth.textContent = `${w} px`;
    } else if (entity.type === "spring") {
      const btnSpringLockX = document.getElementById("btn-spring-lock-x");
      const springLockXIndicator = document.getElementById("spring-lock-x-indicator");
      const springLockXText = document.getElementById("spring-lock-x-text");
      const btnSpringLockY = document.getElementById("btn-spring-lock-y");
      const springLockYIndicator = document.getElementById("spring-lock-y-indicator");
      const springLockYText = document.getElementById("spring-lock-y-text");

      if (btnSpringLockX) {
        btnSpringLockX.classList.toggle("is-locked", !!entity.lockX);
        if (springLockXIndicator) springLockXIndicator.textContent = entity.lockX ? "[ACTIVO]" : "[INACTIVO]";
        if (springLockXText) springLockXText.textContent = entity.lockX ? "Eje X Bloqueado" : "Bloquear Eje X";
      }

      if (btnSpringLockY) {
        btnSpringLockY.classList.toggle("is-locked", !!entity.lockY);
        if (springLockYIndicator) springLockYIndicator.textContent = entity.lockY ? "[ACTIVO]" : "[INACTIVO]";
        if (springLockYText) springLockYText.textContent = entity.lockY ? "Eje Y Bloqueado" : "Bloquear Eje Y";
      }

      const sliderStiff = document.getElementById("slider-insp-stiffness");
      const valStiff = document.getElementById("val-insp-stiffness");
      const sliderRest = document.getElementById("slider-insp-restlength");
      const valRest = document.getElementById("val-insp-restlength");
      const valDx = document.getElementById("val-insp-spring-dx");
      const valForce = document.getElementById("val-insp-spring-force");

      const ppm = this.engine.pixelsPerMeter || 100;
      if (sliderStiff) sliderStiff.value = entity.stiffness.toFixed(0);
      if (valStiff) valStiff.textContent = `${entity.stiffness.toFixed(1)} N/m`;
      if (sliderRest) sliderRest.value = entity.restLength.toFixed(0);
      if (valRest) valRest.textContent = `${(entity.restLength / ppm).toFixed(2)} m (${Math.round(entity.restLength)} px)`;

      if (entity.nodeA && entity.nodeB) {
        const currentDist = Vector2D.dist(entity.nodeA.position, entity.nodeB.position);
        const dxM = (currentDist - entity.restLength) / ppm;
        const forceN = Math.abs(dxM * entity.stiffness);
        if (valDx) valDx.textContent = `${dxM >= 0 ? "+" : ""}${dxM.toFixed(2)} m`;
        if (valForce) valForce.textContent = `${forceN.toFixed(2)} N`;
      }
    } else if (entity.type === "rod" || entity.type === "rope") {
      const sliderLen = document.getElementById("slider-insp-length");
      const valLen = document.getElementById("val-insp-length");
      const valType = document.getElementById("val-insp-conn-type");

      const ppm = this.engine.pixelsPerMeter || 100;
      if (sliderLen) sliderLen.value = entity.length.toFixed(0);
      if (valLen) valLen.textContent = `${(entity.length / ppm).toFixed(2)} m (${Math.round(entity.length)} px)`;
      if (valType) {
        valType.textContent = entity.type === "rod" ? "Varilla Rígida" : "Cuerda Inelástica";
      }
    } else if (entity.type === "slider") {
      const ppm = this.engine.pixelsPerMeter || 100;

      const sliderMass = document.getElementById("slider-insp-slider-mass");
      const valMass = document.getElementById("val-insp-slider-mass");
      if (sliderMass) sliderMass.value = entity.mass.toFixed(1);
      if (valMass) valMass.textContent = `${entity.mass.toFixed(1)} kg`;

      const sliderRailLen = document.getElementById("slider-insp-rail-length");
      const valRailLen = document.getElementById("val-insp-rail-length");
      if (sliderRailLen) sliderRailLen.value = entity.railLength.toFixed(0);
      if (valRailLen) valRailLen.textContent = `${(entity.railLength / ppm).toFixed(2)} m (${Math.round(entity.railLength)} px)`;

      const deg = Math.round(entity.railAngle * (180 / Math.PI));
      const sliderRailAngle = document.getElementById("slider-insp-rail-angle");
      const valRailAngle = document.getElementById("val-insp-rail-angle");
      if (sliderRailAngle) sliderRailAngle.value = deg;
      if (valRailAngle) valRailAngle.textContent = `${deg}°`;

      // Actualizar estado visual de los presets de ángulo
      const railPresets = document.querySelectorAll("#inspector-rail-presets .preset-btn");
      railPresets.forEach((btn) => {
        const pDeg = parseInt(btn.getAttribute("data-angle"), 10);
        if (Math.abs(pDeg - deg) <= 1) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      });

      const sliderRailFric = document.getElementById("slider-insp-rail-friction");
      const valRailFric = document.getElementById("val-insp-rail-friction");
      const fric = entity.railFriction != null ? entity.railFriction : 0.02;
      if (sliderRailFric) sliderRailFric.value = fric.toFixed(2);
      if (valRailFric) valRailFric.textContent = fric.toFixed(2);

      const sliderRailRest = document.getElementById("slider-insp-rail-restitution");
      const valRailRest = document.getElementById("val-insp-rail-restitution");
      const rest = entity.restitution != null ? entity.restitution : 0.60;
      if (sliderRailRest) sliderRailRest.value = rest.toFixed(2);
      if (valRailRest) valRailRest.textContent = rest.toFixed(2);

      const valPos = document.getElementById("val-insp-slider-pos");
      const valVs = document.getElementById("val-insp-slider-vs");
      const valAngle = document.getElementById("val-insp-slider-angle");
      if (valPos) {
        const sM = ((entity.s || 0) / ppm).toFixed(2);
        if (rf) {
          const xM = rf.toPhysicalX(entity.position.x);
          const yM = rf.toPhysicalY(entity.position.y);
          valPos.textContent = `s: ${entity.s >= 0 ? '+' : ''}${sM} m | X: ${xM.toFixed(2)} m, Y: ${yM.toFixed(2)} m`;
        } else {
          valPos.textContent = `${entity.s >= 0 ? '+' : ''}${sM} m (${Math.round(entity.s || 0)} px)`;
        }
      }
      if (valVs) {
        const vsM = ((entity.sVel || 0) / ppm).toFixed(2);
        valVs.textContent = `${vsM} m/s`;
      }
      if (valAngle) {
        valAngle.textContent = `${deg}°`;
      }

      if (entity.isMotorized) {
        const sliderMotorSpeed = document.getElementById("slider-insp-motor-speed");
        const valMotorSpeed = document.getElementById("val-insp-motor-speed");
        if (sliderMotorSpeed) sliderMotorSpeed.value = (entity.motorSpeed || 1.5).toFixed(1);
        if (valMotorSpeed) valMotorSpeed.textContent = `${(entity.motorSpeed || 1.5).toFixed(2)} m/s`;

        const sliderMotorAmp = document.getElementById("slider-insp-motor-amp");
        const valMotorAmp = document.getElementById("val-insp-motor-amp");
        const ampPct = Math.round((entity.motorAmplitude !== undefined ? entity.motorAmplitude : 0.90) * 100);
        if (sliderMotorAmp) sliderMotorAmp.value = ampPct;
        if (valMotorAmp) valMotorAmp.textContent = `${ampPct}%`;

        const btnMotorToggle = document.getElementById("btn-insp-motor-toggle");
        const indMotor = document.getElementById("motor-toggle-indicator");
        const txtMotor = document.getElementById("motor-toggle-text");
        if (btnMotorToggle) {
          if (entity.motorEnabled) {
            btnMotorToggle.classList.add("is-locked");
            if (indMotor) indMotor.textContent = "[EN MARCHA]";
            if (txtMotor) txtMotor.textContent = "Motor Activo";
          } else {
            btnMotorToggle.classList.remove("is-locked");
            if (indMotor) indMotor.textContent = "[DETENIDO]";
            if (txtMotor) txtMotor.textContent = "Motor Pausado";
          }
        }
      }
    }
  }

  updateTelemetry() {
    const data = this.engine.calculateTelemetry();

    const elNodes = document.getElementById("tel-nodes");
    const elConns = document.getElementById("tel-connectors");
    const elEk = document.getElementById("tel-ek");
    const elEp = document.getElementById("tel-ep");
    const elEnergy = document.getElementById("tel-energy");
    const elSpeed = document.getElementById("tel-speed");

    if (elNodes) elNodes.textContent = `${data.nodeCount}`;
    if (elConns) elConns.textContent = `${data.connectorCount}`;
    if (elEk) elEk.textContent = `${data.kineticEnergy.toFixed(2)} J`;
    if (elEp) elEp.textContent = `${data.potentialEnergy.toFixed(2)} J`;
    if (elEnergy) elEnergy.textContent = `${data.totalEnergy.toFixed(2)} J`;
    if (elSpeed) elSpeed.textContent = `${data.avgSpeed.toFixed(2)} m/s`;

    // Sincronizar parámetros detectables en tiempo real
    this.updateDynamicParametersUI();
  }

  /**
   * Inicializa la interfaz y listeners para el Sistema de Referencia Global
   */
  initReferenceFrameUI() {
    const btnTool = document.getElementById("btn-tool-ref-frame");
    const panel = document.getElementById("reference-frame-panel");
    const btnClose = document.getElementById("btn-close-ref-frame");

    if (btnTool && panel) {
      btnTool.addEventListener("click", () => {
        panel.classList.toggle("is-hidden");
        btnTool.classList.toggle("active", !panel.classList.contains("is-hidden"));
        if (!panel.classList.contains("is-hidden")) {
          this.updateReferenceFrameUI();
        }
      });
    }

    if (btnClose && panel) {
      btnClose.addEventListener("click", () => {
        panel.classList.add("is-hidden");
        if (btnTool) btnTool.classList.remove("active");
      });
    }

    const rf = this.engine.referenceFrame;
    if (!rf) return;

    // Checkboxes de visualización
    const chkAxes = document.getElementById("chk-rf-axes");
    const chkGrid = document.getElementById("chk-rf-grid");
    const chkDatum = document.getElementById("chk-rf-datum");
    const chkCursor = document.getElementById("chk-rf-cursor");

    if (chkAxes) {
      chkAxes.checked = rf.showAxes;
      chkAxes.addEventListener("change", (e) => {
        rf.showAxes = e.target.checked;
        this.renderer.render(this.engine, this.input);
      });
    }

    if (chkGrid) {
      chkGrid.checked = rf.showGrid;
      chkGrid.addEventListener("change", (e) => {
        rf.showGrid = e.target.checked;
        this.renderer.render(this.engine, this.input);
      });
    }

    if (chkDatum) {
      chkDatum.checked = rf.showPotentialZero;
      chkDatum.addEventListener("change", (e) => {
        rf.showPotentialZero = e.target.checked;
        this.renderer.render(this.engine, this.input);
      });
    }

    if (chkCursor) {
      chkCursor.checked = rf.showCursorCoords;
      chkCursor.addEventListener("change", (e) => {
        rf.showCursorCoords = e.target.checked;
        const pill = document.getElementById("cursor-coords-pill");
        if (pill) pill.classList.toggle("is-hidden", !rf.showCursorCoords);
      });
    }

    // Entradas numéricas para el Origen (X0, Y0)
    const inputOrigX = document.getElementById("input-rf-origin-x");
    const inputOrigY = document.getElementById("input-rf-origin-y");

    if (inputOrigX) {
      inputOrigX.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
          rf.setOrigin(val, rf.origin.y);
          this.renderer.render(this.engine, this.input);
          this.updateReferenceFrameUI(true);
        }
      });
    }

    if (inputOrigY) {
      inputOrigY.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
          rf.setOrigin(rf.origin.x, val);
          this.renderer.render(this.engine, this.input);
          this.updateReferenceFrameUI(true);
        }
      });
    }

    // Presets del Origen
    const btnOrigCenter = document.getElementById("btn-rf-origin-center");
    const btnOrigBottomLeft = document.getElementById("btn-rf-origin-bottom-left");
    const btnOrigAlignObj = document.getElementById("btn-rf-origin-align-obj");

    if (btnOrigCenter) {
      btnOrigCenter.addEventListener("click", () => {
        const sheet = this.engine.sheet || { width: 1400, height: 900 };
        rf.setOrigin(sheet.width / 2, sheet.height / 2);
        this.updateReferenceFrameUI();
        this.renderer.render(this.engine, this.input);
      });
    }

    if (btnOrigBottomLeft) {
      btnOrigBottomLeft.addEventListener("click", () => {
        const sheet = this.engine.sheet || { width: 1400, height: 900, padding: 20 };
        rf.setOrigin(sheet.padding + 50, sheet.height - sheet.padding - 50);
        this.updateReferenceFrameUI();
        this.renderer.render(this.engine, this.input);
      });
    }

    if (btnOrigAlignObj) {
      btnOrigAlignObj.addEventListener("click", () => {
        const ent = this.input.selectedEntity;
        if (ent && ent.position) {
          rf.setOrigin(ent.position.x, ent.position.y);
          this.updateReferenceFrameUI();
          this.renderer.render(this.engine, this.input);
        }
      });
    }

    const btnOrigLowest = document.getElementById("btn-rf-origin-lowest");
    if (btnOrigLowest) {
      btnOrigLowest.addEventListener("click", () => {
        rf.alignOriginWithLowestPoint(this.input.selectedEntity);
        this.updateReferenceFrameUI();
        this.renderer.render(this.engine, this.input);
        this.updateTelemetry();
        if (this.tableManager) this.tableManager.renderFullTable();
      });
    }

    // Escala PPM (Píxeles por Metro)
    const sliderPpm = document.getElementById("slider-rf-ppm");
    const ppmPresets = document.querySelectorAll("#rf-ppm-presets .preset-btn");

    const setScalePpm = (ppm) => {
      if (isNaN(ppm) || ppm < 20 || ppm > 400) return;
      this.engine.setPixelsPerMeter(ppm);
      this.updateReferenceFrameUI();
      this.renderer.render(this.engine, this.input);
      this.updateTelemetry();
      if (this.tableManager) this.tableManager.renderFullTable();
      if (this.input.selectedEntity) this.updateInspectorValues(this.input.selectedEntity);
    };

    if (sliderPpm) {
      sliderPpm.addEventListener("input", (e) => {
        setScalePpm(parseFloat(e.target.value));
      });
    }

    ppmPresets.forEach((btn) => {
      btn.addEventListener("click", () => {
        const ppm = parseFloat(btn.dataset.ppm);
        if (!isNaN(ppm)) setScalePpm(ppm);
      });
    });

    // Nivel Cero de Energía Potencial Gravitatoria (Datum line)
    const inputDatum = document.getElementById("input-rf-datum-phys");
    const btnDatumOrigin = document.getElementById("btn-rf-datum-align-origin");
    const btnDatumFloor = document.getElementById("btn-rf-datum-align-floor");
    const btnDatumObj = document.getElementById("btn-rf-datum-align-obj");
    const btnDatumLowest = document.getElementById("btn-rf-datum-lowest");
    const btnDatumZeroDirect = document.getElementById("btn-rf-datum-zero-direct");

    const setZeroDatum = () => {
      rf.setPotentialZeroPhysical(0);
      this.updateReferenceFrameUI();
      this.renderer.render(this.engine, this.input);
      this.updateTelemetry();
      if (this.tableManager) this.tableManager.renderFullTable();
    };

    if (btnDatumZeroDirect) {
      btnDatumZeroDirect.addEventListener("click", setZeroDatum);
    }

    if (inputDatum) {
      inputDatum.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
          rf.setPotentialZeroPhysical(val);
          this.updateReferenceFrameUI(true);
          this.renderer.render(this.engine, this.input);
          this.updateTelemetry();
          if (this.tableManager) this.tableManager.renderFullTable();
        }
      });
    }

    if (btnDatumOrigin) {
      btnDatumOrigin.addEventListener("click", setZeroDatum);
    }

    if (btnDatumFloor) {
      btnDatumFloor.addEventListener("click", () => {
        const sheet = this.engine.sheet || { height: 900, padding: 20 };
        rf.setPotentialZeroY(sheet.height - sheet.padding);
        this.updateReferenceFrameUI();
        this.renderer.render(this.engine, this.input);
        this.updateTelemetry();
        if (this.tableManager) this.tableManager.renderFullTable();
      });
    }

    if (btnDatumObj) {
      btnDatumObj.addEventListener("click", () => {
        const ent = this.input.selectedEntity;
        if (ent && ent.position) {
          rf.setPotentialZeroY(ent.position.y);
          this.updateReferenceFrameUI();
          this.renderer.render(this.engine, this.input);
          this.updateTelemetry();
          if (this.tableManager) this.tableManager.renderFullTable();
        }
      });
    }

    if (btnDatumLowest) {
      btnDatumLowest.addEventListener("click", () => {
        rf.alignPotentialZeroWithLowestPoint(this.input.selectedEntity);
        this.updateReferenceFrameUI();
        this.renderer.render(this.engine, this.input);
        this.updateTelemetry();
        if (this.tableManager) this.tableManager.renderFullTable();
      });
    }

    this.updateReferenceFrameUI();
  }

  /**
   * Sincroniza la visualización de los controles con el estado actual del ReferenceFrame
   */
  updateReferenceFrameUI(skipActiveInputs = false) {
    const rf = this.engine.referenceFrame;
    if (!rf) return;

    const chkAxes = document.getElementById("chk-rf-axes");
    const chkGrid = document.getElementById("chk-rf-grid");
    const chkDatum = document.getElementById("chk-rf-datum");
    const chkCursor = document.getElementById("chk-rf-cursor");

    if (chkAxes) chkAxes.checked = rf.showAxes;
    if (chkGrid) chkGrid.checked = rf.showGrid;
    if (chkDatum) chkDatum.checked = rf.showPotentialZero;
    if (chkCursor) chkCursor.checked = rf.showCursorCoords;

    const inputOrigX = document.getElementById("input-rf-origin-x");
    const inputOrigY = document.getElementById("input-rf-origin-y");
    if (!skipActiveInputs) {
      if (inputOrigX && document.activeElement !== inputOrigX) inputOrigX.value = Math.round(rf.origin.x);
      if (inputOrigY && document.activeElement !== inputOrigY) inputOrigY.value = Math.round(rf.origin.y);
    }

    const sliderPpm = document.getElementById("slider-rf-ppm");
    const valPpm = document.getElementById("val-rf-ppm");
    if (sliderPpm) sliderPpm.value = rf.pixelsPerMeter;
    if (valPpm) valPpm.textContent = `${Math.round(rf.pixelsPerMeter)} px/m (1 m = ${Math.round(rf.pixelsPerMeter)} px)`;

    const ppmPresets = document.querySelectorAll("#rf-ppm-presets .preset-btn");
    ppmPresets.forEach((btn) => {
      const p = parseFloat(btn.dataset.ppm);
      btn.classList.toggle("active", Math.abs(p - rf.pixelsPerMeter) < 1);
    });

    const datumPhys = rf.getPotentialZeroPhysical();
    const valDatum = document.getElementById("val-rf-datum-phys");
    const inputDatum = document.getElementById("input-rf-datum-phys");
    if (valDatum) valDatum.textContent = `${datumPhys >= 0 ? "+" : ""}${datumPhys.toFixed(2)} m`;
    if (inputDatum && (!skipActiveInputs || document.activeElement !== inputDatum)) {
      inputDatum.value = datumPhys.toFixed(2);
    }
  }

  /**
   * Actualiza la pastilla flotante con las coordenadas físicas del puntero del ratón
   */
  updateCursorCoordinates(pos) {
    const rf = this.engine.referenceFrame;
    const pill = document.getElementById("cursor-coords-pill");
    if (!rf || !rf.showCursorCoords || !pill) return;
    const formatted = rf.formatPosition(pos.x, pos.y);
    const elX = document.getElementById("cursor-coord-x");
    const elY = document.getElementById("cursor-coord-y");
    if (elX) elX.textContent = formatted.x;
    if (elY) elY.textContent = formatted.y;
  }

  setRewindMode(enable) {
    this.isRewinding = enable;
    const btnRewind = document.getElementById("btn-rewind");
    const badgeStatus = document.getElementById("badge-status");
    const btnPauseText = document.getElementById("btn-pause-text");

    if (btnRewind) {
      btnRewind.classList.toggle("active", this.isRewinding);
    }

    if (this.isRewinding) {
      this.engine.isPaused = false;
      if (btnPauseText) btnPauseText.textContent = "⏸";
      if (badgeStatus) {
        badgeStatus.textContent = "REWINDING";
        badgeStatus.style.background = "#e1f5fe";
      }
    } else {
      if (this.engine.isPaused) {
        if (btnPauseText) btnPauseText.textContent = "▶";
        if (badgeStatus) {
          badgeStatus.textContent = "PAUSED";
          badgeStatus.style.background = "#fff3cd";
        }
      } else {
        if (btnPauseText) btnPauseText.textContent = "⏸";
        if (badgeStatus) {
          badgeStatus.textContent = "RUNNING";
          badgeStatus.style.background = "#f0f0f0";
        }
      }
    }
  }

  toggleRewind() {
    this.setRewindMode(!this.isRewinding);
  }

  pauseSimulation() {
    this.engine.isPaused = true;
    this.isRewinding = false;
    const btnRewind = document.getElementById("btn-rewind");
    const btnPauseText = document.getElementById("btn-pause-text");
    const badgeStatus = document.getElementById("badge-status");

    if (btnRewind) btnRewind.classList.remove("active");
    if (btnPauseText) btnPauseText.textContent = "▶";
    if (badgeStatus) {
      badgeStatus.textContent = "PAUSED";
      badgeStatus.style.background = "#fff3cd";
    }
  }

  playForward() {
    if (isNaN(this.accumulator)) this.accumulator = 0;
    if (isNaN(this.engine.timeScale) || this.engine.timeScale <= 0) this.engine.timeScale = 1.0;
    if (this.hasModifiedSetup || !this.engine.snapshot) {
      this.engine.saveSnapshot();
      this.hasModifiedSetup = false;
    }
    this.engine.isPaused = false;
    this.isRewinding = false;
    for (const node of this.engine.nodes) {
      if (node !== this.input.draggedNode) {
        node.isDragging = false;
      }
    }
    const btnRewind = document.getElementById("btn-rewind");
    const btnPauseText = document.getElementById("btn-pause-text");
    const badgeStatus = document.getElementById("badge-status");

    if (btnRewind) btnRewind.classList.remove("active");
    if (btnPauseText) btnPauseText.textContent = "⏸";
    if (badgeStatus) {
      badgeStatus.textContent = "RUNNING";
      badgeStatus.style.background = "#f0f0f0";
    }
  }

  togglePause() {
    if (this.isRewinding) {
      this.pauseSimulation();
    } else if (this.engine.isPaused) {
      this.playForward();
    } else {
      this.pauseSimulation();
    }
  }

  doStepBack() {
    this.pauseSimulation();
    this.engine.stepBackward();
    this.renderer.render(this.engine, this.input);
    this.updateTelemetry();
    this.updateTimelineUI();
  }

  doStepForward() {
    this.pauseSimulation();
    const dt = this.fixedDelta * (this.engine.timeScale || 1.0);
    this.engine.stepForward(dt);
    this.renderer.render(this.engine, this.input);
    this.updateTelemetry();
    this.updateTimelineUI();
  }

  doResetState() {
    this.engine.restoreSnapshot();
    this.pauseSimulation();
    this.hasModifiedSetup = false;
    this.renderer.render(this.engine, this.input);
    this.updateTelemetry();
    this.updateTimelineUI();
  }

  updateTimelineUI() {
    const sliderTimeline = document.getElementById("slider-timeline");
    const valSimTime = document.getElementById("val-sim-time");

    if (sliderTimeline) {
      const maxFrames = Math.max(0, this.engine.history.length - 1);
      sliderTimeline.max = maxFrames;
      sliderTimeline.value = Math.max(0, this.engine.historyIndex);
    }
    if (valSimTime) {
      valSimTime.textContent = `${this.engine.simulationTime.toFixed(2)} s`;
    }
  }

  startLoop() {
    this.accumulator = 0;
    const fixedDt = 1 / 60;

    const loop = (timestamp) => {
      try {
        let dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        if (dt > 0.1) dt = 0.1; // Protección contra lag spikes o pestañas en segundo plano

        if (isNaN(this.engine.timeScale) || this.engine.timeScale <= 0) {
          this.engine.timeScale = 1.0;
        }
        if (isNaN(this.accumulator)) {
          this.accumulator = 0;
        }

        // Acumulador escalado según la velocidad actual
        const scaledDt = dt * this.engine.timeScale;
        this.accumulator += scaledDt;
        while (this.accumulator >= fixedDt) {
          if (this.isRewinding) {
            const hasMore = this.engine.stepBackward();
            if (!hasMore) {
              this.pauseSimulation();
              break;
            }
          } else if (!this.engine.isPaused) {
            this.engine.step(fixedDt);
            if (this.tableManager) {
              this.tableManager.onSimulationStep();
            }
          }
          this.accumulator -= fixedDt;
        }

        // 2. Renderizado esquemático con previsualizaciones
        this.renderer.render(this.engine, this.input);
        if (this.editingEntity) {
          this.updateInspectorValues(this.editingEntity);
        }

        // 3. Telemetría y scrubber de tiempo
        this.updateTelemetry();
        this.updateTimelineUI();
      } catch (loopErr) {
        console.error("LOOP EXCEPTION:", loopErr);
      } finally {
        requestAnimationFrame(loop);
      }
    };

    requestAnimationFrame(loop);
  }
}

// Arrancar cuando el DOM esté listo en entorno navegador
if (typeof window !== "undefined") {
  window.Physics = { Vector2D, Body, Anchor, Spring, Rod, Rope, Slider, MotorizedSlider };
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", () => {
      window.app = new PhysicsSandboxApp();
    });
  } else {
    window.app = new PhysicsSandboxApp();
  }
}



})();
