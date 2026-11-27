import * as THREE from 'three';
import {geo,mat} from './world.js';
import {mergeGroupStatic} from './optimize.js';
import {planetAt} from './planets.js';

function sculpt(group,shape,color,x,y,z){
  const mesh=new THREE.Mesh(shape,mat(color));mesh.position.set(x,y,z);
  mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
}
export function planetGarden(rank){
  const garden=new THREE.Group(),planet=planetAt(rank);
  if(!rank)return garden;
  const type=(rank-1)%3;
  for(let i=0;i<6;i++){
    const x=-52+i*7.4,z=-47.8-1.4*Math.sin(i*1.8);
    const stone=(shape,color,dx,y,dz)=>sculpt(garden,shape,color,x+dx,y,z+dz);
    const height=2.1+(i*7%5)*.31;
    if(type===0){
      for(let j=-1;j<=1;j++){const shard=stone(geo('oct',1,0),j===0?planet.glow:planet.stone,j*.52,height*.44,0);
        shard.scale.set(.56,height*(j===0?1:.56),.67);shard.rotation.z=-j*.32;}
    }else if(type===1){
      stone(geo('cyl',.79,1.25,height,6),planet.stone,0,height/2,0);
      stone(geo('cyl',1.28,1.65,.48,7),planet.glow,0,height,0).rotation.z=.12;
    }else{
      stone(geo('cyl',.16,.35,height,8),planet.stone,0,height/2,0);
      stone(geo('sph',1,12,7),planet.glow,0,height,0).scale.set(1.35,.36,1.35);
      for(let j=0;j<3;j++)stone(geo('sph',.13,6,4),0xffecd7,Math.sin(j*2)*.72,height+.30,Math.cos(j*2)*.72);
    }
  }
  mergeGroupStatic(garden);return garden;
}
export function merchantWagon(){
  const cart=new THREE.Group(), timber=0x694539,trim=0xedb460;
  function part(shape,color,x,y,z){return sculpt(cart,shape,color,x,y,z);}
  const box=(w,h,d,c,x,y,z)=>part(geo('box',w,h,d),c,x,y,z);
  box(4.3,.35,2.35,timber,0,.97,0);
  box(3.9,.92,.18,0x507e79,0,1.48,.98);box(4.3,.16,.75,trim,0,1.98,1);
  for(const x of [-1.58,1.58])for(const z of [-1.23,1.23]){
    part(geo('tor',.65,.14,6,16),timber,x,.8,z);
    part(geo('cyl',.14,.14,.22,8),trim,x,.8,z).rotation.x=Math.PI/2;
    for(let i=0;i<4;i++)box(.085,1.2,.08,trim,x,.8,z).rotation.z=i*Math.PI/4;
    box(.14,2.12,.14,timber,x,2.14,z*.82);
  }
  for(let i=0;i<7;i++){
    const c=i%2?0xf4cd91:0xb84f62,x=(i-3)*.61;
    box(.62,.17,2.85,c,x,3.21,0);box(.62,.34,.12,c,x,3.08,1.38);
  }
  for(let i=0;i<3;i++){const x=(i-1)*.95;
    box(.78,.22,.52,timber,x,2.15,.98);
    for(let j=-1;j<=1;j++)part(geo('oct',.17,0),[0x70f4cd,0xffb557,0xdca4ff][i],x+.19*j,2.37,1);
  }
  part(geo('sph',.34,10,8),0x80c59a,0,2.58,-.26);
  for(const x of [-.15,.15])part(geo('sph',.075,8,6),0x293447,x,2.62,.027);
  mergeGroupStatic(cart);cart.position.set(17,0,25);cart.visible=false;return cart;
}
