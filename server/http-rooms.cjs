const {randomBytes,randomUUID}=require('node:crypto');
const {redis,hash,fail}=require('./store.cjs');
const accounts=require('./accounts.cjs');

// Cada sala ocupa uma única partição. A lista de participantes, o lote emitido e
// a leitura da caixa de entrada são tratados atomicamente em qualquer instância.
const roomScript=`
local key=KEYS[1]
local op,id,proof,nick=ARGV[1],ARGV[2],ARGV[3],ARGV[4]
local now,seq,after=tonumber(ARGV[5]),tonumber(ARGV[6]),tonumber(ARGV[7])
local raw=redis.call('GET',key)
local room=raw and cjson.decode(raw)
local function inbox(p) return key..':'..p end
local function erase()
  for peer in pairs(room.members) do redis.call('DEL',inbox(peer)) end
  redis.call('DEL',key)
end
local function persist() redis.call('SET',key,cjson.encode(room),'EX',100) end
local function post(peer,from,data)
  local m=room.members[peer]
  m.count=m.count+1
  redis.call('XADD',inbox(peer),'MAXLEN',192,tostring(m.count)..'-0','from',from,'data',data)
  redis.call('EXPIRE',inbox(peer),100)
end
if room and (now-room.members[room.host].seen>90000) then erase();room=nil end
if op=='host' then
  if room then return {409,'Código em uso. Crie outra sala.'} end
  room={host=id,members={}}
elseif not room then return {410,'Sala encerrada ou código inexistente.'} end
local members=room.members
for peer,m in pairs(members) do
  if peer~=room.host and now-m.seen>90000 then
    members[peer]=nil;redis.call('DEL',inbox(peer));post(room.host,peer,'@gone')
  end
end
local total=0
for peer in pairs(members) do total=total+1 end
if op=='host' or op=='join' then
  if total>=4 then return {409,'Sala cheia (4 jogadores).'} end
  for _,m in pairs(members) do if m.nick==nick then return {409,'Esta conta já está na sala. Cada jogador precisa da própria conta.'} end end
  members[id]={proof=proof,nick=nick,seen=now,batch=0,count=0}
  persist();return {200,'ok',total+1}
end
local me=members[id]
if not me or me.proof~=proof then return {410,'Sua conexão com esta sala expirou.'} end
if op=='leave' then
  if id==room.host then erase() else members[id]=nil;redis.call('DEL',inbox(id));post(room.host,id,'@gone');persist() end
  return {200,'ok',0}
end
if after>me.count or me.count-after>192 then return {410,'O jogador ficou muito tempo desconectado. Entre novamente.'} end
if seq~=me.batch and seq~=me.batch+1 then return {409,'Sequência da sala desatualizada. Entre novamente.'} end
if seq==me.batch+1 then
  local packets=cjson.decode(ARGV[8])
  for _,p in ipairs(packets) do
    if id~=room.host then post(room.host,id,p.wire)
    elseif p.to then if members[p.to] and p.to~=id then post(p.to,'',p.wire) end
    else for target in pairs(members) do if target~=id and target~=p.except then post(target,'',p.wire) end end end
  end
  me.batch=seq
end
me.seen=now;persist()
local rows=redis.call('XRANGE',inbox(id),tostring(after+1)..'-0','+','COUNT',64)
return {200,'ok',total,rows}
`;
const identity=/^[0-9a-f-]{36}$/;
module.exports=async function handle(req,res){
  const send=(code,data)=>res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}).end(JSON.stringify(data));
  try{
    if(req.method!=='POST')throw fail(405,'Use POST.');
    if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw fail(403,'Origem inválida.');
    const d=await accounts.body(req), {op,code}=d;
    if(!['host','join','poll','leave'].includes(op)||typeof code!=='string'||!/^[A-Z0-9]{6}$/.test(code))throw fail(400,'Código ou operação inválidos.');
    const admission=op==='host'||op==='join';
    let id=d.id,token=d.token,nick='',packets=[];
    if(admission){
      const {a}=await accounts.current(req);nick=a.nick.toLowerCase();
      id=randomUUID();token=randomBytes(32).toString('hex');
    }else{
      if(!identity.test(id)||typeof token!=='string'||!/^([a-f0-9]{64})$/.test(token))throw fail(401,'Sessão da sala inválida.');
      if(op==='poll'){
        if(!Number.isSafeInteger(d.seq)||d.seq<1||!Number.isSafeInteger(d.after)||d.after<0||!Array.isArray(d.packets)||d.packets.length>48)throw fail(400,'Lote da sala inválido.');
        packets=d.packets.map(p=>{
          if(!p?.msg||typeof p.msg.t!=='string'||(p.to&&!identity.test(p.to))||(p.except&&!identity.test(p.except)))throw fail(400,'Mensagem da sala inválida.');
          const wire=JSON.stringify(p.msg);
          if(Buffer.byteLength(wire)>65536)throw fail(413,'Mensagem grande demais.');
          return {wire,...(p.to?{to:p.to}:{}),...(p.except?{except:p.except}:{})};
        });
      }
    }
    const result=await redis('EVAL',roomScript,1,'orbital:v1:{room-'+code+'}',op,id,hash(token),nick,Date.now(),d.seq||0,d.after||0,JSON.stringify(packets));
    const [status,message,size,rows]=result;
    if(status!==200)throw fail(status,message);
    if(admission)return send(200,{ok:true,id,token,size});
    const events=(rows||[]).map(([cursor,fields])=>({cursor:Number(cursor.split('-')[0]),from:fields[1]||null,...(fields[3]==='@gone'?{gone:true}:{msg:JSON.parse(fields[3])})}));
    send(200,{ok:true,size,events});
  }catch(e){send(e.status||503,{ok:false,error:e.status?e.message:'Servidor de salas temporariamente indisponível.'});}
};
