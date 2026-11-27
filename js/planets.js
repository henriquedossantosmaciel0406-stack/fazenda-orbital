// Cada destino tem uma geologia própria. O número do setor acompanha as voltas.
const worlds=[
  {name:'Colônia Orbital',soil:0x8b5e3c,land:0x83c878,stone:0x737d76,glow:0xbceaa8},
  {name:'Mira · campos de vidro',soil:0x486877,land:0x789b9b,stone:0x416279,glow:0x7df5dc},
  {name:'Hélio · planalto âmbar',soil:0x995650,land:0xc68566,stone:0x764853,glow:0xffca76},
  {name:'Nix · jardim lunar',soil:0x665374,land:0x9b90ba,stone:0x625486,glow:0xe2b2ff}
];
export function planetAt(rank){
  if(!Number.isSafeInteger(rank)||rank<1)return worlds[0];
  const planet=worlds[1+(rank-1)%3],sector=Math.ceil(rank/3);
  return sector===1?planet:{...planet,name:planet.name+' · setor '+sector};
}
