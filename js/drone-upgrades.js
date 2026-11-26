import { CONFIG } from './config.js';
import { state, save } from './state.js';

const drone = CONFIG.drone;
export const modules = {
  battery: {
    name: 'Bateria', prices: [160, 300, 480],
    value: level => drone.cap + level * 20,
    format: value => value + ' de capacidade'
  },
  motor: {
    name: 'Propulsores', prices: [200, 350, 550],
    value: level => 1 + level * 0.15,
    format: value => Math.round(value * 100) + '% da velocidade base'
  },
  arm: {
    name: 'Braço agrícola', prices: [180, 320, 500],
    value: level => 0.9 - level * 0.15,
    format: value => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' s por tarefa'
  }
};

export function moduleLevel(unit, key) {
  const level = unit.upgrades?.[key];
  return Number.isInteger(level) ? Math.max(0, Math.min(level, modules[key].prices.length)) : 0;
}

export function moduleValue(unit, key) {
  return modules[key].value(moduleLevel(unit, key));
}

export function installModule(unit, key, expectedLevel) {
  if (!state.drones.includes(unit) || !Object.hasOwn(modules, key)) return false;
  const level = moduleLevel(unit, key);
  const price = modules[key].prices[level];
  if (level !== expectedLevel || price === undefined || state.money < price) return false;
  state.money -= price;
  unit.upgrades = { ...unit.upgrades, [key]: level + 1 };
  save();
  return true;
}
