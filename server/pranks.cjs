const {createHmac,randomUUID,timingSafeEqual}=require('node:crypto');
const {fail}=require('./store.cjs');
const allowed=new Set(['saucer','carrots','mushrooms']);
function sign(payload){
  const secret=process.env.ORBITAL_SIGNING_KEY||process.env.BLOB_READ_WRITE_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
  if(!secret)throw fail(503,'O servidor não conseguiu autenticar a brincadeira.');
  return createHmac('sha256',secret).update('orbital-prank-v1:'+payload).digest('base64url');
}
function issue(a,d){
  if(a.nick.toLowerCase()!=='rick')throw fail(403,'Comando exclusivo de Rick.');
  if(!allowed.has(d.command)||!/^1[A-Z0-9]{5}$/.test(d.room)||!/^[-\w]{1,80}$/.test(d.peer||'')||!/^[-\w]{3,16}$/.test(d.nick||''))throw fail(400,'Destino inválido.');
  const payload=Buffer.from(JSON.stringify({room:d.room,peer:d.peer,nick:d.nick.toLowerCase(),command:d.command,id:randomUUID(),expires:Date.now()+30000})).toString('base64url');
  return payload+'.'+sign(payload);
}
function verify(a,ticket){
  if(typeof ticket!=='string'||ticket.length>900)throw fail(400,'Bilhete inválido.');
  const parts=ticket.split('.');
  if(parts.length!==2||!/^[-\w]{43}$/.test(parts[1])||!timingSafeEqual(Buffer.from(parts[1]),Buffer.from(sign(parts[0]))))throw fail(403,'Bilhete inválido.');
  const d=JSON.parse(Buffer.from(parts[0],'base64url').toString());
  if(d.expires<=Date.now()||d.nick!==a.nick.toLowerCase())throw fail(403,'Brincadeira expirada ou endereçada a outro jogador.');
  return d;
}
module.exports={allowed,issue,verify};
