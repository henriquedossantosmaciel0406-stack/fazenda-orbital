// Estado global, barramento de eventos, calculos derivados e salvamento.
import { queueSave } from './cloud.js';
import { CONFIG } from './config.js';

export const LEGACY_KEY = 'fazenda-orbital-v3'; // save antigo (sem conta)
let saveKey = LEGACY_KEY;
export const setSaveKey = k => { saveKey = k; };

// ---------- Barramento de eventos ----------
const listeners = {};
export const bus = {
  on(name, fn) { (listeners[name] ||= []).push(fn); },
  emit(name, data) { (listeners[name] || []).forEach(fn => fn(data)); }
};

// ---------- Hotbar (mantem 1/2/3 originais) ----------
// Itens da hotbar (paginada, 9 por pagina): sementes de culturas, regador e mudas de arvores.
export const HOTBAR = [
  { type: 'seed', crop: 'lettuce' },
  { type: 'seed', crop: 'strawberry' },
  { type: 'can' },
  ...CONFIG.cropOrder.filter(k => k !== 'lettuce' && k !== 'strawberry').map(k => ({ type: 'seed', crop: k })),
  ...CONFIG.treeOrder.map(k => ({ type: 'sapling', tree: k })),
  {type:'shovel'}
];
export const HOTBAR_PAGES = Math.ceil(HOTBAR.length / CONFIG.hotbarPageSize);

const emptyCounts = () => Object.fromEntries(CONFIG.cropOrder.map(k => [k, 0]));
const emptyProducts = () => Object.fromEntries(Object.keys(CONFIG.products).map(k => [k, 0]));
const emptyTrees = () => Object.fromEntries(CONFIG.treeOrder.map(k => [k, 0]));
const defaultSettings = () => ({ volume: 0.7, music: 0.5, quality: 'media', mouseSens: 1, zoomSens: 1 });
const defaultStats = () => ({ harvested: 0, earned: 0, built: 0, days: 1, contracts: 0, research: 0, island: 0, sold: 0, play: 0, mutations: 0, fruits: 0 });

export const state = {
  money: CONFIG.start.money, water: CONFIG.start.water, maxWater: CONFIG.start.maxWater,
  energy: CONFIG.start.energy, speedLevel: 1, yieldLevel: 1,
  seeds: { ...emptyCounts(), lettuce: 3 },
  crops: emptyCounts(),
  products: emptyProducts(),
  crystals: 0,
  saplings: emptyTrees(), fruits: emptyTrees(), mutated: {},
  adoptedPets: [], activePet: null,
  prestige: { rank: 0, stars: 0, total: 0, runStart: 0, upgrades: {} },
  daily: { streak: 0, last: '', best: 0, total: 0 },
  album: { crops: {}, mutations: {}, fruits: {}, products: {}, pets: {}, claimed: {} },
  trees: [], nextTreeId: 1,
  land: { expand: 1, soil: 0, orchard: 0 }, hotbarPage: 0,
  level: 1, xp: 0, xpNeeded: 40,
  time: 8, day: 1, harvestsToday: 0,
  rp: 0, research: {},
  structures: [], nextStructureId: 1,
  drones: [], nextDroneId: 1,
  contracts: { active: [], done: 0, nextSpawn: 20, nextId: 1 },
  event: null, nextEventIn: 150, boom: null,
  objectiveIndex: 0, objective: { ...CONFIG.objectives[0], progress: 0 },
  stats: defaultStats(), achievements: {}, settings: defaultSettings(),
  islandUnlocked: false, islandVisited: false,
  visitors: 0, pickups: [], nextPickupId: 1,
  // runtime (nao salvo)
  plots: [], savedPlots: [], selectedSlot: 0, paused: false, mode: 'menu'
};

// ---------- Derivados ----------
let special = false;
export const hasOrbitalPass=()=>special;
export const dragonActive=()=>special && state.activePet==='dragon';
export function enableOrbitalPass(pets) {
  if (special) return;
  special = true;
  state.level = Math.max(100, state.level);
  state.islandUnlocked = true;
  if(!state.adoptedPets.includes('dragon'))state.activePet='dragon';
  state.adoptedPets = [...pets];
  state.prestige.rank=Math.max(10,state.prestige.rank);
  state.prestige.stars=Math.max(9999,state.prestige.stars);
  state.prestige.total=Math.max(state.prestige.total,state.prestige.stars);
  for(const skill of CONFIG.prestige.perks)state.prestige.upgrades[skill.id]=skill.max+Math.max(0,state.prestige.rank-3);
  state.rp=Math.max(9999,state.rp);
  state.speedLevel=CONFIG.upgrades.speed.max;
  state.yieldLevel=CONFIG.upgrades.yield.max;
  state.maxWater = Math.max(50,state.maxWater);
  state.water = state.maxWater;
  state.crystals = Math.max(9999,state.crystals);
  for (const id of Object.keys(CONFIG.research)) state.research[id] = true;
  for (const [id,def] of Object.entries(CONFIG.land)) state.land[id] = def.max;
  for (const bag of [state.seeds,state.saplings])
    for (const id of Object.keys(bag)) bag[id] = Math.max(99,bag[id]);
  Object.defineProperty(state,'money',{get:()=>Number.MAX_SAFE_INTEGER,set(){}});
}
export const walletLabel = () => special ? '∞' : Math.floor(state.money);
export const hasResearch = id => !!state.research[id];
export const structuresOf = type => state.structures.filter(s => s.type === type);
export const hasBuilding = type => structuresOf(type).length > 0;
export const buildingLevel = type => structuresOf(type).reduce((m, s) => Math.max(m, s.level), 0);

export function reputation() {
  if (special) return 999;
  let r = 0;
  for (const s of state.structures) r += CONFIG.structures[s.type].rep * (1 + 0.3 * (s.level - 1));
  r += state.stats.contracts * 1.5;
  for (const t of state.trees) if (t.progress >= CONFIG.trees[t.type].growTime) r += 1.5;
  r += state.land.expand * 2 + state.land.soil * 2;
  return Math.round(r);
}
export const perk = id => (state.prestige && state.prestige.upgrades[id]) || 0;
export const cropUnlocked = c => state.level >= c.level && state.prestige.rank >= (c.prestige || 0);
export const priceBonus = () => (1 + Math.min(0.4, reputation() / 400)) * (1 + 0.05 * perk('market') + 0.04 * perk('cash'));
export const stockLimit = () => (dragonActive()?200:0) + CONFIG.baseStockLimit + structuresOf('silo').reduce((a, s) => a + 80 * s.level, 0);
export const maxEnergy = () => CONFIG.baseMaxEnergy + 15 * perk('energy') + structuresOf('battery').reduce((a, s) => a + 60 * s.level, 0);
export function stockUsed() {
  let n = 0;
  for (const k in state.crops) n += state.crops[k];
  for (const k in state.products) n += state.products[k];
  for (const k in state.fruits) n += state.fruits[k];
  for (const k in state.mutated) n += state.mutated[k];
  return n;
}
export const treeLimit = () => CONFIG.baseTreeLimit + 4 * state.land.orchard;
export const soilGrowth = () => (1 + 0.08 * state.land.soil)*(dragonActive()?2:state.activePet==='turtle'?1.2:1);
export const soilDouble = () => 0.05 * state.land.soil;
export const mutKey = (m, c) => m + ':' + c;
export const stockFree = () => Math.max(0, stockLimit() - stockUsed());
export const droneLimit = () => 4;

// Reducao de efeitos climaticos negativos (pesquisa Estufa + Estacao meteorologica), 0 a 0.85
export function mitigation() {
  let m = state.research.greenhouse ? 0.6 : 0;
  m += 0.15 * buildingLevel('station');
  return Math.min(0.85, m);
}
export const eventActive = id => !!(state.event && state.event.id === id);
// Capacidade efetiva de agua (a seca reduz a agua disponivel)
export const waterCap = () => Math.max(1, Math.round((state.maxWater + 10 * perk('water')) * (eventActive('drought') ? 1 - 0.5 * (1 - mitigation()) : 1)));

// ---------- Economia ----------
export function addMoney(n) {
  state.money += n;
  if (n > 0) { state.stats.earned += n; bus.emit('earn', n); }
}
export function addXp(amount) {
  if (special) return;
  state.xp += Math.round(amount * (1 + 0.1 * perk('xp')));
  while (state.xp >= state.xpNeeded) {
    state.xp -= state.xpNeeded;
    state.level++;
    state.xpNeeded = state.level > 12 ? state.xpNeeded + 240 : Math.round(state.xpNeeded * 1.4);
    state.money += 75;
    bus.emit('level', state.level);
  }
}
export function addRP(n) {
  const lab = buildingLevel('lab');
  const mult = 1 + (lab ? 0.2 * (lab - 1) : 0);
  state.rp += n * mult;
}

// ---------- Objetivo atual ----------
export function setObjective(index) {
  state.objectiveIndex = Math.min(index, CONFIG.objectives.length - 1);
  state.objective = { ...CONFIG.objectives[state.objectiveIndex], progress: 0 };
}

// ---------- Salvamento ----------
export function save() {
  const data = {
    version: CONFIG.version, adoptedPets: state.adoptedPets, activePet: state.activePet,
    money: state.money, water: state.water, maxWater: state.maxWater, energy: state.energy,
    speedLevel: state.speedLevel, yieldLevel: state.yieldLevel,
    seeds: state.seeds, crops: state.crops, products: state.products, crystals: state.crystals,
    saplings: state.saplings, fruits: state.fruits, mutated: state.mutated, daily: state.daily, album: state.album, prestige: state.prestige, land: state.land, hotbarPage: state.hotbarPage, nextTreeId: state.nextTreeId,
    trees: state.trees.map(t => ({ id: t.id, type: t.type, x: t.x, z: t.z, progress: t.progress, fruits: t.fruits, fruitT: t.fruitT, water: t.water })),
    level: state.level, xp: state.xp, xpNeeded: state.xpNeeded,
    time: state.time, day: state.day, harvestsToday: state.harvestsToday,
    rp: state.rp, research: state.research,
    structures: state.structures, nextStructureId: state.nextStructureId,
    drones: state.drones, nextDroneId: state.nextDroneId,
    contracts: state.contracts, event: state.event, nextEventIn: state.nextEventIn, boom: state.boom,
    objectiveIndex: state.objectiveIndex, objective: state.objective,
    stats: state.stats, achievements: state.achievements, settings: state.settings,
    islandUnlocked: state.islandUnlocked, islandVisited: state.islandVisited, visitors: state.visitors, pickups: state.pickups, nextPickupId: state.nextPickupId,
    plots: state.plots.map(p => ({ id: p.id, x: p.x, z: p.z, crop: p.crop, progress: p.progress, water: p.water, sick: p.sick, lastCrop: p.lastCrop, mutation: p.mutation }))
  };
  queueSave(data);
  try { localStorage.setItem(saveKey, JSON.stringify(data)); } catch (e) { /* armazenamento cheio ou bloqueado */ }
}

export function load() {
  let data;
  try { data = JSON.parse(localStorage.getItem(saveKey)); } catch (e) { return false; }
  if (!data) return false;

  // Migracao do formato antigo (v3): sementes e colheitas eram campos soltos
  if (!data.version) {
    data.seeds = { ...emptyCounts(), lettuce: data.lettuceSeed || 0, strawberry: data.strawberrySeed || 0 };
    data.crops = { ...emptyCounts(), lettuce: data.lettuce || 0, strawberry: data.strawberry || 0 };
    const old = data.objective;
    delete data.objective;
    if (old && old.type === 'none') data.objectiveIndex = 1; // missao inicial ja concluida
    else if (old && old.type === 'plant') { data.objectiveIndex = 0; data.objectiveProgress = old.progress || 0; }
  }
  const keep = ['seeds', 'crops', 'products', 'research', 'contracts', 'stats', 'achievements', 'settings', 'saplings', 'fruits', 'mutated', 'land', 'daily', 'album', 'prestige'];
  for (const key of Object.keys(data)) {
    if (['expedition', 'plots', 'lettuceSeed', 'strawberrySeed', 'lettuce', 'strawberry', 'objective', 'version', 'objectiveProgress'].includes(key)) continue;
    if (keep.includes(key) && data[key] && typeof data[key] === 'object' && !Array.isArray(data[key])) {
      state[key] = { ...state[key], ...data[key] };
    } else {
      state[key] = data[key];
    }
  }
  setObjective(data.objectiveIndex || 0);
  if (data.objective && data.objective.type === CONFIG.objectives[state.objectiveIndex].type) state.objective.progress = data.objective.progress || 0;
  if (data.objectiveProgress) state.objective.progress = data.objectiveProgress;
  state.savedPlots = data.plots || [];
  state.settings = { ...defaultSettings(), ...state.settings };
  state.stats = { ...defaultStats(), ...state.stats };
  state.prestige = { rank: 0, stars: 0, total: 0, runStart: 0, ...state.prestige, upgrades: { ...(state.prestige && state.prestige.upgrades) } };
  state.daily = { streak: 0, last: '', best: 0, total: 0, ...state.daily };
  const al = state.album || {};
  state.album = { crops: {}, mutations: {}, fruits: {}, products: {}, pets: {}, claimed: {}, ...al };
  return true;
}

export function clearSave() {
  queueSave(null);
  try { localStorage.removeItem(saveKey); } catch (e) { /* ignora */ }
}
