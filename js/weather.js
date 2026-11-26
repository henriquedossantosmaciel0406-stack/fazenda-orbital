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

// Centros e semieixos em três dimensões. Há gomos na frente, no topo e no fundo.
const cloudProfiles=[
  [[-.58,.05,-.03,.46,.40,.45],[-.20,.29,.04,.54,.59,.46],
   [.28,.25,-.20,.49,.49,.53],[.63,.06,.06,.44,.35,.38],[-.16,.04,.34,.42,.31,.35]],
  [[-.64,.03,.10,.41,.29,.36],[-.26,.18,-.18,.52,.43,.47],
   [.18,.37,.03,.52,.68,.51],[.60,.10,.03,.45,.40,.41],[.19,.11,.34,.41,.36,.34]],
  [[-.68,.04,-.07,.43,.28,.42],[-.32,.15,.15,.48,.41,.47],
   [.12,.17,-.18,.55,.42,.53],[.56,.09,.12,.52,.35,.41],[.27,-.01,.37,.34,.23,.31]]
];

function cloudVolume(profile) {
  // Projetar uma única casca sobre os gomos mantém a silhueta contínua de todos os ângulos.
  const geometry=new THREE.SphereGeometry(1,40,24);
  const position=geometry.attributes.position;
  const colors=[],tint=new THREE.Color();
  const shade=new THREE.Color(0xa4b4cf), body=new THREE.Color(0xe5eaf0), light=new THREE.Color(0xfffaeb);
  const lobes=[[0,0,0,.96,.32,.53],...profile];
  const direction=new THREE.Vector3();
  for(let i=0;i<position.count;i++){
    direction.fromBufferAttribute(position,i);
    const {x,y,z}=direction;
    let radius=0;
    for(const [cx,cy,cz,rx,ry,rz] of lobes){
      const a=(x/rx)**2+(y/ry)**2+(z/rz)**2;
      const b=x*cx/rx**2+y*cy/ry**2+z*cz/rz**2;
      const c=(cx/rx)**2+(cy/ry)**2+(cz/rz)**2-1;
      const disc=b*b-a*c;
      if(disc<0)continue;
      const outer=(b+Math.sqrt(disc))/a;
      const overlap=Math.max(0,.065-Math.abs(radius-outer));
      radius=Math.max(radius,outer)+overlap*overlap/.26;
    }
    const py=y*radius;
    const underside=py<0?py*.62:py;
    position.setXYZ(i,x*radius,underside,z*radius);
    const relief=py+.11*Math.sin(8*x*radius+3*z)*Math.cos(5*z*radius)-.08*x;
    tint.copy(shade).lerp(body,THREE.MathUtils.smoothstep(relief,-.22,.16));
    tint.lerp(light,THREE.MathUtils.smoothstep(relief,.18,.49));
    colors.push(tint.r,tint.g,tint.b);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
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
    const variation=new THREE.Color();
    for(let i=0;i<layout.length;i++){
      const warmth=.5+.5*Math.sin(layout[i].x);
      mesh.setColorAt(i,variation.setRGB(.94+.06*warmth,.96+.03*warmth,1-.04*warmth));
    }
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
