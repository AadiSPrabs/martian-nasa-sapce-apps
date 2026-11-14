import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "node_modules", "cesium", "Build", "Cesium");
const target = path.join(root, "public", "cesium");
const marker = path.join(target, "Assets");

if (!fs.existsSync(source)) {
  console.error("[cesium] node_modules/cesium is missing. Run pnpm install first.");
  process.exit(1);
}

if (fs.existsSync(marker)) {
  console.log("[cesium] assets already present");
  process.exit(0);
}

fs.mkdirSync(target, { recursive: true });
for (const dir of ["Assets", "Widgets", "Workers", "ThirdParty"]) {
  const from = path.join(source, dir);
  if (!fs.existsSync(from)) continue;
  fs.cpSync(from, path.join(target, dir), { recursive: true });
  console.log(`[cesium] copied ${dir}`);
}
