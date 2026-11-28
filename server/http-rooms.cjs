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
  if now >= (m.renewInbox or 0) then
    redis.call('EXPIRE',inbox(peer),180);m.renewInbox=now+60000
  end
end
if room and (now-room.members[room.host].seen>90000) then erase();room=nil end
if op=='host' then
  if room then return {409,'Código em uso. Crie outra sala.'} end
  room={host=id,members={}}
elseif not room then return {410,'Sala encerrada ou código inexistente.'} end
local changed=false
local members=room.members
for peer,m in pairs(members) do
  if peer~=room.host and now-m.seen>90000 then
    changed=true;members[peer]=nil;redis.call('DEL',inbox(peer));post(room.host,peer,'@gone')
  end
end
local total=0
for peer in pairs(members) do total=total+1 end
if op=='host' or op=='join' then
  if total>=6 then return {409,'Sala cheia (6 jogadores).'} end
  for _,m in pairs(members) do if m.nick==nick then return {409,'Esta conta já está na sala. Cada jogador precisa da própria conta.'} end end
  members[id]={proof=proof,nick=nick,seen=now,batch=0,count=0,compact=ARGV[11]=='1',rtc=ARGV[14]=='1'}
  persist();return {200,'ok',total+1}
end
local me=members[id]
if not me or me.proof~=proof then return {410,'Sua conexão com esta sala expirou.'} end
if op=='admin' then
  if nick~='rick' or me.nick~=nick then return {403,'Comando exclusivo de Rick.'} end
  local recipient=ARGV[10]~='' and ARGV[10] or room.host
  if not members[recipient] then return {409,'Jogador saiu da sala.'} end
  post(recipient,id,'@admin:'..ARGV[9]);persist();return {200,'ok',total}
end
if op=='leave' then
  if id==room.host then erase() else members[id]=nil;redis.call('DEL',inbox(id));post(room.host,id,'@gone');persist() end
  return {200,'ok',0}
end
if after>me.count or me.count-after>192 then return {410,'O jogador ficou muito tempo desconectado. Entre novamente.'} end
local idle=ARGV[13]=='1'
if not idle and seq~=me.batch and seq~=me.batch+1 then return {409,'Sequência da sala desatualizada. Entre novamente.'} end
if not idle and seq==me.batch+1 then
  changed=true
  local packets=cjson.decode(ARGV[8])
  for _,p in ipairs(packets) do
    if p.signal then
      if p.to~=id and members[p.to] and members[p.to].rtc then post(p.to,id,'@ice:'..p.wire) end
    elseif p.pose then
      if p.dragon and me.nick~='rick' then
        local msg=cjson.decode(p.wire);msg.pet=cjson.null;p.wire=cjson.encode(msg)
      end
      me.pose=p.wire;me.poseSeq=seq
      for target,m in pairs(members) do
        if target~=id and not m.compact then post(target,id==room.host and '' or id,p.wire) end
      end
    elseif id~=room.host then post(room.host,id,p.wire)
    elseif p.to then if members[p.to] and p.to~=id then post(p.to,'',p.wire) end
    else for target in pairs(members) do if target~=id and target~=p.except then post(target,'',p.wire) end end end
  end
  me.batch=seq
end
if changed or now-me.seen>=10000 then me.seen=now;persist() end
local rows={}
if after<me.count then rows=redis.call('XRANGE',inbox(id),tostring(after+1)..'-0','+','COUNT',64) end
local poses={}
if me.compact then
  local known=cjson.decode(ARGV[12])
  for peer,m in pairs(members) do
    if peer~=id and m.pose and m.poseSeq~=known[peer] then
      table.insert(poses,{peer,m.poseSeq,peer==room.host and '' or peer,m.pose})
    end
  end
end
local peers={}
if me.rtc then
  for peer,m in pairs(members) do table.insert(peers,{peer,m.rtc and 1 or 0,peer==room.host and 1 or 0,m.nick=='rick' and 1 or 0}) end
end
return {200,'ok',total,rows,poses,peers}
`;
const identity=/^[0-9a-f-]{36}$/;
module.exports=async function handle(req,res){
  const send=(code,data)=>res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}).end(JSON.stringify(data));
  try{
    if(req.method!=='POST')throw fail(405,'Use POST.');
    if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw fail(403,'Origem inválida.');
    const d=await accounts.body(req), {op,code}=d;
    if(!['host','join','poll','leave','admin'].includes(op)||typeof code!=='string'||!/^[A-Z0-9]{6}$/.test(code))throw fail(400,'Código ou operação inválidos.');
    const admission=op==='host'||op==='join';
    let id=d.id,token=d.token,nick='',packets=[],action=null;
    if(admission){
      const {a}=await accounts.current(req);nick=a.nick.toLowerCase();
      id=randomUUID();token=randomBytes(32).toString('hex');
    }else{
      if(!identity.test(id)||typeof token!=='string'||!/^([a-f0-9]{64})$/.test(token))throw fail(401,'Sessão da sala inválida.');
      if(op==='admin'){
        const {a}=await accounts.current(req);
        if(d.player){
          if(a.nick.toLowerCase()!=='rick')throw fail(403,'Apenas Rick pode ajudar outra fazenda.');
          if(!identity.test(d.player))throw fail(400,'Jogador inválido.');
          if(require('./pranks.cjs').allowed.has(d.command))action={prank:d.command};
          else if(['irrigate','cure'].includes(d.command))action={assist:d.command};
          else throw fail(400,'Comando desconhecido.');
        }else action=accounts.adminAction(a,d,true);
        nick=a.nick.toLowerCase();
      }
      if(op==='poll'){
        if(!Number.isSafeInteger(d.seq)||d.seq<1||!Number.isSafeInteger(d.after)||d.after<0||!Array.isArray(d.packets)||d.packets.length>48)throw fail(400,'Lote da sala inválido.');
        packets=d.packets.map(p=>{
          if(!p?.msg||typeof p.msg.t!=='string'||(p.to&&!identity.test(p.to))||(p.except&&!identity.test(p.except)))throw fail(400,'Mensagem da sala inválida.');
          if(p.msg.t==='ice'){
            const s=p.msg.description;
            if(!p.to||!['offer','answer'].includes(s?.type)||typeof s.sdp!=='string'||s.sdp.length>18000)throw fail(400,'Sinalização inválida.');
            return {signal:true,to:p.to,wire:JSON.stringify({type:s.type,sdp:s.sdp})};
          }
          const wire=JSON.stringify(p.msg);
          if(Buffer.byteLength(wire)>65536)throw fail(413,'Mensagem grande demais.');
          const pose=p.msg.t==='pos'&&p.msg.id===id&&!p.msg.to&&!p.to&&!p.except&&[p.msg.x,p.msg.z,p.msg.r].every(Number.isFinite);
          if(pose&&Buffer.byteLength(wire)>1024)throw fail(413,'Posição grande demais.');
          return {wire,pose,dragon:pose&&p.msg.pet==='dragon',...(p.to?{to:p.to}:{}),...(p.except?{except:p.except}:{})};
        });
      }
    }
    const known=Object.fromEntries(Object.entries(d.known||{}).filter(([peer,v])=>identity.test(peer)&&Number.isSafeInteger(v)).slice(0,6));
    const result=await redis('EVAL',roomScript,1,'orbital:v1:{room-'+code+'}',op,id,hash(token),nick,Date.now(),d.seq||0,d.after||0,JSON.stringify(packets),JSON.stringify(action),op==='admin'&&d.player||'',d.compact?'1':'0',JSON.stringify(known),d.idle===true&&packets.length===0?'1':'0',d.rtc===true?'1':'0');
    const [status,message,size,rows,positions,members]=result;
    if(status!==200)throw fail(status,message);
    if(admission)return send(200,{ok:true,id,token,size,readOnlyPoll:true});
    if(op==='admin')return send(200,{ok:true});
    const events=(rows||[]).map(([cursor,fields])=>({cursor:Number(cursor.split('-')[0]),from:fields[1]||null,...(fields[3].startsWith('@ice:')?{ice:JSON.parse(fields[3].slice(5))}:fields[3]==='@gone'?{gone:true}:fields[3].startsWith('@admin:')?{admin:JSON.parse(fields[3].slice(7))}:{msg:JSON.parse(fields[3])})}));
    const poses=(positions||[]).map(([id,version,from,wire])=>({id,version,from:from||null,msg:JSON.parse(wire)}));
    const peers=(members||[]).map(([id,rtc,host,admin])=>({id,rtc:!!rtc,host:!!host,admin:!!admin}));
    send(200,{ok:true,size,events,poses,peers});
  }catch(e){send(e.status||503,{ok:false,error:e.status?e.message:'Servidor de salas temporariamente indisponível.'});}
};
