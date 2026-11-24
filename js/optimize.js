// Otimizacao: funde varias malhas em uma so (com cores por vertice) para reduzir draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonGradient, addOutline } from './toon.js';

// Material unico usado por todas as malhas fundidas (a cor vem dos vertices)
export const vcMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient });
export const vcMatWet = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient, color: 0xA8A8A8 });

const tmpC = new THREE.Color(), mw = new THREE.Matrix4();

// Cor do material "assada" no vertice (o brilho emissivo vira cor mais clara)
function bake(mat, out) {
  out.copy(mat.color || tmpC.set(0xffffff));
  if (mat.emissive && mat.emissiveIntensity > 0) {
    const k = mat.emissiveIntensity * 0.7;
    out.r = Math.min(1, out.r + mat.emissive.r * k);
    out.g = Math.min(1, out.g + mat.emissive.g * k);
    out.b = Math.min(1, out.b + mat.emissive.b * k);
  }
  return out;
}

// Funde malhas; as matrizes sao relativas a `rootInv` (inverso da matriz mundial da raiz)
export function mergeMeshes(meshes, rootInv) {
  const list = [];
  for (const m of meshes) {
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    mw.multiplyMatrices(rootInv, m.matrixWorld);
    g.applyMatrix4(mw);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    bake(m.material, tmpC);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    list.push(g);
  }
  if (!list.length) return null;
  const merged = mergeGeometries(list, false);
  list.forEach(g => g.dispose());
  return merged;
}

// Pode ser fundida? (somente materiais padrao opacos e sem textura)
export const mergeable = o => o.isMesh && !o.isInstancedMesh && o.material && (o.material.isMeshStandardMaterial || o.material.isMeshToonMaterial) && !o.material.transparent && !o.material.map;

// Funde as malhas estaticas de um grupo em uma unica malha. `skip(mesh)` protege pecas animadas.
export function mergeGroupStatic(group, skip) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const meshes = [];
  group.traverse(o => { if (o !== group && mergeable(o) && !(skip && skip(o))) meshes.push(o); });
  if (meshes.length < 2) return;
  const geom = mergeMeshes(meshes, inv);
  if (!geom) return;
  let cast = false;
  for (const m of meshes) { cast = cast || m.castShadow; m.parent.remove(m); }
  const mesh = new THREE.Mesh(geom, vcMat);
  mesh.userData.ownedGeometry = true;
  mesh.castShadow = cast; mesh.receiveShadow = true;
  group.add(mesh);
  addOutline(mesh);
}

// Constroi (ou reaproveita do cache) uma malha fundida a partir de uma funcao que preenche um grupo temporario.
const cache = new Map();
export function cachedMerged(key, fill) {
  let g = cache.get(key);
  if (g === undefined) {
    const tmp = new THREE.Group();
    fill(tmp);
    tmp.updateMatrixWorld(true);
    const meshes = [];
    tmp.traverse(o => { if (o.isMesh) meshes.push(o); });
    g = meshes.length ? mergeMeshes(meshes, new THREE.Matrix4()) : null;
    cache.set(key, g);
  }
  return g;
}
