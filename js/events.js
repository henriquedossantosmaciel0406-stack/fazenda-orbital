// Eventos: clima, mercado em alta, pedido urgente e meteorito de sementes.
import * as THREE from 'three';
import { state, bus, mitigation, eventActive } from './state.js';
import { CONFIG } from './config.js';
import { showToast, setBanner, flash } from './ui.js';
import { play } from './audio.js';
import { setRain, launchMeteor } from './effects.js';
import { createUrgent } from './contracts.js';

// Aparencia do ceu/luz durante eventos (interpolada a cada quadro, sem alocar)
export const weatherVisual = { color: new THREE.Color(0x000000), amount: 0, light: 1 };
const TARGETS = {
  pollen: {color:new THREE.Color(0xFDD98D),amount:.26,light:1.04},
  dew: {color:new THREE.Color(0xABCFE0),amount:.36,light:.88},
  solstice: {color:new THREE.Color(0xFFC476),amount:.33,light:1.13},
  tempest: {color:new THREE.Color(0x394866),amount:0.74,light:0.39},
  aurora: {color:new THREE.Color(0x69CBBC),amount:0.32,light:1.08},
  none:    { color: new THREE.Color(0x000000), amount: 0,    light: 1 },
  rain:    { color: new THREE.Color(0x5F7A99), amount: 0.55, light: 0.6 },
  drought: { color: new THREE.Color(0xE8B96A), amount: 0.35, light: 1.15 },
  solar:   { color: new THREE.Color(0xB06BFF), amount: 0.4,  light: 0.9 },
  pest:    { color: new THREE.Color(0x6B8F3A), amount: 0.25, light: 0.85 },
  rainbow: { color: new THREE.Color(0xFFC4EE), amount: 0.14, light: 1.1 },
  festival:{ color: new THREE.Color(0xFFD98A), amount: 0.16, light: 1.1 }
};
let bannerTimer = 0, solarFlashTimer = 0;

// ---- Multiplicadores consultados por outros sistemas ----
export const growthEventMult = () => (eventActive('rain') ? 1.5 : eventActive('rainbow') ? 1.25 : eventActive('solstice') ? 1.20 : 1);
const GOOD = new Set(['rain', 'rainbow', 'festival','aurora','pollen','dew','solstice']);
export const evaporationMult = () => (eventActive('drought') ? 1 + 1.5 * (1 - mitigation()) : eventActive('dew') ? .5 : 1);
export const energyEventMult = () => eventActive('aurora')?1.45:(eventActive('solar') ? 1 - 0.8 * (1 - mitigation()) : eventActive('solstice') ? 1.15 : 1);
export const rainWaterGain = () => eventActive('tempest') ? 0.85 : (eventActive('rain') ? 0.4 : 0);
export const sellEventMult = crop => (state.boom && state.boom.crop === crop ? state.boom.mult : 1) * (eventActive('festival') ? 1.25 : 1);

function pickEvent() {
  const climateBusy = !!state.event;
  const pool = Object.keys(CONFIG.events).filter(id => {
    const d = CONFIG.events[id];
    if (d.level > state.level) return false;
    if (d.kind === 'climate' && climateBusy) return false;
    if (id === 'boom' && state.boom) return false;
    return true;
  });
  if (!pool.length) return null;
  const total = pool.reduce((a, id) => a + CONFIG.events[id].weight, 0);
  let r = Math.random() * total;
  for (const id of pool) { r -= CONFIG.events[id].weight; if (r <= 0) return id; }
  return pool[0];
}

export function applyWorldCommand(action){
  if(action.event){triggerEvent(action.event);return;}
  if(action.command==='clear'){endClimate();return;}
  const hours={dawn:6,noon:12,sunset:18,night:22};
  if(Object.hasOwn(hours,action.command))state.time=hours[action.command];
}

export function triggerEvent(id) {
  const def = CONFIG.events[id];
  if (!def) return;
  if (def.kind === 'climate') {
    if(state.event)endClimate();
    const bad = !GOOD.has(id);
    state.event = { id, left: def.duration * (bad ? 1 - 0.4 * mitigation() : 1) };
    if (id === 'pest') {
      const chance = 0.6 * (1 - mitigation());
      state.plots.forEach(p => { if (p.crop && Math.random() < chance) { p.sick = true; p.dirty = true; } });
    }
    if (id === 'solar') flash('solar');
    showToast(def.text, bad ? 'bad' : 'good');
    play(id === 'rain' ? 'rain' : GOOD.has(id) ? 'upgrade' : 'alert');
  } else if (id === 'boom') {
    const eligible = CONFIG.cropOrder.filter(k => CONFIG.crops[k].level <= state.level && state.prestige.rank >= (CONFIG.crops[k].prestige || 0));
    const crop = eligible[Math.floor(Math.random() * eligible.length)];
    state.boom = { crop, mult: 1.6, left: def.duration };
    showToast('Mercado em alta: ' + CONFIG.crops[crop].name + ' vale 60% mais!', 'good');
    play('alert');
  } else if (id === 'urgent') {
    const c = createUrgent();
    showToast(def.text, 'event'); play('alert');
    bus.emit('urgentOrder', c);
  } else if (id === 'merchant') {
    const eligible = CONFIG.cropOrder.filter(k => CONFIG.crops[k].level <= state.level && state.prestige.rank >= (CONFIG.crops[k].prestige || 0));
    for (let i = 0; i < 2; i++) { const k = eligible[Math.floor(Math.random() * eligible.length)]; state.seeds[k] = (state.seeds[k] || 0) + 4; }
    showToast(def.text, 'good'); play('upgrade');
  } else if (id === 'meteor') {
    const f = CONFIG.farmArea;
    let x = 0, z = 0;
    for (let i = 0; i < 25; i++) {
      x = f.x0 + 8 + Math.random() * (f.x1 - f.x0 - 16); z = f.z0 + 8 + Math.random() * (f.z1 - f.z0 - 16);
      const onSoil = x > -56 && x < -12 && z > -48 && z < -2;
      const nearStruct = state.structures.some(s => Math.hypot(s.x - x, s.z - z) < 4);
      if (!onSoil && !nearStruct) break;
    }
    showToast(def.text, 'event'); play('alert'); flash('meteor');
    launchMeteor(x, z, () => bus.emit('meteorLanded', { x, z }));
  }
  bus.emit('eventStart', id);
}

export function endClimate() {
  if(!state.event)return;
  const id = state.event.id;
  if (id === 'pest') state.plots.forEach(p => { if (p.sick) { p.sick = false; p.dirty = true; } });
  showToast(CONFIG.events[id].name + ' terminou', 'info');
  state.event = null;
  setRain(0);
}

export function initEvents() { restoreEventVisuals(); }

// Chamado ao carregar um save com evento em andamento
export function restoreEventVisuals() {
  const t = TARGETS[state.event ? state.event.id : 'none'] || TARGETS.none;
  weatherVisual.color.copy(t.color); weatherVisual.amount = t.amount; weatherVisual.light = t.light;
  setRain(eventActive('tempest')?1.4:eventActive('rain')?1:0);
}

export function updateEvents(dt) {
  state.nextEventIn -= dt;
  if (state.nextEventIn <= 0) {
    const id = pickEvent();
    if (id) triggerEvent(id);
    state.nextEventIn = 130 + Math.random() * 110;
  }
  if (state.event) {
    state.event.left -= dt;
    if (state.event.left <= 0) endClimate();
  }
  if (state.boom) {
    state.boom.left -= dt;
    if (state.boom.left <= 0) { showToast('Mercado em alta terminou', 'info'); state.boom = null; }
  }

  // Visual do clima
  const t = TARGETS[state.event ? state.event.id : 'none'];
  const k = Math.min(1, dt * 1.2);
  weatherVisual.color.lerp(t.color, k);
  weatherVisual.amount += (t.amount - weatherVisual.amount) * k;
  weatherVisual.light += (t.light - weatherVisual.light) * k;
  setRain(eventActive('tempest')?1.4:eventActive('rain')?1:0);
  if (eventActive('solar')) { solarFlashTimer -= dt; if (solarFlashTimer <= 0) { flash('solar'); solarFlashTimer = 5 + Math.random() * 4; } }

  // Aviso no HUD
  bannerTimer -= dt;
  if (bannerTimer <= 0) {
    bannerTimer = 0.4;
    if (state.event) {
      const bad = !GOOD.has(state.event.id);
      setBanner(CONFIG.events[state.event.id].text + '  ' + Math.ceil(state.event.left) + 's', bad ? 'bad' : 'good');
    } else if (state.boom) setBanner('MERCADO EM ALTA: ' + CONFIG.crops[state.boom.crop].name + ' x' + state.boom.mult.toFixed(1) + '  ' + Math.ceil(state.boom.left) + 's', 'gold');
    else setBanner(null);
  }
}
