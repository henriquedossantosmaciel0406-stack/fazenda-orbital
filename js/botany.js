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

// Folha de alface em concha com nervura central e borda crespa.
function lettuceLeaf(){
  const pos=[],idx=[];
  for(let j=0;j<=10;j++)for(let k=0;k<=8;k++){
    const t=j/10,u=k/4-1,edge=Math.abs(u),bell=Math.sin(Math.PI*t*.96);
    const ripple=.038*Math.sin(22*t+u*7)*edge**3*t;
    pos.push(u*(.025+.46*bell**.67)*(.9+.10*Math.sin(18*t)*edge),
      .10*t+.51*t*t+.12*u*u*bell+.044*bell*(1-edge)**6+ripple,
      .74*t-.23*t**3-.17*u*u*bell);
    if(j<10&&k<8){const a=j*9+k;idx.push(a,a+9,a+1,a+1,a+9,a+10);}
  }
  const topCount=pos.length/3,topIndices=idx.slice();
  for(let i=0;i<topCount;i++)pos.push(pos[i*3],pos[i*3+1]-.012,pos[i*3+2]);
  for(let i=0;i<topIndices.length;i+=3)idx.push(topCount+topIndices[i+2],topCount+topIndices[i+1],topCount+topIndices[i]);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
const lettuceBlade=lettuceLeaf();

export function fillCrop(P,key,g,ready,sick,mutation) {
  const group = new THREE.Group(); P.add(group);
  const leafKind=['flower','lotus'].includes(key)?'petal':['lettuce','strawberry','grape','pumpkin','melon','tomato'].includes(key)?'lobed':'blade';
  const {leaf,rod,oval,gem,part}=tools(group,leafKind);
  const base=CONFIG.crops[key].color;
  const col=sick ? 0xB99550 : mutation ? blend(base,mutation.color,0.65) : base;
  const greens={sundial:0x668b57,spiralpod:0x488d82,moonfan:0x686699,miralume:0x406e77,heliobell:0x6c804c,nixpearl:0x565782,radish:0x51894F,okra:0x37865F,pineapple:0x3E877D,lettuce:0x58A540,carrot:0x3B9363,corn:0x39987D,strawberry:0x467755,tomato:0x45744F,pepper:0x277C64,grape:0x508F84,flower:0x5A8B70,prism:0x2E8F86,sunflower:0x4F8C3A,voidberry:0x4A4F9A,lotus:0x2C938A,pumpkin:0x5B874D,melon:0x389775,mushroom:0x6E737F};
  const fern=sick?0x817346:greens[key],mint=sick?0xADA053:blend(fern,0xEBF997,.48);
  const scale=0.32+0.68*g, ripe=g>0.55;
  group.scale.setScalar(scale);
  const ring=(x,y,z,n,r,w,pitch,color,phase=0)=> {
    for(let i=0;i<n;i++) leaf(x,y,z,i*TAU/n+phase,r,w,pitch,i%2 ? color : blend(color,0xfff1b2,0.14));
  };
  function blossom(x,y,z,r,color) {
    ring(x,y,z,5,r,r*0.33,0.2,color); oval(x,y+0.025,z,r*0.22,r*0.18,r*0.22,0xFFD077);
  }
  if(key==='sundial'){
    ring(0,.12,0,8,.72,.15,.42,fern);
    rod([0,0,0],[0,1.12,0],.065,fern);
    const disc=new THREE.Group();group.add(disc);disc.position.y=1.15;disc.rotation.z=-.42;
    const face=tools(disc,'petal');
    face.oval(0,0,0,.43,.1,.43,0xbf7039);
    for(let i=0;i<(ripe?12:6);i++){
      const a=i*TAU/(ripe?12:6);face.leaf(0,.04,0,a,.62,.13,ripe?.12:.94,col);
      if(ripe)face.gem(.33*Math.sin(a),.11,.33*Math.cos(a),.028,.046,.028,0xffed9a);
    }
    if(ripe)face.rod([0,.05,0],[.17,.48,.04],.067,0xffdf81,.09);
  }else if(key==='spiralpod'){
    rod([0,0,0],[0,1.85,0],.047,fern);
    let last=[0,.09,0];
    for(let i=0;i<=Math.floor(6+g*13);i++){
      const a=i*.7,rad=.3+.1*Math.sin(i*.18),tip=[rad*Math.cos(a),.12+i*.093,rad*Math.sin(a)];
      rod(last,tip,.032,mint);
      if(i%3===2){
        leaf(...tip,1.57-a,.49,.12,.36,fern);
        if(ripe){const pod=oval(tip[0],tip[1]-.19,tip[2],.105,.255,.12,col);pod.rotation.z=.32*Math.sin(a);}
      }
      last=tip;
    }
  }else if(key==='moonfan'){
    for(let j=0;j<3;j++){
      const fan=new THREE.Group();fan.position.set((j-1)*.32,.1,(j%2)*.19);fan.rotation.y=j*1.95;
      group.add(fan);const f=tools(fan,'petal');
      for(let i=-3;i<=3;i++){
        const angle=i*(.11+.09*g),h=.8+.55*g-.06*Math.abs(i),x=h*Math.sin(angle),y=h*Math.cos(angle);
        const blade=f.oval(x*.51,y*.51,0,.15+.05*g,h*.57,.07,blend(fern,col,.36+.12*(3-Math.abs(i))));
        blade.rotation.z=-angle;
        f.rod([0,.07,.055],[x,y,.055],.018,mint);
        if(ripe)f.gem(x,y,.045,.064,.09,.05,col);
      }
    }
  }else if (key==='lettuce') {
    const leaves=5+Math.floor(g*13);
    for(let i=0;i<leaves;i++){
      const layer=i/(leaves-1),angle=i*spiral;
      const span=1.48-layer*.96,offset=.27*(1-layer);
      const tint=blend(col,sick?0xc4ad69:0xdaf396,.12+layer*.67);
      const m=part(lettuceBlade,tint,Math.sin(angle)*offset,.06+layer*.35,Math.cos(angle)*offset,span,span,span);
      m.rotation.set(.55-layer*1.15,angle,0,'YXZ');
    }
  } else if (key==='radish') {
    for(let j=0;j<3;j++){
      const a=j*TAU/3,x=.46*Math.sin(a),z=.46*Math.cos(a);
      const size=.13+.18*g;
      oval(x,.14,z,size,size*.88,size,col);
      rod([x,.14,z],[x+.06,-.12,z],size*.62,0xF2D9C5,.08);
      for(let k=0;k<4;k++)leaf(x,.14+size*.8,z,a+k*spiral,.47,.12,.45+.18*k,k%2?mint:fern);
    }
  } else if (key==='okra') {
    rod([0,0,0],[0,1.75,0],.067,fern);
    for(let j=0;j<5;j++){
      const a=j*spiral,y=.46+j*.24,x=.31*Math.sin(a),z=.31*Math.cos(a);
      rod([0,y-.2,0],[x,y,z],.035,fern);
      leaf(x,y,z,a,.55,.16,.19,mint);
      if(ripe) {
        rod([x,y,z],[x*1.46,y+.48,z*1.46],.115,col,.16);
        gem(x,y+.045,z,.13,.08,.13,fern);
      }else if(g>.25)blossom(x,y+.02,z,.18,0xFFF0AE);
    }
  } else if (key==='pineapple') {
    ring(0,.13,0,11,1,.13,.42,fern);
    ring(0,.21,0,8,.77,.12,.73,mint,.31);
    if(g>.35){
      rod([0,.13,0],[0,.7,0],.09,fern);
      const rind=ripe?col:fern;
      oval(0,.88,0,.35,.51,.35,rind);
      for(let j=0;j<4;j++)for(let k=0;k<8;k++){
        const a=(k+.5*(j%2))*TAU/8,y=.59+j*.19;
        const r=.35*Math.sqrt(1-((y-.88)/.51)**2);
        const eye=gem(r*Math.sin(a),y,r*Math.cos(a),.083,.10,.04,blend(rind,0xA7612A,.43));
        eye.rotation.y=a;
      }
      ring(0,1.32,0,8,.43,.072,.91,fern);
      ring(0,1.38,0,5,.38,.06,1.16,mint,.3);
    }
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
  } else if(key==='miralume'||key==='heliobell'||key==='nixpearl'){
    ring(0,.12,0,7,.74,.18,.54,fern);
    const stalks=key==='nixpearl'?1:3;
    for(let i=0;i<stalks;i++){
      const a=i*TAU/3,x=stalks===1?0:.48*Math.cos(a),z=stalks===1?0:.48*Math.sin(a),h=.95+i*.22;
      rod([0,.1,0],[x,h,z],.06,mint);
      if(!ripe){gem(x,h,z,.12,.21,.12,fern);continue;}
      if(key==='miralume'){oval(x,h,z,.21,.33,.21,col);ring(x,h+.22,z,5,.26,.075,-.6,fern);}
      if(key==='heliobell'){part(geo('cyl',.13,.32,.39,8),col,x,h,z);gem(x,h-.24,z,.09,.15,.09,0xffda80);}
      if(key==='nixpearl'){ring(x,h,z,8,.64,.19,.55,col);oval(x,h+.15,z,.28,.3,.28,0xf5dcff);}
    }
  } else if (key==='prism') {
    rod([0,0,0],[0,1.5,0],0.07,fern);
    for(let i=0;i<6;i++) leaf(0,0.2+i*0.2,0,i*spiral,0.62,0.14,0.4,i%2?mint:fern);
    for(let j=0;j<5;j++){
      const a=j*TAU/5,x=Math.sin(a)*0.5,z=Math.cos(a)*0.5,h=0.3+0.22*(j%3);
      rod([0,0.35+j*0.1,0],[x,0.5+h*0.6,z],0.03,fern);
      if(ripe){ const c=gem(x,0.62+h,z,0.15,0.4+h*0.5,0.15,j%2?col:blend(col,0xFFFFFF,0.35)); c.rotation.set(0.25*Math.cos(a),a,-0.25*Math.sin(a)); }
      else if(g>0.3) blossom(x,0.55+h,z,0.12,0xC8FFF2);
    }
    if(ripe) gem(0,1.62,0,0.2,0.62,0.2,blend(col,0xFFFFFF,0.5));
  } else if (key==='sunflower') {
    rod([0,0,0],[0,2.1,0],0.09,fern);
    for(let i=0;i<5;i++) leaf(0,0.3+i*0.28,0,i*spiral,0.8,0.28,0.35,i%2?mint:fern);
    const hy=2.15;
    if(ripe){
      ring(0,hy,0,14,0.72,0.2,0.22,col); ring(0,hy+0.02,0,12,0.5,0.17,0.3,blend(col,0xFFE08A,0.4),0.2);
      oval(0,hy+0.03,0,0.36,0.14,0.36,0x5A3A22);
      for(let k=0;k<8;k++){const a=k*spiral,r=0.05+k*0.035;oval(Math.sin(a)*r,hy+0.17,Math.cos(a)*r,0.035,0.02,0.035,0x3B2514);}
    } else { oval(0,hy-0.05,0,0.22,0.16,0.22,fern); if(g>0.5) ring(0,hy,0,8,0.28,0.1,1.0,col); }
  } else if (key==='voidberry') {
    ring(0,0.1,0,9,0.9,0.16,0.5,fern); ring(0,0.2,0,7,0.62,0.14,0.8,mint,0.3);
    for(let j=0;j<6;j++){
      const a=j*spiral,r=0.28+0.14*(j%3),x=Math.sin(a)*r,z=Math.cos(a)*r,y=0.5+0.18*j;
      rod([0,0.18,0],[x,y,z],0.04,fern);
      if(ripe){ oval(x,y+0.08,z,0.2,0.2,0.2,col); gem(x+0.02,y+0.2,z,0.07,0.09,0.07,0xE7DDFF); ring(x,y+0.02,z,4,0.15,0.05,-0.3,fern); }
      else if(g>0.35) oval(x,y+0.04,z,0.1,0.1,0.1,blend(col,mint,0.6));
    }
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
  if(mutation && g>.22){
    const at=mutation;
    if(at===CONFIG.mutations.rime){
      for(let i=0;i<5;i++){
        const a=i*TAU/5,x=.66*Math.sin(a),z=.66*Math.cos(a),y=.34+.14*(i%3);
        rod([x,y-.27,z],[x,y+.31,z],.022,0xc4f5ff);
        for(const side of [-1,1])for(let j=0;j<2;j++)
          rod([x,y+.12*j,z],[x+side*.15*Math.cos(a),y+.13+.12*j,z-side*.15*Math.sin(a)],.018,0x9bdaec);
      }
    }else if(at===CONFIG.mutations.firefly){
      for(let i=0;i<7;i++){const a=i*spiral,x=.76*Math.cos(a),z=.76*Math.sin(a),y=.43+.16*(i%4);
        gem(x,y,z,.069,.091,.069,0xffea76);leaf(x,y+.05,z,a,.13,.046,.36,0xc6edb4);}
    }else if(at===CONFIG.mutations.geode){
      for(let i=0;i<5;i++){const a=i*spiral,x=.56*Math.sin(a),z=.56*Math.cos(a);
        gem(x,.15,z,.23,.18,.22,0x565078);
        for(let j=-1;j<=1;j++)gem(x+.074*j,.32,z,.063,.19+.08*(1-Math.abs(j)),.065,j?0xb299ec:0xf5ccff).rotation.z=-j*.27;}
    }else if(at===CONFIG.mutations.corona){
      const rim=part(geo('tor',.43,.037,5,18),0xfbb948,0,1.54,0);rim.rotation.x=Math.PI/2;
      for(let i=0;i<8;i++){const a=i*TAU/8;gem(.43*Math.cos(a),1.68,.43*Math.sin(a),.065,i%2?.14:.22,.065,0xffdd75);}
    }else if(at===CONFIG.mutations.satellite){
      const orbit=new THREE.Group();group.add(orbit);orbit.position.y=.9;orbit.rotation.z=.32;
      const o=tools(orbit);
      o.part(geo('tor',.85,.023,5,24),0xecacd3,0,0,0).rotation.x=Math.PI/2;
      for(let i=0;i<3;i++){const a=i*TAU/3;o.oval(.85*Math.cos(a),0,.85*Math.sin(a),.11,.11,.11,i===0?0xffcc83:0xb8b5fd);}
    }
  }
}

// Um único volume por fruto evita que duas cascas quase coincidentes pisquem ao longe.
const fruitSkins=new Map();
function fruitSkin(type) {
  if(fruitSkins.has(type))return fruitSkins.get(type);
  const shape=new THREE.SphereGeometry(1,type==='starfruit'?20:16,12);
  const pos=shape.attributes.position;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), y=pos.getY(i), z=pos.getZ(i);
    const angle=Math.atan2(z,x);
    let width=1,height=y;
    if(type==='apple'){
      width=1+.14*y+.045*Math.cos(5*angle)*(1-y*y);
      height=y-.22*Math.max(0,y)**10+.08*Math.max(0,-y)**9;
    }else if(type==='lanterntree'){width=.84+.14*Math.cos(6*angle)-.15*y;}else if(type==='ringfig'){width=1-.32*y;}else if(type==='pear'){
      width=1-.52*y-.16*Math.exp(-10*(y-.55)**2);
    }else if(type==='starfruit'){
      width=.79+.28*Math.cos(angle*5);
    }else if(type==='peach'){
      const crease=Math.exp(-18*x*x)*Math.max(0,z);
      width=1+.13*y-.16*crease;
      height=y-.16*Math.max(0,y)**8;
    }else if(type==='coconut'){
      width=1+.18*y+.045*Math.cos(3*angle);
    }
    pos.setXYZ(i,x*width,height,z*width);
  }
  shape.computeVertexNormals();fruitSkins.set(type,shape);return shape;
}

const fruitSize={
  lanterntree:[.23,.36,.23],ringfig:[.21,.27,.21],pear:[.22,.36,.22],starfruit:[.30,.37,.30],apple:[.27,.28,.26],orange:[.245,.235,.245],peach:[.28,.29,.25],
  cherry:[.164,.15,.16],coconut:[.225,.32,.205],crystaltree:[.195,.34,.195]
};

function addRipeFruit(group,type,anchor,angle,slot) {
  const [ax,ay,az]=anchor;
  const [w,h,d]=fruitSize[type];
  const dx=Math.sin(angle),dz=Math.cos(angle);
  const crown=new THREE.Group();
  const branch=tools(group);
  const reach=type==='coconut' ? .34 : .20;
  const x=ax+dx*reach, z=az+dz*reach;
  const drop=(type==='cherry' ? .44 : .26)+.06*(slot%2);
  const tip=ay-drop;
  branch.rod(anchor,[x,tip,z],type==='coconut' ? .048 : .026, type==='cherry'?0x779143:0x8A6945);
  crown.position.set(x,tip-h*.76,z);
  crown.rotation.y=angle;
  group.add(crown);
  const {part,leaf,oval,gem}=tools(crown);
  const color=CONFIG.trees[type].fruitColor;
  if(type==='crystaltree'){
    gem(0,0,0,w,h,d,color);
    gem(-.057,.038,.12,.044,.09,.023,0xFFBDFA);
    part(geo('cyl',.055,.088,.07,6),0x76C2CA,0,h*.84,0);
  }else{
    part(fruitSkin(type),type==='coconut'?0x99673F:color,0,0,0,w,h,d);
    if(type==='coconut'){
      for(const [px,py] of [[-.065,.045],[.064,.045],[0,-.05]])
        oval(px,py,.194,.029,.034,.018,0x513827);
    }else if(type==='ringfig'){
      part(geo('tor',.265,.038,5,16),0xeab86d,0,-.025,0).rotation.x=1.32;
    }else if(type==='lanterntree'){
      for(let i=0;i<5;i++)leaf(0,h*.86,0,i*TAU/5,.19,.065,-.46,0x6ba48c);
      gem(0,-h*.91,0,.045,.082,.045,0xffdc81);
    }else if(type==='orange'){
      for(let i=0;i<5;i++)leaf(0,h*.97,0,i*TAU/5,.105,.032,-.34,0x589354);
      for(const [px,py] of [[-.10,.04],[-.058,.092],[-.128,-.015]]){
        const pz=d*Math.sqrt(1-(px/w)**2-(py/h)**2);
        oval(px,py,pz,.014,.013,.009,0xFFD379);
      }
    }else if(type==='cherry'){
      oval(-.054,.046,.141,.034,.019,.012,0xFFB2AC);
    }else{
      leaf(0,h*.85,0,.94,.21,.069,.18,0x629F55);
      if(type==='apple')oval(-.082,.075,.246,.033,.052,.012,0xFFB49E);
    }
  }
}

const crowns = {
  lanterntree:[6,1.28,2.28,.65,.54],ringfig:[7,1.48,1.93,.67,.36],pear:[5,.75,2.45,.57,.83],starfruit:[7,1.35,1.70,.52,.38],apple: [5,1.05,1.75,0.70,0.73], orange:[7,0.82,2.05,0.60,0.93],
  peach:[4,1.27,1.48,0.80,0.49], cherry:[8,1.46,2.06,0.62,0.38],
  coconut:[9,1.2,3.1,0,0], crystaltree:[6,0.95,1.85,0.41,1.04]
};
export function fillTree(P,type,g,fruits) {
  const def=CONFIG.trees[type], group=new THREE.Group(); P.add(group);
  group.scale.setScalar(0.22+0.78*g);
  const {part,oval,rod,leaf,gem}=tools(group);
  const [n,r,h,w,depth]=crowns[type], palm=type==='coconut', ice=type==='crystaltree';
  const bark=ice?0xA5D3DE:palm?0xBA8860:type==='cherry'?0x754860:0x855637;
  const lean=palm?0.56:type==='peach'?-0.33:0.12, top=[lean,h,0];
  rod([0,0,0],[lean*0.26,h*0.54,0],0.23,bark);
  rod([lean*0.26,h*0.54,0],top,0.17,bark);
  for(let i=0;i<4;i++) rod([Math.cos(i*1.6)*0.43,0.025,Math.sin(i*1.6)*0.43],[0.02,0.4,0],0.10,bark,0.13);
  const anchors=[];
  for(let i=0;i<n;i++) {
    const a=i*TAU/n+0.25,dx=Math.sin(a),dz=Math.cos(a);
    const radius=type==='orange'?r*(1.22-i*0.10):r;
    const x=lean+dx*radius,z=dz*radius,y=type==='orange'?h-0.58+i*0.26:h+(i%2)*0.28;
    const tint=blend(def.crown,i%2?0xFFE6A1:0x265F68,i%2?0.32:0.22);
    if(palm) {
      leaf(...top,a,1.78,0.18,0.19,tint);
      for(let j=1;j<=5;j++) for(const side of [-1,1])
        leaf(lean+dx*j*0.27,h+0.18*Math.sin(j*0.6),dz*j*0.27,a+side*0.91,0.69-j*0.055,0.105,-0.22-j*0.05,tint);
      anchors.push([lean+dx*0.47,h-0.21,dz*0.47]);
    } else {
      rod([lean*0.4,h*0.56,0],[x,y,z],0.115,bark,0.36);
      if(type==='lanterntree'){
        oval(x,y+.23,z,w,.4,w,tint);
        for(let k=-1;k<=1;k++){
          const bx=x+.24*k*dz,bz=z-.24*k*dx;
          rod([bx,y+.28,bz],[bx+dx*.2,y-.64,bz+dz*.2],.026,tint);
          for(let j=0;j<3;j++)leaf(bx+dx*j*.07,y+.17-j*.25,bz+dz*j*.07,a+k*.6,.51,.11,-.64,tint);
        }
      }else if(type==='ringfig'){
        for(let j=0;j<4;j++)leaf(x,y+.13,z,a+j*1.35,.93,.31,.28,tint);
      }else if(type==='starfruit'){
        for(let j=0;j<4;j++){
          const t=(j+1)/4;
          for(const side of [-1,1])leaf(lean+dx*radius*t,h*.56+(y-h*.56)*t,dz*radius*t,a+side*.92,.66,.16,-.12,tint);
        }
      }else if(ice) { const crystal=gem(x,y+0.25,z,w,depth,w,tint); crystal.rotation.z=-dx*0.35; crystal.rotation.x=dz*0.35; }
      else {
        const canopy=part(geo('ico',1,1),tint,x,y+0.32,z,w,depth,w*0.87); canopy.rotation.y=a;
        for(let j=0;j<3;j++) leaf(x,y+0.32+depth*0.64,z,a+j*2.1,w*1.23,0.21,0.28,blend(tint,0xffe390,0.21));
      }
      if(type==='cherry') {
        for(let j=0;j<2;j++) {
          const bx=x+dx*(w*0.61+j*0.16),bz=z+dz*(w*0.55+j*0.15);
          rod([x,y+0.31,z],[bx,y-0.38,bz],0.026,0x9C6877);
          for(let k=0;k<3;k++) oval(bx+0.045*(k%2),y-0.26+k*0.16,bz,0.11,0.075,0.09,k%2?0xF08CAF:0xFFE4D5);
        }
      }
      anchors.push([x+dx*w*0.68,y+0.19-depth*0.55,z+dz*w*0.68]);
    }
  }
  if(!palm && type!=='starfruit') {
    if(ice) gem(lean,h+0.72,0,0.51,1.21,0.51,def.crown);
    else part(geo('ico',1,1),def.crown,lean,h+0.61,0,w*1.45,depth*1.21,w*1.4);
  }
  if(type==='peach'||type==='orange'||type==='apple'){
    const bloom=type==='peach'?0xFCC7C1:type==='orange'?0xFFF0CB:0xFFE4D4;
    for(let i=0;i<anchors.length;i++){
      const [x,y,z]=anchors[i];
      leaf(x,y+.10,z,i*spiral,.41,.13,.28,blend(def.crown,0xE1F5A3,.32));
      if(g>.4 && !fruits){
        for(let j=0;j<5;j++){
          const a=j*TAU/5;
          oval(x+Math.sin(a)*.08,y+.02,z+Math.cos(a)*.08,.073,.042,.07,bloom);
        }
        oval(x,y+.05,z,.045,.034,.045,0xEEBE61);
      }
    }
  }
  if(g<1) return;
  // As posições dependem do ramo, nunca da quantidade de frutos restantes.
  for(let i=0;i<Math.min(fruits,def.maxFruits);i++){
    // Cada fruto tem seu próprio lugar, mesmo quando há mais frutos do que galhos.
    const count=def.maxFruits;
    const sector=(i%2===0?i/2:Math.ceil(count/2)+(i-1)/2);
    const angle=sector*TAU/count+.25;
    const slot=Math.round(sector*n/count)%n;
    const [ax,ay,az]=anchors[slot];
    const radius=palm?.62:Math.hypot(ax-lean,az)+.12;
    const anchor=[lean+Math.sin(angle)*radius,ay+.09-.14*(sector%2),Math.cos(angle)*radius];
    rod([ax,ay+.20,az],anchor,palm?.057:.035,ice?0x8abbc7:bark);
    addRipeFruit(group,type,anchor,angle,i);
  }
}
