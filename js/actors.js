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
const coats={cat:0x74758c,dog:0xde9b52,rabbit:0xcebadc,fox:0xd76b41,turtle:0x88bb83,axolotl:0xf4aabb};
export function makePet(type){
  const root=new THREE.Group(),body=pivot(root,0,0,0),core=pivot(body,0,0,0);
  const bunny=type==='rabbit',low=type==='turtle'||type==='axolotl',fur=coats[type];
  const head=pivot(body,0,low?.28:bunny?.55:.49,low?.37:.27);
  const tail=pivot(body,0,low?.27:.35,-.30),legs=[];
  function tip(g,c,x,y,z,w,h,d,tilt=0){
    const m=piece(g,geo('cone',1,1,8),c,x,y,z,w,h,d);m.rotation.z=tilt;return m;
  }
  oval(core,fur,0,low?.26:.34,-.06,low?.26:.22,bunny?.29:low?.15:.22,type==='dog'?.40:.32);
  oval(head,fur,0,.08,0,low?.25:.23,.20,low?.24:.19);
  if(type==='turtle'){
    oval(core,0x427e6a,0,.42,-.08,.32,.22,.38);
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3;oval(core,i%2?0x9cbc72:0x75a67f,.18*Math.cos(a),.54,-.08+.22*Math.sin(a),.105,.065,.12);
    }
    tip(core,0xb4d87c,0,.69,-.1,.085,.20,.06,-.36);
    tip(tail,fur,0,-.03,-.12,.07,.23,.07).rotation.x=-2.05;
  }else if(type==='axolotl'){
    for(const side of [-1,1])for(let i=0;i<3;i++){
      const stalk=pivot(head,side*.19,.035+i*.072,-.04);
      stalk.rotation.z=-side*(1.38-i*.33);
      oval(stalk,0xe15b8b,0,.101,0,.037,.14,.044);
      for(const sign of [-1,1])oval(stalk,0xff93b5,sign*.028,.15,0,.025,.057,.025).rotation.z=-sign*.62;
    }
    oval(tail,0xe77d9d,0,.018,-.18,.06,.135,.24);
  }else{
    for(const side of [-1,1]){
      if(bunny){
        const ear=pivot(head,side*.105,.22,0);
        ear.rotation.z=side*(side<0?.22:1.02);
        oval(ear,fur,0,.21,0,.078,.24,.061);oval(ear,0xe99baf,0,.22,.046,.042,.16,.022);
      }else{
        const size=type==='fox'?.27:type==='dog'?.21:.17;
        tip(head,fur,side*.15,.274,-.014,.116,size,.095,-side*.18);
        tip(head,0x875364,side*.15,.276,.048,.064,size*.61,.042,-side*.18);
      }
    }
    oval(head,cream,0,.022,.145,.143,.089,type==='fox'?.15:.097);
    oval(head,ink,0,.056,type==='fox'?.283:.229,.043,.026,.029);
    if(type==='fox'){
      oval(tail,fur,0,.13,-.18,.14,.145,.29).rotation.x=.47;
      oval(tail,cream,0,.225,-.38,.103,.106,.16).rotation.x=.47;
    }else if(type==='cat'){
      for(let i=0;i<5;i++)oval(tail,i%2?0x454758:fur,.05*i,.06+i*.088,-.05-.055*Math.sin(i),.067,.095,.068);
      for(let i=-1;i<=1;i++)oval(head,0x4f5162,i*.062,.218,.128,.018,.051,.024);
    }else if(bunny)oval(tail,cream,0,.015,-.08,.12,.123,.12);
    else{
      oval(core,0x34758c,0,.49,.13,.228,.083,.19);
      tip(core,0x34758c,0,.38,.27,.10,.16,.045).rotation.x=Math.PI;
      oval(tail,cream,0,.06,-.085,.09,.104,.12);
    }
  }
  eyes(head,.12,low?.202:.158,.106,.033);
  for(const x of [-1,1])for(const z of [-1,1]){
    const leg=pivot(body,x*(low?.235:.14),low?.175:.23,z*.19-.04);
    oval(leg,fur,0,-.07,0,.067,.10,.076);
    oval(leg,low?fur:cream,0,low?-.124:-.175,.027,bunny?.09:.072,.057,bunny && z<0?.17:.098);
    batch(leg);legs.push(leg);
  }
  batch(core);batch(head);batch(tail);root.userData.pet={body,head,legs,tail,type};return root;
}
const target=new THREE.Vector3(),dir=new THREE.Vector3();
export function followPet(pet,owner,dt,t,world){
  const p=pet.position, data=pet.userData.pet;
  target.set(owner.x,0,owner.z);dir.subVectors(target,p);dir.y=0;
  let distance=dir.length();
  if(!pet.userData.placed || distance>11){p.set(owner.x,0,owner.z);pet.userData.placed=true;distance=0;}
  let speed=0;
  if(distance>1.35){
    speed=Math.min(8,(distance-1.35)*3);dir.normalize();let dx=dir.x*speed*dt,dz=dir.z*speed*dt;
    const free=(x,z)=> !world || (world.isWalkable(x,z) && !world.colliders.some(c=>touchesSolid(c,x,z,0.13)));
    if(free(p.x+dx,p.z))p.x+=dx;
    if(free(p.x,p.z+dz))p.z+=dz;
    const angle=Math.atan2(dir.x,dir.z);pet.rotation.y+=Math.atan2(Math.sin(angle-pet.rotation.y),Math.cos(angle-pet.rotation.y))*Math.min(1,dt*9);
  }
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
          pet.position.set(owner.x+0.9,0,owner.z+0.8);pet.userData.placed=true;
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
