// G3 coordinator-only staged wiring. All four A mounts remain in the dormant
// G1 shell until all six UI modules and legacy retirement pass visual QA.
import * as home from './home.js';
import * as settings from './settings.js';

export function mountEngineerA(shell,adapter) {
  const owned=[];
  try{
    // Register menu and Settings before the five-button command bar can open them.
    for(const [name,module,region] of [
      ['home-menu',home,'PRIMARY_SHEET'],
      ['settings',settings,'PRIMARY_SHEET'],
      ['home-hud',home,'HUD_TOP'],
      ['home-tools',home,'PRIMARY_COMMAND']
    ]) owned.push(shell.mountFeature(name,module,{adapter,region}));
  }catch(error) {
    for(const cleanup of owned.reverse())cleanup();
    throw error;
  }
  return Object.freeze({
    mounted:['home-menu','settings','home-hud','home-tools'],
    dispose(){for(const cleanup of owned.reverse())cleanup();}
  });
}
