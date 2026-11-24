// Multiplayer por codigo: um jogador cria a sala (host), os amigos entram pelo codigo.
// Cada jogador joga na propria fazenda; as fazendas dos outros aparecem em terrenos vizinhos (somente visualizacao).
// Transporte: WebRTC (PeerJS) por padrao; com ?net=local usa BroadcastChannel (duas abas do mesmo navegador, para testes).
import * as THREE from 'three';
import { state, save, stockFree } from './state.js';
import { CONFIG } from './config.js';
import { geo, mat, glow, makeLabel, createStructureModel, applyStructureLevel, animateStructure } from './world.js';
import { addOutline } from './toon.js';
import { vcMat } from './optimize.js';
import { plotGeometry, cropGeometry, treeGeometry } from './game.js';
import { showToast, openModal, closeModal, el, row, setNetChip } from './ui.js';
import { play } from './audio.js';
import { restoreEventVisuals } from './events.js';

const PREFIX = 'fazorb-', MAX_REMOTE = 3;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// Deslocamento das fazendas dos outros jogadores (a cidade e a estrada ficam compartilhadas)
const SLOT_OFFSET = [{ x: 95, z: 0 }, { x: 0, z: 110 }, { x: 95, z: 110 }];
const FARM_RECT = { x0: -74, x1: -4, z0: -62, z1: 10 };
const LOCAL = new URLSearchParams(location.search).get('net') === 'local';

let scene, camera, nickOf = () => 'Jogador';
const N = { mode: 'solo', code: null, tr: null, myId: null, remotes: new Map(), tPos: 0, tFarm: 0, tSync: 0, tCull: 0, last: { x: 0, z: 0, r: 0 }, clock: 0 };

const rid = () => Math.random().toString(36).slice(2, 8);
const inFarm = (x, z) => x > FARM_RECT.x0 && x < FARM_RECT.x1 && z > FARM_RECT.z0 && z < FARM_RECT.z1;
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

async function hostPeer(code, h) {
  await loadPeerJS();
  const peer = new window.Peer(PREFIX + code, { debug: 0 });
  await new Promise((res, rej) => { peer.on('open', res); peer.on('error', e => rej(new Error(e.type === 'unavailable-id' ? 'Codigo em uso, tente de novo' : 'Falha ao criar a sala'))); });
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
  await loadPeerJS();
  const peer = new window.Peer(undefined, { debug: 0 });
  await new Promise((res, rej) => { peer.on('open', res); peer.on('error', () => rej(new Error('Falha de conexao'))); });
  const conn = peer.connect(PREFIX + code, { reliable: true });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('Sala nao encontrada')), 12000);
    conn.on('open', () => { clearTimeout(t); res(); });
    peer.on('error', e => { clearTimeout(t); rej(new Error(e.type === 'peer-unavailable' ? 'Sala nao encontrada' : 'Falha de conexao')); });
  });
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
    else if (d.kind === 'msg') h.onMsg(d.from, d.msg);
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
  addEventListener('beforeunload', () => ch.postMessage({ to: hostId, from: id, kind: 'leave' }));
  return {
    id,
    sendHost(m) { ch.postMessage({ to: hostId, from: id, kind: 'msg', msg: m }); },
    close() { ch.postMessage({ to: hostId, from: id, kind: 'leave' }); ch.close(); }
  };
}

// ---------------------------------------------------------------- Avatares e fazendas remotas
const hueOf = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360; };

function makeAvatar(nick) {
  const g = new THREE.Group(), rig = new THREE.Group();
  const h = hueOf(nick), c = new THREE.Color().setHSL(h / 360, 0.8, 0.58).getHex(), c2 = new THREE.Color().setHSL(((h + 40) % 360) / 360, 0.85, 0.62).getHex();
  const skin = 0xFFD9B3;
  const mk = (geom, material, x = 0, y = 0, z = 0, parent = rig) => { const m = new THREE.Mesh(geom, material); m.position.set(x, y, z); parent.add(m); return m; };
  // corpo e cabeca bem redondos
  const body = mk(geo('sph', 0.34, 14, 10), mat(c), 0, 0.5, 0); body.scale.set(1, 1.08, 0.9); body.castShadow = true;
  const head = mk(geo('sph', 0.4, 16, 12), mat(skin), 0, 1.2, 0); head.castShadow = true;
  // rosto: olhos com brilho, bochechas e sorriso
  const dark = mat(0x2A1B3D);
  for (const sx of [-1, 1]) {
    mk(geo('sph', 0.065, 8, 6), dark, sx * 0.15, 1.24, 0.35).scale.set(1, 1.3, 0.6);
    mk(geo('sph', 0.022, 6, 5), mat(0xFFFFFF), sx * 0.15 + 0.02, 1.28, 0.385);
    mk(geo('sph', 0.075, 8, 6), mat(0xFF8FA3), sx * 0.25, 1.12, 0.29).scale.set(1, 0.6, 0.4);
  }
  const smile = mk(geo('tor', 0.075, 0.018, 6, 12, Math.PI), dark, 0, 1.15, 0.385); smile.rotation.z = Math.PI;
  // bracos e pes
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(sx * 0.36, 0.7, 0); rig.add(arm);
    mk(geo('cyl', 0.075, 0.07, 0.34, 8), mat(c), 0, -0.15, 0, arm);
    mk(geo('sph', 0.085, 8, 6), mat(skin), 0, -0.34, 0, arm);
    arms.push(arm);
    mk(geo('sph', 0.13, 8, 6), dark, sx * 0.15, 0.08, 0.06).scale.set(1, 0.6, 1.3);
  }
  // chapeu varia conforme o nick
  const v = h % 4;
  if (v === 0) { // bone com aba
    mk(geo('sph', 0.42, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(c2), 0, 1.3, 0);
    mk(geo('cyl', 0.3, 0.3, 0.04, 14, 1, false, 0, Math.PI), mat(c2), 0, 1.33, 0.32).rotation.y = -Math.PI / 2;
  } else if (v === 1) { // gorro com pompom
    mk(geo('sph', 0.43, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(c2), 0, 1.3, 0);
    mk(geo('tor', 0.4, 0.07, 6, 16), mat(0xFFFFFF), 0, 1.32, 0).rotation.x = Math.PI / 2;
    mk(geo('sph', 0.11, 8, 6), mat(0xFFFFFF), 0, 1.76, 0);
  } else if (v === 2) { // folhinhas de broto
    mk(geo('cyl', 0.02, 0.025, 0.2, 5), mat(0x4FBF68), 0, 1.68, 0);
    for (const sx of [-1, 1]) { const l = mk(geo('sph', 0.12, 8, 6), mat(0x6ACB5A), sx * 0.11, 1.8, 0); l.scale.set(1.4, 0.5, 0.8); l.rotation.z = sx * 0.5; }
  } else { // chapeu de palha
    mk(geo('cyl', 0.62, 0.62, 0.04, 16), mat(0xF2D28B), 0, 1.45, 0);
    mk(geo('sph', 0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xF2D28B), 0, 1.46, 0);
    mk(geo('tor', 0.3, 0.035, 6, 16), mat(c2), 0, 1.49, 0).rotation.x = Math.PI / 2;
  }
  g.add(rig);
  addOutline(body, 0.022); addOutline(head, 0.024);
  const label = makeLabel(nick, '#FFD166', 3.4, 0.76);
  label.position.y = 2.3; label.renderOrder = 20;
  if (label.material) { label.material.depthTest = false; label.material.fog = false; }
  g.add(label);
  g.userData.label = label; g.userData.rig = rig; g.userData.arms = arms;
  // facho de luz: permite achar o amigo de longe
  const beam = new THREE.Mesh(geo('cyl', 0.07, 0.07, 40, 6), glow(0xFFD166, 0.35)); beam.position.y = 22; g.add(beam);
  return g;
}

function disposeTree(obj) {
  obj.traverse(o => { if (o.material && o.material.map) o.material.map.dispose(); });
}

function makeFarmView(nick, off) {
  const root = new THREE.Group(); root.position.set(off.x, 0, off.z);
  const soil = new THREE.Mesh(geo('box', 40, 0.2, 44), mat(0x8B5E3C)); soil.position.set(-32, 0.1, -24.5); soil.receiveShadow = true;
  root.add(soil);
  const label = makeLabel('FAZENDA DE ' + nick.toUpperCase(), '#FFD166', 8, 1.1); label.position.set(-32, 5, 1.5); root.add(label);
  const plotsG = new THREE.Group(), treesG = new THREE.Group(), structG = new THREE.Group();
  root.add(plotsG, treesG, structG);
  scene.add(root);
  return { root, label, plotsG, treesG, structG, plots: new Map(), structs: new Map(), treeSig: '' };
}

function applySnapshot(r, s) {
  const f = r.farm;
  r.lvl = s.lvl;
  // canteiros
  const seen = new Set();
  for (const [id, crop, frac, mut, , x, z, tower] of s.p) {
    seen.add(id);
    let p = f.plots.get(id);
    if (!p) {
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const soil = new THREE.Mesh(plotGeometry(tower ? 'tower' : 'farm'), vcMat); soil.receiveShadow = true; addOutline(soil, 0.05);
      const plant = new THREE.Group(); plant.position.y = 0.4;
      g.add(soil, plant); f.plotsG.add(g);
      p = { g, plant, key: '' }; f.plots.set(id, p);
    }
    const key = crop ? crop + ':' + Math.floor(frac * 5) + (frac >= 1 ? 'r' : '') + ':' + mut : '';
    if (key !== p.key) {
      p.key = key; p.plant.clear();
      if (crop && CONFIG.crops[crop]) {
        const geom = cropGeometry(crop, frac, mut || null);
        if (geom) { const m = new THREE.Mesh(geom, vcMat); p.plant.add(m); addOutline(m); }
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
      const m = new THREE.Mesh(geom, vcMat); m.castShadow = true; g.add(m); addOutline(m);
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
  r = { id, nick, slot, lvl: 1, avatar: makeAvatar(nick), farm: makeFarmView(nick, SLOT_OFFSET[slot]), pos: new THREE.Vector3(), target: new THREE.Vector3(), yaw: 0, snap: null, fresh: true };
  scene.add(r.avatar);
  N.remotes.set(id, r);
  showToast(nick + ' entrou na sala', 'good'); play('mission');
  refreshChip(); refreshModal();
  return r;
}

function removeRemote(id) {
  const r = N.remotes.get(id);
  if (!r) return;
  refundPending(id);
  scene.remove(r.avatar, r.farm.root);
  disposeTree(r.avatar); disposeTree(r.farm.root);
  N.remotes.delete(id);
  showToast(r.nick + ' saiu da sala', 'info');
  refreshChip(); refreshModal();
}

// ---------------------------------------------------------------- Protocolo
function makeSnapshot() {
  const p = [];
  for (const q of state.plots) {
    if (!q.available || q.kind === 'island') continue;
    const growT = q.crop ? CONFIG.crops[q.crop].growTime : 1;
    p.push([q.id, q.crop || 0, q.crop ? +Math.min(1, q.progress / growT).toFixed(2) : 0, q.mutation || 0, q.sick ? 1 : 0, q.x, q.z, q.kind === 'tower' ? 1 : 0]);
  }
  const t = state.trees.map(x => [x.type, x.x, x.z, +Math.min(1, x.progress / CONFIG.trees[x.type].growTime).toFixed(2), x.fruits]);
  const s = state.structures.map(x => [x.type, x.x, x.z, x.level]);
  return { lvl: state.level, p, t, s };
}

function send(m) { // envia a mensagem para os outros (o host repassa)
  if (N.mode === 'host') N.tr.broadcast(m); else if (N.mode === 'guest') N.tr.sendHost(m);
}
const hello = () => ({ t: 'hi', id: N.myId, nick: nickOf() });

function handle(fromId, m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'full') { showToast('Sala cheia (maximo de 4 jogadores)', 'bad'); leave(true); return; }
  if (m.t === 'sync') { if (N.mode === 'guest') applySync(m); return; }
  if (m.t === 'bye') { if (N.mode === 'host' && fromId) N.tr.broadcast(m, fromId); removeRemote(m.id); return; }
  if (!m.id || m.id === N.myId) return;
  if (m.to) { // mensagem direta (presentes): o host entrega apenas ao destinatario
    if (m.to !== N.myId) { if (N.mode === 'host' && fromId) N.tr.sendTo(m.to, m); return; }
    if (m.t === 'gift') receiveGift(m); else if (m.t === 'giftok' || m.t === 'giftno') giftResult(m);
    return;
  }
  if (N.mode === 'host' && fromId) {
    if (m.t === 'hi') {
      if (!N.remotes.has(m.id) && N.remotes.size >= MAX_REMOTE) { N.tr.sendTo(fromId, { t: 'full' }); return; }
      // apresenta o host e os demais ao novo jogador
      N.tr.sendTo(fromId, hello());
      N.tr.sendTo(fromId, { t: 'farm', id: N.myId, s: makeSnapshot() });
      N.tSync = 0;
      for (const r of N.remotes.values()) {
        N.tr.sendTo(fromId, { t: 'hi', id: r.id, nick: r.nick });
        if (r.snap) N.tr.sendTo(fromId, { t: 'farm', id: r.id, s: r.snap });
      }
    }
    N.tr.broadcast(m, fromId); // repassa aos outros convidados
  }
  if (m.t === 'hi') { addRemote(m.id, m.nick); return; }
  const r = N.remotes.get(m.id) || (m.t === 'farm' || m.t === 'pos' ? addRemote(m.id, null) : null);
  if (!r) return;
  if (m.t === 'pos') {
    const off = SLOT_OFFSET[r.slot];
    const inside = inFarm(m.x, m.z);
    r.target.set(m.x + (inside ? off.x : 0), 0, m.z + (inside ? off.z : 0)); r.yaw = m.r;
    if (r.fresh) { r.pos.copy(r.target); r.fresh = false; }
  } else if (m.t === 'farm') { r.snap = m.s; applySnapshot(r, m.s); }
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
  if (kind === 'mut') { const [mu, c] = String(key).split(':'); return !!(CONFIG.mutations[mu] && CONFIG.crops[c]); }
  const tbl = kind === 'seed' || kind === 'crop' ? CONFIG.crops : kind === 'sapling' || kind === 'fruit' ? CONFIG.trees : CONFIG.products;
  return !!tbl[key];
}
function sendTo(targetId, m) {
  m.id = N.myId; m.to = targetId;
  if (N.mode === 'host') N.tr.sendTo(targetId, m); else if (N.mode === 'guest') N.tr.sendHost(m);
}
export function sendGift(toId, kind, key, n) {
  const r = N.remotes.get(toId);
  n = Math.floor(n);
  if (!r || n < 1 || !validGift(kind, key)) return false;
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
  if (seenGifts.has(m.gid)) return;
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
  if (!p) return;
  pending.delete(m.gid);
  const r = N.remotes.get(p.to), who = r ? r.nick : 'amigo';
  if (m.t === 'giftok') { play('buy'); showToast(who + ' recebeu ' + p.n + ' ' + giftName(p.kind, p.key), 'good'); }
  else { putGift(p.kind, p.key, p.n); play('error'); showToast('Presente devolvido: ' + (m.why || 'recusado'), 'bad'); save(); }
}
function refundPending(id) {
  for (const [gid, p] of pending) if (p.to === id) { putGift(p.kind, p.key, p.n); pending.delete(gid); showToast('Presente devolvido: amigo saiu da sala', 'bad'); }
}

// Host manda o relogio e o clima; convidados seguem o host (dia/noite e eventos iguais para todos)
function applySync(m) {
  state.time = m.time;
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
  send({ t: 'sync', id: N.myId, time: +state.time.toFixed(3), ev: state.event ? { id: state.event.id, left: +state.event.left.toFixed(1) } : null, boom: state.boom ? { crop: state.boom.crop, mult: state.boom.mult, left: +state.boom.left.toFixed(1) } : null });
}

// Teleporta para a fazenda ou para perto do amigo
export function visit(id, where) {
  const r = N.remotes.get(id);
  if (!r) return;
  if (where === 'farm') { const o = SLOT_OFFSET[r.slot]; camera.position.set(o.x - 32, 1.7, o.z + 6); }
  else camera.position.set(r.pos.x, 1.7, r.pos.z + 3.5);
  play('build');
}

function sendFarm() { send({ t: 'farm', id: N.myId, s: makeSnapshot() }); }

function setupTransportHandlers() {
  return {
    onPeer() {},
    onMsg: (from, m) => handle(from, m),
    onGone: from => {
      if (N.mode === 'host') { if (from && N.remotes.has(from)) { N.tr.broadcast({ t: 'bye', id: from }); removeRemote(from); } }
      else if (N.mode === 'guest') { showToast('A conexao com o host foi perdida', 'bad'); leave(true); }
    }
  };
}

// ---------------------------------------------------------------- Entrar e sair
export async function hostRoom() {
  if (N.mode !== 'solo') return { ok: false, error: 'Voce ja esta em uma sala' };
  try {
    const code = newCode();
    N.tr = await (LOCAL ? hostLocal : hostPeer)(code, setupTransportHandlers());
    N.mode = 'host'; N.code = code; N.myId = N.tr.id;
    refreshChip();
    return { ok: true, code };
  } catch (e) { N.tr = null; return { ok: false, error: e.message || 'Falha ao criar a sala' }; }
}

export async function joinRoom(code) {
  code = (code || '').trim().toUpperCase();
  if (N.mode !== 'solo') return { ok: false, error: 'Voce ja esta em uma sala' };
  if (!/^[A-Z0-9]{6}$/.test(code)) return { ok: false, error: 'Codigo invalido (6 letras e numeros)' };
  try {
    N.mode = 'joining';
    N.tr = await (LOCAL ? joinLocal : joinPeer)(code, setupTransportHandlers());
    N.mode = 'guest'; N.code = code; N.myId = N.tr.id;
    N.tr.sendHost(hello());
    sendFarm();
    refreshChip();
    showToast('Conectado a sala ' + code, 'mission');
    return { ok: true, code };
  } catch (e) { N.mode = 'solo'; N.tr = null; return { ok: false, error: e.message || 'Falha ao entrar' }; }
}

export function leave(silent) {
  if (N.mode === 'solo') return;
  try { send({ t: 'bye', id: N.myId }); } catch (e) { /* ignora */ }
  try { N.tr && N.tr.close(); } catch (e) { /* ignora */ }
  for (const id of [...N.remotes.keys()]) refundPending(id);
  for (const id of [...N.remotes.keys()]) { const r = N.remotes.get(id); scene.remove(r.avatar, r.farm.root); disposeTree(r.avatar); disposeTree(r.farm.root); N.remotes.delete(id); }
  N.mode = 'solo'; N.code = null; N.tr = null; N.myId = null;
  refreshChip(); refreshModal();
  if (!silent) showToast('Voce saiu da sala', 'info');
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
        body.append(el('p', 'hint', 'Conexao direta entre navegadores (WebRTC). Em redes muito restritivas a conexao pode falhar.'));
      } else {
        const code = el('div', 'mp-code', N.code);
        body.append(el('p', 'hint', N.mode === 'host' ? 'Voce e o host. Passe este codigo aos amigos:' : 'Conectado a sala:'), code);
        const list = el('div', 'list');
        list.append(row({ title: nickOf() + ' (voce)', desc: N.mode === 'host' ? 'Host - nivel ' + state.level : 'Nivel ' + state.level, tag: 'FAZENDA 1', tagCls: 'gold' }));
        for (const r of N.remotes.values()) list.append(row({ title: r.nick, desc: 'Nivel ' + (r.lvl || 1) + '  |  Fazenda a ' + (r.slot === 1 ? 'sul' : 'leste') + (r.slot === 2 ? ' (sudeste)' : '') + ' da cidade', tag: 'FAZENDA ' + (r.slot + 2), buttons: [
          { label: 'Dar presente', onClick: () => { openGift(r.id); return 'keep'; } },
          { label: 'Ver fazenda', onClick: () => { visit(r.id, 'farm'); return 'close'; } },
          { label: 'Ir ate ele', onClick: () => { visit(r.id, 'player'); return 'close'; } }] }));
        list.append(row({ title: 'Sair da sala', desc: 'Seu progresso continua salvo na sua conta.', buttons: [{ label: 'Sair da sala', onClick: () => { leave(); return 'keep'; } }] }));
        body.append(list, msg);
      }
    }
  });
}

// ---------------------------------------------------------------- Ciclo
export function initNet(sceneRef, cameraRef, getNick) {
  scene = sceneRef; camera = cameraRef; nickOf = getNick;
  addEventListener('beforeunload', () => leave(true));
}

const tmpDir = new THREE.Vector3(), tmpW = new THREE.Vector3();
export function updateNet(dt) {
  if (N.mode !== 'host' && N.mode !== 'guest') return;
  N.clock += dt;
  const play_ = state.mode === 'play';
  // posicao: ~10 vezes por segundo, ou a cada 1 segundo parado
  N.tPos -= dt;
  if (play_ && N.tPos <= 0) {
    const x = +camera.position.x.toFixed(2), z = +camera.position.z.toFixed(2), r = +camera.rotation.y.toFixed(2);
    const moved = Math.abs(x - N.last.x) + Math.abs(z - N.last.z) + Math.abs(r - N.last.r) > 0.02;
    if (moved || N.tPos < -1) { send({ t: 'pos', id: N.myId, x, z, r }); N.last = { x, z, r }; N.tPos = 0.1; } else N.tPos = 0.1;
  }
  N.tFarm -= dt;
  if (N.tFarm <= 0) { N.tFarm = 2; sendFarm(); }
  N.tSync -= dt;
  if (N.tSync <= 0 && N.mode === 'host') { N.tSync = 1; sendSync(); }
  // avatares suaves + etiquetas sempre de frente + estruturas animadas
  const k = 1 - Math.exp(-dt * 10);
  for (const r of N.remotes.values()) {
    if (r.pos.distanceToSquared(r.target) > 900) r.pos.copy(r.target); else r.pos.lerp(r.target, k);
    r.avatar.position.copy(r.pos);
    // andar: pulinho e bracos balancando enquanto ele se move
    const sp = r.pos.distanceTo(r.target);
    r.walk = THREE.MathUtils.lerp(r.walk || 0, sp > 0.05 ? 1 : 0, k);
    const ph = N.clock * 11, ud = r.avatar.userData;
    ud.rig.position.y = Math.abs(Math.sin(ph)) * 0.09 * r.walk;
    ud.arms[0].rotation.x = Math.sin(ph) * 0.9 * r.walk; ud.arms[1].rotation.x = -Math.sin(ph) * 0.9 * r.walk;
    r.avatar.rotation.y = r.yaw + Math.PI;
    const l = r.avatar.userData.label; if (l) { l.getWorldPosition(tmpW); tmpDir.set(camera.position.x, tmpW.y, camera.position.z); l.lookAt(tmpDir); }
    if (r.farm.root.visible) for (const g of r.farm.structs.values()) animateStructure(g, N.clock, dt);
    r.farm.label.getWorldPosition(tmpW); r.farm.label.lookAt(camera.position.x, tmpW.y, camera.position.z);
  }
  N.tCull -= dt;
  if (N.tCull <= 0) {
    N.tCull = 0.7;
    for (const r of N.remotes.values()) { const o = SLOT_OFFSET[r.slot]; r.farm.root.visible = Math.hypot(camera.position.x - (o.x - 32), camera.position.z - (o.z - 24)) < 150; }
  }
}
