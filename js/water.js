// Um único lote de gotas para todos os irrigadores, inclusive os vistos em visitas.
import * as THREE from 'three';
const capacity=480, drops=Array.from({length:capacity},()=>({age:Infinity}));
const transform=new THREE.Object3D();
let cursor=0, mesh;
export function initWater(scene) {
  mesh=new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),new THREE.MeshBasicMaterial({color:0x6BDFFF,toneMapped:false}),capacity);
  mesh.name='Jatos de irrigação'; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count=0; mesh.frustumCulled=false; scene.add(mesh);
}
export function waterJet(x,y,z,tx,ty,tz,type='can') {
  const dist=Math.hypot(tx-x,tz-z);
  const cloud=type==='cloud',drip=type==='drip';
  const duration=cloud?0.82:0.46+Math.min(dist,16)*0.041;
  const count=drip?8:cloud?17:22;
  for(let i=0;i<count;i++){
    const d=drops[cursor++%capacity], spread=cloud?0.95:0.34;
    const endX=tx+(Math.random()-0.5)*spread,endZ=tz+(Math.random()-0.5)*spread;
    Object.assign(d,{x:cloud?endX:x,y,z:cloud?endZ:z,tx:endX,ty,tz:endZ,duration,
      age:-i*(drip?0.07:0.032),arc:cloud?0:drip?0.30:0.66+dist*0.12,
      size:0.052+Math.random()*0.04});
  }
}
export function updateWater(dt) {
  if(!mesh) return;
  let n=0;
  for(const d of drops){
    if(d.age>d.duration || d.age===Infinity) continue;
    d.age+=dt;
    if(d.age<0 || d.age>d.duration) continue;
    const t=d.age/d.duration;
    transform.position.set(d.x+(d.tx-d.x)*t, d.y+(d.ty-d.y)*t+4*d.arc*t*(1-t), d.z+(d.tz-d.z)*t);
    transform.rotation.z=Math.atan2(-(d.tx-d.x),d.ty-d.y+4*d.arc*(1-2*t));
    transform.scale.set(d.size,d.size*1.65,d.size); transform.updateMatrix(); mesh.setMatrixAt(n++,transform.matrix);
  }
  mesh.count=n; mesh.visible=n>0;
  if(n) mesh.instanceMatrix.needsUpdate=true;
}
