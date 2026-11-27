import {touchesSolid} from './collision.js';
import * as THREE from 'three';
import {geo, mat} from './world.js';
import {mergeGroupStatic} from './optimize.js';

const ink=0x302C3A, cream=0xFFEBCC;
function piece(group,shape,color,x,y,z,sx=1,sy=1,sz=1) {
  const mesh=new THREE.Mesh(shape,mat(color)); mesh.scale.set(sx,sy,sz);
  mesh.position.set(x,y,z); mesh.castShadow=true; group.add(mesh); return mesh;
}
const oval=(g,c,x,y,z,w,h,d)=>piece(g,geo('sph',1,12,9),c,x,y,z,w,h,d);
function pivot(parent,x,y,z) {const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;}
function eyes(g,y,z,separation,r) {
  for(const side of [-1,1]) {
    oval(g,ink,side*separation,y,z,r*0.8,r,r*0.56);
    oval(g,0xFFFFEC,side*separation-0.22*r,y+0.36*r,z+0.47*r,r*0.24,r*0.24,r*0.16);
  }
}
function batch(g) { mergeGroupStatic(g); }
const shirts=[0x359C95,0xD68344,0x548AB9,0x9C72AE,0xD45E50,0x72994F];
export function makeFarmer(seed) {
  const root=new THREE.Group(),rig=pivot(root,0,0,0), torso=pivot(rig,0,0,0);
  const cloth=shirts[seed%shirts.length];
  const denim=0x304E68, honey=0xEDC47C, arms=[],legs=[];
  // Macacão pressurizado e mochila de cultivo, visíveis de frente e de costas.
  oval(torso,cream,0,0.76,0,0.30,0.32,0.21);
  piece(torso,geo('box',.39,.40,.18),denim,0,.77,-.21);
  piece(torso,geo('box',.26,.23,.05),cloth,0,.78,-.31);
  for(const side of [-1,1]){
    oval(torso,0x76DECE,side*.22,.76,-.21,.068,.18,.075);
    oval(torso,cloth,side*.245,.93,0,.14,.11,.145);
  }
  oval(torso,0x91BC64,.075,1.03,-.21,.045,.115,.03).rotation.z=-.55;
  oval(torso,0xACD878,-.045,1.01,-.21,.04,.09,.03).rotation.z=.65;
  piece(torso,geo('box',0.42,0.29,0.16),denim,0,0.65,0.12);
  piece(torso,geo('box',0.18,0.12,0.035),0x507490,0,0.67,0.21);
  for(const side of [-1,1]) {
    piece(torso,geo('box',0.067,0.27,0.048),denim,side*0.155,0.87,0.146).rotation.z=-side*0.15;
    oval(torso,honey,side*0.14,0.78,0.193,0.026,0.026,0.015);
    const arm=pivot(rig,side*0.26,0.90,0);
    oval(arm,cloth,side*0.035,-0.09,0,0.115,0.15,0.119);
    oval(arm,cream,side*0.045,-0.24,0.013,0.084,0.12,0.085);
    oval(arm,denim,side*.045,-.31,.025,.085,.075,.092);
    const leg=pivot(rig,side*0.125,0.53,0);
    oval(leg,denim,0,-0.155,0,0.118,0.19,0.132);
    oval(leg,0x715241,0,-0.382,0.045,0.124,0.137,0.173);
    piece(leg,geo('box',0.21,0.046,0.255),0x493B38,0,-0.491,0.052);
    batch(arm);batch(leg);arms.push(arm);legs.push(leg);
  }
  const head=pivot(rig,0,1.28,0);
  // Capacete de cerâmica e visor contínuo. Dois olhos de luz dão expressão à distância.
  oval(head,cream,0,.02,-.025,.395,.365,.34);
  oval(head,denim,0,.035,.155,.359,.258,.241);
  oval(head,0x244460,0,.052,.196,.33,.21,.22);
  for(const side of [-1,1]){
    oval(head,0xA8FFF0,side*.12,.063,.399,.031,.056,.017);
    const ear=piece(head,geo('cyl',.105,.105,.068,12),cloth,side*.385,.02,0);
    ear.rotation.z=Math.PI/2;
  }
  oval(head,0x83BBD4,-.15,.169,.347,.077,.017,.014).rotation.z=.25;
  piece(torso,geo('cyl',.205,.236,.09,12),denim,0,1.04,0);
  piece(torso,geo('box',.15,.078,.04),0x97F4CE,-.053,.82,.22);
  const crest=pivot(head,.08,.34,-.035);
  oval(crest,cloth,0,.019,0,.13,.045,.10);
  oval(crest,0xAEE77F,-.04,.093,0,.04,.097,.035).rotation.z=.55;
  oval(crest,0x68BC96,.045,.081,0,.041,.077,.035).rotation.z=-.58;
  batch(head);batch(torso);root.userData.pose={rig,head,legs,arms};return root;
}
export function animateFarmer(root,t,walk,air=0){
  const {rig,head,arms,legs}=root.userData.pose,step=Math.sin(t*9)*walk;
  rig.position.y=0.013*Math.sin(t*2.3)+0.045*Math.abs(step);
  head.rotation.z=0.035*Math.sin(t*2.3)*(1-walk);
  for(let i=0;i<2;i++){
    const s=i?1:-1;arms[i].rotation.x=s*step*0.53-air*0.38;legs[i].rotation.x=-s*step*0.63+air*0.23;
  }
}

export const PETS={
  cat:{name:'Gato malhado',cost:0,desc:'Gato de botas claras e cauda em gancho.'},
  dog:{name:'Corgi caramelo',cost:160,desc:'Patinhas curtas e lenço de explorador.'},
  rabbit:{name:'Coelho da lua',cost:240,desc:'Orelha caída e patas largas para saltar.'},
  fox:{name:'Raposa cometa',cost:520,desc:'Enquanto acompanha você, aumenta sua velocidade em 15%.'},
  turtle:{name:'Tartaruga de musgo',cost:680,desc:'Enquanto acompanha você, cultivos e árvores crescem 20% mais rápido.'},
  axolotl:{name:'Axolote de orvalho',cost:840,desc:'Enquanto acompanha você, cada unidade de água da sua rega rende 30% mais.'}
};
const coats={cat:0x8D8FB5,dog:0xF0A860,rabbit:0xE6D4F0,fox:0xF07C4A,turtle:0x8FD08A,axolotl:0xFFB3C8};
// Pets cartoon: cabecona, olhos grandes e brilhantes, bochechas coradas, patinhas curtas. Frente = +z, pe no y = 0.
export function makePet(type){
  const root=new THREE.Group(),body=pivot(root,0,0,0),core=pivot(body,0,0,0);
  const low=type==='turtle'||type==='axolotl',bunny=type==='rabbit',fur=coats[type];
  const blush=0xFF9AAE;
  const head=pivot(body,0,low?.30:.52,low?.30:.22),tail=pivot(body,0,low?.26:.36,-.28),legs=[];
  const cone=(g,c,x,y,z,w,h,d)=>piece(g,geo('cone',1,1,10),c,x,y,z,w,h,d);
  // corpo e barriga
  oval(core,fur,0,low?.24:.32,-.04,low?.27:.20,low?.17:.20,low?.34:.27);
  if(!low) oval(core,cream,0,.27,.10,.14,.14,.15);
  // cabeca grande + focinho
  oval(head,fur,0,.08,0,low?.27:.255,low?.21:.23,low?.24:.22);
  oval(head,low?0xFFE3EA:cream,0,.01,.15,low?.13:.115,.075,.09);
  // rosto: olhos grandes, brilhos, bochechas, boca
  eyes(head,.115,low?.19:.17,type==='axolotl'?.15:.105,.047);
  for(const side of [-1,1]) oval(head,blush,side*(low?.2:.17),.03,low?.16:.145,.05,.03,.02);
  oval(head,0x3A2433,0,.045,low?.235:.22,.034,.024,.024);
  piece(head,geo('tor',.04,.007,4,10,Math.PI),0x6A3A44,0,.0,low?.235:.215).rotation.z=Math.PI;
  if(type==='turtle'){
    oval(core,0x4C9A6C,0,.40,-.07,.34,.25,.40);
    for(let i=0;i<7;i++){const a=i*Math.PI/3.5;oval(core,i%2?0xB6E28A:0x7BC47F,.20*Math.cos(a),.55,-.07+.24*Math.sin(a),.11,.06,.12);}
    oval(core,0xB6E28A,0,.60,-.07,.12,.07,.13);
    for(const side of [-1,1]) oval(core,0xFFF3C4,side*.33,.34,-.07,.04,.10,.30); // borda clara do casco
    for(const side of [-1,1]) oval(core,0x7BC47F,side*.04,.74,-.07,.04,.10,.025).rotation.z=-side*.5; // broto
    cone(tail,fur,0,-.02,-.10,.06,.18,.06).rotation.x=-2.0;
  }else if(type==='axolotl'){
    for(const side of [-1,1])for(let i=0;i<3;i++){
      const g=pivot(head,side*.21,.06+i*.065,-.02);g.rotation.z=-side*(1.30-i*.34);g.rotation.y=side*.2;
      oval(g,0xE0527F,0,.10,0,.034,.14,.04);
      for(const sg of [-1,1]) oval(g,0xFF8DB1,sg*.03,.16,0,.024,.06,.024).rotation.z=-sg*.6;
    }
    oval(tail,0xFF8DB1,0,.02,-.18,.05,.14,.26); // cauda-nadadeira
    oval(body,0xFFE3EA,0,.21,.18,.20,.07,.12);   // sorriso largo (focinho)
  }else{
    for(const side of [-1,1]){
      if(bunny){
        const ear=pivot(head,side*.11,.21,-.02);ear.rotation.z=side<0?.20:1.0; // uma orelha caida
        oval(ear,fur,0,.22,0,.075,.25,.06);oval(ear,0xF2A6BC,0,.23,.04,.04,.17,.02);
      }else{
        const big=type==='fox'?.29:type==='dog'?.24:.18;
        const e=cone(head,fur,side*.16,.27,-.02,.115,big,.095);e.rotation.z=-side*.2;
        cone(head,type==='fox'?0x40303A:0xF2A6BC,side*.163,.275,.03,.06,big*.6,.045).rotation.z=-side*.2;
      }
    }
    if(type==='fox'){
      oval(head,cream,0,.035,.16,.14,.07,.12);
      for(const side of [-1,1]) oval(head,cream,side*.19,.0,.08,.07,.08,.12); // bochechas peludas
      oval(tail,fur,0,.14,-.20,.14,.15,.30).rotation.x=.5;oval(tail,cream,0,.24,-.42,.10,.11,.15).rotation.x=.5;
      piece(core,geo('tor',.17,.05,6,14),0x5DB7C9,0,.43,.13).rotation.x=1.2; // cachecol
    }else if(type==='cat'){
      for(let i=0;i<6;i++)oval(tail,i%2?0x565880:fur,.045*i,.05+i*.085,-.04-.06*Math.sin(i*.6),.064,.09,.064);
      for(let i=-1;i<=1;i++)oval(head,0x575980,i*.06,.205,.14,.016,.05,.022);
      for(const side of [-1,1])for(let k=0;k<2;k++) piece(head,geo('cyl',.004,.004,.18,3),0xFFFFFF,side*.2,.03-k*.03,.19).rotation.set(0,0,Math.PI/2+side*(k?.15:-.1)); // bigodes
      piece(core,geo('tor',.15,.03,5,14),0xE0527F,0,.45,.14).rotation.x=1.25;oval(core,0xFFD166,0,.38,.27,.035,.035,.035); // coleira + guizo
    }else if(bunny){
      oval(tail,0xFFFFFF,0,.02,-.09,.12,.12,.12);
    }else{ // corgi
      oval(head,cream,0,.14,.12,.04,.10,.05);
      oval(core,0x3F7FC6,0,.46,.12,.21,.07,.16);cone(core,0x3F7FC6,0,.38,.25,.10,.16,.04).rotation.x=Math.PI; // lenco
      oval(tail,cream,0,.05,-.07,.095,.10,.12);
    }
  }
  for(const x of [-1,1])for(const z of [-1,1]){
    const leg=pivot(body,x*(low?.23:.12),low?.15:.22,z*.18-.03);
    const stock=type==='fox'||type==='cat'&&z>0;
    oval(leg,type==='fox'?0x40303A:fur,0,-.07,0,.07,.11,.075);
    oval(leg,low?fur:(type==='fox'?0x40303A:cream),0,low?-.10:-.17,.025,bunny?.095:.078,.058,bunny&&z<0?.17:.10);
    batch(leg);legs.push(leg);
  }
  batch(core);batch(head);batch(tail);root.userData.pet={body,head,legs,tail,type};return root;
}
const target=new THREE.Vector3(),dir=new THREE.Vector3();
export function followPet(pet,owner,dt,t,world){
  const p=pet.position, data=pet.userData.pet;
  target.set(owner.x,0,owner.z);dir.subVectors(target,p);dir.y=0;
  const gy=(x,z)=>world&&world.surfaceY?world.surfaceY(x,z):0;
  let distance=dir.length();
  if(!pet.userData.placed || distance>11){p.set(owner.x,gy(owner.x,owner.z),owner.z);pet.userData.placed=true;distance=0;}
  let speed=0;
  if(distance>1.35){
    speed=Math.min(8,(distance-1.35)*3);dir.normalize();let dx=dir.x*speed*dt,dz=dir.z*speed*dt;
    const free=(x,z)=> !world || (world.isWalkable(x,z) && !world.colliders.some(c=>touchesSolid(c,x,z,0.13)));
    if(free(p.x+dx,p.z))p.x+=dx;
    if(free(p.x,p.z+dz))p.z+=dz;
    const angle=Math.atan2(dir.x,dir.z);pet.rotation.y+=Math.atan2(Math.sin(angle-pet.rotation.y),Math.cos(angle-pet.rotation.y))*Math.min(1,dt*9);
  }
  p.y+=(gy(p.x,p.z)-p.y)*Math.min(1,dt*14); // acompanha o relevo: nunca afunda no solo, calcada ou estrada
  const pace=Math.min(1,speed/2),step=Math.sin(t*12);
  data.body.position.y=Math.abs(step)*pace*(data.type==='rabbit'?0.18:0.046);
  data.tail.rotation.z=Math.sin(t*(data.type==='dog'?11:3))*0.35;
  data.head.rotation.x=Math.sin(t*2)*0.065;
  data.legs.forEach((leg,i)=>{leg.rotation.x=(i===1||i===2?-1:1)*step*pace*0.60;});
}

export function companion(scene) {
  let pet=null;
  return {
    update(type,owner,dt,t,world) {
      if(type !== (pet?.userData.pet.type || null)){
        this.remove();
        if(Object.hasOwn(PETS,type)){
          pet=makePet(type);pet.name='Pet '+type;scene.add(pet);
          pet.position.set(owner.x+0.9,world&&world.surfaceY?world.surfaceY(owner.x+0.9,owner.z+0.8):0,owner.z+0.8);pet.userData.placed=true;
        }
      }
      if(pet)followPet(pet,owner,dt,t,world);
    },
    remove(){
      if(!pet)return;
      scene.remove(pet);pet.traverse(o=>{if(o.userData.ownedGeometry)o.geometry.dispose();});pet=null;
    }
  };
}
