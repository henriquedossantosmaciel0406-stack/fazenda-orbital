// Drones agricolas: modelo 3D, IA simples (regar, colher, replantar), bateria, carregamento e painel de status.
import * as THREE from 'three';
import { state, bus, stockFree, droneLimit, hasResearch, maxEnergy, walletLabel } from './state.js';
import { CONFIG } from './config.js';
import { geo, mat, glow } from './world.js';
import { addOutline } from './toon.js';
import { researchDroneSpeed, researchDroneDrain } from './research.js';
import { burst } from './effects.js';
import { setDroneHum, play } from './audio.js';
import { showToast, openModal, row, section, progressBar, el, makeTabs } from './ui.js';

import { modules, moduleLevel, moduleValue, installModule } from './drone-upgrades.js';

const D = CONFIG.drone;
const entities = [];
export const droneRoots = []; // objetos 3D clicaveis (raycast do jogo)
let scene, api, world;
const vTmp = new THREE.Vector3(), vWant = new THREE.Vector3();
let thinkClock = 0;
let pumpSpot = null; // alvo virtual: bomba de agua

export const STATUS_LABEL = { active: 'ATIVO', charging: 'CARREGANDO', dead: 'SEM ENERGIA' };
export const droneStatusLabel = d => STATUS_LABEL[d.status] || 'ATIVO';
export const droneCost = () => D.prices[Math.min(state.drones.length, D.prices.length - 1)];

// ---------- Modelo ----------
function createDroneModel() {
  const g = new THREE.Group();
  const white = mat(0xE8F0F7, { metalness: 0.4, roughness: 0.4 }), dark = mat(0x2E3A4D, { metalness: 0.5 });
  const body = new THREE.Mesh(geo('sph', 0.38, 12, 8), mat(0xEDBA69)); body.scale.set(1.03,0.71,1.22); g.add(body); addOutline(body, 0.025);
  const dome = new THREE.Mesh(geo('sph', 0.26, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x59E6FF, { transparent: true, opacity: 0.65, emissive: 0x59E6FF, emissiveIntensity: 0.4 }));
  dome.position.y = 0.12; g.add(dome);
  const basket = new THREE.Mesh(geo('box', 0.34, 0.12, 0.34), dark); basket.position.y = -0.27; g.add(basket);
  for(const side of [-1,1]) {
    const skid=new THREE.Mesh(geo('box',0.09,0.09,0.68),dark);skid.position.set(side*0.23,-0.33,0);g.add(skid);
    const eye=new THREE.Mesh(geo('sph',0.08,10,6),mat(0x263D4B));eye.position.set(side*0.15,0.04,0.39);g.add(eye);
  }
  const rotors = [];
  [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([sx, sz]) => {
    const arm = new THREE.Mesh(geo('box', 0.88, 0.06, 0.07), dark);
    arm.position.set(sx * 0.31, 0.02, sz * 0.31); arm.rotation.y = Math.atan2(-sz, sx); g.add(arm);
    const motor = new THREE.Mesh(geo('cyl', 0.09, 0.09, 0.12, 8), dark); motor.position.set(sx * 0.62, 0.1, sz * 0.62); g.add(motor);
    const guard=new THREE.Mesh(geo('tor',0.35,0.035,5,16),white);guard.rotation.x=Math.PI/2;
    guard.position.set(sx*0.62,0.18,sz*0.62);g.add(guard);
    const rotor = new THREE.Group(); rotor.position.set(sx * 0.62, 0.19, sz * 0.62);
    const b1 = new THREE.Mesh(geo('box', 0.62, 0.02, 0.07), dark), b2 = new THREE.Mesh(geo('box', 0.62, 0.02, 0.07), dark);
    b2.rotation.y = Math.PI / 2;
    const disc = new THREE.Mesh(geo('cyl', 0.32, 0.32, 0.01, 14), glow(0xBFE9FF, 0.22));
    rotor.add(b1, b2, disc); g.add(rotor); rotors.push(rotor);
  });
  // LED proprio (cor indica o estado)
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x4FE3C1 });
  const led = new THREE.Mesh(geo('sph', 0.07, 8, 6), ledMat); led.position.set(0, -0.02, 0.36); g.add(led);
  const halo = new THREE.Mesh(geo('sph', 0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0x4FE3C1, transparent: true, opacity: 0.3, depthWrite: false }));
  halo.position.copy(led.position); g.add(halo);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(1.15);
  return { group: g, rotors, ledMat, haloMat: halo.material };
}

function createEntity(data, index) {
  const m = createDroneModel();
  const pad = world.dronePads[index % world.dronePads.length];
  m.group.position.set(pad.x, pad.y + 0.35, pad.z);
  m.group.userData.target = { type: 'drone', id: data.id };
  scene.add(m.group);
  droneRoots.push(m.group);
  // Brilho no chao no lugar de PointLight (luzes dinamicas encarecem todos os materiais)
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x4FE3C1, transparent: true, opacity: 0.18, depthWrite: false });
  const groundGlow = new THREE.Mesh(geo('ring', 0, 1.2, 18), glowMat);
  groundGlow.rotation.x = -Math.PI / 2; scene.add(groundGlow);
  const e = { data, group: m.group, rotors: m.rotors, ledMat: m.ledMat, haloMat: m.haloMat, glow: groundGlow, glowMat, vel: new THREE.Vector3(), task: null, taskText: 'Aguardando', returning: false, work: 0, spark: 0, deadTimer: 0, padIndex: index, yaw: 0 };
  data.pad = index;
  entities.push(e);
  return e;
}

export function initDrones(currentScene, gameApi, currentWorld) {
  scene = currentScene; api = gameApi; world = currentWorld;
  pumpSpot = { x: world.pumpPosition.x, z: world.pumpPosition.z + 1.4, claimedBy: 0, kind: 'pump' };
  state.drones.forEach((d, i) => { d.energy = Math.min(d.energy, moduleValue(d, 'battery')); createEntity(d, i); });
}

export function buyDrone() {
  const n = state.drones.length;
  if (n >= droneLimit()) { showToast('Limite de drones atingido', 'bad'); play('error'); return false; }
  if (state.level < D.level) { showToast('Drones liberados no nivel ' + D.level, 'bad'); play('error'); return false; }
  const cost = droneCost();
  if (state.money < cost) { showToast('Creditos insuficientes', 'bad'); play('error'); return false; }
  state.money -= cost;
  const data = { id: state.nextDroneId++, energy: D.cap, status: 'active', pad: n };
  state.drones.push(data);
  const e = createEntity(data, n);
  burst(e.group.position.x, 1, e.group.position.z, 0x4FE3C1, 30, 3, 4);
  play('buy');
  showToast('Drone comprado. Ele trabalha sozinho na fazenda.', 'good');
  bus.emit('drone', data);
  return true;
}

export function recoverDrone(d) {
  const e = entities.find(x => x.data === d);
  if (!e) return;
  const pad = world.dronePads[e.padIndex % world.dronePads.length];
  burst(e.group.position.x, e.group.position.y, e.group.position.z, 0x4FE3C1, 14, 2, 3);
  e.group.position.set(pad.x, pad.y + 0.35, pad.z); e.vel.set(0, 0, 0);
  releaseTask(e); e.returning = false; e.deadTimer = 0;
  d.status = 'charging'; e.taskText = 'Carregando';
  burst(pad.x, 0.6, pad.z, 0x4FE3C1, 14, 2, 3);
  showToast('Drone recuperado e na base', 'info');
}
export const entityOf = d => entities.find(e => e.data === d);

function releaseTask(e) {
  if (e.task && e.task.plot && e.task.plot.claimedBy === e.data.id) e.task.plot.claimedBy = 0;
  e.task = null; e.work = 0;
}

// ---------- IA ----------
function chooseTask(e) {
  const p = e.group.position;
  let best = null, bestScore = Infinity, thirsty = false;
  const plots = api.plots;
  for (let i = 0; i < plots.length; i++) {
    const plot = plots[i];
    if (plot.kind === 'island' || !plot.available || plot.claimedBy) continue;
    const dist = Math.hypot(plot.x - p.x, plot.z - p.z);
    let type = null, prio = 0;
    if (plot.crop) {
      const crop = CONFIG.crops[plot.crop];
      if (plot.progress >= crop.growTime) { if (stockFree() > 0) { type = 'harvest'; prio = 0; } }
      else if (plot.water < 1.5 || plot.sick) { if (state.water >= 0.5) { type = 'water'; prio = 40; } else thirsty = true; }
    } else if (hasResearch('ai') && plot.lastCrop && state.seeds[plot.lastCrop] > 0 && state.level >= CONFIG.crops[plot.lastCrop].level) {
      type = 'plant'; prio = 80;
    }
    if (!type) continue;
    const score = prio + dist;
    if (score < bestScore) { bestScore = score; best = { type, plot }; }
  }
  const trees = api.trees || [];
  for (let i = 0; i < trees.length; i++) {
    const tr = trees[i];
    if (tr.claimedBy) continue;
    const def = CONFIG.trees[tr.type];
    let type = null, prio = 0;
    if (tr.progress >= def.growTime && tr.fruits >= 2) { if (stockFree() > 0) { type = 'treeHarvest'; prio = 5; } }
    else if (tr.water < 1.2) { if (state.water >= 0.5) { type = 'treeWater'; prio = 50; } else thirsty = true; }
    if (!type) continue;
    const score = prio + Math.hypot(tr.x - p.x, tr.z - p.z);
    if (score < bestScore) { bestScore = score; best = { type, plot: tr }; }
  }
  if (!best && thirsty && state.water < 2 && !pumpSpot.claimedBy) best = { type: 'refill', plot: pumpSpot };
  if (best) { best.plot.claimedBy = e.data.id; e.task = best; e.work = 0; e.taskText = { harvest: 'Colhendo', water: 'Regando', plant: 'Plantando', refill: 'Buscando agua', treeHarvest: 'Colhendo frutos', treeWater: 'Regando arvore' }[best.type]; }
  else e.taskText = 'Aguardando';
}

function taskStillValid(t) {
  if (t.type === 'refill') return state.water < 3;
  const plot = t.plot;
  if (t.type === 'treeHarvest') return plot.fruits > 0;
  if (t.type === 'treeWater') return plot.water < 3;
  if (t.type === 'plant') return !plot.crop;
  if (!plot.crop) return false;
  const ready = plot.progress >= CONFIG.crops[plot.crop].growTime;
  return t.type === 'harvest' ? ready : !ready;
}

function die(e) {
  const d = e.data;
  d.energy = 0; d.status = 'dead'; e.taskText = 'Sem energia';
  releaseTask(e); e.returning = false; e.deadTimer = 0;
  showToast('Um drone ficou sem energia', 'bad'); play('error');
}

function moveTo(e, tx, ty, tz, dt, speed) {
  const p = e.group.position;
  vWant.set(tx - p.x, 0, tz - p.z);
  const dist = vWant.length();
  const sp = speed * Math.min(1, dist / 2.5 + 0.12);
  if (dist > 0.05) vWant.multiplyScalar(sp / dist); else vWant.set(0, 0, 0);
  e.vel.lerp(vWant, 1 - Math.exp(-dt * 3));
  p.x += e.vel.x * dt; p.z += e.vel.z * dt;
  p.y += (ty - p.y) * (1 - Math.exp(-dt * 3));
  return dist;
}

function updateOne(e, dt, t) {
  const d = e.data, p = e.group.position;
  const pad = world.dronePads[e.padIndex % world.dronePads.length];
  const capacity = moduleValue(d, 'battery');
  const speed = D.speed * researchDroneSpeed() * moduleValue(d, 'motor');
  let flying = false;

  if (d.status === 'dead') {
    p.y += (0.35 - p.y) * (1 - Math.exp(-dt * 2.5));
    e.vel.multiplyScalar(0.9);
    e.deadTimer += dt;
    const atPad = Math.hypot(p.x - pad.x, p.z - pad.z) < 1.2;
    if (state.energy >= 8 && (atPad || e.deadTimer >= 30)) {
      if (!atPad) recoverDrone(d); else { d.status = 'charging'; e.taskText = 'Carregando'; }
    }
  } else if (d.status === 'charging') {
    const dist = moveTo(e, pad.x, pad.y + 0.35, pad.z, dt, speed);
    flying = dist > 0.4;
    if (!flying) {
      const amt = Math.min(D.chargeRate * dt, state.energy, capacity - d.energy);
      if (amt > 0) { d.energy += amt; state.energy -= amt; e.taskText = 'Carregando'; }
      else if (state.energy < 0.1 && d.energy < 1) { d.status = 'dead'; e.taskText = 'Sem energia'; }
      if (d.energy >= capacity * 0.95) { d.status = 'active'; e.returning = false; e.taskText = 'Aguardando'; }
    } else d.energy = Math.max(0, d.energy - D.drain * 0.5 * dt);
  } else {
    // ATIVO
    flying = true;
    const drain = (D.drain * researchDroneDrain());
    d.energy -= (e.task || e.returning ? drain : D.idleDrain) * dt;
    if (d.energy <= 0) { die(e); return; }
    if (!e.task && !e.returning) {
      if (d.energy < capacity * 0.22) { e.returning = true; e.taskText = 'Voltando a base'; }
      else if (e.thinkIn === undefined || (e.thinkIn -= dt) <= 0) { e.thinkIn = 0.6; chooseTask(e); }
    }
    if (e.returning) {
      const dist = moveTo(e, pad.x, pad.y + 0.35, pad.z, dt, speed);
      if (dist < 0.5) { e.returning = false; d.status = 'charging'; e.taskText = 'Carregando'; }
    } else if (e.task) {
      const plot = e.task.plot;
      if (!taskStillValid(e.task)) { releaseTask(e); }
      else {
        const dist = moveTo(e, plot.x, D.height - (e.work > 0 ? 1.4 : 0), plot.z, dt, speed);
        if (dist < 0.45) {
          e.work += dt;
          e.spark -= dt;
          if (e.spark <= 0) { e.spark = 0.18; burst(plot.x, 1.3, plot.z, e.task.type === 'water' || e.task.type === 'refill' ? 0x4FC3F7 : 0xFFD166, 2, 0.8, 0.5); }
          if (e.work >= moduleValue(d, 'arm')) {
            const tk = e.task;
            let ok = false;
            if (tk.type === 'treeWater') ok = api.waterTree(plot, true);
            else if (tk.type === 'treeHarvest') ok = api.harvestTree(plot, true);
            else if (tk.type === 'water') ok = api.waterPlot(plot, true);
            else if (tk.type === 'harvest') ok = api.harvestPlot(plot, true);
            else if (tk.type === 'refill') ok = api.refillWater();
            else ok = api.plantPlot(plot, plot.lastCrop, true);
            releaseTask(e);
            if (!ok) e.thinkIn = 2; // tenta de novo mais tarde
          }
        } else e.work = 0;
      }
    } else {
      // Em espera: paira perto da base
      moveTo(e, pad.x, D.height - 0.8, pad.z - 1.5, dt, speed * 0.6);
    }
  }

  // ----- Visual -----
  const bob = flying ? Math.sin(t * 3 + e.padIndex) * 0.08 : 0;
  p.y += bob * dt * 6;
  const spin = d.status === 'dead' ? 0 : (flying ? 45 : 12);
  for (let i = 0; i < 4; i++) e.rotors[i].rotation.y += spin * dt * (i % 2 ? -1 : 1);
  const tiltX = THREE.MathUtils.clamp(e.vel.z * 0.05, -0.3, 0.3), tiltZ = THREE.MathUtils.clamp(-e.vel.x * 0.05, -0.3, 0.3);
  e.group.rotation.x += (tiltX - e.group.rotation.x) * Math.min(1, dt * 5);
  e.group.rotation.z += (tiltZ - e.group.rotation.z) * Math.min(1, dt * 5);
  if (e.vel.lengthSq() > 0.2) { const ty = Math.atan2(e.vel.x, e.vel.z); e.yaw += Math.atan2(Math.sin(ty - e.yaw), Math.cos(ty - e.yaw)) * Math.min(1, dt * 4); e.group.rotation.y = e.yaw; }
  const color = d.status === 'dead' ? 0xFF5470 : d.status === 'charging' ? 0xFFD166 : 0x4FE3C1;
  if (e.ledColor !== color) { e.ledColor = color; e.ledMat.color.setHex(color); e.haloMat.color.setHex(color); e.glowMat.color.setHex(color); }
  const blink = d.status === 'dead' ? (Math.sin(t * 6) > 0 ? 1 : 0.15) : 1;
  e.glowMat.opacity = 0.18 * blink;
  e.glow.position.set(p.x, 0.06, p.z);
  e.glow.scale.setScalar(0.7 + Math.max(0, 3.5 - p.y) * 0.05);
  e.haloMat.opacity = 0.25 * blink;
  e.flying = flying;
}

export function updateDrones(dt, camera, t) {
  let nearest = 1e9;
  for (let i = 0; i < entities.length; i++) {
    updateOne(entities[i], dt, t);
    const e = entities[i];
    if (e.flying) nearest = Math.min(nearest, e.group.position.distanceTo(camera.position));
  }
  const level = nearest < 1e8 ? Math.max(0, 1 - nearest / 30) : 0;
  setDroneHum(level, 1);
}

function showWorkshop(body) {
  body.append(el('div', 'summary', 'Saldo disponível · ' + walletLabel() + ' CR'));
  if (!state.drones.length) {
    body.append(el('p', 'hint', 'Compre seu primeiro drone na Loja Geral a partir do nível ' + D.level + '.'));
  }
  state.drones.forEach((unit, i) => {
    body.append(section('Drone ' + (i + 1)));
    const list = el('div', 'list');
    for (const [key, part] of Object.entries(modules)) {
      const level = moduleLevel(unit, key);
      const price = part.prices[level];
      const current = part.format(part.value(level));
      const maxed = price === undefined;
      list.append(row({
        title: part.name, tag: 'Nv. ' + level + ' / ' + part.prices.length,
        desc: maxed ? current : current + ' → ' + part.format(part.value(level + 1)),
        buttons: [{
          label: maxed ? 'Nível máximo' : 'Instalar · ' + price + ' CR',
          disabled: maxed || state.money < price,
          onClick: () => {
            if (installModule(unit, key, level)) {
              play('upgrade');
              showToast('Upgrade instalado no drone ' + (i + 1), 'good');
            }
          }
        }]
      }));
    }
    body.append(list);
  });
}

// ---------- Painel de status ----------
export function openDronePanel() {
  openModal({
    id: 'drones', title: 'Drones agrícolas', wide: true, hint: 'Pressione G, E ou ESC para fechar',
    build(panel) {
      const { box: body, index } = makeTabs(panel, ['Frota', 'Oficina de upgrades']);
      if (index === 1) { showWorkshop(body); return; }
      const sum = el('div', 'summary');
      sum.append(el('span', null, 'ENERGIA DA FAZENDA'), el('b', null, Math.floor(state.energy) + ' / ' + maxEnergy()));
      body.append(sum);
      body.append(progressBar(Math.min(1, state.energy / maxEnergy()), 'energy'));
      body.append(el('p', 'hint', 'Drones gastam bateria ao voar, voltam sozinhos para carregar e usam a energia da fazenda. Baterias, paineis solares e reatores aumentam essa energia.'));
      if (!state.drones.length) {
        body.append(el('p', 'hint', 'Voce ainda nao tem drones. Compre um na Loja Geral (nivel ' + D.level + ').'));
        return;
      }
      body.append(section('Drones (' + state.drones.length + ' / ' + droneLimit() + ')'));
      const list = el('div', 'list');
      state.drones.forEach((d, i) => {
        const e = entityOf(d);
        const capacity = moduleValue(d, 'battery');
        const tagCls = d.status === 'dead' ? 'bad' : d.status === 'charging' ? 'gold' : 'good';
        const buttons = [];
        if (d.status === 'dead') buttons.push({ label: 'Recuperar', onClick: () => { recoverDrone(d); } });
        else if (d.status === 'active') buttons.push({ label: 'Chamar para base', onClick: () => { const en = entityOf(d); if (en) { releaseTask(en); en.returning = true; en.taskText = 'Voltando a base'; } showToast('Drone voltando para a base', 'info'); } });
        list.append(row({
          title: 'Drone ' + (i + 1), tag: droneStatusLabel(d), tagCls,
          desc: 'Tarefa: ' + (e ? e.taskText : '-'),
          bar: { frac: d.energy / capacity, cls: d.energy < capacity * 0.25 ? 'low' : 'energy', text: 'Bateria ' + Math.floor(d.energy) + ' / ' + capacity },
          buttons
        }));
      });
      body.append(list);
    }
  });
}
