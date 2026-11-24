// Cenario vivo: ceu com sol e lua, grama e flores ao vento, vagalumes, borboletas, passaros e arco-iris.
// Tudo instanciado ou em shader (barato). O vento e um uniforme unico compartilhado.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonGradient } from './toon.js';

export const windUniform = { value: 0 };

// Adiciona balanco de vento a um material (instanciado ou nao). amp = forca, o balanco cresce com a altura local.
export function applyWind(material, amp = 0.12, speed = 1.6) {
  material.onBeforeCompile = sh => {
    sh.uniforms.uWind = windUniform;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 wph = instanceMatrix[3].xz;
      #else
        vec2 wph = position.xz;
      #endif
      float wh = max(transformed.y, 0.0);
      float ws = sin(uWind * ${speed.toFixed(2)} + wph.x * 0.45 + wph.y * 0.35);
      transformed.x += ws * ${amp.toFixed(3)} * wh;
      transformed.z += cos(uWind * ${(speed * 0.8).toFixed(2)} + wph.y * 0.4) * ${amp.toFixed(3)} * 0.6 * wh;`);
  };
  material.needsUpdate = true;
  return material;
}

const SKY = {
  dayTop: new THREE.Color(0x3C93F2), dayHor: new THREE.Color(0xBDE9FF),
  nightTop: new THREE.Color(0x070A24), nightHor: new THREE.Color(0x2A2D63),
  dusk: new THREE.Color(0xFF9A66)
};

let dome, domeU, sunSprite, moonSprite, grass, flowers, fireflies, ffU, rainbow, patches;
const critters = [];
const tmpV = new THREE.Vector3(), tmpC = new THREE.Color(), tmpC2 = new THREE.Color();

function glowSprite(color, size, soft = 0.35) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, '#fff'); gr.addColorStop(soft, '#fff'); gr.addColorStop(soft + 0.04, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color, transparent: true, depthWrite: false, fog: false }));
  s.scale.setScalar(size); s.renderOrder = -900; return s;
}

function seeded(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

// Tufo de grama: 7 laminas curvas e afuniladas, escuras na base e claras na ponta
function tuftGeometry() {
  const pos = [], col = [], idx = [];
  const blades = 7;
  for (let b = 0; b < blades; b++) {
    const a = b / blades * Math.PI * 2 + (b % 2) * 0.4, r0 = 0.04 + (b % 3) * 0.05;
    const h = 0.55 + ((b * 37) % 5) * 0.12, bend = 0.18 + ((b * 13) % 4) * 0.08, w = 0.075;
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx; // direcao e perpendicular
    const rows = [[0, w, 0.5], [0.5, w * 0.75, 0.8], [1, 0.0, 1.1]];
    const v0 = pos.length / 3;
    rows.forEach(([t, ww, bright], k) => {
      const cx = dx * r0 + dx * bend * t * t, cz = dz * r0 + dz * bend * t * t, y = h * t;
      if (ww > 0) { pos.push(cx - px * ww, y, cz - pz * ww, cx + px * ww, y, cz + pz * ww); col.push(bright * 0.8, bright, bright * 0.8, bright * 0.8, bright, bright * 0.8); }
      else { pos.push(cx, y, cz); col.push(bright * 0.85, bright, bright * 0.7); }
    });
    idx.push(v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2, v0 + 2, v0 + 3, v0 + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  // normais para cima: sombreamento suave de tufo
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

export function initScenery(scene, camera, world) {
  const rnd = seeded(777);

  // --- Domo do ceu ---
  domeU = {
    uTop: { value: SKY.dayTop.clone() }, uHor: { value: SKY.dayHor.clone() }, uGlow: { value: new THREE.Color(0xff9a66) },
    uSun: { value: new THREE.Vector3(0, 1, 0) }, uGlowAmt: { value: 0 }
  };
  dome = new THREE.Mesh(new THREE.SphereGeometry(560, 24, 14), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: domeU,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uGlow; uniform vec3 uSun; uniform float uGlowAmt; varying vec3 vD;
      void main(){ float h = clamp(vD.y, 0.0, 1.0);
        vec3 c = mix(uHor, uTop, pow(h, 0.55));
        float s = max(dot(normalize(vD), normalize(uSun)), 0.0);
        c = mix(c, uGlow, uGlowAmt * pow(s, 3.0) * (1.0 - h * 0.6));
        gl_FragColor = vec4(c, 1.0); }`
  }));
  dome.renderOrder = -1000; dome.frustumCulled = false; scene.add(dome);

  sunSprite = glowSprite(0xFFE9A8, 90, 0.5); moonSprite = glowSprite(0xDCE6FF, 52, 0.55);
  scene.add(sunSprite, moonSprite);

  // --- Grama ao vento ---
  const keep = world.keepOut || (() => false);
  const tuftMat = applyWind(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient, vertexColors: true, side: THREE.DoubleSide }), 0.3, 2.0);
  grass = new THREE.InstancedMesh(tuftGeometry(), tuftMat, 3200);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  const greens = [0x5CC85A, 0x49B84E, 0x72D460, 0x3FAF6A, 0x86DB62];
  let n = 0, guard = 0;
  while (n < 3200 && guard++ < 11000) {
    const x = (rnd() - 0.5) * 232, z = (rnd() - 0.5) * 232;
    if (keep(x, z) || Math.abs(x) < 8.5) continue;
    const s = 0.7 + rnd() * 0.9;
    e.set(0, rnd() * 6.28, 0); q.setFromEuler(e);
    m4.compose(p.set(x, 0, z), q, sc.set(s, s * (0.8 + rnd() * 0.7), s)); grass.setMatrixAt(n, m4);
    grass.setColorAt(n, col.setHex(greens[n % greens.length])); n++;
  }
  grass.count = n; grass.frustumCulled = false; grass.receiveShadow = false; scene.add(grass);

  // --- Flores com haste que balancam ---
  const stem = new THREE.CylinderGeometry(0.025, 0.035, 0.55, 4); stem.translate(0, 0.275, 0);
  const head = new THREE.IcosahedronGeometry(0.17, 0); head.translate(0, 0.6, 0);
  const sc2 = new THREE.Color(0x4DB35A);
  const flowerGeo = (() => {
    const a = stem.toNonIndexed(), b = head.toNonIndexed();
    const paint = (g, c) => { const arr = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); };
    paint(a, sc2); paint(b, new THREE.Color(0xffffff));
    return mergeGeometries([a, b]);
  })();
  const flowerMat = applyWind(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient, vertexColors: true }), 0.35, 1.9);
  flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, 420);
  const fcols = [0xFF6FA5, 0xFFD166, 0xFFFFFF, 0xB26BFF, 0x59E6FF, 0xFF8A4C];
  n = 0; guard = 0;
  while (n < 420 && guard++ < 4000) {
    const x = (rnd() - 0.5) * 230, z = (rnd() - 0.5) * 230;
    if (keep(x, z) || Math.abs(x) < 9) continue;
    const s = 0.9 + rnd() * 0.8;
    e.set(0, rnd() * 6.28, 0); q.setFromEuler(e);
    m4.compose(p.set(x, 0, z), q, sc.set(s, s, s)); flowers.setMatrixAt(n, m4);
    flowers.setColorAt(n, col.setHex(fcols[n % fcols.length])); n++;
  }
  flowers.count = n; flowers.frustumCulled = false; scene.add(flowers);

  // --- Manchas de terreno (variacao de verde) ---
  const patchGeo = new THREE.CircleGeometry(1, 14); patchGeo.rotateX(-Math.PI / 2);
  patches = new THREE.InstancedMesh(patchGeo, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient }), 70);
  n = 0; guard = 0;
  const pc = [0x68BC4E, 0x84D664, 0x5BAE4A, 0x90DA6A];
  while (n < 70 && guard++ < 1500) {
    const x = (rnd() - 0.5) * 226, z = (rnd() - 0.5) * 226;
    if (keep(x, z) || Math.abs(x) < 9) continue;
    const r = 3 + rnd() * 7;
    m4.compose(p.set(x, 0.03 + n * 0.0004, z), q.identity(), sc.set(r, 1, r * (0.6 + rnd() * 0.5))); patches.setMatrixAt(n, m4);
    patches.setColorAt(n, col.setHex(pc[n % pc.length])); n++;
  }
  patches.count = n; patches.receiveShadow = true; scene.add(patches);

  // --- Vagalumes (pontos aditivos, animados no shader) ---
  const FF = 90, fpos = new Float32Array(FF * 3), fseed = new Float32Array(FF);
  for (let i = 0; i < FF; i++) { fpos.set([(rnd() - 0.5) * 60, 0.6 + rnd() * 3.2, (rnd() - 0.5) * 60], i * 3); fseed[i] = rnd() * 100; }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3)); fg.setAttribute('seed', new THREE.BufferAttribute(fseed, 1));
  ffU = { uTime: { value: 0 }, uAmt: { value: 0 }, uCenter: { value: new THREE.Vector3() } };
  fireflies = new THREE.Points(fg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: ffU,
    vertexShader: `attribute float seed; uniform float uTime; uniform float uAmt; uniform vec3 uCenter; varying float vA;
      void main(){ vec3 p = position;
        p.x = uCenter.x + mod(position.x - uCenter.x + 30.0, 60.0) - 30.0; p.z = uCenter.z + mod(position.z - uCenter.z + 30.0, 60.0) - 30.0;
        p.x += sin(uTime * 0.7 + seed) * 1.2; p.y += sin(uTime * 1.1 + seed * 2.0) * 0.5; p.z += cos(uTime * 0.6 + seed * 1.3) * 1.2;
        vA = uAmt * (0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 3.0 + seed * 5.0)));
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = clamp(130.0 / -mv.z, 2.0, 11.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * a, a * vA); }`
  }));
  fireflies.frustumCulled = false; fireflies.visible = false; scene.add(fireflies);

  // --- Arco-iris (aparece no evento) ---
  const rb = new THREE.Group();
  const rbCols = [0xFF4D6D, 0xFF9A3C, 0xFFE066, 0x6BE675, 0x4DB8FF, 0x9B6BFF];
  rbCols.forEach((c, i) => {
    const t = new THREE.Mesh(new THREE.TorusGeometry(120 - i * 3.2, 1.7, 6, 48, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    rb.add(t);
  });
  rb.position.set(-60, -2, -210); rb.rotation.y = 0.35; rb.visible = false; scene.add(rb); rainbow = rb;

  // --- Borboletas (dia) e passaros (dia) ---
  const upG = new THREE.CircleGeometry(0.2, 12); upG.scale(1, 0.85, 1); upG.translate(0.2, 0.09, 0);
  const loG = new THREE.CircleGeometry(0.13, 10); loG.translate(0.13, -0.12, 0);
  const dotG = new THREE.CircleGeometry(0.05, 8); dotG.translate(0.24, 0.1, 0.002);
  const bodyG = new THREE.CylinderGeometry(0.025, 0.02, 0.34, 5); bodyG.rotateX(Math.PI / 2);
  const bodyM = new THREE.MeshBasicMaterial({ color: 0x2B2038 });
  const bcols = [[0xFF8AD0, 0xFFF3FA], [0xFFD166, 0x7A3F00], [0x7FDBFF, 0xFFFFFF], [0xFFA45C, 0x3A1A00], [0xB48CFF, 0xFFFFFF]];
  for (let i = 0; i < 10; i++) {
    const [c1, c2] = bcols[i % bcols.length];
    const g = new THREE.Group(), m1 = new THREE.MeshBasicMaterial({ color: c1, side: THREE.DoubleSide }), m2 = new THREE.MeshBasicMaterial({ color: c2, side: THREE.DoubleSide });
    const mkWing = side => { const w = new THREE.Group(); w.add(new THREE.Mesh(upG, m1), new THREE.Mesh(loG, m1), new THREE.Mesh(dotG, m2)); w.scale.x = side; return w; };
    const l = mkWing(1), r = mkWing(-1), body = new THREE.Mesh(bodyG, bodyM);
    const inner = new THREE.Group(); inner.rotation.x = Math.PI / 2; inner.add(l, r); // asas no plano horizontal em repouso
    const rig = new THREE.Group(); rig.add(body, inner); rig.scale.setScalar(1.5); g.add(rig); scene.add(g);
    critters.push({ kind: 'fly', g, l, r, cx: (rnd() - 0.5) * 80, cz: (rnd() - 0.5) * 80 - 10, ph: rnd() * 10, sp: 0.2 + rnd() * 0.25, rad: 4 + rnd() * 8, h: 1.0 + rnd() * 1.6 });
  }
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x2B2E4A, side: THREE.DoubleSide });
  const bw = new THREE.PlaneGeometry(1.5, 0.5); bw.translate(0.75, 0, 0);
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group(), l = new THREE.Mesh(bw, birdMat), r = new THREE.Mesh(bw, birdMat); r.scale.x = -1;
    g.add(l, r); scene.add(g);
    critters.push({ kind: 'bird', g, l, r, ph: rnd() * 10, sp: 0.07 + rnd() * 0.05, rad: 60 + rnd() * 70, h: 38 + rnd() * 24, dir: rnd() > 0.5 ? 1 : -1 });
  }
  world.rainbow = rainbow;
}

// day 0..1, wv = weatherVisual, rainbowOn bool, rain 0..1
export function updateScenery(dt, t, ang, camera, sun, wv, rainbowOn, rainAmt) {
  windUniform.value += dt * (1 + rainAmt * 1.5);
  const cx = camera.position.x, cz = camera.position.z;
  dome.position.copy(camera.position);

  // Direcao do sol (a mesma da luz) e da lua (oposta)
  const elev = Math.sin(ang - Math.PI / 2);
  tmpV.set(Math.cos(ang) * 0.7, elev, Math.sin(ang) * 0.7).normalize();
  domeU.uSun.value.copy(tmpV);
  const dayK = THREE.MathUtils.clamp((elev + 0.05) / 0.5, 0, 1);
  domeU.uTop.value.lerpColors(SKY.nightTop, SKY.dayTop, dayK);
  domeU.uHor.value.lerpColors(SKY.nightHor, SKY.dayHor, dayK);
  const dusk = Math.max(0, 1 - Math.abs(elev) / 0.32);
  domeU.uGlowAmt.value = dusk * 0.95;
  if (wv.amount > 0.01) {
    tmpC.copy(wv.color).multiplyScalar(0.35 + 0.65 * dayK);
    domeU.uTop.value.lerp(tmpC, wv.amount * 0.9); domeU.uHor.value.lerp(tmpC2.copy(tmpC).lerp(domeU.uHor.value, 0.4), wv.amount);
  }
  sunSprite.position.copy(camera.position).addScaledVector(tmpV, 480);
  sunSprite.visible = elev > -0.12; sunSprite.material.opacity = THREE.MathUtils.clamp(1 - wv.amount * 1.2, 0, 1);
  sunSprite.material.color.setHex(0xFFE9A8).lerp(tmpC2.setHex(0xFF8A4C), dusk);
  moonSprite.position.copy(camera.position).addScaledVector(tmpV, -480);
  moonSprite.visible = elev < 0.1; moonSprite.material.opacity = THREE.MathUtils.clamp(1 - wv.amount * 1.1, 0, 1);

  // Vagalumes: noite sem chuva
  const ffAmt = THREE.MathUtils.clamp(1 - dayK * 1.6, 0, 1) * (1 - rainAmt);
  fireflies.visible = ffAmt > 0.03; ffU.uAmt.value = ffAmt; ffU.uTime.value += dt; ffU.uCenter.value.set(cx, 0, cz);

  // Arco-iris
  const target = rainbowOn ? 0.85 * dayK : 0;
  const cur = rainbow.children[0].material.opacity, nxt = cur + (target - cur) * Math.min(1, dt * 0.8);
  rainbow.visible = nxt > 0.01;
  if (rainbow.visible || cur > 0) rainbow.children.forEach(c => { c.material.opacity = nxt; });

  // Criaturas
  const dayVis = dayK > 0.25 && rainAmt < 0.3;
  for (let i = 0; i < critters.length; i++) {
    const c = critters[i];
    c.g.visible = dayVis;
    if (!dayVis) continue;
    const a = t * c.sp + c.ph;
    if (c.kind === 'fly') {
      const x = c.cx + Math.cos(a) * c.rad + Math.sin(a * 2.3) * 1.5, z = c.cz + Math.sin(a * 1.2) * c.rad * 0.7;
      c.g.position.set(x, c.h + Math.sin(a * 3) * 0.4, z);
      c.g.rotation.y = -a + Math.PI / 2;
      const f = 0.2 + (Math.sin(t * 15 + c.ph) * 0.5 + 0.5) * 1.1; c.l.rotation.y = -f; c.r.rotation.y = f;
    } else {
      const aa = a * c.dir;
      c.g.position.set(cx * 0.3 + Math.cos(aa) * c.rad, c.h + Math.sin(aa * 2) * 2, cz * 0.3 + Math.sin(aa) * c.rad);
      c.g.rotation.y = -aa + (c.dir > 0 ? 0 : Math.PI);
      const f = Math.sin(t * 5 + c.ph) * 0.55; c.l.rotation.z = f; c.r.rotation.z = -f;
    }
  }
}
