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
const coats={cat:0x718298,dog:0xe3a05c,rabbit:0xcebedf,fox:0xd96c3b,turtle:0x8fbc89,axolotl:0xf7b8c5};
// Seções transversais esculpem a silhueta ao longo do focinho, corpo ou cauda.
// Cada anel contém [z, altura do centro, meia largura, meia altura].
function profile(parent,color,rings,sides=10){
  const vertices=[],indices=[];
  for(const [z,y,w,h] of rings){
    for(let i=0;i<sides;i++){
      const a=2*Math.PI*i/sides;
      vertices.push(w*Math.cos(a),y+h*Math.sin(a),z);
    }
  }
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<sides;i++){
    const a=j*sides+i,b=j*sides+(i+1)%sides;
    indices.push(a,b,a+sides,b,b+sides,a+sides);
  }
  const last=(rings.length-1)*sides;
  for(let i=1;i<sides-1;i++)indices.push(0,i+1,i,last,last+i,last+i+1);
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geom.setIndex(indices);geom.computeVertexNormals();
  return piece(parent,geom,color,0,0,0);
}
const anatomies={
  cat:{head:[0,.59,.24],tail:[0,.38,-.31],torso:[[-.37,.34,.08,.11],[-.21,.34,.20,.22],[.08,.42,.165,.21],[.23,.48,.14,.16]]},
  dog:{head:[0,.49,.29],tail:[0,.35,-.40],torso:[[-.42,.32,.12,.12],[-.26,.32,.24,.20],[.17,.33,.22,.21],[.30,.39,.17,.19]]},
  rabbit:{head:[0,.49,.25],tail:[0,.30,-.31],torso:[[-.34,.29,.11,.14],[-.19,.34,.28,.29],[.04,.34,.21,.24],[.20,.38,.14,.19]]},
  fox:{head:[0,.55,.32],tail:[0,.34,-.36],torso:[[-.40,.34,.09,.12],[-.24,.37,.19,.19],[.05,.42,.15,.17],[.26,.47,.19,.22]]},
  turtle:{head:[0,.24,.39],tail:[0,.19,-.39],torso:[[-.43,.22,.10,.08],[-.26,.23,.31,.15],[.12,.23,.32,.15],[.36,.22,.18,.10]]},
  axolotl:{head:[0,.23,.32],tail:[0,.18,-.32],torso:[[-.38,.18,.06,.07],[-.15,.18,.15,.13],[.13,.19,.19,.14],[.33,.19,.16,.10]]}
};
export function makePet(type){
  const root=new THREE.Group(),body=pivot(root,0,0,0),core=pivot(body,0,0,0);
  const spec=anatomies[type],head=pivot(body,...spec.head),tail=pivot(body,...spec.tail);
  const fur=coats[type],legs=[],low=type==='turtle'||type==='axolotl';
  profile(core,fur,spec.torso);
  const wide=type==='axolotl'?.33:type==='turtle'?.16:.24;
  profile(head,fur,[[-.18,.09,wide*.45,.13],[-.08,.10,wide,.21],[.11,.085,wide*.96,low?.13:.18],[.21,.045,wide*.65,.10]]);
  eyes(head,.13,.169,wide*.63,.037);
  function ear(side,height,width,tilt){
    const e=pivot(head,side*.145,.215,-.045);e.rotation.z=-side*tilt;
    const cone=geo('cone',1,1,4);
    piece(e,cone,fur,0,height*.43,0,width,height,.087);
    piece(e,cone,0xbb838e,0,height*.40,.058,width*.57,height*.64,.035);
  }
  if(!low){
    const muzzle=type==='fox'?.33:type==='dog'?.285:.225;
    profile(head,cream,[[.14,.035,.14,.086],[.196,.026,.139,.078],[muzzle,.018,.047,.037]]);
    oval(head,ink,0,.045,muzzle,.047,.031,.026);
  }
  if(type==='cat'){
    for(const side of [-1,1]){
      ear(side,.25,.12,.12);
      for(let i=0;i<2;i++)oval(head,cream,side*.179,.04+i*.049,.155,.079,.012,.014).rotation.z=side*.20;
    }
    for(let i=0;i<3;i++)oval(head,ink,(i-1)*.064,.239,.109,.018,.063,.021);
    const curl=profile(tail,fur,[[-.40,.39,.046,.053],[-.33,.49,.066,.068],[-.22,.42,.072,.08],[-.16,.19,.078,.10],[0,0,.079,.08]]);
    curl.rotation.y=.32;
  }else if(type==='dog'){
    for(const side of [-1,1]){
      ear(side,.33,.15,.34);
      oval(head,cream,side*.127,.196,.143,.046,.025,.023);
    }
    oval(head,cream,0,.16,.162,.043,.10,.028);
    oval(core,0x387980,0,.45,.21,.208,.059,.176);
    piece(core,geo('cone',1,1,3),0x55a6a0,0,.34,.32,.109,.23,.044).rotation.x=Math.PI;
    oval(tail,cream,0,.09,-.045,.125,.125,.10);
  }else if(type==='rabbit'){
    for(const side of [-1,1]){
      const e=pivot(head,side*.115,.21,-.035);e.rotation.z=-side*(side<0?.23:1.16);
      oval(e,fur,0,.25,0,.091,.30,.061);oval(e,0xe895af,0,.27,.043,.052,.21,.03);
      oval(core,fur,side*.19,.27,-.17,.14,.225,.22);
    }
    oval(tail,cream,0,.055,-.04,.124,.138,.125);
  }else if(type==='fox'){
    for(const side of [-1,1]){
      ear(side,.31,.118,.15);
      piece(head,geo('cone',1,1,4),cream,side*.196,.044,.075,.09,.21,.10).rotation.z=side*2.16;
    }
    profile(tail,fur,[[-.49,.22,.127,.14],[-.31,.12,.195,.18],[-.14,.05,.131,.13],[0,0,.068,.08]]);
    profile(tail,cream,[[-.69,.36,.015,.022],[-.57,.30,.089,.095],[-.49,.22,.127,.14]]);
  }else if(type==='turtle'){
    oval(core,0xc7c694,0,.26,-.04,.345,.105,.414);
    profile(core,0x39796c,[[-.44,.31,.025,.03],[-.27,.38,.255,.17],[0,.42,.328,.231],[.20,.37,.27,.16],[.355,.30,.08,.04]]);
    for(let i=0;i<5;i++){
      const a=i*2.39996;
      const plate=piece(core,geo('cyl',1,1,.048,6),i%2?0xa2bb70:0x7ea578,.16*Math.cos(a),.581,-.04+.19*Math.sin(a),.11,1,.125);
      plate.rotation.z=-.33*Math.cos(a);plate.rotation.x=.34*Math.sin(a);
    }
    profile(tail,fur,[[-.22,-.041,.012,.017],[0,0,.093,.061]]);
  }else{
    for(const side of [-1,1])for(let i=0;i<3;i++){
      const gill=pivot(head,side*.22,.052+i*.048,-.083+i*.015);gill.rotation.z=-side*(1.42-i*.38);
      oval(gill,0xd86390,0,.13,0,.036,.163,.04);
      for(let j=0;j<3;j++)for(const sign of [-1,1])
        oval(gill,0xff95af,sign*.036,.095+.057*j,0,.022,.052,.024).rotation.z=-sign*.73;
    }
    profile(tail,0xf294ac,[[-.49,.056,.012,.03],[-.31,.089,.046,.11],[-.15,.057,.084,.163],[0,0,.10,.094]]);
    for(let i=0;i<4;i++)oval(core,cream,0,.32-i*.014,.11-i*.093,.042,.018,.031);
  }
  for(const side of [-1,1])for(const end of [-1,1]){
    const height=low?.15:type==='dog'?.19:.26;
    const leg=pivot(body,side*(low?.204:.147),height,end*(type==='dog'?.248:.185)-.035);
    const paw=type==='fox'?ink:low?fur:cream;
    oval(leg,fur,low?side*.043:0,-height*.34,0,.065,height*.57,.076);
    oval(leg,paw,low?side*.083:0,-height+.055,.041,type==='rabbit'?.095:.077,.058,type==='rabbit'&&end<0?.162:.097);
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
  const pace=Math.min(1,speed/2),step=Math.sin(t*(data.type==='turtle'?6:12));
  data.body.position.y=Math.abs(step)*pace*(data.type==='rabbit'?0.18:0.046);
  data.tail.rotation.y=Math.sin(t*(data.type==='dog'?11:3))*(data.type==='turtle'?.09:.31);
  data.head.rotation.x=Math.sin(t*2)*0.065;
  data.legs.forEach((leg,i)=>{const phase=data.type==='rabbit'?(i%2?1:-1):(i===1||i===2?-1:1);leg.rotation.x=phase*step*pace*.60;});
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
