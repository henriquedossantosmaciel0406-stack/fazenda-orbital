import {CANS,canLevel} from './gear.js';
import {state} from './state.js';
import * as THREE from 'three';
import {mergeGroupStatic} from './optimize.js';
import { mat,geo } from './world.js';

// Regador em primeira pessoa. O ponto na ponta do bico origina o jato.
export function canModel(level){
  const can=new THREE.Group(), palette=CANS[level-1];
  function piece(shape,color,x,y,z) {
    const m=new THREE.Mesh(shape,mat(color));m.position.set(x,y,z);can.add(m);return m;
  }
  piece(geo('cyl',0.34,0.29,0.43,12),palette.body,0,0,0).scale.z=0.88;
  piece(geo('cyl',0.35,0.35,0.047,12),palette.trim,0,0.20,0).scale.z=0.88;
  piece(geo('cyl',0.28,0.28,0.026,12),0x305465,0,0.227,0).scale.z=0.88;
  const grip=piece(geo('tor',0.205,0.048,6,15),palette.trim,0.31,0.14,0.03);grip.scale.y=1.27;
  const nozzle=piece(geo('cyl',0.059,0.088,0.49,8),palette.body,-0.31,0.13,-0.19);
  const direction=new THREE.Vector3(-0.63,0.42,-0.65).normalize();
  nozzle.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
  const head=piece(geo('cyl',0.125,0.069,0.10,10),palette.trim,0,0,0);
  head.position.copy(nozzle.position).addScaledVector(direction,0.27);head.quaternion.copy(nozzle.quaternion);
  for(let i=0;i<level-1;i++){
    const ring=piece(geo('tor',0.31+i*0.006,0.014,5,16),palette.trim,0,-0.14+i*0.068,0);ring.rotation.x=Math.PI/2;ring.scale.y=0.88;
  }
  if(level>=3){const badge=piece(geo(level===5?'oct':'sph',0.083,...(level===5?[0]:[8,5])),palette.trim,0,0.05,0.294);badge.scale.z=0.4;}
  if(level>=4){const arch=piece(geo('tor',0.237,0.032,6,14,Math.PI),palette.trim,0,0.218,0);arch.rotation.y=0.2;}
  if(level>=6){
    for(const side of [-1,1]){
      const pod=piece(geo('cyl',.054,.069,.23,8),palette.trim,side*.24,.06,.19);
      pod.rotation.z=-side*.21;
    }
    if(level===7)for(let i=0;i<3;i++)piece(geo('cone',.062,.15,5),palette.trim,(i-1)*.122,.26,-.135);
    if(level===8){const orbit=piece(geo('tor',.38,.021,6,20),palette.trim,0,.02,0);orbit.rotation.set(1.1,0,-.35);}
  }
  can.userData.tip=head;return can;
}
export function createWateringCan(camera) {
  const hand=new THREE.Group();camera.add(hand);hand.visible=false;
  hand.position.set(0.30,-0.27,-0.58);hand.scale.setScalar(0.39);
  let level=canLevel(state),can=canModel(level);can.rotation.y=0.12;hand.add(can);
  const glove=new THREE.Group();
  glove.rotation.y=can.rotation.y;
  const shell=0xf3edda, seam=0x324959, cuff=0x30848a;
  const axis=new THREE.Vector3(0,1,0);
  function pad(color,x,y,z,w,h,d){
    const mesh=new THREE.Mesh(geo('sph',1,12,8),mat(color));
    mesh.position.set(x,y,z);mesh.scale.set(w,h,d);glove.add(mesh);
    return mesh;
  }
  function segment(color,start,end,radius,thickness=1){
    const a=new THREE.Vector3(...start),b=new THREE.Vector3(...end);
    const center=a.clone().lerp(b,.5), direction=b.sub(a);
    const mesh=pad(color,center.x,center.y,center.z,radius,direction.length()/2+radius*.65,radius*thickness);
    mesh.quaternion.setFromUnitVectors(axis,direction.normalize());
  }
  segment(cuff,[.68,.02,.21],[.96,-.22,.56],.125);
  segment(seam,[.65,.05,.16],[.72,-.01,.25],.136);
  segment(0xf8b653,[.67,.036,.192],[.69,.019,.218],.134);
  pad(shell,.584,.111,.099,.107,.155,.095).rotation.z=-.18;
  pad(0x74b8ba,.619,.123,.173,.065,.097,.028).rotation.z=-.18;
  // Four bent fingers follow the outer arc of the handle.
  for(let i=0;i<4;i++){
    const y=.224-i*.058, x=.31+.205*Math.sqrt(1-((y-.14)/.26)**2);
    const radius=.033-i*.0015;
    segment(shell,[.59,y,.09],[x+.007,y,.099],radius);
    segment(shell,[x+.007,y,.099],[x-.045,y-.008,.058],radius);
    segment(seam,[x-.045,y-.008,.058],[x-.049,y-.017,.02],radius*.9);
  }
  segment(shell,[.614,.16,.044],[.568,.232,-.019],.048);
  segment(shell,[.568,.232,-.019],[.494,.247,-.002],.043);
  segment(shell,[.588,.16,.073],[.551,.235,.018],.046);
  segment(shell,[.551,.235,.018],[.486,.226,-.015],.038);
  mergeGroupStatic(glove);
  hand.add(glove);
  let elapsed=1,raised=0; const tip=new THREE.Vector3();
  return {
    pour(){elapsed=0;hand.visible=true;return can.userData.tip.getWorldPosition(tip);},
    update(dt,visible,time){
      if(level!==canLevel(state)){
        hand.remove(can);level=canLevel(state);can=canModel(level);can.rotation.y=0.12;hand.add(can);
      }
      hand.visible=visible;elapsed+=dt;
      if(!visible){raised=0;return;}
      raised+=(1-raised)*(1-Math.exp(-dt*18));
      hand.rotation.z=0.08+0.40*Math.sin(Math.min(elapsed/0.62,1)*Math.PI);
      hand.position.y=-0.27-(1-raised)*.12+Math.sin(time*1.7)*0.003;
      const halfWidth=.58*Math.tan(camera.fov*Math.PI/360)*camera.aspect;
      hand.scale.setScalar(Math.min(.39,halfWidth*.88));
      hand.position.x=Math.min(.30,halfWidth*.48);
    }
  };
}
