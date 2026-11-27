// Retencao: recompensa diaria com sequencia e album de colecao.
// Tudo salvo em state.daily e state.album (campos novos, compativeis com saves antigos).
import { state, bus, save } from './state.js';
import { CONFIG } from './config.js';
import { PETS } from './actors.js';
import { play } from './audio.js';
import { openModal, closeModal, row, section, makeTabs, showToast, openPauseMenu, progressBar, updateHUD } from './ui.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// ======================================================================
//  RECOMPENSA DIARIA
// ======================================================================
export const DAILY_REWARDS = [
  { money: 100 },
  { money: 150 },
  { money: 200, seeds: { lettuce: 3 } },
  { money: 300 },
  { money: 400, crystals: 1 },
  { money: 600 },
  { money: 1500, crystals: 5, big: true }
];
const MAX_RECOVER_DAYS = 3;   // quantos dias perdidos ainda podem ser recuperados
const RECOVER_COST = 150;     // CR por dia de sequencia salva

const dayKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function dayNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

// Estado da recompensa hoje: 'claimed' | 'ready' | 'missed' (sequencia quebrada)
export function dailyStatus(today = dayKey()) {
  const d = state.daily;
  if (!d.last) return { kind: 'ready', next: 1, missed: 0 };
  const gap = dayNumber(today) - dayNumber(d.last);
  if (gap <= 0) return { kind: 'claimed', next: d.streak + 1, missed: 0 };
  if (gap === 1) return { kind: 'ready', next: d.streak + 1, missed: 0 };
  return { kind: 'missed', next: 1, missed: gap - 1 };
}

export function rewardFor(streak) {
  const r = DAILY_REWARDS[(streak - 1) % DAILY_REWARDS.length];
  const mult = 1 + 0.25 * Math.min(4, Math.floor((streak - 1) / DAILY_REWARDS.length));
  return { ...r, money: Math.round(r.money * mult) };
}

function rewardText(r) {
  const p = [r.money + ' CR'];
  if (r.crystals) p.push(r.crystals + ' cristal' + (r.crystals > 1 ? 'is' : ''));
  if (r.seeds) for (const k in r.seeds) p.push(r.seeds[k] + ' semente' + (r.seeds[k] > 1 ? 's' : '') + ' de ' + CONFIG.crops[k].name);
  return p.join(' + ');
}

function claimDaily() {
  const st = dailyStatus();
  if (st.kind === 'claimed') return false;
  const d = state.daily;
  d.streak = st.kind === 'missed' ? 1 : d.streak + 1;
  d.last = dayKey();
  d.best = Math.max(d.best, d.streak);
  const r = rewardFor(d.streak);
  state.money += r.money;
  if (r.crystals) state.crystals += r.crystals;
  if (r.seeds) for (const k in r.seeds) state.seeds[k] = (state.seeds[k] || 0) + r.seeds[k];
  d.total++;
  save(); play(r.big ? 'mission' : 'buy');
  showToast('Recompensa diaria: ' + rewardText(r), r.big ? 'mission' : 'good');
  return true;
}

function recoverCost(prevStreak) { return RECOVER_COST * Math.max(1, prevStreak); }

// Restaura a sequencia perdida pagando CR; o resgate de hoje continua a contagem.
function recoverStreak() {
  const st = dailyStatus(), d = state.daily;
  const cost = recoverCost(d.streak);
  if (st.kind !== 'missed' || st.missed > MAX_RECOVER_DAYS || state.money < cost) return false;
  state.money -= cost;
  d.last = dayKey(new Date(Date.now() - 86400000)); // conta como se tivesse entrado ontem
  save(); play('buy');
  showToast('Sequencia recuperada: ' + d.streak + ' dias', 'good');
  return true;
}

export function openDaily() {
  const back = () => (state.mode === 'play' ? openPauseMenu() : closeModal(false));
  openModal({
    id: 'daily', title: 'Recompensa diaria', wide: true, hint: 'Pressione ESC para voltar',
    build(body) {
      const d = state.daily, st = dailyStatus();
      const shown = st.kind === 'missed' ? 0 : d.streak;
      body.append(el('p', 'hint', st.kind === 'missed'
        ? 'Voce perdeu a sequencia de ' + d.streak + ' dias. Melhor marca: ' + d.best + ' dias.'
        : 'Sequencia atual: ' + d.streak + ' dias. Melhor marca: ' + d.best + ' dias.'));

      // trilha de 7 dias
      const track = el('div', 'daily-track');
      const cycleStart = st.kind === 'claimed' ? d.streak - 1 : shown;
      const base = Math.floor(cycleStart / 7) * 7;
      for (let i = 1; i <= 7; i++) {
        const n = base + i, r = rewardFor(n);
        const done = n <= shown;
        const cell = el('div', 'daily-day' + (done ? ' done' : '') + (n === st.next && st.kind !== 'claimed' ? ' next' : '') + (r.big ? ' big' : ''));
        cell.append(el('b', null, 'Dia ' + i), el('span', null, r.money + ' CR'));
        if (r.crystals) cell.append(el('span', 'extra', r.crystals + ' cristal' + (r.crystals > 1 ? 'is' : '')));
        if (r.seeds) cell.append(el('span', 'extra', 'sementes'));
        if (done) cell.append(el('i', null, 'OK'));
        track.append(cell);
      }
      body.append(track);

      const list = el('div', 'list');
      if (st.kind === 'ready') {
        const nr = rewardFor(st.next);
        list.append(row({
          title: 'Resgatar dia ' + st.next, desc: 'Hoje: ' + rewardText(nr), tag: 'DISPONIVEL', tagCls: 'good',
          buttons: [{ label: 'Resgatar', onClick: () => { claimDaily(); updateHUD(); } }]
        }));
      } else if (st.kind === 'missed') {
        const canFix = d.streak >= 2 && st.missed <= MAX_RECOVER_DAYS;
        const cost = recoverCost(d.streak);
        if (canFix) list.append(row({
          title: 'Recuperar sequencia', desc: 'Salva seus ' + d.streak + ' dias por ' + cost + ' CR. Disponivel por ' + MAX_RECOVER_DAYS + ' dias perdidos (voce perdeu ' + st.missed + ').',
          tag: cost + ' CR', buttons: [{ label: 'Recuperar', disabled: state.money < cost, onClick: () => { recoverStreak(); } }]
        }));
        list.append(row({
          title: 'Recomecar do dia 1', desc: 'Resgata ' + rewardText(rewardFor(1)) + ' e inicia uma nova sequencia.',
          buttons: [{ label: 'Resgatar', onClick: () => { claimDaily(); updateHUD(); } }]
        }));
      } else {
        list.append(row({
          title: 'Recompensa de hoje resgatada', done: true, tag: 'FEITO', tagCls: 'good',
          desc: 'Volte amanha para o dia ' + st.next + ': ' + rewardText(rewardFor(st.next))
        }));
      }
      body.append(list);
      if (state.mode === 'play') body.append(menuBtn('Voltar', back));
    }
  });
}

function menuBtn(label, fn) {
  const b = el('button', 'big secondary', label);
  b.type = 'button';
  b.addEventListener('click', () => { play('click'); fn(); });
  return b;
}

// ======================================================================
//  ALBUM DE COLECAO
// ======================================================================
const cropKeys = () => Object.keys(CONFIG.crops);
const mutKeys = () => [...CONFIG.mutationOrder].reverse();
const treeKeys = () => CONFIG.treeOrder.filter(k => CONFIG.trees[k]);
const productKeys = () => Object.keys(CONFIG.products);
const petKeys = () => Object.keys(PETS);

export const ALBUM_TABS = [
  { id: 'crops', name: 'Plantas', keys: cropKeys, label: k => CONFIG.crops[k].name, thumb: k => k, hint: 'Colha cada planta para registrar.' },
  { id: 'mutations', name: 'Mutacoes', keys: mutKeys, label: k => CONFIG.mutations[k].name, color: k => CONFIG.mutations[k].color, hint: 'Colha uma planta mutante de cada tipo.' },
  { id: 'fruits', name: 'Frutas', keys: treeKeys, label: k => CONFIG.trees[k].fruit, thumb: k => k, hint: 'Colha frutas de cada arvore.' },
  { id: 'products', name: 'Produtos', keys: productKeys, label: k => CONFIG.products[k].name, thumb: k => k, hint: 'Fabrique cada produto na fabrica.' },
  { id: 'pets', name: 'Pets', keys: petKeys, label: k => PETS[k].name, thumb: k => 'pet-' + k, hint: 'Adote todos os pets.' }
];
// Bonus unico por categoria completa
const ALBUM_REWARD = { crops: { money: 2000, crystals: 5 }, mutations: { money: 1500, crystals: 5 }, fruits: { money: 1500, crystals: 3 }, products: { money: 2500, crystals: 5 }, pets: { money: 1000, crystals: 3 } };

export function albumCount(id) {
  const t = ALBUM_TABS.find(x => x.id === id);
  const keys = t.keys();
  return { got: keys.filter(k => state.album[id][k]).length, total: keys.length };
}
export function albumTotals() {
  let got = 0, total = 0;
  for (const t of ALBUM_TABS) { const c = albumCount(t.id); got += c.got; total += c.total; }
  return { got, total };
}

function discover(cat, key, quiet) {
  if (!key || state.album[cat][key]) return;
  const t = ALBUM_TABS.find(x => x.id === cat);
  if (!t.keys().includes(key)) return;
  state.album[cat][key] = true;
  if (quiet) return;
  const c = albumCount(cat);
  showToast('Album: ' + t.label(key) + ' registrado (' + c.got + '/' + c.total + ')', 'mission');
  if (c.got === c.total) showToast('Album completo: ' + t.name + '. Abra o album para pegar o bonus.', 'mission');
}

// Marca o que o jogador ja possui (saves antigos) sem avisos
export function seedAlbum() {
  for (const k of cropKeys()) if (state.crops[k] > 0) discover('crops', k, true);
  for (const key in state.mutated) {
    if (!(state.mutated[key] > 0)) continue;
    const [m, c] = key.split(':');
    discover('mutations', m, true); discover('crops', c, true);
  }
  for (const k of treeKeys()) if (state.fruits[k] > 0) discover('fruits', k, true);
  for (const k of productKeys()) if (state.products[k] > 0) discover('products', k, true);
  for (const k of state.adoptedPets) discover('pets', k, true);
}

function claimAlbum(cat) {
  const c = albumCount(cat);
  if (c.got < c.total || state.album.claimed[cat]) return false;
  const r = ALBUM_REWARD[cat];
  state.album.claimed[cat] = true;
  state.money += r.money; state.crystals += r.crystals;
  save(); play('mission');
  showToast('Bonus do album: ' + r.money + ' CR + ' + r.crystals + ' cristais', 'mission');
  return true;
}

export function openAlbum() {
  seedAlbum();
  openModal({
    id: 'album', title: 'Album de colecao', wide: true, hint: 'Pressione ESC para voltar',
    build(body) {
      const tot = albumTotals();
      body.append(el('p', 'hint', tot.got + ' de ' + tot.total + ' coletados'));
      body.append(progressBar(tot.got / tot.total, tot.got === tot.total ? 'gold' : '', Math.round(tot.got / tot.total * 100) + '%'));
      const names = ALBUM_TABS.map(t => { const c = albumCount(t.id); return t.name + ' ' + c.got + '/' + c.total; });
      const { box, index } = makeTabs(body, names);
      const tab = ALBUM_TABS[index], c = albumCount(tab.id);
      box.append(el('p', 'hint', c.got + '/' + c.total + ' coletados. ' + tab.hint));
      const list = el('div', 'list');
      for (const k of tab.keys()) {
        const got = !!state.album[tab.id][k];
        list.append(row(got
          ? { title: tab.label(k), thumb: tab.thumb ? tab.thumb(k) : undefined, color: tab.color ? tab.color(k) : undefined, done: true, tag: 'COLETADO', tagCls: 'good', desc: albumDesc(tab.id, k) }
          : { title: '???', locked: true, tag: 'FALTA', desc: albumHint(tab.id, k) }));
      }
      box.append(list);
      const reward = ALBUM_REWARD[tab.id], claimed = state.album.claimed[tab.id];
      box.append(section('Bonus de categoria'));
      box.append(row({
        title: 'Colecao de ' + tab.name.toLowerCase() + ' completa', done: claimed, locked: !claimed && c.got < c.total,
        desc: reward.money + ' CR + ' + reward.crystals + ' cristais',
        tag: claimed ? 'RESGATADO' : c.got + '/' + c.total, tagCls: claimed ? 'good' : '',
        buttons: claimed ? [] : [{ label: 'Resgatar', disabled: c.got < c.total, onClick: () => { claimAlbum(tab.id); } }]
      }));
      if (state.mode === 'play') body.append(menuBtn('Voltar', openPauseMenu));
    }
  });
}

function albumDesc(cat, k) {
  if (cat === 'crops') { const c = CONFIG.crops[k]; return 'Venda base: ' + c.sellPrice + ' CR  |  Crescimento: ' + c.growTime + 's'; }
  if (cat === 'mutations') { const m = CONFIG.mutations[k]; return 'Valor x' + m.mult + ' · Crescimento +' + Math.round(1000*m.delay)/10 + '% de tempo' + (m.yield > 1 ? '  |  Rendimento x' + m.yield : ''); }
  if (cat === 'fruits') { const t = CONFIG.trees[k]; return t.name + '  |  ' + t.price + ' CR por fruto'; }
  if (cat === 'products') { const p = CONFIG.products[k]; return 'Venda: ' + p.sellPrice + ' CR'; }
  return PETS[k].desc || '';
}
function albumHint(cat, k) {
  if (cat === 'crops') return 'Colha esta planta. Libera no nivel ' + CONFIG.crops[k].level + '.';
  if (cat === 'mutations') return 'Aparece ao plantar a partir do nivel ' + CONFIG.mutations[k].level + '.';
  if (cat === 'fruits') return 'Plante uma arvore frutifera e colha. Nivel ' + CONFIG.trees[k].level + '.';
  if (cat === 'products') return 'Fabrique na fabrica.';
  return 'Adote na loja de pets.';
}

// ======================================================================
//  LIGACOES
// ======================================================================
bus.on('harvest', e => {
  discover('crops', e.crop);
  if (e.mutation) discover('mutations', e.mutation);
});
bus.on('fruit', e => discover('fruits', e.type));
bus.on('craft', e => discover('products', e.key));
bus.on('adopt', e => discover('pets', e.key));

// Ao entrar no jogo: marca o que ja existe e oferece a recompensa se houver
bus.on('gameStart', () => {
  seedAlbum();
  if (dailyStatus().kind !== 'claimed') setTimeout(() => { if (state.mode === 'play') openDaily(); }, 900);
});
