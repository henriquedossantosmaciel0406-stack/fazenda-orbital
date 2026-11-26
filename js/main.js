// Ponto de entrada: renderer, cena, camera, loop principal e ligacao dos modulos.
import * as THREE from 'three';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import {enableOrbitalPass} from './state.js';
import {PETS} from './actors.js';
import { initGame, updateGame } from './game.js';
import { state, load, save, setSaveKey } from './state.js';
import { saveKeyFor } from './accounts.js';
import { initNet, updateNet, openMultiplayer } from './net.js';
import { bindUI, updateHUD, selectSlot, showMainMenu, setLockHandler, icon, showToast, showLogin, setAccountName, isModalOpen } from './ui.js';
import { applyVolumes } from './audio.js';
import { mergeGroupStatic } from './optimize.js';
import { restoreEventVisuals } from './events.js';
import { setEffectsQuality } from './effects.js';
import {setFieldQuality} from './scenery.js';
import { setOutlines } from './toon.js';

const canvas = document.getElementById('game');
const dprNative = devicePixelRatio || 1;
const session = await showLogin();
let renderer;
try {
  renderer = new THREE.WebGLRenderer({canvas,antialias:dprNative<2,powerPreference:'high-performance'});
} catch (error) {
  const notice=document.getElementById('graphicsNotice');
  notice.hidden=false;
  notice.querySelector('button').onclick=()=>location.reload();
  throw error;
}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // atualizado manualmente a cada 3 quadros
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 700);

// Login/cadastro antes de tudo: cada conta tem o proprio save
setSaveKey(saveKeyFor(session.nick));
const hasSave = load(); // o save e lido ANTES de criar o jogo, para restaurar canteiros sem duplicar
if (session.orbitalPass) enableOrbitalPass(Object.keys(PETS));
const world = createWorld(scene);

// Congela as matrizes do cenario fixo: o Three.js deixa de recalcula-las a cada quadro.
const dynamic = new Set([world.clouds, world.water, world.islandRocks, world.bridge, ...world.crystalNodes.map(n => n.mesh)]);
// Funde malhas estaticas de cada grupo do cenario (menos chamadas de desenho)
const underDynamic = o => { for (let p = o; p; p = p.parent) if (dynamic.has(p) || (world.overlays && world.overlays.includes(p))) return true; return false; };
const skipMerge = o => underDynamic(o) || o.material === world.gateMat || o.userData.keep || (o.material && o.material.emissiveIntensity > 0.3) || !o.visible;
scene.children.slice().forEach(g => { if (g.isGroup && !dynamic.has(g) && !(world.overlays && world.overlays.includes(g))) mergeGroupStatic(g, skipMerge); });
scene.traverse(o => { if (o.userData.animated || o.isLight || o === world.sun.target || dynamic.has(o)) return; o.matrixAutoUpdate = false; o.updateMatrix(); });

const player = createPlayer(camera, renderer.domElement);
scene.add(camera);
initGame(scene, camera, world);
initNet(scene, camera, () => session.nick, world);
restoreEventVisuals();

// ---------- Qualidade e resolucao dinamica ----------
const profiles = {
  baixa: {pixels:0.75, mobile:0.75, shadow:0, stars:80, planet:false},
  media: {pixels:1.25, mobile:1.15, shadow:1024, stars:280, planet:true},
  alta: {pixels:2, mobile:1.65, shadow:2048, stars:500, planet:true}
};
const profile = () => profiles[state.settings.quality] || profiles.media;
let resScale = 1; // multiplicador automatico (0.5 a 1)
function applyResolution() {
  const preset = profile();
  const cap = matchMedia('(pointer: coarse)').matches ? preset.mobile : preset.pixels;
  renderer.setPixelRatio(Math.max(0.5, Math.min(dprNative * (state.settings.quality==='alta'?1.35:1),cap) * resScale));
  renderer.setSize(innerWidth, innerHeight);
}
function applyQuality() {
  const q = state.settings.quality;
  setEffectsQuality(q);
  setFieldQuality(q);
  setOutlines(q !== 'baixa');
  const sun = world.sun;
  const preset=profile();
  renderer.shadowMap.enabled = sun.castShadow = !!preset.shadow;
  renderer.shadowMap.type = q==='alta' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  world.setCloudQuality(q);
  world.skyPlanet.visible=preset.planet;
  world.skyPlanet.children[1].visible=q==='alta';
  world.stars.geometry.setDrawRange(0,preset.stars);
  const size = preset.shadow || 512;
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  resScale = 1;
  applyResolution();
  renderer.shadowMap.needsUpdate = true;
}
try {
  const deviceQuality=localStorage.getItem('orbital-graphics');
  if(Object.hasOwn(profiles,deviceQuality)) state.settings.quality=deviceQuality;
} catch {}
applyQuality();

setLockHandler(() => player.lock());
bindUI({
  onStart: () => {
    applyVolumes(); player.lock(); updateHUD();
    const kh = document.getElementById('keyHelp'); kh.classList.remove('gone'); clearTimeout(kh.t); kh.t = setTimeout(() => kh.classList.add('gone'), 15000);
    if (session.imported) { showToast('Progresso anterior importado para a conta ' + session.nick, 'mission'); session.imported = false; }
  },
  onMultiplayer: () => openMultiplayer(),
  onLogout: () => { if (state.mode === 'play') save(); location.reload(); },
  onQuit: () => {
    if (document.pointerLockElement) document.exitPointerLock();
    showMainMenu(true);
  },
  onSettings: () => {
    applyQuality();
    try { localStorage.setItem('orbital-graphics',state.settings.quality); } catch {}
  }
});
document.querySelectorAll('[data-icon]').forEach(e => { e.innerHTML = icon(e.dataset.icon); });
showMainMenu(hasSave);
setAccountName(session.nick);
addEventListener('keydown', e => { if (e.code === 'KeyH' && state.mode === 'play' && !isModalOpen()) document.getElementById('keyHelp').classList.toggle('gone'); });
selectSlot(state.selectedSlot || 0);
updateHUD();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  applyResolution();
});
addEventListener('beforeunload', () => { if (state.mode === 'play') save(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state.mode === 'play') save(); });

// ---------- Loop ----------
const clock = new THREE.Clock();
let frame = 0, ema = 16, adjustTimer = 0, goodChecks = 0, warmup = 4;
renderer.setAnimationLoop(() => {
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.05);
  player.update(dt, world);
  updateGame(dt);
  updateNet(Math.min(raw, 0.5));
  if (++frame % 3 === 0) renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);

  // Resolucao dinamica: se o FPS cair, reduz a nitidez; se sobrar folga, devolve aos poucos.
  if (!document.hidden && raw < 0.5) ema += (raw * 1000 - ema) * 0.05;
  warmup -= dt;
  adjustTimer += dt;
  if (adjustTimer >= 2 && warmup <= 0) {
    adjustTimer = 0;
    if (ema > 24 && resScale > 0.7) { resScale = Math.max(0.7, resScale - 0.1); applyResolution(); goodChecks = 0; }
    else if (ema < 18) { if (++goodChecks >= 4 && resScale < 1) { resScale = Math.min(1, resScale + 0.1); applyResolution(); goodChecks = 0; } }
    else goodChecks = 0;
  }
});

// Ajuda para diagnostico no console
window.__fazenda = { state, showToast, camera, world, scene, renderer, get resScale() { return resScale; } };
