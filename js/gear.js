import {dragonActive} from './state.js';
export const CANS=[
  {name:'Regador de lata',body:0x789DA0,trim:0xDBBE8D},
  {name:'Regador de cobre',body:0xBD734A,trim:0xFFCB78},
  {name:'Regador esmaltado',body:0x398E86,trim:0xF6E9C2},
  {name:'Regador solar',body:0xD59B33,trim:0x65597A},
  {name:'Regador orbital',body:0x5279B6,trim:0xA1E7E3},
  {name:'Regador de névoa',body:0x68a8ad,trim:0xc0ffe2,rank:1},
  {name:'Regador de magma',body:0x773d53,trim:0xffac52,rank:2},
  {name:'Regador gravitacional',body:0x534583,trim:0xc7adff,rank:3}
];
export const canLevel = s => Math.max(1,Math.min(CANS.length,Math.round(s.maxWater/10)));
export const canEfficiency = s => (1+(canLevel(s)-1)*0.25)*(dragonActive()?2:s.activePet==='axolotl'?1.3:1);
