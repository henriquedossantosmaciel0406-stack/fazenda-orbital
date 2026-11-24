// Efeitos visuais: particulas em pool, chuva e meteorito. Nada e alocado dentro do loop.
import * as THREE from 'three';

const MAX_PARTICLES = 500;
const RAIN_COUNT = 700;
let scene, camera;
let pPoints, pPos, pCol, pVel, pLife, pMax, pCursor = 0;
let rain, rainPos, rainIntensity = 0, rainTarget = 0;
let meteor = null;
const tmpColor = new THREE.Color();
let particleScale = 1;
let rainActiveCount = RAIN_COUNT;

function makeDotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export function initEffects(currentScene, currentCamera) {
  scene = currentScene; camera = currentCamera;

  // --- Particulas ---
  const geo = new THREE.BufferGeometry();
  pPos = new Float32Array(MAX_PARTICLES * 3);
  pCol = new Float32Array(MAX_PARTICLES * 3);
  pVel = new Float32Array(MAX_PARTICLES * 3);
  pLife = new Float32Array(MAX_PARTICLES);
  pMax = new Float32Array(MAX_PARTICLES);
  for (let i = 0; i < MAX_PARTICLES; i++) pPos[i * 3 + 1] = -100;
  geo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  pPoints = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.35, map: makeDotTexture(), vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  pPoints.frustumCulled = false;
  scene.add(pPoints);

  // --- Chuva: quads em shader, queda por uniform de tempo (sem CPU, nunca congela) ---
  const rGeo = new THREE.BufferGeometry();
  const base = new Float32Array(RAIN_COUNT * 4 * 3), corner = new Float32Array(RAIN_COUNT * 4 * 2), idx = [];
  for (let i = 0; i < RAIN_COUNT; i++) {
    const x = (Math.random() - 0.5) * 50, y = Math.random() * 25, z = (Math.random() - 0.5) * 50;
    for (let k = 0; k < 4; k++) { base.set([x, y, z], (i * 4 + k) * 3); corner.set([k < 2 ? -1 : 1, k % 2], (i * 4 + k) * 2); }
    const v = i * 4; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
  }
  rGeo.setAttribute('position', new THREE.BufferAttribute(base, 3));
  rGeo.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
  rGeo.setIndex(idx);
  rain = new THREE.Mesh(rGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0xCFE8FF) } },
    vertexShader: `attribute vec2 corner; uniform float uTime; varying float vE;
      void main(){ vec3 p = position; p.y = mod(p.y - uTime * 26.0, 25.0); p.x += (25.0 - p.y) * 0.06;
        vec4 mv = modelViewMatrix * vec4(p.x, p.y - corner.y * 1.3, p.z, 1.0);
        mv.x += corner.x * 0.045; vE = (1.0 - corner.y * 0.7) * smoothstep(2.5, 7.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vE;
      void main(){ gl_FragColor = vec4(uColor, uOpacity * vE); }`
  }));
  rain.frustumCulled = false; rain.visible = false; rain.userData.count = RAIN_COUNT;
  scene.add(rain);

  // --- Meteorito (um unico objeto reutilizado) ---
  meteor = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), new THREE.MeshStandardMaterial({ color: 0xFF9A3C, emissive: 0xFF5A1A, emissiveIntensity: 1.4, flatShading: true }));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xFFB060, transparent: true, opacity: 0.25 }));
  meteor.add(rock, glow);
  meteor.visible = false; meteor.userData = { active: false, target: new THREE.Vector3(), t: 0, done: null };
  scene.add(meteor);
}

export function setEffectsQuality(quality) {
  if (quality === 'baixa') {
    particleScale = 0.35;
    rainActiveCount = 220;
  } else if (quality === 'alta') {
    particleScale = 1;
    rainActiveCount = RAIN_COUNT;
  } else {
    particleScale = 0.7;
    rainActiveCount = 450;
  }
  if (pPoints) pPoints.material.size = quality === 'baixa' ? 0.28 : quality === 'alta' ? 0.38 : 0.34;
}

// Explosao de particulas coloridas
export function burst(x, y, z, color = 0xFFD166, count = 18, speed = 3, up = 2.5) {
  tmpColor.setHex(color);
  const activeCount = Math.max(1, Math.round(count * particleScale));
  for (let n = 0; n < activeCount; n++) {
    const i = pCursor; pCursor = (pCursor + 1) % MAX_PARTICLES;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    const a = Math.random() * Math.PI * 2, s = (0.3 + Math.random()) * speed;
    pVel[i * 3] = Math.cos(a) * s; pVel[i * 3 + 1] = up * (0.4 + Math.random()); pVel[i * 3 + 2] = Math.sin(a) * s;
    pCol[i * 3] = tmpColor.r; pCol[i * 3 + 1] = tmpColor.g; pCol[i * 3 + 2] = tmpColor.b;
    pLife[i] = pMax[i] = 0.6 + Math.random() * 0.6;
  }
}

// Coluna de particulas subindo (usada na construcao)
export function pillar(x, z, color, count = 30) {
  tmpColor.setHex(color);
  const activeCount = Math.max(1, Math.round(count * particleScale));
  for (let n = 0; n < activeCount; n++) {
    const i = pCursor; pCursor = (pCursor + 1) % MAX_PARTICLES;
    const a = Math.random() * Math.PI * 2, r = Math.random() * 1.4;
    pPos[i * 3] = x + Math.cos(a) * r; pPos[i * 3 + 1] = 0.2; pPos[i * 3 + 2] = z + Math.sin(a) * r;
    pVel[i * 3] = 0; pVel[i * 3 + 1] = 3 + Math.random() * 3; pVel[i * 3 + 2] = 0;
    pCol[i * 3] = tmpColor.r; pCol[i * 3 + 1] = tmpColor.g; pCol[i * 3 + 2] = tmpColor.b;
    pLife[i] = pMax[i] = 0.8 + Math.random() * 0.8;
  }
}

export function setRain(intensity) { rainTarget = intensity; }
export const rainLevel = () => rainIntensity;

export function launchMeteor(x, z, onLand) {
  const d = meteor.userData;
  d.active = true; d.t = 0; d.done = onLand; d.target.set(x, 0.5, z);
  meteor.position.set(x - 40, 70, z - 25);
  meteor.visible = true;
}

export function updateEffects(dt) {
  // Particulas
  let alive = false;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (pLife[i] <= 0) continue;
    alive = true;
    pLife[i] -= dt;
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -100; continue; }
    pVel[i * 3 + 1] -= 6 * dt;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    // Desbotar sem alocar: escurecer cor (blend aditivo)
    const f = pLife[i] / pMax[i];
    pCol[i * 3] *= 1 - dt * (1.5 - f); pCol[i * 3 + 1] *= 1 - dt * (1.5 - f); pCol[i * 3 + 2] *= 1 - dt * (1.5 - f);
  }
  if (alive) { pPoints.geometry.attributes.position.needsUpdate = true; pPoints.geometry.attributes.color.needsUpdate = true; }

  // Chuva
  rainIntensity += (rainTarget - rainIntensity) * Math.min(1, dt * 1.5);
  if (rainIntensity < 0.02) { rain.visible = false; }
  else {
    rain.visible = true; rain.material.uniforms.uOpacity.value = 0.7 * rainIntensity;
    rain.material.uniforms.uTime.value += dt;
    rain.position.set(camera.position.x, 0, camera.position.z);
    rain.geometry.setDrawRange(0, rainActiveCount * 6);
  }

  // Meteorito
  const m = meteor.userData;
  if (m.active) {
    m.t += dt / 1.8;
    const t = Math.min(1, m.t);
    meteor.position.set(m.target.x - 40 * (1 - t), 70 * (1 - t * t) + 0.5, m.target.z - 25 * (1 - t));
    meteor.rotation.x += dt * 4; meteor.rotation.z += dt * 3;
    burst(meteor.position.x, meteor.position.y, meteor.position.z, 0xFF9A3C, 2, 0.5, 0.5);
    if (t >= 1) {
      m.active = false; meteor.visible = false;
      burst(m.target.x, 0.6, m.target.z, 0xFFB060, 40, 6, 5);
      burst(m.target.x, 0.6, m.target.z, 0xFFE9A0, 25, 3, 7);
      if (m.done) m.done();
    }
  }
}
