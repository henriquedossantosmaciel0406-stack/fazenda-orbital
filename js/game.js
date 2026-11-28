import {workField} from './field-abilities.js';
import { cooperativeRows } from './prestige.js';
import {CANS,canLevel,canEfficiency} from './gear.js';
import {companion} from './actors.js';
import {createWateringCan} from './watering-can.js';
import { initWater, updateWater, waterJet } from './water.js';
import { fillCrop, fillTree, varySpecimen } from './botany.js';
// Orquestrador do jogo: canteiros, mutacoes, arvores, terreno, irrigadores, interacao, lojas, mercado,
// construcao, recursos, dia/noite e visitantes. Os sistemas (drones, pesquisa, contratos, eventos)
// recebem apenas as APIs necessarias, sem importacao circular.
import * as THREE from 'three';
import {
  state, bus, HOTBAR, save, addXp, addMoney, reputation, priceBonus, stockFree, waterCap, maxEnergy, perk, cropUnlocked,
  buildingLevel, eventActive, hasResearch, soilGrowth, soilDouble, treeLimit, mutKey
} from './state.js';
import { CONFIG, growthCredit, seedRarity } from './config.js';
import {
  showToast, updateHUD, setPrompt, setBuildHint, openShop, openModal, closeModal, isModalOpen, modalId,
  toggleInventory, petRows, row, el, flash, selectSlot, isResumeVisible, openPauseMenu
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
let wateringCan, myPet;
const ghosts = {}, treeGhosts = {};
let ghostRing, ringOk, ringBad;
const pickupMeshes = new Map();
let irrSoundT = 0, treeSkip = null;
let clock = 0, hudTimer = 0, saveTimer = 0, achTimer = 0, zoneTimer = 0, availTimer = 0, cullTimer = 0;

// temporarios reutilizados (sem alocar no loop)
const dirV = new THREE.Vector3(), tmpV = new THREE.Vector3();
const bgTmp = new THREE.Color();
const target = { type: null, ref: null, text: '' };

// ======================================================================
//  MUTACOES
// ======================================================================
function rollMutation() {
  const mult = (hasResearch('genetics') ? 1.7 : 1) * (1 + .12 * perk('mut')) * (eventActive('pollen') ? 1.35 : 1);
  for (const k of CONFIG.mutationOrder) {
    const m = CONFIG.mutations[k];
    const favored=(k==='rime'&&eventActive('frostfront'))||(k==='geode'&&eventActive('vortex'));
    if (state.level >= m.level && Math.random() < m.chance * mult * (favored?3:1)) return k;
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
      for (let i=0;i<5;i++) {
        const ridge=new THREE.Mesh(geo('cyl',0.065,0.065,2.96,6),mat(kind==='island'?0x77659C:0x956143));
        ridge.rotation.x=Math.PI/2;ridge.position.set((i-2)*0.61,0.39,0);tmp.add(ridge);
      }
      if (kind === 'tower') {
        const post = geo('cyl', 0.08, 0.1, 2.2, 6), pm = mat(0xC9D8E4, { metalness: 0.4 });
        [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]].forEach(([px, pz]) => { const p = new THREE.Mesh(post, pm); p.position.set(px, 1.1, pz); tmp.add(p); });
        for(const side of [-1,1]) for(const axis of ['x','z']) {const bar=new THREE.Mesh(geo('box',3.5,0.09,0.09),mat(0x4FE3C1));bar.position.y=2.2;bar.position[axis]=side*1.7;if(axis==='x')bar.rotation.y=Math.PI/2;tmp.add(bar);}
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
// Malha de uma planta num estagio (usada tambem para mostrar plantas de outros jogadores)
export function cropGeometry(key, g, mutKey, sick = false) {
  const ready = g >= 1;
  const sk = key + ':' + Math.min(5, Math.floor(g * 5)) + (ready ? 'r' : '') + (sick ? 's' : '') + (mutKey ? ':' + mutKey : '');
  return cachedMerged('crop:' + sk, tmp => fillCrop(tmp, key, ready ? 1 : Math.floor(g*5)/5+0.06, ready, sick, mutKey ? CONFIG.mutations[mutKey] : null));
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
  const geom = cropGeometry(plot.crop,g,plot.mutation,sick);
  if (geom) {
    if (!geom.boundingBox) geom.computeBoundingBox();
    plot.top = geom.boundingBox.max.y;
    const m = new THREE.Mesh(geom, vcMat); varySpecimen(m,plot.x,plot.z); P.add(m); addOutline(m);
  }
  P.scale.setScalar(plot.mutation === 'giant' ? 1.3 : 1);
  if (mut) { // brilho orbitando a planta mutante
    plot.aura = new THREE.Mesh(geo('oct', 0.1, 0), glow(mut.color)); P.add(plot.aura);
  }
  if (ready && !sick) { plot.glowMesh = new THREE.Mesh(geo('sph', 0.17, 10, 8), glow(0xFFD166)); plot.glowMesh.position.y = plot.top + 0.35; P.add(plot.glowMesh); }
}

// ---------- Acoes de canteiro (usadas pelo jogador e pelos drones) ----------
function plantPlot(plot, cropKey, byDrone) {
  if (!cropKey || plot.crop || state.seeds[cropKey] <= 0 || !cropUnlocked(CONFIG.crops[cropKey])) return false;
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
  plot.water = Math.min(12, plot.water + used*(byDrone?1:canEfficiency(state)));
  plot.progress = Math.min(crop.growTime, plot.progress + growthCredit(plot,used * 2));
  const wasSick = plot.sick;
  plot.sick = false; plot.dirty = true;
  if (!byDrone) {
    if(HOTBAR[state.selectedSlot]?.type!=='can')selectSlot(2);
    const tip = wateringCan.pour();
    waterJet(tip.x,tip.y,tip.z,plot.x,0.55,plot.z);
  } else burst(plot.x,1.3,plot.z,0x4FC3F7,6,1.2,1.5);
  if (!byDrone) { play('water'); showToast(wasSick ? 'Planta curada e regada' : 'Regou a plantacao', wasSick ? 'good' : 'info'); }
  else if (wasSick) showToast('Um drone curou uma planta doente', 'good');
  return true;
}

function harvestPlot(plot, byDrone) {
  if (!plot.crop) return false;
  const crop = CONFIG.crops[plot.crop];
  if (plot.progress < crop.growTime) return false;
  const free = Math.floor(stockFree());
  if (free <= 0) {
    if (!byDrone) { showToast('Estoque cheio. Venda no Mercado ou construa um Silo.', 'bad'); play('error'); }
    return false;
  }
  const mutKeyName = plot.mutation, mut = mutKeyName ? CONFIG.mutations[mutKeyName] : null;
  let amount = state.yieldLevel * (mut ? mut.yield : 1) * (1 + 0.1 * perk('yield'));
  if (hasResearch('organic') && Math.random() < 0.3) amount *= 2;
  if (Math.random() < soilDouble()) amount *= 2;
  const whole=Math.floor(amount);
  amount=Math.min(whole+(Math.random()<amount-whole?1:0),free);
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
    if (!cropUnlocked(c)) { showToast(c.name + (c.prestige && state.prestige.rank < c.prestige ? ' exige prestigio ' + c.prestige : ' exige nivel ' + c.level), 'bad'); play('error'); return; }
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
  const gm = researchGrowth() * growthEventMult() * soilGrowth() * (1 + 0.06 * perk('growth')), evap = evaporationMult();
  for (let i = 0; i < state.plots.length; i++) {
    const p = state.plots[i];
    if (!p.available) continue;
    if (p.crop) {
      const crop = CONFIG.crops[p.crop];
      p.water = Math.max(0, p.water - 0.04 * evap * dt);
      if (irrigation && p.water < 1.5) p.water = 1.5;
      if (p.progress < crop.growTime) p.progress = Math.min(crop.growTime, p.progress + growthCredit(p,dt * (crop.growthAt?.(state.time,p.water)??1) * (0.35 + p.water * 0.08) * gm * (p.sick ? 0.4 : 1)));
      const gg = p.progress / crop.growTime;
      const key = p.crop + ':' + Math.min(5, Math.floor(gg * 5)) + (gg >= 1 ? 'r' : '') + (p.sick ? 's' : '') + (p.mutation ? ':' + p.mutation : '');
      if (p.dirty || key !== p.stageKey) { p.stageKey = key; p.dirty = false; buildCrop(p); }
      p.plant.rotation.z = Math.sin(t*1.45+i*2.4)*0.024;
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
const treeStage = (d, data) => Math.min(5, Math.floor(data.progress / d.growTime * 5));
function buildTree(inst) {
  const d = CONFIG.trees[inst.data.type], data = inst.data;
  const g = Math.min(1, data.progress / d.growTime);
  inst.group.clear();
  const geom = cachedMerged('tree:' + inst.stageKey, tmp => fillTree(tmp, data.type, g >= 1 ? 1 : Math.floor(g * 5) / 5 + 0.1, data.fruits));
  if (geom) { const m = new THREE.Mesh(geom, vcMat); m.castShadow = true; m.receiveShadow = true; varySpecimen(m,data.x,data.z); inst.group.add(m); addOutline(m); }
}

function createTreeInstance(data, animate) {
  data.fruits=Math.min(CONFIG.trees[data.type].maxFruits,Math.max(0,Math.ceil(data.fruits||0)));
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
  const free = Math.floor(stockFree());
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
  state.water -= used; tree.water = Math.min(8, tree.water + used * 2.5*(byDrone?1:canEfficiency(state)));
  if (!byDrone) {
    if(HOTBAR[state.selectedSlot]?.type!=='can')selectSlot(2);
    const tip = wateringCan.pour();
    waterJet(tip.x,tip.y,tip.z,tree.x,0.55,tree.z);
  } else burst(tree.x,1.3,tree.z,0x4FC3F7,6,1.2,1.5);
  if (!byDrone) { play('water'); showToast('Regou ' + CONFIG.trees[tree.type].name, 'info'); }
  return true;
}

function updateTrees(dt, t) {
  const gm = researchGrowth() * growthEventMult() * soilGrowth();
  const pomo = (hasResearch('pomology') ? 1.3 : 1)*(1+.12*perk('pomar'));
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
  const nozzle = { sprinkler: 1.45, rotary: 2.7, cloud: 4.1, drip: 0.8 }[inst.data.type] * inst.group.scale.y;
  function spray(tx, ty, tz) {
    waterJet(x,nozzle,z,tx,ty,tz,inst.data.type);
    bus.emit('irrigate', {x,y:nozzle,z,tx,ty,tz,type:inst.data.type});
  }
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
    p.progress = Math.min(crop.growTime, p.progress + growthCredit(p,crop.waterUse * 0.5));
    p.sick = false; p.dirty = true;
    spray(p.x, 0.65, p.z);
    watered++;
  }
  for (let i = 0; i < state.trees.length; i++) {
    const t = state.trees[i];
    const dx = t.x - x, dz = t.z - z;
    if (dx * dx + dz * dz > r2 || t.water >= 3) continue;
    if (cfg.water > 0 && state.water < cfg.water) break;
    state.water -= cfg.water; t.water = Math.min(8, t.water + 3);
    spray(t.x, 0.35, t.z);
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
  bus.emit('craft', { key });
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
  if ((c.planet && Date.now()>=state.merchantUntil) || !cropUnlocked(c) || state.money < cost) { play('error'); return; }
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
  if ((key==='water' && state.prestige.rank<(CANS[canLevel(state)]?.rank||0)) || state.money < cost || equipLevel(key) >= u.max) { play('error'); return; }
  state.money -= cost;
  if (key === 'speed') state.speedLevel++; else if (key === 'water') { state.maxWater += 10; state.water = Math.min(state.maxWater, state.water + 10); } else state.yieldLevel++;
  addXp(12); play('upgrade'); showToast(key==='water' ? CANS[canLevel(state)-1].name+' equipado' : u.name+' melhorado(a)', 'good'); save();
}

function structureRow(type) {
  const def = CONFIG.structures[type], owned = countOf(type), max = maxCount(type);
  const why = structureBlock(type);
  const locked = state.level < def.level || (def.island && !state.islandUnlocked) || (def.minRep || 0) > reputation();
  const costTxt = def.cost + ' CR' + (def.crystals ? ' + ' + def.crystals + ' cristais' : '');
  const effTxt = def.effect ? '  |  ' + def.effect(1) : '  |  Reputacao +' + def.rep;
  return row({
    thumb:type,title: def.name, desc: def.desc + effTxt + '  |  Custo: ' + costTxt, locked,
    color: def.irrigator ? 0x4FC3F7 : def.kind === 'decor' ? 0xFF9AE0 : 0x4FE3C1, icon: def.irrigator ? 'IRR' : null,
    tag: state.level < def.level ? 'NIVEL ' + def.level : (def.island && !state.islandUnlocked) ? 'ILHA' : (def.minRep || 0) > reputation() ? 'REP ' + def.minRep : owned + ' / ' + max,
    tagCls: locked ? 'bad' : '',
    buttons: [{ label: 'Posicionar', disabled: !!why, onClick: () => { if (startBuild(type)) return 'close'; return 'keep'; } }]
  });
}

function openGeneralStore() {
  openShop('Loja Geral', () => {
    const seeds = CONFIG.cropOrder.filter(k=>!CONFIG.crops[k].planet).map(k => {
      const c = CONFIG.crops[k], locked = !cropUnlocked(c);
      return {
        thumb:k, color: c.color, title: 'Semente de ' + c.name,
        species: c.species || {lettuce:'Folhas em roseta',strawberry:'Fruto com aquênios',carrot:'Raiz de reserva',corn:'Espiga de cereal',tomato:'Fruto de solanácea',mushroom:'Fungo de chapéu',grape:'Bagas em cacho',flower:'Floração ornamental',pumpkin:'Fruto de rama',melon:'Fruto de rama',pepper:'Fruto de solanácea',lotus:'Flor aquática',radish:'Raiz arredondada',okra:'Vagem estriada',pineapple:'Fruto de coroa'}[k],
        growing: [['Raridade',seedRarity(c)],['Colheita',c.growTime+' s'],['Água',c.waterUse],['Venda',c.sellPrice+' CR']],
        desc: (c.trait?c.trait+' ':'')+'Pacote de sementes · '+c.seedCost+' CR por unidade',
        tag: locked ? (state.prestige.rank < (c.prestige || 0) ? 'PRESTIGIO ' + c.prestige : 'NIVEL ' + c.level) : 'Voce tem ' + state.seeds[k], tagCls: locked ? 'bad' : '', locked,
        buttons: [
          { label: 'Comprar 1', disabled: locked || state.money < c.seedCost, onClick: () => buySeed(k, 1) },
          { label: 'Comprar 5', disabled: locked || state.money < c.seedCost * 5, onClick: () => buySeed(k, 5) }
        ]
      };
    });
    const treeItems = [row({
      title: 'Pomar: ' + state.trees.length + ' árvores', desc: 'Compre mudas, selecione-as na hotbar (Tab troca de pagina) e clique em um ponto livre da fazenda. Regue para acelerar. Cada arvore madura da varios frutos repetidamente.',

    })];
    CONFIG.treeOrder.forEach(k => {
      const d = CONFIG.trees[k], locked = state.level < d.level;
      treeItems.push({
        thumb:k, color: d.fruitColor, title: 'Muda de ' + d.name,
        desc: 'Custo ' + d.saplingCost + ' CR  |  Amadurece em ' + d.growTime + 's  |  ate ' + d.maxFruits + ' frutos, 1 a cada ' + d.fruitEvery + 's  |  ' + d.fruit + ' vale ' + d.price + ' CR',
        tag: locked ? 'NIVEL ' + d.level : 'Voce tem ' + state.saplings[k], tagCls: locked ? 'bad' : '', locked,
        buttons: [
          { label: 'Comprar 1', disabled: locked || state.money < d.saplingCost, onClick: () => buySapling(k, 1) },
          { label: 'Comprar 3', disabled: locked || state.money < d.saplingCost * 3, onClick: () => buySapling(k, 3) }
        ]
      });
    });
    const landItems = ['expand', 'soil'].map(k => {
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
    const equip = Object.keys(CONFIG.upgrades).filter(k=>k!=='water').map(k => {
      const u = CONFIG.upgrades[k], lv = equipLevel(k), maxed = lv >= u.max, cost = equipCost(k);
      return {
        title: u.name, desc: u.desc, tag: 'Nivel ' + lv + ' / ' + u.max, tagCls: maxed ? 'good' : '', done: maxed,
        color: 0xFFD166, icon: k === 'speed' ? 'VEL' : k === 'water' ? 'AGU' : 'COL',
        buttons: maxed ? [] : [{ label: 'Melhorar - ' + cost + ' CR', disabled: state.money < cost, onClick: () => buyEquip(k) }]
      };
    });
    for(const [key,tool] of Object.entries(CONFIG.tools)){
      const level=state.tools[key],cost=tool.cost*(level+1),locked=state.prestige.rank<tool.rank;
      equip.push({thumb:key,title:tool.name,desc:tool.desc,tag:locked?'PRESTÍGIO '+tool.rank:'Nível '+level+' / '+tool.max,
        buttons:level===tool.max?[]:[{label:'Instalar · '+cost+' CR',disabled:locked||state.money<cost,onClick:()=>{
          if(locked||state.tools[key]!==level||state.money<cost)return;
          state.money-=cost;state.tools[key]++;play('upgrade');save();
        }}]});
    }
    const cl=canLevel(state),canCost=equipCost('water');
    const cans=CANS.map((can,i)=>{
      const next=i===cl,owned=i<cl,locked=state.prestige.rank<(can.rank||0);
      return {thumb:'can-'+(i+1),title:can.name,desc:((i+1)*10)+' de capacidade · '+(100+i*25)+'% de rega por unidade de água',
        tag:i===cl-1?'EQUIPADO':owned?'ADQUIRIDO':locked?'PRESTÍGIO '+can.rank:next?'DISPONÍVEL':'REQUER '+CANS[i-1].name.toUpperCase(),
        buttons:next?[{label:'Comprar · '+canCost+' CR',disabled:locked||state.money<canCost,onClick:()=>buyEquip('water')}]:[]};
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
      { name: 'Árvores', items: treeItems },
      { name: 'Regadores', items:cans },
      { name: 'Cooperativa', items: cooperativeRows() },
      { name:'Pets',items:petRows(true) },
      { name: 'Terreno', items: landItems },
      { name: 'Irrigação', items: keys.filter(k => CONFIG.structures[k].irrigator).map(structureRow) },
      { name: 'Equipamento', items: equip },
      { name: 'Drones', items: drones },
      { name: 'Construções', items: keys.filter(k => CONFIG.structures[k].kind === 'building' && !CONFIG.structures[k].irrigator).map(structureRow) },
      { name: 'Decoração', items: keys.filter(k => CONFIG.structures[k].kind === 'decor').map(structureRow) }
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
      title: 'Caixa da colheita', desc: entries.length ? 'Venda o estoque inteiro em uma troca.' : 'Estoque vazio. Colha plantas ou frutos para vender aqui.',
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
        thumb:kind==='mut'?key.split(':')[1]:kind==='crystal'?'crystal':key,title: itemName(kind, key), color, desc: price + ' CR por unidade · '+count+' em estoque',
        tag: extra || 'Reputação +' + Math.round((priceBonus() - 1) * 100) + '%', tagCls: extra ? 'gold' : '',
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
  rock.castShadow = true;rock.scale.set(0.75,1.25,0.75);
  const seam=new THREE.Mesh(geo('tor',0.43,0.045,5,12),mat(0xFFE5A0));seam.rotation.x=1.1;
  g.add(rock,halo,seam);
  g.position.set(p.x, 0.9, p.z); scene.add(g);
  pickupMeshes.set(p.id, g);
}

function collectPickup(p) {
  state.pickups = state.pickups.filter(x => x !== p);
  const m = pickupMeshes.get(p.id); if (m) { scene.remove(m); pickupMeshes.delete(p.id); }
  const pool = CONFIG.cropOrder.filter(k => !CONFIG.crops[k].planet && CONFIG.crops[k].level >= 3 && CONFIG.crops[k].level <= state.level + 2 && state.prestige.rank >= (CONFIG.crops[k].prestige || 0));
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
  if(world.wagon.visible && flat(c,world.wagon.position.x,world.wagon.position.z)<5)target.type='merchant';
  else if (flat(c, world.shopPosition.x, world.shopPosition.z) < 5.5) target.type = 'shop';
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
      if(HOTBAR[state.selectedSlot]?.type==='shovel')return 'Retirar '+def.name+' e guardar a muda';
      if (d.progress < def.growTime) return 'E - Regar ' + def.name + ' (' + Math.floor(d.progress / def.growTime * 100) + '%)';
      return d.fruits > 0 ? 'E - Colher ' + d.fruits + ' ' + def.fruit : 'E - Regar ' + def.name + ' (proximo fruto em ' + Math.max(0, Math.ceil(def.fruitEvery - d.fruitT)) + 's)';
    }
    case 'structure': return 'E - ' + target.ref.def.name + (target.ref.def.kind === 'building' ? ' (nivel ' + target.ref.data.level + ')' : '');
    case 'pickup': return 'E - Coletar meteorito de sementes';
    case 'crystal': return 'E - Coletar cristal';
    case 'merchant': return 'E - Negociar com o mercador viajante';
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
    case 'tree': if(HOTBAR[state.selectedSlot]?.type==='shovel'){
      const i=trees.findIndex(t=>t.data===r),j=state.trees.indexOf(r);
      if(i<0||j<0)break;
      scene.remove(trees[i].group);trees.splice(i,1);state.trees.splice(j,1);
      const collider=world.colliders.findIndex(c=>c.x===r.x&&c.z===r.z&&c.radius===.55);
      if(collider>=0)world.colliders.splice(collider,1);
      state.saplings[r.type]++;r.fruits=0;target.type=null;save();
      showToast('Árvore retirada. Muda guardada na mochila.','good');break;
    } if (r.fruits > 0) harvestTree(r, false); else if (!waterTree(r, false)) { if (r.water >= 6) showToast('A arvore ja esta bem regada', 'info'); else { showToast('Sem agua no regador. Use a bomba de agua.', 'bad'); play('error'); } } break;
    case 'structure': openStructurePanel(r); break;
    case 'pickup': collectPickup(r); break;
    case 'crystal': mineCrystal(r); break;
    case 'merchant':
      if(Date.now()<state.merchantUntil)openShop('Carroça interplanetária',()=>[{name:'Sementes visitantes',items:CONFIG.cropOrder.filter(k=>CONFIG.crops[k].planet).map(k=>{
        const c=CONFIG.crops[k],locked=!cropUnlocked(c);
        return {thumb:k,title:c.name,desc:'Origem: '+c.planet+' · Colheita em '+c.growTime+' s · Venda por '+c.sellPrice+' CR',
          tag:locked?'Nível '+c.level+' · Prestígio '+(c.prestige||0):'Disponível',
          buttons:[{label:'Comprar · '+c.seedCost+' CR',disabled:locked||Date.now()>=state.merchantUntil||state.money<c.seedCost,onClick:()=>buySeed(k,1)}]};
      })}]);break;
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
    } else if(e.code==='KeyR' && !open && !state.paused && !isResumeVisible()){
      if(build)cancelBuild();
      selectSlot(2);
      const plant=target.type==='plot' && target.ref.crop;
      if(plant || target.type==='tree'){
        const watered=plant?waterPlot(target.ref,false):waterTree(target.ref,false);
        if(!watered)showToast(state.water<.5?'Encha o regador na bomba.':'Já tem água suficiente.','info');
      }else if(target.type==='pump')useWaterPump();
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

// ======================================================================
//  RECURSOS, DIA/NOITE, CULLING
// ======================================================================
function updateResources(dt, day) {
  const cap = waterCap();
  const gain = fx.rain + rainWaterGain()*(1+.2*perk('pluvio')) + (day===0?.05*perk('sereno'):0);
  if (gain > 0 && state.water < cap) state.water = Math.min(cap, state.water + gain * dt);
  if (state.water > cap) state.water = Math.max(cap, state.water - dt * 0.5);
  const gen = (0.2 + 0.5 * day*(1+.15*perk('foton'))) * researchEnergy() * energyEventMult() + fx.reactor;
  const me = maxEnergy();
  state.energy = Math.min(me, state.energy + gen * dt);
  if (state.energy > me) state.energy = me;
}

const daylight=new THREE.Color(0xfff4d9), twilight=new THREE.Color(0xffb07a);
const moonlight=new THREE.Color(0xa2b9e7), nightFill=new THREE.Color(0x8495ca);
const skyFill=new THREE.Color(0xd7f1ff);
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
  const elevation=-Math.cos(ang);
  const daylightMix=THREE.MathUtils.smoothstep(elevation,-.18,.20);
  const sunset=1-THREE.MathUtils.smoothstep(Math.abs(elevation),0,.42);
  world.sun.color.copy(moonlight).lerp(daylight,daylightMix).lerp(twilight,sunset*.83);
  world.hemi.color.copy(nightFill).lerp(skyFill,daylightMix);
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
  initEffects(scene, camera); initWater(scene); wateringCan=createWateringCan(camera); myPet=companion(scene);

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

let radar=null;
export function useFieldTechnique(id){
  return workField(id,{
    plots:state.plots,position:camera.position,
    ready:p=>p.crop&&p.progress>=CONFIG.crops[p.crop].growTime,
    harvest:p=>stockFree()>0&&harvestPlot(p,false),
    replant:p=>plantPlot(p,p.lastCrop,false),
    mark:p=>{radar={plot:p,until:performance.now()+12000,next:0};},
    home:()=>{
      for(let r=0;r<=10;r+=2)for(let i=0;i<8;i++){
        const x=-32+r*Math.cos(i*Math.PI/4),z=r*Math.sin(i*Math.PI/4);
        if(!world.isWalkable(x,z))continue;
        camera.position.set(x,CONFIG.player.height,z);pillar(x,z,0x76efff);
        return {text:'Você voltou à entrada da fazenda.'};
      }
      return {error:'A entrada está bloqueada. Libere espaço para o salto.'};
    }
  });
}
export function updateGame(dt) {
  if(radar){
    const now=performance.now();
    if(now>=radar.until||!radar.plot.crop)radar=null;
    else if(now>=radar.next){pillar(radar.plot.x,radar.plot.z,0x87ffee,15);radar.next=now+450;}
  }
  clock += dt; updateWater(dt);
  if(state.mode==='play')myPet.update(state.activePet,camera.position,dt,clock,world);
  wateringCan.update(dt,state.mode==='play' && !state.paused && HOTBAR[state.selectedSlot]?.type==='can',clock);
  if (state.mode !== 'play') { world.update(dt,state.time,state.event?.id,camera.position); updateEffects(dt); return; }
  if (state.paused || isResumeVisible()) { setPrompt(''); updateEffects(dt); world.update(dt,state.time,state.event?.id,camera.position); return; }

  state.stats.play += dt;
  const day = updateDayNight(dt);
  updateEvents(dt); world.wagon.visible=Date.now()<state.merchantUntil; updateContracts(dt); updateResearch(dt);
  updateResources(dt, day);
  updatePlots(dt, clock);
  updateTrees(dt, clock);
  updateIrrigators(dt);
  updateInstances(dt, clock);
  updateDrones(dt, camera, clock);
  updateEffects(dt);
  world.update(dt,state.time,state.event?.id,camera.position);

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
