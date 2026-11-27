// O transporte HTTP usa a mesma origem do jogo. Uma queda curta repete o mesmo
// lote com o mesmo número, inclusive quando o servidor já confirmou um presente.
export async function connectHttpRoom(op,code,handlers){
  const endpoint='/api/room';
  async function request(data,closing=false){
    const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,...data}),keepalive:closing,signal:AbortSignal.timeout(10000)});
    const body=await response.json();
    if(!response.ok||!body.ok)throw Object.assign(new Error(body.error||'Falha no servidor de salas.'),{status:response.status});
    return body;
  }
  const {id,token,size}=await request({op,compact:true});
  let active=true,timer,seq=1,after=0,pending=null,failures=0,alone=size===1;
  const queue=[];
  const known={};
  let lastPoll=0,movingUntil=0;
  let inFlight=false, due=Infinity, retrying=false;
  function schedule(ms){
    ms=Math.max(ms,90-(performance.now()-lastPoll));
    const deadline=performance.now()+ms;
    if(!active || inFlight || deadline>=due)return;
    clearTimeout(timer);due=deadline;timer=setTimeout(poll,ms);
  }
  function enqueue(packet){
    if(!active)return;
    const m=packet.msg;
    if(['pos','sync','farm'].includes(m.t)){
      const i=queue.findIndex(p=>p.to===packet.to&&p.except===packet.except&&p.msg.t===m.t&&p.msg.id===m.id);
      if(i!==-1)queue.splice(i,1);
    }
    queue.push(packet);
    if(!retrying && (!['pos','sync','farm'].includes(m.t) || (m.t==='pos' && !alone)))schedule(12);
  }
  function stop(){
    if(!active)return;
    active=false;clearTimeout(timer);removeEventListener('pagehide',close);
  }
  function close(){
    if(!active)return;stop();request({op:'leave',id,token},true).catch(()=>{});
  }
  async function poll(){
    if(!active||inFlight)return;
    due=Infinity;inFlight=true;lastPoll=performance.now();let delay;
    try{
      if(!pending){
        let n=0;pending=[];
        while(queue.length&&pending.length<48){const p=queue[0],len=JSON.stringify(p).length;if(n+len>160000&&pending.length)break;n+=len;pending.push(queue.shift());}
      }
      const reply=await request({op:'poll',id,token,seq,after,known,packets:pending});
      if(!active)return;
      seq++;pending=null;failures=0;retrying=false;alone=reply.size===1;
      for(const event of reply.events){
        if(!active)break;
        if(event.msg?.t==='pos')movingUntil=performance.now()+450;
        after=event.cursor;if(event.admin)handlers.onAdmin(event.admin);else if(event.gone){delete known[event.from];handlers.onGone(event.from);}else if(event.msg?.t==='bye'){delete known[event.msg.id];handlers.onMsg(event.from,event.msg);}else handlers.onMsg(event.from,event.msg);
      }
      for(const pose of reply.poses||[]){
        known[pose.id]=pose.version;
        movingUntil=performance.now()+450;
        handlers.onMsg(pose.from,pose.msg);
      }
      const urgent=queue.some(p=>!['farm','sync'].includes(p.msg.t));
      const idleDelay=alone?1500:performance.now()<movingUntil?95:300;
      delay=reply.events.length>=64||(!alone&&urgent)?12:idleDelay;
    }catch(e){
      if(!active)return;
      if((e.status>=400&&e.status<500&&e.status!==429)||++failures>=15){
        close();handlers.onGone();return;
      }
      retrying=true;delay=Math.min(4000,250*2**failures)+Math.random()*350;
    }finally{inFlight=false;if(active)schedule(delay||235);}
  }
  addEventListener('pagehide',close);schedule(10);
  return {id,close,admin:action=>request({op:'admin',id,token,...action}),directPoses:true,sendHost:msg=>enqueue({msg}),sendTo:(to,msg)=>enqueue({to,msg}),broadcast:(msg,except)=>enqueue({except,msg})};
}
