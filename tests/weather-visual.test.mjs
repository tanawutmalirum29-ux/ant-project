import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, weatherVisualKind } from '../src/render/renderer.js';
import { SURFACE, UNDERGROUND, TERRAINS } from '../src/world/generate.js';

function recordingContext() {
  const commands=[];
  const properties={};
  return new Proxy(properties,{
    get(obj,key) {
      if(key==='commands') return commands;
      if(key==='createRadialGradient') return (...args)=>{
        commands.push(['createRadialGradient',...args]);
        return {addColorStop(...args){commands.push(['gradient-stop',...args]);}};
      };
      if(key in obj) return obj[key];
      if(typeof key==='symbol') return undefined;
      return (...args)=>commands.push([key,...args]);
    },
    set(obj,key,value) {
      obj[key]=value;commands.push([key,value]);return true;
    }
  });
}
const bounds={x0:0,x1:36,y0:0,y1:28};
function weatherTrace(kind='rain',seed=1337,zoom=1,elapsed=1500,layer=SURFACE,rect=bounds) {
  const ctx=recordingContext();
  const game={layer,world:{seed},weather:kind==null?undefined:{kind}};
  Renderer.prototype.drawWeather.call({},ctx,game,rect,zoom,elapsed);
  return ctx.commands;
}
const count=(trace,method)=>trace.filter(e=>e[0]===method).length;

test('WXVIS-01 Weather contract: clear default, supported enum only, no dependency on Weather module',()=>{
  assert.equal(weatherVisualKind({}), 'clear');
  assert.equal(weatherVisualKind({weather:null}),'clear');
  assert.equal(weatherVisualKind({weather:{kind:'rain'}}),'rain');
  assert.equal(weatherVisualKind({weather:{kind:'dry'}}),'dry');
  assert.equal(weatherVisualKind({weather:{kind:'clear'}}),'clear');
  assert.equal(weatherVisualKind({weather:{kind:'storm'}}),'clear');
  assert.equal(weatherVisualKind(null),'clear');
});

test('WXVIS-02 surface only: underground draws zero weather commands for all states',()=>{
  for (const kind of ['rain','dry','clear',null]) {
    assert.deepEqual(weatherTrace(kind,123,1,800,UNDERGROUND),[]);
    assert.ok(weatherTrace(kind,123,1,800,SURFACE).length>0);
  }
  assert.deepEqual(weatherTrace('rain',123,1,800,SURFACE,
    {x0:3,x1:2,y0:5,y1:4}),[]);
});

test('WXVIS-03 rain is seeded/time-deterministic with clipped translucent ground wash',()=>{
  const a=weatherTrace('rain',22,.8,1234);
  assert.deepEqual(a,weatherTrace('rain',22,.8,1234));
  assert.notDeepEqual(a,weatherTrace('rain',23,.8,1234));
  assert.notDeepEqual(a,weatherTrace('rain',22,.8,2234));
  assert.ok(a.some(v=>v[0]==='fillStyle'&&v[1]==='#6b9eaf1d'));
  assert.equal(count(a,'clip'),1);
  assert.equal(count(a,'fillRect'),1);
  assert.equal(count(a,'stroke'),1,'single batched stroke (no draw per drop)');
  assert.ok(count(a,'moveTo')>0,'rain streaks visible');
  assert.equal(count(a,'moveTo'),count(a,'lineTo'),'one slanted streak per drop');
  assert.equal(count(a,'save'),1);
  assert.equal(count(a,'restore'),1);
});

test('WXVIS-04 dry weather uses sparse dust cracks, warm tint and no moving rain',()=>{
  const dry=weatherTrace('dry',987,1.25,123);
  assert.ok(dry.some(v=>v[0]==='fillStyle'&&v[1]==='#d6a06726'));
  assert.equal(count(dry,'stroke'),1);
  assert.ok(count(dry,'moveTo')>0);
  assert.equal(count(dry,'lineTo'),count(dry,'moveTo')*2);
  assert.deepEqual(dry,weatherTrace('dry',987,1.25,2345),'dry-soil flecks do not jump each frame');
  assert.notDeepEqual(dry,weatherTrace('rain',987,1.25,123));
});

test('WXVIS-05 clear daylight (including missing weather) has no particle path or stroke',()=>{
  const clear=weatherTrace('clear');
  assert.deepEqual(clear,weatherTrace(null));
  assert.ok(clear.some(v=>v[0]==='fillStyle'&&v[1]==='#f3dfaa0e'));
  assert.equal(count(clear,'stroke'),0);
  assert.equal(count(clear,'moveTo'),0);
  assert.equal(count(clear,'fillRect'),1);
});

test('WXVIS-06 capped weather work at five actual viewport geometries and extreme zoom',()=>{
  const viewports=[[320,568],[390,844],[768,1024],[844,390],[1440,900]];
  for(const [w,h] of viewports) for(const zoom of [.15,.45,1,1.8,3]) {
    const rect={x0:0,x1:Math.ceil(w/(zoom*28)),y0:0,y1:Math.ceil(h/(zoom*28))};
    for(const kind of ['rain','dry']){
      const trace=weatherTrace(kind,12345,zoom,833,SURFACE,rect);
      const n=count(trace,'moveTo');
      assert.ok(n<=280,`${kind} ${w}x${h} zoom=${zoom}: ${n} > budget`);
      assert.ok(n>0,`${kind} ${w}x${h} zoom=${zoom}: no field`);
      assert.equal(count(trace,'stroke'),1,'batched single-path painting');
      assert.equal(count(trace,'createRadialGradient'),0,'no gradient allocations');
      assert.equal(count(trace,'save'),1);
    }
  }
});

test('WXVIS-07 weather reads but never mutates world, kind, time or resource state',()=>{
  const game={
    layer:SURFACE,world:{seed:55},weather:{kind:'rain',remainingTicks:4800,
      factors:Object.freeze({carbs:1.25,protein:1,water:1.5})},
    foraging:{nodes:[{x:1,y:2,amount:5,maxAmount:18,reserved:1}]}
  };
  const before=structuredClone(game);
  const ctx=recordingContext();
  Renderer.prototype.drawWeather.call({},ctx,game,bounds,1,456);
  assert.deepEqual(game,before);
});

test('WXVIS-08 renderer composition puts atmospheric effects below entrances, resources, ants and selection',()=>{
  const ctx=recordingContext();
  const renderer=new Renderer({getContext:()=>ctx});
  renderer.width=320;renderer.height=568;renderer.dpr=1;
  const traces=ctx.commands;
  renderer.drawTile=()=>{};
  renderer.drawEntrance=()=>traces.push(['entrance']);
  renderer.drawResources=()=>traces.push(['resources']);
  renderer.drawAnts=()=>traces.push(['ants']);
  renderer.drawCombat=()=>traces.push(['combat']);
  renderer.drawRooms=()=>traces.push(['rooms']);
  renderer.drawOrders=()=>traces.push(['orders']);
  const original=renderer.drawWeather;
  renderer.drawWeather=function(...args){traces.push(['weather']);return original.apply(this,args);};
  const layer={width:5,height:5,cells:new Uint8Array(25).fill(TERRAINS.GRASS)};
  const camera={x:70,y:70,zoom:1};
  const game={
    layer:SURFACE,currentLayer:layer,world:{seed:4,entrances:[{surface:{x:2,y:2}}]},
    weather:{kind:'rain'},lifecycle:null
  };
  const selection={layer:SURFACE,x:2,y:2};
  renderer.render(game,camera,selection,300);
  const idx=(name)=>traces.findIndex(entry=>entry[0]===name);
  assert.ok(idx('weather')>=0);
  assert.ok(idx('weather')<idx('entrance'));
  assert.ok(idx('weather')<idx('resources'));
  assert.ok(idx('resources')<idx('ants'));
  assert.ok(idx('ants')<idx('combat'));
  assert.ok(idx('combat')<idx('strokeRect'),'tile selection outline remains last');
  traces.length=0;
  game.layer=UNDERGROUND;
  game.currentLayer=layer;
  game.world.entrances=[{underground:{x:2,y:2}}];
  renderer.render(game,camera,null,600);
  assert.equal(idx('weather'),-1);
  assert.ok(idx('rooms')>=0);
});
