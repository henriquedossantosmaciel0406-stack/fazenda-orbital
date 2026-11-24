// Audio procedural (Web Audio API). Nenhum arquivo externo e necessario.
import { state } from './state.js';

let ctx = null, master = null, sfxGain = null, musicGain = null, noiseBuf = null;
let droneOsc = null, droneGain = null, musicTimer = null, chordIndex = 0;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.connect(ctx.destination);
  sfxGain = ctx.createGain(); sfxGain.connect(master);
  musicGain = ctx.createGain(); musicGain.connect(master);
  // Buffer de ruido reutilizavel (passos, agua, chuva)
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // Zumbido continuo do drone (volume controlado por distancia)
  droneOsc = ctx.createOscillator(); droneOsc.type = 'sawtooth'; droneOsc.frequency.value = 95;
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 380;
  droneGain = ctx.createGain(); droneGain.gain.value = 0;
  droneOsc.connect(filt); filt.connect(droneGain); droneGain.connect(sfxGain); droneOsc.start();
  applyVolumes();
  startMusic();
}

export function applyVolumes() {
  if (!ctx) return;
  const s = state.settings;
  master.gain.value = s.volume;
  musicGain.gain.value = s.music * 0.35;
  sfxGain.gain.value = 0.9;
}

function tone(freq, start, dur, type = 'sine', vol = 0.2, slideTo = null) {
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur + 0.05);
}

function noise(start, dur, freq, vol = 0.15, q = 1) {
  const t = ctx.currentTime + start;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(sfxGain); src.start(t); src.stop(t + dur + 0.05);
}

const SOUNDS = {
  step:    () => noise(0, 0.09, 260 + Math.random() * 120, 0.12, 0.8),
  plant:   () => { tone(260, 0, 0.12, 'sine', 0.2, 180); noise(0, 0.1, 500, 0.08); },
  water:   () => { noise(0, 0.35, 1800, 0.12, 2); tone(700, 0, 0.2, 'sine', 0.05, 420); },
  harvest: () => { tone(520, 0, 0.1, 'triangle', 0.2); tone(780, 0.08, 0.16, 'triangle', 0.2); },
  buy:     () => { tone(660, 0, 0.09, 'square', 0.1); tone(990, 0.08, 0.14, 'square', 0.1); },
  sell:    () => { tone(880, 0, 0.08, 'triangle', 0.2); tone(1175, 0.07, 0.08, 'triangle', 0.2); tone(1480, 0.14, 0.18, 'triangle', 0.2); },
  build:   () => { tone(120, 0, 0.18, 'square', 0.14); tone(120, 0.22, 0.18, 'square', 0.14); tone(180, 0.44, 0.3, 'sawtooth', 0.12, 360); noise(0, 0.5, 300, 0.1); },
  upgrade: () => { [392, 523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.2, 'triangle', 0.18)); },
  error:   () => { tone(180, 0, 0.18, 'sawtooth', 0.15, 110); },
  mission: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 'sine', 0.22)); },
  rain:    () => noise(0, 0.6, 3000, 0.06, 0.6),
  alert:   () => { tone(740, 0, 0.14, 'sine', 0.18); tone(554, 0.16, 0.2, 'sine', 0.18); },
  click:   () => tone(900, 0, 0.04, 'square', 0.06)
};

export function play(name) {
  if (!ctx || ctx.state !== 'running') return;
  const fn = SOUNDS[name];
  if (fn) fn();
}

// Volume do zumbido: 0 (longe) a 1 (perto). Chamado a cada quadro, sem alocar objetos.
export function setDroneHum(level, pitch = 1) {
  if (!ctx) return;
  droneGain.gain.setTargetAtTime(level * 0.05, ctx.currentTime, 0.2);
  droneOsc.frequency.setTargetAtTime(95 * pitch, ctx.currentTime, 0.3);
}

// ---------- Musica ambiente relaxante (acordes suaves gerados) ----------
const CHORDS = [
  [196.0, 246.94, 293.66, 392.0], // Sol maior
  [164.81, 220.0, 261.63, 329.63], // Mi menor
  [130.81, 196.0, 261.63, 329.63], // Do maior
  [146.83, 220.0, 293.66, 369.99]  // Re maior
];
const PENTA = [392, 440, 493.88, 587.33, 659.25, 783.99];

function startMusic() {
  if (musicTimer) return;
  const playChord = () => {
    if (!ctx || ctx.state !== 'running') return;
    const chord = CHORDS[chordIndex++ % CHORDS.length];
    const t = ctx.currentTime;
    for (const f of chord) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 8;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16, t + 2.2);
      g.gain.linearRampToValueAtTime(0.0001, t + 7.5);
      o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 8);
    }
    // Notas suaves de pentatonica
    for (let i = 0; i < 3; i++) {
      const f = PENTA[Math.floor(Math.random() * PENTA.length)];
      const st = t + 1 + i * 2 + Math.random();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.07, st + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 1.8);
      o.connect(g); g.connect(musicGain); o.start(st); o.stop(st + 2);
    }
  };
  playChord();
  musicTimer = setInterval(playChord, 7000);
}
