// Dados efêmeros só entre membros admitidos pelo servidor. O relay continua
// entregando presentes, saves de sala e comandos, mesmo em redes sem WebRTC.
export function motionLinks(self,signal,receive){
  let sequence=0;
  const links=new Map(), roster=new Map(), cooldown=new Map();
  function drop(id){
    const link=links.get(id);links.delete(id);
    if(link){link.pc.onconnectionstatechange=null;link.pc.close();}
  }
  const roomTypes=new Set(['hi','farm','bye','spray','gift','giftok','giftno','full']);
  function attach(link,channel){
    if(channel.label==='room'){
      if(link.room){channel.close();return;}
      link.room=channel;
      channel.onmessage=e=>{
        const sender=roster.get(link.id);
        if(!sender||typeof e.data!=='string'||e.data.length>65536)return;
        let msg;try{msg=JSON.parse(e.data);}catch{return;}
        if(!msg||!roomTypes.has(msg.t)||(!sender.host&&msg.id!==sender.id))return;
        // Só o anfitrião encaminha mensagens de outro membro.
        if(!sender.host&&[...roster.values()].some(p=>p.host))return;
        receive(sender.host?null:sender.id,msg);
      };
      return;
    }
    if(channel.label!=='motion'){channel.close();return;}
    if(link.channel){channel.close();return;}
    link.channel=channel;
    const seen={pos:0,sync:0};
    channel.onmessage=e=>{
      const sender=roster.get(link.id);
      if(!sender || typeof e.data!=='string'||e.data.length>3072)return;
      let msg;try{msg=JSON.parse(e.data);}catch{return;}
      if(msg?.id!==link.id||msg.to)return;
      if(msg.t==='pos'){
        if(![msg.x,msg.z,msg.r].every(Number.isFinite))return;
        if(!sender.admin && msg.pet==='dragon')msg.pet=null;
      }else if(msg.t!=='sync'||!sender.host)return;
      if(!Number.isSafeInteger(msg.motionSeq)||msg.motionSeq<=seen[msg.t])return;
      seen[msg.t]=msg.motionSeq;
      receive(sender.host?null:sender.id,msg);
    };
  }
  async function publish(link,answer){
    const pc=link.pc;
    await pc.setLocalDescription(answer?await pc.createAnswer():await pc.createOffer());
    if(pc.iceGatheringState!=='complete'){
      await new Promise(resolve=>{
        function done(){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',change);resolve();}
        function change(){if(pc.iceGatheringState==='complete')done();}
        const timer=setTimeout(done,1800);pc.addEventListener('icegatheringstatechange',change);change();
      });
    }
    if(links.get(link.id)===link)signal(link.id,{type:pc.localDescription.type,sdp:pc.localDescription.sdp});
  }
  function create(id){
    const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    const link={id,pc,started:Date.now()};links.set(id,link);
    pc.ondatachannel=e=>attach(link,e.channel);
    pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'&&links.get(id)===link){cooldown.set(id,Date.now()+60000);drop(id);}};
    return link;
  }
  function failed(id,link){
    if(links.get(id)===link){cooldown.set(id,Date.now()+60000);drop(id);}
  }
  function members(peers){
    roster.clear();
    for(const p of peers)if(p.id!==self)roster.set(p.id,p);
    for(const [id,link] of links){
      if(!roster.has(id)){drop(id);cooldown.delete(id);}
      else if(Date.now()-link.started>20000&&link.channel?.readyState!=='open')failed(id,link);
    }
    for(const p of roster.values()){
      if(!p.rtc||typeof RTCPeerConnection!=='function'||self>=p.id||links.has(p.id)||(cooldown.get(p.id)||0)>Date.now())continue;
      let link;try{link=create(p.id);attach(link,link.pc.createDataChannel('room'));attach(link,link.pc.createDataChannel('motion',{ordered:false,maxRetransmits:0}));publish(link,false).catch(()=>failed(p.id,link));}
      catch{failed(p.id,link);}
    }
  }
  async function accept(id,description){
    if(!roster.get(id)?.rtc||typeof RTCPeerConnection!=='function')return;
    let link=links.get(id);
    try{
      if(description.type==='offer'&&id<self){drop(id);link=create(id);await link.pc.setRemoteDescription(description);await publish(link,true);}
      else if(description.type==='answer'&&id>self&&link?.pc.signalingState==='have-local-offer')await link.pc.setRemoteDescription(description);
    }catch{failed(id,link);}
  }
  function ready(){return roster.size>0&&[...roster.keys()].every(id=>links.get(id)?.channel?.readyState==='open');}
  function send(msg){
    if(!ready())return false;
    const wire=JSON.stringify({...msg,motionSeq:++sequence});
    for(const id of roster.keys()){
      const ch=links.get(id).channel;
      try{if(ch.bufferedAmount<8192)ch.send(wire);}catch{return false;}
    }
    return true;
  }
  function roomReady(){return ready()&&[...roster.keys()].every(id=>links.get(id)?.room?.readyState==='open');}
  function sendRoom(packet){
    if(!roomReady()||!roomTypes.has(packet.msg.t))return false;
    const host=[...roster.values()].find(p=>p.host);
    const targets=host?[host.id]:packet.to?[packet.to]:[...roster.keys()].filter(id=>id!==packet.except);
    const channels=targets.map(id=>links.get(id)?.room);
    if(channels.some(ch=>!ch||ch.readyState!=='open'||ch.bufferedAmount>131072))return false;
    const wire=JSON.stringify(packet.msg);
    if(wire.length>65536)return false;
    try{for(const ch of channels)ch.send(wire);return true;}catch{return false;}
  }
  return {members,accept,ready,send,roomReady,sendRoom,close(){for(const id of links.keys())drop(id);roster.clear();}};
}
