import * as THREE from 'three';

// As duas asas usam a mesma textura, espelhada a partir do tórax.
function wingMaterial(base, edge) {
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d');
  function pane(contour, fill) {
    g.beginPath(); contour(g); g.closePath(); g.fillStyle=fill; g.fill();
    g.lineWidth=8; g.strokeStyle=edge; g.stroke();
  }
  pane(p=>{p.moveTo(12,121);p.bezierCurveTo(90,91,146,112,171,171);p.bezierCurveTo(186,205,144,227,124,217);p.quadraticCurveTo(112,248,98,224);p.bezierCurveTo(62,225,31,180,12,121);},base);
  pane(p=>{p.moveTo(10,137);p.bezierCurveTo(21,87,113,23,216,11);p.bezierCurveTo(245,10,237,63,212,101);p.bezierCurveTo(185,142,103,162,10,137);},base);
  g.strokeStyle=edge;g.lineWidth=3.4;
  for(const [x,y,bend] of [[217,19,-28],[226,51,-19],[213,87,-9],[187,118,2],[150,140,6],[159,180,1],[135,211,12],[87,211,18]]){
    g.beginPath();g.moveTo(13,134);g.quadraticCurveTo(x*0.52,120+bend,x,y);g.stroke();
  }
  for(const [x,y,r] of [[216,28,5],[217,43,4],[214,59,3],[202,85,4],[191,102,3],[150,192,6],[135,205,3],[120,211,3]]) {
    g.fillStyle='#FFF1C0';g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();
  }
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide,alphaTest:0.35});
}
const palettes=[['#F49C42','#322C38'],['#6FD9E6','#244352'],['#C891DA','#43375C']];
const wingMats=[];
const wing=new THREE.PlaneGeometry(0.44,0.46);
wing.translate(0.202,0,0);wing.rotateX(Math.PI/2);
const dark=new THREE.MeshBasicMaterial({color:0x3C2D32});
const bead=new THREE.SphereGeometry(1,8,6);
export function butterfly(i) {
  const g=new THREE.Group(), k=i%palettes.length;
  wingMats[k]??=wingMaterial(...palettes[k]);
  const l=new THREE.Mesh(wing,wingMats[k]), r=new THREE.Mesh(wing,wingMats[k]); r.scale.x=-1;
  function body(x,y,z,sx,sy,sz) { const m=new THREE.Mesh(bead,dark);m.position.set(x,y,z);m.scale.set(sx,sy,sz);g.add(m);return m; }
  body(0,0,0.02,0.027,0.026,0.145);body(0,0.01,-0.056,0.045,0.035,0.054);
  body(0,0.026,-0.128,0.031,0.028,0.034);
  for(const side of [-1,1]) {
    const feeler=body(side*0.033,0.056,-0.174,0.006,0.006,0.07);feeler.rotation.set(0.48,-side*0.50,0);
    body(side*0.064,0.088,-0.228,0.010,0.01,0.014);
  }
  g.add(l,r);g.scale.setScalar(1.28);return {g,l,r};
}
export function skyBird() {
  const g=new THREE.Group(), m=new THREE.MeshBasicMaterial({color:0x354461,side:THREE.DoubleSide});
  const shape=new THREE.Shape();shape.moveTo(0,0);shape.quadraticCurveTo(0.35,0.18,0.70,0.22);shape.lineTo(1.48,-0.28);shape.lineTo(0.71,-0.12);shape.lineTo(0.30,-0.27);shape.closePath();
  const feather=new THREE.ShapeGeometry(shape);feather.rotateX(Math.PI/2);
  const l=new THREE.Mesh(feather,m),r=new THREE.Mesh(feather,m);r.scale.x=-1;
  const body=new THREE.Mesh(bead,m); body.scale.set(0.15,0.12,0.51);g.add(body,l,r);return {g,l,r};
}
