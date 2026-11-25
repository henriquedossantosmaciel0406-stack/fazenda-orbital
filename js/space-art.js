import {layout} from './space-rules.js';
const S=40;
export function drawOrbit(canvas,time){
  const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  const sky=c.createLinearGradient(0,0,w,h);sky.addColorStop(0,'#15253e');sky.addColorStop(1,'#384067');c.fillStyle=sky;c.fillRect(0,0,w,h);
  for(let i=0;i<95;i++){c.fillStyle=i%4?'#b9dedb':'#f9d99b';const x=(i*137.51-time*(i%3+1)*3)%w;c.fillRect((x+w)%w,(i*i*13+21)%h,i%3+1,i%3+1);}
}
function ellipse(c,x,y,rx,ry,color,edge){
  c.beginPath();c.ellipse(x,y,rx,ry,0,0,7);c.fillStyle=color;c.fill();if(edge){c.strokeStyle=edge;c.lineWidth=2;c.stroke();}
}
function poly(c,points,color,edge){
  c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();
  if(edge){c.strokeStyle=edge;c.lineWidth=2;c.stroke();}
}
export function chart(canvas,t,progress=0){
  drawOrbit(canvas,t);const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,ink='#233044';
  ellipse(c,w*.12,h*1.1,h*.73,h*.73,'#68ad97',ink);ellipse(c,w*.14,h*.76,h*.40,h*.10,'#a2c893');
  ellipse(c,w*.8,h*.45,h*.28,h*.28,'#eda965',ink);ellipse(c,w*.77,h*.38,h*.10,h*.05,'#fbd490');ellipse(c,w*.84,h*.55,h*.07,h*.035,'#c57e5e');
  c.save();c.translate(w*.8,h*.45);c.rotate(-.22);c.beginPath();c.ellipse(0,0,h*.47,h*.09,0,0,Math.PI);c.strokeStyle='#f6d395';c.lineWidth=6;c.stroke();c.restore();
  c.setLineDash([3,8]);c.strokeStyle='#9bbbd0';c.beginPath();c.moveTo(w*.17,h*.73);c.quadraticCurveTo(w*.43,-h*.08,w*.74,h*.39);c.stroke();c.setLineDash([]);
  const a=.18+progress*.54; c.save();c.translate(w*a,h*(.64-.40*Math.sin(progress*2.3)));c.rotate(-.33);
  poly(c,[[-16,-5],[-31,0],[-15,5]],'#ffc767');poly(c,[[-12,-5],[-15,-13],[1,-6]],'#dc795b',ink);poly(c,[[-12,5],[-15,13],[1,6]],'#dc795b',ink);
  ellipse(c,0,0,17,8,'#f3dfb7',ink);ellipse(c,3,-2,5,5,'#71d1d3',ink);c.restore();
}
export function dungeon(canvas,r,t){
  const c=canvas.getContext('2d'),map=layout(r),ink='#203044',dark=r.sector?'#3f465e':'#38535c',rock=r.sector?'#817595':'#648785';
  drawOrbit(canvas,t);
  const ox=(canvas.width-map[0].length*S)/2,oy=12,bob=Math.sin(t*3)*1.1;c.save();c.translate(ox,oy);
  const at=(p,draw)=>{if(!p)return;c.save();c.translate(p.x*S+20,p.y*S+21);draw();c.restore();};
  for(let y=0;y<map.length;y++)for(let x=0;x<map[y].length;x++){
    const dx=x*S,dy=y*S,seed=(x*37+y*19)%7;
    if(map[y][x]==='#'){
      poly(c,[[dx+1,dy+8],[dx+10,dy+2],[dx+31,dy+3],[dx+39,dy+10],[dx+39,dy+36],[dx+29,dy+40],[dx+1,dy+36]],dark,ink);
      poly(c,[[dx+2,dy+7],[dx+10,dy+1],[dx+32,dy+2],[dx+39,dy+9],[dx+32,dy+24],[dx+12,dy+27],[dx+2,dy+20]],rock,ink);
      if(seed<3)poly(c,[[dx+10,dy+8],[dx+17,dy+5],[dx+23,dy+8],[dx+16,dy+10]],'#a2aba0');
    }else{
      c.fillStyle=seed%3===0?'#505f71':'#495969';c.fillRect(dx+1,dy+1,38,38);
      if(r.sector===2&&!r.room){
        c.fillStyle=['#567787','#59888a','#628f89'][seed%3];c.fillRect(dx,dy,S,S);
        c.strokeStyle='#8cb9aa';c.beginPath();c.moveTo(dx+4,dy+29);c.quadraticCurveTo(dx+12,dy+24,dx+22,dy+29);c.stroke();
        if(seed===1)poly(c,[[dx+24,dy+19],[dx+28,dy+5],[dx+33,dy+20]],'#ca98cd',ink);
      }
      if(seed<3){c.fillStyle='#718391';c.fillRect(dx+5+seed*3,dy+26,3,2);}
    }
  }
  r.danger.forEach(v=>at(v,()=>{c.fillStyle='#ff955dbb';c.fillRect(-18,-19,36,36);poly(c,[[-8,7],[0,-8],[8,7]],'#713c41');}));
  at(r.trader,()=>{ellipse(c,0,7,13,10,'#784888',ink);ellipse(c,0,-4,12,10,'#93edb6',ink);for(const x of [-5,5])ellipse(c,x,-5,3,4,ink);});
  at(r.portal,()=>{ellipse(c,0,2,17,14,'#202d39',ink);ellipse(c,0,2,12,9,r.ore>=3?'#77e9b7':'#959eaa');ellipse(c,0,2,9,6,'#394857');});
  at(r.kit,()=>{c.fillStyle='#eacb84';c.fillRect(-9,-8,18,16);c.fillStyle='#44755c';c.fillRect(-2,-5,4,10);c.fillRect(-6,-2,12,4);});
  for(const v of r.veins)at(v,()=>{ellipse(c,0,10,14,5,'#293b47');const a=r.sector?'#8cdada':'#f1b35e',b=r.sector?'#c2fbec':'#ffe4a0';
    for(const [x,y,size] of [[-7,2,.70],[7,4,.63],[0,0,1]]){c.save();c.translate(x,y);c.scale(size,size);poly(c,[[-7,1],[-2,-15],[5,-8],[8,3],[3,11],[-4,10]],a,ink);poly(c,[[-2,-13],[1,0],[-4,8],[-5,0]],b);c.restore();}});
  for(const e of r.enemies)at(e,()=>{const boss=e.boss,red=r.sector?'#a48ac1':'#d58a4d';ellipse(c,0,12,boss?22:13,5,'#293b47');c.translate(0,bob);
    if(boss){for(const side of [-1,1]){poly(c,[[side*11,0],[side*23,-9],[side*22,6],[side*15,12]],red,ink);}
      if(r.sector){ellipse(c,0,-2,17,16,red,ink);ellipse(c,1,-4,10,9,'#706393',ink);ellipse(c,2,-4,4,4,'#d5baec');}
      else{poly(c,[[-14,-5],[-12,-22],[-4,-15],[0,-25],[6,-15],[13,-22],[14,-4]],'#f6c65d',ink);ellipse(c,0,0,17,13,red,ink);}
    }else{poly(c,[[-10,-2],[-17,-7],[-15,3],[-8,6]],'#93aaa8',ink);poly(c,[[8,-2],[17,-7],[15,3],[8,6]],'#93aaa8',ink);ellipse(c,0,1,11,9,'#c89d70',ink);}
    ellipse(c,0,1,boss?11:7,4,ink);ellipse(c,0,1,boss?5:3,2,'#ffc661');c.fillStyle='#2b3445';c.fillRect(-14,-28,28,3);c.fillStyle='#ffad70';c.fillRect(-14,-28,28*e.hp/(boss?9+r.sector*3:4),3);});
  at(r,()=>{ellipse(c,0,12,12,4,'#2b3846');poly(c,[[-9,3],[-5,0],[6,0],[10,6],[8,13],[3,13],[1,9],[-2,13],[-8,13]],'#e3b877',ink);ellipse(c,0,-3,12,12,'#f7e6bd',ink);ellipse(c,1,-3,9,7,'#3e7585',ink);ellipse(c,-2,-5,3,2,'#c3eeeb');});
  c.restore();
}
