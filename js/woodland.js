import * as THREE from 'three';
import { geo, mat } from './world.js';
import { cachedMerged } from './optimize.js';
import { applyWind } from './scenery.js';
import { toonGradient } from './toon.js';

// Cada espécie do bosque usa um lote instanciado com variações de escala e rotação.
export function woodland(scene,world,spots,random) {
  const shades=[0x367C62,0x7DA85B,0x509C88,0xB88B58,0xA684B9];
  const breeze=applyWind(new THREE.MeshToonMaterial({vertexColors:true,gradientMap:toonGradient}),0.017,1.4);
  const dummy=new THREE.Object3D();
  for(let kind=0;kind<5;kind++) {
    const trees=spots.filter((_,i)=>i%5===kind);
    const shape=cachedMerged('bosque:'+kind,g=>{
      function add(gm,c,x,y,z,sx,sy,sz) {
        const part=new THREE.Mesh(gm,mat(c));part.position.set(x,y,z);part.scale.set(sx,sy,sz);g.add(part);return part;
      }
      const trunk=kind===2?0xE7D8AD:0x926744, leaf=shades[kind];
      add(geo('cyl',0.14,0.32,1,8),trunk,0,1.25,0,1,2.5,1);
      const tuft=geo('ico',1,1), cone=geo('cone',1,1,9);
      if(kind===0) {
        for(let j=0;j<4;j++){const r=1.52-j*0.31;add(cone,leaf,0,2.1+j*0.82,0,r,2.1-j*0.19,r).rotation.y=j*0.31;}
      } else if(kind===1){
        for(let i=0;i<5;i++){const a=i*2.40,x=Math.sin(a),z=Math.cos(a),b=add(geo('cyl',0.085,0.14,1,6),trunk,x*0.48,2.05,z*0.48,1,1.45,1);b.rotation.z=-x*0.73;b.rotation.x=z*0.73;
          add(tuft,i%2?leaf:0x99B66C,x,2.55+(i%2)*0.45,z,1.35,0.63,1.2);}
      } else if(kind===2){
        for(let j=0;j<5;j++) add(geo('cyl',0.23,0.24,1,7),0x796B61,0,0.46+j*0.35,0,1,0.05,1);
        for(let j=0;j<4;j++) add(tuft,j%2?leaf:0x71B88D,(j%2-0.5)*0.43,2.43+j*0.56,0,1.04-j*0.15,1.02,0.88-j*0.12);
      } else if(kind===3){
        for(let j=0;j<6;j++){const a=j*2.4,r=0.92-j*0.11;add(tuft,j%2?0xD09053:leaf,Math.cos(a)*r,2.25+j*0.31,Math.sin(a)*r,1.04,0.81,1.06);}
      } else {
        for(let j=0;j<6;j++){const a=j*1.14,r=1.4-j*0.17;add(cone,j%2?leaf:0xA7A1D2,Math.cos(a)*0.35,1.68+j*0.55,Math.sin(a)*0.35,r,1.55,r).rotation.z=0.16*Math.sin(a);}
      }
    });
    const batch=new THREE.InstancedMesh(shape,breeze,trees.length);
    trees.forEach(([x,z],i)=>{
      const scale=0.82+random()*0.50;dummy.position.set(x,0,z);dummy.rotation.y=random()*6.28;
      dummy.scale.set(scale,scale*(0.88+random()*0.25),scale);dummy.updateMatrix();batch.setMatrixAt(i,dummy.matrix);
      world.colliders.push({x,z,radius:0.38*scale});
    });
    batch.castShadow=true;batch.receiveShadow=true;scene.add(batch);
  }
}
