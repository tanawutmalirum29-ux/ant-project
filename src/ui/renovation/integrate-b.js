// G3 Coordinator-only staged mounts. Keep shell dormant until C and legacy
// retirement pass exact-SHA browser QA; this file does not activate a new HUD.
import * as military from './military.js';
import * as ants from './ants.js';

export function mountEngineerB(shell,adapter) {
  const mounted=[];
  try {
    for(const [name,module] of [
      ['military',military],
      ['ants',ants]
    ]) mounted.push(shell.mountFeature(name,module,{adapter,region:'PRIMARY_SHEET'}));
  } catch(error) {
    for(const dispose of mounted.reverse())dispose();
    throw error;
  }
  return Object.freeze({
    mounted:['military','ants'],
    dispose(){for(const dispose of mounted.reverse())dispose();}
  });
}
