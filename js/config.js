// Configuracao e balanceamento do Fazenda Orbital (dados puros, sem logica de jogo)
const CONFIG_IRR = ['sprinkler', 'drip', 'rotary', 'cloud'];
export const CONFIG = {
  version: 4,
  player: { height: 1.7, speed: 5.4, runMultiplier: 1.65 },
  start: { money: 120, water: 10, maxWater: 10, energy: 20, speedLevel: 1, yieldLevel: 1 },
  hotbarPageSize: 9,
  dayLength: 300,
  baseStockLimit: 100,
  baseMaxEnergy: 100,
  islandLevel: 8,
  island: { x: -40, z: -200, radius: 44 },
  crystalPrice: 70,
  farmArea: { x0: -100, x1: -10, z0: -100, z1: 14 },

  cropOrder: ['lettuce', 'strawberry', 'carrot', 'corn', 'tomato', 'mushroom', 'grape', 'flower', 'pumpkin', 'melon', 'pepper', 'lotus'],
  crops: {
    lettuce:    { name: 'Alface',            short: 'ALF', seedCost: 5,   sellPrice: 14,   growTime: 18,  waterUse: 1, color: 0x7ED957, level: 1,  xp: 8,   rp: 1 },
    strawberry: { name: 'Morango',           short: 'MOR', seedCost: 12,  sellPrice: 38,   growTime: 35,  waterUse: 2, color: 0xFF6FA5, level: 1,  xp: 12,  rp: 1 },
    carrot:     { name: 'Cenoura solar',     short: 'CEN', seedCost: 8,   sellPrice: 26,   growTime: 26,  waterUse: 1, color: 0xFF8A2A, level: 2,  xp: 10,  rp: 1 },
    corn:       { name: 'Milho cristal',     short: 'MIL', seedCost: 30,  sellPrice: 95,   growTime: 60,  waterUse: 3, color: 0x59E6FF, level: 3,  xp: 22,  rp: 2 },
    tomato:     { name: 'Tomate pulsar',     short: 'TOM', seedCost: 20,  sellPrice: 62,   growTime: 46,  waterUse: 2, color: 0xFF4D5E, level: 3,  xp: 16,  rp: 2 },
    mushroom:   { name: 'Cogumelo nebulosa', short: 'COG', seedCost: 55,  sellPrice: 190,  growTime: 90,  waterUse: 4, color: 0xB26BFF, level: 4,  xp: 40,  rp: 3 },
    grape:      { name: 'Uva cometa',        short: 'UVA', seedCost: 70,  sellPrice: 235,  growTime: 100, waterUse: 4, color: 0x8E6BFF, level: 5,  xp: 50,  rp: 3 },
    flower:     { name: 'Flor orbital',      short: 'FLO', seedCost: 90,  sellPrice: 320,  growTime: 125, waterUse: 5, color: 0xFF6BE0, level: 5,  xp: 65,  rp: 4 },
    pumpkin:    { name: 'Abobora aurora',    short: 'ABO', seedCost: 115, sellPrice: 410,  growTime: 140, waterUse: 5, color: 0xFFB347, level: 6,  xp: 80,  rp: 5 },
    melon:      { name: 'Melancia lunar',    short: 'MEL', seedCost: 150, sellPrice: 540,  growTime: 170, waterUse: 6, color: 0x6BFFB0, level: 7,  xp: 100, rp: 6 },
    pepper:     { name: 'Pimenta nova',      short: 'PIM', seedCost: 210, sellPrice: 720,  growTime: 190, waterUse: 6, color: 0xFF3B3B, level: 8,  xp: 130, rp: 7 },
    lotus:      { name: 'Lotus estelar',     short: 'LOT', seedCost: 340, sellPrice: 1150, growTime: 240, waterUse: 8, color: 0x7FE9FF, level: 10, xp: 200, rp: 9 }
  },

  // Mutacoes: sorteadas ao plantar; a planta mutante brilha e rende itens especiais (mais valiosos).
  mutations: {
    golden:  { name: 'Dourada',   chance: 0.070, mult: 2.5, yield: 1, color: 0xFFD166, level: 2 },
    giant:   { name: 'Gigante',   chance: 0.060, mult: 1.5, yield: 2, color: 0x7ED957, level: 3 },
    crystal: { name: 'Cristalina', chance: 0.035, mult: 4,  yield: 1, color: 0x59E6FF, level: 5 },
    shadow:  { name: 'Sombria',   chance: 0.030, mult: 3.2, yield: 1, color: 0xB26BFF, level: 6 },
    rainbow: { name: 'Arco-iris', chance: 0.012, mult: 9,   yield: 1, color: 0xFF6BE0, level: 8 }
  },
  mutationOrder: ['rainbow', 'crystal', 'shadow', 'golden', 'giant'], // checadas da mais rara para a mais comum

  // Arvores frutiferas: plantadas em qualquer lugar livre; dao varios frutos repetidamente.
  treeOrder: ['apple', 'orange', 'peach', 'cherry', 'coconut', 'crystaltree'],
  trees: {
    apple:       { name: 'Macieira cristal',  fruit: 'Maca cristal',  short: 'MAC', saplingCost: 120,  level: 3,  growTime: 80,  fruitEvery: 28, maxFruits: 6, price: 22,  crown: 0x4FBF68, fruitColor: 0xFF4D5E, xp: 3 },
    orange:      { name: 'Laranjeira solar',  fruit: 'Laranja solar', short: 'LAR', saplingCost: 200,  level: 4,  growTime: 95,  fruitEvery: 30, maxFruits: 6, price: 38,  crown: 0x3FAF5A, fruitColor: 0xFFA020, xp: 4 },
    peach:       { name: 'Pessegueiro lunar', fruit: 'Pessego lunar', short: 'PES', saplingCost: 320,  level: 5,  growTime: 110, fruitEvery: 34, maxFruits: 7, price: 56,  crown: 0xFFB6D0, fruitColor: 0xFFC49A, xp: 5 },
    cherry:      { name: 'Cerejeira estelar', fruit: 'Cereja estelar', short: 'CER', saplingCost: 480, level: 6,  growTime: 125, fruitEvery: 36, maxFruits: 8, price: 80,  crown: 0xFF8FD0, fruitColor: 0xD0173A, xp: 6 },
    coconut:     { name: 'Coqueiro nebuloso', fruit: 'Coco nebuloso', short: 'COC', saplingCost: 720,  level: 8,  growTime: 150, fruitEvery: 46, maxFruits: 5, price: 160, crown: 0x38A88A, fruitColor: 0xE8D8B0, xp: 8 },
    crystaltree: { name: 'Arvore de cristal', fruit: 'Cristal doce',  short: 'ACR', saplingCost: 1300, level: 10, growTime: 190, fruitEvery: 60, maxFruits: 5, price: 300, crown: 0x59E6FF, fruitColor: 0xFF6BE0, xp: 12 }
  },
  baseTreeLimit: 6,

  // Melhorias de terreno
  land: {
    expand:  { name: 'Expansao do terreno', max: 5, costs: [0, 350, 800, 1800, 4000],   levels: [1, 2, 4, 6, 8], plots: [12, 16, 20, 24, 32], desc: 'Libera novos canteiros na fazenda.' },
    soil:    { name: 'Solo fertil',         max: 5, costs: [200, 450, 900, 1800, 3600], levels: [2, 3, 5, 7, 9], desc: 'Plantas crescem 8% mais rapido e podem render em dobro (5% por nivel).' },
    orchard: { name: 'Pomar ampliado',      max: 3, costs: [300, 900, 2200],            levels: [3, 6, 9],       desc: 'Permite plantar 4 arvores a mais por nivel.' }
  },

  products: {
    salad:   { name: 'Salada orbital',    from: { lettuce: 4 },    sellPrice: 90 },
    jam:     { name: 'Geleia estelar',    from: { strawberry: 3 }, sellPrice: 165 },
    sauce:   { name: 'Molho pulsar',      from: { tomato: 4 },     sellPrice: 300 },
    popcorn: { name: 'Pipoca de cristal', from: { corn: 3 },       sellPrice: 360 },
    soup:    { name: 'Sopa nebulosa',     from: { mushroom: 2 },   sellPrice: 470 },
    juice:   { name: 'Suco cometa',       from: { grape: 3 },      sellPrice: 820 },
    essence: { name: 'Essencia orbital',  from: { flower: 2 },     sellPrice: 760 },
    pie:     { name: 'Torta aurora',      from: { pumpkin: 2 },    sellPrice: 980 },
    sorbet:  { name: 'Sorvete lunar',     from: { melon: 2 },      sellPrice: 1150 }
  },

  upgrades: {
    speed: { name: 'Botas de velocidade', baseCost: 150, growth: 1.6, max: 5, desc: 'Aumenta sua velocidade de movimento.' },
    water: { name: 'Tanque de agua',      baseCost: 120, growth: 1.5, max: 5, desc: 'Aumenta a capacidade do regador.' },
    yield: { name: 'Luvas de colheita',   baseCost: 200, growth: 1.6, max: 5, desc: 'Aumenta a quantidade colhida.' }
  },

  drone: { prices: [450, 700, 1000, 1400], level: 2, cap: 60, speed: 4.5, drain: 0.35, idleDrain: 0.06, chargeRate: 5, height: 3.4 },

  // Construcoes (kind building) e decoracoes (kind decor). island:true => so na Ilha Cristalina.
  structures: {
    rain:    { kind: 'building', name: 'Coletor de chuva',   cost: 250,  level: 2, max: 3, radius: 1.8, rep: 2,  desc: 'Gera agua lentamente para o regador.', effect: l => '+' + (0.12 * l).toFixed(2) + ' agua por segundo' },
    battery: { kind: 'building', name: 'Bateria',            cost: 300,  level: 3, max: 3, radius: 1.6, rep: 2,  desc: 'Armazena mais energia para os drones.', effect: l => '+' + (60 * l) + ' energia maxima' },
    silo:    { kind: 'building', name: 'Silo',               cost: 400,  level: 3, max: 3, radius: 2.4, rep: 3,  desc: 'Aumenta o limite de estoque.', effect: l => '+' + (80 * l) + ' de estoque' },
    lab:     { kind: 'building', name: 'Laboratorio',        cost: 600,  level: 4, max: 1, radius: 3.0, rep: 5,  desc: 'Permite pesquisar tecnologias.', effect: l => 'Pesquisa liberada, +' + (0.04 * l).toFixed(2) + ' PP/s, PP ganhos +' + (20 * (l - 1)) + '%' },
    factory: { kind: 'building', name: 'Fabrica de alimentos', cost: 900, level: 6, max: 1, radius: 3.2, rep: 5,  desc: 'Transforma colheitas em produtos mais valiosos.', effect: l => 'Valor dos produtos +' + (15 * (l - 1)) + '%' },
    tower:   { kind: 'building', name: 'Torre decorativa',   cost: 700,  level: 5, max: 1, radius: 2.0, rep: 15, desc: 'Aumenta a reputacao e embeleza a fazenda.', effect: l => '+' + (15 * l) + ' reputacao' },
    reactor: { kind: 'building', name: 'Reator de cristal',  cost: 1400, crystals: 12, minRep: 60,  level: 8, max: 2, radius: 2.4, rep: 10, island: true, desc: 'Gera muita energia usando cristais.', effect: l => '+' + (1.2 * l).toFixed(1) + ' energia por segundo' },
    station: { kind: 'building', name: 'Estacao meteorologica', cost: 1100, crystals: 8, minRep: 100, level: 8, max: 1, radius: 2.0, rep: 10, island: true, desc: 'Reduz a duracao e o efeito de eventos ruins.', effect: l => 'Eventos ruins ' + (15 * l) + '% mais fracos' },

    sprinkler: { kind: 'building', name: 'Aspersor',             cost: 180,  level: 2, radius: 0.9, rep: 1, desc: 'Rega canteiros e arvores proximos automaticamente (gasta um pouco de agua).', irrigator: { range: 7,  interval: 7, water: 0.2,  energy: 0 },    effect: l => 'Alcance ' + (7 * (1 + 0.2 * (l - 1))).toFixed(1) + ' m, rega a cada ' + (7 * (1 - 0.12 * (l - 1))).toFixed(1) + ' s' },
    drip:      { kind: 'building', name: 'Gotejador inteligente', cost: 380,  level: 3, radius: 0.8, rep: 1, desc: 'Rega sem gastar agua, usando pouca energia. Alcance curto.',                irrigator: { range: 5.5, interval: 4, water: 0,   energy: 0.15 }, effect: l => 'Alcance ' + (5.5 * (1 + 0.2 * (l - 1))).toFixed(1) + ' m, rega a cada ' + (4 * (1 - 0.12 * (l - 1))).toFixed(1) + ' s, sem custo de agua' },
    rotary:    { kind: 'building', name: 'Aspersor rotativo',     cost: 420,  level: 4, radius: 1.0, rep: 2, desc: 'Gira e cobre uma grande area, gastando menos agua por canteiro.',           irrigator: { range: 11, interval: 6, water: 0.12, energy: 0 },    effect: l => 'Alcance ' + (11 * (1 + 0.2 * (l - 1))).toFixed(1) + ' m, rega a cada ' + (6 * (1 - 0.12 * (l - 1))).toFixed(1) + ' s' },
    cloud:     { kind: 'building', name: 'Nuvem irrigadora',      cost: 1500, level: 7, radius: 1.6, rep: 6, desc: 'Nuvem flutuante que chove sobre uma area enorme. Usa energia, nao agua.',  irrigator: { range: 17, interval: 5, water: 0,   energy: 1 },    effect: l => 'Alcance ' + (17 * (1 + 0.2 * (l - 1))).toFixed(1) + ' m, rega a cada ' + (5 * (1 - 0.12 * (l - 1))).toFixed(1) + ' s' },

    bench:        { kind: 'decor', name: 'Banco futurista',     cost: 80,  level: 1, max: 8,  radius: 1.3, rep: 2, desc: 'Um lugar para visitantes descansarem.' },
    lamp:         { kind: 'decor', name: 'Poste de luz',        cost: 60,  level: 1, max: 10, radius: 0.6, rep: 2, desc: 'Ilumina a fazenda.' },
    fountain:     { kind: 'decor', name: 'Fonte de energia',    cost: 220, level: 3, max: 4,  radius: 1.8, rep: 6, desc: 'Coluna de energia brilhante.' },
    sculpture:    { kind: 'decor', name: 'Escultura orbital',   cost: 300, level: 4, max: 4,  radius: 1.4, rep: 8, desc: 'Aneis que giram sem parar.' },
    planter:      { kind: 'decor', name: 'Canteiro decorativo', cost: 50,  level: 1, max: 10, radius: 1.2, rep: 2, desc: 'Flores coloridas, so para enfeitar.' },
    flag:         { kind: 'decor', name: 'Bandeira',            cost: 40,  level: 1, max: 10, radius: 0.5, rep: 1, desc: 'Bandeira da fazenda.' },
    droneStatue:  { kind: 'decor', name: 'Estatua de drone',    cost: 350, level: 5, max: 3,  radius: 1.2, rep: 8, desc: 'Homenagem aos ajudantes voadores.' },
    windmill:     { kind: 'decor', name: 'Moinho de vento',     cost: 320, level: 3, max: 3,  radius: 1.6, rep: 8, desc: 'Pas que giram com o vento.' },
    scarecrow:    { kind: 'decor', name: 'Espantalho',          cost: 90,  level: 2, max: 6,  radius: 0.9, rep: 3, desc: 'Vigia a plantacao e balanca com a brisa.' },
    pond:         { kind: 'decor', name: 'Lago com lotus',      cost: 260, level: 3, max: 4,  radius: 2.6, rep: 7, desc: 'Agua calma e flores de lotus.' },
    balloon:      { kind: 'decor', name: 'Balao flutuante',     cost: 480, level: 6, max: 2,  radius: 1.8, rep: 12, desc: 'Um balao que flutua devagar.' },
    crystalGarden:{ kind: 'decor', name: 'Jardim de cristais',  cost: 260, level: 4, max: 4,  radius: 1.8, rep: 7, desc: 'Cristais coloridos que brilham.' }
  },

  research: {
    irrigation: { name: 'Irrigacao automatica', icon: 'IRR', cost: 30,  level: 3, desc: 'Canteiros com plantas mantem umidade minima sozinhos.' },
    hybrid:     { name: 'Sementes hibridas',    icon: 'HIB', cost: 40,  level: 3, desc: 'Plantas crescem 20% mais rapido.' },
    fastDrones: { name: 'Drones mais rapidos',  icon: 'DRN', cost: 50,  level: 4, desc: 'Drones voam 50% mais rapido.' },
    solar:      { name: 'Paineis solares eficientes', icon: 'SOL', cost: 55, level: 4, desc: 'Geracao de energia dobrada.' },
    organic:    { name: 'Fertilizante organico', icon: 'ORG', cost: 60, level: 5, desc: '30% de chance de colheita em dobro.' },
    recycle:    { name: 'Reciclagem de sementes', icon: 'REC', cost: 70, level: 5, desc: '35% de chance de recuperar a semente ao colher.' },
    greenhouse: { name: 'Estufa climatica',     icon: 'EST', cost: 80,  level: 6, desc: 'Efeitos negativos do clima ficam 60% mais fracos.' },
    ai:         { name: 'IA agricola',          icon: 'IA',  cost: 120, level: 8, desc: 'Drones gastam 30% menos energia e replantam sozinhos.' },
    towers:     { name: 'Torres verticais',     icon: 'VER', cost: 150, level: 9, desc: 'Libera 4 canteiros verticais extras na fazenda.' },
    genetics:   { name: 'Genetica avancada',    icon: 'GEN', cost: 90,  level: 6, desc: 'Aumenta em 70% a chance de mutacao das plantas.' },
    pomology:   { name: 'Pomologia',            icon: 'POM', cost: 75,  level: 5, desc: 'Arvores frutiferas produzem 30% mais rapido.' }
  },

  events: {
    tempest: { name:'Temporal de monção',kind:'climate',weight:1,level:3,duration:48,text:'Frente de monção: nuvens baixas e chuva forte abastecem os reservatórios.' },
    aurora: { name:'Aurora de plasma',kind:'climate',weight:1,level:4,duration:60,text:'Aurora de plasma: a geração de energia aumenta em 45%.' },
    rain:    { name: 'Chuva',             kind: 'climate', weight: 3, level: 1, duration: 50, text: 'Chuva: agua extra e plantas crescem mais rapido.' },
    drought: { name: 'Seca',              kind: 'climate', weight: 2, level: 2, duration: 60, text: 'Seca: pouca agua e a umidade evapora mais rapido.' },
    solar:   { name: 'Tempestade solar',  kind: 'climate', weight: 2, level: 3, duration: 50, text: 'Tempestade solar: geracao de energia muito reduzida.' },
    pest:    { name: 'Praga de folhas',   kind: 'climate', weight: 2, level: 2, duration: 60, text: 'Praga de folhas: regue as plantas doentes para cura-las.' },
    boom:    { name: 'Mercado em alta',   kind: 'timed',   weight: 3, level: 2, duration: 70, text: 'Mercado em alta: uma cultura vale mais por um tempo.' },
    urgent:  { name: 'Pedido urgente',    kind: 'instant', weight: 2, level: 2, duration: 0,  text: 'Pedido urgente no Mercado: entrega com bonus.' },
    rainbow: { name: 'Arco-iris',         kind: 'climate', weight: 2, level: 2, duration: 55, text: 'Arco-iris: as plantas crescem 25% mais rapido.' },
    festival:{ name: 'Festival da colheita', kind: 'climate', weight: 2, level: 3, duration: 60, text: 'Festival da colheita: todos os produtos valem 25% mais.' },
    merchant:{ name: 'Mercador viajante', kind: 'instant', weight: 2, level: 2, duration: 0,  text: 'Um mercador viajante deixou sementes de presente na sua mochila!' },
    meteor:  { name: 'Meteorito de sementes', kind: 'instant', weight: 2, level: 2, duration: 0, text: 'Meteorito de sementes caiu na fazenda! Procure o brilho.' }
  },

  objectives: [
    { type: 'plant',    target: 3, text: 'Plante 3 alfaces na fazenda',               reward: { money: 100, xp: 20 } },
    { type: 'harvest',  target: 3, text: 'Colha 3 plantas prontas',                   reward: { money: 60,  xp: 20 } },
    { type: 'sell',     target: 5, text: 'Venda 5 produtos no Mercado',               reward: { money: 80,  xp: 25 } },
    { type: 'level',    target: 3, text: 'Alcance o nivel 3',                         reward: { money: 100, xp: 0 } },
    { type: 'drone',    target: 1, text: 'Compre um drone agricola na Loja Geral',    reward: { money: 150, xp: 60 } },
    { type: 'build',    target: 2, text: 'Posicione 2 construcoes ou decoracoes',     reward: { money: 150, xp: 60 } },
    { type: 'contract', target: 1, text: 'Conclua um contrato no Mercado',            reward: { money: 200, xp: 80, rp: 5 } },
    { type: 'research', target: 2, text: 'Conclua 2 pesquisas no laboratorio',        reward: { money: 300, xp: 100 } },
    { type: 'level',    target: 8, text: 'Alcance o nivel 8 para liberar a segunda ilha', reward: { money: 400, xp: 0 } },
    { type: 'island',   target: 1, text: 'Visite a Ilha Cristalina',                  reward: { money: 600, xp: 200, crystals: 3 } },
    { type: 'none',     target: 0, text: 'Expanda a fazenda e aumente sua reputacao', reward: {} }
  ],

  contractTemplates: [
    { key: 'd_lettuce', type: 'deliver',  item: 'lettuce',    amount: 10, minLevel: 1, reward: { money: 200, xp: 30 }, life: 480 },
    { key: 'd_straw',   type: 'deliver',  item: 'strawberry', amount: 8,  minLevel: 1, reward: { money: 450, xp: 50 }, life: 480 },
    { key: 'p_corn',    type: 'produce',  item: 'corn',       amount: 5,  minLevel: 3, reward: { money: 900, xp: 90, rp: 8 }, life: 600 },
    { key: 'h_day',     type: 'harvests', amount: 3, minLevel: 1, reward: { money: 150, xp: 30, seeds: { lettuce: 5 } }, life: 270 },
    { key: 's_20',      type: 'sell',     amount: 20, minLevel: 2, reward: { money: 300, xp: 40, seeds: { strawberry: 3 } }, life: 600 },
    { key: 'd_mush',    type: 'deliver',  item: 'mushroom',   amount: 6,  minLevel: 4, reward: { money: 1500, xp: 120, rp: 12 }, life: 700 },
    { key: 'h_day2',    type: 'harvests', amount: 8, minLevel: 4, reward: { money: 800, xp: 100, seeds: { corn: 4 } }, life: 270 },
    { key: 'p_flower',  type: 'produce',  item: 'flower',     amount: 5,  minLevel: 5, minRep: 20, reward: { money: 2400, xp: 200, rp: 15 }, life: 800 },
    { key: 's_60',      type: 'sell',     amount: 60, minLevel: 5, reward: { money: 1200, xp: 150, rp: 10 }, life: 900 },
    { key: 'd_salad',   type: 'deliver',  item: 'salad',      amount: 4,  minLevel: 6, reward: { money: 700, xp: 100 }, life: 700 },
    { key: 'd_flower10',type: 'deliver',  item: 'flower',     amount: 10, minLevel: 6, minRep: 100, reward: { money: 6200, xp: 450, rp: 30, crystals: 3 }, life: 1000 },
    { key: 'd_melon',   type: 'deliver',  item: 'melon',      amount: 4,  minLevel: 7, minRep: 40, reward: { money: 3000, xp: 300, rp: 20, seeds: { melon: 2 } }, life: 800 },
    { key: 'd_carrot', type: 'deliver',  item: 'carrot',     amount: 12, minLevel: 2, reward: { money: 380, xp: 45 }, life: 520 },
    { key: 'd_tomato', type: 'deliver',  item: 'tomato',     amount: 8,  minLevel: 3, reward: { money: 650, xp: 70 }, life: 600 },
    { key: 'd_apple',  type: 'deliver',  item: 'apple',      amount: 10, minLevel: 3, reward: { money: 450, xp: 60, seeds: { carrot: 5 } }, life: 600 },
    { key: 'd_peach',  type: 'deliver',  item: 'peach',      amount: 12, minLevel: 5, reward: { money: 1300, xp: 140, rp: 10 }, life: 800 },
    { key: 'd_grape',  type: 'deliver',  item: 'grape',      amount: 6,  minLevel: 5, reward: { money: 1700, xp: 160, rp: 10 }, life: 800 },
    { key: 'd_pepper', type: 'deliver',  item: 'pepper',     amount: 5,  minLevel: 8, minRep: 60, reward: { money: 4800, xp: 380, rp: 25, crystals: 2 }, life: 900 },
    { key: 'p_gold',   type: 'mutant',   amount: 3, minLevel: 4, reward: { money: 1800, xp: 200, rp: 15 }, life: 900 },
    { key: 'd_crystal', type: 'deliver',  item: 'crystal',    amount: 8,  minLevel: 8, island: true, reward: { money: 3500, xp: 350, rp: 25 }, life: 900 },
    { key: 'd_sorbet',  type: 'deliver',  item: 'sorbet',     amount: 3,  minLevel: 8, island: true, minRep: 80, reward: { money: 5200, xp: 400, rp: 30 }, life: 900 },
    { key: 'p_melon8',  type: 'produce',  item: 'melon',      amount: 8,  minLevel: 8, island: true, minRep: 60, reward: { money: 7500, xp: 600, rp: 40, crystals: 5 }, life: 1100 }
  ],

  // get(state, reputacao) => valor atual; goal => meta
  achievements: [
    { id: 'h1',   name: 'Primeira colheita',   desc: 'Colha 1 planta',            goal: 1,    get: s => s.stats.harvested, reward: 20 },
    { id: 'h50',  name: 'Mao na terra',        desc: 'Colha 50 plantas',          goal: 50,   get: s => s.stats.harvested, reward: 100 },
    { id: 'h500', name: 'Mestre da colheita',  desc: 'Colha 500 plantas',         goal: 500,  get: s => s.stats.harvested, reward: 600 },
    { id: 'b1',   name: 'Primeira obra',       desc: 'Posicione 1 estrutura',     goal: 1,    get: s => s.stats.built, reward: 40 },
    { id: 'b10',  name: 'Urbanista orbital',   desc: 'Posicione 10 estruturas',   goal: 10,   get: s => s.stats.built, reward: 300 },
    { id: 'd1',   name: 'Ceu movimentado',     desc: 'Tenha 1 drone',             goal: 1,    get: s => s.drones.length, reward: 80 },
    { id: 'd4',   name: 'Esquadrao agricola',  desc: 'Tenha 4 drones',            goal: 4,    get: s => s.drones.length, reward: 500 },
    { id: 'l5',   name: 'Nivel 5',             desc: 'Alcance o nivel 5',         goal: 5,    get: s => s.level, reward: 120 },
    { id: 'l10',  name: 'Nivel 10',            desc: 'Alcance o nivel 10',        goal: 10,   get: s => s.level, reward: 600 },
    { id: 'r50',  name: 'Fazenda charmosa',    desc: 'Alcance 50 de reputacao',   goal: 50,   get: (s, r) => r, reward: 200 },
    { id: 'r150', name: 'Destino turistico',   desc: 'Alcance 150 de reputacao',  goal: 150,  get: (s, r) => r, reward: 800 },
    { id: 'c1',   name: 'Negocio fechado',     desc: 'Conclua 1 contrato',        goal: 1,    get: s => s.stats.contracts, reward: 80 },
    { id: 'c10',  name: 'Fornecedor de confianca', desc: 'Conclua 10 contratos',  goal: 10,   get: s => s.stats.contracts, reward: 700 },
    { id: 'rs3',  name: 'Mente curiosa',       desc: 'Conclua 3 pesquisas',       goal: 3,    get: s => s.stats.research, reward: 150 },
    { id: 'rs9',  name: 'Cientista orbital',   desc: 'Conclua 9 pesquisas',       goal: 9,    get: s => s.stats.research, reward: 900 },
    { id: 'e1k',  name: 'Primeiros mil',       desc: 'Ganhe 1000 creditos',       goal: 1000, get: s => s.stats.earned, reward: 100 },
    { id: 'e20k', name: 'Magnata rural',       desc: 'Ganhe 20000 creditos',      goal: 20000,get: s => s.stats.earned, reward: 1000 },
    { id: 'i1',   name: 'Alem da ponte',       desc: 'Visite a Ilha Cristalina',  goal: 1,    get: s => s.stats.island, reward: 300 },
    { id: 'm1',   name: 'Acidente genetico',   desc: 'Colha 1 planta mutante',    goal: 1,    get: s => s.stats.mutations, reward: 150 },
    { id: 'm25',  name: 'Laboratorio vivo',    desc: 'Colha 25 plantas mutantes', goal: 25,   get: s => s.stats.mutations, reward: 1200 },
    { id: 'f1',   name: 'Primeira fruta',      desc: 'Colha 1 fruto de arvore',   goal: 1,    get: s => s.stats.fruits, reward: 60 },
    { id: 'f200', name: 'Pomar farto',         desc: 'Colha 200 frutos',          goal: 200,  get: s => s.stats.fruits, reward: 900 },
    { id: 'tr6',  name: 'Bosque da fazenda',   desc: 'Tenha 6 arvores plantadas', goal: 6,    get: s => s.trees.length, reward: 400 },
    { id: 'ld5',  name: 'Latifundiario',       desc: 'Expansao do terreno no nivel 5', goal: 5, get: s => s.land.expand, reward: 1500 },
    { id: 'ir3',  name: 'Fazenda automatica',  desc: 'Tenha 3 irrigadores',       goal: 3,    get: s => s.structures.filter(x => CONFIG_IRR.includes(x.type)).length, reward: 500 }
  ]
};
