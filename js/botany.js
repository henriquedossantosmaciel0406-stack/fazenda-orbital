// Modelos botânicos montados uma vez por estágio e fundidos pelo cache do jogo.
import * as THREE from 'three';
import { geo, mat } from './world.js';
import { CONFIG } from './config.js';

const TAU = Math.PI * 2, spiral = 2.399963;
const up = new THREE.Vector3(0, 1, 0);
const blend = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

// Folha fechada com nervura, borda ondulada e ponta recurvada.
function leafGeometry(kind='blade') {
  const vertices = [], indices = [];
  for (let row = 0; row <= 8; row++) {
    const t=row/8, arch=Math.sin(Math.PI*t);
    const lobes=kind==='lobed'?1+.28*Math.cos(row*Math.PI*.72):1;
    const width=.005+arch**(kind==='petal'?.55:.9)*(kind==='petal'?.50+t:1.08-.24*t)*lobes;
    const y=(kind==='petal'?.30:.22)*arch-(kind==='blade'?.26:.08)*t*t;
    const rim = y + (row % 2 ? 0.06 : 0) * width;
    vertices.push(-width,rim,t, 0,y+0.16*width,t, width,rim,t, 0,y-0.045*width,t);
    if (row < 8) for (let j=0; j<4; j++) {
      const i=4*row+j, k=4*row+(j+1)%4;
      indices.push(i,i+4,k, k,i+4,k+4);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices,3)); g.setIndex(indices);
  g.computeVertexNormals(); return g;
}
const blades={blade:leafGeometry(),lobed:leafGeometry('lobed'),petal:leafGeometry('petal')};
// A mesma muda mantém sua orientação após salvar, crescer ou ser vista por um visitante.
export function varySpecimen(mesh,x,z) {
  const seed=Math.sin(x*12.9898+z*78.233)*43758.5453;
  const fraction=seed-Math.floor(seed);
  mesh.rotation.y=fraction*TAU;
  mesh.scale.set(0.95+fraction*0.10,0.91+(1-fraction)*0.18,0.97+fraction*0.06);
}
function tools(parent,kind='blade') {
  function part(shape, color, x,y,z, sx=1,sy=1,sz=1) {
    const m = new THREE.Mesh(shape, mat(color)); m.position.set(x,y,z); m.scale.set(sx,sy,sz); parent.add(m); return m;
  }
  function leaf(x,y,z, angle,length,width,lift,color) {
    const m = part(blades[kind],color,x,y,z,width,length,length);
    m.rotation.order='YXZ'; m.rotation.set(-lift,angle,0,'YXZ'); return m;
  }
  function rod(a,b,r,color, taper=0.7) {
    const dir=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const m=part(geo('cyl',taper,1,1,6),color,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,r,dir.length(),r);
    m.quaternion.setFromUnitVectors(up,dir.normalize()); return m;
  }
  const oval=(x,y,z,w,h,d,c)=>part(geo('sph',1,10,7),c,x,y,z,w,h,d);
  const gem=(x,y,z,w,h,d,c)=>part(geo('oct',1,0),c,x,y,z,w,h,d);
  return {part,leaf,rod,oval,gem};
}

export function fillCrop(P,key,g,ready,sick,mutation) {
  const group = new THREE.Group(); P.add(group);
  const leafKind=['flower','lotus'].includes(key)?'petal':['lettuce','strawberry','grape','pumpkin','melon','tomato'].includes(key)?'lobed':'blade';
  const {leaf,rod,oval,gem,part}=tools(group,leafKind);
  const base=CONFIG.crops[key].color;
  const col=sick ? 0xB99550 : mutation ? blend(base,mutation.color,0.65) : base;
  const greens={lettuce:0x58A540,carrot:0x3B9363,corn:0x39987D,strawberry:0x467755,tomato:0x45744F,pepper:0x277C64,grape:0x508F84,flower:0x5A8B70,lotus:0x2C938A,pumpkin:0x5B874D,melon:0x389775,mushroom:0x6E737F};
  const fern=sick?0x817346:greens[key],mint=sick?0xADA053:blend(fern,0xEBF997,.48);
  const scale=0.32+0.68*g, ripe=g>0.55;
  group.scale.setScalar(scale);
  const ring=(x,y,z,n,r,w,pitch,color,phase=0)=> {
    for(let i=0;i<n;i++) leaf(x,y,z,i*TAU/n+phase,r,w,pitch,i%2 ? color : blend(color,0xfff1b2,0.14));
  };
  function blossom(x,y,z,r,color) {
    ring(x,y,z,5,r,r*0.33,0.2,color); oval(x,y+0.025,z,r*0.22,r*0.18,r*0.22,0xFFD077);
  }
  if (key==='lettuce') {
    for(let j=0;j<3;j++) ring(0,0.08+j*0.11,0,9-j,1.1-j*0.22,0.32-j*0.035,0.17+j*0.43,blend(col,0xe4ff97,j*0.28),j*0.51);
  } else if (key==='carrot') {
    for(let j=0;j<3;j++) {
      const x=(j-1)*0.58,z=j%2*0.34-0.18;
      const root=part(geo('cone',1,1,9),col,x,0.12,z,0.22,0.56,0.22); root.rotation.x=Math.PI;
      oval(x,0.39,z,0.22,0.1,0.22,col);
      for(let i=0;i<5;i++) {
        const a=i*spiral+j, dx=Math.sin(a),dz=Math.cos(a);
        rod([x,0.42,z],[x+dx*0.34,1.02,z+dz*0.34],0.024,fern);
        for(let k=1;k<=3;k++) for(const side of [-1,1]) leaf(x+dx*k*0.08,0.45+k*0.14,z+dz*k*0.08,a+side*0.95,0.24,0.045,0.65,mint);
      }
    }
  } else if (key==='corn') {
    rod([0,0,0],[0,2.3,0],0.09,fern);
    for(let i=0;i<8;i++) leaf(0,0.18+i*0.22,0,i*spiral,0.95-i*0.05,0.13,0.5,mint);
    for(const side of [-1,1]) {
      const x=side*0.2,y=1.22+side*0.26;
      if(ripe) for(let k=0;k<24;k++) { const a=k*TAU/6;gem(x+Math.cos(a)*0.106,y+Math.floor(k/6)*0.105,Math.sin(a)*0.106,0.086,0.11,0.086,col); }
      leaf(x,y-0.16,0,side*1.6,0.62,0.17,1.18,fern);
    }
    for(let i=0;i<5;i++) rod([0,2.2,0],[0.24*Math.sin(i*spiral),2.54,0.24*Math.cos(i*spiral)],0.026,0xF6C670);
  } else if (key==='strawberry' || key==='tomato' || key==='pepper') {
    const berry=key==='strawberry', chili=key==='pepper';
    const h=berry?0.5:chili?1.45:1.9;
    if(!berry) rod([0,0,0],[0,h,0],0.06,fern);
    if(key==='tomato') for(const x of [-0.62,0.62]) rod([x,0,0],[x*0.32,2,0],0.043,0xBB8857);
    for(let i=0;i<(berry?6:8);i++) {
      const a=i*spiral, y=berry?0.35:h*(0.38+0.075*i),x=Math.sin(a)*(berry?0.72:0.52),z=Math.cos(a)*(berry?0.72:0.52);
      rod([0,berry?0.05:y-0.27,0],[x,y,z],0.033,fern);
      for(const side of [-1,1]) leaf(x*0.8,y,z*0.8,a+side*0.75,berry?0.45:0.53,chili?0.09:0.19,0.24,i%2?mint:fern);
      if (!ripe) { if(g>0.23) blossom(x,y+0.04,z,0.14,berry?0xFFF6D9:0xFFC94D); continue; }
      const fruit=g>0.79?col:blend(col,mint,0.68);
      if(berry) {
        oval(x,y-0.05,z,0.15,0.12,0.15,fruit);
        part(geo('cone',1,1,8),fruit,x,y-0.17,z,0.15,0.24,0.15).rotation.x=Math.PI;
        for(let k=0;k<6;k++) oval(x+Math.sin(k)*0.137,y-0.065,z+Math.cos(k)*0.137,0.018,0.028,0.018,0xFFE69B);
      } else if(chili) {
        oval(x,y-0.14,z,0.105,0.19,0.105,fruit);
        rod([x,y-0.22,z],[x+Math.sin(a)*0.12,y-0.47,z+Math.cos(a)*0.12],0.09,fruit,0.06);
      } else { oval(x,y-0.17,z,0.205,0.17,0.20,fruit); ring(x,y-0.015,z,5,0.145,0.032,-0.22,fern); }
    }
  } else if (key==='mushroom') {
    for(let j=0;j<4;j++) {
      const a=j*spiral,x=j?Math.sin(a)*0.62:0,z=j?Math.cos(a)*0.62:0,k=j?0.54+(j%2)*0.14:1;
      rod([x,0,z],[x+0.07,0.85*k,z],0.15*k,0xEDDECB);
      const y=0.84*k;
      part(geo('sph',1,14,7,0,TAU,0,Math.PI/2),col,x+0.07,y,z,0.61*k,0.52*k,0.61*k);
      part(geo('tor',.59*k,.033*k,5,16),blend(col,0xFFE5C9,.55),x+.07,y+.02*k,z).rotation.x=Math.PI/2;
      oval(x+0.07,y,z,0.63*k,0.066*k,0.63*k,0xFFD4BB);
      for(let i=0;i<7;i++) { const b=i*spiral,r=(0.22+0.065*(i%3))*k; oval(x+0.07+Math.sin(b)*r,y+Math.sqrt(1-(r/(0.64*k))**2)*0.385*k,z+Math.cos(b)*r,0.075*k,0.03*k,0.075*k,0xFFF2DA); }
    }
  } else if (key==='grape') {
    for(const x of [-1,1]) rod([x,0,0],[x,1.75,0],0.075,0x916C55);
    rod([-1.09,1.64,0],[1.09,1.64,0],0.07,0xBB965F,1);
    for(let i=0;i<7;i++) leaf(-0.91+i*0.29,1.65,0,i*spiral,0.48,0.23,0.16,fern);
    for(let i=0;i<4;i++) {
      const x=-0.76+i*0.49,z=(i%2?1:-1)*0.16;
      rod([x,1.65,0],[x,1.38,z],0.035,mint);
      if(ripe) for(let j=0;j<10;j++){ const r=(1-j/10)*0.15; oval(x+Math.cos(j*spiral)*r,1.35-j*0.047,z+Math.sin(j*spiral)*r,0.127,0.143,0.127,col); }
    }
  } else if (key==='flower' || key==='lotus') {
    const lotus=key==='lotus',h=lotus?0.87:1.55;
    rod([0,0,0],[0,h,0],0.055,fern);
    if(lotus) for(let i=0;i<4;i++) {
      const a=i*spiral, pad=part(geo('cyl',1,1,1,14,1,false,0,5.82),fern,Math.sin(a)*0.60,0.11+i*0.01,Math.cos(a)*0.60,0.54,0.065,0.44); pad.rotation.y=a;
    } else for(let i=0;i<4;i++) leaf(0,0.16+i*0.24,0,i*spiral,0.67,0.15,0.34,mint);
    for(let j=0;j<3;j++) ring(0,h+j*0.04,0,lotus?8-j:11-j,0.72-j*0.16,lotus?0.21:0.125,1.2-g*(lotus?0.95:1.25)+j*0.25,blend(col,0xFFF1DE,j*0.29),j*0.37);
    gem(0,h+0.18,0,0.17,0.21,0.17,0xFFDB77);
  } else if (key==='pumpkin' || key==='melon') {
    const melon=key==='melon';
    for(let i=0;i<6;i++) {
      const a=i*spiral,x=Math.sin(a)*0.72,z=Math.cos(a)*0.72;
      rod([0,0.09,0],[x,0.11,z],0.036,fern); leaf(x,0.11,z,a,0.53,0.25,0.19,mint);
    }
    if(!ripe) blossom(0,0.24,0,0.31,0xFFCE65);
    else if(melon) {
      oval(0,0.52,0,0.78,0.53,0.59,col);
      for(let i=0;i<9;i++) part(geo('sph',1,3,9,i*TAU/9,0.17,0.08,2.98),fern,0,0.52,0,0.787,0.535,0.597);
    } else {
      for(let i=0;i<10;i++) { const a=i*TAU/10; oval(Math.sin(a)*0.32,0.49,Math.cos(a)*0.32,0.37,0.48,0.37,i%2?col:blend(col,0xFF994B,0.35)); }
      rod([0,0.85,0],[0.12,1.19,0.06],0.11,fern);
    }
  }
}

export function fillTree(P,type,g,fruits) {
  const def=CONFIG.trees[type], group=new THREE.Group(); P.add(group);
  group.scale.setScalar(0.22+0.78*g);
  const {part,oval,rod,leaf,gem}=tools(group);
  const bark={apple:0x80523A,orange:0x6E4938,peach:0x9A604A,cherry:0x55384B,coconut:0x9A704C,crystaltree:0x8ED2E3}[type];
  const anchors=[];
  const fruit=(x,y,z,scale=1)=>{
    const c=def.fruitColor;
    if(type==='crystaltree') { const m=gem(x,y,z,.22*scale,.34*scale,.22*scale,c);m.rotation.set(.22,.4,-.28);return; }
    const m=oval(c,x,y,z,.20*scale,.20*scale,.20*scale);
    if(type==='apple'||type==='peach') oval(blend(c,0xE86C61,.25),x+.07*scale,y+.01,z+.03*scale,.13*scale,.16*scale,.12*scale);
    if(type==='orange') { for(let i=0;i<6;i++) oval(0xFFE08A,x+Math.sin(i*spiral)*.11*scale,y+.14*scale,z+Math.cos(i*spiral)*.11*scale,.025*scale,.025*scale,.025*scale); }
    if(type==='cherry') { oval(0x72B65D,x,y+.16*scale,z,.045*scale,.12*scale,.035*scale); }
    if(type==='coconut') oval(0xE8D8B0,x,y+.02,z,.16*scale,.13*scale,.14*scale);
    leaf(x,y+.14*scale,z,0,.34*scale,.11*scale,.3,blend(c,0x9BDF87,.55));
    return m;
  };
  if(type==='apple') {
    rod([0,0,0],[0,1.35,0],.24,bark); rod([0,1.2,0],[-.78,1.78,.04],.13,bark); rod([0,1.1,0],[.72,1.62,0],.13,bark);
    for(const [x,y,z] of [[-.72,1.9,0],[.64,1.77,.05],[0,2.15,0]]) { part(geo('sph',1,10,8),blend(def.crown,0xB7F092,.2),x,y,z,.72,.55,.62); anchors.push([x,y,z]); }
  } else if(type==='orange') {
    rod([0,0,0],[0,1.65,0],.19,bark); for(let i=0;i<4;i++){const a=i*TAU/4;const x=Math.sin(a)*.62,z=Math.cos(a)*.62;rod([0,1.2,0],[x,1.75,z],.09,bark);part(geo('sph',1,10,8),def.crown,x,1.95,z,.57,.42,.53);anchors.push([x,1.95,z]);}
  } else if(type==='peach') {
    rod([0,0,0],[-.25,1.5,0],.22,bark);for(let i=0;i<5;i++){const a=i*TAU/5,x=Math.sin(a)*.72,z=Math.cos(a)*.72;rod([-.1,1.05,0],[x,1.55+Math.sin(a)*.2,z],.085,bark);part(geo('sph',1,10,8),0xD39B77,x,1.8,z,.62,.48,.52);anchors.push([x,1.8,z]);}
  } else if(type==='cherry') {
    rod([0,0,0],[0,1.2,0],.15,bark);for(const side of [-1,1]){rod([0,1.05,0],[side*.75,1.95,0],.075,bark);rod([side*.75,1.95,0],[side*1.05,1.65,.05],.05,bark);for(let i=0;i<4;i++){const x=side*(.62+i*.12),z=(i%2-.5)*.42;anchors.push([x,1.58+(i%2)*.22,z]);}}
    for(let i=0;i<8;i++){const [x,y,z]=anchors[i];leaf(x,y+.22,z,i*spiral,.5,.14,.16,def.crown);}
  } else if(type==='coconut') {
    rod([0,0,0],[.5,2.75,0],.18,bark);for(let i=0;i<7;i++){const a=i*TAU/7;leaf(.5,2.7,0,a,1.55,.18,.36,def.crown);anchors.push([.5+Math.sin(a)*.35,2.42,Math.cos(a)*.35]);}
  } else {
    rod([0,0,0],[0,1.7,0],.15,bark);for(let i=0;i<7;i++){const a=i*TAU/7,x=Math.sin(a)*.58,z=Math.cos(a)*.58;const c=gem(x,1.85,z,.4,.72,.4,blend(def.crown,i%2?0xF2A7FF:0xB8FFFF,.3));c.rotation.set(a*.4,a,.2);anchors.push([x,1.9,z]);}gem(0,2.52,0,.48,.76,.48,def.crown);
  }
  if(g<1)return;
  for(let i=0;i<Math.min(fruits,def.maxFruits);i++){const [x,y,z]=anchors[i%anchors.length];const a=i*spiral;fruit(x+Math.sin(a)*.14,y-.18-(i%2)*.13,z+Math.cos(a)*.14, type==='cherry'?.7:1);}
}
