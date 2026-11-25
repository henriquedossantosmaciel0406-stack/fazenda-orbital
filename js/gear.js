export const CANS=[
  {name:'Regador de lata',body:0x789DA0,trim:0xDBBE8D},
  {name:'Regador de cobre',body:0xBD734A,trim:0xFFCB78},
  {name:'Regador esmaltado',body:0x398E86,trim:0xF6E9C2},
  {name:'Regador solar',body:0xD59B33,trim:0x65597A},
  {name:'Regador orbital',body:0x5279B6,trim:0xA1E7E3}
];
export const canLevel = s => Math.max(1,Math.min(CANS.length,Math.round(s.maxWater/10)));
export const canEfficiency = s => 1+(canLevel(s)-1)*0.25;
