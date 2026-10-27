/**
 * ============================================================================
 * input.js — Gestión de herramientas, interacción y eventos del puntero
 * ============================================================================
 */

import { Vector2D } from "./vector.js";
import { Body, Anchor, Spring, Rod, Rope, Slider, MotorizedSlider } from "./entities.js";

export class InputController {
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
