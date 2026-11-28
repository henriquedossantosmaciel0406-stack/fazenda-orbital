import * as THREE from 'three';
import {geo,mat} from './world.js';

export const prankNames={saucer:'Abdução da vaca inflável',carrots:'Chuva de cenouras',mushrooms:'Brotos dançantes'};
let active=null;
export function endPrank(){
  active?.group.removeFromParent();
  active=null;
}
function piece(parent,shape,color,x,y,z){
  const mesh=new THREE.Mesh(shape,mat(color));mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}
function cow(parent){
  const g=new THREE.Group();parent.add(g);
  piece(g,geo('box',1.4,.7,.7),0xffeddb,0,0,0);
  piece(g,geo('box',.38,.3,.03),0x323149,-.22,.04,.36);
  piece(g,geo('box',.62,.62,.62),0xffeddb,.79,.27,0);
  piece(g,geo('box',.29,.24,.57),0xfba3aa,1.1,.13,0);
  for(const z of [-.24,.24]){
    piece(g,geo('cone',.1,.25,5),0xffd368,.76,.66,z);
    piece(g,geo('box',.11,.12,.06),0x323149,.91,.33,z*1.3);
    for(const x of [-.45,.48])piece(g,geo('box',.19,.38,.18),0x49435a,x,-.47,z);
  }
  return g;
}
export function startPrank(kind,scene,camera,plots){
  if(!Object.hasOwn(prankNames,kind))return;
  endPrank();
  const group=new THREE.Group();
  const front=camera.getWorldDirection(new THREE.Vector3());front.y=0;front.normalize();
  const center=camera.position.clone().addScaledVector(front,7);
  const bed=plots.filter(p=>p.available&&Math.hypot(p.x-center.x,p.z-center.z)<5)
    .sort((a,b)=>Math.hypot(a.x-center.x,a.z-center.z)-Math.hypot(b.x-center.x,b.z-center.z))[0];
  group.position.set(bed?.x??center.x,0,bed?.z??center.z);scene.add(group);
  let animate;
  if(kind==='saucer'){
    const ship=new THREE.Group();group.add(ship);
    piece(ship,geo('cyl',.85,1.7,.32,14),0x8296c0,0,0,0);
    piece(ship,geo('sph',.75,10,8),0x84eee6,0,.2,0).scale.y=.63;
    for(let i=0;i<8;i++)piece(ship,geo('ico',.12,0),0xffe580,1.31*Math.cos(i*Math.PI/4),-.1,1.31*Math.sin(i*Math.PI/4));
    const balloon=cow(group);
    animate=t=>{ship.position.y=4.3+.2*Math.sin(t*2);ship.rotation.y=t;balloon.rotation.y=.6*t;balloon.position.y=1+2.3*(1-Math.cos(t*.9))/2;};
  }else{
    const falling=kind==='carrots',props=[];
    for(let i=0;i<(falling?14:8);i++){
      const g=new THREE.Group();group.add(g);props.push(g);
      const angle=2.4*i,radius=1+Math.sqrt(i);
      g.position.set(Math.cos(angle)*radius,0,Math.sin(angle)*radius);
      if(falling){
        piece(g,geo('cone',.23,.85,6),0xff9043,0,0,0).rotation.z=Math.PI;
        for(const s of [-1,1])piece(g,geo('cone',.09,.4,4),0x75ce62,.07*s,.51,0).rotation.z=-s*.4;
      }else{
        piece(g,geo('cyl',.16,.24,.55,8),0xffe4b2,0,.32,0);
        piece(g,geo('sph',.63,10,6),i%2?0xe877ac:0x7bd6c4,0,.69,0).scale.y=.52;
        for(const x of [-.086,.086])piece(g,geo('box',.055,.079,.045),0x423348,x,.39,.18);
      }
    }
    animate=t=>props.forEach((g,i)=>{
      g.position.y=falling?7-((2.7*t+i*1.41)%7):.45*Math.abs(Math.sin(t*2.4+i));
      g.rotation.z=(falling?.36:.24)*Math.sin(t*2+i);
      g.rotation.y=falling?t+i:Math.sin(t+i);
    });
  }
  animate(0);active={group,animate,start:performance.now()};
}
export function tickPrank(){
  if(!active)return;
  const t=(performance.now()-active.start)/1000;
  if(t>=10)endPrank();else active.animate(t);
}
