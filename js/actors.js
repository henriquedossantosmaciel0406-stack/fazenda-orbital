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
const skins=[0xCA895C,0xF0B98C,0xA86942,0xE5A478];
export function makeFarmer(seed) {
  const root=new THREE.Group(),rig=pivot(root,0,0,0), torso=pivot(rig,0,0,0);
  const cloth=shirts[seed%shirts.length],skin=skins[seed%skins.length],hair=[0x4B352E,0x764732,0x302A2C][seed%3];
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
  const head=pivot(rig,0,1.30,0);
  oval(head,skin,0,0,0,0.335,0.32,0.295);
  for(const side of [-1,1]){
    oval(head,skin,side*0.316,0,0.009,0.071,0.093,0.060);
    oval(head,0xDA926F,side*0.213,-0.065,0.213,0.059,0.034,0.029);
    oval(head,hair,side*0.13,0.103,0.259,0.065,0.017,0.017).rotation.z=side*0.10;
  }
  eyes(head,0.036,0.266,0.126,0.058);oval(head,skin,0,-0.032,0.307,0.059,0.05,0.05);
  const smile=piece(head,geo('tor',0.052,0.008,5,10,Math.PI),0x794936,0,-0.099,0.274);smile.rotation.z=Math.PI;
  // Capacete aberto: a face continua legível mesmo em telas pequenas.
  oval(head,cream,0,.06,-.075,.362,.345,.267);
  oval(head,cloth,0,.245,.04,.36,.14,.30);
  piece(head,geo('box',.37,.058,.14),denim,0,.22,.26);
  for(const side of [-1,1]){
    const earpiece=piece(head,geo('cyl',.105,.105,.077,12),cloth,side*.346,.025,-.015);
    earpiece.rotation.z=Math.PI/2;
  }
  if(seed%3===0){
    piece(head,geo('cyl',.017,.023,.17,8),denim,.26,.34,0);
    oval(head,0x94EFE3,.26,.44,0,.045,.046,.045);
  }else if(seed%3===1){
    oval(head,honey,0,.255,.263,.082,.065,.037);
  }else{
    for(const side of [-1,1])oval(head,0xA1DB78,side*.055,.385,-.035,.037,.094,.028).rotation.z=-side*.48;
  }
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
  cat:{name:'Gato malhado',cost:0,desc:'Cauda listrada e passos curtos.'},
  dog:{name:'Corgi caramelo',cost:160,desc:'Orelhas grandes e cauda que abana.'},
  rabbit:{name:'Coelho da lua',cost:240,desc:'Acompanha você aos saltinhos.'}
};
export function makePet(type){
  const root=new THREE.Group(),body=pivot(root,0,0,0),head=pivot(body,0,0.475,0.29);
  const fur=type==='cat'?0xC68A58:type==='dog'?0xCB8644:0xDFDAD0;
  const bunny=type==='rabbit',cat=type==='cat';
  const core=pivot(body,0,0,0);
  oval(core,fur,0,0.33,-0.04,0.218,0.235,bunny?0.235:0.34);
  oval(core,cream,0,0.30,0.18,0.159,0.177,0.145);
  oval(head,fur,0,0.1,0,0.236,0.205,0.2);
  for(const side of [-1,1]){
    if(bunny) {
      oval(head,fur,side*0.10,0.386,-0.045,0.067,0.214,0.061).rotation.z=-side*0.16;
      oval(head,0xE8AD93,side*0.10,0.391,0.001,0.033,0.15,0.024).rotation.z=-side*0.16;
    }else{
      const ear=piece(head,geo('cone',1,1,4),fur,side*0.155,cat?0.286:0.32,-0.03,0.11,cat?0.225:0.32,0.097);ear.rotation.z=-side*0.19;
      piece(head,geo('cone',1,1,4),0xB46955,side*0.161,ear.position.y,0.028,0.060,cat?0.132:0.204,0.052).rotation.z=ear.rotation.z;
    }
    oval(head,cream,side*0.052,0.045,0.167,0.073,0.057,0.061);
  }
  eyes(head,0.133,0.165,0.101,0.039);oval(head,ink,0,0.074,0.224,0.030,0.020,0.021);
  if(cat)for(let i=-1;i<=1;i++)oval(head,0x875937,i*0.055,0.233,0.139,0.017,0.047,0.015);
  if(type==='dog')oval(head,cream,0,0.18,0.168,0.033,0.079,0.019);
  piece(core,geo('cyl',0.163,0.171,0.06,12),0x449C99,0,0.445,0.20);
  const tail=pivot(body,0,0.385,-0.29);
  if(cat){oval(tail,fur,0.033,0.16,-0.07,0.075,0.23,0.075).rotation.x=-0.35;oval(tail,0x81563B,0.035,0.355,-0.135,0.062,0.08,0.059);}
  else oval(tail,bunny?cream:fur,0,0.06,-0.07,bunny?0.10:0.073,bunny?0.11:0.14,0.10);
  const legs=[];for(const x of [-0.135,0.135])for(const z of [-0.19,0.17]){
    const leg=pivot(body,x,0.24,z);oval(leg,fur,0,-0.075,0,0.067,0.092,0.064);
    oval(leg,cream,0,-0.178,0.024,0.074,0.068,0.10);batch(leg);legs.push(leg);
  }
  batch(head);batch(core);batch(tail);
  root.userData.pet={body,head,legs,tail,type};return root;
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
