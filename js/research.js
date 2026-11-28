// Sistema de pesquisa: pontos de pesquisa (PP), arvore de tecnologias e laboratorio.
import { state, bus, perk, addRP, buildingLevel, hasResearch, hasBuilding } from './state.js';
import { CONFIG } from './config.js';
import { openModal, row, section, showToast, updateHUD, flash } from './ui.js';
import { play } from './audio.js';

// Pre-requisitos da arvore
export const PREREQ = {
  irrigation: [], hybrid: [], solar: [],
  fastDrones: ['solar'], organic: ['hybrid'], recycle: ['hybrid'],
  greenhouse: ['irrigation'], ai: ['fastDrones', 'organic'], towers: ['greenhouse', 'recycle'],
  genetics: ['hybrid'], pomology: ['organic']
};
const tierOf = id => (PREREQ[id].length ? 1 + Math.max(...PREREQ[id].map(tierOf)) : 0);

// Multiplicadores usados por outros sistemas
export const researchGrowth = () => (hasResearch('hybrid') ? 1.2 : 1);
export const researchDroneSpeed = () => (hasResearch('fastDrones') ? 1.5 : 1);
export const researchEnergy = () => (hasResearch('solar') ? 2 : 1);
export const researchDroneDrain = () => (hasResearch('ai') ? 0.7 : 1);

export function initResearch() {
  // PP ao colher, vender, concluir missoes e subir de nivel
  bus.on('harvest', e => addRP(CONFIG.crops[e.crop].rp * (e.byDrone ? 0.6 : 1) + (e.byDrone?0:perk('amostras')) + (e.mutation?3*perk('genoma'):0)));
  bus.on('fruit', e => addRP(e.amount * 0.25 * (e.byDrone ? 0.6 : 1)));
  bus.on('sell', e => addRP(e.count * 0.12));
  bus.on('contractDone', c => addRP(c.reward.rp || 3));
  bus.on('objectiveDone', o => addRP((o.reward && o.reward.rp) || 2));
  bus.on('level', () => { state.rp += 5; });
}

// Laboratorio gera PP lentamente
export function updateResearch(dt) {
  const lab = buildingLevel('lab');
  if (lab) addRP(0.04 * lab * dt * (1+.2*perk('bancada')));
}

function missing(id) {
  const r = CONFIG.research[id];
  if (!hasBuilding('lab')) return 'Construa o Laboratorio';
  if (state.level < r.level) return 'Nivel ' + r.level;
  const pre = PREREQ[id].find(p => !hasResearch(p));
  if (pre) return 'Requer ' + CONFIG.research[pre].name;
  return null;
}

function doResearch(id) {
  const r = CONFIG.research[id];
  if (hasResearch(id) || missing(id)) return;
  if (state.rp < r.cost) { showToast('Pontos de pesquisa insuficientes', 'bad'); play('error'); return; }
  state.rp -= r.cost;
  state.research[id] = true;
  state.stats.research++;
  play('mission'); flash('research');
  showToast('Pesquisa concluida: ' + r.name, 'mission');
  bus.emit('research', id);
  updateHUD();
}

export function openLab() {
  openModal({
    id: 'research', title: 'Laboratorio - Pesquisa', wide: true, hint: 'Pressione E ou ESC para fechar',
    build(body) {
      const head = document.createElement('div');
      head.className = 'summary';
      head.innerHTML = '<span>PONTOS DE PESQUISA</span><b>' + Math.floor(state.rp) + ' PP</b>';
      body.append(head);
      const info = document.createElement('p');
      info.className = 'hint';
      info.textContent = 'Ganhe PP colhendo, vendendo e concluindo contratos e missoes. O laboratorio tambem gera PP sozinho.';
      body.append(info);
      const ids = Object.keys(CONFIG.research).sort((a, b) => tierOf(a) - tierOf(b) || CONFIG.research[a].level - CONFIG.research[b].level);
      let lastTier = -1;
      const list = document.createElement('div'); list.className = 'list';
      for (const id of ids) {
        const t = tierOf(id);
        if (t !== lastTier) { list.append(section(t === 0 ? 'Fundamentos' : 'Etapa ' + (t + 1))); lastTier = t; }
        const r = CONFIG.research[id];
        const done = hasResearch(id), why = done ? null : missing(id);
        list.append(row({
          icon: r.icon, title: r.name, desc: r.desc, done, locked: !!why && !done,
          tag: done ? 'CONCLUIDA' : why ? why.toUpperCase() : r.cost + ' PP', tagCls: done ? 'good' : why ? 'bad' : '',
          buttons: done ? [] : [{ label: 'Pesquisar', disabled: !!why || state.rp < r.cost, onClick: () => doResearch(id) }]
        }));
      }
      body.append(list);
    }
  });
}
