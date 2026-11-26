import * as THREE from 'three';

const CELL=32, DROPS=156;
// Células fixas cobrem o continente, as ilhas e os terrenos visitáveis.
export function rainField(scene) {
  const group=new THREE.Group();group.name='Chuva no mundo';scene.add(group);
  const uniforms={uTime:{value:0},uRain:{value:0}};
  const geometry=new THREE.BufferGeometry(), seeds=[],corners=[],indices=[];
  for(let i=0;i<DROPS;i++){
    const salt=i+0.5;
    for(const [cx,cy] of [[-1,0],[1,0],[-1,1],[1,1]]){seeds.push(salt,0,0);corners.push(cx,cy);}
    const v=i*4;indices.push(v,v+1,v+2,v+1,v+3,v+2);
  }
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(seeds,3));
  geometry.setAttribute('corner',new THREE.Float32BufferAttribute(corners,2));geometry.setIndex(indices);
  geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(16,10,16),30);
  const vertex=`
    attribute vec2 corner;uniform float uTime;uniform float uRain;varying float alpha;varying vec2 uvDrop;
    float rnd(vec2 p){return fract(sin(dot(p,vec2(19.127,71.331)))*4375.31);}
    void main(){
      vec2 tile=modelMatrix[3].xz;
      vec2 key=tile*0.071+vec2(position.x,position.x*1.641);
      vec2 ground=vec2(rnd(key),rnd(key+31.7))*32.0;
      float speed=mix(13.,19.,rnd(key+54.2));
      float t=fract(uTime*speed/21.+rnd(key+23.3));
      float height=(1.-t)*21.;
      float wind=0.16+max(0.,uRain-0.8)*(0.55+0.22*sin(uTime*1.7));
      vec3 pos=vec3(ground.x-height*wind,height,ground.y-height*0.06);
      uvDrop=corner;
      #ifdef SPLASH
        float radius=0.025+(t*5.)*0.16;
        pos=vec3(ground.x+corner.x*radius,0.37,ground.y+(corner.y*2.-1.)*radius);
        alpha=(1.-smoothstep(0.,0.19,t))*0.46*uRain;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.);
      #else
        pos+=vec3(-wind,1.,-0.06)*corner.y*mix(0.40,0.89,rnd(key+74.));
        vec4 mv=modelViewMatrix*vec4(pos,1.);
        mv.x+=corner.x*mix(0.018,0.034,rnd(key+93.));
        alpha=(0.25+0.4*rnd(key+11.))*(1.-0.65*corner.y)*smoothstep(0.35,2.5,-mv.z)*uRain;
        gl_Position=projectionMatrix*mv;
      #endif
    }`;
  const frag=`varying float alpha;varying vec2 uvDrop;
    void main(){float a=alpha;
    #ifdef SPLASH
      float d=length(vec2(uvDrop.x,uvDrop.y*2.-1.));a*=smoothstep(0.48,0.70,d)*(1.-smoothstep(0.76,1.,d));
    #endif
    gl_FragColor=vec4(0.68,0.84,0.94,a);}`;
  const material=defines=>new THREE.ShaderMaterial({defines,uniforms,vertexShader:vertex,fragmentShader:frag,transparent:true,side:THREE.DoubleSide,depthWrite:false});
  const streaks=material({}),splashes=material({SPLASH:1}),tiles=new Map();
  function cover(x0,x1,z0,z1){
    for(let x=Math.floor(x0/CELL);x<=Math.floor(x1/CELL);x++)for(let z=Math.floor(z0/CELL);z<=Math.floor(z1/CELL);z++){
      const key=x+','+z;if(tiles.has(key))continue;
      const tile=new THREE.Group();tile.position.set(x*CELL,0,z*CELL);
      tile.add(new THREE.Mesh(geometry,streaks),new THREE.Mesh(geometry,splashes));
      tile.visible=false;group.add(tile);tiles.set(key,tile);
    }
  }
  cover(-120,120,-244,120);
  for(const [dx,dz] of [[245,0],[0,345],[245,345]])cover(dx-110,dx,dz-245,dz+20);
  let nextCull=0;
  return {
    quality(q){geometry.setDrawRange(0,6*(q==='baixa'?62:q==='media'?106:DROPS));},
    update(dt,amount,viewer){
      group.visible=amount>0.015;if(!group.visible){nextCull=0;return;}
      uniforms.uTime.value=(uniforms.uTime.value+dt)%20000;uniforms.uRain.value=amount;
      if((nextCull-=dt)>0)return;nextCull=0.22;
      for(const tile of tiles.values())tile.visible=Math.hypot(tile.position.x+16-viewer.x,tile.position.z+16-viewer.z)<83;
    }
  };
}

// Cada perfil descreve o arco superior da nuvem: centro, largura e altura dos gomos.
const cloudProfiles=[
  [[-.64,.36,.48],[-.28,.48,.86],[.15,.47,.68],[.60,.40,.41]],
  [[-.60,.40,.38],[-.19,.48,.57],[.28,.47,.92],[.70,.30,.48]],
  [[-.66,.34,.35],[-.33,.46,.60],[.08,.52,.48],[.55,.45,.35]]
];

function cloudVolume(profile) {
  const slices=28, sides=16;
  const vertices=[],indices=[],colors=[];
  const underside=new THREE.Color(0xb0bed9), shade=new THREE.Color(0xd4dff0);
  const light=new THREE.Color(0xfff9e9), tint=new THREE.Color();
  function vertex(x,y,z,tone){
    vertices.push(x,y,z);
    tint.copy(underside).lerp(shade,THREE.MathUtils.smoothstep(tone,-.42,.05));
    tint.lerp(light,THREE.MathUtils.smoothstep(tone,.18,.32));
    colors.push(tint.r,tint.g,tint.b);
  }
  vertex(-1,0,0,0);
  for(let i=1;i<slices;i++){
    const x=2*i/slices-1;
    const taper=Math.sqrt(1-x*x);
    let roof=.15*taper;
    for(const [center,width,height] of profile){
      const u=(x-center)/width;
      roof=Math.max(roof,height*Math.sqrt(Math.max(0,1-u*u)));
    }
    for(let j=0;j<sides;j++){
      const angle=j*Math.PI*2/sides, up=Math.cos(angle), across=Math.sin(angle);
      const y=up>=0?up*roof:-.19*taper*Math.pow(-up,.58);
      const z=across*(.38*taper+.15*roof);
      vertex(x,y,z,up*.72+across*.15-x*.12);
    }
  }
  const end=vertices.length/3;
  vertex(1,0,0,0);
  for(let j=0;j<sides;j++){
    const a=1+j,b=1+(j+1)%sides;
    indices.push(0,b,a);
    for(let i=0;i<slices-2;i++){
      const left=a+i*sides,next=b+i*sides;
      indices.push(left,next,left+sides,next,next+sides,left+sides);
    }
    indices.push(end,a+(slices-2)*sides,b+(slices-2)*sides);
  }
  const geometry=new THREE.BufferGeometry();
  const position=new THREE.Float32BufferAttribute(vertices,3);
  geometry.setAttribute('position',position);
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  // O temporal engrossa a base e alarga o topo para formar uma bigorna a sotavento.
  const fair=position.array.slice();
  let lastStorm=0;
  function shape(storm){
    if(storm===lastStorm || (storm>0 && storm<1 && Math.abs(storm-lastStorm)<.016))return;
    lastStorm=storm;
    for(let i=0;i<position.count;i++){
      const k=i*3,x=fair[k],y=fair[k+1],z=fair[k+2];
      const cap=THREE.MathUtils.smoothstep(y,.12,.58);
      position.setXYZ(i,x*(1+.17*cap*storm)+cap*.21*storm,
        y*(1+storm*(y<0 ? .95 : .16)),z*(1+.22*storm*cap));
    }
    position.needsUpdate=true;geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }
  return {geometry,shape};
}

export function cloudField(scene,random) {
  const group=new THREE.Group();group.name='Camadas de nuvens';scene.add(group);
  const material=new THREE.MeshLambertMaterial({vertexColors:true,color:0xffffff,
    emissive:0x5b6278,emissiveIntensity:.26});
  const banks=cloudProfiles.map(profile=>{
    const {geometry,shape}=cloudVolume(profile);
    const layout=Array.from({length:16},()=>({
      x:random()*720,z:random()*760-320,y:49+random()*38,
      radius:10+random()*10, heading:(random()-.5)*1.5, speed:.8+random()*1.3
    }));
    const mesh=new THREE.InstancedMesh(geometry,material,layout.length);
    mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);return {mesh,layout,shape};
  });
  const curtain=new THREE.Mesh(new THREE.CylinderGeometry(195,197,48,64,1,true),
    new THREE.ShaderMaterial({
      uniforms:{phase:{value:0}},side:THREE.DoubleSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 vUv;uniform float phase;
        void main(){float a=vUv.x*6.2831853;
          float foot=.27+.10*sin(4.*a+phase)+.08*sin(9.*a-phase*.6);
          float y=vUv.y-foot;
          float band=smoothstep(0.,.08,y)*(1.-smoothstep(.08,.55,y));
          float folds=.60+.24*sin(34.*a+phase)+.13*sin(83.*a-phase);
          gl_FragColor=vec4(mix(vec3(.20,.91,.61),vec3(.61,.39,.92),smoothstep(.0,.40,y)),band*folds*.66);
        }`
    }));
  curtain.position.set(0,59,-14);curtain.visible=false;group.add(curtain);
  const dummy=new THREE.Object3D(),dark=new THREE.Color(0x7987aa);
  const clear=new THREE.Color(0xfffdf7),sunset=new THREE.Color(0xffbc91),night=new THREE.Color(0x969fbe);
  let cover=0,wind=0,tick=1;
  function update(dt,time,event){
    const target=event==='tempest'?1:event==='rain' ? .63 : event==='solar' ? .40 : event==='drought' ? -.35 : 0;
    cover+=(target-cover)*(1-Math.exp(-dt*.62));
    if(Math.abs(target-cover)<.002)cover=target;
    const storm=Math.max(0,cover);
    wind+=dt*(1+storm*2);
    if(!group.visible)return;
    curtain.visible=event==='aurora';
    if(curtain.visible)curtain.material.uniforms.phase.value+=dt*.36;
    if((tick+=dt)<.11)return;
    tick=0;
    const dusk=Math.max(0,1-Math.min(Math.abs(time-6),Math.abs(time-18))/2.2);
    const daylight=THREE.MathUtils.smoothstep(-Math.cos(time*Math.PI/12),-.20,.22);
    material.color.copy(night).lerp(clear,daylight).lerp(sunset,dusk*.58).lerp(dark,storm*.95);
    material.emissiveIntensity=.14+daylight*.18;
    for(const {mesh,layout,shape} of banks){
      shape(storm);
      for(let i=0;i<mesh.count;i++){
        const bank=layout[i],size=bank.radius*(1+.41*cover);
        const x=(bank.x+wind*bank.speed)%720-270;
        dummy.position.set(x,bank.y-13*storm,bank.z+3*Math.sin(.014*wind+bank.heading));
        dummy.rotation.y=bank.heading;
        dummy.scale.set(size*(1.55+.38*storm),size*(.90+.17*storm),size*1.33);
        dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate=true;
      // O passe de sombras também consulta a esfera de todas as instâncias.
      if(mesh.castShadow)mesh.computeBoundingSphere();
    }
  }
  function quality(level){
    group.visible=level!=='baixa';
    for(const {mesh,layout} of banks){
      mesh.count=level==='alta'?layout.length:9;
      mesh.castShadow=level==='alta';
    }
    tick=1;
  }
  update(0,10,null);return {group,update,quality};
}
