import {setSprite} from './pixel-sprites.js';
// Prestigio ("Ascensao"): reinicia a fazenda em troca de Estrelas, gastas em melhorias permanentes
// e que liberam plantas exclusivas. Conquistas, album, pets, recompensa diaria e configuracoes ficam.
import { state, save, setObjective, perk, waterCap, maxEnergy } from './state.js';
import {planetAt} from './planets.js';
import { CONFIG } from './config.js';
import { settle } from './cloud.js';
import { play } from './audio.js';
import { openModal, refreshModal, updateHUD, row, section, makeTabs, showToast, openPauseMenu, progressBar } from './ui.js';

const P = () => CONFIG.prestige;
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

export const runEarned = () => Math.max(0, state.stats.earned - state.prestige.runStart);
export const requiredLevel = () => P().minLevel + 6 * state.prestige.rank;
export const canAscend = () => state.level >= requiredLevel();

// Estrelas ganhas se ascender agora
export function ascendGain() {
  if (!canAscend()) return 0;
  const base = Math.floor(Math.sqrt(runEarned() / 2500)) + Math.floor((state.level - requiredLevel()) / 2) + 1;
  return Math.max(1, 4 + 2*state.prestige.rank + Math.round(base * (1 + 0.1 * state.prestige.rank)));
}

// A partir da quarta ascensão cada patente abre outro nível nos nove ramos.
const perkLimit = def => def.max + Math.max(0,state.prestige.rank-3);
export const perkCost = (def, lv) => def.base + def.step * lv;

export function buyPerk(id) {
  const def = P().perks.find(p => p.id === id), lv = perk(id);
  if (!def || skillLock(id) || lv >= perkLimit(def)) return false;
  const cost = perkCost(def, lv);
  if (state.prestige.stars < cost) return false;
  state.prestige.stars -= cost;
  state.prestige.upgrades[id] = lv + 1;
  save(); play('buy');
  showToast(def.name + ' nivel ' + (lv + 1), 'good');
  return true;
}

// Valores iniciais de uma fazenda nova (campos de progresso da partida)
function freshRun() {
  const crops = Object.fromEntries(CONFIG.cropOrder.map(k => [k, 0]));
  const rank=state.prestige.rank;
  const lvl = 1 + Math.min(8,rank) + 2 * perk('start');
  return {
    money: 200*rank, water: waterCap(),
    energy: maxEnergy(),
    seeds: { ...crops, lettuce: 6+rank, strawberry: 3+rank }, crops: { ...crops },
    products: Object.fromEntries(Object.keys(CONFIG.products).map(k => [k, 0])),
    saplings: Object.fromEntries(CONFIG.treeOrder.map(k => [k, 0])), fruits: Object.fromEntries(CONFIG.treeOrder.map(k => [k, 0])), mutated: {},
    trees: [], nextTreeId: 1,
    level: lvl, xp: 0, xpNeeded: Math.round(40 * Math.pow(1.4, Math.min(11,lvl - 1))) + 240*Math.max(0,lvl-12),
    time: 8, day: 1, harvestsToday: 0,
    contracts: { active: [], done: 0, nextSpawn: 20, nextId: 1 },
    event: null, nextEventIn: 150, boom: null,
    merchantUntil:0, pickups: [], nextPickupId: 1,
    plots: [], savedPlots: []
  };
}

export async function ascend() {
  if (!canAscend()) return false;
  const gain = ascendGain(), p = state.prestige;
  p.stars += gain; p.total += gain; p.rank++;
  Object.assign(state, freshRun());
  p.runStart = state.stats.earned;
  setObjective(0);
  state.activePet = state.activePet || null;
  save();
  play('mission');
  // A cópia local guarda a nova partida enquanto a fila da nuvem sincroniza.
  await settle();
  location.reload(); // recria o mundo a partir do save limpo
  return true;
}

export function openPrestige() {
  let confirming = false, selectedSkill='growth';
  openModal({
    id: 'prestige', title: 'Prestígio', wide: true, hint: 'Pressione ESC para voltar',
    build(body) {
      const p = state.prestige;
      body.append(el('p', 'hint', 'Ascensoes: ' + p.rank + '  |  Estrelas: ' + p.stars + '  |  Total ganho: ' + p.total));
      const { box, index } = makeTabs(body, ['Ascensão', 'Árvore de habilidades', 'Desbloqueios']);
      if (index === 0) {
        const gain = ascendGain(), ok = canAscend();
        const rank=p.rank+1;
        box.append(section('Próximo destino · '+planetAt(rank).name),
          el('p','hint','Você leva construções, drones e módulos, terreno, equipamentos, pesquisas, cristais, pets e coleção.'),
          el('p','hint','A safra termina. Saldo, inventário agrícola, árvores, canteiros e contratos são reiniciados. Você chega com '+200*rank+' CR, '+(6+rank)+' alfaces e '+(3+rank)+' morangos em sementes.'),
          el('p','hint','Bônus total no novo mundo: +'+10*rank+'% de crescimento, +'+15*rank+'% de XP base e +'+25*rank+' espaços de estoque.'));
        box.append(progressBar(Math.min(1, state.level / requiredLevel()), ok ? 'gold' : '', 'Nivel ' + Math.min(state.level, requiredLevel()) + ' / ' + requiredLevel()));
        const list = el('div', 'list');
        list.append(row({
          title: 'Ascender', locked: !ok, tag: ok ? '+' + gain + ' ESTRELAS' : 'NIVEL ' + requiredLevel(), tagCls: ok ? 'good' : 'bad',
          desc: ok ? 'Ganho desta partida: ' + runEarned().toLocaleString('pt-BR') + ' CR faturados e nivel ' + state.level + '. A recompensa inclui um bônus fixo crescente por ascensão.' : 'Chegue ao nivel ' + requiredLevel() + ' para ascender.',
          buttons: [{ label: confirming ? 'Confirmar reinicio' : 'Ascender', cls: confirming ? 'danger' : '', disabled: !ok,
            onClick: async () => { if (!confirming) { confirming = true; return; } await ascend(); return 'keep'; } }]
        }));
        box.append(list);
      } else if (index === 1) {
        drawSkills(box,selectedSkill,id=>{selectedSkill=id;});
      } else {
        box.append(el('p', 'hint', 'Os três primeiros prestígios liberam sementes, suprimentos e habilidades. Do quarto em diante, cada ascensão abre mais um nível em cada habilidade e reforça os suprimentos.'));
        const list = el('div', 'list');
        for (const k of CONFIG.cropOrder) {
          const c = CONFIG.crops[k];
          if (!c.prestige) continue;
          const open = p.rank >= c.prestige;
          list.append(row({
            thumb: open ? k : undefined, color: open ? undefined : c.color, title: open ? c.name : '???', locked: !open, done: open,
            tag: open ? 'LIBERADA' : 'PRESTIGIO ' + c.prestige, tagCls: open ? 'good' : 'bad',
            desc: c.planet ? 'Sementes da carroça · Origem: '+c.planet : open ? 'Venda: ' + c.sellPrice + ' CR  |  Colheita: ' + c.growTime + 's  |  '+(c.planet?'Na carroça':'Na Loja Geral')+' (nível ' + c.level + ').' : 'Ascenda ' + c.prestige + ' vez' + (c.prestige > 1 ? 'es' : '') + ' para liberar.'
          }));
        }
        for(const [i,name] of ['Regador de névoa e célula de plasma','Regador de magma e lente de campo','Regador gravitacional e pérola de Nix'].entries())list.append(row({title:planetAt(i+1).name,desc:name,tag:'PRESTÍGIO '+(i+1)}));
        for(const offer of supplies)list.append(row({title:offer.name,desc:offer.description,tag:'PRESTÍGIO '+offer.rank}));
        box.append(list);
      }
      if (state.mode === 'play') {
        const b = el('button', 'big secondary', 'Voltar'); b.type = 'button';
        b.addEventListener('click', () => { play('click'); openPauseMenu(); });
        body.append(b);
      }
    }
  });
}

const branches = [
  {name:'Cultivo', skills:['growth','yield','mut']},
  {name:'Engenharia', skills:['water','energy','xp']},
  {name:'Comércio', skills:['cash','market','start']},
  {name:'Botânica', requires:'growth', skills:['pomar','orvalho','esporos']},
  {name:'Robótica', requires:'water', skills:['rotor','bobina','reserva']},
  {name:'Logística', requires:'cash', skills:['carga','frete','prazo']}
];

function skillLock(id){
  if(perk(id)>0)return ''; // Mantém os investimentos feitos antes da árvore.
  const branch=branches.find(b=>b.skills.includes(id));
  if(!branch)return 'Habilidade desconhecida';
  const tier=branch.skills.indexOf(id);
  const rank=tier+(branch.requires?2:1);
  if(state.prestige.rank<rank)return 'Requer prestígio '+rank;
  if(tier===0 && branch.requires && !perk(branch.requires))return 'Requer '+P().perks.find(s=>s.id===branch.requires).name+' Nv. 1';
  if(tier && !perk(branch.skills[tier-1])){
    const previous=P().perks.find(p=>p.id===branch.skills[tier-1]);
    return 'Requer '+previous.name+' Nv. 1';
  }
  return '';
}

function drawSkills(box, selected, remember){
  const map=el('div','grove-map'),detail=el('section','grove-detail');
  detail.setAttribute('aria-live','polite');
  const nodes=new Map();
  function select(id){
    remember(id);
    const def=P().perks.find(skill=>skill.id===id),lv=perk(id),cap=perkLimit(def);
    const cost=perkCost(def,lv),locked=skillLock(id);
    for(const [key,button] of nodes)button.setAttribute('aria-pressed',String(key===id));
    const heading=el('h4','',def.name);
    const action=el('button','grove-learn',lv>=cap?'Completa':locked || 'Aprender · '+cost+' ★');
    action.type='button';action.disabled=lv>=cap||!!locked||state.prestige.stars<cost;
    action.onclick=()=>{if(buyPerk(id)){refreshModal();updateHUD();}};
    detail.replaceChildren(heading,el('span','grove-level','Nível '+lv+' / '+cap),el('p','',def.desc),action);
  }
  const advanced=branches.some(b=>b.requires&&b.skills.includes(selected));
  const switcher=el('div','tabs');
  for(const [i,label] of ['Fundamentos','Especializações'].entries()){
    const button=el('button','tab'+(advanced===!!i?' active':''),label);
    button.type='button';button.setAttribute('aria-pressed',String(advanced===!!i));
    button.onclick=()=>{remember(i?'pomar':'growth');refreshModal();};
    switcher.append(button);
  }
  box.append(switcher);
  for(const branch of branches.filter(b=>!!b.requires===advanced)){
    const lane=el('section','grove-lane');
    lane.append(el('h4','',branch.name));
    for(const id of branch.skills){
      const def=P().perks.find(skill=>skill.id===id);
      const button=el('button','grove-rune'+(perk(id)?' learned':skillLock(id)?' locked':' available'));
      button.type='button';button.setAttribute('aria-label',def.name+', nível '+perk(id));
      const img=el('img');setSprite(img,'assets/skills/'+id+'.png');img.alt='';
      button.append(img,el('span','',String(perk(id))));
      button.onclick=()=>select(id);lane.append(button);nodes.set(id,button);
    }
    map.append(lane);
  }
  box.append(map,detail);select(selected);
}

const supplies=[
  {rank:1,name:'Caixa de plantio',description:'Receba sementes de alface e morango.',price:60},
  {rank:2,name:'Carga de campo',description:'Reponha água e energia da fazenda.',price:110},
  {rank:3,name:'Bolsa de pesquisa',description:'Receba pontos de pesquisa para o laboratório.',price:200}
];
function supplyAmount(offer){return [0,5,20,8][offer.rank]+Math.max(0,state.prestige.rank-offer.rank);}
export function cooperativeRows(){
  return supplies.map(offer=>{
    const amount=supplyAmount(offer);
    const effect=offer.rank===1?amount+' sementes de cada espécie':offer.rank===2?'Até '+amount+' de água e energia':amount+' PP';
    const full=()=>offer.rank===2 && state.water>=waterCap() && state.energy>=maxEnergy();
    return {title:offer.name,desc:offer.description+' '+effect+'. Cada prestígio posterior aumenta o conteúdo em 1.',
      tag:'PRESTÍGIO '+offer.rank,buttons:[{label:full()?'Reservas cheias':'Comprar · '+offer.price+' CR',
      disabled:state.prestige.rank<offer.rank||state.money<offer.price||full(),onClick:()=>{
        if(state.prestige.rank<offer.rank||state.money<offer.price||full())return;
        state.money-=offer.price;
        if(offer.rank===1){state.seeds.lettuce+=amount;state.seeds.strawberry+=amount;}
        if(offer.rank===2){state.water=Math.min(waterCap(),state.water+amount);state.energy=Math.min(maxEnergy(),state.energy+amount);}
        if(offer.rank===3)state.rp+=amount;
        play('buy');save();showToast(offer.name+' recebida','good');
      }}]};
  });
}
