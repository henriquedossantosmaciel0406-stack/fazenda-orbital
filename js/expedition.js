import {state,save,addMoney,addXp,addRP} from './state.js';
import {modalId,openModal,el,showToast,updateHUD} from './ui.js';
import {play} from './audio.js';
import {SPACE_LEVEL,sectors,newRoom,step} from './space-rules.js';
import {chart,dungeon} from './space-art.js';

export function openExpedition(){
  const journal=state.expedition;
  let timer,flightUntil=0,action=null;
  const keys={ArrowUp:'north',KeyW:'north',ArrowDown:'south',KeyS:'south',ArrowLeft:'west',KeyA:'west',ArrowRight:'east',KeyD:'east',KeyF:'pulse',KeyR:'mine',KeyE:'gate'};
  const key=e=>{if(action&&keys[e.code]&&!e.repeat){e.preventDefault();action(keys[e.code]);}};
  function button(label,fn,disabled=false){const b=el('button','space-btn',label);b.type='button';b.disabled=disabled;b.onclick=fn;return b;}
  function panel(){
    clearInterval(timer);action=null;
    openModal({id:'space',wide:true,title:'Porto orbital',hint:'Esc para voltar à fazenda. A expedição guarda cada turno.',onClose:()=>{
      clearInterval(timer);window.removeEventListener('keydown',key);
    }, build(body){
      const run=journal.run,canvas=el('canvas','star-map');
      canvas.width=704;canvas.height=run&&performance.now()>=flightUntil?344:172;canvas.setAttribute('role','img');
      const stage=el('div','mission-heading'),controls=el('div','mission-controls');
      body.append(stage,canvas);
      if(performance.now()<flightUntil){
        stage.append(el('h4',null,'Em órbita de transferência'));canvas.setAttribute('aria-label','Cápsula viajando da fazenda ao asteroide');
        const start=flightUntil-5400;
        const draw=()=>{
          const p=(performance.now()-start)/5400;
          if(p>=1){panel();return;}
          const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
          chart(canvas,performance.now()/1000,p);
          if(p>.28&&p<.76){
            const intensity=Math.sin((p-.28)/.48*Math.PI);
            ctx.strokeStyle='rgba(170,245,255,'+intensity+')';
            for(let i=0;i<48;i++){
              const angle=i*2.4,r=(i*17+p*900)%390;
              ctx.beginPath();ctx.moveTo(w/2+Math.cos(angle)*r,h/2+Math.sin(angle)*r*.55);
              ctx.lineTo(w/2+Math.cos(angle)*(r+40),h/2+Math.sin(angle)*(r+40)*.55);ctx.stroke();
            }
          }
          stage.firstChild.textContent=p<.28?'Decolagem da fazenda':p<.76?'Salto pelo corredor estelar':'Descida em '+sectors[run.sector].name;
        };draw();timer=setInterval(draw,32);return;
      }
      if(!run){
        stage.append(el('h4',null,'Rotas da cápsula'));canvas.setAttribute('aria-label','Mapa orbital entre a fazenda e os asteroides');
        chart(canvas,0,0.3);const list=el('div','orbital-routes');body.append(list);
        sectors.forEach((s,id)=>{
          const locked=state.level<SPACE_LEVEL||journal.completed<id;
          const card=el('section','route-card');card.append(el('h4',null,s.name),el('p',null,'Minere '+s.mineral.toLowerCase()+' e enfrente '+s.boss+'.'),el('small',null,s.reward+' CR · '+s.crystals+' cristais · '+s.pp+' PP'));
          card.append(button(state.level<SPACE_LEVEL?'Libera no nível '+SPACE_LEVEL:journal.completed<id?'Conclua a primeira rota':journal.completed>id?'Explorar novamente':'Lançar cápsula',()=>{
            if(state.level<SPACE_LEVEL||journal.completed<id)return;
            journal.run=newRoom(id,0);save();flightUntil=performance.now()+5400;panel();
          },locked));list.append(card);
        });return;
      }
      const s=sectors[run.sector],caption=el('p','space-mission'),info=el('div','ship-status'),log=el('p','flight-log');
      log.setAttribute('aria-live','polite');stage.append(el('h4',null,s.name),info);
      caption.textContent=run.room?'Câmara do guardião · Desative '+s.boss+'.':'Mina · Extraia três veios, alcance o anel e abra a eclusa.';
      canvas.setAttribute('aria-label',caption.textContent);
      body.append(caption,log,controls);
      function repaint(){
        info.textContent='Escudo '+run.hp+'/12   ·   Amostras '+run.ore+'   ·   Turno '+run.turn;
        log.textContent=run.log||'Pronto para o próximo comando.';dungeon(canvas,run,performance.now()/1000);
      }
      repaint();timer=setInterval(()=>dungeon(canvas,run,performance.now()/1000),140);
      if(run.result){
        controls.append(button(run.result==='win'?'Entregar carga e voltar':'Retornar à base',()=>{
          if(journal.run!==run)return;
          journal.run=null;
          if(run.result==='win'){
            journal.completed=Math.max(journal.completed,run.sector+1);
            addMoney(s.reward);state.crystals+=s.crystals;addRP(s.pp);addXp(110+run.sector*60);play('buy');
            showToast('Carga entregue: '+s.reward+' CR e '+s.crystals+' cristais','mission');
          }
          save();updateHUD();panel();
        }));return;
      }
      action=name=>{
        if(modalId()!=='space'||journal.run!==run)return;
        run.lens=!!journal.lens;
        const before=run.turn,newState=step(run,name);journal.run=newState;
        if(newState!==run||run.result){save();panel();return;}
        if(run.turn!==before){play(name==='pulse'?'click':name==='mine'?'buy':'step');save();}
        repaint();
      };
      const pad=el('div','space-pad');controls.append(pad);
      for(const [name,label] of [['north','↑'],['west','←'],['south','↓'],['east','→']]){
        const b=button(label,()=>action(name));b.dataset.dir=name;b.setAttribute('aria-label',{north:'Norte',west:'Oeste',south:'Sul',east:'Leste'}[name]);pad.append(b);
      }
      const tools=el('div','pilot-tools');controls.append(tools);
      if(run.trader){
        const bazaar=el('section','route-card');
        bazaar.append(el('h4',null,'Seli · coletora de Nacre'),el('p',null,'Missão de campo: traga uma opala viva até a mercadora verde. Ela fabrica uma lente permanente para o pulso da cápsula.'));
        const barter=(cost,apply)=>{
          if(Math.abs(run.x-run.trader.x)+Math.abs(run.y-run.trader.y)>1){run.log='Aproxime-se de Seli no mapa.';repaint();return;}
          if(run.ore<cost){run.log='Minere uma opala viva primeiro.';repaint();return;}
          if(run.ore+run.veins.length-cost<3){run.log='Reserve três amostras para a eclusa.';repaint();return;}
          run.ore-=cost;apply();save();updateHUD();panel();
        };
        bazaar.append(button(journal.lens?'Lente prismática instalada':'1 opala → lente prismática',()=>barter(1,()=>{journal.lens=true;run.log='Missão concluída. Pulso melhorado para 5 de dano.';}),!!journal.lens));
        bazaar.append(button('1 opala → célula de reparo',()=>barter(1,()=>{journal.cells=(journal.cells||0)+1;run.log='Célula armazenada na cápsula.';}),run.ore+run.veins.length<=3));
        body.append(bazaar);
      }
      if(journal.cells>0)tools.append(button('Usar célula ('+journal.cells+')',()=>{
        if(run.hp>=12)return;
        journal.cells--;run.hp=Math.min(12,run.hp+6);run.log='Célula usada. Escudo reparado.';save();panel();
      },run.hp>=12));
      tools.append(button('R · Minerar',()=>action('mine')),button('F · Pulso',()=>action('pulse')),button('E · Eclusa',()=>action('gate')));
      body.append(el('small','flight-help','WASD ou setas para mover. O pulso alcança três casas pelo corredor. Piso laranja dispara no próximo turno.'));
    }});
  }
  window.addEventListener('keydown',key);panel();
}
