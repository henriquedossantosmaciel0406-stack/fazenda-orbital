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

export function cloudField(scene,random) {
  const count=72,puffs=6,layout=[];
  const group=new THREE.Group();group.name='Camadas de nuvens';
  const m=new THREE.MeshLambertMaterial({color:0xFFF9ED,emissive:0x555C73,emissiveIntensity:0.26,flatShading:false});
  const field=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),m,count*puffs);
  field.name='Bancos de nuvem';
  const puffColor=new THREE.Color();
  for(let i=0;i<field.count;i++){
    const edge=Math.abs((i%puffs)-2.5)/2.5;
    field.setColorAt(i,puffColor.setRGB(0.81+0.19*edge,0.85+0.15*edge,0.93+0.07*edge));
  }
  field.frustumCulled=false;field.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(field);scene.add(group);
  for(let i=0;i<count;i++){
    const parts=[];const radius=4+random()*6;
    for(let j=0;j<puffs;j++)parts.push([(j-2.5)*radius*0.61,(j>0&&j<5?1:0)*random()*radius*0.52,(random()-0.5)*radius,0.56+random()*0.43]);
    layout.push({x:random()*720-270,z:random()*760-320,y:44+random()*41,radius,speed:1+random()*1.6,parts});
  }
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
  const dummy=new THREE.Object3D(), dark=new THREE.Color(0x6F7D91),clear=new THREE.Color(0xFFF9ED),sunset=new THREE.Color(0xF4C199);
  let cover=0,wind=0,tick=1;
  function update(dt,time,event){
    curtain.visible=event==='aurora';
    if(curtain.visible)curtain.material.uniforms.phase.value+=dt*.36;
    const storm=event==='tempest'?1.25:event==='rain'?0.78:event==='solar'?0.67:event==='drought'?-0.63:0;
    cover+=(storm-cover)*(1-Math.exp(-dt*0.7));wind+=dt*(1+Math.max(0,cover)*1.85);
    if((tick+=dt)<0.13)return;tick=0;
    const shade=THREE.MathUtils.clamp(cover,0,1);
    m.color.copy(clear).lerp(dark,shade);
    const dusk=Math.max(0,1-Math.min(Math.abs(time-6),Math.abs(time-18))/2);
    m.color.lerp(sunset,dusk*(1-shade)*0.52);
    m.emissiveIntensity=time<6||time>19?0.20:0.38;
    let id=0;
    for(const layer of layout){
      const x=((layer.x+270+wind*layer.speed)%720)-270, z=layer.z+Math.sin(wind*0.012+layer.x)*4;
      const radius=layer.radius*(1+cover*0.64);
      for(const [ox,oy,oz,k] of layer.parts){
        const gust=Math.sin(wind*.19+layer.x*.04);
        dummy.position.set(x+ox*(1+cover*.55)+oy*cover,layer.y-cover*11+oy*(1+Math.max(0,cover)) + gust*cover,z+oz);
        dummy.scale.set(radius*k*1.34,radius*k*(0.58+Math.max(0,cover)*0.23),radius*k);dummy.updateMatrix();field.setMatrixAt(id++,dummy.matrix);
      }
    }
    field.instanceMatrix.needsUpdate=true;
  }
  update(0,10,null);return {group,update};
}
