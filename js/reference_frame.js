/**
 * ============================================================================
 * reference_frame.js — Sistema de Referencia Global Configurable
 * Centraliza las transformaciones de coordenadas, conversión píxeles/metros
 * en el Sistema Internacional (SI) y nivel cero de energía potencial gravitatoria.
 * ============================================================================
 */

import { Vector2D } from "./vector.js";

export class ReferenceFrame {
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
