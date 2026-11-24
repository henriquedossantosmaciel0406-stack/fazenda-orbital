// Visual cartoon: sombreamento em degraus (toon), cores vivas e contorno escuro (casco invertido).
import * as THREE from 'three';

// Rampa de 3 tons: sombra suave, meio-tom e luz cheia
const ramp = new Uint8Array([160, 218, 255]);
export const toonGradient = new THREE.DataTexture(ramp, 3, 1, THREE.RedFormat);
toonGradient.minFilter = toonGradient.magFilter = THREE.NearestFilter;
toonGradient.generateMipmaps = false;
toonGradient.needsUpdate = true;

// Deixa as cores mais saturadas e alegres
const hsl = {};
export function cartoonColor(hex) {
  const c = new THREE.Color(hex);
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s * 1.22 + 0.04), Math.min(0.92, hsl.l * 1.05 + 0.015));
  return c;
}

// Contorno: material escuro desenhado por tras (BackSide) em uma copia inflada da malha
export const outlineMat = new THREE.MeshBasicMaterial({ color: 0x24153A, side: THREE.BackSide });
let outlinesOn = true;
export function setOutlines(on) { outlinesOn = on; outlineMat.visible = on; }
export const outlinesEnabled = () => outlinesOn;

const outlineCache = new WeakMap();

// Normais suavizadas por posicao: cantos de caixas nao abrem fendas ao inflar
function inflated(geom, t) {
  const pos = geom.attributes.position, nor = geom.attributes.normal;
  const n = pos.count;
  const sum = new Map();
  const key = i => Math.round(pos.getX(i) * 400) + ',' + Math.round(pos.getY(i) * 400) + ',' + Math.round(pos.getZ(i) * 400);
  const keys = new Array(n);
  for (let i = 0; i < n; i++) {
    const k = key(i); keys[i] = k;
    let s = sum.get(k);
    if (!s) { s = [0, 0, 0]; sum.set(k, s); }
    s[0] += nor.getX(i); s[1] += nor.getY(i); s[2] += nor.getZ(i);
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = sum.get(keys[i]);
    const l = Math.hypot(s[0], s[1], s[2]) || 1;
    out[i * 3] = pos.getX(i) + s[0] / l * t;
    out[i * 3 + 1] = pos.getY(i) + s[1] / l * t;
    out[i * 3 + 2] = pos.getZ(i) + s[2] / l * t;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  if (geom.index) g.setIndex(geom.index);
  return g;
}

// Adiciona o contorno como filho da malha (compartilha o cache por geometria)
export function addOutline(mesh, thickness) {
  const geom = mesh.geometry;
  if (!geom || !geom.attributes.normal) return null;
  if (!geom.boundingSphere) geom.computeBoundingSphere();
  const r = geom.boundingSphere.radius;
  if (r > 45) return null; // terreno enorme: sem contorno
  const t = thickness || THREE.MathUtils.clamp(0.028 + r * 0.011, 0.03, 0.13);
  let og = outlineCache.get(geom);
  if (!og) { og = inflated(geom, t); outlineCache.set(geom, og); }
  const o = new THREE.Mesh(og, outlineMat);
  o.castShadow = false; o.receiveShadow = false; o.userData.outline = true; o.userData.ownedGeometry = !!mesh.userData.ownedGeometry;
  mesh.add(o);
  return o;
}
