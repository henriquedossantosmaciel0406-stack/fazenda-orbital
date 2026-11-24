// Acabamentos específicos de cada máquina, agrupados com a estrutura estática.
import * as THREE from 'three';
import { geo, mat } from './world.js';
const copper=0xBF7251, cream=0xFFE6AD, ink=0x344A51, jade=0x48B79A, blue=0x729EB9;
export function finishStructure(g,type) {
  function piece(shape,color,x,y,z){ const m=new THREE.Mesh(shape,mat(color)); m.position.set(x,y,z);g.add(m);return m; }
  const box=(x,y,z,w,h,d,c)=>piece(geo('box',w,h,d),c,x,y,z);
  const tube=(x,y,z,r,h,c)=>piece(geo('cyl',r,r,h,10),c,x,y,z);
  const band=(x,y,z,r,c)=>{ const m=piece(geo('tor',r,0.055,5,16),c,x,y,z);m.rotation.x=Math.PI/2;return m;};
  const fin=(x,y,z,c)=>{ const m=piece(geo('ico',1,0),c,x,y,z);m.scale.set(0.18,0.7,0.48);return m; };
  function dial(x,y,z,r){
    const gauge=tube(x,y,z,r,0.10,cream);gauge.rotation.x=Math.PI/2;
    const pointer=box(x+r*0.12,y+r*0.12,z+0.06,r*0.15,r*0.92,0.04,copper);pointer.rotation.z=-0.65;
  }
  switch(type){
    case 'rain':
      for(let i=0;i<8;i++){const a=i*Math.PI/4;const petal=fin(Math.cos(a)*1.25,2.70,Math.sin(a)*1.25,blue);petal.rotation.set(0,-a,-0.52);}
      break;
    case 'silo':
      for(const x of [-0.29,0.29]) tube(x,2.01,1.48,0.046,3.6,copper);
      for(let i=0;i<9;i++) box(0,0.44+i*0.39,1.50,0.63,0.07,0.1,cream);
      break;
    case 'battery':
      for(const x of [-0.86,0.86]){tube(x,1.35,0.61,0.23,1.9,copper);for(let i=0;i<5;i++) band(x,0.70+i*0.31,0.61,0.26,cream);}
      break;
    case 'lab':
      for(const x of [-1,1]){ const panel=box(x*2.22,2.8,0,1.45,0.13,1.9,blue); panel.rotation.z=x*0.26; for(let i=0;i<4;i++)box(x*2.22,2.91,(i-1.5)*0.43,1.4,0.035,0.035,cream).rotation.z=x*0.26;}
      break;
    case 'factory':
      box(-0.6,0.53,2.56,1.7,0.38,1.1,ink);
      for(let i=0;i<7;i++)box(-1.29+i*0.23,0.74,2.56,0.10,0.08,1.04,copper);
      dial(0.86,1.48,2.48,0.39); break;
    case 'tower':
      for(let i=0;i<3;i++){const a=i*2.094;fin(Math.cos(a)*0.65,5.68,Math.sin(a)*0.65,copper).rotation.y=-a;}
      break;
    case 'reactor':
      for(let i=0;i<3;i++){const a=i*2.094; band(Math.cos(a)*1.55,2.2,Math.sin(a)*1.55,0.32,copper);band(Math.cos(a)*1.55,1.8,Math.sin(a)*1.55,0.29,cream);}
      break;
    case 'station':
      box(0,1.02,0.25,1.05,0.65,0.53,ink);dial(0,1.04,0.55,0.24);break;
    case 'sprinkler': case 'rotary': case 'drip': case 'cloud': {
      const r={sprinkler:0.39,rotary:0.62,drip:0.50,cloud:0.57}[type];
      for(let i=0;i<3;i++){const a=i*2.094;box(Math.sin(a)*r,0.16,Math.cos(a)*r,0.21,0.26,r,cream).rotation.y=a;}
      tube(0,0.58,r*0.68,0.15,0.5,copper);dial(0,0.78,r,0.19);break;
    }
    case 'bench':
      for(const x of [-0.98,0.98]){box(x,0.81,0,0.13,0.12,0.78,copper);tube(x,0.66,0.23,0.05,0.36,ink);}break;
    case 'lamp':
      for(let i=0;i<4;i++){const a=i*Math.PI/2;fin(Math.cos(a)*0.27,3.48,Math.sin(a)*0.27,copper).scale.set(0.08,0.47,0.24);}break;
    case 'fountain': case 'crystalGarden':
      for(let i=0;i<8;i++){const a=i*Math.PI/4,r=type==='fountain'?1.48:1.62;const tile=box(r*Math.sin(a),0.38,r*Math.cos(a),0.49,0.14,0.20,i%2?cream:jade);tile.rotation.y=a;}break;
    case 'sculpture':
      tube(0,0.33,0,0.98,0.18,cream);dial(0,0.54,0.76,0.18);break;
    case 'planter':
      for(let i=0;i<9;i++){const a=i*0.698;box(Math.sin(a)*0.94,0.32,Math.cos(a)*0.94,0.28,0.26,0.1,i%2?cream:jade).rotation.y=a;}break;
    case 'windmill':
      for(const x of [-0.48,0.48]) box(x,2.32,0.96,0.42,0.57,0.15,blue).rotation.y=x*0.65;
      break;
    case 'scarecrow':
      box(0,2.12,0.25,0.57,0.15,0.23,copper);box(0.2,1.93,0.33,0.17,0.38,0.09,copper).rotation.z=0.32;break;
    case 'pond':
      for(let i=0;i<6;i++){const x=-1.41+(i%3)*0.16,z=-0.58+Math.floor(i/3)*0.26,h=0.65+i*0.05;tube(x,h*0.5+0.32,z,0.023,h,jade);tube(x,h+0.33,z,0.065,0.26,copper);}break;
    case 'balloon': {
      const air=g.userData.spin[0].obj;
      for(let i=0;i<8;i++) {
        const rib=new THREE.Mesh(geo('sph',1.512,3,12,i*Math.PI/4,0.28,0.06,3.04),mat(i%2?cream:jade));
        rib.position.y=2.1;rib.scale.y=1.15;air.add(rib);
      } break;
    }
    case 'flag':
      for(const x of [-0.34,0.34]) box(x,0.31,0,0.10,0.75,0.13,copper).rotation.z=-Math.sign(x)*0.58;break;
    case 'droneStatue':
      for(let i=0;i<3;i++)box(0,0.8+i*0.12,0,1.12-i*0.24,0.10,1.12-i*0.24,i%2?cream:ink);break;
  }
}

export function shopfront(g,market){
  const timber=mat(0xA86942),gold=mat(0xF4CD83);
  for(let i=0;i<3;i++) {
    const crate=new THREE.Group();crate.position.set((i-1)*1.05,1.62,market?1.45:-1.45);
    const b=new THREE.Mesh(geo('box',0.91,0.15,0.67),timber);crate.add(b);
    for(const side of [-1,1]){
      const rail=new THREE.Mesh(geo('box',0.96,0.18,0.07),gold);rail.position.set(0,0.13,side*0.32);crate.add(rail);
    }
    for(let j=0;j<5;j++){const produce=new THREE.Mesh(geo(market?'sph':'ico',0.135,...(market?[8,6]:[0])),mat([0xF38262,0xEABD50,0x82BA69][i]));produce.position.set((j%3-1)*0.24,0.22,(j%2-0.5)*0.25);produce.scale.y=market?0.9:1.45;crate.add(produce);}
    g.add(crate);
  }
}
export function entryPorch(g,z,color) {
  const wood=mat(0x855F4D), panel=mat(color), trim=mat(0xFFE1A3);
  const door=new THREE.Mesh(geo('box',1.23,2.17,0.19),wood);door.position.set(0,1.42,z);g.add(door);
  const knob=new THREE.Mesh(geo('sph',0.075,8,6),trim);knob.position.set(0.41,1.38,z+0.16);g.add(knob);
  const window=new THREE.Mesh(geo('cyl',0.27,0.27,0.10,12),mat(0x91D4D4));
  window.rotation.x=Math.PI/2;window.position.set(0,1.95,z+0.11);g.add(window);
  for(const side of [-1,1]){
    const jamb=new THREE.Mesh(geo('box',0.13,2.21,0.22),trim);jamb.position.set(side*0.64,1.41,z);g.add(jamb);
  }
  const canopy=new THREE.Mesh(geo('box',2.42,0.21,1.46),panel);canopy.position.set(0,2.69,z+0.21);canopy.rotation.x=0.1;g.add(canopy);
  for(const x of [-1,1]){const post=new THREE.Mesh(geo('cyl',0.08,0.12,2.31,8),trim);post.position.set(x,1.43,z+0.72);g.add(post);}
  const stair=new THREE.Mesh(geo('box',2.28,0.28,1.2),trim);stair.position.set(0,0.17,z+0.44);g.add(stair);
}
