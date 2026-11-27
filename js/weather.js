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
  for(const [dx,dz] of [[245,0],[0,345],[245,345],[-245,0],[-245,345]])cover(dx-110,dx,dz-245,dz+20);
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

// Campo periódico de umidade. Os dois canais têm escalas e fases independentes.
function vaporMap(){
  const size=256, pixels=new Uint8Array(size*size*4);
  function noise(u,v,n,salt){
    const px=u*n,py=v*n,x=Math.floor(px),y=Math.floor(py);
    const ease=t=>t*t*(3-2*t);
    const hash=(a,b)=>{
      let h=Math.imul(a%n+salt,374761393)+Math.imul(b%n,668265263);
      h=Math.imul(h^(h>>>13),1274126177);
      return ((h^(h>>>16))>>>0)/4294967295;
    };
    const mix=THREE.MathUtils.lerp;
    return mix(mix(hash(x,y),hash(x+1,y),ease(px-x)),mix(hash(x,y+1),hash(x+1,y+1),ease(px-x)),ease(py-y));
  }
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=4*(x+size*y),u=x/size,v=y/size;
    for(let c=0;c<2;c++){
      let sum=0;
      for(let k=0;k<5;k++)sum+=noise(u,v,4<<k,31*(c+1)+k)/(2**(k+1));
      pixels[i+c]=Math.round(sum*255/.96875);
    }
    pixels[i+3]=255;
  }
  const map=new THREE.DataTexture(pixels,size,size);
  map.wrapS=map.wrapT=THREE.RepeatWrapping;
  map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;
  map.generateMipmaps=true;map.needsUpdate=true;return map;
}

export function cloudField(scene){
  const group=new THREE.Group();scene.add(group);
  const uniforms={vapor:{value:vaporMap()},wind:{value:new THREE.Vector2()},evolution:{value:0},
    cover:{value:0},squall:{value:0},lowDetail:{value:false},sunDir:{value:new THREE.Vector2()},lit:{value:new THREE.Color()},base:{value:new THREE.Color()}};
  const density=`
    uniform sampler2D vapor;uniform vec2 wind,sunDir;uniform float cover,evolution,squall;
    uniform bool lowDetail;
    float front(vec2 uv){
      return .5+.5*sin(uv.x*9.+uv.y*4.+2.*sin(uv.y*8.+evolution*4.));
    }
    float density(vec2 p){
      vec2 uv=p*.0036+wind;
      float bank=front(uv)*squall;
      if(lowDetail)return texture2D(vapor,uv).r+cover*.12+bank*.09;
      vec2 curl=texture2D(vapor,uv*.57+vec2(evolution,0.)).rg-.5;
      vec2 field=texture2D(vapor,uv+curl*(.26+.48*squall)+vec2(.085*bank,0.)).rg;
      float wisps=texture2D(vapor,uv*2.83-curl*.32-wind*.44).g;
      return field.r*.68+field.g*.21+wisps*.11+cover*.12+bank*.09;
    }`;
  const surface=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:`varying vec3 wp;void main(){wp=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`,
    fragmentShader:density+`
      varying vec3 wp;uniform vec3 lit,base;
      void main(){
        float d=density(wp.xz);
        float haze=1.-smoothstep(270.,510.,distance(wp.xz,cameraPosition.xz));
        float a=smoothstep(.425,.575,d)*haze;
        if(a<.007)discard;
        float upstream=lowDetail ? d : density(wp.xz+sunDir*8.);
        float edge=1.-smoothstep(.47,.63,d);
        float relief=clamp(.48+4.5*(d-upstream)+.54*edge,0.,1.);
        vec3 ink=mix(base,lit,mix(relief,smoothstep(.24,.8,relief),.24));
        float shelf=front(wp.xz*.0036+wind);
        ink*=1.-squall*(.20+.38*shelf)*smoothstep(.45,.7,d);
        gl_FragColor=vec4(ink,a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const veil=new THREE.Mesh(new THREE.PlaneGeometry(1150,1150),surface);
  veil.rotation.x=-Math.PI/2;veil.renderOrder=-60;group.add(veil);
  // A sombra usa a mesma densidade da camada visível.
  const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
  depth.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,uniforms);
    sh.vertexShader='varying vec2 cloudXZ;\n'+sh.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\ncloudXZ=(modelMatrix*vec4(transformed,1.)).xz;');
    sh.fragmentShader='varying vec2 cloudXZ;\n'+density+'\n'+sh.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\nif(density(cloudXZ)<.59)discard;');
  };
  veil.customDepthMaterial=depth;
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
  const shade=new THREE.Color(0xa2afcb),stormShade=new THREE.Color(0x565f79);
  const day=new THREE.Color(0xfffbef),night=new THREE.Color(0x7987aa),dusk=new THREE.Color(0xffc29c);
  let amount=0, gustTime=0;
  function update(dt,time,event,viewer){
    const target=event==='tempest'?1:event==='rain' ? .7 : event==='drought' ? -.85 : event==='rainbow' ? -.32 : event==='dew' ? .42 : event==='solstice' ? -.38 : 0;
    amount+=(target-amount)*(1-Math.exp(-dt*.23));
    const gust=uniforms.squall;
    gust.value+=((event==='tempest'?1:0)-gust.value)*(1-Math.exp(-dt*.34));
    gustTime+=dt;
    curtain.visible=event==='aurora';
    if(curtain.visible)curtain.material.uniforms.phase.value+=dt*.36;
    const a=time*Math.PI/12, daylight=THREE.MathUtils.smoothstep(-Math.cos(a),-.18,.25);
    const sunset=1-THREE.MathUtils.smoothstep(Math.abs(Math.cos(a)),0,.38);
    uniforms.cover.value=amount;
    const speed=.0026+Math.max(amount,0)*.004+gust.value*(.009+.004*Math.sin(gustTime*.85));
    uniforms.wind.value.x-=dt*speed;
    uniforms.wind.value.y-=dt*speed*(.24+gust.value*.22*Math.sin(gustTime*.52));
    uniforms.evolution.value+=dt*(.002+gust.value*.019);
    uniforms.sunDir.value.set(Math.cos(a),Math.sin(a));
    uniforms.lit.value.copy(night).lerp(day,daylight).lerp(dusk,sunset*.72).lerp(shade,Math.max(0,amount)*.63);
    uniforms.base.value.copy(night).lerp(shade,daylight).lerp(stormShade,Math.max(0,amount));
    veil.position.set(viewer?.x??0,63-amount*19,viewer?.z??0);veil.updateMatrix();
  }
  function quality(level){uniforms.lowDetail.value=level==='baixa';veil.castShadow=level==='alta';}
  update(0,10,null);return {group,update,quality};
}
