// Orquestrador do jogo: canteiros, mutacoes, arvores, terreno, irrigadores, interacao, lojas, mercado,
// construcao, recursos, dia/noite e visitantes. Os sistemas (drones, pesquisa, contratos, eventos)
// recebem apenas as APIs necessarias, sem importacao circular.
import * as THREE from 'three';
import {
  state, bus, HOTBAR, save, addXp, addMoney, reputation, priceBonus, stockFree, waterCap, maxEnergy,
  buildingLevel, eventActive, hasResearch, soilGrowth, soilDouble, treeLimit, mutKey
} from './state.js';
import { CONFIG } from './config.js';
import {
  showToast, updateHUD, setPrompt, setBuildHint, openShop, openModal, closeModal, isModalOpen, modalId,
  toggleInventory, row, el, flash, selectSlot, isResumeVisible, openPauseMenu
} from './ui.js';
import { geo, mat, glow, createStructureModel, applyStructureLevel, animateStructure } from './world.js';
import { cachedMerged, vcMat, vcMatWet } from './optimize.js';
import { addOutline } from './toon.js';
import { play } from './audio.js';
import { initScenery, updateScenery } from './scenery.js';
import { initEffects, updateEffects, rainLevel, burst, pillar } from './effects.js';
import { initResearch, updateResearch, researchGrowth, researchEnergy, openLab } from './research.js';
import { initMissions, updateContracts, updateAchievements, buildContractsView } from './contracts.js';
import {
  initEvents, updateEvents, growthEventMult, evaporationMult, energyEventMult, rainWaterGain, sellEventMult, weatherVisual
} from './events.js';
import { initDrones, updateDrones, buyDrone, droneCost, openDronePanel } from './drones.js';

// ---------- Constantes locais ----------
const COUNT_MAX = { rain: 4, battery: 3, silo: 3, lab: 1, factory: 1, tower: 1, reactor: 2, station: 1, sprinkler: 6, drip: 6, rotary: 4, cloud: 2 };
const UPG_MAX = { rain: 3, battery: 3, silo: 3, lab: 3, factory: 3, tower: 2, reactor: 3, station: 2, sprinkler: 3, drip: 3, rotary: 3, cloud: 3 };
const NIGHT = new THREE.Color(0x2B2E5A), DAYC = new THREE.Color(0x7CD0FF);
const SOIL_COL = { farm: 0x6B4429, island: 0x4A3A78, tower: 0x5A5F6A };
const BORDER_COL = { farm: 0xB98A5C, island: 0x7E6BD0, tower: 0x4FE3C1 };
const SPAWN_CULL = 120; // distancia (m) para ocultar canteiros e arvores

// ---------- Estado de modulo ----------
let scene, camera, world, api;
let plotGroup;
const instances = []; // estruturas colocadas: { data, group, def, build, timer }
const trees = [];     // arvores: { data, group, mesh, stageKey, dirty }
let irrigators = [];
const fx = { rain: 0, reactor: 0 };
let build = null; // modo construcao { type | tree, x, z, reason }
const ghosts = {}, treeGhosts = {};
let ghostRing, ringOk, ringBad;
const pickupMeshes = new Map();
const visitors = [];
let tipTimer = 0, irrSoundT = 0, treeSkip = null;
let clock = 0, hudTimer = 0, saveTimer = 0, achTimer = 0, zoneTimer = 0, availTimer = 0, cullTimer = 0;

// temporarios reutilizados (sem alocar no loop)
const dirV = new THREE.Vector3(), tmpV = new THREE.Vector3();
const bgTmp = new THREE.Color();
const target = { type: null, ref: null, text: '' };
const mixCol = new THREE.Color(), mixCol2 = new THREE.Color();
const mixHex = (a, b, t) => mixCol.setHex(a).lerp(mixCol2.setHex(b), t).getHex();

// ======================================================================
//  MUTACOES
// ======================================================================
function rollMutation() {
  const mult = hasResearch('genetics') ? 1.7 : 1;
  for (const k of CONFIG.mutationOrder) {
    const m = CONFIG.mutations[k];
    if (state.level >= m.level && Math.random() < m.chance * mult) return k;
  }
  return null;
}
export const mutationName = k => CONFIG.mutations[k].name;

// ======================================================================
//  CANTEIROS
// ======================================================================
const plotGeom = {};
// Geometria fundida do canteiro (compartilhada com as fazendas de outros jogadores)
export function plotGeometry(kind) {
  if (!plotGeom[kind]) {
    plotGeom[kind] = cachedMerged('plot:' + kind, tmp => {
      const border = new THREE.Mesh(geo('box', 3.8, 0.55, 3.8), mat(BORDER_COL[kind]));
      const soil = new THREE.Mesh(geo('box', 3.4, 0.4, 3.4), mat(SOIL_COL[kind]));
      border.position.y = 0.12; soil.position.y = 0.2;
      tmp.add(border, soil);
      if (kind === 'tower') {
        const post = geo('cyl', 0.08, 0.1, 2.2, 6), pm = mat(0xC9D8E4, { metalness: 0.4 });
        [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]].forEach(([px, pz]) => { const p = new THREE.Mesh(post, pm); p.position.set(px, 1.1, pz); tmp.add(p); });
        const frame = new THREE.Mesh(geo('box', 3.5, 0.08, 3.5), glow(0x4FE3C1)); frame.position.y = 2.2; tmp.add(frame);
      }
    });
  }
  return plotGeom[kind];
}
function createPlot(slot) {
  const group = new THREE.Group();
  const kind = slot.kind;
  const soil = new THREE.Mesh(plotGeometry(kind), vcMat);
  soil.receiveShadow = true;
  addOutline(soil, 0.05);
  const plant = new THREE.Group();
  plant.position.y = 0.4;
  group.add(soil, plant);
  group.position.set(slot.x, 0, slot.z);
  group.visible = false;
  plotGroup.add(group);
  const data = {
    type: 'plot', id: slot.id, kind, tier: slot.tier || 0, x: slot.x, z: slot.z,
    crop: null, mutation: null, progress: 0, water: 0, sick: false, lastCrop: null, available: false, claimedBy: 0,
    group, plant, soil, dirty: true, stageKey: '', wet: false, glowMesh: null, aura: null, top: 1.2
  };
  state.plots.push(data);
  return data;
}

function plotAvailable(p) {
  if (p.kind === 'farm') return state.land.expand >= p.tier;
  if (p.kind === 'tower') return hasResearch('towers');
  return state.islandUnlocked;
}

function refreshAvailability(announce) {
  for (const p of state.plots) {
    const a = plotAvailable(p);
    if (a && !p.available && announce) pillar(p.x, p.z, 0x4FE3C1, 14);
    p.available = a; p.group.visible = a;
  }
}

// ---------- Modelos de plantas ----------
// Montados num grupo temporario e fundidos em UMA malha (cache por estagio): 1 draw call por canteiro.
function fillCrop(P, key, g, ready, sick, mut) {
  const c = CONFIG.crops[key];
  const s = 0.35 + 0.65 * g;
  const base = mut ? mixHex(c.color, mut.color, 0.55) : c.color;
  const col = sick ? 0x9A8B3A : base, green = sick ? 0x7A6A3A : 0x4FBF68;
  const E = ready ? 0.45 : 0.15;
  const mk = (gm, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(gm, m); o.position.set(x, y, z); P.add(o); return o; };
  const lit = (color, e) => mat(color, { emissive: color, emissiveIntensity: e });
  switch (key) {
    case 'lettuce': {
      const dk = mat(sick ? 0x7A6A3A : mixHex(col, 0x1F6B30, 0.35)), lt = mat(sick ? 0x9A8B3A : mixHex(col, 0xFFF6A0, 0.35));
      for (let ring = 0; ring < 2; ring++) {
        const n = ring ? 5 : 7;
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2 + ring * 0.4, r = (ring ? 0.2 : 0.38) * s;
          const leaf = mk(geo('sph', 0.34, 8, 6), ring ? lt : (i % 2 ? dk : mat(col)), Math.cos(a) * r, 0.14 + ring * 0.12 + 0.06 * s, Math.sin(a) * r);
          leaf.scale.set(s * (ring ? 0.8 : 1), (ring ? 0.5 : 0.35) * s, 0.85 * s); leaf.rotation.y = -a; leaf.rotation.z = ring ? 0.5 : 0.28;
        }
      }
      mk(geo('sph', 0.26, 8, 6), ready ? lit(mixHex(col, 0xFFF6A0, 0.5), 0.3) : lt, 0, 0.26 + 0.12 * s, 0).scale.setScalar(s);
      break;
    }
    case 'strawberry': {
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const lf = mk(geo('ico', 0.28, 1), mat(i % 2 ? green : mixHex(green, 0x1F6B30, 0.3)), Math.cos(a) * 0.38 * s, 0.2 + 0.14 * s, Math.sin(a) * 0.38 * s); lf.scale.set(1.1 * s, 0.35 * s, 0.8 * s); lf.rotation.y = -a; lf.rotation.z = 0.25; }
      mk(geo('ico', 0.3, 1), mat(green), 0, 0.28 * s + 0.1, 0).scale.set(s, 0.7 * s, s);
      const n = Math.floor(g * 6);
      for (let i = 0; i < n; i++) {
        const a = i / 6 * Math.PI * 2 + 0.4, x = Math.cos(a) * 0.5 * s, z = Math.sin(a) * 0.5 * s, y = 0.26 + 0.07 * (i % 2);
        if (ready || g > 0.7) {
          mk(geo('cone', 0.13, 0.28, 8), lit(col, ready ? 0.35 : 0.1), x, y, z).rotation.x = Math.PI;
          mk(geo('ico', 0.07, 0), mat(0x3FAF5A), x, y + 0.14, z).scale.set(1.4, 0.4, 1.4);
          for (let k = 0; k < 3; k++) mk(geo('sph', 0.018, 4, 3), glow(0xFFF3A0), x + Math.cos(k * 2.1) * 0.07, y + 0.02 - k * 0.03, z + Math.sin(k * 2.1) * 0.07);
        } else mk(geo('sph', 0.1, 8, 6), mat(0xBFE08A), x, y, z);
      }
      if (g < 0.6) for (let i = 0; i < 2; i++) mk(geo('sph', 0.07, 6, 5), glow(0xFFFFFF), (i ? 0.3 : -0.25) * s, 0.4 * s + 0.1, (i ? -0.2 : 0.25) * s);
      break;
    }
    case 'carrot': {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + (i % 2) * 0.2, h = (0.5 + 0.55 * s) * (0.75 + 0.25 * (i % 3) / 2);
        const leaf = mk(geo('cone', 0.07, 1, 4), mat(i % 2 ? green : mixHex(green, 0x8AE08A, 0.3)), Math.cos(a) * 0.12 * s, 0.15 + h * 0.42, Math.sin(a) * 0.12 * s);
        leaf.rotation.z = Math.cos(a) * 0.55; leaf.rotation.x = -Math.sin(a) * 0.55; leaf.scale.y = h;
        mk(geo('sph', 0.06, 5, 4), mat(0x6BE08A), Math.cos(a) * (0.12 + h * 0.4) * s, 0.15 + h * 0.85, Math.sin(a) * (0.12 + h * 0.4) * s).scale.set(1.6, 0.5, 1.6);
      }
      const root = mk(geo('cone', 0.2, 0.62, 8), lit(col, E), 0, 0.16, 0); root.rotation.x = Math.PI; root.scale.setScalar(0.5 + 0.5 * s);
      mk(geo('sph', 0.2, 8, 6), lit(col, E), 0, 0.4 * (0.5 + 0.5 * s) - 0.04, 0).scale.set(0.5 + 0.5 * s, 0.5, 0.5 + 0.5 * s);
      for (let i = 0; i < 2; i++) mk(geo('tor', 0.12 - i * 0.025, 0.012, 4, 10), mat(mixHex(col, 0x7A2E00, 0.3)), 0, 0.3 - i * 0.14, 0).rotation.x = Math.PI / 2;
      break;
    }
    case 'corn': {
      const h = 0.5 + 1.5 * g, lf = mat(green), lf2 = mat(mixHex(green, 0xBFFF9A, 0.3));
      mk(geo('cyl', 0.07, 0.12, 1, 7), mat(sick ? 0x8A7A3A : 0x3FAF8A), 0, h / 2, 0).scale.y = h;
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + 0.5, y = 0.25 + h * (0.25 + 0.12 * (i % 3));
        const l = mk(geo('cone', 0.13, 1, 5), i % 2 ? lf : lf2, Math.cos(a) * 0.3, y, Math.sin(a) * 0.3);
        l.rotation.z = Math.cos(a) * 1.0; l.rotation.x = Math.sin(a) * -1.0; l.scale.y = (0.55 + g * 0.55) * 0.9; l.scale.z = 0.35;
      }
      if (g > 0.5) for (let i = 0; i < 2; i++) {
        const sx = i ? 0.15 : -0.15, sz = i ? 0.08 : -0.08, y = h * 0.66;
        mk(geo('oct', 0.2, 0), lit(col, ready ? 0.9 : 0.35), sx, y, sz).scale.set(0.8, 1.9, 0.8);
        for (let k = 0; k < 3; k++) { const hk = mk(geo('cone', 0.14, 0.6, 5), lf2, sx + Math.cos(k * 2.1 + i) * 0.1, y - 0.12, sz + Math.sin(k * 2.1 + i) * 0.1); hk.rotation.z = Math.cos(k * 2.1 + i) * 0.35; hk.rotation.x = -Math.sin(k * 2.1 + i) * 0.35; hk.scale.set(1, 0.95, 0.5); }
      }
      if (g > 0.4) for (let i = 0; i < 3; i++) { const t = mk(geo('cone', 0.03, 0.5, 4), mat(0xE8D890), 0, h + 0.12, 0); t.rotation.z = (i - 1) * 0.5; t.rotation.x = (i % 2) * 0.4; }
      break;
    }
    case 'tomato': {
      const stk = mat(0xC9A56B), lf = mat(green), lf2 = mat(mixHex(green, 0x1F6B30, 0.3));
      mk(geo('cyl', 0.03, 0.03, 1.4, 5), stk, 0.4, 0.7, 0); mk(geo('cyl', 0.03, 0.03, 1.4, 5), stk, -0.4, 0.7, 0); mk(geo('cyl', 0.025, 0.025, 0.8, 5), stk, 0, 1.0, 0).rotation.z = Math.PI / 2;
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const l = mk(geo('ico', 0.26, 1), i % 2 ? lf : lf2, Math.cos(a) * 0.34 * s, 0.22 + 0.3 * s + (i % 3) * 0.12, Math.sin(a) * 0.34 * s); l.scale.set(1.1 * s, 0.5 * s, 0.8 * s); l.rotation.y = -a; }
      mk(geo('ico', 0.34, 1), lf, 0, 0.1 + 0.4 * s, 0).scale.set(s, 0.9 * s, s);
      const n = Math.floor(g * 6);
      for (let i = 0; i < n; i++) {
        const a = i * 2.2, x = Math.cos(a) * 0.45 * s, z = Math.sin(a) * 0.45 * s, y = 0.28 + (i % 3) * 0.2 * s;
        const ripe = g > 0.75;
        mk(geo('sph', 0.15, 10, 8), ripe ? lit(col, E) : mat(0x8FD36A), x, y, z).scale.set(1, 0.9, 1);
        mk(geo('ico', 0.07, 0), mat(0x2E8F44), x, y + 0.14, z).scale.set(1.5, 0.4, 1.5);
        if (ripe) mk(geo('sph', 0.04, 5, 4), glow(0xFFFFFF), x - 0.06, y + 0.07, z + 0.07);
      }
      break;
    }
    case 'mushroom': {
      [[0, 0, 1], [0.55, 0.3, 0.65], [-0.45, -0.35, 0.75]].forEach(([x, z, k]) => {
        const sc = s * k;
        mk(geo('cyl', 0.1, 0.15, 0.6, 7), mat(0xE8E0F5), x, 0.3 * sc, z).scale.setScalar(sc);
        const cap = mk(geo('sph', 0.46, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), lit(col, ready ? 0.7 : 0.3), x, 0.58 * sc, z);
        cap.scale.set(sc, sc * 0.85, sc);
        if (g > 0.4) for (let k = 0; k < 4; k++) mk(geo('sph', 0.07, 6, 5), glow(0xFFFFFF), x + Math.cos(k * 1.6) * 0.22 * sc, 0.62 * sc + 0.2 * sc * (1 - (k % 2) * 0.35), z + Math.sin(k * 1.6) * 0.22 * sc).scale.set(1, 0.4, 1);
        mk(geo('cyl', 0.5, 0.5, 0.04, 10), mat(0xC9B8E8), x, 0.55 * sc, z).scale.set(sc * 0.9, 1, sc * 0.9);
      });
      break;
    }
    case 'grape': {
      for (const px of [-0.85, 0.85]) mk(geo('cyl', 0.05, 0.06, 1.5, 5), mat(0x8A5A34), px, 0.75, 0);
      mk(geo('box', 1.9, 0.05, 0.05), mat(0x8A5A34), 0, 1.45, 0);
      for (let i = 0; i < 6; i++) mk(geo('ico', 0.3, 1), mat(i % 2 ? green : mixHex(green, 0x1F6B30, 0.3)), (i - 2.5) * 0.36, 1.3 - 0.07 * (i % 2), (i % 2 ? 0.08 : -0.08)).scale.set(1.1, 0.5 * s, 0.7);
      for (let i = 0; i < 3; i++) mk(geo('tor', 0.1, 0.02, 4, 8), mat(0x6BB04A), -0.5 + i * 0.5, 1.2, 0).rotation.y = i;
      const n = Math.floor(g * 5);
      for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 0.4; for (let k = 0; k < 3; k++) mk(geo('sph', 0.11, 8, 6), lit(col, ready ? 0.5 : 0.15), x + (k - 1) * 0.07, 1.2 - k * 0.12, 0.04 * (k % 2)); }
      break;
    }
    case 'flower': {
      const h = 0.4 + 0.9 * g;
      mk(geo('cyl', 0.04, 0.06, 1, 5), mat(green), 0, h / 2, 0).scale.y = h;
      mk(geo('ico', 0.15, 1), lit(0xFFD166, 0.6), 0, h + 0.05, 0);
      const pn = 4 + Math.floor(g * 4);
      for (let i = 0; i < pn; i++) {
        const a = i / pn * Math.PI * 2;
        const pt = mk(geo('ico', 0.2, 1), lit(col, ready ? 0.55 : 0.2), Math.cos(a) * 0.34 * s, h + 0.05, Math.sin(a) * 0.34 * s);
        pt.scale.set(1, 0.4, 1.4); pt.rotation.y = -a;
      }
      for (const lx of [-0.3, 0.3]) mk(geo('ico', 0.2, 1), mat(green), lx, h * 0.35, 0).scale.set(1.2, 0.35, 0.6);
      for (let i = 0; i < pn; i++) { const a = (i + 0.5) / pn * Math.PI * 2; const p2 = mk(geo('ico', 0.16, 1), lit(mixHex(col, 0xFFFFFF, 0.35), ready ? 0.5 : 0.2), Math.cos(a) * 0.2 * s, h + 0.12, Math.sin(a) * 0.2 * s); p2.scale.set(1, 0.4, 1.3); p2.rotation.y = -a; }
      if (ready) mk(geo('tor', 0.7, 0.03, 5, 18), glow(0xFFB0F0), 0, h + 0.1, 0).rotation.x = Math.PI / 2.5;
      break;
    }
    case 'pumpkin': {
      const body = mat(col), rib = lit(mixHex(col, 0xFFD080, 0.2), E * 0.8);
      for (let i = 0; i < 5; i++) {
        const b = mk(geo('sph', 0.5, 9, 7), i % 2 ? rib : lit(col, E * 0.8), 0, 0.2 + 0.28 * s, 0);
        b.scale.set(1.0 * s, 0.78 * s, 0.5 * s); b.rotation.y = i * Math.PI / 5;
      }
      const stem = mk(geo('cyl', 0.06, 0.1, 0.28, 6), mat(0x5E8F2E), 0, 0.2 + 0.6 * s, 0); stem.rotation.z = 0.2;
      mk(geo('tor', 0.1, 0.035, 5, 8), mat(0x5E8F2E), 0.1, 0.34 + 0.62 * s, 0).rotation.y = 1.2;
      for (const sx of [-1, 1]) { mk(geo('ico', 0.35, 1), mat(green), sx * 0.8, 0.14, sx * 0.22).scale.set(1.3, 0.16, 1.1); mk(geo('ico', 0.22, 1), mat(mixHex(green, 0x1F6B30, 0.3)), sx * 0.55, 0.12, -sx * 0.3).scale.set(1.2, 0.15, 1); }
      mk(geo('cyl', 0.02, 0.02, 0.9, 4), mat(0x6BB04A), 0, 0.1, 0).rotation.z = Math.PI / 2;
      break;
    }
    case 'melon': {
      mk(geo('ico', 0.6, 1), mat(green), 0, 0.15, 0).scale.set(1.4, 0.22, 1.4);
      const dkc = mat(mixHex(col, 0x0E5A38, 0.55));
      const body = mk(geo('sph', 0.55, 12, 9), lit(col, ready ? 0.45 : 0.12), 0, 0.2 + 0.5 * s, 0);
      body.scale.setScalar(s * 0.95); body.scale.y *= 0.92;
      if (g > 0.35) for (let i = 0; i < 4; i++) { const st = mk(geo('sph', 0.56, 3, 9, i * Math.PI / 2, 0.22, 0.25, 2.6), dkc, 0, 0.2 + 0.5 * s, 0); st.scale.setScalar(s * 0.97); st.scale.y *= 0.93; st.rotation.y = i * 0.5; }
      mk(geo('cyl', 0.04, 0.06, 0.2, 5), mat(0x5E8F2E), 0, 0.2 + 1.02 * s, 0);
      for (let i = 0; i < 3; i++) { const a = i * 2.1; mk(geo('ico', 0.18, 1), mat(0x2E8F66), Math.cos(a) * 0.7 * s, 0.14, Math.sin(a) * 0.7 * s).scale.set(1.3, 0.2, 1); }
      if (ready) mk(geo('sph', 0.07, 6, 5), glow(0xFFFFFF), -0.2 * s, 0.55 + 0.5 * s, 0.35 * s);
      break;
    }
    case 'pepper': {
      const lf = mat(green), lf2 = mat(mixHex(green, 0x1F6B30, 0.3));
      mk(geo('cyl', 0.04, 0.06, 0.6, 5), mat(0x7A5A34), 0, 0.3, 0);
      mk(geo('ico', 0.4, 1), lf, 0, 0.1 + 0.38 * s, 0).scale.set(s, 1.1 * s, s);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const l = mk(geo('ico', 0.2, 1), i % 2 ? lf : lf2, Math.cos(a) * 0.38 * s, 0.25 + 0.25 * s + (i % 3) * 0.1, Math.sin(a) * 0.38 * s); l.scale.set(1.1 * s, 0.4 * s, 0.7 * s); l.rotation.y = -a; }
      const n = Math.floor(g * 7);
      for (let i = 0; i < n; i++) {
        const a = i * 2.4, r = 0.36 * s, x = Math.cos(a) * r, z = Math.sin(a) * r, y = 0.5 * s + 0.1 * (i % 3);
        const p = mk(geo('cone', 0.09, 0.4, 6), lit(g > 0.75 ? col : 0xBFE08A, E + 0.1), x, y, z); p.rotation.x = Math.PI; p.rotation.z = Math.cos(a) * 0.3;
        mk(geo('sph', 0.07, 6, 5), mat(0x2E8F44), x, y + 0.2, z).scale.set(1.2, 0.5, 1.2);
        if (g > 0.75) mk(geo('sph', 0.03, 5, 4), glow(0xFFFFFF), x - 0.04, y + 0.08, z + 0.05);
      }
      break;
    }
    case 'lotus': {
      const h = 0.3 + 0.8 * g;
      for (let i = 0; i < 3; i++) { const a = i * 2.1; mk(geo('cyl', 0.5, 0.5, 0.05, 10), mat(green), Math.cos(a) * 0.55, 0.12 + i * 0.02, Math.sin(a) * 0.55); }
      mk(geo('cyl', 0.04, 0.05, 1, 5), mat(green), 0, h / 2, 0).scale.y = h;
      const pn = 5 + Math.floor(g * 4);
      for (let i = 0; i < pn; i++) {
        const a = i / pn * Math.PI * 2;
        const pt = mk(geo('oct', 0.2, 0), lit(col, ready ? 0.8 : 0.35), Math.cos(a) * 0.28 * s, h + 0.12, Math.sin(a) * 0.28 * s);
        pt.scale.set(0.8, 1.6, 0.8); pt.rotation.y = -a; pt.rotation.z = Math.cos(a) * 0.5; pt.rotation.x = Math.sin(a) * 0.5;
      }
      mk(geo('ico', 0.14, 1), glow(0xFFFFFF), 0, h + 0.1, 0);
      if (ready) mk(geo('tor', 0.6, 0.03, 5, 18), glow(0xBFF3FF), 0, h + 0.1, 0).rotation.x = Math.PI / 2;
      break;
    }
    default: break;
  }
  mk(geo('sph', 0.55, 8, 5), mat(0x6B4528), 0, 0.01, 0).scale.set(1, 0.22, 1);
  if (sick) for (let i = 0; i < 3; i++) mk(geo('ico', 0.1, 1), mat(0x5A7A20), (i - 1) * 0.3, 1.1 + i * 0.12, (i % 2) * 0.2);
  if (mut) mk(geo('tor', 0.75, 0.035, 5, 20), glow(mut.color), 0, 0.12, 0).rotation.x = Math.PI / 2;
}

// Malha de uma planta num estagio (usada tambem para mostrar plantas de outros jogadores)
export function cropGeometry(key, g, mutKey) {
  const ready = g >= 1;
  const sk = key + ':' + Math.min(5, Math.floor(g * 5)) + (ready ? 'r' : '') + (mutKey ? ':' + mutKey : '');
  return cachedMerged('crop:' + sk, tmp => fillCrop(tmp, key, g, ready, false, mutKey ? CONFIG.mutations[mutKey] : null));
}
export function treeGeometry(type, g, fruits) {
  const d = CONFIG.trees[type];
  const key = type + ':' + Math.min(5, Math.floor(g * 5)) + ':' + (g >= 1 ? fruits : 0);
  return cachedMerged('tree:' + key, tmp => fillTree(tmp, type, g >= 1 ? 1 : Math.floor(g * 5) / 5 + 0.1, fruits));
}

function buildCrop(plot) {
  const P = plot.plant;
  P.clear(); plot.glowMesh = null; plot.aura = null;
  if (!plot.crop) return;
  const c = CONFIG.crops[plot.crop];
  const g = Math.min(1, plot.progress / c.growTime), ready = g >= 1, sick = plot.sick;
  const mut = plot.mutation ? CONFIG.mutations[plot.mutation] : null;
  const geom = cachedMerged('crop:' + plot.stageKey, tmp => fillCrop(tmp, plot.crop, g, ready, sick, mut));
  if (geom) {
    if (!geom.boundingBox) geom.computeBoundingBox();
    plot.top = geom.boundingBox.max.y;
    const m = new THREE.Mesh(geom, vcMat); P.add(m); addOutline(m);
  }
  P.scale.setScalar(plot.mutation === 'giant' ? 1.3 : 1);
  if (mut) { // brilho orbitando a planta mutante
    plot.aura = new THREE.Mesh(geo('oct', 0.1, 0), glow(mut.color)); P.add(plot.aura);
  }
  if (ready && !sick) { plot.glowMesh = new THREE.Mesh(geo('sph', 0.17, 10, 8), glow(0xFFD166)); plot.glowMesh.position.y = plot.top + 0.35; P.add(plot.glowMesh); }
}

// ---------- Acoes de canteiro (usadas pelo jogador e pelos drones) ----------
function plantPlot(plot, cropKey, byDrone) {
  if (!cropKey || plot.crop || state.seeds[cropKey] <= 0 || state.level < CONFIG.crops[cropKey].level) return false;
  state.seeds[cropKey]--;
  plot.crop = cropKey; plot.progress = 0; plot.water = 0; plot.sick = false; plot.lastCrop = cropKey; plot.dirty = true;
  plot.mutation = rollMutation();
  addXp(byDrone ? 2 : 4 + CONFIG.crops[cropKey].level);
  burst(plot.x, 0.7, plot.z, plot.mutation ? CONFIG.mutations[plot.mutation].color : CONFIG.crops[cropKey].color, plot.mutation ? 24 : 10, 1.5, 2);
  if (plot.mutation) { showToast('Mutacao! ' + CONFIG.crops[cropKey].name + ' ' + mutationName(plot.mutation) + ' crescendo', 'mission'); play('upgrade'); }
  else if (!byDrone) { play('plant'); showToast(CONFIG.crops[cropKey].name + ' plantado', 'info'); }
  bus.emit('plant', { crop: cropKey, byDrone });
  return true;
}

function waterPlot(plot, byDrone) {
  if (!plot.crop || state.water < 0.5) return false;
  if (plot.water >= 12) return false;
  const crop = CONFIG.crops[plot.crop];
  const used = Math.min(state.water, crop.waterUse);
  state.water -= used;
  plot.water = Math.min(12, plot.water + used);
  plot.progress = Math.min(crop.growTime, plot.progress + used * 2);
  const wasSick = plot.sick;
  plot.sick = false; plot.dirty = true;
  burst(plot.x, 1.4, plot.z, 0x4FC3F7, byDrone ? 6 : 14, 1.2, 1.5);
  if (!byDrone) { play('water'); showToast(wasSick ? 'Planta curada e regada' : 'Regou a plantacao', wasSick ? 'good' : 'info'); }
  else if (wasSick) showToast('Um drone curou uma planta doente', 'good');
  return true;
}

function harvestPlot(plot, byDrone) {
  if (!plot.crop) return false;
  const crop = CONFIG.crops[plot.crop];
  if (plot.progress < crop.growTime) return false;
  const free = stockFree();
  if (free <= 0) {
    if (!byDrone) { showToast('Estoque cheio. Venda no Mercado ou construa um Silo.', 'bad'); play('error'); }
    return false;
  }
  const mutKeyName = plot.mutation, mut = mutKeyName ? CONFIG.mutations[mutKeyName] : null;
  let amount = state.yieldLevel * (mut ? mut.yield : 1);
  if (hasResearch('organic') && Math.random() < 0.3) amount *= 2;
  if (Math.random() < soilDouble()) amount *= 2;
  amount = Math.min(amount, free);
  if (mut) { const k = mutKey(mutKeyName, plot.crop); state.mutated[k] = (state.mutated[k] || 0) + amount; state.stats.mutations++; }
  else state.crops[plot.crop] += amount;
  if (hasResearch('recycle') && Math.random() < 0.35) { state.seeds[plot.crop]++; if (!byDrone) showToast('Semente recuperada', 'good'); }
  const key = plot.crop;
  plot.lastCrop = key; plot.crop = null; plot.mutation = null; plot.progress = 0; plot.water = 0; plot.sick = false; plot.dirty = true;
  addXp(byDrone ? Math.round(crop.xp * 0.6) : crop.xp);
  burst(plot.x, 1.2, plot.z, mut ? mut.color : crop.color, mut ? 40 : 22, 3, 3.5);
  const label = mut ? crop.name + ' ' + mut.name : crop.name;
  if (!byDrone) { play(mut ? 'mission' : 'harvest'); showToast('Colheu ' + amount + ' ' + label, mut ? 'mission' : 'good'); }
  else if (camera.position.distanceTo(plot.group.position) < 25) play('harvest');
  bus.emit('harvest', { crop: key, amount, byDrone, mutation: mutKeyName });
  return true;
}

function interactPlot(plot) {
  if (!plot.crop) {
    const slot = HOTBAR[state.selectedSlot];
    if (slot.type !== 'seed') { showToast('Selecione uma semente na hotbar (Tab troca de pagina)', 'bad'); play('error'); return; }
    const c = CONFIG.crops[slot.crop];
    if (state.level < c.level) { showToast(c.name + ' exige nivel ' + c.level, 'bad'); play('error'); return; }
    if (state.seeds[slot.crop] <= 0) { showToast('Sem sementes de ' + c.name + '. Compre na Loja Geral.', 'bad'); play('error'); return; }
    plantPlot(plot, slot.crop, false);
  } else if (plot.progress >= CONFIG.crops[plot.crop].growTime) {
    harvestPlot(plot, false);
  } else if (!waterPlot(plot, false)) {
    if (plot.water >= 12) showToast('Este canteiro ja esta encharcado', 'info');
    else { showToast('Sem agua no regador. Use a bomba de agua.', 'bad'); play('error'); }
  }
}

function updatePlots(dt, t) {
  const irrigation = hasResearch('irrigation');
  const gm = researchGrowth() * growthEventMult() * soilGrowth(), evap = evaporationMult();
  for (let i = 0; i < state.plots.length; i++) {
    const p = state.plots[i];
    if (!p.available) continue;
    if (p.crop) {
      const crop = CONFIG.crops[p.crop];
      p.water = Math.max(0, p.water - 0.04 * evap * dt);
      if (irrigation && p.water < 1.5) p.water = 1.5;
      if (p.progress < crop.growTime) p.progress = Math.min(crop.growTime, p.progress + dt * (0.35 + p.water * 0.08) * gm * (p.sick ? 0.4 : 1));
      const gg = p.progress / crop.growTime;
      const key = p.crop + ':' + Math.min(5, Math.floor(gg * 5)) + (gg >= 1 ? 'r' : '') + (p.sick ? 's' : '') + (p.mutation ? ':' + p.mutation : '');
      if (p.dirty || key !== p.stageKey) { p.stageKey = key; p.dirty = false; buildCrop(p); }
      if (p.glowMesh) { p.glowMesh.position.y = p.top + 0.35 + Math.sin(t * 3 + i) * 0.08; p.glowMesh.rotation.y += dt * 2; }
      if (p.aura) { const a = t * 1.6 + i; p.aura.position.set(Math.cos(a) * 0.8, p.top * 0.6 + Math.sin(t * 2 + i) * 0.2, Math.sin(a) * 0.8); p.aura.rotation.y += dt * 3; }
    } else if (p.dirty) { p.dirty = false; p.stageKey = ''; buildCrop(p); }
    const wet = p.crop ? p.water > 0.6 : false;
    if (wet !== p.wet) { p.wet = wet; p.soil.material = wet ? vcMatWet : vcMat; }
  }
}

// ======================================================================
//  ARVORES FRUTIFERAS
// ======================================================================
function fillTree(P, type, g, fruits) {
  const d = CONFIG.trees[type];
  const s = 0.3 + 0.7 * g, mature = g >= 1;
  const mk = (gm, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(gm, m); o.position.set(x, y, z); o.castShadow = true; P.add(o); return o; };
  const fruitMat = mat(d.fruitColor, { emissive: d.fruitColor, emissiveIntensity: 0.3 });
  if (type === 'coconut') {
    const th = 2.6 * s;
    for (let i = 0; i < 3; i++) mk(geo('cyl', 0.14, 0.2, th / 3 + 0.05, 6), mat(0x9A6B3C), 0.18 * (i + 0.5) * s, th / 3 * (i + 0.5), 0).rotation.z = -0.12;
    const tx = 0.54 * s;
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      const f = mk(geo('cone', 0.22, 1.7, 4), mat(i % 2 ? d.crown : mixHex(d.crown, 0xffffff, 0.2)), tx + Math.cos(a) * 0.7 * s, th + 0.1, Math.sin(a) * 0.7 * s);
      f.rotation.z = -Math.cos(a) * 1.25; f.rotation.x = Math.sin(a) * 1.25; f.scale.set(1, 0.5 + 0.5 * s, 0.35);
    }
    if (mature) for (let i = 0; i < Math.min(fruits, 5); i++) { const a = i * 1.26; mk(geo('sph', 0.17, 8, 6), fruitMat, tx + Math.cos(a) * 0.26, th - 0.16, Math.sin(a) * 0.26); }
    return;
  }
  const th = 1.7 * s;
  if (type === 'crystaltree') {
    mk(geo('cyl', 0.12, 0.2, th, 6), mat(0xE8F0F7, { emissive: d.crown, emissiveIntensity: 0.25 }), 0, th / 2, 0);
    const cm = mat(d.crown, { emissive: d.crown, emissiveIntensity: 0.7 });
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; mk(geo('oct', 0.45, 0), cm, Math.cos(a) * 0.55 * s, th + 0.35 + (i % 2) * 0.35, Math.sin(a) * 0.55 * s).scale.set(0.8, 2.0, 0.8); }
    mk(geo('oct', 0.55, 0), cm, 0, th + 0.7, 0).scale.set(0.9, 2.2, 0.9);
    if (mature) for (let i = 0; i < fruits; i++) { const a = i * 2.399; mk(geo('sph', 0.14, 8, 6), fruitMat, Math.cos(a) * 0.75, th + 0.1 + (i % 3) * 0.3, Math.sin(a) * 0.75); }
    return;
  }
  const bark = mat(0x7A4E2D), bark2 = mat(0x5E3A20);
  mk(geo('cyl', 0.16, 0.28, th, 8), bark, 0, th / 2, 0);
  mk(geo('cyl', 0.28, 0.46, 0.28 * s + 0.1, 8), bark2, 0, 0.1, 0);
  if (g > 0.5) for (let i = 0; i < 2; i++) { const br = mk(geo('cyl', 0.05, 0.1, 0.8 * s, 5), bark, (i ? -1 : 1) * 0.28 * s, th * 0.82, 0); br.rotation.z = (i ? 1 : -1) * 0.8; }
  const c1 = mat(d.crown), c2 = mat(mixHex(d.crown, 0xffffff, 0.15)), c3 = mat(mixHex(d.crown, 0xFFF3A0, 0.28)), c0 = mat(mixHex(d.crown, 0x16301F, 0.22));
  const blob = (r, c, x, y, z) => mk(geo('ico', r, 1), c, x * s, th + y * s, z * s).scale.setScalar(s);
  blob(0.95, c0, 0, 0.55, 0);
  for (let i = 0; i < 5; i++) { const a2 = i / 5 * Math.PI * 2 + 0.3; blob(0.72, i % 2 ? c1 : c2, Math.cos(a2) * 0.78, 0.3 + (i % 2) * 0.12, Math.sin(a2) * 0.78); }
  blob(0.85, c1, 0, 1.1, 0);
  blob(0.55, c3, 0.25, 1.55, 0.15);
  blob(0.4, c3, -0.5, 1.15, 0.45);
  if (mature) for (let i = 0; i < fruits; i++) { const a = i * 2.399, r = (0.55 + 0.2 * (i % 3)) * s; mk(geo('sph', 0.13, 8, 6), fruitMat, Math.cos(a) * r, th + 0.25 * s + (i % 3) * 0.3 * s, Math.sin(a) * r); }
}

const treeStage = (d, data) => Math.min(5, Math.floor(data.progress / d.growTime * 5));
function buildTree(inst) {
  const d = CONFIG.trees[inst.data.type], data = inst.data;
  const g = Math.min(1, data.progress / d.growTime);
  inst.group.clear();
  const geom = cachedMerged('tree:' + inst.stageKey, tmp => fillTree(tmp, data.type, g >= 1 ? 1 : Math.floor(g * 5) / 5 + 0.1, data.fruits));
  if (geom) { const m = new THREE.Mesh(geom, vcMat); m.castShadow = true; m.receiveShadow = true; inst.group.add(m); addOutline(m); }
}

function createTreeInstance(data, animate) {
  data.claimedBy = 0;
  const group = new THREE.Group(); group.position.set(data.x, 0, data.z);
  scene.add(group);
  const inst = { data, group, stageKey: '', dirty: true, build: animate ? 0 : -1 };
  if (animate) group.scale.setScalar(0.01);
  trees.push(inst);
  world.colliders.push({ x: data.x, z: data.z, radius: 0.55 });
  return inst;
}

function treeKey(data) {
  const d = CONFIG.trees[data.type];
  return data.type + ':' + treeStage(d, data) + ':' + (data.progress >= d.growTime ? data.fruits : 0);
}

function harvestTree(tree, byDrone) {
  if (tree.fruits <= 0) return false;
  const d = CONFIG.trees[tree.type];
  const free = stockFree();
  if (free <= 0) { if (!byDrone) { showToast('Estoque cheio. Venda frutos no Mercado ou construa um Silo.', 'bad'); play('error'); } return false; }
  const n = Math.min(tree.fruits, free);
  state.fruits[tree.type] += n; tree.fruits -= n; state.stats.fruits += n;
  addXp(Math.round(d.xp * n * (byDrone ? 0.6 : 1)));
  burst(tree.x, 2.4, tree.z, d.fruitColor, 8 + n * 3, 2.5, 3);
  if (!byDrone) { play('harvest'); showToast('Colheu ' + n + ' ' + d.fruit, 'good'); }
  else if (camera.position.distanceTo(tmpV.set(tree.x, 0, tree.z)) < 25) play('harvest');
  bus.emit('fruit', { type: tree.type, amount: n, byDrone });
  return true;
}

function waterTree(tree, byDrone) {
  if (state.water < 0.5 || tree.water >= 6) return false;
  const used = Math.min(state.water, 2);
  state.water -= used; tree.water = Math.min(8, tree.water + used * 2.5);
  burst(tree.x, 2.2, tree.z, 0x4FC3F7, byDrone ? 6 : 14, 1.2, 1.5);
  if (!byDrone) { play('water'); showToast('Regou ' + CONFIG.trees[tree.type].name, 'info'); }
  return true;
}

function updateTrees(dt, t) {
  const gm = researchGrowth() * growthEventMult() * soilGrowth();
  const pomo = hasResearch('pomology') ? 1.3 : 1;
  for (let i = 0; i < trees.length; i++) {
    const inst = trees[i], d = inst.data, def = CONFIG.trees[d.type];
    d.water = Math.max(0, d.water - 0.03 * evaporationMult() * dt);
    if (hasResearch('irrigation') && d.water < 1) d.water = 1;
    const rate = (0.55 + 0.45 * Math.min(1, d.water / 2)) * gm;
    if (d.progress < def.growTime) d.progress = Math.min(def.growTime, d.progress + dt * rate);
    else if (d.fruits < def.maxFruits) {
      d.fruitT += dt * rate * pomo;
      if (d.fruitT >= def.fruitEvery) { d.fruitT = 0; d.fruits++; if (camera.position.distanceToSquared(tmpV.set(d.x, 1.5, d.z)) < 900) burst(d.x, 2.2, d.z, def.fruitColor, 5, 1, 1.5); }
    }
    const key = treeKey(d);
    if (key !== inst.stageKey) { inst.stageKey = key; buildTree(inst); }
    if (inst.build >= 0) {
      inst.build += dt / 1.1;
      const k = Math.min(1, inst.build), c1 = 1.70158, c3 = c1 + 1;
      inst.group.scale.setScalar(Math.max(0.01, 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2)));
      if (k >= 1) { inst.build = -1; inst.group.scale.setScalar(1); }
    }
    // balanco suave das copas e brilho de maturidade
    if (d.progress >= def.growTime) inst.group.rotation.z = Math.sin(t * 0.8 + i) * 0.012;
  }
}

// ---------- Plantio de arvores (modo construcao) ----------
function treeBlock(key) {
  const d = CONFIG.trees[key];
  if (state.level < d.level) return 'Nivel ' + d.level;
  if (state.saplings[key] <= 0) return 'Sem mudas';
  if (state.trees.length >= treeLimit()) return 'Limite de ' + treeLimit() + ' arvores (melhore o Pomar)';
  return null;
}

function getTreeGhost(key) {
  if (!treeGhosts[key]) {
    const g = new THREE.Group();
    const geom = cachedMerged('tree:' + key + ':4:0', tmp => fillTree(tmp, key, 0.9, 0));
    if (geom) g.add(new THREE.Mesh(geom, vcMat));
    treeGhosts[key] = g;
  }
  return treeGhosts[key];
}

function startTreeBuild(key) {
  const why = treeBlock(key);
  if (why) { showToast(why, 'bad'); play('error'); return false; }
  cancelBuild(true);
  ghostRing.geometry = geo('ring', 1.2, 1.5, 32);
  scene.add(getTreeGhost(key), ghostRing);
  build = { tree: key, x: 0, z: 0, reason: null };
  world.overlays.forEach(o => { o.visible = true; });
  return true;
}

function canPlaceTree(x, z) {
  const area = world.inBuildArea(x, z, 1.2);
  if (!area.farm && !area.island) return 'Fora da area de plantio (area destacada)';
  for (const p of state.plots) if (Math.hypot(p.x - x, p.z - z) < 1.2 + 2.5) return 'Muito perto de um canteiro';
  for (const s of state.structures) if (Math.hypot(s.x - x, s.z - z) < 1.2 + CONFIG.structures[s.type].radius + 0.3) return 'Muito perto de uma estrutura';
  for (const t of state.trees) if (Math.hypot(t.x - x, t.z - z) < 2.6) return 'Muito perto de outra arvore';
  for (const o of world.fixedObstacles) if (Math.hypot(o.x - x, o.z - z) < 1.2 + o.r) return 'Muito perto da bomba ou da estacao';
  return null;
}

function tryPlaceTree() {
  const key = build.tree, d = CONFIG.trees[key];
  if (build.reason) { showToast(build.reason, 'bad'); play('error'); return; }
  const why = treeBlock(key);
  if (why) { showToast(why, 'bad'); play('error'); cancelBuild(true); return; }
  state.saplings[key]--;
  const data = { id: state.nextTreeId++, type: key, x: build.x, z: build.z, progress: 0, fruits: 0, fruitT: 0, water: 2 };
  state.trees.push(data);
  createTreeInstance(data, true);
  addXp(10 + d.level * 2);
  pillar(data.x, data.z, d.crown, 20); burst(data.x, 0.4, data.z, 0x7ED957, 18, 2, 3);
  play('plant'); showToast(d.name + ' plantada. Regue para crescer mais rapido.', 'good');
  bus.emit('tree', data);
  save();
  if (treeBlock(key)) cancelBuild(true);
}

// ======================================================================
//  ESTRUTURAS (construcoes e decoracoes)
// ======================================================================
const countOf = type => state.structures.reduce((n, s) => n + (s.type === type ? 1 : 0), 0);
const maxCount = type => (CONFIG.structures[type].kind === 'decor' ? CONFIG.structures[type].max : COUNT_MAX[type]);
const upgradeCost = s => Math.round(CONFIG.structures[s.type].cost * 0.8 * s.level);
const upgradeCrystals = s => (CONFIG.structures[s.type].crystals ? Math.ceil(CONFIG.structures[s.type].crystals * 0.5 * s.level) : 0);

function recomputeEffects() {
  fx.rain = 0; fx.reactor = 0;
  for (const s of state.structures) {
    if (s.type === 'rain') fx.rain += 0.12 * s.level;
    if (s.type === 'reactor') fx.reactor += 1.2 * s.level;
  }
  irrigators = instances.filter(i => i.def.irrigator);
}

function createInstance(data, animate) {
  const def = CONFIG.structures[data.type];
  const group = createStructureModel(data.type);
  group.position.set(data.x, 0, data.z);
  applyStructureLevel(group, data.level);
  scene.add(group);
  const inst = { data, group, def, build: animate ? 0 : -1, timer: Math.random() * 3 };
  if (animate) group.scale.setScalar(0.01); else group.scale.setScalar(group.userData.baseScale || 1);
  instances.push(inst);
  world.colliders.push({ x: data.x, z: data.z, radius: Math.max(0.4, def.radius * 0.6) });
  return inst;
}

function updateInstances(dt, t) {
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i], g = inst.group, base = g.userData.baseScale || 1;
    if (inst.build >= 0) {
      inst.build += dt / 1.4;
      const k = Math.min(1, inst.build);
      const c1 = 1.70158, c3 = c1 + 1, e = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); // easeOutBack
      g.scale.setScalar(Math.max(0.01, e * base));
      if (Math.random() < dt * 14) burst(inst.data.x + (Math.random() - 0.5) * inst.def.radius, 0.3, inst.data.z + (Math.random() - 0.5) * inst.def.radius, 0xFFD166, 2, 1, 2);
      if (k >= 1) { inst.build = -1; g.scale.setScalar(base); }
    } else if (inst.upg > 0) { // pulso de melhoria
      inst.upg -= dt;
      g.scale.setScalar(base * (1 + 0.12 * Math.sin(Math.max(0, inst.upg) / 0.6 * Math.PI)));
      if (inst.upg <= 0) g.scale.setScalar(base);
    }
    if (g.visible) animateStructure(g, t, dt);
  }
}

// ---------- Irrigadores ----------
function irrigatorPulse(inst) {
  const cfg = inst.def.irrigator, lvl = inst.data.level;
  const range = cfg.range * (1 + 0.2 * (lvl - 1));
  if (cfg.energy > 0 && state.energy < cfg.energy) return;
  const x = inst.data.x, z = inst.data.z, r2 = range * range;
  let watered = 0;
  for (let i = 0; i < state.plots.length; i++) {
    const p = state.plots[i];
    if (!p.available || !p.crop) continue;
    const dx = p.x - x, dz = p.z - z;
    if (dx * dx + dz * dz > r2) continue;
    const crop = CONFIG.crops[p.crop];
    if (p.progress >= crop.growTime || (p.water >= 3 && !p.sick)) continue;
    if (cfg.water > 0 && state.water < cfg.water) break;
    state.water -= cfg.water;
    p.water = Math.min(12, p.water + crop.waterUse * 0.9);
    p.progress = Math.min(crop.growTime, p.progress + crop.waterUse * 0.5);
    p.sick = false; p.dirty = true;
    burst(p.x, 1.3, p.z, 0x4FC3F7, 4, 1, 1.5);
    watered++;
  }
  for (let i = 0; i < state.trees.length; i++) {
    const t = state.trees[i];
    const dx = t.x - x, dz = t.z - z;
    if (dx * dx + dz * dz > r2 || t.water >= 3) continue;
    if (cfg.water > 0 && state.water < cfg.water) break;
    state.water -= cfg.water; t.water = Math.min(8, t.water + 3);
    burst(t.x, 2, t.z, 0x4FC3F7, 4, 1, 1.5);
    watered++;
  }
  if (watered > 0) {
    if (cfg.energy > 0) state.energy -= cfg.energy;
    burst(x, inst.group.userData.height * 0.8, z, 0x7FE9FF, 10, 2, 2);
    if (irrSoundT <= 0 && camera.position.distanceToSquared(inst.group.position) < 900) { play('water'); irrSoundT = 3; }
  }
}

function updateIrrigators(dt) {
  irrSoundT -= dt;
  for (let i = 0; i < irrigators.length; i++) {
    const inst = irrigators[i];
    if (inst.build >= 0) continue;
    inst.timer -= dt;
    if (inst.timer <= 0) {
      inst.timer = inst.def.irrigator.interval * (1 - 0.12 * (inst.data.level - 1));
      irrigatorPulse(inst);
    }
  }
}

// ---------- Validacao e modo construcao ----------
function canPlace(type, x, z) {
  const def = CONFIG.structures[type], r = def.radius;
  const area = world.inBuildArea(x, z, r);
  if (def.island) { if (!area.island) return 'Apenas na Ilha Cristalina'; }
  else if (!area.farm && !area.island) return 'Fora da area de construcao (area destacada)';
  for (const p of state.plots) if (Math.hypot(p.x - x, p.z - z) < r + 2.5) return 'Muito perto de um canteiro';
  for (const s of state.structures) if (Math.hypot(s.x - x, s.z - z) < r + CONFIG.structures[s.type].radius + 0.3) return 'Muito perto de outra estrutura';
  for (const t of state.trees) if (Math.hypot(t.x - x, t.z - z) < r + 1.5) return 'Muito perto de uma arvore';
  for (const o of world.fixedObstacles) if (Math.hypot(o.x - x, o.z - z) < r + o.r) return 'Muito perto da bomba ou da estacao';
  return null;
}

function structureBlock(type) {
  const def = CONFIG.structures[type];
  if (state.level < def.level) return 'Nivel ' + def.level;
  if (def.island && !state.islandUnlocked) return 'Libere a ilha';
  if ((def.minRep || 0) > reputation()) return 'Reputacao ' + def.minRep;
  if (countOf(type) >= maxCount(type)) return 'Limite atingido';
  if (state.money < def.cost) return 'Creditos insuficientes';
  if ((def.crystals || 0) > state.crystals) return 'Cristais insuficientes';
  return null;
}

function getGhost(type) {
  if (!ghosts[type]) {
    const g = createStructureModel(type);
    g.traverse(o => { if (o.isMesh) o.castShadow = false; });
    ghosts[type] = g;
  }
  return ghosts[type];
}

export function startBuild(type) {
  const why = structureBlock(type);
  if (why) { showToast(why, 'bad'); play('error'); return false; }
  cancelBuild(true);
  const g = getGhost(type);
  const def = CONFIG.structures[type];
  ghostRing.geometry = geo('ring', def.radius * 0.9, def.radius * 1.05 + 0.1, 36);
  scene.add(g, ghostRing);
  build = { type, x: 0, z: 0, reason: null };
  world.overlays.forEach(o => { o.visible = true; });
  showToast('Modo construcao: ' + def.name, 'info');
  return true;
}

function cancelBuild(silent) {
  if (!build) return;
  scene.remove(build.tree ? treeGhosts[build.tree] : ghosts[build.type], ghostRing);
  world.overlays.forEach(o => { o.visible = false; });
  build = null; setBuildHint(null);
  if (!silent) showToast('Construcao cancelada', 'info');
}

function updateBuild() {
  const isTree = !!build.tree;
  const g = isTree ? treeGhosts[build.tree] : ghosts[build.type];
  camera.getWorldDirection(dirV);
  let t = dirV.y < -0.05 ? -camera.position.y / dirV.y : 12;
  t = THREE.MathUtils.clamp(t, 3.5, 16);
  build.x = Math.round((camera.position.x + dirV.x * t) * 2) / 2;
  build.z = Math.round((camera.position.z + dirV.z * t) * 2) / 2;
  build.reason = isTree ? canPlaceTree(build.x, build.z) : canPlace(build.type, build.x, build.z);
  g.position.set(build.x, 0, build.z);
  ghostRing.position.set(build.x, 0.2, build.z);
  ghostRing.rotation.x = -Math.PI / 2;
  ghostRing.material = build.reason ? ringBad : ringOk;
  const name = isTree ? CONFIG.trees[build.tree].name + ' (' + state.saplings[build.tree] + ' muda(s))' : CONFIG.structures[build.type].name;
  setBuildHint(build.reason ? build.reason : name + ' - E ou clique para ' + (isTree ? 'plantar' : 'construir') + '  |  Q cancela');
}

function tryPlace() {
  if (!build) return;
  if (build.tree) { tryPlaceTree(); return; }
  const type = build.type, def = CONFIG.structures[type];
  if (build.reason) { showToast(build.reason, 'bad'); play('error'); return; }
  const why = structureBlock(type);
  if (why) { showToast(why, 'bad'); play('error'); cancelBuild(true); return; }
  state.money -= def.cost; state.crystals -= def.crystals || 0;
  const data = { id: state.nextStructureId++, type, x: build.x, z: build.z, level: 1 };
  state.structures.push(data);
  createInstance(data, true);
  recomputeEffects();
  state.stats.built++;
  addXp(10 + def.level * 2);
  pillar(data.x, data.z, def.kind === 'building' ? 0x4FE3C1 : 0xFF9AE0, 36);
  play('build');
  showToast(def.name + ' construido(a)', 'good');
  bus.emit('build', data);
  save();
  if (structureBlock(type)) cancelBuild(true); // decoracoes: continua enquanto der
}

function upgradeStructure(inst) {
  const s = inst.data, def = inst.def;
  if (def.kind !== 'building' || s.level >= UPG_MAX[s.type]) return;
  const cost = upgradeCost(s), cry = upgradeCrystals(s);
  if (state.money < cost || state.crystals < cry) { showToast('Recursos insuficientes', 'bad'); play('error'); return; }
  state.money -= cost; state.crystals -= cry;
  s.level++;
  applyStructureLevel(inst.group, s.level);
  inst.upg = 0.6;
  recomputeEffects();
  addXp(15);
  pillar(s.x, s.z, 0xFFD166, 30); burst(s.x, 2, s.z, 0xFFD166, 20, 3, 4);
  play('upgrade');
  showToast(def.name + ' melhorado(a) para nivel ' + s.level, 'good');
  save();
}

function openStructurePanel(inst) {
  const s = inst.data, def = inst.def;
  openModal({
    id: 'structure', title: def.name, hint: 'Pressione E ou ESC para fechar',
    build(body) {
      const items = [];
      items.push(row({
        title: def.kind === 'building' ? 'Nivel ' + s.level + ' de ' + UPG_MAX[s.type] : 'Decoracao',
        desc: def.desc + (def.effect ? '  |  Efeito: ' + def.effect(s.level) : '') + '  |  Reputacao +' + Math.round(def.rep * (1 + 0.3 * (s.level - 1))),
        tag: 'REP ' + reputation(), tagCls: 'gold'
      }));
      if (s.type === 'lab') items.push(row({ title: 'Pesquisa', desc: 'Abra a arvore de tecnologias.', buttons: [{ label: 'Abrir laboratorio', onClick: () => { openLab(); return 'keep'; } }] }));
      if (s.type === 'factory') items.push(row({ title: 'Producao', desc: 'Transforme colheitas em produtos valiosos.', buttons: [{ label: 'Abrir fabrica', onClick: () => { openFactory(); return 'keep'; } }] }));
      if (def.kind === 'building') {
        if (s.level >= UPG_MAX[s.type]) items.push(row({ title: 'Melhoria', desc: 'Nivel maximo atingido.', done: true, tag: 'MAXIMO', tagCls: 'good' }));
        else {
          const cost = upgradeCost(s), cry = upgradeCrystals(s);
          items.push(row({
            title: 'Melhorar para nivel ' + (s.level + 1), desc: 'Proximo efeito: ' + def.effect(s.level + 1),
            buttons: [{ label: 'Melhorar - ' + cost + ' CR' + (cry ? ' + ' + cry + ' cristais' : ''), disabled: state.money < cost || state.crystals < cry, onClick: () => upgradeStructure(inst) }]
          }));
        }
      }
      const list = el('div', 'list'); items.forEach(i => list.append(i)); body.append(list);
    }
  });
}

// ======================================================================
//  TERRENO
// ======================================================================
function landNext(key) {
  const def = CONFIG.land[key], lvl = state.land[key];
  if (lvl >= def.max) return null;
  return { cost: def.costs[lvl], level: def.levels[lvl] };
}

function buyLand(key) {
  const nx = landNext(key);
  if (!nx || state.money < nx.cost || state.level < nx.level) { play('error'); return; }
  state.money -= nx.cost;
  state.land[key]++;
  if (key === 'expand') {
    refreshAvailability(true);
    const gained = CONFIG.land.expand.plots[state.land.expand - 1] - CONFIG.land.expand.plots[state.land.expand - 2];
    showToast('Terreno expandido: +' + gained + ' canteiros', 'mission');
  } else if (key === 'soil') showToast('Solo fertil nivel ' + state.land.soil, 'mission');
  else showToast('Pomar ampliado: limite de ' + treeLimit() + ' arvores', 'mission');
  addXp(30); play('upgrade'); flash('research');
  save();
}

// ======================================================================
//  FABRICA, LOJA E MERCADO
// ======================================================================
function factoryBonus() { const l = buildingLevel('factory'); return 1 + 0.15 * Math.max(0, l - 1); }

function produce(key, times) {
  const p = CONFIG.products[key];
  let n = times;
  for (const k in p.from) n = Math.min(n, Math.floor(state.crops[k] / p.from[k]));
  if (n <= 0) { showToast('Ingredientes insuficientes', 'bad'); play('error'); return; }
  for (const k in p.from) state.crops[k] -= p.from[k] * n;
  state.products[key] += n;
  addXp(3 * n);
  const f = instances.find(i => i.data.type === 'factory');
  if (f) burst(f.data.x, 3.5, f.data.z, 0xFFB74D, 18, 2.5, 3);
  play('build');
  showToast('Produziu ' + n + ' ' + p.name, 'good');
}

function openFactory() {
  openModal({
    id: 'factory', title: 'Fabrica de alimentos', wide: true, hint: 'Pressione E ou ESC para fechar',
    build(body) {
      body.append(el('p', 'hint', 'Produtos valem mais que as colheitas. Valor extra da fabrica: +' + Math.round((factoryBonus() - 1) * 100) + '%.'));
      const list = el('div', 'list');
      Object.keys(CONFIG.products).forEach(key => {
        const p = CONFIG.products[key];
        const need = Object.entries(p.from).map(([k, n]) => n + ' ' + CONFIG.crops[k].name).join(', ');
        const possible = Math.min(...Object.entries(p.from).map(([k, n]) => Math.floor(state.crops[k] / n)));
        list.append(row({
          title: p.name, desc: 'Requer ' + need + '  |  Vale ' + Math.round(p.sellPrice * factoryBonus() * priceBonus()) + ' CR cada',
          color: CONFIG.crops[Object.keys(p.from)[0]].color,
          tag: 'Voce tem ' + state.products[key], tagCls: possible > 0 ? 'good' : '',
          buttons: [
            { label: 'Produzir 1', disabled: possible < 1, onClick: () => produce(key, 1) },
            { label: 'Produzir tudo (' + Math.max(0, possible) + ')', disabled: possible < 1, onClick: () => produce(key, possible) }
          ]
        }));
      });
      body.append(list);
    }
  });
}

function buySeed(k, n) {
  const c = CONFIG.crops[k], cost = c.seedCost * n;
  if (state.level < c.level || state.money < cost) { play('error'); return; }
  state.money -= cost; state.seeds[k] += n;
  play('buy'); showToast('Comprou ' + n + ' semente(s) de ' + c.name, 'good'); save();
}
function buySapling(k, n) {
  const d = CONFIG.trees[k], cost = d.saplingCost * n;
  if (state.level < d.level || state.money < cost) { play('error'); return; }
  state.money -= cost; state.saplings[k] += n;
  play('buy'); showToast('Comprou ' + n + ' muda(s) de ' + d.name + '. Selecione-a na hotbar para plantar.', 'good'); save();
}

function equipLevel(key) { return key === 'speed' ? state.speedLevel : key === 'water' ? state.maxWater / 10 : state.yieldLevel; }
function equipCost(key) { const u = CONFIG.upgrades[key]; return Math.round(u.baseCost * Math.pow(u.growth, equipLevel(key) - 1)); }
function buyEquip(key) {
  const u = CONFIG.upgrades[key], cost = equipCost(key);
  if (state.money < cost || equipLevel(key) >= u.max) { play('error'); return; }
  state.money -= cost;
  if (key === 'speed') state.speedLevel++; else if (key === 'water') { state.maxWater += 10; state.water = Math.min(state.maxWater, state.water + 10); } else state.yieldLevel++;
  addXp(12); play('upgrade'); showToast(u.name + ' melhorado(a)', 'good'); save();
}

function structureRow(type) {
  const def = CONFIG.structures[type], owned = countOf(type), max = maxCount(type);
  const why = structureBlock(type);
  const locked = state.level < def.level || (def.island && !state.islandUnlocked) || (def.minRep || 0) > reputation();
  const costTxt = def.cost + ' CR' + (def.crystals ? ' + ' + def.crystals + ' cristais' : '');
  const effTxt = def.effect ? '  |  ' + def.effect(1) : '  |  Reputacao +' + def.rep;
  return row({
    title: def.name, desc: def.desc + effTxt + '  |  Custo: ' + costTxt, locked,
    color: def.irrigator ? 0x4FC3F7 : def.kind === 'decor' ? 0xFF9AE0 : 0x4FE3C1, icon: def.irrigator ? 'IRR' : null,
    tag: state.level < def.level ? 'NIVEL ' + def.level : (def.island && !state.islandUnlocked) ? 'ILHA' : (def.minRep || 0) > reputation() ? 'REP ' + def.minRep : owned + ' / ' + max,
    tagCls: locked ? 'bad' : '',
    buttons: [{ label: 'Posicionar', disabled: !!why, onClick: () => { if (startBuild(type)) return 'close'; return 'keep'; } }]
  });
}

function openGeneralStore() {
  openShop('Loja Geral', () => {
    const seeds = CONFIG.cropOrder.map(k => {
      const c = CONFIG.crops[k], locked = state.level < c.level;
      return {
        icon: c.short, color: c.color, title: 'Semente de ' + c.name,
        desc: 'Custo ' + c.seedCost + ' CR  |  Cresce em ' + c.growTime + 's  |  Vende por ' + c.sellPrice + ' CR  |  Agua ' + c.waterUse,
        tag: locked ? 'NIVEL ' + c.level : 'Voce tem ' + state.seeds[k], tagCls: locked ? 'bad' : '', locked,
        buttons: [
          { label: 'Comprar 1', disabled: locked || state.money < c.seedCost, onClick: () => buySeed(k, 1) },
          { label: 'Comprar 5', disabled: locked || state.money < c.seedCost * 5, onClick: () => buySeed(k, 5) }
        ]
      };
    });
    const treeItems = [row({
      title: 'Pomar: ' + state.trees.length + ' / ' + treeLimit() + ' arvores', desc: 'Compre mudas, selecione-as na hotbar (Tab troca de pagina) e clique em um ponto livre da fazenda. Regue para acelerar. Cada arvore madura da varios frutos repetidamente.',
      bar: { frac: state.trees.length / treeLimit(), cls: 'gold' }
    })];
    CONFIG.treeOrder.forEach(k => {
      const d = CONFIG.trees[k], locked = state.level < d.level;
      treeItems.push({
        icon: d.short, color: d.fruitColor, title: 'Muda de ' + d.name,
        desc: 'Custo ' + d.saplingCost + ' CR  |  Amadurece em ' + d.growTime + 's  |  ate ' + d.maxFruits + ' frutos, 1 a cada ' + d.fruitEvery + 's  |  ' + d.fruit + ' vale ' + d.price + ' CR',
        tag: locked ? 'NIVEL ' + d.level : 'Voce tem ' + state.saplings[k], tagCls: locked ? 'bad' : '', locked,
        buttons: [
          { label: 'Comprar 1', disabled: locked || state.money < d.saplingCost, onClick: () => buySapling(k, 1) },
          { label: 'Comprar 3', disabled: locked || state.money < d.saplingCost * 3, onClick: () => buySapling(k, 3) }
        ]
      });
    });
    const landItems = ['expand', 'soil', 'orchard'].map(k => {
      const def = CONFIG.land[k], lvl = state.land[k], nx = landNext(k);
      const frac = k === 'expand' ? (lvl - 1) / (def.max - 1) : lvl / def.max;
      let desc = def.desc;
      if (k === 'expand') desc += '  |  Agora: ' + def.plots[lvl - 1] + ' canteiros' + (nx ? ', proximo nivel: ' + def.plots[lvl] : '');
      if (k === 'soil') desc += '  |  Agora: +' + (state.land.soil * 8) + '% de crescimento, ' + (state.land.soil * 5) + '% de colheita dupla';
      if (k === 'orchard') desc += '  |  Agora: ' + treeLimit() + ' arvores';
      const locked = !!nx && state.level < nx.level;
      return {
        icon: k === 'expand' ? 'TER' : k === 'soil' ? 'SOL' : 'POM', color: k === 'soil' ? 0x8B5E3C : 0x7ED957, title: def.name, desc: desc + (nx && locked ? '  |  Exige nivel ' + nx.level : ''),
        tag: nx ? 'Nivel ' + lvl + ' / ' + def.max : 'MAXIMO', tagCls: nx ? (locked ? 'bad' : '') : 'good', locked: locked, done: !nx,
        bar: { frac, cls: 'gold' },
        buttons: nx ? [{ label: 'Melhorar - ' + nx.cost + ' CR', disabled: locked || state.money < nx.cost, onClick: () => buyLand(k) }] : []
      };
    });
    const equip = Object.keys(CONFIG.upgrades).map(k => {
      const u = CONFIG.upgrades[k], lv = equipLevel(k), maxed = lv >= u.max, cost = equipCost(k);
      return {
        title: u.name, desc: u.desc, tag: 'Nivel ' + lv + ' / ' + u.max, tagCls: maxed ? 'good' : '', done: maxed,
        color: 0xFFD166, icon: k === 'speed' ? 'VEL' : k === 'water' ? 'AGU' : 'COL',
        buttons: maxed ? [] : [{ label: 'Melhorar - ' + cost + ' CR', disabled: state.money < cost, onClick: () => buyEquip(k) }]
      };
    });
    const droneWhy = state.level < CONFIG.drone.level ? 'Nivel ' + CONFIG.drone.level : state.drones.length >= 4 ? 'Limite atingido' : null;
    const drones = [
      {
        icon: 'DRN', color: 0x4FE3C1, title: 'Drone agricola', locked: state.level < CONFIG.drone.level,
        desc: 'Voa pela fazenda, rega, colhe plantas e arvores e busca agua sozinho. Usa a energia da fazenda. Cada novo drone custa mais.',
        tag: state.drones.length + ' / 4', tagCls: droneWhy ? 'bad' : '',
        buttons: [{ label: droneWhy || ('Comprar - ' + droneCost() + ' CR'), disabled: !!droneWhy || state.money < droneCost(), onClick: () => { buyDrone(); } }]
      },
      { title: 'Painel de drones', desc: 'Veja bateria, estado e tarefa de cada drone.', buttons: [{ label: 'Abrir painel', onClick: () => { openDronePanel(); return 'keep'; } }] }
    ];
    const keys = Object.keys(CONFIG.structures);
    return [
      { name: 'Sementes', items: seeds },
      { name: 'Arvores', items: treeItems },
      { name: 'Terreno', items: landItems },
      { name: 'Irrigacao', items: keys.filter(k => CONFIG.structures[k].irrigator).map(structureRow) },
      { name: 'Equipamento', items: equip },
      { name: 'Drones', items: drones },
      { name: 'Construcoes', items: keys.filter(k => CONFIG.structures[k].kind === 'building' && !CONFIG.structures[k].irrigator).map(structureRow) },
      { name: 'Decoracao', items: keys.filter(k => CONFIG.structures[k].kind === 'decor').map(structureRow) }
    ];
  });
}

// ---------- Mercado ----------
const storeOf = kind => (kind === 'crop' ? state.crops : kind === 'product' ? state.products : kind === 'fruit' ? state.fruits : state.mutated);
function itemPrice(kind, key) {
  if (kind === 'crop') return Math.round(CONFIG.crops[key].sellPrice * priceBonus() * sellEventMult(key));
  if (kind === 'product') return Math.round(CONFIG.products[key].sellPrice * priceBonus() * factoryBonus());
  if (kind === 'fruit') return Math.round(CONFIG.trees[key].price * priceBonus());
  if (kind === 'mut') { const [m, c] = key.split(':'); return Math.round(CONFIG.crops[c].sellPrice * CONFIG.mutations[m].mult * priceBonus() * sellEventMult(c)); }
  return Math.round(CONFIG.crystalPrice * priceBonus());
}
function itemName(kind, key) {
  if (kind === 'crop') return CONFIG.crops[key].name;
  if (kind === 'product') return CONFIG.products[key].name;
  if (kind === 'fruit') return CONFIG.trees[key].fruit;
  if (kind === 'mut') { const [m, c] = key.split(':'); return CONFIG.crops[c].name + ' ' + CONFIG.mutations[m].name; }
  return 'Cristal';
}
const haveOf = (kind, key) => (kind === 'crystal' ? state.crystals : storeOf(kind)[key] || 0);
function takeOf(kind, key, n) { if (kind === 'crystal') state.crystals -= n; else storeOf(kind)[key] -= n; }

function sellItem(kind, key, n, quiet) {
  const count = Math.min(n, haveOf(kind, key));
  if (count <= 0) return 0;
  const total = itemPrice(kind, key) * count;
  takeOf(kind, key, count);
  addMoney(total); addXp(2 + count);
  if (!quiet) { play('sell'); showToast('Vendeu ' + count + ' ' + itemName(kind, key) + ' por ' + total + ' CR', 'good'); bus.emit('sell', { count, item: key }); save(); }
  return total;
}

function marketEntries() {
  const out = [];
  CONFIG.cropOrder.forEach(k => out.push(['crop', k]));
  CONFIG.treeOrder.forEach(k => out.push(['fruit', k]));
  Object.keys(state.mutated).forEach(k => out.push(['mut', k]));
  Object.keys(CONFIG.products).forEach(k => out.push(['product', k]));
  out.push(['crystal', 'crystal']);
  return out.filter(([kind, key]) => haveOf(kind, key) > 0);
}

function sellEverything() {
  let total = 0, count = 0;
  for (const [kind, key] of marketEntries()) { const n = haveOf(kind, key); total += sellItem(kind, key, n, true); count += n; }
  if (count > 0) { play('sell'); showToast('Vendeu tudo: ' + count + ' itens por ' + total + ' CR', 'mission'); bus.emit('sell', { count, item: 'all' }); save(); }
}

function openMarket() {
  openShop('Mercado', () => {
    const entries = marketEntries();
    const items = [];
    let total = 0;
    entries.forEach(([kind, key]) => { total += itemPrice(kind, key) * haveOf(kind, key); });
    items.push(row({
      title: 'Vender tudo', desc: entries.length ? 'Vende todos os itens do estoque de uma vez.' : 'Voce nao tem nada para vender. Colha plantas e frutos!',
      tag: total + ' CR', tagCls: 'gold',
      bar: { frac: Math.min(1, entries.length ? 1 : 0), cls: 'gold', text: entries.length + ' tipos de item' },
      buttons: [{ label: 'Vender tudo', disabled: !entries.length, onClick: () => sellEverything() }]
    }));
    entries.forEach(([kind, key]) => {
      const count = haveOf(kind, key), price = itemPrice(kind, key);
      let color = 0xFFD166, extra = null;
      if (kind === 'crop') { color = CONFIG.crops[key].color; if (state.boom && state.boom.crop === key) extra = 'EM ALTA x' + state.boom.mult.toFixed(1); }
      else if (kind === 'fruit') color = CONFIG.trees[key].fruitColor;
      else if (kind === 'mut') { color = CONFIG.mutations[key.split(':')[0]].color; extra = 'MUTANTE'; }
      else if (kind === 'crystal') color = 0x59E6FF;
      items.push({
        title: itemName(kind, key), color, desc: 'Preco ' + price + ' CR cada  |  Bonus de reputacao +' + Math.round((priceBonus() - 1) * 100) + '%',
        tag: extra || 'Voce tem ' + count, tagCls: extra ? 'gold' : '',
        buttons: [
          { label: 'Vender 1', onClick: () => sellItem(kind, key, 1) },
          { label: 'Vender tudo (' + (price * count) + ' CR)', onClick: () => sellItem(kind, key, count) }
        ]
      });
    });
    const box = el('div'); buildContractsView(box, true);
    return [{ name: 'Vender', items }, { name: 'Contratos (' + state.contracts.active.length + ')', items: [box] }];
  });
}

function openContractsQuick() {
  openModal({ id: 'contracts', title: 'Contratos ativos', wide: true, hint: 'Pressione C ou ESC para fechar', build(body) { buildContractsView(body, false); } });
}

// ======================================================================
//  PICKUPS (meteorito), CRISTAIS, BOMBA, PONTE
// ======================================================================
function addPickupMesh(p) {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(geo('ico', 0.55, 1), mat(0xFF9A3C, { emissive: 0xFF6A1A, emissiveIntensity: 1.2 }));
  const halo = new THREE.Mesh(geo('sph', 0.95, 10, 8), glow(0xFFD166, 0.25));
  rock.castShadow = true; g.add(rock, halo);
  g.position.set(p.x, 0.9, p.z); scene.add(g);
  pickupMeshes.set(p.id, g);
}

function collectPickup(p) {
  state.pickups = state.pickups.filter(x => x !== p);
  const m = pickupMeshes.get(p.id); if (m) { scene.remove(m); pickupMeshes.delete(p.id); }
  const pool = CONFIG.cropOrder.filter(k => CONFIG.crops[k].level >= 3 && CONFIG.crops[k].level <= state.level + 2);
  const k = pool.length ? pool[Math.floor(Math.random() * pool.length)] : 'lettuce';
  const n = 2 + Math.floor(Math.random() * 3);
  state.seeds[k] += n; state.crystals += 1; state.rp += 3; addXp(60);
  // chance de muda rara
  const rare = CONFIG.treeOrder.filter(t => CONFIG.trees[t].level <= state.level);
  let extra = '';
  if (rare.length && Math.random() < 0.35) { const t = rare[Math.floor(Math.random() * rare.length)]; state.saplings[t]++; extra = ', 1 muda de ' + CONFIG.trees[t].name; }
  burst(p.x, 1, p.z, 0xFFD166, 36, 4, 5);
  play('mission'); flash('meteor');
  showToast('Meteorito coletado: ' + n + ' sementes de ' + CONFIG.crops[k].name + ', 1 cristal, 3 PP' + extra, 'mission');
  save();
}

function mineCrystal(node) {
  const n = 1 + (Math.random() < 0.4 ? 1 : 0);
  state.crystals += n; node.ready = false; node.timer = 90; node.mesh.visible = false;
  burst(node.x, 1.4, node.z, 0x59E6FF, 24, 3, 4);
  addXp(8); play('harvest');
  showToast('Coletou ' + n + ' cristal(is)', 'good');
}

function useWaterPump() {
  const cap = waterCap();
  if (state.water >= cap - 0.01) { showToast('Regador cheio', 'info'); return; }
  state.water = cap;
  burst(world.pumpPosition.x, 1.6, world.pumpPosition.z, 0x4FC3F7, 24, 2, 3);
  play('water'); showToast('Regador reabastecido', 'good');
}

function unlockIsland() {
  state.islandUnlocked = true;
  world.setIslandUnlocked(true);
  refreshAvailability(true);
  flash('meteor'); play('mission');
  showToast('Ilha Cristalina liberada! A ponte estelar esta se abrindo ao norte.', 'mission');
  save();
}

// ======================================================================
//  ALVO / INTERACAO
// ======================================================================
function aim(px, py, pz, r) {
  const c = camera.position;
  const vx = px - c.x, vy = py - c.y, vz = pz - c.z;
  const t = vx * dirV.x + vy * dirV.y + vz * dirV.z;
  if (t < 0) return -1;
  const cx = c.x + dirV.x * t - px, cy = c.y + dirV.y * t - py, cz = c.z + dirV.z * t - pz;
  return cx * cx + cy * cy + cz * cz < r * r ? t : -1;
}
const flat = (p, x, z) => Math.hypot(p.x - x, p.z - z);

function findTarget() {
  target.type = null; target.ref = null; target.text = '';
  camera.getWorldDirection(dirV);
  let best = Infinity;
  for (let i = 0; i < state.plots.length; i++) {
    const p = state.plots[i];
    if (!p.available) continue;
    const t = aim(p.x, 0.6, p.z, 1.9);
    if (t >= 0 && t < 6.5 && t < best) { best = t; target.type = 'plot'; target.ref = p; }
  }
  for (let i = 0; i < trees.length; i++) {
    const d = trees[i].data;
    const t = aim(d.x, 1.7, d.z, 1.6);
    if (t >= 0 && t < 7 && t < best) { best = t; target.type = 'tree'; target.ref = d; }
  }
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    if (inst.build >= 0) continue;
    const t = aim(inst.data.x, inst.group.userData.height * 0.45, inst.data.z, Math.max(0.9, inst.def.radius * 0.8 + 0.2));
    if (t >= 0 && t < 7 && t < best) { best = t; target.type = 'structure'; target.ref = inst; }
  }
  for (let i = 0; i < state.pickups.length; i++) {
    const p = state.pickups[i];
    const t = aim(p.x, 0.9, p.z, 1.4);
    if (t >= 0 && t < 7 && t < best) { best = t; target.type = 'pickup'; target.ref = p; }
  }
  if (state.islandUnlocked) for (let i = 0; i < world.crystalNodes.length; i++) {
    const n = world.crystalNodes[i];
    if (!n.ready) continue;
    const t = aim(n.x, 1.2, n.z, 1.8);
    if (t >= 0 && t < 6.5 && t < best) { best = t; target.type = 'crystal'; target.ref = n; }
  }
  if (target.type) return;
  const c = camera.position;
  if (flat(c, world.shopPosition.x, world.shopPosition.z) < 5.5) target.type = 'shop';
  else if (flat(c, world.marketPosition.x, world.marketPosition.z) < 5.5) target.type = 'market';
  else if (flat(c, world.pumpPosition.x, world.pumpPosition.z) < 3.4) target.type = 'pump';
  else if (flat(c, world.stationPosition.x, world.stationPosition.z) < 5) target.type = 'station';
  else if (!state.islandUnlocked && flat(c, world.gatePosition.x, world.gatePosition.z) < 8) target.type = 'gate';
}

function promptFor() {
  switch (target.type) {
    case 'plot': {
      const p = target.ref;
      if (!p.crop) {
        const s = HOTBAR[state.selectedSlot];
        return s.type === 'seed' ? 'E - Plantar ' + CONFIG.crops[s.crop].name : 'Selecione uma semente';
      }
      const c = CONFIG.crops[p.crop], mut = p.mutation ? ' ' + mutationName(p.mutation) : '';
      if (p.progress >= c.growTime) return 'E - Colher ' + c.name + mut;
      return (p.sick ? 'E - Curar e regar ' : 'E - Regar ') + c.name + mut + ' (' + Math.floor(p.progress / c.growTime * 100) + '%)';
    }
    case 'tree': {
      const d = target.ref, def = CONFIG.trees[d.type];
      if (d.progress < def.growTime) return 'E - Regar ' + def.name + ' (' + Math.floor(d.progress / def.growTime * 100) + '%)';
      return d.fruits > 0 ? 'E - Colher ' + d.fruits + ' ' + def.fruit : 'E - Regar ' + def.name + ' (proximo fruto em ' + Math.max(0, Math.ceil(def.fruitEvery - d.fruitT)) + 's)';
    }
    case 'structure': return 'E - ' + target.ref.def.name + (target.ref.def.kind === 'building' ? ' (nivel ' + target.ref.data.level + ')' : '');
    case 'pickup': return 'E - Coletar meteorito de sementes';
    case 'crystal': return 'E - Coletar cristal';
    case 'shop': return 'E - Abrir Loja Geral';
    case 'market': return 'E - Abrir Mercado';
    case 'pump': return 'E - Encher regador';
    case 'station': return 'E - Painel de drones';
    case 'gate': return 'Ponte bloqueada - nivel ' + CONFIG.islandLevel;
    default: return '';
  }
}

function interact() {
  if (!target.type) return;
  const r = target.ref;
  switch (target.type) {
    case 'plot': interactPlot(r); break;
    case 'tree': if (r.fruits > 0) harvestTree(r, false); else if (!waterTree(r, false)) { if (r.water >= 6) showToast('A arvore ja esta bem regada', 'info'); else { showToast('Sem agua no regador. Use a bomba de agua.', 'bad'); play('error'); } } break;
    case 'structure': openStructurePanel(r); break;
    case 'pickup': collectPickup(r); break;
    case 'crystal': mineCrystal(r); break;
    case 'shop': openGeneralStore(); break;
    case 'market': openMarket(); break;
    case 'pump': useWaterPump(); break;
    case 'station': openDronePanel(); break;
    case 'gate': showToast('Alcance o nivel ' + CONFIG.islandLevel + ' para liberar a Ilha Cristalina (nivel atual ' + state.level + ')', 'info'); play('error'); break;
    default: break;
  }
}

const CLOSE_ON_E = ['shop', 'research', 'drones', 'factory', 'structure', 'contracts', 'inventory'];

function bindInteraction() {
  addEventListener('keydown', e => {
    if (state.mode !== 'play' || e.repeat) return;
    const open = isModalOpen();
    if (e.code === 'KeyE') {
      if (open) { if (CLOSE_ON_E.includes(modalId())) closeModal(); return; }
      if (state.paused || isResumeVisible()) return;
      if (build) tryPlace(); else interact();
    } else if (e.code === 'KeyI') {
      if (!open || modalId() === 'inventory') toggleInventory();
    } else if (e.code === 'KeyG') {
      if (open && modalId() === 'drones') closeModal(); else if (!open && !isResumeVisible()) openDronePanel();
    } else if (e.code === 'KeyC') {
      if (open && modalId() === 'contracts') closeModal(); else if (!open && !isResumeVisible()) openContractsQuick();
    } else if (e.code === 'KeyQ') {
      if (build) { if (build.tree) { selectSlot(2); treeSkip = null; } cancelBuild(); }
    } else if (e.code === 'KeyP') {
      if (!open) openPauseMenu();
    }
  });
  addEventListener('mousedown', e => {
    if (e.button !== 0 || state.mode !== 'play' || isModalOpen() || state.paused || !document.pointerLockElement) return;
    if (build) tryPlace(); else interact();
  });
}

// ======================================================================
//  VISITANTES
// ======================================================================
function createVisitors() {
  const cols = [0xFF6FA5, 0x59E6FF, 0xFFD166, 0xB26BFF, 0x7ED957, 0xFF9A3C];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(geo('cyl', 0.22, 0.28, 0.95, 7), mat(cols[i])); body.position.y = 0.55;
    const head = new THREE.Mesh(geo('sph', 0.21, 8, 6), mat(0xF2C9A0)); head.position.y = 1.25;
    const pack = new THREE.Mesh(geo('box', 0.3, 0.4, 0.14), mat(0x3D4A5C)); pack.position.set(0, 0.65, -0.26);
    g.add(body, head, pack); g.visible = false; scene.add(g);
    visitors.push({ group: g, target: new THREE.Vector3(), wait: 0, active: false, atStruct: false, phase: Math.random() * 6 });
  }
}

function pickVisitorTarget(v) {
  const spots = state.structures.length + state.trees.length;
  if (spots && Math.random() < 0.7) {
    const k = Math.floor(Math.random() * spots);
    const o = k < state.structures.length ? state.structures[k] : state.trees[k - state.structures.length];
    const rad = (k < state.structures.length ? CONFIG.structures[o.type].radius : 1) + 1.4;
    const a = Math.random() * Math.PI * 2;
    v.target.set(o.x + Math.cos(a) * rad, 0, o.z + Math.sin(a) * rad); v.atStruct = true;
  } else {
    for (let k = 0; k < 8; k++) {
      const x = -58 + Math.random() * 46, z = -2 + Math.random() * 14;
      if (Math.hypot(x + 36, z - 5) < 3.5 || Math.hypot(x + 22, z - 6) < 5) continue;
      v.target.set(x, 0, z); break;
    }
    v.atStruct = false;
  }
}

function updateVisitors(dt, t) {
  const want = Math.min(visitors.length, Math.floor(reputation() / 20));
  tipTimer -= dt;
  for (let i = 0; i < visitors.length; i++) {
    const v = visitors[i], g = v.group;
    if (i >= want) { if (v.active) { v.active = false; g.visible = false; } continue; }
    if (!v.active) { v.active = true; g.visible = true; g.position.set(-9, 0, 14 + i); pickVisitorTarget(v); v.wait = 0; }
    if (v.wait > 0) { v.wait -= dt; g.position.y = 0; continue; }
    tmpV.set(v.target.x - g.position.x, 0, v.target.z - g.position.z);
    const d = tmpV.length();
    if (d < 0.5) {
      v.wait = 3 + Math.random() * 4;
      if (v.atStruct && tipTimer <= 0 && !state.paused) {
        const tip = Math.round(3 + reputation() * 0.12);
        addMoney(tip); state.visitors++; tipTimer = 25;
        burst(g.position.x, 1.8, g.position.z, 0xFFD166, 8, 1, 2);
        showToast('Visitante elogiou a fazenda: +' + tip + ' CR', 'good');
      }
      pickVisitorTarget(v);
    } else {
      tmpV.multiplyScalar(1.7 * dt / d);
      g.position.x += tmpV.x; g.position.z += tmpV.z;
      g.rotation.y = Math.atan2(tmpV.x, tmpV.z);
      g.position.y = Math.abs(Math.sin(t * 7 + v.phase)) * 0.06;
    }
  }
}

// ======================================================================
//  RECURSOS, DIA/NOITE, CULLING
// ======================================================================
function updateResources(dt, day) {
  const cap = waterCap();
  const gain = fx.rain + rainWaterGain();
  if (gain > 0 && state.water < cap) state.water = Math.min(cap, state.water + gain * dt);
  if (state.water > cap) state.water = Math.max(cap, state.water - dt * 0.5);
  const gen = (0.2 + 0.5 * day) * researchEnergy() * energyEventMult() + fx.reactor;
  const me = maxEnergy();
  state.energy = Math.min(me, state.energy + gen * dt);
  if (state.energy > me) state.energy = me;
}

function updateDayNight(dt) {
  state.time += dt / CONFIG.dayLength * 24;
  if (state.time >= 24) {
    state.time -= 24; state.day++; state.stats.days = state.day;
    bus.emit('dayStart', state.day);
    showToast('Novo dia: dia ' + state.day, 'info');
  }
  const ang = state.time / 24 * Math.PI * 2;
  const day = Math.max(0, Math.sin(ang - Math.PI / 2));
  const wv = weatherVisual;
  const c = camera.position;
  world.sun.intensity = (0.4 + day * 2) * wv.light;
  world.sun.position.set(c.x + Math.cos(ang) * 40, 25 + day * 25, c.z + Math.sin(ang) * 40);
  world.sun.target.position.set(c.x, 0, c.z); world.sun.target.updateMatrixWorld();
  world.hemi.intensity = 0.4 + 0.7 * day;
  scene.background.lerpColors(NIGHT, DAYC, day);
  if (wv.amount > 0.01) scene.background.lerp(bgTmp.copy(wv.color).multiplyScalar(0.4 + 0.6 * day), wv.amount);
  scene.fog.color.copy(scene.background);
  updateScenery(dt, clock, ang, camera, world.sun, wv, eventActive('rainbow'), rainLevel());
  world.stars.material.opacity = THREE.MathUtils.clamp(1 - day * 2.2, 0, 1);
  return day;
}

// Oculta canteiros, arvores e estruturas distantes (menos desenho por quadro)
function cullFar() {
  const c = camera.position, lim = SPAWN_CULL * SPAWN_CULL;
  for (let i = 0; i < state.plots.length; i++) {
    const p = state.plots[i];
    if (!p.available) continue;
    const dx = p.x - c.x, dz = p.z - c.z;
    p.group.visible = dx * dx + dz * dz < lim;
  }
  for (let i = 0; i < trees.length; i++) { const d = trees[i].data, dx = d.x - c.x, dz = d.z - c.z; trees[i].group.visible = dx * dx + dz * dz < lim; }
  for (let i = 0; i < instances.length; i++) { const d = instances[i].data, dx = d.x - c.x, dz = d.z - c.z; instances[i].group.visible = dx * dx + dz * dz < lim * 1.4; }
}

// ======================================================================
//  INICIALIZACAO E LOOP
// ======================================================================
export function initGame(sceneRef, cameraRef, worldRef) {
  scene = sceneRef; camera = cameraRef; world = worldRef;
  plotGroup = new THREE.Group(); scene.add(plotGroup);
  initEffects(scene, camera);

  ringOk = new THREE.MeshBasicMaterial({ color: 0x4FE3C1, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  ringBad = new THREE.MeshBasicMaterial({ color: 0xFF5470, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  ghostRing = new THREE.Mesh(geo('ring', 1, 1.2, 32), ringOk);

  // Canteiros (um por slot) e restauracao do save, casando por id ou posicao
  world.plotSlots.forEach(createPlot);
  for (const d of state.savedPlots || []) {
    const p = state.plots.find(q => (d.id && q.id === d.id) || (Math.abs(q.x - d.x) < 0.1 && Math.abs(q.z - d.z) < 0.1));
    if (!p) continue;
    p.crop = CONFIG.crops[d.crop] ? d.crop : null; p.progress = d.progress || 0; p.water = d.water || 0; p.sick = !!d.sick;
    p.mutation = p.crop && CONFIG.mutations[d.mutation] ? d.mutation : null;
    p.lastCrop = p.crop || d.lastCrop || null; p.dirty = true;
  }
  state.savedPlots = [];
  world.setIslandUnlocked(state.islandUnlocked, true);
  refreshAvailability(false);

  state.structures = state.structures.filter(s => CONFIG.structures[s.type]);
  state.structures.forEach(s => createInstance(s, false));
  state.trees = state.trees.filter(t => CONFIG.trees[t.type]);
  state.trees.forEach(t => createTreeInstance(t, false));
  recomputeEffects();
  state.pickups.forEach(addPickupMesh);
  bus.on('meteorLanded', ({ x, z }) => {
    const p = { id: state.nextPickupId++, x, z, kind: 'seedpod' };
    state.pickups.push(p); addPickupMesh(p);
  });

  createVisitors();
  api = {
    get plots() { return state.plots; },
    get trees() { return state.trees; },
    plantPlot, waterPlot, harvestPlot, harvestTree, waterTree,
    // Drones reabastecem o regador na bomba (ate 60% da capacidade; a bomba manual enche tudo)
    refillWater() {
      const cap = waterCap();
      if (state.water >= cap * 0.5) return false;
      state.water = Math.max(state.water, cap * 0.6);
      burst(world.pumpPosition.x, 1.6, world.pumpPosition.z, 0x4FC3F7, 12, 1.5, 2.5);
      return true;
    }
  };
  initResearch(); initMissions(); initEvents();
  initScenery(scene, camera, world);
  initDrones(scene, api, world);
  bindInteraction();
  cullFar();
  return api;
}

export function updateGame(dt) {
  clock += dt;
  if (state.mode !== 'play') { world.update(dt); updateEffects(dt); return; }
  if (state.paused || isResumeVisible()) { setPrompt(''); updateEffects(dt); world.update(dt); return; }

  state.stats.play += dt;
  const day = updateDayNight(dt);
  updateEvents(dt); updateContracts(dt); updateResearch(dt);
  updateResources(dt, day);
  updatePlots(dt, clock);
  updateTrees(dt, clock);
  updateIrrigators(dt);
  updateInstances(dt, clock);
  updateDrones(dt, camera, clock);
  updateVisitors(dt, clock);
  updateEffects(dt);
  world.update(dt);

  if (!state.islandUnlocked && state.level >= CONFIG.islandLevel) unlockIsland();
  if ((availTimer -= dt) <= 0) { availTimer = 1; if (state.research.towers) refreshAvailability(true); }
  if ((cullTimer -= dt) <= 0) { cullTimer = 0.5; cullFar(); }

  // Selecionar uma muda na hotbar entra automaticamente no modo de plantio
  const slot = HOTBAR[state.selectedSlot];
  if (slot && slot.type === 'sapling') {
    const want = state.saplings[slot.tree] > 0 ? slot.tree : null;
    if (want && (!build || build.tree !== want) && treeSkip !== want) { if (!startTreeBuild(want)) treeSkip = want; }
    else if (!want && build && build.tree) cancelBuild(true);
    else if (!want && treeSkip !== slot.tree) { treeSkip = slot.tree; showToast('Sem mudas de ' + CONFIG.trees[slot.tree].name + '. Compre na Loja Geral.', 'bad'); }
  } else { treeSkip = null; if (build && build.tree) cancelBuild(true); }

  if (build) { updateBuild(); setPrompt(''); }
  else { findTarget(); setPrompt(promptFor()); }

  if ((zoneTimer -= dt) <= 0) {
    zoneTimer = 0.4;
    state.zone = world.zoneAt(camera.position.x, camera.position.z);
    if (state.zone === 'ILHA CRISTALINA' && !state.islandVisited) {
      state.islandVisited = true; state.stats.island = 1; bus.emit('island');
      showToast('Bem-vindo a Ilha Cristalina! Colete cristais e plante nos canteiros roxos.', 'mission'); play('mission');
    }
  }
  if ((achTimer -= dt) <= 0) { achTimer = 2; updateAchievements(); }
  if ((hudTimer -= dt) <= 0) { hudTimer = 0.25; updateHUD(); }
  if ((saveTimer -= dt) <= 0) { saveTimer = 8; save(); }
}

// Exposto para main.js
export function getSun() { return world.sun; }
