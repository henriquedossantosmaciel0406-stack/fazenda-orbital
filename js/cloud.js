// O navegador mantém uma cópia local; o servidor controla a revisão entre dispositivos.
export const hosted=document.querySelector('meta[name="orbital-relay"]')?.content==='/api/room';
let revision=0,nick='',queued,flight=null,retry=0,blocked=false;
const pendingKey=()=> 'orbital-pendente:'+nick.toLowerCase();
export async function api(route,data){
  try{
    const opts=data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)};
    const res=await fetch('/api/'+route,{...opts,cache:'no-store',credentials:'same-origin'});
    return {...await res.json(),status:res.status};
  }catch{return {ok:false,error:'Servidor indisponível. Verifique a conexão e tente de novo.'};}
}
function message(text){const el=document.getElementById('syncStatus');el.textContent=text;el.hidden=!text;}
export function enterCloud(result,key){
  nick=result.nick;revision=result.revision;blocked=false;
  const pending=JSON.parse(localStorage.getItem(pendingKey())||'null');
  if(pending&&pending.revision===revision){
    queued=pending.save;
    if(queued===null)localStorage.removeItem(key);else localStorage.setItem(key,JSON.stringify(queued));
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
  queued=data;
  try{localStorage.setItem(pendingKey(),JSON.stringify({revision,save:data}));}catch{}
  flush();
}
export async function flush(){
  clearTimeout(retry);if(flight){await flight;return;}
  if(queued===undefined||blocked||!nick)return;
  const payload=queued;queued=undefined;
  flight=(async()=>{
    const r=await api('save',{nick,revision,save:payload});
    if(r.ok){
      revision=r.revision;
      if(queued===undefined)localStorage.removeItem(pendingKey());else localStorage.setItem(pendingKey(),JSON.stringify({revision,save:queued}));
      message('');
    }else{
      if(queued===undefined)queued=payload;
      blocked=r.status===409||r.status===401;
      message(blocked?r.error:'Sem sincronização. Progresso guardado neste dispositivo.');
      if(!blocked)retry=setTimeout(flush,5000);
    }
    return r.ok;
  })();
  const ok=await flight;flight=null;
  if(ok&&queued!==undefined)await flush();
}
export async function settle(){
  await flush();if(flight)await flight;
  if(queued!==undefined&&!blocked)await flush();
  return queued===undefined&&!blocked;
}
