// Uma ação consome um turno. As marcas do chefe antecipam o próximo disparo.
export const SPACE_LEVEL=12;
export const sectors=[
  {name:'Jardim do Periélio',mineral:'Âmbar solar',boss:'Broca-Coroa',reward:480,crystals:8,pp:24,
   mine:['#################','#@...o...#...o..#','#.##.....#..##..#','#....d........>.#','#..#..##.#......#','#o.#.....#..d...#','#....o..........#','#################'],
   vault:['#################','#@....#.........#','#..#.....#......#','#.....#.....B...#','#...#...........#','#.....#..#......#','#...+...........#','#################']},
  {name:'Arquivo de Maré',mineral:'Vidro de maré',boss:'Náutilo de Íon',reward:760,crystals:14,pp:40,
   mine:['#################','#@...#...o..#...#','#.o..#..#.......#','#........##...>.#','#..#..d.....#...#','#..#..#..o..#d..#','#o....#.........#','#################'],
   vault:['#################','#@........#.....#','#...##..........#','#...........B...#','#....#..#.......#','#..+...##.......#','#...............#','#################']}
];
const dist=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const directions=[[1,0],[-1,0],[0,1],[0,-1]];
export function newRoom(sector,room,ore=0,hp=12){
  const mission=sectors[sector],layout=room?mission.vault:mission.mine;
  const r={sector,room,ore,hp,x:1,y:1,turn:0,veins:[],enemies:[],danger:[],portal:null,kit:null,result:null,log:room?'O guardião despertou. Observe as marcas no chão.':'Analise os veios e extraia três amostras para alimentar a eclusa.'};
  layout.forEach((line,y)=>[...line].forEach((s,x)=>{
    const p={x,y};if(s==='@'){r.x=x;r.y=y;}if(s==='o')r.veins.push(p);if(s==='>')r.portal=p;if(s==='+')r.kit=p;
    if(s==='d'||s==='B')r.enemies.push({...p,boss:s==='B',hp:s==='B'?9+sector*3:4});
  }));return r;
}
export const layout=r=>r.room?sectors[r.sector].vault:sectors[r.sector].mine;
function floor(r,x,y){return layout(r)[y]?.[x]&&layout(r)[y][x]!=='#';}
function route(r,from,to,avoid=false){
  const path=[{...from,first:null,steps:0}],seen=new Set([from.x+','+from.y]);
  for(let i=0;i<path.length;i++){const cur=path[i];
    if(cur.x===to.x&&cur.y===to.y)return cur;
    for(const [dx,dy] of directions){
      const x=cur.x+dx,y=cur.y+dy,k=x+','+y;
      if(seen.has(k)||!floor(r,x,y)||(avoid&&r.enemies.some(e=>e.x===x&&e.y===y)))continue;
      seen.add(k);path.push({x,y,first:cur.first||{x,y},steps:cur.steps+1});
    }
  }return null;
}
function dangerZone(r){
  // Broca marca as diagonais e o centro. Náutilo corta uma linha ou coluna.
  const tiles=[];
  for(let y=1;y<layout(r).length-1;y++)for(let x=1;x<layout(r)[y].length-1;x++){
    const dx=Math.abs(x-r.x),dy=Math.abs(y-r.y);
    if(floor(r,x,y)&&(r.sector===0?dx===dy&&dx<=2:r.turn%2===0?dx===0:dy===0))tiles.push({x,y});
  }return tiles;
}
export function step(r,action){
  if(r.result)return r;
  const dir={north:[0,-1],south:[0,1],west:[-1,0],east:[1,0]}[action];
  if(dir){
    const x=r.x+dir[0],y=r.y+dir[1];
    if(!floor(r,x,y)||r.enemies.some(e=>e.x===x&&e.y===y)){r.log='Passagem bloqueada.';return r;}
    r.x=x;r.y=y;r.log='';
  }else if(action==='mine'){
    const i=r.veins.findIndex(v=>dist(v,r)<=1);
    if(i<0){r.log='Aproxime-se de um cristal para minerar.';return r;}
    r.veins.splice(i,1);r.ore++;r.hp=Math.min(12,r.hp+1);r.log=sectors[r.sector].mineral+' coletado. Escudo +1.';
  }else if(action==='pulse'){
    const targets=r.enemies.map(e=>({e,path:route(r,r,e)})).filter(t=>t.path&&t.path.steps<=3).sort((a,b)=>a.path.steps-b.path.steps);
    if(!targets.length){r.log='Sem alvo a até três casas de distância pelo corredor.';return r;}
    const e=targets[0].e;e.hp-=3;r.log='Pulso de ressonância: 3 de dano.';
    if(e.hp<=0){r.enemies=r.enemies.filter(other=>other!==e);r.log='Sentinela desativada.';if(e.boss){r.result='win';r.danger=[];r.log='Guardião desativado. Carga pronta para voltar à fazenda.';return r;}}
  }else if(action==='gate'){
    if(!r.portal||dist(r,r.portal)>1||r.ore<3){r.log='A eclusa precisa de três amostras e de um piloto próximo.';return r;}
    return newRoom(r.sector,1,r.ore,Math.min(12,r.hp+4));
  }else return r;
  r.turn++;
  if(r.kit&&dist(r,r.kit)===0){r.hp=Math.min(12,r.hp+5);r.kit=null;r.log='Célula de reparo: escudo +5.';}
  if(r.danger.some(t=>dist(r,t)===0)){r.hp-=4;r.log='Impacto da descarga: escudo −4.';}
  r.danger=[];
  for(const e of r.enemies){
    if(e.boss){
      if(r.turn%3===1){r.danger=dangerZone(r);r.log+=' Descarga marcada! Saia do piso laranja.';}continue;
    }
    if(r.turn%2)continue;
    if(dist(e,r)===1){r.hp--;r.log+=' Sentinela atingiu o escudo.';}
    else {const next=route(r,e,r,true)?.first;if(next){e.x=next.x;e.y=next.y;}}
  }
  if(r.hp<=0){r.hp=0;r.result='lost';r.log='Cápsula de resgate acionada. A fazenda está a salvo.';}
  return r;
}
