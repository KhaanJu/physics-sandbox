# Physics Sandbox 2D ⚙️📐

Simulador interactivo 2D de física mecánica clásica desarrollado en JavaScript puro y HTML5 Canvas, con soporte para aceleración por hardware (WebGPU / WebGL fallback) y ejecución nativa tanto en navegador web como en entornos locales.

---

## 🌟 Características Principales

### 1. Entidades Físicas Modulares
- **Soportes Fijos (Anchor):** Anclajes de pared, suelo o techo con orientación ajustable.
- **Masas Puntuales (Body):** Cuerpos interactivos con masa y radio configurables.
- **Resortes Elásticos (Spring):** Ley de Hooke con rigidez ($k$), longitud natural ($L_0$) y bloqueo de ejes (guías 1D vertical u horizontal).
- **Varillas Rígidas (Rod):** Vínculos de distancia fija ideal sin masa.
- **Cuerdas Inelásticas (Rope):** Conexiones flexibles que soportan tensión y simulan péndulos simples.
- **Rieles con Plataforma Deslizante (Slider):** Guía lineal 1D con inclinación continua, coeficientes de fricción ($\mu$) y restitución en topes ($e$).
- **Rieles Motorizados (MotorizedSlider):** Movimiento armónico forzado continuo sin chocar con extremos.

### 2. Sistema de Referencia Global Configurable
- **Origen $(0,0)$ interactivo:** Arrastrable y configurable por coordenadas físicas o con alineación automática a puntos clave.
- **Ejes y Cuadrícula Métrica Graduada:** Conmutables y graduados en metros del Sistema Internacional (SI).
- **Escala de Conversión (PPM):** Configurable de 30 a 250 píxeles por metro (100 px/m por defecto).
- **Nivel Cero de Energía Potencial Gravitatoria ($E_p = 0$):** Datum independiente del origen con ajuste magnético (*snapping*) al origen, al punto más bajo del péndulo, al suelo o a los cuerpos.
- **Coordenadas en tiempo real:** Lectura física $(X, Y)$ del cursor en metros.

### 3. Ventana de Tabulación de Datos Temporales
- Registro y muestreo a intervalos de tiempo configurables ($\Delta t$ desde $0.02\text{ s}$ hasta $1.00\text{ s}$).
- Captura continua **En Vivo** y generación retroactiva desde el **Historial**.
- Magnitudes tabuladas según la teoría física: tiempo $t$, coordenadas $(X, Y)$, altura $h$, componentes de velocidad $(v_x, v_y)$, rapidez $|v|$, energía cinética $E_k$, energía potencial gravitatoria/elástica $E_p$, energía mecánica total $E_m$ y tensión analítica $T$.
- Exportación directa a formato **CSV**.

### 4. Control Temporal y Telemetría
- Control de transporte: Pausa, paso adelante, paso atrás, rebobinado continuo y reinicio de estado.
- Velocidad de simulación ajustable ($0.1\times$, $0.25\times$, $0.5\times$, $1.0\times$).
- Telemetría en tiempo real de conservación de energía mecánica, trabajo y velocidades medias.

---

## 🚀 Ejecución y Uso

Al tratarse de una aplicación web moderna y autónoma, puede ejecutarse de dos formas:

### Opción 1: Directa en Navegador (Sin dependencias)
Abre directamente `index.html` en cualquier navegador web moderno (Chrome, Edge, Firefox, Brave, Safari). `bundle.js` incluye todo el código compilado sin restricciones de CORS.

### Opción 2: Con Servidor Local
```bash
# Con Node.js
node server.js

# O con Python
python3 -m http.server 8080
```
Luego visita `http://localhost:8080` en tu navegador.

---

## 🛠️ Compilación y Estructura del Código

```bash
# Compilar bundle.js a partir de los módulos en js/
node build.js
```

### Estructura de Directorios
- `index.html`: Interfaz de usuario, barra de herramientas y paneles flotantes HUD.
- `style.css`: Estilos visuales técnicos con tema claro tipo pizarra de laboratorio.
- `bundle.js`: Paquete universal autónomo listo para producción.
- `build.js`: Script de empaquetado y optimización de módulos.
- `js/`: Módulos ES estructurados:
  - `vector.js`: Álgebra vectorial 2D.
  - `entities.js`: Modelos de cuerpos, conectores y rieles.
  - `physics.js`: Motor de integración Verlet, restricciones y colisiones.
  - `reference_frame.js`: Sistema de referencia global, conversiones SI y nivel cero.
  - `renderer.js`: Renderizado en Canvas con sombreados, cuadrículas y capas visuales.
  - `input.js`: Controlador de eventos de ratón, puntero táctil, teclado y atajos.
  - `table.js`: Gestor de la tabla de datos temporales e historial.
  - `main.js`: Bucle de simulación, gestión de estado y sincronización UI.
