const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const {read,write,limit,hash,fail}=require('./store.cjs');
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
  const cookie=(req.headers.cookie||'').match(/(?:^|;\s*)orbital=([A-Za-z0-9_-]{3,16})\.([0-9a-f]{64})(?:;|$)/);
  const a=cookie&&await read(cookie[1]),key=cookie&&hash(cookie[2]);
  if(!a||!a.sessions.some(s=>s.hash===key&&s.until>Date.now()))throw fail(401,'Entre novamente para sincronizar.');
  return {a,key};
}
function cookie(req,res,value,max){
  const secure=!!process.env.VERCEL||req.socket?.encrypted||process.env.COOKIE_SECURE==='1';
  res.setHeader('Set-Cookie','orbital='+value+'; Path=/; HttpOnly; SameSite=Strict'+(secure?'; Secure':'')+(max===null?'':'; Max-Age='+max));
}
async function issue(req,res,a,remember){
  const token=crypto.randomBytes(32).toString('hex'),days=remember?90:1;
  a.sessions=a.sessions.filter(s=>s.until>Date.now()).slice(-11);
  a.sessions.push({hash:hash(token),until:Date.now()+days*86400000});await write(a);
  cookie(req,res,a.nick+'.'+token,remember?days*86400:null);
}
const validSave=s=>s&&typeof s==='object'&&Array.isArray(s.plots)&&Number.isFinite(s.level);
const view=a=>({ok:true,nick:a.nick,orbitalPass:a.nick.toLowerCase()==='rick',save:a.save,revision:a.revision});
module.exports=async function api(req,res,route,attempt=0){
  const send=(status,data)=>res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(data));
  try{
    if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw fail(403,'Origem inválida.');
    if(route==='session'&&req.method==='GET')return send(200,view((await current(req)).a));
    if(req.method!=='POST')throw fail(405,'Método inválido.');
    const data=await body(req);req.body=data;
    if(['register','login','recover'].includes(route)){
      await limit(String((process.env.VERCEL&&req.headers['x-vercel-forwarded-for'])||req.socket?.remoteAddress||'local').split(',')[0].trim());
      const nick=String(data.nick||'').trim(),pass=data.pass;
      if(!/^[A-Za-z0-9_-]{3,16}$/.test(nick)||typeof pass!=='string'||pass.length<4||pass.length>128)throw fail(400,'Use um nick de 3 a 16 caracteres e uma senha de 4 a 128.');
      let a=await read(nick),recovery;
      if(route==='register'){
        if(nick.toLowerCase()==='rick')throw fail(409,'Este nome é reservado.');
        if(a)throw fail(409,'Nick já cadastrado neste servidor.');
        const salt=crypto.randomBytes(16).toString('hex'),digest=(await derive(pass,salt)).toString('hex');
        recovery=crypto.randomBytes(16).toString('hex');
        if(await read(nick))throw fail(409,'Nick já cadastrado neste servidor.');
        a={nick,salt,digest,recovery:hash(recovery),sessions:[],revision:validSave(data.initialSave)?1:0,save:validSave(data.initialSave)?data.initialSave:null};
      }else if(route==='login'){
        const digest=(await derive(pass,a?.salt||'orbital-unregistered')).toString('hex');
        a=await read(nick);if(!a||!equal(a.digest,digest))throw fail(401,'Nick ou senha incorretos.');
      }else{
        const proof=hash(String(data.code||'').replace(/[-\s]/g,'').toLowerCase());
        if(!a||!equal(proof,a.recovery))throw fail(401,'Nick ou chave de recuperação incorretos.');
        const salt=crypto.randomBytes(16).toString('hex'),digest=(await derive(pass,salt)).toString('hex');
        a=await read(nick);if(!equal(proof,a.recovery))throw fail(409,'A chave já foi trocada.');
        recovery=crypto.randomBytes(16).toString('hex');Object.assign(a,{salt,digest,recovery:hash(recovery),sessions:[]});
      }
      await issue(req,res,a,!!data.remember);return send(200,{...view(a),recovery});
    }
    const {a,key}=await current(req);
    if(route==='admin'){
      if(a.nick.toLowerCase()!=='rick')throw fail(403,'Comando exclusivo de Rick.');
      if(!['tempest','aurora','rain','meteor'].includes(data.event))throw fail(400,'Evento desconhecido.');
      return send(200,{ok:true,event:data.event});
    }
    if(route==='save'){
      if(data.nick!==a.nick)throw fail(409,'A conta mudou em outra aba. Reabra o jogo.');
      if(data.revision!==a.revision)throw fail(409,'Há progresso mais recente em outro navegador. Reabra o jogo para carregá-lo.');
      if(data.save!==null&&!validSave(data.save))throw fail(400,'Progresso inválido.');
      a.save=data.save;a.revision++;await write(a);return send(200,{ok:true,revision:a.revision});
    }
    if(route==='logout'){a.sessions=a.sessions.filter(s=>s.hash!==key);await write(a);cookie(req,res,'',0);return send(200,{ok:true});}
    throw fail(404,'Rota desconhecida.');
  }catch(e){if(e.retryable&&attempt<2)return api(req,res,route,attempt+1);if(!e.status)console.error('Falha no serviço de contas:',e.code||e.name);send(e.status||500,{ok:false,error:e.status?e.message:'Falha ao acessar os dados do servidor.'});}
};

module.exports.current=current;
module.exports.body=body;
