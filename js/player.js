// Jogador em primeira pessoa: movimento WASD (corrigido), colisao deslizante, zoom, hotbar e passos.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { CONFIG } from './config.js';
import { state, HOTBAR } from './state.js';
import { selectSlot, nextPage, isModalOpen } from './ui.js';
import { play } from './audio.js';

export function createPlayer(camera, dom) {
  const controls = new PointerLockControls(camera, dom);
  camera.position.set(-32, CONFIG.player.height, 0);
  const keys = {};
  const fwd = new THREE.Vector3();
  let stepTimer = 0;
  const baseFov = 72;
  let fov = baseFov;

  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (state.mode !== 'play' || isModalOpen()) return;
    const m = /^Digit([1-9])$/.exec(e.code);
    if (m) { const i = state.hotbarPage * CONFIG.hotbarPageSize + Number(m[1]) - 1; if (i < HOTBAR.length) selectSlot(i); }
    if (e.code === 'Tab') { e.preventDefault(); nextPage(); }
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // Zoom com a roda do mouse (campo de visao)
  addEventListener('wheel', e => {
    if (state.mode !== 'play' || isModalOpen() || !document.pointerLockElement) return;
    fov = THREE.MathUtils.clamp(fov + Math.sign(e.deltaY) * 4 * state.settings.zoomSens, 35, 90);
    camera.fov = fov; camera.updateProjectionMatrix();
  }, { passive: true });

  function blocked(x, z, world) {
    if (!world.isWalkable(x, z)) return true;
    const cs = world.colliders;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (Math.hypot(x - c.x, z - c.z) < c.radius + 0.3) return true;
    }
    return false;
  }

  return {
    controls,
    lock() { try { controls.lock(); } catch (e) { /* o navegador pode recusar */ } },
    update(dt, world) {
      controls.pointerSpeed = state.settings.mouseSens;
      if (state.mode !== 'play' || state.paused) return;
      const forward = Number(!!keys.KeyW || !!keys.ArrowUp) - Number(!!keys.KeyS || !!keys.ArrowDown);
      const right = Number(!!keys.KeyD || !!keys.ArrowRight) - Number(!!keys.KeyA || !!keys.ArrowLeft);
      camera.position.y = CONFIG.player.height;
      if (!forward && !right) { stepTimer = 0.15; return; }
      const running = !!(keys.ShiftLeft || keys.ShiftRight);
      const speed = CONFIG.player.speed * (running ? CONFIG.player.runMultiplier : 1) * (1 + (state.speedLevel - 1) * 0.12);
      camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      // frente = fwd, direita = (-fz, fx)
      let dx = fwd.x * forward + -fwd.z * right, dz = fwd.z * forward + fwd.x * right;
      const len = Math.hypot(dx, dz) || 1;
      dx = dx / len * speed * dt; dz = dz / len * speed * dt;
      const p = camera.position;
      if (!blocked(p.x + dx, p.z, world)) p.x += dx;   // desliza nas paredes: eixos separados
      if (!blocked(p.x, p.z + dz, world)) p.z += dz;
      stepTimer -= dt;
      if (stepTimer <= 0) { play('step'); stepTimer = running ? 0.27 : 0.38; }
    }
  };
}
