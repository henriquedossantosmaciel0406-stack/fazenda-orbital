// Cada técnica é aprendida uma vez. A recarga acompanha o save entre aparelhos.
export const techniques=[
  {id:'beacon',name:'Radar de safra',branch:'Exploração',rank:1,cost:2,seconds:20,icon:'lens',desc:'Marca por 12 segundos o canteiro maduro mais próximo e informa a distância.'},
  {id:'recall',name:'Dobra de retorno',branch:'Exploração',requires:'beacon',rank:2,cost:3,seconds:60,icon:'station',desc:'Abre um salto imediato para a entrada da sua fazenda.'},
  {id:'reap',name:'Foice orbital',branch:'Lavoura',rank:1,cost:3,seconds:45,icon:'rotary',desc:'Colhe até quatro canteiros maduros a até 16 m de você. A produção vai para o estoque.'},
  {id:'sow',name:'Memória da terra',branch:'Lavoura',requires:'reap',rank:2,cost:3,seconds:55,icon:'planter',desc:'Replanta até quatro canteiros a até 16 m com a última espécie cultivada. Usa uma semente por canteiro.'}
];
export function learnLock(p,t){
  if(p.abilities?.[t.id])return 'Aprendida';
  if(p.rank<t.rank)return 'Prestígio '+t.rank;
  if(t.requires&&!p.abilities?.[t.requires])return 'Aprenda '+techniques.find(x=>x.id===t.requires).name;
  if(p.stars<t.cost)return 'Faltam '+(t.cost-p.stars)+' estrelas';
  return '';
}
export function learnTechnique(p,t){
  if(learnLock(p,t))return false;
  (p.abilities??={})[t.id]=true;p.stars-=t.cost;
  return true;
}
export function castTechnique(t,p,perform,now=Date.now()){
  if(!p.abilities?.[t.id])return {error:'Aprenda a técnica primeiro.'};
  const wait=Math.ceil(((p.cooldowns?.[t.id]||0)-now)/1000);
  if(wait>0)return {error:'Aguarde '+wait+' s para usar de novo.'};
  const result=perform(t.id);
  if(!result.error)(p.cooldowns??={})[t.id]=now+t.seconds*1000;
  return result;
}
export function workField(id,field){
  if(id==='recall')return field.home();
  const distance=p=>Math.hypot(p.x-field.position.x,p.z-field.position.z);
  const near=field.plots.filter(p=>p.available&&(id==='beacon'||distance(p)<=16)).sort((a,b)=>distance(a)-distance(b));
  const {ready,harvest,replant,mark}=field;
  if(id==='beacon'){
    const plot=near.find(ready);
    if(!plot)return {error:'Ainda não há um canteiro pronto para colher.'};
    mark(plot);return {text:'Safra localizada a '+Math.round(distance(plot))+' m.'};
  }
  let count=0;
  for(const plot of near){
    if(plot.claimedBy)continue;
    if(id==='reap'&&ready(plot)&&harvest(plot))count++;
    if(id==='sow'&&!plot.crop&&plot.lastCrop&&replant(plot))count++;
    if(count===4)break;
  }
  if(!count)return {error:id==='reap'?'Procure cultivos maduros por perto e confira o espaço no estoque.':'Procure canteiros já colhidos e leve sementes da última safra.'};
  return {text:count+(id==='reap'?' canteiro(s) colhido(s).':' canteiro(s) replantado(s).')};
}
