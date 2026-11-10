/* Copy CesiumJS's prebuilt runtime (Cesium.js + Workers, Assets, Widgets,
   ThirdParty) into public/cesium, where the parking map's 3D page loads it
   (src/components/parking/loadCesium.ts). Cesium is NOT bundled by webpack —
   it fetches its own workers and assets at runtime from CESIUM_BASE_URL.

   Runs on postinstall and before build; skips if the copy matches the
   installed version. public/cesium is gitignored. */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'cesium', 'Build', 'Cesium');
const dest = join(root, 'public', 'cesium');
const stamp = join(dest, '.version');

if (!existsSync(src)) {
  console.warn('[copy-cesium] cesium is not installed — skipping');
  process.exit(0);
}
const version = JSON.parse(readFileSync(join(root, 'node_modules', 'cesium', 'package.json'), 'utf8')).version;
if (existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === version) process.exit(0);

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const part of ['Cesium.js', 'Workers', 'Assets', 'Widgets', 'ThirdParty']) {
  const from = join(src, part);
  if (existsSync(from)) cpSync(from, join(dest, part), { recursive: true });
}
writeFileSync(stamp, version);
console.log(`[copy-cesium] copied Cesium ${version} to public/cesium`);
