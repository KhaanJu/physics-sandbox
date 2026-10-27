import fs from "fs";
import path from "path";

const files = [
  "js/vector.js",
  "js/entities.js",
  "js/reference_frame.js",
  "js/physics.js",
  "js/gpu_patch.js",
  "js/renderer.js",
  "js/input.js",
  "js/table.js",
  "js/main.js"
];

let bundleCode = `/**
 * bundle.js — Bundle autónomo universal para 2D Physics Sandbox
 * Generado automáticamente a partir de los módulos en js/
 * Permite ejecución nativa directa tanto en http:// como en file:/// sin restricciones de CORS.
 */
(function() {
"use strict";

`;

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  // Eliminar declaraciones de import
  content = content.replace(/^import\s+.*?;?\s*$/gm, "");
  // Quitar export de declaraciones de clase, función o constante
  content = content.replace(/^export\s+(class|function|const|let|var)\s+/gm, "$1 ");
  // Quitar sentencias export { ... }
  content = content.replace(/^export\s*\{[^}]*?\};?\s*$/gm, "");
  // Quitar export default
  content = content.replace(/^export\s+default\s+.*?;?\s*$/gm, "");

  bundleCode += `\n/* ==========================================================================\n   FILE: ${file}\n   ========================================================================== */\n` + content + "\n";
}

bundleCode += "\n})();\n";

fs.writeFileSync("bundle.js", bundleCode, "utf8");
console.log("✔ bundle.js compilado exitosamente. Tamaño:", bundleCode.length, "bytes.");
