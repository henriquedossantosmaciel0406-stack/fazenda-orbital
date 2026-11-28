// O navegador mantém uma cópia local; o servidor controla a revisão entre dispositivos.
import {serviceRequest} from './service-pool.js';
export const hosted=document.querySelector('meta[name="orbital-relay"]')?.content==='/api/room';
export let archiveProfile=false;
export function setProfile(profile){archiveProfile=profile==='archive';}
export let visiting=false;
export function enterVisitor(){visiting=true;}
let revision=0,nick='',queued,flight=null,retry=0,blocked=false;
const pendingKey=()=> (archiveProfile?'vega-pendente:':'orbital-pendente:')+nick.toLowerCase();
export async function api(route,data){
  try{
    if(route==='register'||route==='recover')data={...data,requestKey:crypto.randomUUID()};
    const opts=data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)};
    const res=await serviceRequest(route,opts,{replay:['session','save','login','register','recover'].includes(route)});
    return {...await res.json(),status:res.status};
  }catch{return {ok:false,error:'Servidor indisponível. Verifique a conexão e tente de novo.'};}
}
function message(text){const el=document.getElementById('syncStatus');el.textContent=text;el.hidden=!text;}
const makeEntry=save=>({id:crypto.randomUUID(),save});
let sending=null,failures=0,lastSuccess=0;
function journal(){
  const latest=queued||sending;
  try{
    if(latest)localStorage.setItem(pendingKey(),JSON.stringify({revision,id:latest.id,save:latest.save,sending:sending?.id}));
    else localStorage.removeItem(pendingKey());
  }catch{}
}
export function enterCloud(result,key){
  nick=result.nick;revision=result.revision;blocked=false;
  const pending=JSON.parse(localStorage.getItem(pendingKey())||'null');
  const acknowledged=pending&&pending.revision+1===revision&&result.lastSaveId&&result.lastSaveId===pending.sending;
  if(pending&&(pending.revision===revision||(acknowledged&&pending.id!==result.lastSaveId))){
    queued={id:pending.id||crypto.randomUUID(),save:pending.save};
    if(queued.save===null)localStorage.removeItem(key);else localStorage.setItem(key,JSON.stringify(queued.save));
    flush();
  }else{
    if(result.save)localStorage.setItem(key,JSON.stringify(result.save));
    else if(revision>0)localStorage.removeItem(key);
    if(pending)localStorage.removeItem(pendingKey());
  }
  localStorage.setItem('fazenda-last-nick',nick);
}
export function queueSave(data){
  if(!hosted||!nick||blocked)return;
  queued=makeEntry(data);journal();
  if(!retry&&!flight){
    const delay=Math.max(0,lastSuccess+45000-Date.now());
    if(delay)retry=setTimeout(flush,delay);else flush();
  }
}
export async function flush(){
  if(flight)return flight;
  clearTimeout(retry);retry=0;
  if((!queued&&!sending)||blocked||!nick)return;
  if(!sending){
    sending=queued;queued=null;
    // Congela os dados do lote para que uma repetição envie o mesmo progresso.
    sending.save=structuredClone(sending.save);
  }
  journal();
  flight=(async()=>{
    const r=await api('save',{nick,profile:archiveProfile?'archive':'main',revision,opId:sending.id,save:sending.save});
    if(r.ok){
      revision=r.revision;lastSuccess=Date.now();sending=null;failures=0;journal();message('');
    }else{
      blocked=r.status===409||r.status===401;
      message(blocked?r.error:'Sem sincronização. Progresso guardado neste dispositivo.');
      if(!blocked)retry=setTimeout(flush,Math.min(30000,1500*2**Math.min(++failures,5))+Math.random()*750);
    }
    return r.ok;
  })();
  const ok=await flight;flight=null;
  if(ok&&queued)retry=setTimeout(flush,45000);
}
export async function settle(){
  await flush();
  while(flight)await flight;
  if(queued&&!sending&&!blocked)await flush();
  return !sending&&!queued&&!blocked;
}
