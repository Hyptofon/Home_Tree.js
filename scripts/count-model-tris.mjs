/**
 * Counts triangles and vertices in every .glb / .gltf under public/models
 * using raw binary parsing — no Three.js or WebGL required.
 *
 * Usage: node scripts/count-model-tris.mjs
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';

const MODELS_DIR = join(import.meta.dirname, '..', 'public', 'models');

// GLTF accessor component sizes
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function countGltfTris(json, buffers) {
  let tris = 0;
  let verts = 0;
  if (!json.meshes) return { tris, verts };

  for (const mesh of json.meshes) {
    for (const prim of mesh.primitives ?? []) {
      const mode = prim.mode ?? 4; // 4 = TRIANGLES
      if (prim.indices !== undefined) {
        const acc = json.accessors[prim.indices];
        const count = acc.count;
        if (mode === 4) tris += count / 3;
        else if (mode === 5 || mode === 6) tris += count - 2; // TRIANGLE_STRIP/FAN
      } else {
        const posIdx = prim.attributes?.POSITION;
        if (posIdx !== undefined) {
          const count = json.accessors[posIdx].count;
          if (mode === 4) tris += count / 3;
        }
      }
      const posIdx = prim.attributes?.POSITION;
      if (posIdx !== undefined) verts += json.accessors[posIdx].count;
    }
  }
  return { tris: Math.round(tris), verts };
}

function parseGlb(data) {
  const magic = data.readUInt32LE(0);
  if (magic !== 0x46546c67) return null; // 'glTF'
  const jsonLength = data.readUInt32LE(12);
  const jsonStr = data.toString('utf8', 20, 20 + jsonLength);
  const json = JSON.parse(jsonStr);

  const binOffset = 20 + jsonLength;
  const buffers = [];
  if (binOffset < data.length) {
    const binLength = data.readUInt32LE(binOffset);
    buffers.push(data.slice(binOffset + 8, binOffset + 8 + binLength));
  }
  return countGltfTris(json, buffers);
}

function parseGltf(path) {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  return countGltfTris(json, []);
}

function walkDir(dir, results = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walkDir(full, results);
    else {
      const ext = extname(name).toLowerCase();
      if (ext === '.glb' || ext === '.gltf') results.push(full);
    }
  }
  return results;
}

const files = walkDir(MODELS_DIR);
const results = [];

for (const file of files) {
  try {
    let info;
    if (extname(file).toLowerCase() === '.glb') {
      info = parseGlb(readFileSync(file));
    } else {
      info = parseGltf(file);
    }
    if (info) {
      const sizeMB = (statSync(file).size / 1048576).toFixed(2);
      results.push({ file: relative(MODELS_DIR, file), tris: info.tris, verts: info.verts, sizeMB });
    }
  } catch (e) {
    results.push({ file: relative(MODELS_DIR, file), tris: '?', verts: '?', sizeMB: '?' });
  }
}

results.sort((a, b) => (Number(b.tris) || 0) - (Number(a.tris) || 0));

console.log('\n📐 Model Triangle Count Report\n');
console.log('Triangles'.padStart(12), 'Vertices'.padStart(10), 'Size MB'.padStart(8), '  Model');
console.log('─'.repeat(80));
for (const r of results) {
  const t = String(r.tris).padStart(12);
  const v = String(r.verts).padStart(10);
  const s = String(r.sizeMB).padStart(8);
  const warn = Number(r.tris) > 50000 ? ' ⚠️  HIGH' : Number(r.tris) > 10000 ? ' ⚡ MED' : '';
  console.log(`${t} ${v} ${s}  ${r.file}${warn}`);
}
console.log('\n✅ Done.\n');
