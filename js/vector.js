/**
 * ============================================================================
 * vector.js — Clase Vector2D para operaciones de álgebra lineal en 2D
 * ============================================================================
 */

export class Vector2D {
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
