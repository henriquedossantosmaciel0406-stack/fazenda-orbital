// Pigmentos em sRGB. Os mapas são gerados uma vez e filtrados por distância pela GPU.
import * as THREE from 'three';

function paintedTexture(width,height,sample) {
  const pixels=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const color=sample((x+.5)/width,(y+.5)/height);
    const i=(y*width+x)*4;
    pixels[i]=color>>16; pixels[i+1]=color>>8; pixels[i+2]=color; pixels[i+3]=255;
  }
  const texture=new THREE.DataTexture(pixels,width,height,THREE.RGBAFormat);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true; texture.needsUpdate=true;
  return texture;
}

const tau=2*Math.PI;
export function meadowPaint() {
  const texture=paintedTexture(128,128,(u,v)=>{
    const x=u*tau,y=v*tau;
    const wash=Math.sin(x+Math.cos(2*y))+.7*Math.cos(2*y+.9*Math.sin(2*x))+.28*Math.sin(3*x-y);
    if(wash>.86)return 0x96cb75;
    if(wash<-.8)return 0x79b771;
    return 0x86c374;
  });
  texture.repeat.set(12,12);
  return texture;
}

export function seaPaint() {
  const texture=paintedTexture(256,128,(u,v)=>{
    const x=u*tau,y=v*tau;
    const wave=Math.sin(3*y+.62*Math.sin(x+y)+.28*Math.cos(3*x-y));
    const breaks=Math.cos(2*x+y)+.50*Math.cos(3*x-2*y);
    if(wave>.92 && breaks>.23)return 0x9be4d6;
    if(wave>.66 && breaks>-.12)return 0x63cad1;
    if(wave<-.45)return 0x389bb9;
    return 0x47b1c6;
  });
  texture.repeat.set(110,145);
  return texture;
}

export function planetPaint(){
  const colors=[0x7861ac,0x917abf,0xc39aca,0xe2b0be,0xf0ceb0,0xc88eb2,0xa881bd];
  const texture=paintedTexture(256,128,(u,v)=>{
    const latitude=v+.017*Math.sin(tau*u*2)+.010*Math.cos(tau*(u*3+v));
    const spot=((u-.69)/.085)**2+((latitude-.44)/.049)**2;
    if(spot<.42)return 0x9d698f;
    if(spot<1)return 0xefbdaf;
    return colors[Math.floor(latitude*17+7*colors.length)%colors.length];
  });
  texture.wrapT=THREE.ClampToEdgeWrapping;
  return texture;
}
