// Contas locais: nick + senha (sem email). Os dados ficam no navegador; cada conta tem o proprio save.
import { LEGACY_KEY } from './state.js';

const KEY = 'fazenda-accounts-v1', LAST = 'fazenda-last-nick', ITER = 60000;
const enc = new TextEncoder();

export const validNick = n => /^[A-Za-z0-9_-]{3,16}$/.test(n);
export const saveKeyFor = nick => LEGACY_KEY + ':' + nick.toLowerCase();

function readAll() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
function writeAll(o) { localStorage.setItem(KEY, JSON.stringify(o)); }
export const lastNick = () => { try { return localStorage.getItem(LAST) || ''; } catch (e) { return ''; } };
export const hasAccounts = () => Object.keys(readAll()).length > 0;

const hex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
function randomSalt() {
  const a = new Uint8Array(16);
  (globalThis.crypto || { getRandomValues: x => x.forEach((_, i) => { x[i] = Math.floor(Math.random() * 256); }) }).getRandomValues(a);
  return hex(a);
}
// Funcao de hash simples (53 bits) usada apenas quando o navegador nao oferece crypto.subtle (paginas sem HTTPS)
function weakHash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let r = 0; r < 4000; r++) for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
async function derive(pass, salt) {
  if (globalThis.crypto && crypto.subtle) {
    const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: ITER }, key, 256);
    return { alg: 'pbkdf2', hash: hex(bits) };
  }
  return { alg: 'weak', hash: weakHash(salt + ':' + pass) };
}

export async function register(nick, pass) {
  nick = nick.trim();
  if (!validNick(nick)) return { ok: false, error: 'Nick: 3 a 16 letras, numeros, _ ou -' };
  if (pass.length < 4) return { ok: false, error: 'Senha: minimo 4 caracteres' };
  const all = readAll(), k = nick.toLowerCase();
  if (all[k]) return { ok: false, error: 'Esse nick ja existe' };
  const first = Object.keys(all).length === 0;
  const salt = randomSalt();
  const d = await derive(pass, salt);
  all[k] = { nick, salt, alg: d.alg, hash: d.hash, created: Date.now() };
  writeAll(all);
  // A primeira conta herda o progresso salvo antes do sistema de contas
  let imported = false;
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (first && legacy && !localStorage.getItem(saveKeyFor(nick))) { localStorage.setItem(saveKeyFor(nick), legacy); imported = true; }
    localStorage.setItem(LAST, nick);
  } catch (e) { /* ignora */ }
  return { ok: true, nick, imported };
}

export async function login(nick, pass) {
  const all = readAll(), a = all[nick.trim().toLowerCase()];
  if (!a) return { ok: false, error: 'Conta nao encontrada' };
  const d = await derive(pass, a.salt);
  if (d.alg !== a.alg || d.hash !== a.hash) return { ok: false, error: 'Senha incorreta' };
  try { localStorage.setItem(LAST, a.nick); } catch (e) { /* ignora */ }
  return { ok: true, nick: a.nick };
}

// Manter conectado: guarda nick + verificador (o mesmo dado ja salvo na conta; a senha em si nunca e guardada)
const REM = 'fazenda-remember';
export function setRemember(nick, on) {
  try {
    if (!on) { localStorage.removeItem(REM); return; }
    const a = readAll()[nick.toLowerCase()];
    if (a) localStorage.setItem(REM, JSON.stringify({ nick: a.nick, hash: a.hash }));
  } catch (e) { /* ignora */ }
}
export const rememberedOn = () => { try { return !!localStorage.getItem(REM); } catch (e) { return false; } };
export function autoLogin() {
  try {
    const r = JSON.parse(localStorage.getItem(REM)), a = r && readAll()[r.nick.toLowerCase()];
    if (a && a.hash === r.hash) return { ok: true, nick: a.nick };
  } catch (e) { /* ignora */ }
  return null;
}

export function deleteAccountData(nick) { try { localStorage.removeItem(saveKeyFor(nick)); } catch (e) { /* ignora */ } }
