// Missoes, contratos do Mercado e conquistas.
import { state, bus, perk, addMoney, addXp, addRP, reputation, setObjective } from './state.js';
import { CONFIG } from './config.js';
import { row, section, showToast, updateHUD, el } from './ui.js';
import { play } from './audio.js';

// ---------- Utilidades ----------
export function itemName(item) {
  if (CONFIG.crops[item]) return CONFIG.crops[item].name;
  if (CONFIG.products[item]) return CONFIG.products[item].name;
  if (CONFIG.trees[item]) return CONFIG.trees[item].fruit;
  return 'Cristal';
}
function itemCount(item) {
  if (item in state.crops) return state.crops[item];
  if (item in state.products) return state.products[item];
  if (item in state.fruits) return state.fruits[item];
  if (item === 'crystal') return state.crystals;
  return 0;
}
function takeItem(item, n) {
  if (item in state.crops) state.crops[item] -= n;
  else if (item in state.products) state.products[item] -= n;
  else if (item in state.fruits) state.fruits[item] -= n;
  else if (item === 'crystal') state.crystals -= n;
}

export function applyReward(r) {
  if (r.money) addMoney(r.money);
  if (r.xp) addXp(r.xp);
  if (r.rp) addRP(r.rp);
  if (r.crystals) state.crystals += r.crystals;
  if (r.seeds) for (const k in r.seeds) state.seeds[k] += r.seeds[k];
}
export function rewardText(r) {
  const p = [];
  if (r.money) p.push(r.money + ' CR');
  if (r.xp) p.push(r.xp + ' XP');
  if (r.rp) p.push(Math.round(r.rp) + ' PP');
  if (r.crystals) p.push(r.crystals + ' cristais');
  if (r.seeds) for (const k in r.seeds) p.push(r.seeds[k] + ' semente(s) de ' + CONFIG.crops[k].name);
  return p.join(', ');
}

// ---------- Missao atual (cadeia de objetivos) ----------
export function trackObjective(type, n = 1) {
  const o = state.objective;
  if (o.type !== type || !o.target) return;
  o.progress = type === 'level' ? state.level : o.progress + n;
  if (o.progress >= o.target) completeObjective();
}
function completeObjective() {
  const o = state.objective;
  applyReward(o.reward || {});
  showToast('Objetivo concluido! ' + rewardText(o.reward || {}), 'mission');
  play('mission');
  bus.emit('objectiveDone', o);
  setObjective(state.objectiveIndex + 1);
  if (state.objective.type === 'level') trackObjective('level', 0); // pode ja estar cumprido
}

// ---------- Contratos ----------
export function contractTitle(c) {
  const name = itemName(c.item);
  switch (c.type) {
    case 'deliver': return 'Entregue ' + c.amount + ' ' + name;
    case 'produce': return 'Produza ' + c.amount + ' ' + name;
    case 'mutant': return 'Colha ' + c.amount + ' plantas mutantes';
    case 'harvests': return 'Complete ' + c.amount + ' colheitas';
    default: return 'Venda ' + c.amount + ' produtos';
  }
}
const maxActive = () => 3 + Math.min(3, Math.floor(reputation() / 60));

function makeContract(t) {
  const bonus = (1 + Math.min(0.5, reputation() / 300))*(1+.1*perk('frete'));
  const life=t.life+30*perk('prazo');
  return {
    id: state.contracts.nextId++, key: t.key, type: t.type, item: t.item, amount: t.amount, progress: 0,
    reward: { ...t.reward, money: Math.round(t.reward.money * bonus) }, left: life, life, urgent: false
  };
}

function spawnContract() {
  const rep = reputation();
  const taken = new Set(state.contracts.active.map(c => c.key));
  const pool = CONFIG.contractTemplates.filter(t =>
    state.level >= t.minLevel && rep >= (t.minRep || 0) && (!t.island || state.islandUnlocked) && !taken.has(t.key));
  if (!pool.length) return false;
  const t = pool[Math.floor(Math.random() * pool.length)];
  const c = makeContract(t);
  state.contracts.active.push(c);
  showToast('Novo contrato no Mercado: ' + contractTitle(c), 'info');
  play('alert');
  return true;
}

// Pedido urgente (evento): entrega com bonus
export function createUrgent() {
  const eligible = CONFIG.cropOrder.filter(k => !CONFIG.crops[k].planet && CONFIG.crops[k].level <= state.level && state.prestige.rank >= (CONFIG.crops[k].prestige || 0));
  const key = eligible[Math.floor(Math.random() * eligible.length)];
  const crop = CONFIG.crops[key];
  const amount = Math.min(8, 3 + Math.floor(state.level / 2));
  const life=150+30*perk('prazo');
  const c = {
    id: state.contracts.nextId++, key: 'urgent_' + state.contracts.nextId, type: 'deliver', item: key, amount, progress: 0,
    reward: { money: Math.round((amount * crop.sellPrice * 1.65 + 75)*(1+.1*perk('frete'))), xp: 60 + amount * 5, rp: 4+2*perk('laudo'), crystals:perk('aduana') },
    left: life, life, urgent: true
  };
  state.contracts.active.unshift(c);
  return c;
}

export function updateContracts(dt) {
  const k = state.contracts;
  k.nextSpawn -= dt*(1+.12*perk('radio'));
  if (k.nextSpawn <= 0) {
    if (k.active.length < maxActive() && spawnContract()) k.nextSpawn = 45 + Math.random() * 40;
    else k.nextSpawn = 15;
  }
  for (let i = k.active.length - 1; i >= 0; i--) {
    const c = k.active[i];
    if (c.progress >= c.amount) continue; // concluido espera ser resgatado
    c.left -= dt;
    if (c.left <= 0) {
      k.active.splice(i, 1);
      showToast('Contrato expirou: ' + contractTitle(c), 'bad');
    }
  }
}

function addProgress(types, filter, n) {
  for (const c of state.contracts.active) {
    if (!types.includes(c.type) || c.progress >= c.amount) continue;
    if (filter && !filter(c)) continue;
    c.progress = Math.min(c.amount, c.progress + n);
    if (c.progress >= c.amount) { showToast('Contrato pronto para resgatar no Mercado', 'mission'); play('mission'); }
  }
}

function deliver(c) {
  const need = c.amount - c.progress, have = itemCount(c.item), n = Math.min(need, have);
  if (n <= 0) { showToast('Voce nao tem ' + itemName(c.item), 'bad'); play('error'); return; }
  takeItem(c.item, n); c.progress += n;
  play('sell');
  showToast('Entregou ' + n + ' ' + itemName(c.item), 'good');
  if (c.progress >= c.amount) { showToast('Contrato pronto para resgatar', 'mission'); play('mission'); }
}

function claim(c) {
  if (c.progress < c.amount || !state.contracts.active.includes(c)) return;
  state.contracts.active = state.contracts.active.filter(x => x !== c);
  applyReward(c.reward);
  state.contracts.done++; state.stats.contracts++;
  play('mission');
  showToast('Contrato concluido! ' + rewardText(c.reward), 'mission');
  bus.emit('contractDone', c);
  bus.emit('contract', c);
}

const fmtTime = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

// Lista de contratos (usada no Mercado e na consulta rapida com a tecla C)
export function buildContractsView(body, canAct) {
  const list = el('div', 'list');
  const act = state.contracts.active;
  if (!canAct) body.append(el('p', 'hint', 'Va ate o Mercado para entregar itens e resgatar recompensas.'));
  if (!act.length) list.append(el('p', 'hint', 'Nenhum contrato no momento. Novos contratos aparecem com o tempo.'));
  act.forEach(c => {
    const done = c.progress >= c.amount;
    const buttons = [];
    if (canAct && done) buttons.push({ label: 'Resgatar', onClick: () => claim(c) });
    else if (canAct && c.type === 'deliver') buttons.push({ label: 'Entregar', disabled: itemCount(c.item) <= 0, onClick: () => deliver(c) });
    list.append(row({
      title: (c.urgent ? 'URGENTE - ' : '') + contractTitle(c),
      desc: 'Recompensa: ' + rewardText(c.reward) + (c.type === 'harvests' ? '  |  Conte colheitas ate o tempo acabar' : ''),
      tag: done ? 'PRONTO' : fmtTime(c.left), tagCls: done ? 'good' : (c.left < 40 ? 'bad' : (c.urgent ? 'gold' : '')),
      bar: { frac: c.progress / c.amount, cls: done ? 'gold' : '', text: c.progress + ' / ' + c.amount },
      done, buttons
    }));
  });
  body.append(list);
}

// ---------- Conquistas ----------
export function updateAchievements() {
  const rep = reputation();
  for (const a of CONFIG.achievements) {
    if (state.achievements[a.id]) continue;
    if (a.get(state, rep) >= a.goal) {
      state.achievements[a.id] = true;
      addMoney(a.reward);
      showToast('Conquista: ' + a.name + ' (+' + a.reward + ' CR)', 'mission');
      play('mission');
    }
  }
}

// ---------- Ligacao com os eventos do jogo ----------
export function initMissions() {
  bus.on('plant', e => { if (e.crop === 'lettuce') trackObjective('plant'); });
  bus.on('harvest', e => {
    state.stats.harvested++; state.harvestsToday++;
    trackObjective('harvest');
    addProgress(['produce'], c => c.item === e.crop, e.amount);
    addProgress(['harvests'], null, 1);
    if (e.mutation) addProgress(['mutant'], null, 1);
  });
  bus.on('sell', e => {
    state.stats.sold += e.count;
    trackObjective('sell', e.count);
    addProgress(['sell'], null, e.count);
  });
  bus.on('level', l => { showToast('Nivel ' + l + '! +35 CR', 'mission'); play('upgrade'); trackObjective('level', 0); });
  bus.on('drone', () => trackObjective('drone'));
  bus.on('build', () => trackObjective('build'));
  bus.on('contract', () => trackObjective('contract'));
  bus.on('research', () => trackObjective('research'));
  bus.on('island', () => trackObjective('island'));
  bus.on('dayStart', () => { state.harvestsToday = 0; });
  trackObjective('level', 0);
}
