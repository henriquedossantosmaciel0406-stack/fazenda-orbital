export function touchesSolid(c,x,z,padding){
  if(c.halfX!==undefined)return Math.abs(x-c.x)<c.halfX+padding && Math.abs(z-c.z)<c.halfZ+padding;
  return Math.hypot(x-c.x,z-c.z)<c.radius+padding;
}
