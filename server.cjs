// Servidor do jogo e das salas. Inicie com node server.cjs.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { networkInterfaces } = require('node:os');
const { WebSocketServer, WebSocket } = require('./server/vendor/ws');
const rooms = new Map();
const port = Number(process.env.PORT || 8000);
const index = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
  .replace('<head>', '<head><meta name="orbital-relay" content="/salas">');
const server = http.createServer((req, res) => {
  let file;
  try { file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end(); return; }
  if (file === '/' || file === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(index);
    return;
  }
  if (!/^\/(style\.css|assets\/(?:items|scenes|skills)\/[\w-]+\.png|assets\/interface\.css|assets\/fonts\/[\w-]+\.woff2?|js\/[\w./-]+\.js)$/.test(file) || file.includes('..')) {
    res.writeHead(404).end(); return;
  }
  const stream = fs.createReadStream(path.join(__dirname, file));
  stream.on('open', () => {
    res.setHeader('Content-Type', file.endsWith('.png') ? 'image/png' : file.endsWith('.woff2') ? 'font/woff2' : file.endsWith('.woff') ? 'font/woff' : file.endsWith('.css') ? 'text/css' : 'text/javascript; charset=utf-8');
    stream.pipe(res);
  });
  stream.on('error', () => res.writeHead(404).end());
});
const sockets = new WebSocketServer({ server, path: '/salas', maxPayload: 65536 });
function post(socket, msg) {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (socket.bufferedAmount > 512000) { socket.terminate(); return; }
  socket.send(JSON.stringify(msg));
}
sockets.on('connection', socket => {
  const id = randomUUID();
  let room;
  const deadline = setTimeout(() => socket.close(1008), 8000);
  socket.alive = true;
  socket.on('pong', () => { socket.alive = true; });
  socket.on('error', () => socket.terminate());
  socket.on('message', raw => {
    let d;
    try { d = JSON.parse(raw); } catch { return socket.close(1007); }
    if (!d || typeof d !== 'object') return socket.close(1007);
    if (!room) {
      const { action, code } = d;
      if (!['host','join'].includes(action) || !/^[A-Z0-9]{6}$/.test(code)) return socket.close(1008);
      const current = rooms.get(code);
      const fail = msg => { post(socket, { error: msg }); socket.close(); };
      if (action === 'host' && current) return fail('Código em uso. Crie outra sala.');
      if (action === 'join' && !current) return fail('Sala não encontrada neste servidor.');
      if (current && current.members.size >= 6) return fail('Sala cheia (6 jogadores).');
      room = current || { code, host: id, members: new Map() };
      rooms.set(code, room); room.members.set(id, socket);
      clearTimeout(deadline); post(socket, { ready: id });
      return;
    }
    if (!d.msg || typeof d.msg !== 'object') return;
    if (id !== room.host) post(room.members.get(room.host) || socket, { from: id, msg: d.msg });
    else if (d.to) { const dest = room.members.get(d.to); if (dest) post(dest, { msg: d.msg }); }
    else for (const [key, dest] of room.members) if (key !== id && key !== d.except) post(dest, { msg: d.msg });
  });
  socket.on('close', () => {
    clearTimeout(deadline);
    if (!room) return;
    room.members.delete(id);
    if (id === room.host) {
      rooms.delete(room.code);
      for (const member of room.members.values()) member.close(1001, 'Anfitriao saiu');
    } else if (room.members.has(room.host)) post(room.members.get(room.host), { gone: id });
  });
});
setInterval(() => {
  for (const client of sockets.clients) {
    if (!client.alive) client.terminate();
    else { client.alive = false; client.ping(); }
  }
}, 30000).unref();
server.listen(port, '0.0.0.0', () => {
  console.log('Fazenda Orbital: http://localhost:' + port);
  let interfaces; try { interfaces = networkInterfaces(); } catch { return; }
  for (const entries of Object.values(interfaces)) for (const nic of entries)
    if (!nic.internal && nic.family === 'IPv4') console.log('Na mesma rede: http://' + nic.address + ':' + port);
});
