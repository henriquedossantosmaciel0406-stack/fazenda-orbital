const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const original=require('./store.cjs');
const storage=require('./vega.cjs');
const {hash,fail}=original;
const cloud=!!(process.env.VERCEL||process.env.BLOB_READ_WRITE_TOKEN);
const primary=cloud?storage.primary:original;
const backend=req=>req.archive?storage.archive:primary;
const cookieName=archive=>archive?'orbital_vega':'orbital';
const hasCookie=(req,name)=>(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));
async function primaryAccount(nick){
  const saved=await primary.read(nick);
  if(saved||!cloud)return saved;
  const legacy=await original.read(nick);
  if(!legacy)return null;
  // Create-only copy. Concurrent imports must use the winning revision.
  try{await primary.write(legacy);return legacy;}
  catch(error){if(!error.retryable)throw error;return primary.read(nick);}
}
const derive = (pass,salt) => scrypt(pass,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024});
const equal = (a,b) => a.length===b.length && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
async function body(req){
  if(!/^application\/json\b/.test(req.headers['content-type']||''))throw fail(415,'Formato inválido.');
  if(req.body!==undefined){
    let value=req.body;
    if(typeof value==='string'||Buffer.isBuffer(value)){try{value=JSON.parse(value);}catch{throw fail(400,'Dados inválidos.');}}
    if(!value||typeof value!=='object'||Array.isArray(value))throw fail(400,'Dados inválidos.');
    if(Buffer.byteLength(JSON.stringify(value))>512000)throw fail(413,'Arquivo de progresso muito grande.');
    return value;
  }
  const chunks=[];let n=0;for await(const chunk of req){n+=chunk.length;if(n>512000)throw fail(413,'Arquivo de progresso muito grande.');chunks.push(chunk);}
  try{const d=JSON.parse(Buffer.concat(chunks));if(d&&typeof d==='object'&&!Array.isArray(d))return d;}catch{}
  throw fail(400,'Dados inválidos.');
}
async function current(req){
  const preferArchive=hasCookie(req,'orbital_profile')?.endsWith('=archive');
  req.archive=cloud && !!hasCookie(req,'orbital_vega') && (preferArchive||!hasCookie(req,'orbital'));
  const prefix=cookieName(req.archive)+'=';
  const raw=hasCookie(req,cookieName(req.archive));
  const cookie=raw?.slice(prefix.length).match(/^([A-Za-z0-9_-]{3,16})\.([0-9a-f]{64})$/);
  const a=cookie&&(req.archive?await storage.archive.read(cookie[1]):await primaryAccount(cookie[1])),key=cookie&&hash(cookie[2]);
  if(!a||!a.sessions.some(s=>s.hash===key&&s.until>Date.now()))throw fail(401,'Entre novamente para sincronizar.');
  return {a,key};
}
function cookie(req,res,value,max){
  const secure=!!process.env.VERCEL||req.socket?.encrypted||process.env.COOKIE_SECURE==='1';
  res.setHeader('Set-Cookie',[cookieName(req.archive)+'='+value+'; Path=/; HttpOnly; SameSite=Strict'+(secure?'; Secure':'')+(max===null?'':'; Max-Age='+max),
    'orbital_profile='+(req.archive?'archive':'main')+'; Path=/; HttpOnly; SameSite=Strict'+(secure?'; Secure':'')+(max===null?'':'; Max-Age='+max),
    cookieName(!req.archive)+'=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0']);
}
async function issue(req,res,a,remember){
  const token=crypto.randomBytes(32).toString('hex'),days=remember?90:1;
  a.sessions=a.sessions.filter(s=>s.until>Date.now()).slice(-11);
  a.sessions.push({hash:hash(token),until:Date.now()+days*86400000});await backend(req).write(a);
  cookie(req,res,a.nick+'.'+token,remember?days*86400:null);
}
function allowedSave(data,nick){
  if(!data || nick.toLowerCase()==='rick')return data;
  if(data.activePet==='dragon')data.activePet=null;
  if(Array.isArray(data.adoptedPets))data.adoptedPets=data.adoptedPets.filter(k=>k!=='dragon');
  return data;
}
const validSave=s=>s&&typeof s==='object'&&Array.isArray(s.plots)&&Number.isFinite(s.level);
const view=a=>({ok:true,nick:a.nick,orbitalPass:a.nick.toLowerCase()==='rick',save:a.save,revision:a.revision,lastSaveId:a.lastSaveId||null});
function adminAction(a,data,roomOnly=false){
  if(a.nick.toLowerCase()!=='rick')throw fail(403,'Comando exclusivo de Rick.');
  const commands=['clear','dawn','noon','sunset','night'];
  const events=['tempest','aurora','rain','rainbow','festival','solar','drought','boom','dew','pollen','solstice'];
  if(!roomOnly){commands.push('orchard','refill','irrigate','cure', 'sample');events.push('meteor','urgent','merchant');}
  if(commands.includes(data.command))return {command:data.command};
  if(events.includes(data.event))return {event:data.event};
  throw fail(400,'Comando desconhecido.');
}
module.exports=async function api(req,res,route,attempt=0){
  const send=(status,data)=>res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(data));
  try{
    if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw fail(403,'Origem inválida.');
    if(route==='session'&&req.method==='GET')return send(200,{...view((await current(req)).a),profile:req.archive?'archive':'main'});
    if(req.method!=='POST')throw fail(405,'Método inválido.');
    const data=await body(req);req.body=data;
    if(['register','login','recover'].includes(route)){
      const {limit}=cloud?storage:original;
      await limit(String((process.env.VERCEL&&req.headers['x-vercel-forwarded-for'])||req.socket?.remoteAddress||'local').split(',')[0].trim());
      const nick=String(data.nick||'').trim(),pass=data.pass;
      if(!/^[A-Za-z0-9_-]{3,16}$/.test(nick)||typeof pass!=='string'||pass.length<4||pass.length>128)throw fail(400,'Use um nick de 3 a 16 caracteres e uma senha de 4 a 128.');
      const requestKey=typeof data.requestKey==='string'&&/^[a-f0-9-]{36}$/.test(data.requestKey)?data.requestKey:null;
      const operation=requestKey&&hash(route+'|'+requestKey);
      const newRecovery=salt=>requestKey?crypto.createHmac('sha256',requestKey).update(salt).digest('hex').slice(0,32):crypto.randomBytes(16).toString('hex');
      async function replay(record){
        if(!operation||record?.lastAuth!==operation)return false;
        const digest=(await derive(pass,record.salt)).toString('hex');
        return equal(record.digest,digest)&&equal(record.recovery,hash(newRecovery(record.salt)));
      }
      let a,recovery;
      req.archive=false;
      if(route==='register'){
        if(nick.toLowerCase()==='rick')throw fail(409,'Este nome é reservado.');
        if(cloud&&await storage.archive.read(nick))throw fail(409,'Nick já cadastrado.');
        a=await primaryAccount(nick);
        if(a){
          if(!await replay(a))throw fail(409,'Nick já cadastrado.');
          recovery=newRecovery(a.salt);
        }else{
          const salt=crypto.randomBytes(16).toString('hex'),digest=(await derive(pass,salt)).toString('hex');
          recovery=newRecovery(salt);
          a={nick,salt,digest,lastAuth:operation,recovery:hash(recovery),sessions:[],revision:validSave(data.initialSave)?1:0,save:validSave(data.initialSave)?allowedSave(data.initialSave,nick):null};
        }
      }else{
        const proof=hash(String(data.code||'').replace(/[-\s]/g,'').toLowerCase());
        const tryAccount=async record=>{
          if(route==='recover')return !!record&&(equal(proof,record.recovery)||await replay(record));
          const digest=(await derive(pass,record?.salt||'orbital-unregistered')).toString('hex');
          return !!record&&equal(digest,record.digest);
        };
        const archiveFirst=hasCookie(req,'orbital_profile')?.endsWith('=archive')||
          (!hasCookie(req,'orbital')&&!!hasCookie(req,'orbital_vega'));
        const sources=cloud?(archiveFirst?[true,false]:[false,true]):[false];
        let unavailable;
        for(const archive of sources){
          let candidate;
          try{candidate=archive?await storage.archive.read(nick):await primaryAccount(nick);}
          catch(error){if(error.status&&error.status<500)throw error;unavailable=error;continue;}
          if(await tryAccount(candidate)){a=candidate;req.archive=archive;break;}
        }
        if(!a){
          if(unavailable)throw fail(503,'Não foi possível consultar a conta original agora. Seu progresso continua guardado.');
          throw fail(401,route==='recover'?'Nick ou chave incorretos.':'Nick ou senha incorretos.');
        }
        if(route==='recover'&&await replay(a))recovery=newRecovery(a.salt);
        else if(route==='recover'){
          const salt=crypto.randomBytes(16).toString('hex'),digest=(await derive(pass,salt)).toString('hex');
          recovery=newRecovery(salt);Object.assign(a,{salt,digest,lastAuth:operation,recovery:hash(recovery),sessions:[]});
        }
      }
      await issue(req,res,a,!!data.remember);return send(200,{...view(a),profile:req.archive?'archive':'main',recovery});
    }
    const {a,key}=await current(req);
    if(route==='prank-ticket')return send(200,{ok:true,ticket:require('./pranks.cjs').issue(a,data)});
    if(route==='prank-check')return send(200,{ok:true,prank:require('./pranks.cjs').verify(a,data.ticket)});
    if(route==='admin')return send(200,{ok:true,...adminAction(a,data)});
    if(route==='save'){
      if(data.nick!==a.nick||(data.profile&&data.profile!==(req.archive?'archive':'main')))throw fail(409,'A conta mudou em outra aba. Reabra o jogo.');
      const opId=typeof data.opId==='string'&&/^[0-9a-f-]{36}$/.test(data.opId)?data.opId:null;
      if(opId && a.lastSaveId===opId && a.revision===data.revision+1)return send(200,{ok:true,revision:a.revision});
      if(data.revision!==a.revision)throw fail(409,'Há progresso mais recente em outro navegador. Reabra o jogo para carregá-lo.');
      if(data.save!==null&&!validSave(data.save))throw fail(400,'Progresso inválido.');
      a.save=allowedSave(data.save,a.nick);a.lastSaveId=opId;a.revision++;await backend(req).write(a);return send(200,{ok:true,revision:a.revision});
    }
    if(route==='logout'){a.sessions=a.sessions.filter(s=>s.hash!==key);await backend(req).write(a);cookie(req,res,'',0);return send(200,{ok:true});}
    throw fail(404,'Rota desconhecida.');
  }catch(e){if(e.retryable&&attempt<2)return api(req,res,route,attempt+1);if(!e.status)console.error('Falha no serviço de contas:',e.code||e.name);send(e.status||500,{ok:false,error:e.status?e.message:'Falha ao acessar os dados do servidor.'});}
};

module.exports.current=current;
module.exports.body=body;

module.exports.adminAction=adminAction;
