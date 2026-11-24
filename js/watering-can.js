import * as THREE from 'three';
import { mat,geo } from './world.js';

// Regador em primeira pessoa. O ponto na ponta do bico origina o jato.
export function createWateringCan(camera) {
  const hand=new THREE.Group(), can=new THREE.Group();
  camera.add(hand); hand.add(can); hand.visible=false;
  hand.position.set(0.30,-0.27,-0.58);hand.scale.setScalar(0.39);
  can.rotation.y=0.12;
  function piece(shape,color,x,y,z) {
    const m=new THREE.Mesh(shape,mat(color));m.position.set(x,y,z);can.add(m);return m;
  }
  piece(geo('cyl',0.34,0.29,0.43,12),0x4FABA7,0,0,0).scale.z=0.88;
  piece(geo('cyl',0.35,0.35,0.047,12),0xE4AF71,0,0.20,0).scale.z=0.88;
  piece(geo('cyl',0.28,0.28,0.026,12),0x305465,0,0.227,0).scale.z=0.88;
  const grip=piece(geo('tor',0.205,0.048,6,15),0xCD8F58,0.31,0.14,0.03);grip.scale.y=1.27;
  const nozzle=piece(geo('cyl',0.059,0.088,0.49,8),0x488F8B,-0.31,0.13,-0.19);
  const direction=new THREE.Vector3(-0.63,0.42,-0.65).normalize();
  nozzle.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
  const head=piece(geo('cyl',0.125,0.069,0.10,10),0xF2CC87,0,0,0);
  head.position.copy(nozzle.position).addScaledVector(direction,0.27);head.quaternion.copy(nozzle.quaternion);
  let elapsed=1; const tip=new THREE.Vector3();
  return {
    pour(){elapsed=0;return head.getWorldPosition(tip);},
    update(dt,visible,time){
      hand.visible=visible;elapsed+=dt;
      if(!visible)return;
      can.rotation.z=0.08+0.40*Math.sin(Math.min(elapsed/0.62,1)*Math.PI);
      hand.position.y=-0.27+Math.sin(time*1.7)*0.003;
    }
  };
}
