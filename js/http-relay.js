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
  const {id,token,size}=await request({op});
  let active=true,timer,seq=1,after=0,pending=null,failures=0,alone=size===1;
  const queue=[];
  let inFlight=false;
  function schedule(ms){clearTimeout(timer);if(active&&!inFlight)timer=setTimeout(poll,ms);}
  function enqueue(packet){
    if(!active)return;
    const m=packet.msg;
    if(['pos','sync','farm'].includes(m.t)){
      const i=queue.findIndex(p=>p.to===packet.to&&p.except===packet.except&&p.msg.t===m.t&&p.msg.id===m.id);
      if(i!==-1)queue.splice(i,1);
    }
    queue.push(packet);
    if(!['pos','sync','farm'].includes(m.t))schedule(5);
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
    inFlight=true;let delay;
    try{
      if(!pending){
        let n=0;pending=[];
        while(queue.length&&pending.length<48){const p=queue[0],len=JSON.stringify(p).length;if(n+len>160000&&pending.length)break;n+=len;pending.push(queue.shift());}
      }
      const reply=await request({op:'poll',id,token,seq,after,packets:pending});
      if(!active)return;
      seq++;pending=null;failures=0;alone=reply.size===1;
      for(const event of reply.events){
        if(!active)break;
        after=event.cursor;if(event.gone)handlers.onGone(event.from);else handlers.onMsg(event.from,event.msg);
      }
      delay=reply.events.length>=64||queue.some(p=>!['pos','farm','sync'].includes(p.msg.t))?5:alone?900:235;
    }catch(e){
      if(!active)return;
      if((e.status>=400&&e.status<500&&e.status!==429)||++failures>=7){
        close();handlers.onGone();return;
      }
      delay=Math.min(2500,250*2**failures);
    }finally{inFlight=false;if(active)schedule(delay||235);}
  }
  addEventListener('pagehide',close);schedule(10);
  return {id,close,sendHost:msg=>enqueue({msg}),sendTo:(to,msg)=>enqueue({to,msg}),broadcast:(msg,except)=>enqueue({except,msg})};
}
