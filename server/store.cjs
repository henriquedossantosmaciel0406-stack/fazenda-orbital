const fs=require('node:fs');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const busy=()=>Object.assign(fail(503,'A conta mudou durante a operação. Tente novamente.'),{retryable:true});
const folder=()=>process.env.DATA_DIR||path.join(__dirname,'../dados');
const file=nick=>path.join(folder(),hash(nick.toLowerCase())+'.json');
const accountKey=nick=>'orbital:v1:account:'+nick.toLowerCase();
const remote=!!process.env.VERCEL || !!process.env.UPSTASH_REDIS_REST_URL || !!process.env.KV_REST_API_URL;
function localRead(nick){
  try{return JSON.parse(fs.readFileSync(file(nick),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
async function redis(...command){
  const url=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
  const token=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
  if(!url||!token)throw fail(503,'O banco de dados do jogo ainda não está conectado ao projeto.');
  const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(7000)});
  const data=await response.json().catch(()=>({}));
  if(/max requests limit exceeded|monthly (?:command|request).*limit|monthly quota/i.test(data?.error||'')){
    throw fail(503,'A cota mensal do banco acabou. Sua conta continua guardada. Você pode jogar como visitante neste aparelho.');
  }
  if(response.status===429)throw fail(429,'Banco ocupado. Aguarde um instante.');
  if(!response.ok)throw fail(503,'O banco do jogo está indisponível. Tente de novo.');
  if(data.error||!('result' in data))throw fail(503,'O banco não conseguiu processar a operação.');
  return data.result;
}
async function read(nick){
  if(!remote)return localRead(nick);
  const raw=await redis('HGET',accountKey(nick),'data');return raw?JSON.parse(raw):null;
}
// O carimbo muda também quando outra instância altera uma sessão ou a senha.
const commitScript=`
local found=redis.call('HGET',KEYS[1],'stamp')
if (found or '') ~= ARGV[1] then return 0 end
redis.call('HSET',KEYS[1],'stamp',ARGV[2],'data',ARGV[3])
return 1`;
async function write(a){
  const prev=a.stamp||'',next=randomUUID(),raw=JSON.stringify({...a,stamp:next});
  if(remote){
    if(!await redis('EVAL',commitScript,1,accountKey(a.nick),prev,next,raw))throw busy();
  }else{
    const old=localRead(a.nick);
    if((old?.stamp||'')!==prev)throw busy();
    fs.mkdirSync(folder(),{recursive:true,mode:0o700});
    const dst=file(a.nick),tmp=dst+'.tmp';fs.writeFileSync(tmp,raw,{mode:0o600});fs.renameSync(tmp,dst);
  }
  a.stamp=next;
}
const attempts=new Map();
async function limit(address){
  let count;
  if(remote){
    const script="local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],600) end; return n";
    count=await redis('EVAL',script,1,'orbital:v1:login:'+hash(address));
  }else{
    const now=Date.now();
    for(const [key,item] of attempts)if(item.until<=now)attempts.delete(key);
    const a=attempts.get(address)||{n:0,until:now+600000};count=++a.n;attempts.set(address,a);
  }
  if(count>60)throw fail(429,'Muitas tentativas. Aguarde alguns minutos.');
}
module.exports={redis,read,write,limit,fail,hash};
