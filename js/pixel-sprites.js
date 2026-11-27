// Rasteriza uma vez por ícone, na mesma grade para mochila, loja e HUD.
const cache=new Map();
export function setSprite(img,path){
  img.dataset.spritePath=path;
  let job=cache.get(path);
  if(!job){
    job=new Promise(resolve=>{
      const source=new Image();source.onerror=()=>resolve(path);
      source.onload=()=>{
        const size=48,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
        const ctx=canvas.getContext('2d');
        if(!ctx){resolve(path);return;}
        const scale=(size-4)/Math.max(source.width,source.height);
        const w=Math.round(source.width*scale),h=Math.round(source.height*scale);
        ctx.imageSmoothingEnabled=source.width>48;
        ctx.drawImage(source,(size-w)>>1,(size-h)>>1,w,h);
        const image=ctx.getImageData(0,0,size,size),pixels=image.data,input=pixels.slice();
        for(let y=1;y<size-1;y++)for(let x=1;x<size-1;x++){
          const i=4*(y*size+x);
          if(input[i+3]<115){
            const edge=[-4,4,-4*size,4*size].some(d=>input[i+d+3]>180);
            pixels[i]=31;pixels[i+1]=36;pixels[i+2]=55;pixels[i+3]=edge?255:0;
          }else{
            for(let c=0;c<3;c++)pixels[i+c]=Math.round(input[i+c]/12)*12;
            pixels[i+3]=255;
          }
        }
        ctx.putImageData(image,0,0);resolve(canvas.toDataURL());
      };
      source.src=path;
    });
    cache.set(path,job);
  }
  job.then(url=>{if(img.dataset.spritePath===path)img.src=url;});
}
