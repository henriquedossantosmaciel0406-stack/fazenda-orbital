import {connectHttpRoom} from './http-relay.js';
// O servidor empacotado anuncia o endereço do WebSocket no HTML.
const embedded = document.querySelector('meta[name="orbital-relay"]')?.content;
const setting = 'fazenda-servidor-de-salas';
export const fixedRelay = !!embedded;
export function relayAddress() {
  return embedded || localStorage.getItem(setting) || '';
}
export function setRelayAddress(value) {
  if (!value.trim()) { localStorage.removeItem(setting); return; }
  let address;
  try { address=new URL(value.trim()); } catch { throw new Error('Informe a URL completa do servidor.'); }
  if (!['https:','http:','ws:','wss:'].includes(address.protocol) || address.username || address.password) throw new Error('Use o endereço HTTP ou HTTPS do servidor.');
  if (location.protocol==='https:' && ['http:','ws:'].includes(address.protocol)) throw new Error('Este jogo está em HTTPS. Use um servidor de salas com HTTPS.');
  address.protocol=['https:','wss:'].includes(address.protocol)?'wss:':'ws:';
  if(address.pathname==='/') address.pathname='/salas';
  localStorage.setItem(setting,address.href);
}
export function connectRelay(action, code, handlers) {
  if(embedded==='/api/room')return connectHttpRoom(action,code,handlers);
  return new Promise((resolve, reject) => {
    const url = new URL(relayAddress(), location.href);
    url.protocol = ['https:','wss:'].includes(url.protocol) ? 'wss:' : 'ws:';
    const socket = new WebSocket(url);
    let ready = false, closing = false;
    const close = () => { closing = true; socket.close(); };
    const fail = reason => { clearTimeout(timer); close(); reject(new Error(reason)); };
    const timer = setTimeout(() => fail('Servidor sem resposta.'), 10000);
    const post = data => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); };
    socket.onopen = () => post({ action, code });
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (!ready) {
        if (!message.ready) return fail(message.error || 'Falha ao entrar na sala.');
        clearTimeout(timer); ready = true;
        resolve({ id: message.ready, close, sendHost: msg => post({ msg }),
          sendTo: (to, msg) => post({ to, msg }), broadcast: (msg, except) => post({ except, msg }) });
      } else if (message.gone) handlers.onGone(message.gone);
      else if (message.msg) handlers.onMsg(message.from, message.msg);
    };
    socket.onerror = () => { if (!ready) fail('Não foi possível acessar o servidor de salas.'); };
    socket.onclose = () => {
      clearTimeout(timer);
      if (!ready) reject(new Error('Conexão encerrada pelo servidor.'));
      else if (!closing) handlers.onGone();
    };
  });
}
