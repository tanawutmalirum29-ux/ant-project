// UI RENOVATION V1 / G3 — Coordinator-only Engineer-C mounts.
// Keep source-of-truth in G1 facade; do not add canvas pointer listeners.
// The full shell remains dormant until real full-system QA and legacy retirement.
import * as nursery from './nursery.js';
import * as rooms from './rooms.js';

export function mountEngineerC(shell,adapter) {
  const mounted=[];
  try {
    mounted.push(shell.mountFeature('nursery',nursery,{adapter,region:'PRIMARY_SHEET'}));
    mounted.push(shell.mountFeature('rooms',rooms,{adapter,region:'MAP_ACTION'}));
  } catch(error) {
    for(const dispose of mounted.reverse())dispose();
    throw error;
  }
  return Object.freeze({
    mounted:['nursery','rooms'],
    dispose(){for(const dispose of mounted.reverse())dispose();}
  });
}
