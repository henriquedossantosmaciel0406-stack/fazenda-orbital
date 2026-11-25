import * as THREE from 'three';
import {geo,mat,makeLabel} from './world.js';

const plaster=0xD1D5E9, wood=0x333754, beam=0x656888, trim=0xACFFEB;
const glass=0x569ABB, slate=0x465DAC, honey=0xDFA94F, terra=0xBF6949;
const box=(g,c,x,y,z,w,h,d)=>part(g,geo('box',w,h,d),c,x,y,z);
function part(g,shape,color,x,y,z){
  const m=new THREE.Mesh(shape,mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;
}
function orb(g,c,x,y,z,rx,ry,rz) {
  const m=part(g,geo('sph',1,10,7),c,x,y,z);m.scale.set(rx,ry,rz);return m;
}
function disk(g,c,x,y,z,r,h,n=18){return part(g,geo('cyl',r,r,h,n),c,x,y,z);}
function windowBox(g,x,y,z,shutters=true){
  box(g,wood,x,y,z,1.12,1.24,0.16);box(g,glass,x,y,z+0.09,0.94,1.04,0.08);
  box(g,trim,x,y,z+0.16,0.065,1.07,0.05);box(g,trim,x,y,z+0.16,0.94,0.065,0.05);
  box(g,beam,x,y-0.66,z+0.08,1.29,0.12,0.30);
  if(!shutters)return;
  for(const side of [-1,1])box(g,slate,x+side*0.75,y,z+0.06,0.30,1.18,0.12);
  box(g,terra,x,y-0.78,z+0.17,1.12,0.26,0.32);
  for(let i=0;i<5;i++){
    const xx=x+(i-2)*0.20;orb(g,0x689951,xx,y-0.57,z+0.19,0.15,0.14,0.11);
    orb(g,i%2?honey:0xE78B65,xx,y-0.48,z+0.22,0.071,0.08,0.068);
  }
}
function gabledRoof(g,w,d,y,rise,color) {
  const hw=w*0.5, shape=new THREE.Shape();
  shape.moveTo(-hw,0);shape.lineTo(hw,0);shape.lineTo(0,rise);shape.closePath();
  const cap=new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false});
  part(g,cap,plaster,0,y,-d/2);
  const angle=Math.atan2(rise,hw), length=Math.hypot(hw,rise);
  for(const side of [-1,1]){
    const roof=box(g,color,side*hw*0.51,y+rise*0.49+0.07,0,length+0.70,0.23,d+0.76);roof.rotation.z=-side*angle;
    const edge=box(g,trim,side*hw*0.51,y+rise*0.49, d/2+0.39,length+0.71,0.15,0.11);edge.rotation.z=-side*angle;
    for(let i=1;i<=3;i++){
      const f=i/3.65;
      const tile=box(g,color,side*hw*f,y+rise*(1-f)+0.19,0,0.10,0.072,d+0.70);tile.rotation.z=-side*angle;
    }
  }
  box(g,wood,0,y+rise+0.17,0,0.18,0.16,d+0.88);
}
function awning(g,w,y,z,color) {
  const n=Math.ceil(w/0.73);
  for(let i=0;i<n;i++){
    const x=(i+0.5)*w/n-w/2,c=i%2?trim:color;
    box(g,c,x,y,z+0.64,w/n+0.012,0.11,1.40).rotation.x=0.22;
    const hem=orb(g,c,x,y-0.21,z+1.29,w/n/2,0.19,0.078);hem.castShadow=false;
  }
  for(const side of [-1,1]) box(g,wood,side*(w/2-0.12),y/2-0.04,z+1.23,0.10,y-0.42,0.10);
}
function cottage(scene,world,x,z,{w,d,h,roof,wall=plaster,angle=0,shop,chimney=true}){
  const g=new THREE.Group();g.name=shop || 'Casa da vila';g.position.set(x,0,z);g.rotation.y=angle;scene.add(g);
  const front=d/2;
  box(g,0x9B947D,0,0.34,0,w+0.3,0.68,d+0.32);
  box(g,wall,0,h/2+0.40,0,w,h,d);
  for(const sx of [-1,1])for(const sz of [-1,1])box(g,beam,sx*(w/2-0.06),h/2+0.42,sz*(d/2-0.06),0.21,h+0.1,0.22);
  box(g,beam,0,h+0.36,0,w+0.15,0.21,d+0.12);
  box(g,beam,0,h+.48,0,w+.4,.28,d+.4);
  orb(g,glass,0,h+.56,0,w*.49,w*.30,d*.48);
  for(const side of [-1,1]){
    const panel=box(g,slate,side*w*.38,h+w*.16+.52,0,w*.30,.15,d*.78);
    panel.rotation.z=-side*.35;
    for(const z of [-.24,0,.24])box(g,trim,side*w*.38,h+w*.16+.62,z*d,w*.30,.06,.09).rotation.z=panel.rotation.z;
  }
  const loftY=h+0.48+w*0.091;
  const frame=disk(g,wood,0,loftY,front+0.09,0.38,0.17,14);frame.rotation.x=Math.PI/2;
  disk(g,glass,0,loftY,front+0.19,0.27,0.055,14).rotation.x=Math.PI/2;
  if(chimney){
    disk(g,beam,-w*.30,h+1.7,-d*.22,.10,2.4,8);
    orb(g,trim,-w*.30,h+2.88,-d*.22,.85,.19,.85).rotation.z=.52;
    orb(g,honey,-w*.30-.17,h+3.15,-d*.22,.12,.12,.12);
  }
  const doorX=shop?-w*0.33:0;
  box(g,wood,doorX,1.45,front+0.065,1.33,2.19,0.16);
  box(g,shop?slate:roof,doorX,1.43,front+0.16,1.06,1.98,0.12);
  orb(g,honey,doorX+0.35,1.39,front+0.25,0.078,0.078,0.072);
  box(g,0xCAB698,doorX,0.22,front+0.42,1.68,0.22,0.86);
  if(shop){
    const market=shop==='Mercado';
    awning(g,w+0.29,h+0.13,front,market?terra:slate);
    box(g,beam,0.70,0.81,front+0.74,w*0.57,1.03,0.81);
    box(g,trim,0.70,1.36,front+0.74,w*0.60,0.13,0.90);
    for(let i=0;i<5;i++){
      const xx=0.70+(i-2)*w*0.102;
      if(market){box(g,wood,xx,1.50,front+0.73,w*0.093,0.18,0.63);for(let j=0;j<4;j++)orb(g,[0xD95843,0xFAB348,0x6A9947,0x9766B1,0xEBC760][i],xx+(j%2-0.5)*0.25,1.66,front+0.73+(Math.floor(j/2)-0.5)*0.22,0.16,0.16,0.16);}
      else {part(g,geo('cyl',0.22,0.16,0.33,8),terra,xx,1.58,front+0.74);for(let j=0;j<3;j++){const a=j*2.1;orb(g,j%2?0x749858:0x4E8564,xx+Math.sin(a)*0.11,1.90,front+0.73+Math.cos(a)*0.11,0.13,0.23,0.10).rotation.z=Math.sin(a)*0.55;}}
    }
    const sign=makeLabel(shop.toUpperCase(),market?'#FFC578':'#9BEEE0',5.35,1.02);
    sign.position.set(0,h+w*0.31+1.42,0);g.add(sign);
    const hot=market?world.marketPosition:world.shopPosition;
    hot.set(x,1.7,z+Math.cos(angle)*(front+0.95));
  }else{
    for(const sx of [-1,1])windowBox(g,sx*w*0.30,2.00,front+0.06);
    awning(g,1.99,2.68,front,roof);
  }
  for(const sx of [-1,1]){
    const wing=new THREE.Group();wing.position.set(sx*w/2,0,0);wing.rotation.y=sx*Math.PI/2;g.add(wing);
    windowBox(wing,0,2.16,0.04,false);
  }
  world.colliders.push({x,z,halfX:w/2+0.15,halfZ:d/2+0.15});
  if(shop)world.colliders.push({x:x+0.70*Math.cos(angle),z:z+(front+0.72)*Math.cos(angle),halfX:w*0.30,halfZ:0.46});
}
export function buildTown(scene,world) {
  cottage(scene,world,16,11,{w:5.7,d:5.4,h:3.25,roof:slate});
  cottage(scene,world,45,11,{w:6.3,d:4.9,h:4.48,roof:terra,wall:0xF0CA86});
  cottage(scene,world,17,40,{w:6.7,d:5.0,h:3.7,roof:0x63859C,angle:Math.PI});
  cottage(scene,world,45,40,{w:5.55,d:5.1,h:3.0,roof:0x839558,angle:Math.PI,wall:0xF6CD9E});
  cottage(scene,world,30,14,{w:7.8,d:5.2,h:3.65,roof:slate,shop:'Loja Geral'});
  cottage(scene,world,31,37,{w:8.3,d:5.6,h:3.43,roof:terra,shop:'Mercado',angle:Math.PI,chimney:false});
  const plaza=new THREE.Group();plaza.name='Praça do Relógio';scene.add(plaza);
  box(plaza,0xD8BB92,30,0.18,25,48,0.10,5.5);
  box(plaza,0xD8BB92,30,0.19,25,5.6,0.10,37);
  disk(plaza,0xB88A68,30,0.26,25,5.55,0.09,32);
  disk(plaza,0xE5C79A,30,0.32,25,4.94,0.065,32);
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8;
    box(plaza,trim,30+Math.sin(a)*5.18,0.32,25+Math.cos(a)*5.18,0.55,0.07,0.19).rotation.y=a;
  }
  // Paralelepípedos claros desenham o caminho dos portões sem cobrir a mandala.
  const pavers=[0x8693AA,0x72829E,0xA7B7CF];
  for(let i=0;i<30;i++)for(let j=0;j<3;j++){
    const x=7+i*1.55+(j%2)*0.63,z=25+(j-1)*1.63;
    if(Math.hypot(x-30,z-25)>5.75)box(plaza,pavers[(i+j*2)%3],x,0.243,z,1.43,0.045,1.49);
  }
  for(let i=0;i<15;i++)for(let j=0;j<3;j++){
    const z=13+i*1.67+(j%2)*0.64,x=30+(j-1)*1.58;
    if(Math.hypot(x-30,z-25)>5.75)box(plaza,pavers[(i+j)%3],x,0.247,z,1.44,0.045,1.53);
  }
  // Fonte armilar com planetas em órbita. A borda deixa espaço para circular.
  disk(plaza,0xAD9170,30,.51,25,2.05,.35,24);
  disk(plaza,trim,30,.72,25,1.96,.17,24);
  disk(plaza,0x65B7B7,30,.83,25,1.73,.07,24);
  disk(plaza,wood,30,1.10,25,.45,.59,10);
  disk(plaza,slate,30,1.51,25,.65,.25,12);
  orb(plaza,honey,30,2.56,25,.46,.46,.46);
  const orbit=new THREE.Group();orbit.position.set(30,2.58,25);scene.add(orbit);
  for(let i=0;i<2;i++){
    const ring=new THREE.Group();orbit.add(ring);ring.rotation.set(.77+i*.92,.38+i,.39+i*.72);
    part(ring,geo('tor',1.13+i*.14,.059,6,32),i?slate:terra,0,0,0);
    orb(ring,i?0xC77648:0x73B7AF,1.13+i*.14,0,0,.16,.16,.16);
  }
  orbit.traverse(o=>o.userData.keep=true);orbit.userData.animated=true;
  world.colliders.push({x:30,z:25,radius:1.98});
  // Jardins de bairro, com borda de alvenaria, árvores de sombra e flores.
  for(const [cx,cz] of [[13,19],[14,32],[41.5,17.8],[44,32.5]]){
    const bed=new THREE.Group();bed.position.set(cx,0,cz);plaza.add(bed);
    disk(bed,0xBAA27D,0,.32,0,2,.28,12);disk(bed,0x718B53,0,.5,0,1.83,.13,12);
    part(bed,geo('cyl',.16,.26,2.1,8),wood,0,1.45,0);
    for(let j=0;j<4;j++){
      const a=j*2.18;
      orb(bed,[0x699B61,0x789F54,0x8FB56B,0x88AD60][j],Math.cos(a)*.56,2.77+(j===3?.82:0),Math.sin(a)*.55,1.10,.88,1.06);
    }
    for(let j=0;j<13;j++){
      const a=j*2.4,x=Math.cos(a)*1.46,z=Math.sin(a)*1.46;
      orb(bed,0x538352,x,.72,z,.26,.22,.25);
      orb(bed,[honey,terra,trim][j%3],x,.93,z,.13,.12,.12);
    }
    world.colliders.push({x:cx,z:cz,radius:1.8});
  }
  for(const z of [19,31.5]){
    const left=24,right=36;
    for(const px of [left,right]){part(plaza,geo('cyl',.06,.10,4.1,7),wood,px,2.15,z);orb(plaza,honey,px,4.26,z,.12,.15,.12);}
    const cordPoint=u=>new THREE.Vector3(left+(right-left)*u,4.10-0.62*Math.sin(u*Math.PI),z);
    for(let j=0;j<10;j++){
      const start=cordPoint(j/10),end=cordPoint((j+1)/10),mid=start.clone().lerp(end,.5);
      const cord=part(plaza,geo('cyl',.024,.024,start.distanceTo(end),5),wood,mid.x,mid.y,mid.z);
      cord.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.clone().sub(start).normalize());
      if(j>0&&j<9){
        const shape=new THREE.Shape();shape.moveTo(-.33,0);shape.lineTo(0,-.60);shape.lineTo(.33,0);shape.closePath();
        part(plaza,new THREE.ExtrudeGeometry(shape,{depth:.042,bevelEnabled:false}),[slate,terra,honey][j%3],mid.x,mid.y,z);
      }
    }
  }
  // Coreto do relógio no eixo leste, deixando livre a travessia entre as lojas.
  const tower=new THREE.Group();tower.name='Torre do relógio';tower.position.set(48,0,25);scene.add(tower);
  disk(tower,0xB49C7E,0,0.31,0,2.24,0.58,8);
  box(tower,plaster,0,3.17,0,2.54,5.7,2.54);box(tower,beam,0,5.45,0,2.88,0.22,2.88);
  box(tower,slate,0,6.11,0,2.97,1.84,2.97);
  const moving=[];
  for(let i=0;i<4;i++){
    const face=new THREE.Group();face.rotation.y=i*Math.PI/2;tower.add(face);
    disk(face,honey,0,6.10,1.51,0.80,0.13).rotation.x=Math.PI/2;
    disk(face,trim,0,6.10,1.60,0.67,0.06).rotation.x=Math.PI/2;
    for(let j=0;j<12;j++){const a=j*Math.PI/6;box(face,wood,Math.sin(a)*0.54,6.1+Math.cos(a)*0.54,1.65,0.045,0.10,0.028).rotation.z=-a;}
    const hand=(length,width,depth)=>{const p=new THREE.Group();face.add(p);p.position.set(0,6.1,depth);box(p,wood,0,length/2,0,width,length,0.035);return p;};
    moving.push([hand(0.34,0.085,1.69),hand(0.50,0.052,1.74)]);
    box(face,beam,-1.16,2.88,1.26,0.16,4.77,0.1);
  }
  part(tower,geo('cone',2.38,2.64,4),terra,0,8.29,0).rotation.y=Math.PI/4;
  orb(tower,honey,0,9.75,0,0.22,0.29,0.22);
  world.colliders.push({x:48,z:25,radius:2.18});
  for(const x of [21,39])for(const z of [20.4,30.1]){
    const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=z>25?Math.PI:0;scene.add(g);
    box(g,wood,0,0.53,0,2,0.14,0.66);box(g,beam,0,0.93,-0.29,2,0.42,0.11);
    for(const side of [-1,1])box(g,slate,side*0.74,0.30,0,0.17,0.51,0.48);
    world.colliders.push({x,z,halfX:1,halfZ:0.34});
  }
  const port=new THREE.Group();port.name='Plataforma de lançamento';port.position.set(57,0,35);scene.add(port);
  disk(port,slate,0,.29,0,3.6,.43,12);disk(port,trim,0,.54,0,3.03,.10,12);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;orb(port,honey,Math.sin(a)*3.1,.59,Math.cos(a)*3.1,.14,.08,.14);}
  disk(port,beam,0,1.19,0,.79,1.12,16);
  orb(port,trim,0,3.45,0,1.33,2.32,1.33);
  part(port,geo('cone',1.04,1.65,16),terra,0,5.66,0);
  for(let i=0;i<3;i++){const a=i*2.094;
    const fin=part(port,geo('cone',.68,1.72,3),slate,Math.sin(a)*1.11,1.43,Math.cos(a)*1.11);fin.rotation.y=a;
    const win=orb(port,wood,Math.sin(a)*1.19,3.83,Math.cos(a)*1.19,.48,.49,.15);win.rotation.y=a;
    const pane=orb(port,0x6CD4D0,Math.sin(a)*1.31,3.83,Math.cos(a)*1.31,.36,.37,.07);pane.rotation.y=a;
  }
  world.colliders.push({x:57,z:35,radius:1.55});
  world.portPosition=new THREE.Vector3(55,1.7,36);
  const portLabel=makeLabel('PORTO ORBITAL','#FFE19F',4.8,.92);portLabel.position.set(0,7.22,0);port.add(portLabel);
  // Ponteiros se movem fora dos lotes estáticos da praça.
  for(const pair of moving)for(const p of pair){p.userData.animated=true;p.traverse(o=>o.userData.keep=true);}
  return time=>{orbit.rotation.y=time*Math.PI/2;for(const [hour,minute] of moving){hour.rotation.z=-time*Math.PI/6;minute.rotation.z=-time*Math.PI*2;}};
}
