import {startPrank,tickPrank,endPrank,prankNames} from './farm-pranks.js';
import {visiting,hosted,api} from './cloud.js';
import {makeFarmer,animateFarmer,companion,PETS} from './actors.js';
import {canModel} from './watering-can.js';
import {planetAt} from './planets.js';
import {planetGarden} from './colony-models.js';
import {canLevel,CANS} from './gear.js';
import {varySpecimen} from './botany.js';
import { waterJet } from './water.js';
// Multiplayer por codigo: um jogador cria a sala (host), os amigos entram pelo codigo.
// Cada jogador joga na propria fazenda; as fazendas dos outros aparecem em terrenos vizinhos (somente visualizacao).
// Transporte: WebRTC (PeerJS) por padrao; com ?net=local usa BroadcastChannel (duas abas do mesmo navegador, para testes).
import { relayAddress, fixedRelay, setRelayAddress, connectRelay } from './relay.js';
import * as THREE from 'three';
import { state, bus, save, stockFree, HOTBAR } from './state.js';
import { CONFIG } from './config.js';
import { geo, mat, glow, makeLabel, createStructureModel, applyStructureLevel, animateStructure } from './world.js';
import { addOutline } from './toon.js';
import { vcMat } from './optimize.js';
import { plotGeometry, cropGeometry, treeGeometry } from './game.js';
import { showToast, openModal, closeModal, el, row, setNetChip } from './ui.js';
import { play } from './audio.js';
import { applyWorldCommand, restoreEventVisuals } from './events.js';

const PREFIX = 'fazorb-v2-', MAX_REMOTE = 5;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// Deslocamento das fazendas dos outros jogadores (a cidade e a estrada ficam compartilhadas)
const SLOT_OFFSET = [{ x: 245, z: 0 }, { x: 0, z: 345 }, { x: 245, z: 345 }, { x: -245, z: 0 }, { x: -245, z: 345 }];
const FARM_RECT = { x0: -104, x1: -4, z0: -104, z1: 18 };
const LOCAL = new URLSearchParams(location.search).get('net') === 'local';

let scene, camera, world, nickOf = () => 'Jogador';
const N = { mode: 'solo', code: null, tr: null, myId: null, remotes: new Map(), tPos: 0, tFarm: 0, tSync: 0, tCull: 0, last: { x: 0, z: 0, r: 0 }, clock: 0 };

const rid = () => Math.random().toString(36).slice(2, 8);
const inFarm = (x, z) => x > FARM_RECT.x0 && x < FARM_RECT.x1 && z > FARM_RECT.z0 && z < FARM_RECT.z1;
const onIsland = (x,z) => Math.hypot(x-CONFIG.island.x,z-CONFIG.island.z) < CONFIG.island.radius-1;
const onParcel = (x,z,island) => inFarm(x,z) || (island && onIsland(x,z));
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

// ---------------------------------------------------------------- Transportes
function loadPeerJS() {
  return new Promise((res, rej) => {
    if (window.Peer) { res(); return; }
    // Copia local (js/vendor) primeiro; se faltar, tenta o CDN
    const load = src => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.append(s); });
    load(new URL('./vendor/peerjs.min.js', import.meta.url).href).then(res)
      .catch(() => load('https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js').then(res))
      .catch(() => rej(new Error('Nao foi possivel carregar o servico de conexao. Verifique sua internet.')));
  });
}

async function openPeer(id) {
  await loadPeerJS();
  const peer = new window.Peer(id, { debug: 0 });
  return new Promise((resolve, reject) => {
    const failed = error => {
      clearTimeout(timer); peer.destroy();
      reject(new Error(error?.type === 'unavailable-id' ? 'Código em uso. Crie outra sala.' :
        'Sinalização indisponível. Confira a internet ou abra o jogo pelo servidor do ZIP.'));
    };
    const timer = setTimeout(failed, 10000);
    peer.once('error', failed);
    peer.once('open', () => { clearTimeout(timer); peer.off('error', failed); resolve(peer); });
  });
}
async function hostPeer(code, h) {
  const peer = await openPeer(PREFIX + code);
  peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
  const conns = new Map();
  peer.on('connection', c => {
    c.on('open', () => { conns.set(c.peer, c); h.onPeer(c.peer); });
    c.on('data', m => h.onMsg(c.peer, m));
    c.on('close', () => { if (conns.delete(c.peer)) h.onGone(c.peer); });
    c.on('error', () => {});
  });
  return {
    id: peer.id,
    sendTo(id, m) { const c = conns.get(id); if (c && c.open) c.send(m); },
    broadcast(m, except) { conns.forEach((c, id) => { if (id !== except && c.open) c.send(m); }); },
    close() { peer.destroy(); }
  };
}

async function joinPeer(code, h) {
  const peer = await openPeer(undefined);
  const conn = peer.connect(PREFIX + code, { reliable: true });
  try {
    await new Promise((resolve, reject) => {
      const failed = () => { clearTimeout(timer); reject(new Error('Sala inacessível. Confira o código e a conexão do anfitrião.')); };
      const timer = setTimeout(failed, 12000);
      peer.once('error', failed); conn.once('error', failed);
      conn.once('open', () => { clearTimeout(timer); peer.off('error', failed); conn.off('error', failed); resolve(); });
    });
  } catch (error) { peer.destroy(); throw error; }
  conn.on('data', m => h.onMsg(null, m));
  conn.on('close', () => h.onGone());
  return { id: peer.id, sendHost(m) { if (conn.open) conn.send(m); }, close() { peer.destroy(); } };
}

async function hostLocal(code, h) {
  const ch = new BroadcastChannel(PREFIX + code), id = 'H' + rid(), peers = new Set();
  const post = (to, kind, msg) => ch.postMessage({ to, from: id, kind, msg });
  ch.onmessage = e => {
    const d = e.data;
    if (d.kind === 'ping') { post(d.from, 'ack'); return; }
    if (d.to !== id) return;
    if (d.kind === 'join') { peers.add(d.from); h.onPeer(d.from); }
    else if (d.kind === 'leave') { if (peers.delete(d.from)) h.onGone(d.from); }
    else if (d.kind === 'msg' && peers.has(d.from)) h.onMsg(d.from, d.msg);
  };
  return {
    id,
    sendTo(to, m) { post(to, 'msg', m); },
    broadcast(m, except) { peers.forEach(p => { if (p !== except) post(p, 'msg', m); }); },
    close() { ch.close(); }
  };
}

async function joinLocal(code, h) {
  const ch = new BroadcastChannel(PREFIX + code), id = 'G' + rid();
  const hostId = await new Promise((res, rej) => {
    const t = setTimeout(() => { ch.close(); rej(new Error('Sala nao encontrada')); }, 2500);
    ch.onmessage = e => { if (e.data.kind === 'ack' && e.data.to === id) { clearTimeout(t); res(e.data.from); } };
    ch.postMessage({ kind: 'ping', from: id });
  });
  ch.onmessage = e => { const d = e.data; if (d.to === id && d.kind === 'msg') h.onMsg(null, d.msg); };
  ch.postMessage({ to: hostId, from: id, kind: 'join' });

  return {
    id,
    sendHost(m) { ch.postMessage({ to: hostId, from: id, kind: 'msg', msg: m }); },
    close() { ch.postMessage({ to: hostId, from: id, kind: 'leave' }); ch.close(); }
  };
}

// ---------------------------------------------------------------- Avatares e fazendas remotas
const hueOf = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360; };

function makeAvatar(nick) {
  const g=makeFarmer(hueOf(nick));
  const label = makeLabel(nick, '#FFD166', 3.4, 0.76);
  label.position.y = 2.3; label.renderOrder = 20;
  if (label.material) { label.material.depthTest = false; label.material.fog = false; }
  g.add(label);
  g.userData.label = label;
  // facho de luz: permite achar o amigo de longe
  const beam = new THREE.Mesh(geo('cyl', 0.07, 0.07, 40, 6), glow(0xFFD166, 0.35)); beam.position.y = 22; g.add(beam);
  return g;
}

function disposeTree(obj) {
  obj.traverse(o => {
    if (o.isSprite && o.material.map) { o.material.map.dispose(); o.material.dispose(); }
    if (o.userData.ownedGeometry) o.geometry.dispose();
  });
}

function makeFarmView(nick, off) {
  const root = new THREE.Group(); root.position.set(off.x, 0, off.z);
  const soil = new THREE.Mesh(geo('box', 40, 0.2, 44), mat(0x8B5E3C)); soil.position.set(-32, 0.1, -24.5); soil.receiveShadow = true;
  const land=new THREE.Mesh(geo('box',100,5,122),mat(0x83C878));
  land.position.set(-54,-2.51,-43);land.receiveShadow=true;root.add(land,soil);
  const island=new THREE.Mesh(geo('cyl',CONFIG.island.radius,CONFIG.island.radius-4,6,32),mat(0x78C7B0));
  island.position.set(CONFIG.island.x,-3,CONFIG.island.z);island.visible=false;root.add(island);
  const label = makeLabel('FAZENDA DE ' + nick.toUpperCase(), '#FFD166', 8, 1.1); label.position.set(-32, 5, 1.5); root.add(label);
  const plotsG = new THREE.Group(), treesG = new THREE.Group(), structG = new THREE.Group();
  root.add(plotsG, treesG, structG);
  scene.add(root);
  return { root, land, soil, rank:0, island, label, plotsG, treesG, structG, plots: new Map(), structs: new Map(), treeSig: '' };
}

function applySnapshot(r, s) {
  const f = r.farm;
  const rank=Number.isSafeInteger(s.rank)&&s.rank>0?s.rank:0;
  if(f.rank!==rank){
    const planet=planetAt(rank);
    f.land.material=mat(planet.land);f.soil.material=mat(planet.soil);
    if(f.garden){f.root.remove(f.garden);disposeTree(f.garden);}
    f.garden=planetGarden(rank);f.root.add(f.garden);f.rank=rank;
  }
  r.lvl = s.lvl; f.island.visible = !!s.island;
  // canteiros
  const seen = new Set();
  for (const [id, crop, frac, mut, sick, x, z, kind] of s.p) {
    seen.add(id);
    let p = f.plots.get(id);
    if (!p) {
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const soil = new THREE.Mesh(plotGeometry(kind === 2 ? 'island' : kind ? 'tower' : 'farm'), vcMat); soil.receiveShadow = true; addOutline(soil, 0.05);
      const plant = new THREE.Group(); plant.position.y = 0.4;
      g.add(soil, plant); f.plotsG.add(g);
      p = { g, plant, key: '' }; f.plots.set(id, p);
    }
    const key = crop ? crop + ':' + Math.floor(frac * 5) + (frac >= 1 ? 'r' : '') + ':' + mut + ':' + sick : '';
    if (key !== p.key) {
      p.key = key; p.plant.clear();
      if (crop && CONFIG.crops[crop]) {
        const geom = cropGeometry(crop, frac, mut || null, !!sick);
        if (geom) { const m = new THREE.Mesh(geom, vcMat); varySpecimen(m,x,z); p.plant.add(m); addOutline(m); }
        p.plant.scale.setScalar(mut === 'giant' ? 1.3 : 1);
      }
    }
  }
  for (const [id, p] of f.plots) if (!seen.has(id)) { f.plotsG.remove(p.g); f.plots.delete(id); }
  // arvores (poucas e raramente mudam: refaz quando a assinatura muda)
  const tsig = JSON.stringify(s.t.map(t => [t[0], t[1], t[2], Math.floor(t[3] * 5), t[4]]));
  if (tsig !== f.treeSig) {
    f.treeSig = tsig; f.treesG.clear();
    for (const [type, x, z, frac, fruits] of s.t) {
      if (!CONFIG.trees[type]) continue;
      const geom = treeGeometry(type, frac, fruits);
      if (!geom) continue;
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const m = new THREE.Mesh(geom, vcMat); m.castShadow = true; varySpecimen(m,x,z); g.add(m); addOutline(m);
      f.treesG.add(g);
    }
  }
  // estruturas (diferenca por chave)
  const sseen = new Set();
  for (const [type, x, z, level] of s.s) {
    if (!CONFIG.structures[type]) continue;
    const key = type + '@' + x + ',' + z + '#' + level;
    sseen.add(key);
    if (f.structs.has(key)) continue;
    const g = createStructureModel(type);
    g.position.set(x, 0, z); applyStructureLevel(g, level);
    g.scale.setScalar(g.userData.baseScale || 1);
    f.structG.add(g); f.structs.set(key, g);
  }
  for (const [key, g] of f.structs) if (!sseen.has(key)) { f.structG.remove(g); disposeTree(g); f.structs.delete(key); }
}

function addRemote(id, nick) {
  let r = N.remotes.get(id);
  if (r) { if (nick && r.nick !== nick) r.nick = nick; return r; }
  const used = new Set([...N.remotes.values()].map(v => v.slot));
  let slot = 0; while (used.has(slot)) slot++;
  if (slot >= SLOT_OFFSET.length) return null;
  nick = nick || 'Jogador';
  r = { id, nick, slot, lvl: 1, avatar: makeAvatar(nick), pet:companion(scene), petType:null, farm: makeFarmView(nick, SLOT_OFFSET[slot]), pos: new THREE.Vector3(), velocity: new THREE.Vector3(), receivedAt:0, target: new THREE.Vector3(), yaw: 0, snap: null, fresh: true };
  scene.add(r.avatar);
  N.remotes.set(id, r);
  showToast(nick + ' entrou na sala', 'good'); play('mission');
  refreshChip(); refreshModal();
  return r;
}

function removeRemote(id) {
  const r = N.remotes.get(id);
  if (!r) return;
  const off=SLOT_OFFSET[r.slot];
  if (onParcel(camera.position.x-off.x,camera.position.z-off.z,r.farm.island.visible)) camera.position.set(-32,1.7,0);
  refundPending(id);
  r.pet.remove(); scene.remove(r.avatar, r.farm.root);
  disposeTree(r.avatar); disposeTree(r.farm.root);
  N.remotes.delete(id);
  showToast(r.nick + ' saiu da sala', 'info');
  refreshChip(); refreshModal();
}

// ---------------------------------------------------------------- Protocolo
function makeSnapshot() {
  const p = [];
  for (const q of state.plots) {
    if (!q.available) continue;
    const growT = q.crop ? CONFIG.crops[q.crop].growTime : 1;
    p.push([q.id, q.crop || 0, q.crop ? +Math.min(1, q.progress / growT).toFixed(2) : 0, q.mutation || 0, q.sick ? 1 : 0, q.x, q.z, q.kind === 'tower' ? 1 : q.kind === 'island' ? 2 : 0]);
  }
  const t = state.trees.map(x => [x.type, x.x, x.z, +Math.min(1, x.progress / CONFIG.trees[x.type].growTime).toFixed(2), x.fruits]);
  const s = state.structures.map(x => [x.type, x.x, x.z, x.level]);
  return { lvl: state.level, rank:state.prestige.rank, island:state.islandUnlocked, p, t, s };
}

function send(m) { // envia a mensagem para os outros (o host repassa)
  if (N.mode === 'host') N.tr.broadcast(m); else if (N.mode === 'guest') N.tr.sendHost(m);
}
const hello = () => ({ t: 'hi', id: N.myId, nick: nickOf() });

function validSnapshot(s) {
  if (!s || !Number.isFinite(s.lvl)) return false;
  const list = (rows,check) => Array.isArray(rows) && rows.length <= 512 &&
    rows.every(row => Array.isArray(row) && check(...row));
  const frac = n => Number.isFinite(n) && n >= 0 && n <= 1;
  return list(s.p,(id,crop,g,mut,sick,x,z,kind) =>
    typeof id==='string' && (!crop || Object.hasOwn(CONFIG.crops,crop)) && frac(g) &&
    (!mut || Object.hasOwn(CONFIG.mutations,mut)) && Number.isFinite(x) && Number.isFinite(z) && [0,1,2].includes(kind)) &&
    list(s.t,(type,x,z,g,n)=>Object.hasOwn(CONFIG.trees,type) && Number.isFinite(x) &&
      Number.isFinite(z) && frac(g) && Number.isInteger(n) && n>=0 && n<=CONFIG.trees[type].maxFruits) &&
    list(s.s,(type,x,z,lvl)=>Object.hasOwn(CONFIG.structures,type) && Number.isFinite(x) &&
      Number.isFinite(z) && Number.isInteger(lvl) && lvl>=1 && lvl<=10);
}

function handle(fromId, m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'bye' && N.mode === 'guest' && m.id === N.hostId) { leave(true); return; }

  if (N.mode === 'host' && (!fromId || m.id !== fromId || ['sync','full'].includes(m.t))) return;
  if (N.mode === 'host' && m.t !== 'hi' && !N.remotes.has(fromId)) return;
  if (m.t === 'pos' && ![m.x, m.z, m.r].every(Number.isFinite)) return;
  if(m.t==='pos'&&N.tr?.directPoses&&fromId&&N.mode==='guest'&&(fromId!==m.id||!N.remotes.has(m.id)))return;
  if (m.t === 'hi' && (typeof m.nick !== 'string' || m.nick.length > 32)) return;
  if (m.t === 'farm' && !validSnapshot(m.s)) return;
  if (m.t === 'full') { N.admission?.reject(new Error('Sala cheia (6 jogadores).')); showToast('Sala cheia (máximo de 6 jogadores)', 'bad'); leave(true); return; }
  if (m.t === 'sync') {
    if (N.mode==='guest' && m.id===N.hostId && Number.isFinite(m.time) &&
        (!m.ev || (Object.hasOwn(CONFIG.events,m.ev.id) && Number.isFinite(m.ev.left))) &&
        (!m.boom || (Object.hasOwn(CONFIG.crops,m.boom.crop) && Number.isFinite(m.boom.mult) && Number.isFinite(m.boom.left)))) applySync(m);
    return;
  }
  if (m.t === 'bye') { if (N.mode === 'host' && fromId) N.tr.broadcast(m, fromId); removeRemote(m.id); return; }
  if (!m.id || m.id === N.myId) return;
  if (m.to) { // mensagem direta (presentes): o host entrega apenas ao destinatario
    if (m.to !== N.myId) { if (N.mode === 'host' && fromId) N.tr.sendTo(m.to, m); return; }
    if(m.t==='prankTicket'){void acceptPrank(m.ticket);return;}
    if (m.t === 'gift') receiveGift(m); else if (m.t === 'giftok' || m.t === 'giftno') giftResult(m);
    return;
  }
  if (N.mode === 'host' && fromId) {
    if (m.t === 'hi') {
      if (!N.remotes.has(m.id) && N.remotes.size >= MAX_REMOTE) { N.tr.sendTo(fromId, { t: 'full' }); return; }
      // apresenta o host e os demais ao novo jogador
      N.tr.sendTo(fromId, hello());
      N.tr.sendTo(fromId, { t: 'farm', id: N.myId, s: makeSnapshot() });
      N.tSync = 0; N.tPos = 0;
      for (const r of N.remotes.values()) {
        N.tr.sendTo(fromId, { t: 'hi', id: r.id, nick: r.nick });
        if (r.snap) N.tr.sendTo(fromId, { t: 'farm', id: r.id, s: r.snap });
      }
    }
    if(m.t!=='pos'||!N.tr.directPoses)N.tr.broadcast(m,fromId);
  }
  if (m.t === 'hi') {
    addRemote(m.id, m.nick);
    if (N.mode==='guest' && !N.hostId) { N.hostId=m.id; N.admission?.resolve(); }
    return;
  }
  const r = N.remotes.get(m.id) || (m.t === 'farm' || m.t === 'pos' ? addRemote(m.id, null) : null);
  if (!r) return;
  if (m.t === 'spray') {
    const off=SLOT_OFFSET[r.slot];
    if ([m.x,m.y,m.z,m.tx,m.ty,m.tz].every(Number.isFinite)) waterJet(m.x+off.x,m.y,m.z+off.z,m.tx+off.x,m.ty,m.tz+off.z,m.type);
    return;
  }
  if (m.t === 'pos') {
    const owner = m.farm ? N.remotes.get(m.farm) : null;
    const off = owner ? SLOT_OFFSET[owner.slot] : null;
    const level=Number.isInteger(m.can)&&m.can>=1&&m.can<=CANS.length?m.can:0;
    if(level!==(r.canLevel||0)){
      const arm=r.avatar.userData.pose.arms[1];
      if(r.can)arm.remove(r.can);
      r.canLevel=level;r.can=level?canModel(level):null;
      if(r.can){
        r.can.scale.setScalar(.58);r.can.position.set(-.14,-.37,.09);
        r.can.rotation.y=Math.PI;arm.add(r.can);
      }
    }
    r.petType=Object.hasOwn(PETS,m.pet)?m.pet:null;
    r.target.set(m.x + (off?.x || 0), Number.isFinite(m.jump)?Math.min(2,Math.max(0,m.jump)):0, m.z + (off?.z || 0)); r.yaw = m.r;
    r.receivedAt=N.clock;
    r.velocity.set(Number.isFinite(m.vx)?m.vx:0,0,Number.isFinite(m.vz)?m.vz:0).clampLength(0,16);
    if (r.fresh) { r.pos.copy(r.target); r.fresh = false; }
  } else if (m.t === 'farm') { const changed=!!m.s.island!==r.farm.island.visible; r.snap = m.s; applySnapshot(r, m.s); if(changed) refreshModal(); }
}

// ---------------------------------------------------------------- Presentes
const GIFT_KINDS = ['seed', 'sapling', 'crop', 'fruit', 'mut', 'product', 'crystal', 'money'];
const STOCK_KINDS = ['crop', 'fruit', 'mut', 'product'];
const pending = new Map(), seenGifts = new Set();
const storeFor = kind => (kind === 'seed' ? state.seeds : kind === 'sapling' ? state.saplings : kind === 'crop' ? state.crops : kind === 'fruit' ? state.fruits : kind === 'mut' ? state.mutated : kind === 'product' ? state.products : null);
const haveGift = (kind, key) => (kind === 'money' ? Math.floor(state.money) : kind === 'crystal' ? state.crystals : (storeFor(kind)[key] || 0));
function takeGift(kind, key, n) { if (kind === 'money') state.money -= n; else if (kind === 'crystal') state.crystals -= n; else storeFor(kind)[key] -= n; }
function putGift(kind, key, n) {
  if (kind === 'money') state.money += n; else if (kind === 'crystal') state.crystals += n;
  else { const s = storeFor(kind); s[key] = (s[key] || 0) + n; }
}
export function giftName(kind, key) {
  switch (kind) {
    case 'seed': return 'Semente de ' + CONFIG.crops[key].name;
    case 'sapling': return 'Muda de ' + CONFIG.trees[key].name;
    case 'crop': return CONFIG.crops[key].name;
    case 'fruit': return CONFIG.trees[key].fruit;
    case 'mut': { const [mu, c] = key.split(':'); return CONFIG.crops[c].name + ' ' + CONFIG.mutations[mu].name; }
    case 'product': return CONFIG.products[key].name;
    case 'crystal': return 'Cristal';
    default: return 'Creditos';
  }
}
function validGift(kind, key) {
  if (!GIFT_KINDS.includes(kind)) return false;
  if (kind === 'money' || kind === 'crystal') return true;
  if (kind === 'mut') { const [mu, c] = String(key).split(':'); return Object.hasOwn(CONFIG.mutations,mu) && Object.hasOwn(CONFIG.crops,c); }
  const tbl = kind === 'seed' || kind === 'crop' ? CONFIG.crops : kind === 'sapling' || kind === 'fruit' ? CONFIG.trees : CONFIG.products;
  return Object.hasOwn(tbl, key);
}
function sendTo(targetId, m) {
  m.id = N.myId; m.to = targetId;
  if (N.mode === 'host') N.tr.sendTo(targetId, m); else if (N.mode === 'guest') N.tr.sendHost(m);
}
export function sendGift(toId, kind, key, n) {
  const r = N.remotes.get(toId);
  n = Math.floor(n);
  if (!r || !Number.isSafeInteger(n) || n < 1 || n > 99999 || !validGift(kind, key)) return false;
  if (haveGift(kind, key) < n) { showToast('Voce nao tem essa quantidade', 'bad'); play('error'); return false; }
  takeGift(kind, key, n);
  const gid = rid() + rid();
  pending.set(gid, { to: toId, kind, key, n });
  sendTo(toId, { t: 'gift', gid, kind, key, n, nick: nickOf() });
  play('sell'); showToast('Enviando ' + n + ' ' + giftName(kind, key) + ' para ' + r.nick, 'info');
  save();
  return true;
}
function receiveGift(m) {
  const n = Math.floor(Number(m.n));
  const deny = why => sendTo(m.id, { t: 'giftno', gid: m.gid, why });
  if (seenGifts.has(m.gid)) { sendTo(m.id,{t:'giftok',gid:m.gid});return; }
  if (!(n >= 1 && n <= 99999) || !validGift(m.kind, m.key)) { deny('Presente invalido'); return; }
  if (STOCK_KINDS.includes(m.kind) && stockFree() < n) { deny('Estoque do amigo cheio'); return; }
  seenGifts.add(m.gid);
  putGift(m.kind, m.key, n);
  const from = (N.remotes.get(m.id) || { nick: m.nick || 'Um amigo' }).nick;
  play('mission'); showToast(from + ' enviou ' + n + ' ' + giftName(m.kind, m.key), 'mission');
  sendTo(m.id, { t: 'giftok', gid: m.gid });
  save();
}
function giftResult(m) {
  const p = pending.get(m.gid);
  if (!p || m.id !== p.to) return;
  pending.delete(m.gid);
  const r = N.remotes.get(p.to), who = r ? r.nick : 'amigo';
  if (m.t === 'giftok') { play('buy'); showToast(who + ' recebeu ' + p.n + ' ' + giftName(p.kind, p.key), 'good'); }
  else { putGift(p.kind, p.key, p.n); play('error'); showToast('Presente devolvido: ' + (m.why || 'recusado'), 'bad'); save(); }
}
function refundPending(id) {
  for (const [gid, p] of pending) if (p.to === id) { putGift(p.kind, p.key, p.n); pending.delete(gid); save(); showToast('Presente devolvido: amigo saiu da sala', 'bad'); }
}

// Host manda o relogio e o clima; convidados seguem o host (dia/noite e eventos iguais para todos)
function applySync(m) {
  state.time = m.time;
  if(Number.isFinite(m.merchantLeft))state.merchantUntil=Date.now()+Math.min(180000,Math.max(0,m.merchantLeft));
  state.nextEventIn = Math.max(state.nextEventIn, 90); // convidado nao sorteia eventos proprios
  const cur = state.event ? state.event.id : null, next = m.ev ? m.ev.id : null;
  if (cur !== next) {
    state.event = m.ev ? { id: m.ev.id, left: m.ev.left } : null;
    restoreEventVisuals();
    if (next && CONFIG.events[next]) showToast(CONFIG.events[next].text, next === 'rain' ? 'good' : 'bad');
  } else if (state.event) state.event.left = m.ev.left;
  state.boom = m.boom ? { crop: m.boom.crop, mult: m.boom.mult, left: m.boom.left } : null;
}
function sendSync() {
  send({ t: 'sync', id: N.myId, merchantLeft:Math.max(0,state.merchantUntil-Date.now()), time: +state.time.toFixed(3), ev: state.event ? { id: state.event.id, left: +state.event.left.toFixed(1) } : null, boom: state.boom ? { crop: state.boom.crop, mult: state.boom.mult, left: +state.boom.left.toFixed(1) } : null });
}

// Teleporta para a fazenda ou para perto do amigo
export function visit(id, where) {
  if (where === 'home') { camera.position.set(-32,1.7,0); return; }
  const r = N.remotes.get(id);
  if (!r) return;
  if (where === 'farm') { const o = SLOT_OFFSET[r.slot]; camera.position.set(o.x - 32, 1.7, o.z + 6); }
  else if (where === 'island') {const o=SLOT_OFFSET[r.slot];camera.position.set(o.x+CONFIG.island.x,1.7,o.z+CONFIG.island.z+12);}
  else camera.position.set(r.pos.x, 1.7, r.pos.z + 3.5);
  const target=camera.position;
  if(!world.isWalkable(target.x,target.z)){
    const x=target.x,z=target.z;
    search: for(let d=1;d<=12;d++) for(let k=0;k<12;k++){
      const px=x+d*Math.cos(k*Math.PI/6),pz=z+d*Math.sin(k*Math.PI/6);
      if(world.isWalkable(px,pz)){ target.set(px,1.7,pz);break search; }
    }
  }
  play('build');
}

function sendFarm() {
  const snapshot=makeSnapshot(), signature=JSON.stringify(snapshot);
  if(signature===N.lastFarm) return;
  N.lastFarm=signature;
  send({t:'farm',id:N.myId,s:snapshot});
}

function setupTransportHandlers() {
  return {
    onPeer() {},
    onAdmin(action){
      if(action.prank){playPrank(action.prank);return;}
      if(action.assist==='irrigate'||action.assist==='cure'){
        for(const plot of state.plots)if(plot.crop){
          if(action.assist==='irrigate')plot.water=12;
          else {plot.sick=false;plot.dirty=true;}
        }
        if(action.assist==='irrigate')for(const tree of state.trees)tree.water=8;
        save();showToast(action.assist==='irrigate'?'Rick irrigou sua fazenda.':'Rick curou seus cultivos.','good');return;
      }
      if(N.mode!=='host')return;
      applyWorldCommand(action);sendSync();
    },
    onMsg: (from, m) => handle(from, m),
    onGone: from => {
      if (!from && N.mode === 'host') { showToast('Conexão com o servidor encerrada', 'bad'); leave(true); }
      else if (N.mode === 'host') { if (from && N.remotes.has(from)) { N.tr.broadcast({ t: 'bye', id: from }); removeRemote(from); } }
      else if (N.mode === 'guest') { showToast('A conexao com o host foi perdida', 'bad'); leave(true); }
    }
  };
}

// ---------------------------------------------------------------- Entrar e sair
export async function hostRoom() {
  if (N.mode !== 'solo') return { ok: false, error: 'Voce ja esta em uma sala' };
  try {
    let code = visiting?'0'+newCode().slice(1):newCode();
    N.mode = 'joining';
    const handlers = setupTransportHandlers();
    if(!visiting && relayAddress() && !LOCAL){
      try{N.tr=await connectRelay('host',code,handlers);}
      catch(error){
        if(!hosted || (error.status && error.status<500 && error.status!==429))throw error;
        code='1'+code.slice(1);
        N.tr=await hostPeer(code,handlers);
      }
    }else N.tr=await (LOCAL&&!visiting?hostLocal:hostPeer)(code,handlers);
    N.lastFarm = null; N.mode = 'host'; N.code = code; N.myId = N.tr.id;
    refreshChip();
    return { ok: true, code };
  } catch (e) { N.mode = 'solo'; N.tr = null; return { ok: false, error: e.message || 'Falha ao criar a sala' }; }
}

export async function joinRoom(code) {
  code = (code || '').trim().toUpperCase();
  if (N.mode !== 'solo') return { ok: false, error: 'Voce ja esta em uma sala' };
  if (!/^[A-Z0-9]{6}$/.test(code)) return { ok: false, error: 'Codigo invalido (6 letras e numeros)' };
  try {
    N.mode = 'joining';
    const handlers = setupTransportHandlers();
    if(visiting!==code.startsWith('0'))throw new Error('Contas e visitantes jogam em salas separadas. Confira o código.');
    N.tr = visiting||code.startsWith('1') ? await joinPeer(code,handlers) : relayAddress() && !LOCAL ? await connectRelay('join', code, handlers) : await (LOCAL ? joinLocal : joinPeer)(code, handlers);
    N.lastFarm = null; N.hostId = null; N.mode = 'guest'; N.code = code; N.myId = N.tr.id;
    let timer;
    try {
      await new Promise((resolve,reject)=>{
        N.admission={resolve,reject};
        timer=setTimeout(()=>reject(new Error('O anfitrião não confirmou sua entrada.')),9000);
        N.tr.sendHost(hello());
      });
    } finally { clearTimeout(timer); N.admission=null; }
    N.tPos = 0;
    sendFarm();
    refreshChip();
    showToast('Conectado a sala ' + code, 'mission');
    return { ok: true, code };
  } catch (e) { if(N.tr) leave(true); N.mode = 'solo'; N.tr = null; return { ok: false, error: e.message || 'Falha ao entrar' }; }
}

export function leave(silent) {
  if (N.mode === 'solo') return;
  endPrank();usedTickets.clear();
  N.admission?.reject(new Error('Conexão encerrada antes de entrar na sala.'));
  try { send({ t: 'bye', id: N.myId }); } catch (e) { /* ignora */ }
  N.mode = 'solo';
  if ([...N.remotes.values()].some(r=>{const o=SLOT_OFFSET[r.slot];return onParcel(camera.position.x-o.x,camera.position.z-o.z,r.farm.island.visible);})) visit(null,'home');
  try { N.tr && N.tr.close(); } catch (e) { /* ignora */ }
  for (const id of [...N.remotes.keys()]) refundPending(id);
  for (const id of [...N.remotes.keys()]) { const r = N.remotes.get(id); r.pet.remove(); scene.remove(r.avatar, r.farm.root); disposeTree(r.avatar); disposeTree(r.farm.root); N.remotes.delete(id); }
  N.mode = 'solo'; N.code = null; N.tr = null; N.myId = null;
  refreshChip(); refreshModal();
  if (!silent) showToast('Voce saiu da sala', 'info');
}

const usedTickets=new Set();
let checkingTicket=false;
function playPrank(command){
  if(!Object.hasOwn(prankNames,command))return;
  startPrank(command,scene,camera,state.plots);showToast('Rick enviou: '+prankNames[command],'info');
}
async function acceptPrank(ticket){
  if(checkingTicket||!N.code?.startsWith('1')||typeof ticket!=='string'||ticket.length>900||usedTickets.has(ticket))return;
  checkingTicket=true;
  try{
    const result=await api('prank-check',{ticket});
    const d=result.prank;
    if(result.ok&&d.room===N.code&&d.peer===N.myId){
      usedTickets.add(ticket);setTimeout(()=>usedTickets.delete(ticket),31000);
      playPrank(d.command);
    }
  }finally{checkingTicket=false;}
}
export async function requestRoomAdmin(action){
  if(N.code?.startsWith('1')&&Object.hasOwn(prankNames,action.command)){
    const target=N.remotes.get(action.player),room=N.code;
    if(!target)throw Error('Jogador saiu da sala.');
    const result=await api('prank-ticket',{room,peer:target.id,nick:target.nick,command:action.command});
    if(!result.ok)throw Error(result.error);
    if(N.code!==room||N.remotes.get(target.id)!==target)throw Error('Jogador saiu da sala.');
    sendTo(target.id,{t:'prankTicket',ticket:result.ticket});return;
  }
  if((N.mode!=='guest'&&N.mode!=='host')||!N.tr?.admin)throw new Error('Use o servidor oficial da fazenda para controlar esta sala.');
  return N.tr.admin(action);
}

export const netInfo = () => ({ mode: N.mode, code: N.code, players: N.remotes.size + (N.mode === 'solo' ? 0 : 1), remotes: [...N.remotes.values()] });

function refreshChip() {
  if (N.mode === 'solo' || N.mode === 'joining') { setNetChip(''); return; }
  const n = N.remotes.size + 1;
  setNetChip('Sala ' + N.code + ' - ' + n + (n > 1 ? ' jogadores' : ' jogador'));
}

// ---------------------------------------------------------------- Interface
let modalOpen = false;
function refreshModal() { if (modalOpen) openMultiplayer(); }

function giftEntries() {
  const out = [];
  const add = (kind, keys) => keys.forEach(k => { if (haveGift(kind, k) > 0) out.push([kind, k]); });
  add('seed', CONFIG.cropOrder); add('sapling', CONFIG.treeOrder);
  add('crop', CONFIG.cropOrder); add('fruit', CONFIG.treeOrder);
  add('mut', Object.keys(state.mutated)); add('product', Object.keys(CONFIG.products));
  if (state.crystals > 0) out.push(['crystal', 'crystal']);
  return out;
}

export function openGift(toId) {
  const r = N.remotes.get(toId);
  if (!r) { openMultiplayer(); return; }
  modalOpen = false;
  openModal({
    id: 'gift', title: 'Presente para ' + r.nick, hint: 'Pressione ESC para fechar',
    build(body) {
      const list = el('div', 'list');
      list.append(row({ title: 'Voltar', desc: 'Voltar para a lista de jogadores.', buttons: [{ label: 'Voltar', onClick: () => { openMultiplayer(); return 'keep'; } }] }));
      const give = (kind, key, n) => { if (N.remotes.has(toId)) sendGift(toId, kind, key, n); };
      const money = Math.floor(state.money);
      list.append(row({
        title: 'Creditos', desc: 'Voce tem ' + money + ' CR', color: 0xFFD166, tag: 'DINHEIRO', tagCls: 'gold',
        buttons: [100, 500, 2000].map(v => ({ label: v + ' CR', disabled: money < v, onClick: () => give('money', 'money', v) }))
      }));
      const entries = giftEntries();
      if (!entries.length) list.append(row({ title: 'Nada para dar', desc: 'Colha plantas e frutos, ou compre sementes e mudas, para presentear.' }));
      entries.forEach(([kind, key]) => {
        const have = haveGift(kind, key);
        const color = kind === 'mut' ? CONFIG.mutations[key.split(':')[0]].color : kind === 'crop' || kind === 'seed' ? CONFIG.crops[key].color : kind === 'fruit' || kind === 'sapling' ? CONFIG.trees[key].fruitColor : 0x59E6FF;
        const btns = [{ label: 'Dar 1', onClick: () => give(kind, key, 1) }];
        if (have > 1) btns.push({ label: have > 5 ? 'Dar 5' : 'Dar tudo (' + have + ')', onClick: () => give(kind, key, Math.min(5, have)) });
        if (have > 5) btns.push({ label: 'Dar tudo (' + have + ')', onClick: () => give(kind, key, have) });
        list.append(row({ title: giftName(kind, key), desc: 'Voce tem ' + have, color, buttons: btns }));
      });
      body.append(list);
    }
  });
}

export function openMultiplayer() {
  modalOpen = true;
  openModal({
    id: 'multiplayer', title: 'Multiplayer', hint: 'Pressione ESC para fechar',
    onClose: () => { modalOpen = false; },
    build(body) {
      const msg = el('p', 'hint', '');
      const status = t => { msg.textContent = t; };
      if (N.mode === 'solo' || N.mode === 'joining') {
        const list = el('div', 'list');
        list.append(row({
          title: 'Criar sala', desc: 'Voce vira o host. Gera um codigo para seus amigos entrarem. Cada amigo ganha uma fazenda ao lado da cidade.',
          buttons: [{ label: 'Criar sala', onClick: async () => { status('Criando sala...'); const r = await hostRoom(); if (!r.ok) { status(r.error); play('error'); return 'keep'; } play('mission'); openMultiplayer(); return 'keep'; } }]
        }));
        const box = el('div', 'shop-item'); box.style.flexDirection = 'column'; box.style.alignItems = 'stretch';
        box.append(el('b', null, 'Entrar com codigo'), el('small', null, 'Peca o codigo da sala ao seu amigo (aparece no menu Multiplayer dele).'));
        const inp = el('input', 'mp-input'); inp.maxLength = 6; inp.placeholder = 'CODIGO'; inp.spellcheck = false;
        const go = el('button', '', 'Entrar na sala'); go.type = 'button';
        const join = async () => { go.disabled = true; status('Conectando...'); const r = await joinRoom(inp.value); go.disabled = false; if (!r.ok) { status(r.error); play('error'); return; } play('mission'); openMultiplayer(); };
        go.addEventListener('click', join);
        inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') join(); });
        box.append(inp, go); list.append(box);
        body.append(list, msg);
        if (!fixedRelay && !LOCAL) {
          const options=el('details'), title=el('summary',null,'Servidor de salas');
          const addr=el('input','mp-input'); addr.type='url'; addr.placeholder='https://seu-servidor'; addr.value=relayAddress();
          addr.style.textTransform='none'; addr.style.width='100%'; addr.setAttribute('aria-label','Endereço do servidor');
          const confirm=el('button',null,'Aplicar'); confirm.onclick=()=>{
            try { setRelayAddress(addr.value); status(relayAddress()?'Servidor selecionado.':'Conexão direta selecionada.'); }
            catch(error) { status(error.message); }
          };
          options.append(title,el('p','hint','Para usar o servidor Node do jogo, informe o mesmo endereço nos dois dispositivos. Deixe vazio para usar PeerJS.'),addr,confirm);
          body.append(options);
        }
        body.append(el('p', 'hint', hosted&&!visiting?'Servidor padrão: Upstash. Se estiver indisponível, a sala tenta conexão direta.':relayAddress() ? 'Use o mesmo servidor de salas nos dois dispositivos.' : 'Conexão pela internet (WebRTC). Na mesma rede, você também pode usar o servidor incluído no ZIP.'));
      } else {
        const code = el('div', 'mp-code', N.code);
        body.append(el('p', 'hint', N.mode === 'host' ? 'Voce e o host. Passe este codigo aos amigos:' : 'Conectado a sala:'), code);
        if(hosted&&!visiting)body.append(el('p','hint',N.code.startsWith('1')?'Sala em conexão direta · reserva do Upstash':'Sala no Upstash · servidor padrão'));
        const list = el('div', 'list');
        list.append(row({ title: nickOf() + ' (voce)', desc: N.mode === 'host' ? 'Host - nivel ' + state.level : 'Nivel ' + state.level, tag: 'FAZENDA 1', tagCls: 'gold' }));
        for (const r of N.remotes.values()) list.append(row({ title: r.nick, desc: 'Nivel ' + (r.lvl || 1) + '  |  Fazenda a ' + (r.slot === 1 ? 'sul' : 'leste') + (r.slot === 2 ? ' (sudeste)' : '') + ' da cidade', tag: 'FAZENDA ' + (r.slot + 2), buttons: [
          { label: 'Dar presente', onClick: () => { openGift(r.id); return 'keep'; } },
          { label: 'Ver fazenda', onClick: () => { visit(r.id, 'farm'); return 'close'; } },
          ...(r.farm.island.visible ? [{label:'Ver ilha',onClick:()=>{visit(r.id,'island');return 'close';}}] : []),
          { label: 'Ir ate ele', onClick: () => { visit(r.id, 'player'); return 'close'; } }] }));
        list.append(row({title:'Minha fazenda',buttons:[{label:'Voltar para casa',onClick:()=>{visit(null,'home');return 'close';}}]}));
        list.append(row({ title: 'Sair da sala', desc: 'Seu progresso continua salvo na sua conta.', buttons: [{ label: 'Sair da sala', onClick: () => { leave(); return 'keep'; } }] }));
        body.append(list, msg);
      }
    }
  });
}

// ---------------------------------------------------------------- Ciclo
export function initNet(sceneRef, cameraRef, getNick, worldRef) {
  scene = sceneRef; camera = cameraRef; nickOf = getNick;
  world = worldRef;
  const zoneAt=world.zoneAt;
  world.zoneAt=(x,z)=>{
    for(const r of N.remotes.values()){
      const off=SLOT_OFFSET[r.slot], px=x-off.x,pz=z-off.z;
      if(onParcel(px,pz,r.farm.island.visible)) return (onIsland(px,pz)?'ILHA DE ':'FAZENDA DE ')+r.nick.toUpperCase();
    }
    return zoneAt(x,z);
  };
  const walkable = world.isWalkable;
  world.isWalkable = (x,z) => {
    if (walkable(x,z)) return true;
    for (const r of N.remotes.values()) {
      const off=SLOT_OFFSET[r.slot];
      const px=x-off.x,pz=z-off.z;
      if(!onParcel(px,pz,r.farm.island.visible)) continue;
      if(r.snap?.t.some(([,tx,tz])=>Math.hypot(px-tx,pz-tz)<0.85)) return false;
      if(r.snap?.s.some(([key,sx,sz])=>Math.hypot(px-sx,pz-sz)<CONFIG.structures[key].radius*0.6+0.3)) return false;
      return true;
    }
    return false;
  };
  bus.on('irrigate', data => { if (N.tr) send({t:'spray',id:N.myId,...data}); });
  addEventListener('beforeunload', () => leave(true));
}

const tmpDir = new THREE.Vector3(), predicted = new THREE.Vector3();
export function updateNet(dt) {
  tickPrank();
  if (N.mode !== 'host' && N.mode !== 'guest') return;
  N.clock += dt;
  const play_ = state.mode === 'play';
  // posicao: ~10 vezes por segundo, ou a cada 1 segundo parado
  N.tPos -= dt;
  if (N.tPos <= 0) {
    let x = camera.position.x, z = camera.position.z, farm = onParcel(x,z,state.islandUnlocked) ? N.myId : null;
    for (const remote of N.remotes.values()) {
      const off = SLOT_OFFSET[remote.slot];
      if (!onParcel(x-off.x,z-off.z,remote.farm.island.visible)) continue;
      x -= off.x; z -= off.z; farm = remote.id; break;
    }
    camera.getWorldDirection(tmpDir);
    const r = Math.atan2(-tmpDir.x, -tmpDir.z);
    const jump=+Math.max(0,camera.position.y-CONFIG.player.height).toFixed(2);
    x=+x.toFixed(2);z=+z.toFixed(2);
    const yaw=+r.toFixed(3),pet=state.activePet;
    const can=HOTBAR[state.selectedSlot]?.type==='can'?canLevel(state):0;
    const moved=can!==N.last.can||x!==N.last.x||z!==N.last.z||yaw!==N.last.r||jump!==N.last.jump||farm!==N.last.farm||pet!==N.last.pet;
    const elapsed=N.clock-(N.last.sent??N.clock);
    const continuous=farm===N.last.farm && elapsed>0 && Math.hypot(x-N.last.x,z-N.last.z)<=16*elapsed;
    const vx=continuous?+((x-N.last.x)/elapsed).toFixed(1):0;
    const vz=continuous?+((z-N.last.z)/elapsed).toFixed(1):0;
    const stopped=!moved && (N.last.vx||N.last.vz);
    if(moved || stopped || N.clock-(N.last.sent??-Infinity)>=1){
      send({t:'pos',jump,pet,can,id:N.myId,farm,x,z,vx,vz,r:yaw});
      N.last={x,z,vx,vz,can,r:yaw,jump,farm,pet,sent:N.clock};
    }
    N.tPos=play_?0.07:0.25;
  }
  N.tFarm -= dt;
  if (N.tFarm <= 0) { N.tFarm = 2; sendFarm(); }
  N.tSync -= dt;
  if (N.tSync <= 0 && N.mode === 'host') { N.tSync = 1; sendSync(); }
  // avatares suaves + etiquetas sempre de frente + estruturas animadas
  const k = 1 - Math.exp(-dt * 17);
  for (const r of N.remotes.values()) {
    predicted.copy(r.target).addScaledVector(r.velocity,Math.min(0.10,N.clock-r.receivedAt));
    if (r.pos.distanceToSquared(predicted)>900) r.pos.copy(r.target);
    else r.pos.lerp(predicted,k);
    r.avatar.position.copy(r.pos);
    // andar: pulinho e bracos balancando enquanto ele se move
    const sp = r.pos.distanceTo(predicted);
    r.walk = THREE.MathUtils.lerp(r.walk || 0, sp > 0.05 ? 1 : 0, k);
    animateFarmer(r.avatar,N.clock,r.walk,r.pos.y);
    if(r.can)r.avatar.userData.pose.arms[1].rotation.x=-.83;
    r.pet.update(r.petType,r.pos,dt,N.clock,world);
    const turn=r.yaw+Math.PI-r.avatar.rotation.y;
    r.avatar.rotation.y+=Math.atan2(Math.sin(turn),Math.cos(turn))*k;

    if (r.farm.root.visible) for (const g of r.farm.structs.values()) animateStructure(g, N.clock, dt);

  }
  N.tCull -= dt;
  if (N.tCull <= 0) {
    N.tCull = 0.7;
    for (const r of N.remotes.values()) { const o = SLOT_OFFSET[r.slot]; const x=camera.position.x-o.x,z=camera.position.z-o.z;
      r.farm.root.visible = Math.hypot(x+54,z+43)<160 || (r.farm.island.visible && Math.hypot(x-CONFIG.island.x,z-CONFIG.island.z)<140); }
  }
}
