/**
 * ============================================================================
 * main.js — Inicialización, bucle principal, gestión de UI y presets
 * ============================================================================
 */

import { Vector2D } from "./vector.js";
import { Body, Anchor, Slider, MotorizedSlider, Spring, Rod, Rope } from "./entities.js";
import { ReferenceFrame } from "./reference_frame.js";
import { PhysicsEngine } from "./physics.js";
import { Renderer } from "./renderer.js";
import { InputController } from "./input.js";
import { DataTableManager } from "./table.js";

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

export { PhysicsSandboxApp };
