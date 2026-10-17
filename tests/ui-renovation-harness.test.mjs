import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';

// Historical Playwright runners use a no-server ES-module inliner. Its manual
// source order must remain complete when G3 gains new feature imports.
test('G3 legacy browser inliner includes every static ESM dependency in source order',()=>{
  const harness=readFileSync(new URL('../tools/browser-smoke.py',import.meta.url),'utf8');
  const match=harness.match(/mods=\[([\s\S]*?)\]\s*\n\s*out=/);
  assert.ok(match,'browser-smoke.py manual source list must be found');
  const modules=[...match[1].matchAll(/'([^']+\.js)'/g)].map(m=>m[1]);
  assert.equal(modules.at(-1),'main.js','main.js must be bundled last');
  assert.equal(new Set(modules).size,modules.length,'no duplicated module IDs');

  for(const component of [
    'ui/renovation/home.js','ui/renovation/settings.js','ui/renovation/integrate-a.js',
    'ui/renovation/military.js','ui/renovation/ants.js','ui/renovation/integrate-b.js',
    'ui/renovation/nursery.js','ui/renovation/rooms.js','ui/renovation/integrate-c.js'
  ]) assert.ok(modules.includes(component),component+' is required');

  for(const [index,module] of modules.entries()){
    const src=readFileSync(new URL('../src/'+module,import.meta.url),'utf8');
    const imports=/import\s+(?:\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+\.js)['"]/g;
    for(const [,specifier] of src.matchAll(imports)){
      const target=posix.normalize(posix.join(posix.dirname(module),specifier));
      const dependency=modules.indexOf(target);
      assert.notEqual(dependency,-1,module+' depends on unbundled '+target);
      assert.ok(dependency<index,module+' requires '+target+' BEFORE it is evaluated');
    }
  }
});
