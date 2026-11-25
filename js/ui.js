import {hosted,api,enterCloud,settle} from './cloud.js';
import {saveKeyFor} from './accounts.js';
import {PETS} from './actors.js';
import {CANS,canLevel} from './gear.js';
// Interface: HUD, notificacoes, janelas (modais), menus, configuracoes, conquistas e estatisticas.
import { register, login, lastNick, autoLogin, setRemember } from './accounts.js';
import { state, walletLabel, bus, HOTBAR, reputation, stockLimit, stockUsed, maxEnergy, waterCap, save, clearSave } from './state.js';
import { CONFIG } from './config.js';
import { applyVolumes, play, initAudio } from './audio.js';

export const $ = id => document.getElementById(id);
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

// ---------- Icones vetoriais simples (SVG, sem emoji) ----------
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICONS = {
  coin: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="9"/><path d="M9 9.5h5a1.7 1.7 0 0 1 0 3.5H10a1.7 1.7 0 0 0 0 3.5h5M12 7v2M12 16.5v2"/></svg>`,
  drop: `<svg viewBox="0 0 24 24" ${S}><path d="M12 3C8 8.5 6 11.5 6 15a6 6 0 0 0 12 0c0-3.5-2-6.5-6-12z"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" ${S}><path d="M13 2L5 14h6l-1 8 8-12h-6z"/></svg>`,
  star: `<svg viewBox="0 0 24 24" ${S}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>`,
  drone: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="2.5"/><path d="M9.5 9.5L5 5M14.5 9.5L19 5M9.5 14.5L5 19M14.5 14.5L19 19"/><circle cx="4.5" cy="4.5" r="2"/><circle cx="19.5" cy="4.5" r="2"/><circle cx="4.5" cy="19.5" r="2"/><circle cx="19.5" cy="19.5" r="2"/></svg>`,
  cloud: `<svg viewBox="0 0 24 24" ${S}><path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z"/></svg>`,
  scroll: `<svg viewBox="0 0 24 24" ${S}><path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M9 8h7M9 12h7M9 16h4"/></svg>`,
  box: `<svg viewBox="0 0 24 24" ${S}><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></svg>`,
  flask: `<svg viewBox="0 0 24 24" ${S}><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7.5 15h9"/></svg>`,
  crystal: `<svg viewBox="0 0 24 24" ${S}><path d="M12 2l6 7-6 13-6-13z"/><path d="M6 9h12M12 2v20"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>`,
  users: `<svg viewBox="0 0 24 24" ${S}><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.2c2.7.2 4.5 2.3 4.5 5.3"/></svg>`,
  leaf: `<svg viewBox="0 0 24 24" ${S}><path d="M5 19C5 10 10 5 20 4c0 10-5 15-14 15z"/><path d="M5 19l8-8"/></svg>`
};
export const icon = name => ICONS[name] || '';

// ---------- Estado interno da UI ----------
let lockFn = () => {};
let modal = null; // { id, title, build, opts, tab }
let onQuitCb = () => {};
let onStartCb = () => {};
let onSettingsCb = () => {};
let onMultiplayerCb = () => {};
let onLogoutCb = () => {};
let resumeVisible = false;

export function setLockHandler(fn) { lockFn = fn; }
export function isModalOpen() { return !!modal; }
export function modalId() { return modal ? modal.id : null; }

// ---------- Notificacoes (canto superior direito) ----------
export function showToast(text, kind = 'info') {
  const box = $('notifications');
  if (!box) return;
  const last = box.lastElementChild;
  if (last && last.dataset.text === text) { // agrupa mensagens repetidas
    const n = (Number(last.dataset.count) || 1) + 1;
    last.dataset.count = n;
    last.firstChild.textContent = text + '  x' + n;
    clearTimeout(last.timer);
    last.timer = setTimeout(() => last.remove(), 3600);
    return;
  }
  const n = el('div', 'note ' + kind);
  n.dataset.text = text;
  n.append(el('span', null, text));
  box.append(n);
  while (box.children.length > 5) box.firstElementChild.remove();
  n.timer = setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 400); }, 3600);
}

export function flash(kind) {
  const f = $('flash');
  if (!f) return;
  f.className = 'flash ' + kind;
  clearTimeout(f.timer);
  f.timer = setTimeout(() => { f.className = 'flash'; }, 1400);
}

export function setBanner(text, kind = '') {
  const b = $('eventBanner');
  if (!b) return;
  if (!text) { b.classList.add('hidden'); return; }
  b.textContent = text;
  b.className = 'event-banner ' + kind;
}

export function setPrompt(text) {
  const p = $('prompt');
  if (!p) return;
  if (text) { if (p.textContent !== text) p.textContent = text; p.classList.remove('hidden'); } else p.classList.add('hidden');
}

export function setBuildHint(text) {
  const h = $('buildHint');
  if (!text) { h.classList.add('hidden'); return; }
  h.textContent = text; h.classList.remove('hidden');
}

// ---------- HUD ----------
let hotbarBuilt = false;
function slotLabel(slot) {
  return slot.type === 'can' ? CANS[canLevel(state)-1].name : slot.type === 'seed' ? 'Semente: ' + CONFIG.crops[slot.crop].name : 'Muda: ' + CONFIG.trees[slot.tree].name;
}
function buildHotbar() {
  const bar = $('hotbar');
  bar.innerHTML = '';
  HOTBAR.forEach((slot, i) => {
    const d = el('div', 'slot' + (i === state.selectedSlot ? ' active' : ''));
    d.dataset.slot = i;
    d.append(el('span', 'key', String(i % PAGE + 1)));
    d.title=slotLabel(slot);
    const img=thumbnail(slot.crop||slot.tree||('can-'+canLevel(state)));d.append(img);
    const b = el('b', null, '0'); b.id = 'slot' + i;
    d.append(b);
    d.addEventListener('click', () => selectSlot(i));
    bar.append(d);
  });
  const pg = el('div', 'page'); pg.id = 'hotbarPage'; pg.title = 'Tab troca de pagina';
  pg.addEventListener('click', () => nextPage());
  bar.append(pg);
  hotbarBuilt = true;
  showPage();
}

const PAGE = CONFIG.hotbarPageSize;
function showPage() {
  const pages = Math.ceil(HOTBAR.length / PAGE);
  document.querySelectorAll('.slot').forEach(s => s.classList.toggle('hidden', Math.floor(Number(s.dataset.slot) / PAGE) !== state.hotbarPage));
  const pg = $('hotbarPage'); if (pg) pg.textContent = (state.hotbarPage + 1) + '/' + pages;
}
export function nextPage() {
  const pages = Math.ceil(HOTBAR.length / PAGE);
  state.hotbarPage = (state.hotbarPage + 1) % pages;
  showPage();
  selectSlot(Math.min(HOTBAR.length - 1, state.hotbarPage * PAGE));
}
export function selectSlot(index) {
  state.selectedSlot = index;
  const nm = $('slotName');
  if (nm && HOTBAR[index]) { nm.textContent = slotLabel(HOTBAR[index]); nm.classList.remove('fade'); clearTimeout(nm.t); nm.t = setTimeout(() => nm.classList.add('fade'), 1800); }
  if (Math.floor(index / PAGE) !== state.hotbarPage) { state.hotbarPage = Math.floor(index / PAGE); showPage(); }
  document.querySelectorAll('.slot').forEach(s => s.classList.toggle('active', Number(s.dataset.slot) === index));
}

function setText(id, v) { const e = $(id); if (e && e.textContent !== String(v)) e.textContent = v; }

function weatherText() {
  const parts = [];
  if (state.event) parts.push(CONFIG.events[state.event.id].name.toUpperCase() + ' ' + Math.ceil(state.event.left) + 's');
  if (state.boom) parts.push('ALTA: ' + CONFIG.crops[state.boom.crop].name.toUpperCase());
  return parts.length ? parts.join('  |  ') : 'CEU LIMPO';
}

export function updateHUD() {
  if (!hotbarBuilt) buildHotbar();
  const hour = Math.floor(state.time), minute = Math.floor((state.time % 1) * 60);
  const isDay = hour >= 6 && hour < 18;
  setText('clock', 'Dia ' + state.day + ' - ' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0') + (isDay ? '' : ' (noite)'));
  setText('zone', (state.zone || 'FAZENDA').toLowerCase());
  setText('money', walletLabel());
  const cap = waterCap();
  setText('water', Math.floor(state.water) + ' / ' + cap);
  $('waterFill').style.width = Math.min(100, state.water / state.maxWater * 100) + '%';
  const me = maxEnergy();
  setText('energy', Math.floor(state.energy) + ' / ' + me);
  $('energyFill').style.width = Math.min(100, state.energy / me * 100) + '%';
  setText('level', state.level);
  $('xpFill').style.width = Math.min(100, state.xp / state.xpNeeded * 100) + '%';
  setText('rp', Math.floor(state.rp));
  setText('rep', reputation());
  setText('crystals', state.crystals);
  $('crystalRow').classList.toggle('hidden', !state.islandUnlocked && state.crystals === 0);
  setText('objectiveText', state.objective.text + (state.objective.target ? ' (' + Math.min(state.objective.progress, state.objective.target) + '/' + state.objective.target + ')' : ''));

  // Indicadores: so aparecem quando ha algo relevante
  const showChip = (id, text, cls) => {
    const c = $('chip-' + id);
    if (!text) { c.classList.add('hidden'); return; }
    c.classList.remove('hidden'); c.className = 'chip ' + (cls || '');
    setText('ind-' + id, text);
  };
  const dr = { active: 0, charging: 0, dead: 0 };
  state.drones.forEach(d => { dr[d.status] = (dr[d.status] || 0) + 1; });
  showChip('drone', !state.drones.length ? '' : dr.dead ? dr.dead + ' drone sem energia' : state.drones.length + (state.drones.length > 1 ? ' drones' : ' drone'), dr.dead ? 'bad' : '');
  showChip('weather', state.event ? CONFIG.events[state.event.id].name + ' ' + Math.ceil(state.event.left) + 's' : state.boom ? 'Alta: ' + CONFIG.crops[state.boom.crop].name : '', state.event ? (state.event.id === 'rain' ? 'good' : 'bad') : 'gold');
  const ready = state.contracts.active.filter(c => c.progress >= c.amount).length;
  showChip('contracts', ready ? ready + (ready > 1 ? ' contratos prontos' : ' contrato pronto') : '', 'gold');
  const used = stockUsed(), lim = stockLimit();
  showChip('stock', used >= lim * 0.85 ? 'Estoque ' + used + ' / ' + lim : '', used >= lim ? 'bad' : 'gold');

  // Hotbar
  HOTBAR.forEach((slot, i) => {
    const b = $('slot' + i); if (!b) return;
    if (slot.type === 'can') {
      b.textContent=Math.floor(state.water);const img=b.parentElement.querySelector('img'),key='can-'+canLevel(state);
      if(img.dataset.key!==key){img.dataset.key=key;img.src='assets/items/'+key+'.png';b.parentElement.title=slotLabel(slot);}
    }
    else if (slot.type === 'sapling') b.textContent = state.saplings[slot.tree];
    else b.textContent = state.seeds[slot.crop];
    const locked = (slot.type === 'seed' && state.level < CONFIG.crops[slot.crop].level) || (slot.type === 'sapling' && state.level < CONFIG.trees[slot.tree].level);
    b.parentElement.classList.toggle('locked', locked);
  });
}

// ---------- Janelas (modais) ----------
export function progressBar(frac, cls = '', text = '') {
  const b = el('div', 'bar ' + cls);
  const f = el('div', 'fill'); f.style.width = Math.max(0, Math.min(100, frac * 100)) + '%';
  b.append(f);
  if (text) b.append(el('span', null, text));
  return b;
}

export function row(o) {
  const r = el('div', 'shop-item' + (o.locked ? ' locked' : '') + (o.done ? ' done' : ''));
  const info = el('div', 'info');
  const head = el('div', 'head');
  if(o.thumb){const tile=el('div','product-image');tile.append(thumbnail(o.thumb));r.append(tile);}
  else if (o.icon || o.color != null) {
    const i = el('span', 'ico'); i.textContent = o.icon || '';
    if (o.color != null) { const h = '#' + o.color.toString(16).padStart(6, '0'); i.style.background = 'linear-gradient(145deg,' + h + ',' + h + '99)'; i.style.boxShadow = '0 0 12px ' + h + '66'; }
    head.append(i);
  }
  head.append(el('b', null, o.title));
  if (o.tag) head.append(el('span', 'badge ' + (o.tagCls || ''), o.tag));
  info.append(head);
  if(o.species){
    r.classList.add('seed-packet');
    r.style.setProperty('--species','#'+o.color.toString(16).padStart(6,'0'));
    info.append(el('span','species',o.species));
    const stats=el('dl','seed-stats');
    for(const [label,value] of o.growing){
      const stat=el('div');stat.append(el('dt',null,label),el('dd',null,String(value)));stats.append(stat);
    }
    info.append(stats);
  }
  if (o.desc) info.append(el('small', null, o.desc));
  if (o.bar) info.append(progressBar(o.bar.frac, o.bar.cls, o.bar.text));
  r.append(info);
  if (o.buttons && o.buttons.length) {
    const box = el('div', 'btns');
    o.buttons.forEach(b => {
      const bt = el('button', b.cls || '', b.label);
      bt.type = 'button'; bt.disabled = !!b.disabled;
      bt.addEventListener('click', async () => {
        bt.disabled = true;
        let res;
        try { res = await b.onClick?.(); } finally { bt.disabled = !!b.disabled; }
        if (res === 'close') closeModal();
        else if (res !== 'keep') refreshModal();
        updateHUD();
      });
      box.append(bt);
    });
    r.append(box);
  }
  return r;
}

export function section(title) { return el('h4', 'section', title); }

// Abas dentro de uma janela. Retorna o container de conteudo.
export function makeTabs(body, names) {
  const bar = el('div', 'tabs');
  const idx = Math.min(modal.tab || 0, names.length - 1);
  names.forEach((n, i) => {
    const b = el('button', 'tab' + (i === idx ? ' active' : ''), n);
    b.type = 'button';
    b.addEventListener('click', () => { modal.tab = i; play('click'); refreshModal(); });
    bar.append(b);
  });
  const box = el('div', 'tab-body');
  body.append(bar, box);
  return { box, index: idx };
}

export function openModal(opts) {
  const same = modal && modal.id === opts.id;
  const wasOpen = !!modal;
  modal = { id: opts.id, title: opts.title, build: opts.build, opts, tab: same ? modal.tab : 0 };
  state.paused = true;
  $('modalTitle').textContent = opts.title;
  $('modal').dataset.view=opts.id; $('modal').dataset.market=String(opts.title==='Mercado');
  $('modal').className = 'panel' + (opts.wide ? ' wide' : '');
  $('modalBackdrop').classList.remove('hidden');
  $('modalHint').textContent = opts.hint || 'Pressione ESC para fechar';
  $('modalClose').classList.toggle('hidden', !!opts.noClose);
  renderModal(0);
  if (!wasOpen && document.pointerLockElement) document.exitPointerLock();
  showResume(false);
}

function renderModal(scroll) {
  const body = $('modalBody');
  body.innerHTML = '';
  modal.build(body);
  body.scrollTop = scroll;
}

export function refreshModal() {
  if (!modal) return;
  const s = $('modalBody').scrollTop;
  renderModal(s);
}

export function closeModal(relock = true) {
  if (!modal) return;
  const opts = modal.opts;
  modal = null;
  $('modal').classList.add('hidden');
  $('modalBackdrop').classList.add('hidden');
  state.paused = false;
  if (opts.onClose) opts.onClose();
  if (state.mode === 'play' && relock) {
    lockFn();
    setTimeout(() => {
      if (!document.pointerLockElement && state.mode === 'play' && !modal) showResume(true);
    }, 220);
  }
}

export function showResume(v) {
  if (document.body.classList.contains('touch')) v = false;
  resumeVisible = v;
  const r = $('resume');
  if (r) r.classList.toggle('hidden', !v);
}
export const isResumeVisible = () => resumeVisible;

// ---------- Loja generica com abas ----------
export function openShop(title, buildTabs) {
  openModal({
    id: 'shop', title, wide: true, hint: 'Pressione E ou ESC para fechar',
    build(body) {
      const summary=el('div','wallet-line');
      summary.append(el('strong',null,walletLabel()+' CR'),el('span',null,'Estoque '+stockUsed()+' / '+stockLimit()));body.append(summary);
      const tabs = buildTabs();
      const { box, index } = makeTabs(body, tabs.map(t => t.name));
      const list = el('div', 'list');
      tabs[index].items.forEach(it => list.append(it instanceof HTMLElement ? it : row(it)));
      box.append(list);
    }
  });
}

// ---------- Inventario ----------
export function toggleInventory() {
  if (modal && modal.id === 'inventory') { closeModal(); return; }
  if (modal) return;
  openModal({
    id:'inventory',title:'Mochila',wide:true,hint:'I ou Esc para fechar',
    build(body){
      const summary=el('div','wallet-line');summary.append(el('strong',null,walletLabel()+' CR'),el('span',null,'Estoque '+stockUsed()+' / '+stockLimit()));body.append(summary);
      const {box,index}=makeTabs(body,['Plantio','Colheitas','Equipamento','Pets']);
      const grid=el('div','inventory-cards');box.append(grid);
      const card=(key,title,value,action)=>{
        const node=el(action?'button':'div','pack-card');if(action){node.type='button';node.onclick=action;}
        if(key)node.append(thumbnail(key));
        node.append(el('strong',null,title),el('small',null,value));grid.append(node);
      };
      if(index===0){
        HOTBAR.forEach((s,i)=>{
          if(s.type==='can')return;
          const qty=s.type==='seed'?state.seeds[s.crop]:state.saplings[s.tree];
          if(qty>0)card(s.crop||s.tree,slotLabel(s),qty+' · Equipar',()=>{selectSlot(i);closeModal();});
        });
        if(!grid.childElementCount)grid.append(el('p',null,'Compre sementes ou mudas na Loja Geral.'));
      }else if(index===1){
        for(const [counts,table,field] of [[state.crops,CONFIG.crops,'name'],[state.fruits,CONFIG.trees,'fruit'],[state.products,CONFIG.products,'name']])
          for(const [key,n] of Object.entries(counts))if(n>0&&table[key])card(key,table[key][field],n+' no estoque');
        for(const [key,n] of Object.entries(state.mutated)){const [m,k]=key.split(':');if(n>0&&CONFIG.crops[k]&&CONFIG.mutations[m])card(k,CONFIG.crops[k].name+' '+CONFIG.mutations[m].name,n+' no estoque');}
        if(state.crystals)card('crystal','Cristais',String(state.crystals));
        if(!grid.childElementCount)grid.append(el('p',null,'As plantas e os frutos que você colher aparecem aqui.'));
      }else if(index===2){
        card('can-'+canLevel(state),CANS[canLevel(state)-1].name,Math.floor(state.water)+' / '+waterCap()+' de água · Equipar',()=>{selectSlot(2);closeModal();});
        for(const [label,value] of [['Botas','Nível '+state.speedLevel],['Luvas','Nível '+state.yieldLevel],['Energia',Math.floor(state.energy)+' / '+maxEnergy()],['Pesquisa',Math.floor(state.rp)+' PP'],['Reputação',reputation()]])card(null,label,String(value));
      }else{
        const pets=petRows(false);grid.className='list';
        if(!pets.length)grid.append(el('p',null,'Adote seu primeiro companheiro na aba Pets da Loja Geral. O gato é grátis.'));
        pets.forEach(p=>grid.append(row(p)));
      }
    }
  });
}

// ---------- Pausa, configuracoes, estatisticas, conquistas ----------
let adminSession=false;
function openAdmin(){
  openModal({id:'admin',title:'Observatório · ADM',hint:'Comandos para sua fazenda. Em sala, o anfitrião transmite o clima.',build(body){
    const list=el('div','menu-list');body.append(list);
    for(const id of ['rain','tempest','aurora','meteor']){
      const b=menuButton(CONFIG.events[id].name,async()=>{
        b.disabled=true;
        const {netInfo}=await import('./net.js');
        if(id!=='meteor' && netInfo().mode==='guest'){
          b.disabled=false;showToast('Crie a sala para controlar o clima.','info');return;
        }
        const r=await api('admin',{event:id});
        b.disabled=false;
        if(!r.ok){showToast(r.error,'bad');return;}
        if(modalId()!=='admin')return;
        const {triggerEvent}=await import('./events.js');
        closeModal();triggerEvent(r.event);save();
      });
      list.append(b);
    }
    list.append(menuButton('Voltar',openPauseMenu,'secondary'));
  }});
}
function menuButton(label, fn, cls = '') {
  const b = el('button', 'big ' + cls, label);
  b.type = 'button';
  b.addEventListener('click', () => { play('click'); fn(); });
  return b;
}

export function openPauseMenu() {
  openModal({
    id: 'pause', title: 'Pausa', hint: 'Pressione ESC para continuar',
    build(body) {
      const box = el('div', 'menu-list');
      box.append(
        menuButton('Continuar', () => closeModal()),
        ...(adminSession?[menuButton('Observatório ADM',openAdmin)]:[]),
        menuButton('Mochila',()=>{closeModal(false);toggleInventory();},'secondary'),
        menuButton('Salvar', () => { save(); showToast('Jogo salvo', 'good'); play('buy'); }),
        menuButton('Multiplayer', () => onMultiplayerCb(), 'secondary'),
        menuButton('Configuracoes', openSettings, 'secondary'),
        menuButton('Estatisticas', openStats, 'secondary'),
        menuButton('Conquistas', openAchievements, 'secondary'),
        menuButton('Sair', () => { save(); closeModal(false); onQuitCb(); }, 'secondary')
      );
      body.append(box);
    }
  });
}

export function openSettings() {
  const back = () => (state.mode === 'play' ? openPauseMenu() : closeModal(false));
  openModal({
    id: 'settings', title: 'Configuracoes', hint: 'Pressione ESC para voltar',
    onClose: () => { if (state.mode === 'play') save(); },
    build(body) {
      const slider = (label, key, min, max, step, fmt, after) => {
        const r = el('div', 'setting');
        const val = el('b', null, fmt(state.settings[key]));
        r.append(el('span', null, label), val);
        const inp = el('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = state.settings[key];
        inp.addEventListener('input', () => { state.settings[key] = Number(inp.value); val.textContent = fmt(state.settings[key]); if (after) after(); });
        r.append(inp);
        body.append(r);
      };
      const pct = v => Math.round(v * 100) + '%';
      const mult = v => v.toFixed(2) + 'x';
      slider('Volume geral', 'volume', 0, 1, 0.01, pct, () => applyVolumes());
      slider('Volume da musica', 'music', 0, 1, 0.01, pct, () => applyVolumes());
      slider('Sensibilidade do mouse', 'mouseSens', 0.3, 2.5, 0.05, mult);
      slider('Sensibilidade do zoom', 'zoomSens', 0.3, 2.5, 0.05, mult);
      const q = el('div', 'setting');
      q.append(el('span', null, 'Qualidade grafica'));
      const opts = el('div', 'seg');
      ['baixa', 'media', 'alta'].forEach(name => {
        const b = el('button', name === state.settings.quality ? 'active' : '', name.toUpperCase());
        b.type = 'button';
        b.textContent = {baixa:'Baixo',media:'Médio',alta:'Alto'}[name];
        b.setAttribute('aria-pressed',String(name===state.settings.quality));
        b.addEventListener('click', () => { state.settings.quality = name; onSettingsCb(); if(state.mode==='play') save(); refreshModal(); });
        opts.append(b);
      });
      q.append(opts);
      body.append(q, el('p','hint',{
        baixa:'Desempenho: resolução reduzida, céu simplificado, sem sombras ou contornos.',
        media:'Equilibrado: nuvens, planeta, contornos e sombras de 1024 px.',
        alta:'Detalhado: planeta com anéis, 500 estrelas à noite, sombras suaves de 2048 px e mais partículas.'
      }[state.settings.quality]));
      body.append(menuButton('Voltar', back, 'secondary'));
    }
  });
}

export function openStats() {
  openModal({
    id: 'stats', title: 'Estatisticas', hint: 'Pressione ESC para voltar',
    build(body) {
      const s = state.stats;
      const grid = el('div', 'inv-grid');
      grid.append(
        invItem('Plantas colhidas', s.harvested), invItem('Creditos ganhos', Math.floor(s.earned)),
        invItem('Construcoes colocadas', s.built), invItem('Dias jogados', state.day),
        invItem('Contratos concluidos', s.contracts), invItem('Pesquisas concluidas', s.research),
        invItem('Produtos vendidos', s.sold), invItem('Tempo de jogo', Math.floor(s.play / 60) + ' min'),
        invItem('Nivel', state.level), invItem('Reputacao', reputation())
      );
      body.append(grid);
      if (state.mode === 'play') body.append(menuButton('Voltar', openPauseMenu, 'secondary'));
    }
  });
}

export function openAchievements() {
  openModal({
    id: 'achievements', title: 'Conquistas', wide: true, hint: 'Pressione ESC para voltar',
    build(body) {
      const rep = reputation();
      const done = Object.keys(state.achievements).length;
      body.append(el('p', 'hint', done + ' de ' + CONFIG.achievements.length + ' conquistas'));
      const list = el('div', 'list');
      CONFIG.achievements.forEach(a => {
        const got = !!state.achievements[a.id];
        const cur = Math.min(a.goal, a.get(state, rep));
        list.append(row({
          title: a.name, desc: a.desc + '  |  Recompensa: ' + a.reward + ' CR', done: got,
          tag: got ? 'CONCLUIDA' : Math.floor(cur) + ' / ' + a.goal, tagCls: got ? 'good' : '',
          bar: { frac: cur / a.goal, cls: got ? 'gold' : '' }
        }));
      });
      body.append(list);
      if (state.mode === 'play') body.append(menuButton('Voltar', openPauseMenu, 'secondary'));
    }
  });
}

// ---------- Ligacao com a pagina ----------
export function setAccountName(n) { $('accountName').textContent = n; }
export function setNetChip(text) {
  const c = $('chip-net');
  if (!text) { c.classList.add('hidden'); return; }
  c.classList.remove('hidden'); $('ind-net').textContent = text;
}

// Tela de login e cadastro: resolve com o nick quando a conta entra
export async function showLogin() {
  const remember = () => $('authRemember').checked;
  const enter = r => {
    adminSession=r.orbitalPass===true;
    enterCloud(r,saveKeyFor(r.nick));
    if(r.recovery){
      $('recoveryCode').textContent=r.recovery.match(/.{4}/g).join('-');
      $('recoveryNotice').hidden=false;
      $('recoveryDismiss').onclick=()=>{$('recoveryNotice').hidden=true;$('recoveryCode').textContent='';};
    }
    return {nick:r.nick,orbitalPass:r.orbitalPass===true,imported:!!r.imported};
  };
  if(!location.search.includes('relogin')){
    const auto=hosted?await api('session'):autoLogin();
    if(auto?.ok)return hosted?enter(auto):auto;
  }
  return new Promise(resolve=>{
    const box=$('login'),form=$('authForm'),msg=$('authMsg');
    let mode='login',busy=false;
    $('authLocation').textContent=hosted?'Conta e fazenda ficam salvas neste servidor.':'Modo local. Contas e progresso ficam neste navegador.';
    $('tabRecover').hidden=!hosted;
    box.classList.remove('hidden');$('menu').classList.add('hidden');
    $('authNick').value=lastNick();$('authPass').value='';
    const setMode=m=>{
      mode=m;msg.textContent='';
      for(const [id,value] of [['tabLogin','login'],['tabRegister','register'],['tabRecover','recover']])$(id).classList.toggle('active',m===value);
      $('authPass2Row').classList.toggle('hidden',m==='login');
      $('recoverRow').classList.toggle('hidden',m!=='recover');
      $('authPass').autocomplete=m==='login'?'current-password':'new-password';
      $('authPass').placeholder=m==='recover'?'nova senha':'sua senha';
      $('authSubmit').textContent=m==='login'?'Entrar':m==='recover'?'Redefinir senha':'Criar conta e jogar';
    };
    $('tabLogin').onclick=()=>setMode('login');$('tabRegister').onclick=()=>setMode('register');$('tabRecover').onclick=()=>setMode('recover');setMode('login');
    form.onsubmit=async e=>{
      e.preventDefault();if(busy)return;
      const nick=$('authNick').value.trim(),pass=$('authPass').value;
      if(mode!=='login'&&pass!==$('authPass2').value){msg.textContent='As senhas não conferem.';return;}
      busy=true;$('authSubmit').disabled=true;msg.textContent='Verificando…';
      try{
        let r;
        if(hosted){
          const data={nick,pass,remember:remember(),code:$('recoverKey').value};
          const local=Object.hasOwn(JSON.parse(localStorage.getItem('fazenda-accounts-v1')||'{}'),nick.toLowerCase());
          const migrating=local&&(mode==='register'||mode==='login')&&(await login(nick,pass)).ok;
          if(mode==='register'&&local&&!migrating){msg.textContent='Para importar esta fazenda, use a senha da conta local.';return;}
          const initialSave=migrating?JSON.parse(localStorage.getItem(saveKeyFor(nick))||'null'):null;
          if(mode==='register'&&initialSave)data.initialSave=initialSave;
          r=await api(mode,data);
          if(mode==='login'&&r.status===401&&migrating){
            const created=await api('register',{...data,initialSave});if(created.ok)r={...created,imported:true};else if(created.status!==409)r=created;
          }
        }else r=mode==='register'?await register(nick,pass):await login(nick,pass);
        if(!r.ok){msg.textContent=r.error;play('error');return;}
        if(!hosted)setRemember(r.nick,remember());
        box.classList.add('hidden');resolve(hosted?enter(r):r);
      }catch{msg.textContent='Falha ao abrir a conta. Tente novamente.';}
      finally{busy=false;$('authSubmit').disabled=false;}
    };
  });
}

export function showMainMenu(hasSave) {
  $('menu').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('startBtn').textContent = hasSave ? 'Continuar' : 'Jogar';
  state.mode = 'menu';
  state.paused = true;
}

export function bindUI(cb) {
  onStartCb = cb.onStart; onQuitCb = cb.onQuit; onSettingsCb = cb.onSettings || (() => {});
  onMultiplayerCb = cb.onMultiplayer || (() => {}); onLogoutCb = cb.onLogout || (() => {});
  buildHotbar();

  $('startBtn').addEventListener('click', e => {
    e.preventDefault();
    initAudio();
    $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
    state.mode = 'play';
    state.paused = false;
    onStartCb();
    updateHUD();
  });
  let confirmReset = false;
  $('resetBtn').addEventListener('click', async e => {
    e.preventDefault();
    if (!confirmReset) {
      confirmReset = true; $('resetBtn').textContent = 'Clique de novo para confirmar';
      setTimeout(() => { confirmReset = false; $('resetBtn').textContent = 'Apagar progresso'; }, 3500);
      return;
    }
    clearSave(); if(!hosted||await settle())location.reload();
  });
  $('mpBtn').addEventListener('click', e => { e.preventDefault(); initAudio(); onMultiplayerCb(); });
  $('logoutBtn').addEventListener('click', async e => {
    e.preventDefault();
    if(hosted){await settle();const r=await api('logout',{});if(!r.ok){showToast(r.error,'bad');return;}}
    setRemember('',false);onLogoutCb();
  });
  $('settingsBtn').addEventListener('click', e => { e.preventDefault(); initAudio(); openSettings(); });

  $('modalClose').addEventListener('click', () => { if (state.mode === 'menu') closeModal(false); else closeModal(); });
  $('modalBackdrop').addEventListener('click', () => { if (modal && !modal.opts.noClose) { if (state.mode === 'menu') closeModal(false); else closeModal(); } });
  $('resume').addEventListener('click', () => { showResume(false); lockFn(); });

  addEventListener('keydown', e => {
    if (e.code === 'Escape' && modal) {
      // Esc volta ao menu de pausa quando estiver em submenu, ou fecha a janela
      if (state.mode === 'play' && ['settings', 'stats', 'achievements'].includes(modal.id)) openPauseMenu();
      else if (state.mode === 'menu') closeModal(false);
      else closeModal();
    }
  });

  // Pointer Lock: Esc libera o mouse e abre o menu de pausa
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) { showResume(false); return; }
    if (state.mode === 'play' && !modal && !resumeVisible) openPauseMenu();
  });
  document.addEventListener('pointerlockerror', () => { if (state.mode === 'play' && !modal) showResume(true); });
}

function thumbnail(key){
  const img=el('img','item-model');img.alt='';img.draggable=false;img.src='assets/items/'+key+'.png';return img;
}
export function petRows(shop){
  return Object.entries(PETS).filter(([key])=>shop||state.adoptedPets.includes(key)).map(([key,def])=>{
    const owned=state.adoptedPets.includes(key),active=state.activePet===key;
    return {title:def.name,thumb:'pet-'+key,desc:def.desc,tag:active?'ACOMPANHANDO':owned?'ADOTADO':def.cost?def.cost+' CR':'GRÁTIS',
      buttons:[{label:active?'Descansar':owned?'Chamar':'Adotar',disabled:!owned&&state.money<def.cost,onClick:()=>{
        if(!state.adoptedPets.includes(key)){
          if(state.money<def.cost)return;
          state.money-=def.cost;state.adoptedPets.push(key);
        }
        state.activePet=active?null:key;save();play('buy');
        showToast(active?def.name+' foi descansar':def.name+' está com você','good');
      }}]};
  });
}
