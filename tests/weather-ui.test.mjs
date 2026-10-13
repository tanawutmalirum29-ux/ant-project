import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/core/game.js';
import { UI, weatherHudText } from '../src/ui/app.js';
import { formatGameTime } from '../src/core/time.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/ui/app.js', import.meta.url), 'utf8');

test('NEXT02-UI-01 all three kinds have concise Thai names and tick countdown', () => {
  assert.deepEqual(weatherHudText({kind:'clear',remainingTicks:4800}), {
    short:'ปกติ · 4800t', full:'สภาพอากาศ: อากาศปกติ · เหลือ 4800 ติ๊กของเวลาเกม'
  });
  assert.deepEqual(weatherHudText({kind:'rain',remainingTicks:45}), {
    short:'ฝนตก · 45t', full:'สภาพอากาศ: ฝนตก · เหลือ 45 ติ๊กของเวลาเกม'
  });
  assert.deepEqual(weatherHudText({kind:'dry',remainingTicks:0}), {
    short:'แล้ง · 0t', full:'สภาพอากาศ: ภัยแล้ง · เหลือ 0 ติ๊กของเวลาเกม'
  });
});

test('NEXT02-UI-02 legacy or invalid Weather never invents remaining ticks', () => {
  for (const weather of [undefined,null,{}, {kind:'alien',remainingTicks:NaN},
    {kind:'dry',remainingTicks:-1},{kind:'rain',remainingTicks:Infinity},
    {kind:'rain',remainingTicks:3.5},{kind:'clear',remainingTicks:'4800'}]) {
    const result=weatherHudText(weather);
    assert.doesNotMatch(result.short,/t$/);
    assert.doesNotMatch(result.full,/เหลือ/);
  }
  assert.equal(weatherHudText().short,'ปกติ');
  assert.equal(weatherHudText({kind:'rain'}).short,'ฝนตก');
  assert.equal(weatherHudText({kind:'dry'}).short,'แล้ง');
  assert.equal(weatherHudText({kind:'alien',remainingTicks:6}).short,'ปกติ · 6t');
});

function fakeDOM(){
  const elements=new Map();
  const small={tagName:'SMALL',textContent:'เวลาในอาณาจักร',title:'',style:{}};
  const clock={tagName:'STRONG',textContent:'',previousElementSibling:small};
  elements.set('game-time',clock);
  const make=()=>({
    textContent:'',value:'',max:'',title:'',style:{},classList:{toggle(){}}
  });
  return {
    small,clock,
    getElementById(id){
      if(!elements.has(id))elements.set(id,make());
      return elements.get(id);
    }
  };
}

test('NEXT02-UI-03 original time pill is reused; live phase and countdown updates',()=>{
  const oldDocument=globalThis.document;
  const fake=fakeDOM();
  globalThis.document=fake;
  try{
    const ui=Object.create(UI.prototype);
    ui.game=new Game('HUD-WEATHER-TEST');
    ui.debug=false;
    ui.refreshSelection=()=>{};
    ui.updateMetrics();
    assert.equal(fake.small.textContent,'ปกติ · 4800t','integrated new Game has active Weather');
    assert.equal(fake.clock.textContent,formatGameTime(ui.game.clock));
    assert.equal(fake.small.style.display,'block');
    assert.equal(fake.small.style.whiteSpace,'nowrap');

    ui.game.weather={kind:'clear',remainingTicks:4800};
    ui.updateMetrics();
    assert.equal(fake.small.textContent,'ปกติ · 4800t');
    ui.game.weather.kind='rain';
    ui.game.weather.remainingTicks=3600;
    ui.updateMetrics();
    assert.equal(fake.small.textContent,'ฝนตก · 3600t');
    assert.match(fake.small.title,/3600 ติ๊ก/);

    const untouchedTime=fake.clock.textContent;
    ui.game.setSpeed(0);
    ui.game.update(5000);
    ui.updateMetrics();
    assert.equal(fake.clock.textContent,untouchedTime,'pause preserves game time');
    assert.equal(fake.small.textContent,'ฝนตก · 3600t','pause never decrements weather via UI');
    ui.game.weather={kind:'dry',remainingTicks:11};
    ui.updateMetrics();
    assert.equal(fake.small.textContent,'แล้ง · 11t');

    ui.game=new Game('NEW-SEED');
    ui.updateMetrics();
    assert.equal(fake.small.textContent,'ปกติ · 4800t','reset starts a fresh clear Weather phase');
    assert.equal(fake.clock.textContent,formatGameTime(ui.game.clock));
    // Preserve the standalone/legacy fallback as an independent contract.
    ui.game.weather=undefined;
    ui.updateMetrics();
    assert.equal(fake.small.textContent,'ปกติ');
  } finally {
    globalThis.document=oldDocument;
  }
});

test('NEXT02-UI-04 absent secondary label fails safely without altering date/time',()=>{
  const oldDocument=globalThis.document;
  const fake=fakeDOM();
  fake.clock.previousElementSibling=null;
  globalThis.document=fake;
  try{
    const ui=Object.create(UI.prototype);
    ui.game={weather:{kind:'rain',remainingTicks:4}};
    assert.doesNotThrow(()=>ui.updateWeather());
    assert.equal(fake.clock.textContent,'');
  } finally {
    globalThis.document=oldDocument;
  }
});

test('NEXT02-UI-05 no new markup/IDs, speed/seed/camera controls stay intact',()=>{
  assert.match(html, /class="status-pill time-pill"/);
  assert.match(html, /<small>เวลาในอาณาจักร<\/small><strong id="game-time">/);
  assert.equal([...html.matchAll(/id="game-time"/g)].length,1);
  assert.doesNotMatch(html,/id="weather-/);
  assert.doesNotMatch(app, /document\.createElement\(['"](?:div|aside|section)/);
  for(const id of ['pause-button','seed-button','seed-form','colony-button',
    'zoom-in','zoom-out','debug-toggle','surface-button','underground-button']) {
    assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id);
  }
  assert.match(app,/this\.updateWeather\(\)/);
  assert.match(app,/this\.onNewWorld\(seed\)/);
  assert.match(app,/this\.game\.setSpeed\(speed\)/);
});
