import {meadowPaint,seaPaint,planetPaint} from './landscape-paint.js';
import {cloudField} from './weather.js';
import { buildTown } from './town.js';
import { finishStructure } from './workshop.js';
// Mundo 3D: terreno, estrada, fazenda, cidade, ilha, ponte, modelos de construcoes e decoracoes.
// Geometrias e materiais sao compartilhados (cache) para manter 60 FPS.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { mergeGroupStatic } from './optimize.js';
import { toonGradient, cartoonColor } from './toon.js';
import { woodland } from './woodland.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------- Caches compartilhados ----------
const geoCache = new Map();
export function geo(kind, ...a) {
  const key = kind + ':' + a.join(',');
  let g = geoCache.get(key);
  if (!g) {
    switch (kind) {
      case 'box': { const m = Math.min(a[0], a[1], a[2]); g = m < 0.05 ? new THREE.BoxGeometry(...a) : new RoundedBoxGeometry(a[0], a[1], a[2], 2, Math.min(0.14, m * 0.3)); break; }
      case 'cyl': g = new THREE.CylinderGeometry(...a); break;
      case 'cone': g = new THREE.ConeGeometry(...a); break;
      case 'sph': g = new THREE.SphereGeometry(...a); break;
      case 'ico': g = new THREE.IcosahedronGeometry(...a); break;
      case 'oct': g = new THREE.OctahedronGeometry(...a); break;
      case 'tor': g = new THREE.TorusGeometry(...a); break;
      case 'ring': g = new THREE.RingGeometry(...a); break;
      case 'plane': g = new THREE.PlaneGeometry(...a); break;
      default: throw new Error('geo desconhecida: ' + kind);
    }
    geoCache.set(key, g);
  }
  return g;
}
const matCache = new Map();
export function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  let m = matCache.get(key);
  if (!m) {
    const { roughness, metalness, flatShading, ...rest } = o; // propriedades PBR nao existem no material toon
    m = new THREE.MeshToonMaterial({ color: cartoonColor(color), gradientMap: toonGradient, ...rest });
    if (rest.emissive !== undefined) m.emissive = cartoonColor(rest.emissive);
    matCache.set(key, m);
  }
  return m;
}
export function glow(color, opacity = 1) {
  const key = 'g' + color + opacity;
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity }); matCache.set(key, m); }
  return m;
}
const emis = (color, i = 0.8, o = {}) => mat(color, { emissive: color, emissiveIntensity: i, ...o });

function add(group, mesh, x = 0, y = 0, z = 0, shadow = true) {
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
const M = (g, m) => new THREE.Mesh(g, m);

// Etiquetas de texto (canvas) para placas
export function makeLabel(text, color = '#4FE3C1', w = 6, h = 1.2) {
  const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,12,24,0.82)'; g.beginPath(); g.roundRect(4, 4, c.width - 8, c.height - 8, 22); g.fill();
  g.strokeStyle = color; g.lineWidth = 6; g.stroke();
  g.fillStyle = color; g.font = '800 ' + Math.round(c.height * 0.52) + 'px "Baloo 2", system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, c.width / 2, c.height / 2 + 3);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, toneMapped: false }));
  sign.scale.set(w, h, 1);
  return sign;
}

// Pulsos de brilho compartilhados (um por material, nao por instancia)
const PULSES = [];
const PULSE_MATS = new Set();
function pulsing(m, base, amp, speed) { if (!PULSE_MATS.has(m)) PULSES.push({ m, base, amp, speed }); PULSE_MATS.add(m); return m; }

// ---------- Modelos de estruturas ----------
export const STRUCT_COLORS = { building: 0x4FE3C1, decor: 0xFF9AE0 };

const builders = {
  rain(g, u) {
    add(g, M(geo('cyl', 1.1, 1.3, 0.5, 8), mat(0x6C7A89)), 0, 0.25, 0);
    add(g, M(geo('cyl', 0.75, 0.75, 1.5, 10), pulsing(emis(0x4FC3F7, 0.5, { transparent: true, opacity: 0.85 }), 0.5, 0.25, 2)), 0, 1.25, 0);
    add(g, M(geo('cyl', 1.6, 0.6, 0.9, 10, 1, true), mat(0xBFE9FF, { side: THREE.DoubleSide })), 0, 2.5, 0);
    add(g, M(geo('cyl', 0.1, 0.1, 0.5, 6), mat(0x3D4A5C)), 0, 3.1, 0);
    add(g, M(geo('sph', 0.25, 8, 6), emis(0x4FC3F7, 1)), 0, 3.4, 0);
    u.height = 3.6;
  },
  battery(g, u) {
    add(g, M(geo('cyl', 1.1, 1.25, 0.35, 12), mat(0x4C6E8C)), 0, 0.18, 0);
    add(g, M(geo('cyl', 0.95, 0.95, 2.3, 14), mat(0x2E3A4D)), 0, 1.5, 0);
    const s = pulsing(emis(0xFFD166, 0.9), 0.9, 0.5, 3);
    for (let i = 0; i < 3; i++) add(g, M(geo('cyl', 0.99, 0.99, 0.2, 14), s), 0, 0.85 + i * 0.6, 0, false);
    add(g, M(geo('sph', 0.95, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x3D4A5C)), 0, 2.65, 0);
    add(g, M(geo('cyl', 0.3, 0.3, 0.3, 10), mat(0xC9D8E4)), 0, 3.5, 0);
    add(g, M(geo('sph', 0.2, 8, 6), s), 0, 3.8, 0, false);
    for (const sx of [-1, 1]) add(g, M(geo('cyl', 0.05, 0.05, 1.3, 5), mat(0xFF6BE0)), sx * 1.02, 1.5, 0, false);
    u.height = 4.0;
  },
  silo(g, u) {
    add(g, M(geo('cyl', 1.55, 1.7, 0.35, 10), mat(0x7A8794)), 0, 0.18, 0);
    add(g, M(geo('cyl', 1.4, 1.4, 3.4, 10), mat(0xC9D8E4, { metalness: 0.3 })), 0, 2.0, 0);
    add(g, M(geo('sph', 1.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x4FE3C1)), 0, 3.7, 0);
    for (let i = 0; i < 3; i++) add(g, M(geo('tor', 1.42, 0.06, 6, 14), mat(0x4C6E8C)), 0, 1.1 + i * 1.0, 0, false).rotation.x = Math.PI / 2;
    add(g, M(geo('box', 0.25, 3.4, 0.12), mat(0x3D4A5C)), 1.0, 2.0, 1.05);
    u.height = 5.2;
  },
  lab(g, u) {
    add(g, M(geo('cyl', 2.7, 2.9, 0.4, 16), mat(0x8E9AAB)), 0, 0.2, 0);
    add(g, M(geo('cyl', 2.4, 2.5, 2.2, 16), mat(0xF1F5FA)), 0, 1.5, 0);
    for (let i = 0; i < 3; i++) add(g, M(geo('tor', 2.48, 0.07, 6, 28), mat(0x4C6E8C)), 0, 0.8 + i * 0.9, 0, false).rotation.x = Math.PI / 2;
    add(g, M(geo('sph', 2.5, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x7FE9FF, { transparent: true, opacity: 0.5 })), 0, 2.6, 0).scale.y = 0.75;
    add(g, M(geo('ico', 0.55, 1), pulsing(emis(0x59E6FF, 1.1), 1.1, 0.5, 3)), 0, 3.0, 0);
    add(g, M(geo('cyl', 0.5, 0.5, 0.12, 12), emis(0x4FE3C1, 0.9)), 0, 1.0, 2.45, false).rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.5; if (Math.cos(a - Math.PI / 2) > 0.9) continue; add(g, M(geo('cyl', 0.28, 0.28, 0.1, 10), emis(0xFFD166, 0.6)), Math.cos(a) * 2.42, 1.8, Math.sin(a) * 2.42, false).rotation.set(Math.PI / 2, 0, -a + Math.PI / 2); }
    const dish = new THREE.Group(); dish.position.set(0, 4.2, 0);
    dish.add(M(geo('cyl', 0.05, 0.05, 0.7, 6), mat(0x3D4A5C)));
    const bowl = M(geo('sph', 0.8, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xC9D8E4, { side: THREE.DoubleSide }));
    bowl.position.y = 0.5; bowl.rotation.x = Math.PI * 0.7; dish.add(bowl);
    g.add(dish); u.spin.push({ obj: dish, speed: 0.8 });
    u.height = 5.2;
  },
  factory(g, u) {
    add(g, M(geo('cyl', 2.9, 3.1, 0.35, 16), mat(0x8E9AAB)), 0, 0.18, 0);
    add(g, M(geo('cyl', 2.5, 2.6, 2.1, 16), mat(0xE8C99A)), 0, 1.4, 0);
    add(g, M(geo('sph', 2.6, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xE0794B)), 0, 2.45, 0).scale.y = 0.5;
    add(g, M(geo('tor', 2.55, 0.1, 6, 28), mat(0xC9683F)), 0, 2.4, 0, false).rotation.x = Math.PI / 2;
    for (const sx of [-1, 1]) { add(g, M(geo('cyl', 0.42, 0.5, 2.8, 10), mat(0x6C7A89)), sx * 1.5, 3.6, -1.0); add(g, M(geo('tor', 0.44, 0.07, 6, 12), mat(0xFFB74D)), sx * 1.5, 4.8, -1.0, false).rotation.x = Math.PI / 2; }
    const puff = M(geo('sph', 0.55, 10, 8), pulsing(mat(0xE8F0F7, { transparent: true, opacity: 0.7 }), 0.7, 0.0, 1));
    add(g, puff, 1.5, 5.4, -1.0, false); u.spin.push({ obj: puff, bob: 0.45, speed: 1.2 });
    const puff2 = M(geo('sph', 0.4, 10, 8), pulsing(mat(0xE8F0F7, { transparent: true, opacity: 0.6 }), 0.6, 0.0, 1));
    add(g, puff2, -1.5, 5.3, -1.0, false); u.spin.push({ obj: puff2, bob: 0.4, speed: 1.6 });
    add(g, M(geo('cyl', 0.8, 0.8, 0.12, 12), emis(0x4FE3C1, 0.8)), 0, 1.0, 2.55, false).rotation.x = Math.PI / 2;
    add(g, M(geo('cyl', 2.55, 2.55, 0.2, 16), emis(0xFFB74D, 0.8)), 0, 1.9, 0, false);
    u.height = 5.8;
  },
  tower(g, u) {
    add(g, M(geo('cyl', 1.4, 1.7, 0.7, 8), mat(0x7A8794)), 0, 0.35, 0);
    add(g, M(geo('cyl', 0.45, 0.85, 5.6, 8), mat(0xE8F0F7)), 0, 3.4, 0);
    for (let i = 0; i < 4; i++) add(g, M(geo('tor', 0.8 - i * 0.07, 0.07, 6, 12), emis(0x4FE3C1, 0.9)), 0, 1.5 + i * 1.2, 0, false).rotation.x = Math.PI / 2;
    const ring = M(geo('tor', 1.1, 0.09, 6, 18), emis(0xFFD166, 1)); ring.position.y = 6.6; ring.rotation.x = Math.PI / 2.4;
    g.add(ring); u.spin.push({ obj: ring, speed: 1.4 });
    const orb = M(geo('ico', 0.55, 0), pulsing(emis(0xFF6BE0, 1.2), 1.2, 0.6, 2.5)); orb.position.y = 6.6;
    g.castShadow = true; g.add(orb); u.spin.push({ obj: orb, speed: -1.0 });
    u.height = 7.4;
  },
  reactor(g, u) {
    add(g, M(geo('cyl', 2.0, 2.2, 0.55, 6), mat(0x3D4A5C, { metalness: 0.4 })), 0, 0.28, 0);
    add(g, M(geo('cyl', 1.0, 1.0, 2.4, 10, 1, true), mat(0x7FE9FF, { transparent: true, opacity: 0.35, side: THREE.DoubleSide })), 0, 1.7, 0, false);
    const core = M(geo('oct', 0.75, 0), pulsing(emis(0x59E6FF, 1.4), 1.4, 0.7, 3)); core.position.y = 1.7; g.add(core);
    u.spin.push({ obj: core, speed: 1.6 });
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      add(g, M(geo('cyl', 0.14, 0.2, 2.2, 6), mat(0xC9D8E4)), Math.cos(a) * 1.55, 1.4, Math.sin(a) * 1.55);
      add(g, M(geo('sph', 0.22, 8, 6), emis(0xFF6BE0, 1)), Math.cos(a) * 1.55, 2.6, Math.sin(a) * 1.55, false);
    }
    u.height = 3.2;
  },
  station(g, u) {
    add(g, M(geo('cyl', 0.8, 1.0, 0.4, 8), mat(0x7A8794)), 0, 0.2, 0);
    add(g, M(geo('cyl', 0.1, 0.14, 3.6, 6), mat(0xC9D8E4)), 0, 2.2, 0);
    const arm = new THREE.Group(); arm.position.y = 4.1;
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      const c = M(geo('cone', 0.22, 0.45, 6), mat(i === 0 ? 0xFF6BE0 : 0x4FE3C1));
      c.position.set(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9); c.rotation.z = Math.PI / 2; c.rotation.y = -a; arm.add(c);
    }
    arm.add(M(geo('cyl', 0.05, 0.05, 1.9, 4), mat(0x3D4A5C)).rotateZ(Math.PI / 2));
    g.add(arm); u.spin.push({ obj: arm, speed: 2.2 });
    add(g, M(geo('box', 0.9, 0.7, 0.2), emis(0x4FE3C1, 0.8)), 0, 1.8, 0.2, false);
    add(g, M(geo('sph', 0.2, 8, 6), pulsing(emis(0xFFD166, 1), 1, 0.6, 3)), 0, 4.45, 0, false);
    u.height = 4.7;
  },
  sprinkler(g, u) {
    add(g, M(geo('cyl', 0.42, 0.52, 0.3, 8), mat(0x6C7A89)), 0, 0.15, 0);
    add(g, M(geo('cyl', 0.08, 0.1, 1.2, 6), mat(0xC9D8E4, { metalness: 0.4 })), 0, 0.8, 0);
    const head = new THREE.Group(); head.position.y = 1.45;
    head.add(M(geo('ico', 0.17, 0), emis(0x4FC3F7, 0.9)));
    for (let i = 0; i < 3; i++) {
      const arm = M(geo('box', 0.9, 0.05, 0.05), mat(0xC9D8E4)); arm.rotation.y = i * Math.PI / 3; head.add(arm);
      for (const s of [-1, 1]) { const n = M(geo('ico', 0.07, 0), emis(0x4FC3F7, 1.2)); n.position.set(Math.cos(i * Math.PI / 3) * 0.45 * s, 0, -Math.sin(i * Math.PI / 3) * 0.45 * s); head.add(n); }
    }
    g.add(head); u.spin.push({ obj: head, speed: 3 });
    u.height = 1.8;
  },
  rotary(g, u) {
    add(g, M(geo('cyl', 0.7, 0.85, 0.4, 8), mat(0x4C6E8C)), 0, 0.2, 0);
    add(g, M(geo('cyl', 0.12, 0.17, 2.3, 6), mat(0xC9D8E4, { metalness: 0.4 })), 0, 1.5, 0);
    add(g, M(geo('tor', 0.62, 0.05, 6, 20), pulsing(emis(0x59E6FF, 0.9), 0.9, 0.5, 2.5)), 0, 0.46, 0, false).rotation.x = Math.PI / 2;
    const head = new THREE.Group(); head.position.y = 2.75;
    head.add(M(geo('sph', 0.26, 8, 6), emis(0x4FC3F7, 1)));
    for (const s of [-1, 1]) {
      const arm = M(geo('box', 1.1, 0.09, 0.09), mat(0xE8F0F7)); arm.position.x = s * 0.55; head.add(arm);
      const n = M(geo('cone', 0.13, 0.32, 6), emis(0x4FC3F7, 1.2)); n.position.set(s * 1.1, -0.1, 0); n.rotation.z = s * Math.PI / 2.4; head.add(n);
    }
    g.add(head); u.spin.push({ obj: head, speed: 2 });
    u.height = 3.2;
  },
  drip(g, u) {
    add(g, M(geo('box', 1.0, 0.45, 1.0), mat(0x2E8F8F)), 0, 0.22, 0);
    add(g, M(geo('sph', 0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), pulsing(emis(0x4FE3C1, 0.8, { flatShading: false }), 0.8, 0.4, 2)), 0, 0.45, 0);
    for (let i = 0; i < 3; i++) add(g, M(geo('tor', 1.0 + i * 0.45, 0.035, 5, 28), mat(0x4FC3F7)), 0, 0.06, 0, false).rotation.x = Math.PI / 2;
    const drop = M(geo('oct', 0.14, 0), emis(0x7FE9FF, 1.3)); drop.position.y = 1.15; drop.scale.y = 1.6; g.add(drop);
    u.spin.push({ obj: drop, speed: 1.5, bob: 0.4 });
    u.height = 1.5;
  },
  cloud(g, u) {
    add(g, M(geo('cyl', 0.55, 0.7, 0.3, 8), mat(0x6C7A89)), 0, 0.15, 0);
    add(g, M(geo('cyl', 0.1, 0.14, 3.6, 6), mat(0xC9D8E4, { metalness: 0.4 })), 0, 1.9, 0);
    const cloud = new THREE.Group(); cloud.position.y = 4.6;
    [[0, 0, 0, 1.0], [0.9, -0.1, 0.2, 0.75], [-0.9, -0.1, -0.1, 0.8], [0.3, 0.45, -0.3, 0.65]].forEach(([x, y, z, r]) => {
      const c = M(geo('ico', r, 0), mat(0xEAF6FF, { emissive: 0x9ED3FF, emissiveIntensity: 0.35 })); c.position.set(x, y, z); c.scale.y = 0.7; cloud.add(c);
    });
    for (let i = 0; i < 5; i++) {
      const d = M(geo('cyl', 0.025, 0.025, 1.3, 4), glow(0x7FE9FF, 0.7)); d.position.set((i - 2) * 0.38, -1.1, (i % 2) * 0.3 - 0.15); cloud.add(d);
    }
    g.add(cloud); u.spin.push({ obj: cloud, speed: 0.6, bob: 0.5 });
    u.height = 5.6;
  },
  bench(g, u) {
    add(g, M(geo('box', 2.1, 0.18, 0.7), mat(0xF1F5FA)), 0, 0.52, 0);
    const back = add(g, M(geo('cyl', 1.1, 1.1, 2.1, 12, 1, true, 0, Math.PI * 0.4), mat(0xF1F5FA, { side: THREE.DoubleSide })), 0, 0.9, 0.9); back.rotation.z = Math.PI / 2; back.scale.set(0.35, 1, 0.5); back.visible = false;
    add(g, M(geo('box', 2.1, 0.5, 0.14), mat(0xF1F5FA)), 0, 0.92, -0.32).rotation.x = -0.18;
    add(g, M(geo('box', 1.95, 0.05, 0.5), pulsing(emis(0x4FE3C1, 0.9), 0.9, 0.4, 2)), 0, 0.4, 0, false);
    for (const x of [-0.85, 0.85]) { add(g, M(geo('cyl', 0.1, 0.12, 0.5, 8), mat(0x3D4A5C)), x, 0.25, 0.1); add(g, M(geo('sph', 0.16, 8, 6), mat(0xFFD166)), x, 0.7, 0.1, false); }
    u.height = 1.3;
  },
  lamp(g, u) {
    add(g, M(geo('cyl', 0.3, 0.4, 0.4, 8), mat(0x3D4A5C)), 0, 0.2, 0);
    add(g, M(geo('cyl', 0.07, 0.11, 3.2, 8), mat(0x3D4A5C, { metalness: 0.3 })), 0, 1.9, 0);
    add(g, M(geo('tor', 0.14, 0.03, 5, 10), mat(0xFFD166)), 0, 1.2, 0, false).rotation.x = Math.PI / 2;
    add(g, M(geo('cyl', 0.3, 0.2, 0.2, 8), mat(0x6C7A89)), 0, 3.4, 0);
    add(g, M(geo('sph', 0.32, 10, 8), pulsing(emis(0xFFD166, 1.3), 1.3, 0.5, 2)), 0, 3.7, 0, false);
    add(g, M(geo('cone', 0.5, 0.35, 10), mat(0x6C7A89)), 0, 4.1, 0);
    add(g, M(geo('sph', 0.08, 6, 5), mat(0xFFD166)), 0, 4.35, 0, false);
    u.height = 4.5;
  },
  fountain(g, u) {
    add(g, M(geo('cyl', 1.7, 1.8, 0.45, 16), mat(0xE8F0F7)), 0, 0.22, 0);
    add(g, M(geo('tor', 1.7, 0.12, 6, 24), mat(0xC9D8E4)), 0, 0.45, 0, false).rotation.x = Math.PI / 2;
    add(g, M(geo('cyl', 1.5, 1.5, 0.1, 16), emis(0x4FC3F7, 0.6)), 0, 0.46, 0, false);
    add(g, M(geo('cyl', 0.3, 0.45, 1.0, 10), mat(0xC9D8E4)), 0, 1.0, 0);
    add(g, M(geo('cyl', 0.9, 0.35, 0.18, 12), mat(0xE8F0F7)), 0, 1.5, 0);
    add(g, M(geo('cyl', 0.12, 0.12, 1.4, 8), pulsing(emis(0x59E6FF, 1.1, { transparent: true, opacity: 0.8 }), 1.1, 0.5, 3)), 0, 2.3, 0, false);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(g, M(geo('sph', 0.1, 6, 5), emis(0x7FE9FF, 1.1)), Math.cos(a) * 0.85, 1.35, Math.sin(a) * 0.85, false); }
    const top = M(geo('ico', 0.35, 1), emis(0xFFFFFF, 1)); top.position.y = 3.2; g.add(top); u.spin.push({ obj: top, speed: 2 });
    const ring = M(geo('tor', 0.8, 0.05, 6, 16), emis(0x4FE3C1, 1)); ring.position.y = 2.0; ring.rotation.x = Math.PI / 2; g.add(ring);
    u.spin.push({ obj: ring, bob: 0.6, speed: 1.5 });
    u.height = 3.6;
  },
  sculpture(g, u) {
    add(g, M(geo('cyl', 0.6, 0.8, 0.8, 8), mat(0x7A8794)), 0, 0.4, 0);
    add(g, M(geo('sph', 0.38, 10, 8), pulsing(emis(0xFF6BE0, 1.1), 1.1, 0.5, 2)), 0, 2.0, 0);
    [[1.0, 0xFFD166, 1.2, 0.2], [1.25, 0x4FE3C1, -0.9, 1.1], [0.8, 0x59E6FF, 1.6, 0.5]].forEach(([r, c, sp, tilt]) => {
      const t = M(geo('tor', r, 0.07, 6, 20), emis(c, 0.9)); t.position.y = 2.0; t.rotation.x = Math.PI / 2 + tilt;
      const holder = new THREE.Group(); holder.position.y = 0; holder.add(t); g.add(holder); u.spin.push({ obj: holder, speed: sp, pivotY: 2.0 });
    });
    u.height = 3.4;
  },
  planter(g, u) {
    add(g, M(geo('cyl', 1.0, 0.85, 0.6, 14), mat(0xB98A5C)), 0, 0.3, 0);
    add(g, M(geo('tor', 1.0, 0.09, 6, 20), mat(0xD9A878)), 0, 0.6, 0, false).rotation.x = Math.PI / 2;
    add(g, M(geo('cyl', 0.9, 0.9, 0.1, 14), mat(0x6B4429)), 0, 0.58, 0, false);
    const colors = [0xFF6FA5, 0xFFD166, 0x59E6FF, 0xFF8A4C, 0xB26BFF, 0xFFFFFF];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, r = i < 6 ? 0.5 : 0.0, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.45 + (i % 3) * 0.15;
      add(g, M(geo('cyl', 0.03, 0.03, h, 4), mat(0x4FBF68)), x, 0.65 + h / 2, z, false);
      add(g, M(geo('ico', 0.2, 0), mat(colors[i % colors.length], { emissive: colors[i % colors.length], emissiveIntensity: 0.25 })), x, 0.7 + h, z, false);
      add(g, M(geo('sph', 0.07, 5, 4), mat(0xFFD166)), x, 0.78 + h, z, false);
      add(g, M(geo('ico', 0.16, 0), mat(0x4FBF68)), x + 0.15, 0.75, z, false).scale.set(1.3, 0.3, 0.7);
    }
    u.height = 1.6;
  },
  windmill(g, u) {
    add(g, M(geo('cyl', 1.1, 1.5, 0.4, 10), mat(0x8E9AAB)), 0, 0.2, 0);
    add(g, M(geo('cyl', 0.8, 1.2, 4.0, 10), mat(0xFFE6C8)), 0, 2.4, 0);
    add(g, M(geo('cyl', 0.9, 0.9, 0.18, 10), mat(0xFF8A5C)), 0, 3.4, 0);
    add(g, M(geo('cone', 1.1, 1.3, 10), mat(0xE0594B)), 0, 4.95, 0);
    add(g, M(geo('cyl', 0.42, 0.42, 0.1, 10), mat(0x8A4F2D)), 0, 1.4, 0.98).rotation.x = Math.PI / 2;
    const rotor = new THREE.Group(); rotor.position.set(0, 4.3, 1.05);
    add(rotor, M(geo('sph', 0.28, 8, 6), mat(0xFFD166)), 0, 0, 0.1, false);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2;
      add(arm, M(geo('box', 0.14, 2.4, 0.08), mat(0x8A4F2D)), 0, 1.3, 0, false);
      add(arm, M(geo('box', 0.7, 1.7, 0.04), mat(i % 2 ? 0xFFFFFF : 0xFFD9A8)), 0.4, 1.5, 0.05, false);
      rotor.add(arm);
    }
    g.add(rotor); u.spin.push({ obj: rotor, speed: 1.1, axis: 'z' });
    u.height = 6.2;
  },
  scarecrow(g, u) {
    add(g, M(geo('cyl', 0.07, 0.09, 2.4, 6), mat(0x8A4F2D)), 0, 1.2, 0);
    add(g, M(geo('cyl', 0.05, 0.05, 1.7, 6), mat(0x8A4F2D)), 0, 1.75, 0).rotation.z = Math.PI / 2;
    add(g, M(geo('cyl', 0.38, 0.5, 1.0, 8), mat(0x4D7BD9)), 0, 1.6, 0);
    add(g, M(geo('sph', 0.34, 10, 8), mat(0xFFD9A8)), 0, 2.45, 0);
    add(g, M(geo('cyl', 0.52, 0.52, 0.06, 10), mat(0xC98A3C)), 0, 2.7, 0);
    add(g, M(geo('cyl', 0.28, 0.34, 0.4, 10), mat(0xC98A3C)), 0, 2.9, 0);
    add(g, M(geo('sph', 0.05, 5, 4), mat(0x24153A)), 0.12, 2.5, 0.3, false); add(g, M(geo('sph', 0.05, 5, 4), mat(0x24153A)), -0.12, 2.5, 0.3, false);
    const cloth = new THREE.Group(); cloth.position.set(0, 1.9, 0);
    for (const sx of [1, -1]) { add(cloth, M(geo('cyl', 0.13, 0.17, 0.8, 7), mat(0x4D7BD9)), sx * 0.55, -0.1, 0, false).rotation.z = Math.PI / 2; add(cloth, M(geo('sph', 0.13, 7, 5), mat(0xFFD9A8)), sx * 1.0, -0.1, 0, false); }
    g.add(cloth); u.spin.push({ obj: cloth, sway: 0.12, speed: 2.4 });
    u.height = 3.2;
  },
  pond(g, u) {
    add(g, M(geo('cyl', 2.3, 2.5, 0.35, 16), mat(0x9AA6B8)), 0, 0.17, 0);
    const w = M(geo('cyl', 2.0, 2.0, 0.06, 16), pulsing(emis(0x4DB8FF, 0.35, { transparent: true, opacity: 0.9 }), 0.35, 0.2, 1.6)); w.position.y = 0.34; g.add(w);
    for (let i = 0; i < 3; i++) { const a = i * 2.1; add(g, M(geo('cyl', 0.36, 0.36, 0.05, 8), mat(0x3FAF5A)), Math.cos(a) * 1.0, 0.4, Math.sin(a) * 1.0, false); }
    const lotus = new THREE.Group(); lotus.position.set(0.6, 0.45, 0.5);
    for (let i = 0; i < 6; i++) { const p = M(geo('cone', 0.12, 0.34, 5), mat(0xFF8AD0)); p.position.set(Math.cos(i * 1.05) * 0.15, 0.1, Math.sin(i * 1.05) * 0.15); p.rotation.z = Math.cos(i * 1.05) * 0.5; p.rotation.x = -Math.sin(i * 1.05) * 0.5; lotus.add(p); }
    g.add(lotus); u.spin.push({ obj: lotus, sway: 0.4, speed: 1.4 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(g, M(geo('sph', 0.34, 6, 5), mat(0x7A8794)), Math.cos(a) * 2.4, 0.4, Math.sin(a) * 2.4); }
    u.height = 1.0;
  },
  balloon(g, u) {
    const air = new THREE.Group(); air.position.y = 3.0;
    const env = add(air, M(geo('sph', 1.5, 14, 10), mat(0xFF6FA5)), 0, 2.1, 0, true); env.scale.y = 1.15;
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; const st = add(air, M(geo('box', 0.5, 2.6, 0.06), mat(i % 2 ? 0xFFD166 : 0xFFFFFF)), Math.cos(a) * 0.55, 2.1, Math.sin(a) * 0.55, false); st.rotation.y = -a; st.scale.y = 1.2; }
    add(air, M(geo('cyl', 0.6, 0.5, 0.5, 8), mat(0xB77A45)), 0, 0.2, 0);
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.78; add(air, M(geo('cyl', 0.02, 0.02, 1.0, 4), mat(0x6B5A7A)), Math.cos(a) * 0.4, 0.8, Math.sin(a) * 0.4, false); }
    g.add(air); u.spin.push({ obj: air, bob: 0.8, speed: 1.3 });
    add(g, M(geo('cyl', 0.5, 0.6, 0.3, 8), mat(0x7A8794)), 0, 0.15, 0);
    u.height = 7.0;
  },
  flag(g, u) {
    add(g, M(geo('cyl', 0.05, 0.07, 3.6, 6), mat(0xC9D8E4)), 0, 1.8, 0);
    add(g, M(geo('sph', 0.1, 6, 4), emis(0xFFD166, 1)), 0, 3.65, 0, false);
    const cloth = new THREE.Group(); cloth.position.set(0, 3.1, 0);
    const f = M(geo('box', 1.3, 0.8, 0.05), emis(0x4FE3C1, 0.45)); f.position.x = 0.7; f.castShadow = true; cloth.add(f);
    const e = M(geo('ico', 0.2, 0), emis(0xFFD166, 0.9)); e.position.set(0.7, 0, 0.04); cloth.add(e);
    g.add(cloth); u.spin.push({ obj: cloth, sway: 0.35, speed: 2.2 });
    u.height = 3.8;
  },
  droneStatue(g, u) {
    add(g, M(geo('box', 1.2, 0.8, 1.2), mat(0x7A8794)), 0, 0.4, 0);
    add(g, M(geo('cyl', 0.08, 0.08, 0.9, 6), mat(0xFFD166, { metalness: 0.6 })), 0, 1.2, 0);
    const d = new THREE.Group(); d.position.y = 1.9;
    d.add(M(geo('ico', 0.4, 0), mat(0xE8C26A, { metalness: 0.7, roughness: 0.3 })));
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([sx, sz]) => {
      const arm = M(geo('box', 0.7, 0.05, 0.05), mat(0xE8C26A, { metalness: 0.7 })); arm.position.set(sx * 0.4, 0, sz * 0.4); arm.rotation.y = Math.atan2(-sz, sx) ; d.add(arm);
      const r = M(geo('cyl', 0.34, 0.34, 0.03, 10), mat(0xC9D8E4, { transparent: true, opacity: 0.7 })); r.position.set(sx * 0.7, 0.08, sz * 0.7); d.add(r);
    });
    d.add(M(geo('sph', 0.1, 6, 4), emis(0xFF6BE0, 1.2)).translateY(-0.2));
    d.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.add(d); u.spin.push({ obj: d, speed: 0.5, bob: 0.15 });
    u.height = 2.6;
  },
  crystalGarden(g, u) {
    add(g, M(geo('cyl', 1.7, 1.9, 0.35, 9), mat(0x7A8794)), 0, 0.18, 0);
    const cols = [0x59E6FF, 0xFF6BE0, 0xB26BFF, 0x6BFFB0, 0xFFD166];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + 0.3, r = i === 0 ? 0 : 0.5 + (i % 3) * 0.4;
      const h = 0.8 + ((i * 37) % 10) / 10 * 1.2, c = cols[i % cols.length];
      const cr = M(geo('oct', 0.35, 0), pulsing(emis(c, 0.9, { transparent: true, opacity: 0.9 }), 0.9, 0.3, 1.5 + i * 0.2));
      cr.scale.set(1, h / 0.35 * 0.9, 1); add(g, cr, Math.cos(a) * r, 0.35 + h * 0.5, Math.sin(a) * r);
      cr.rotation.y = i;
    }
    u.height = 2.4;
  }
};

// Cria o modelo de uma estrutura. userData: height, spin[]
export function createStructureModel(type) {
  const g = new THREE.Group();
  g.userData = { spin: [], height: 3, accents: [], type };
  builders[type](g, g.userData);
  finishStructure(g,type);
  const def = CONFIG.structures[type];
  if (def.kind === 'building') {
    // Aneis de melhoria: aparecem conforme o nivel
    for (let i = 1; i <= 2; i++) {
      const ring = M(geo('tor', def.radius * 0.62, 0.07, 6, 24), emis(0xFFD166, 1.1));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.12 + i * 0.1; ring.visible = false;
      g.add(ring); g.userData.accents.push(ring);
    }
  }
  // Funde as pecas estaticas em uma unica malha (menos draw calls). Pecas animadas ou pulsantes ficam soltas.
  const animated = new Set();
  g.userData.spin.forEach(s => animated.add(s.obj));
  g.userData.accents.forEach(a => animated.add(a));
  mergeGroupStatic(g, o => {
    for (let q = o; q && q !== g; q = q.parent) if (animated.has(q)) return true;
    return PULSE_MATS.has(o.material);
  });
  return g;
}
export function applyStructureLevel(group, level) {
  group.userData.accents.forEach((a, i) => { a.visible = level > i + 1; });
  const s = 1 + 0.08 * (level - 1);
  group.userData.baseScale = s;
}
// Animacao leve (giro, balanco, flutuacao)
export function animateStructure(group, t, dt) {
  const spin = group.userData.spin;
  for (let i = 0; i < spin.length; i++) {
    const s = spin[i];
    if (s.sway) s.obj.rotation.y = Math.sin(t * s.speed) * s.sway;
    else if (s.bob) { s.obj.position.y = (s.base ??= s.obj.position.y) + Math.sin(t * s.speed) * s.bob * 0.5; s.obj.rotation.y += dt * 0.6; }
    else s.obj.rotation[s.axis || 'y'] += dt * s.speed;
  }
}

// ---------- Mundo ----------
function seeded(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

export function createWorld(scene) {
  scene.background = new THREE.Color(0x7CD0FF);
  scene.fog = new THREE.Fog(0x9BDCFF, 80, 340);

  // Luzes: apenas o sol projeta sombra
  const sun = new THREE.DirectionalLight(0xfff3d6, 2.2);
  sun.position.set(30, 45, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 160 });
  sun.shadow.bias = -0.001; sun.shadow.normalBias = 0.35;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xcfeeff, 0x7a9a5c, 1.05);
  scene.add(hemi);

  const world = {
    sun, hemi,
    shopPosition: new THREE.Vector3(30, 1.7, 17),
    marketPosition: new THREE.Vector3(30, 1.7, 35),
    pumpPosition: new THREE.Vector3(-36, 1.7, 5),
    stationPosition: new THREE.Vector3(-22, 1.7, 6),
    gatePosition: new THREE.Vector3(-40, 1.7, -113),
    farmRect: CONFIG.farmArea,
    island: CONFIG.island,
    colliders: [
      { x: -36, z: 5, radius: 1.3 }, { x: -22, z: 6, radius: 3.2 }],
    fixedObstacles: [{ x: -36, z: 5, r: 2 }, { x: -22, z: 6, r: 4 }],
    plotSlots: [], groundMeshes: [], crystalNodes: [], towerSlots: []
  };

  // --- Terreno principal (caixa para parecer uma ilha flutuante) ---
  const ground = M(geo('box', 240, 8, 240), new THREE.MeshToonMaterial({map:meadowPaint(),gradientMap:toonGradient}));
  ground.position.y = -4; ground.receiveShadow = true; scene.add(ground);
  world.groundMeshes.push(ground);
  const water = M(geo('plane', 2400, 2400), new THREE.MeshToonMaterial({ map: seaPaint(), gradientMap: toonGradient }));
  water.rotation.x = -Math.PI / 2; water.position.y = -6; scene.add(water);
  world.water = water;

  // --- Estrada ---
  const road = M(geo('box', 14, 0.08, 236), mat(0x9A8F7A, { roughness: 0.95, flatShading: false }));
  road.position.set(0, 0.04, 0); road.receiveShadow = true; scene.add(road);
  const dashGeo = geo('box', 0.4, 0.02, 3);
  const dashes = new THREE.InstancedMesh(dashGeo, glow(0xFFE9A0), 40);
  const dm = new THREE.Matrix4();
  for (let i = 0; i < 40; i++) { dm.setPosition(0, 0.1, -114 + i * 5.8); dashes.setMatrixAt(i, dm); }
  scene.add(dashes);

  // --- Solo da fazenda e area de plantio ---
  const soil = M(geo('box', 40, 0.2, 44), mat(0x8B5E3C, { roughness: 1, flatShading: false }));
  soil.position.set(-32, 0.1, -24.5); soil.receiveShadow = true; scene.add(soil);
  const plaza = M(geo('box', 48, 0.16, 42), mat(0xABC085, { roughness: 0.9, flatShading: false }));
  plaza.position.set(30, 0.08, 25); plaza.receiveShadow = true; scene.add(plaza);

  // Slots de canteiros: 12 da fazenda (mesmas posicoes do jogo original)
  for (let i = 0; i < 12; i++) world.plotSlots.push({ id: 'f' + i, x: -44 + (i % 4) * 5.4, z: -32 + Math.floor(i / 4) * 5.4, kind: 'farm', tier: 1 });
  // Expansoes de terreno (liberadas pela melhoria 'Expansao do terreno')
  const ex = (id, x, z, tier) => world.plotSlots.push({ id, x, z, kind: 'farm', tier });
  for (let i = 0; i < 4; i++) ex('e' + i, -44 + i * 5.4, -10.4, 2);
  for (let i = 0; i < 4; i++) ex('e' + (4 + i), -22.4, -32 + i * 5.4, 3);
  for (let i = 0; i < 4; i++) ex('e' + (8 + i), -49.4, -32 + i * 5.4, 4);
  for (let i = 0; i < 8; i++) ex('e' + (12 + i), -44 + (i % 4) * 5.4, -37.8 - Math.floor(i / 4) * 5.4, 5);
  // 4 canteiros verticais (pesquisa Torres verticais)
  for (let i = 0; i < 4; i++) { const s = { id: 't' + i, x: -62, z: -34 + i * 5.4, kind: 'tower' }; world.plotSlots.push(s); world.towerSlots.push(s); }
  // 8 canteiros da ilha
  for (let i = 0; i < 8; i++) world.plotSlots.push({ id: 'i' + i, x: CONFIG.island.x - 8.1 + (i % 4) * 5.4, z: CONFIG.island.z + 4 + Math.floor(i / 4) * 5.4, kind: 'island' });

  const clockTower=buildTown(scene,world);
  const wm=new THREE.Matrix4();

  // --- Bomba de agua (reabastece o regador de graca) ---
  const pump = new THREE.Group();
  add(pump, M(geo('cyl', 0.9, 1.0, 0.4, 8), mat(0x7A8794)), 0, 0.2, 0);
  add(pump, M(geo('cyl', 0.6, 0.6, 1.6, 10), mat(0x4C6E8C)), 0, 1.2, 0);
  add(pump, M(geo('sph', 0.62, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), emis(0x4FC3F7, 0.6)), 0, 2.0, 0);
  add(pump, M(geo('cyl', 0.12, 0.12, 0.8, 6), mat(0xC9D8E4)), 0.6, 1.0, 0).rotation.z = Math.PI / 2;
  const pl = makeLabel('AGUA', '#4FC3F7', 2.2, 0.7); pl.position.set(0, 3.0, 0); pump.add(pl);
  pump.position.set(-36, 0, 5); scene.add(pump);
  world.pumpLabel = pl;
  const wheel=add(pump,M(geo('tor',0.34,0.065,6,14),mat(0xC17851)),0,1.25,0.64);
  for(let i=0;i<3;i++) add(wheel,M(geo('box',0.6,0.045,0.05),mat(0xFFE3A8))).rotation.z=i*Math.PI/3;

  // --- Estacao de drones (4 plataformas de pouso) ---
  const station = new THREE.Group();
  add(station, M(geo('box', 7, 0.25, 4.4), mat(0x3D4A5C, { metalness: 0.3 })), 0, 0.12, 0);
  world.dronePads = [];
  for (let i = 0; i < 4; i++) {
    const px = -2.6 + i * 1.75;
    const padM = M(geo('cyl', 0.7, 0.7, 0.06, 12), emis(0x4FE3C1, 0.6));
    add(station, padM, px, 0.28, 0.4, false);
    world.dronePads.push(new THREE.Vector3(-22 + px, 0.4, 6.4));
  }
  const sl = makeLabel('ESTACAO DE DRONES', '#4FE3C1', 5.6, 0.9); sl.position.set(0, 3.0, -1.6); station.add(sl);
  add(station, M(geo('cyl', 0.1, 0.1, 2.6, 6), mat(0x3D4A5C)), -3.2, 1.4, -1.6);
  add(station, M(geo('cyl', 0.1, 0.1, 2.6, 6), mat(0x3D4A5C)), 3.2, 1.4, -1.6);
  for(const side of [-1,1]) {
    add(station,M(geo('box',6.6,0.085,0.1),mat(0xEBC483)),0,0.31,side*1.8);
    add(station,M(geo('box',0.6,1.05,0.72),mat(0x527885)),side*3.0,0.66,-1.35);
  }
  station.position.set(-22, 0, 6); scene.add(station);

  // --- Arvores instanciadas (cone + tronco) ---
  const rnd = seeded(12345);
  const treeSpots = [];
  const farm = CONFIG.farmArea;
  const keepOut = (x, z) =>
    (x > farm.x0 - 4 && x < farm.x1 + 4 && z > farm.z0 - 4 && z < farm.z1 + 6) || (Math.abs(x) < 10) ||
    (x > 6 && x < 64 && z > 4 && z < 50) || (x > -56 && x < -24 && z > -118 && z < -100);
  [[-108, -48], [-50, 26], [-62, 38], [58, -42], [62, 12], [54, 48], [-22, 48], [22, -52]].forEach(p => treeSpots.push(p));
  let guard = 0;
  while (treeSpots.length < 64 && guard++ < 800) {
    const x = (rnd() - 0.5) * 224, z = (rnd() - 0.5) * 224;
    if (!keepOut(x, z)) treeSpots.push([x, z]);
  }
  world.keepOut = keepOut;
  woodland(scene,world,treeSpots,rnd);

  // --- Postes de luz ao longo da estrada (como no original) ---
  const lampMat = mat(0x3D4A5C, { roughness: 0.6, metalness: 0.3 });
  const bulbMat = glow(0xFFD166);
  const lamps = [];
  for (let z = -105; z <= 105; z += 21) {
    lamps.push([-8.6, z, 1]);
    if (z < 0 || z > 52) lamps.push([8.6, z, -1]); // lado leste: pula a praca
  }
  const poles = new THREE.InstancedMesh(geo('cyl', 0.1, 0.17, 5, 8), lampMat, lamps.length);
  const bases = new THREE.InstancedMesh(geo('cyl', 0.34, 0.42, 0.5, 8), lampMat, lamps.length);
  const arms = new THREE.InstancedMesh(geo('box', 1.1, 0.12, 0.12), lampMat, lamps.length);
  const bulbs = new THREE.InstancedMesh(geo('sph', 0.3, 10, 8), bulbMat, lamps.length);
  const caps = new THREE.InstancedMesh(geo('cone', 0.5, 0.3, 10), lampMat, lamps.length);
  poles.castShadow = true;
  lamps.forEach(([x, z, side], k) => {
    wm.identity().setPosition(x, 2.5, z); poles.setMatrixAt(k, wm);
    wm.identity().setPosition(x, 0.25, z); bases.setMatrixAt(k, wm);
    wm.identity().setPosition(x + side * 0.5, 5.0, z); arms.setMatrixAt(k, wm);
    wm.identity().setPosition(x + side * 1.0, 4.82, z); bulbs.setMatrixAt(k, wm);
    wm.identity().setPosition(x + side * 1.0, 5.15, z); caps.setMatrixAt(k, wm);
  });
  scene.add(poles, bases, arms, bulbs, caps);

  // --- Nuvens e estrelas ---
  const clouds=cloudField(scene);world.clouds=clouds.group;world.setCloudQuality=clouds.quality;
  const sGeo = new THREE.BufferGeometry(); const sPos = new Float32Array(500 * 3);
  for (let i = 0; i < 500; i++) {
    const a = rnd() * Math.PI * 2, b = Math.acos(rnd() * 0.9 + 0.1), r = 380;
    sPos[i * 3] = Math.cos(a) * Math.sin(b) * r; sPos[i * 3 + 1] = Math.cos(b) * r; sPos[i * 3 + 2] = Math.sin(a) * Math.sin(b) * r;
  }
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const stars = new THREE.Points(sGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  stars.frustumCulled = false; scene.add(stars); world.stars = stars;
  // Um planeta de duas cores acima da colônia, com anéis no perfil alto.
  const planet=new THREE.Group();
  const celestial = color => new THREE.MeshBasicMaterial({color,fog:false});
  planet.position.set(175,120,150);
  const globe=new THREE.Mesh(geo('sph',16,32,20),new THREE.MeshLambertMaterial({map:planetPaint(),fog:false,emissive:0x382743}));
  globe.rotation.z=-.24; planet.add(globe);
  const rings=new THREE.Group();
  for(const [radius,width,color] of [[22,1.8,0xffdb96],[25,.55,0xffefbd]]){
    const ring=new THREE.Mesh(geo('tor',radius,width,8,64),celestial(color));rings.add(ring);
  }
  rings.rotation.set(1.12,.18,-.48);planet.add(rings);scene.add(planet);world.skyPlanet=planet;

  // --- Sobreposicoes do modo construcao ---
  const farmOverlay = M(geo('plane', farm.x1 - farm.x0, farm.z1 - farm.z0), new THREE.MeshBasicMaterial({ color: 0x4FE3C1, transparent: true, opacity: 0.1, depthWrite: false }));
  farmOverlay.rotation.x = -Math.PI / 2; farmOverlay.position.set((farm.x0 + farm.x1) / 2, 0.12, (farm.z0 + farm.z1) / 2); farmOverlay.visible = false; scene.add(farmOverlay);
  const farmEdge = new THREE.LineSegments(new THREE.EdgesGeometry(geo('box', farm.x1 - farm.x0, 0.1, farm.z1 - farm.z0)), new THREE.LineBasicMaterial({ color: 0x4FE3C1 }));
  farmEdge.position.set((farm.x0 + farm.x1) / 2, 0.15, (farm.z0 + farm.z1) / 2); farmEdge.visible = false; scene.add(farmEdge);
  world.overlays = [farmOverlay, farmEdge];

  buildIsland(scene, world, rnd);
  buildGateAndBridge(scene, world);

  // Altura da superficie (para pets e objetos nao afundarem): solo, praca, estrada, ilha
  world.surfaceY = (x, z) => {
    const isl = CONFIG.island;
    if (world.islandUnlocked && Math.hypot(x - isl.x, z - isl.z) <= isl.radius) {
      return Math.abs(x - (isl.x - 0.5)) < 13 && Math.abs(z - (isl.z + 9)) < 8 ? 0.26 : 0.12;
    }
    if (Math.abs(x + 32) < 20 && Math.abs(z + 24.5) < 22) return 0.2;
    if (Math.abs(x - 30) < 24 && Math.abs(z - 25) < 21) return 0.16;
    if (Math.abs(x) < 7 && Math.abs(z) < 118) return 0.08;
    return 0;
  };

  // --- Regras de movimento e zona ---
  const isl = CONFIG.island;
  world.isWalkable = (x, z) => {
    if (Math.abs(x) <= 117 && Math.abs(z) <= 117) return true;
    if (!world.islandUnlocked) return false;
    if (Math.abs(x - isl.x) <= 2.7 && z < -116 && z > -160) return true; // ponte
    return Math.hypot(x - isl.x, z - isl.z) <= isl.radius - 2; // ilha
  };
  world.onIsland = (x, z) => Math.hypot(x - isl.x, z - isl.z) <= isl.radius;
  world.zoneAt = (x, z) => {
    if (world.onIsland(x, z)) return 'ILHA CRISTALINA';
    if (z < -117) return 'PONTE ESTELAR';
    if (x > 8 && z > 2) return 'CIDADE';
    if (x < -8) return 'FAZENDA';
    return 'ESTRADA';
  };
  world.inBuildArea = (x, z, r) => {
    const inFarm = x - r > farm.x0 && x + r < farm.x1 && z - r > farm.z0 && z + r < farm.z1;
    const inIsland = world.islandUnlocked && Math.hypot(x - isl.x, z - isl.z) < isl.radius - 4 - r;
    return { farm: inFarm, island: inIsland };
  };

  // --- Estado dinamico: ilha liberada ---
  world.islandUnlocked = false;
  world.bridgeProgress = 0;
  world.setIslandUnlocked = (v, instant) => {
    world.islandUnlocked = v;
    world.gateMat.color.setHex(v ? 0x4FE3C1 : 0xFF5470);
    world.gateLabel.visible = !v;
    if (instant) world.bridgeProgress = v ? 1 : 0;
  };

  let elapsed = 0;
  world.update = (dt,time=8,weather=null,viewer=null) => {
    clockTower(time);
    elapsed += dt;
    for (let i = 0; i < PULSES.length; i++) { const p = PULSES[i]; p.m.emissiveIntensity = p.base + Math.sin(elapsed * p.speed) * p.amp * 0.5; }
    clouds.update(dt,time,weather,viewer);
    water.material.map.offset.set((elapsed*.025)%1,(elapsed*.019)%1);
    water.position.y = -6 + Math.sin(elapsed * 0.5) * 0.12;
    // Ponte cresce quando a ilha e liberada
    if (world.islandUnlocked && world.bridgeProgress < 1) world.bridgeProgress = Math.min(1, world.bridgeProgress + dt * 0.35);
    world.bridge.visible = world.bridgeProgress > 0;
    world.bridge.scale.z = Math.max(0.001, world.bridgeProgress);
    world.islandRocks.rotation.y += dt * 0.02;
    for (const n of world.crystalNodes) {
      if (!n.ready) { n.timer -= dt; if (n.timer <= 0) { n.ready = true; n.mesh.visible = true; } }
      else n.mesh.rotation.y += dt * 0.5;
    }
  };
  return world;
}

// ---------- Ilha Cristalina ----------
function buildIsland(scene, world, rnd) {
  const isl = CONFIG.island;
  const group = new THREE.Group(); group.position.set(isl.x, 0, isl.z);
  const top = M(geo('cyl', isl.radius, isl.radius - 4, 8, 28), mat(0x6FD8C8, { roughness: 0.9 }));
  top.position.y = -4; top.receiveShadow = true; group.add(top);
  const under = M(geo('cone', isl.radius - 4, 22, 14), mat(0x5B4FC4, { roughness: 1 }));
  under.rotation.x = Math.PI; under.position.y = -19; group.add(under);
  const rim = M(geo('tor', isl.radius - 0.5, 0.35, 6, 40), emis(0x59E6FF, 0.9)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.1; group.add(rim);
  const inner = M(geo('cyl', isl.radius - 6, isl.radius - 6, 0.12, 28), mat(0x8FF0E0, { roughness: 0.9 }));
  inner.position.y = 0.06; inner.receiveShadow = true; group.add(inner);
  scene.add(group);
  world.groundMeshes.push(top);

  // Canteiros da ilha ficam sobre uma plataforma de solo roxo
  const pad = M(geo('box', 26, 0.2, 16), mat(0x5B4FC4, { roughness: 1 }));
  pad.position.set(-0.5, 0.15, 9); group.add(pad);

  // Cristais decorativos (instanciados) e arvores rosadas
  const crystals = new THREE.InstancedMesh(geo('oct', 0.6, 0), mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.35, transparent: true, opacity: 0.92 }), 70);
  const cols = [0x59E6FF, 0xFF6BE0, 0xB26BFF, 0x6BFFB0];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, r = 12 + rnd() * (isl.radius - 16);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > -2 && z < 22 && Math.abs(x) < 16) { crystals.setMatrixAt(i, m4.makeScale(0, 0, 0)); continue; }
    const s = 0.5 + rnd() * 1.1;
    q.setFromEuler(new THREE.Euler(0, rnd() * 3, 0)); m4.compose(p.set(x, s * 1.1, z), q, sc.set(s * 0.8, s * 2, s * 0.8));
    crystals.setMatrixAt(i, m4); crystals.setColorAt(i, c.setHex(cols[i % 4]));
  }
  group.add(crystals);
  const pTrunk = new THREE.InstancedMesh(geo('cyl', 0.2, 0.28, 1.6, 6), mat(0x7A4E8A), 22);
  const pCrown = new THREE.InstancedMesh(geo('oct', 1.55, 1), mat(0xffffff, { roughness: 0.7 }), 22);
  const pcols = [0xFF8FD0, 0xFFA6E6, 0xC8A0FF];
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2, r = 16 + rnd() * (isl.radius - 20);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > -2 && z < 22 && Math.abs(x) < 16) { m4.makeScale(0, 0, 0); pTrunk.setMatrixAt(i, m4); pCrown.setMatrixAt(i, m4); continue; }
    const s = 0.8 + rnd() * 0.6;
    m4.compose(p.set(x, 0.8 * s, z), q.identity(), sc.set(s, s, s)); pTrunk.setMatrixAt(i, m4);
    m4.compose(p.set(x, 2.6 * s, z), q.identity(), sc.set(s, s * (1.14+0.35*(i%3)), s)); pCrown.setMatrixAt(i, m4); pCrown.setColorAt(i, c.setHex(pcols[i % 3]));
    world.colliders.push({ x: isl.x + x, z: isl.z + z, radius: 0.9 * s });
  }
  pTrunk.castShadow = pCrown.castShadow = true;
  group.add(pTrunk, pCrown);

  // Rochas flutuantes ao redor
  const rocks = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, r = isl.radius + 12 + rnd() * 10;
    const rock = M(geo('ico', 2 + rnd() * 2, 0), mat(0x7A6FD0)); rock.position.set(Math.cos(a) * r, 4 + rnd() * 10, Math.sin(a) * r); rocks.add(rock);
    const cr = M(geo('oct', 0.7, 0), emis(cols[i % 4], 0.9)); cr.scale.y = 2; cr.position.copy(rock.position); cr.position.y += 2.4; rocks.add(cr);
  }
  group.add(rocks);
  world.islandRocks = rocks;

  // Pontos de mineracao de cristal (recurso exclusivo)
  const nodeSpots = [[-24, 4], [24, 2], [-20, 24], [22, 26], [0, 30], [-30, 16], [30, 14], [4, -22]];
  nodeSpots.forEach(([nx, nz], i) => {
    const m = new THREE.Group();
    m.add(M(geo('cyl', 1.4, 1.7, 0.4, 7), mat(0x5B4FC4)).translateY(0.2));
    for (let k = 0; k < 3; k++) {
      const cr = M(geo('oct', 0.7, 0), emis(cols[(i + k) % 4], 1.0)); cr.scale.set(1, 2.4 - k * 0.4, 1);
      cr.position.set((k - 1) * 0.6, 1.3 - k * 0.15, (k % 2) * 0.4 - 0.2); cr.castShadow = true; m.add(cr);
    }
    add(m,M(geo('tor',1.2,0.09,6,12),mat(0xE2BD8C)),0,0.44,0).rotation.x=Math.PI/2;
    m.position.set(isl.x + nx, 0, isl.z + nz); scene.add(m);
    world.crystalNodes.push({ mesh: m, x: isl.x + nx, z: isl.z + nz, ready: true, timer: 0, id: i });
  });
  world.islandGroup = group;
}

// ---------- Portal e ponte para a ilha ----------
function buildGateAndBridge(scene, world) {
  const isl = CONFIG.island;
  const gate = new THREE.Group();
  const gateMat = emis(0xFF5470, 1.0); // cor muda ao liberar
  world.gateMat = gateMat;
  for (const sx of [-4, 4]) {
    add(gate, M(geo('cyl', 0.4, 0.5, 6, 8), mat(0x3D4A5C, { metalness: 0.4 })), sx, 3, 0);
    add(gate, M(geo('sph', 0.5, 10, 8), gateMat), sx, 6.3, 0, false);
  }
  add(gate, M(geo('box', 8.8, 0.5, 0.5), mat(0x3D4A5C, { metalness: 0.4 })), 0, 5.8, 0);
  add(gate, M(geo('box', 7.4, 0.14, 0.14), gateMat), 0, 5.3, 0, false);
  const beam = M(geo('plane', 7.4, 5.2), new THREE.MeshBasicMaterial({ color: 0xFF5470, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 2.7; gate.add(beam);
  const lbl = makeLabel('PONTE ESTELAR', '#FFFFFF', 6, 1); lbl.position.set(0, 7.6, 0); gate.add(lbl);
  const lockLbl = makeLabel('NIVEL ' + CONFIG.islandLevel, '#FF5470', 3.4, 0.8); lockLbl.position.set(0, 6.6, 0.1); gate.add(lockLbl);
  world.gateLabel = lockLbl;
  gate.position.set(isl.x, 0, -114); scene.add(gate);

  // Ponte: pivo na borda da fazenda, cresce em direcao a ilha
  const bridge = new THREE.Group(); bridge.position.set(isl.x, 0, -117);
  const len = 42;
  for(let i=0;i<6;i++) for(const side of [-1,1]) {
    add(bridge,M(geo('cyl',0.10,0.18,1.05,6),mat(0x507C83)),side*2.77,0.51,-2-i*7.4);
    add(bridge,M(geo('sph',0.15,8,6),emis(0xFFE195,0.65)),side*2.77,1.09,-2-i*7.4);
  }
  const deck = M(geo('box', 6, 0.5, len), mat(0xC9D8E4, { roughness: 0.6, metalness: 0.2 }));
  deck.position.set(0, -0.2, -len / 2); deck.receiveShadow = true; bridge.add(deck);
  const strip = M(geo('box', 0.35, 0.06, len), emis(0x4FE3C1, 1)); strip.position.set(0, 0.08, -len / 2); bridge.add(strip);
  for (const sx of [-3, 3]) {
    const rail = M(geo('box', 0.14, 0.14, len), emis(0x59E6FF, 0.9)); rail.position.set(sx, 1.1, -len / 2); bridge.add(rail);
  }
  const post = geo('cyl', 0.1, 0.12, 1.1, 6), postMat = mat(0x3D4A5C);
  const posts = new THREE.InstancedMesh(post, postMat, 2 * 11);
  const pm = new THREE.Matrix4();
  for (let i = 0; i < 11; i++) for (let s = 0; s < 2; s++) { pm.setPosition(s ? 3 : -3, 0.6, -2 - i * (len - 4) / 10); posts.setMatrixAt(i * 2 + s, pm); }
  bridge.add(posts);
  bridge.visible = false; scene.add(bridge);
  world.bridge = bridge;
}
