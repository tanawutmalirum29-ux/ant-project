"""G4 natural Nursery lifecycle: real room order, builder walk/construction,
queen lay, nurse haul, incubation, hatch and permanent caste Lv2.
No injected room, brood, soldier, stage, build progress, or clock tick counter.
The test seeds STARTING STOCK and workforce availability only, then advances
the authoritative FixedStepper deterministically; this is NOT natural foraging.
Chromium browser preview only, separate from already-approved G4 regression.
"""
import json,os,subprocess,time,traceback
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts'/'g4-natural'
OUT.mkdir(parents=True,exist_ok=True)
SHA=os.getenv('GITHUB_SHA','local-unpinned')
SOURCE=os.getenv('SOURCE_HEAD_SHA',SHA)
TREE=subprocess.run(['git','rev-parse','HEAD^{tree}'],cwd=ROOT,check=True,capture_output=True,text=True).stdout.strip()
RECORDS=[]
def snap(page):
    return page.evaluate("""() => {
      const d=__ANT_DEBUG__,g=d.game,l=g.lifecycle;
      return {seed:g.world.seedLabel,ticks:g.clock.ticks,queen:{...g.colony.queen},
        population:g.population,births:l.births,delivered:g.foraging.delivered,
        stock:{...g.foraging.inventory},
        roomOrders:g.rooms.queuedCount,capacity:g.rooms.broodCapacity,
        nurseries:g.rooms.rooms.filter(r=>r.type==='nursery').map(r=>({
          id:r.id,x:r.x,y:r.y,width:r.width,height:r.height,status:r.status,
          connected:r.connected,progress:r.progress,ticks:r.ticks,workerId:r.workerId,
          pickups:r.pickups?.map(p=>({sourceRoomId:p.sourceRoomId,type:p.type,
            collected:p.collected}))})),
        eggs:l.eggOrders.map(o=>({id:o.id,roomId:o.roomId,profession:o.profession,
          level:o.level,status:o.status,broodId:o.broodId,slot:o.slot})),
        brood:l.brood.map(b=>({id:b.id,stage:b.stage,age:b.age,care:b.care,roomId:b.roomId,
          carrierId:b.carrierId,site:b.site,x:b.x,y:b.y})),
        workforce:g.colony.workers.map(a=>({id:a.id,state:a.state,profession:a.profession,
          level:a.level,x:a.x,y:a.y,roomId:a.roomId,broodCargo:a.broodCargo,
          layer:a.layer}))};
    }""")
def checkpoint(page,name,before=None,details=None):
    fn=name+'.png'
    page.screenshot(path=str(OUT/fn))
    RECORDS.append({'scenario':name,'sha':SHA,'source_head_sha':SOURCE,'git_tree_sha':TREE,
      'before':before,'after':snap(page),'details':details,'screenshot':fn})
def tap(page,selector):
    e=page.locator(selector).first
    box=e.bounding_box()
    assert box and box['width']>2 and box['height']>2,(selector,box)
    x=box['x']+box['width']/2;y=box['y']+box['height']/2
    assert page.evaluate("""([x,y,sel])=>{
      const t=document.querySelector(sel),e=document.elementFromPoint(x,y);
      return !!t&&!!e&&(t===e||t.contains(e));}""",[x,y,selector]),('obscured',selector,x,y)
    page.touchscreen.tap(x,y)
def advance(page,calls=10):
    # The only simulation advance is the SAME Game.update()/FixedStepper used
    # by production. A browser frame cannot render until each batch returns.
    page.evaluate("""n=>{
      const g=__ANT_DEBUG__.game;
      g.setSpeed(4);
      for(let i=0;i<n;i++)g.update(250);
      g.setSpeed(0);
      __ANT_DEBUG__.ui.updateMetrics();
      __ANT_DEBUG__.renovationAdapter.notify();
    }""",calls)
def run(page):
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:4173/?ui=renovation')
    page.wait_for_function('window.__ANT_DEBUG__?.renovationAdapter?.view?.home')
    page.wait_for_timeout(350)
    assert page.locator('#game-canvas').is_visible()
    page.evaluate("""()=>{
       const d=__ANT_DEBUG__,g=d.game;
       // Initial supply fixture ONLY; no room or brood fixture.
       g.setSpeed(0);g.colony.setForageSlots(0);g.lifecycle.setNurseSlots(1);
       Object.assign(g.foraging.inventory,{carbs:24,protein:24,water:24});
       g.rooms.syncInventory();
       d.ui.updateMetrics();d.renovationAdapter.notify();
    }""")
    original=snap(page)
    assert not original['nurseries'] and original['capacity']==0
    checkpoint(page,'00-no-nursery',details={'input':'genuine renovated shell; stock seeded only'})
    tap(page,'[data-home-action="room"]')
    # The legacy native room selector initially defaults to food_store.
    # Choose Nursery through real renovated CSS options and prove that this
    # propagates to the authoritative canvas's existing room-type input.
    tap(page,'.ui05-type-trigger')
    tap(page,'.ui05-type-option[data-room-type="nursery"]')
    assert page.evaluate("document.getElementById('room-type').value")=='nursery'
    p=page.evaluate("""()=>{
      const d=__ANT_DEBUG__,g=d.game,q=g.colony.queen,c=d.cameras[g.layer];
      c.x=(q.x+.5)*28;c.y=(q.y+.5)*28;
      c.clamp(g.currentLayer,d.renderer.width,d.renderer.height);
      const x=q.x+2,y=q.y;
      const pt=c.worldToScreen((x+.5)*28,(y+.5)*28,d.renderer.width,d.renderer.height);
      return {x,y,sx:pt.x,sy:pt.y,valid:g.rooms.validate('nursery',x,y,2,2)};
    }""")
    assert p['valid']['ok'],('no connected unexcavated 2x2 room site',p)
    assert page.evaluate('p=>document.elementFromPoint(p.sx,p.sy)?.id',p)=='game-canvas',('map obscured',p)
    page.touchscreen.tap(p['sx'],p['sy'])
    planned=snap(page)
    assert len(planned['nurseries'])==1 and planned['roomOrders']==1,('natural room UI queue failed',planned)
    assert planned['nurseries'][0]['status'] in ('planned','building')
    checkpoint(page,'01-natural-room-queued',original,{'tile':p})
    build_states=set()
    room_ready=False
    for n in range(200):
        advance(page,3)
        cur=snap(page)
        build_states.add(cur['nurseries'][0]['status'])
        if cur['nurseries'][0]['status']=='ready':
            room_ready=True
            break
    assert room_ready,('workers did not physically construct the room',snap(page),sorted(build_states))
    assert 'building' in build_states,('no real builder construction phase',sorted(build_states))
    made=snap(page)
    assert made['capacity']==4 and made['nurseries'][0]['connected']
    assert made['nurseries'][0]['progress']>=made['nurseries'][0]['ticks']
    checkpoint(page,'02-builder-completed-4slot-room',planned,{'states':sorted(build_states)})
    # UI04 may automatically open upon room selection, else its genuine reopen.
    page.wait_for_timeout(180)
    if not page.locator('.ui04-sheet').is_visible():
        assert page.locator('.ui04-reopen').is_visible(),('Nursery UI unavailable',snap(page))
        tap(page,'.ui04-reopen')
    assert page.locator('.ui04-sheet').is_visible()
    tap(page,'.ui04-picker-trigger')
    tap(page,'.ui04-picker-menu:not([hidden]) [data-value="nurse"]')
    tap(page,'.ui04-picker-trigger:nth-of-type(2)') if False else None
    page.locator('.ui04-picker-trigger').nth(1).click()
    page.locator('.ui04-picker-menu:not([hidden]) [data-value="2"]').click()
    assert 'Lv.2' in page.locator('.ui04-picker-trigger').nth(1).inner_text()
    tap(page,'.ui04-primary')
    queued=snap(page)
    assert len(queued['eggs'])==1 and queued['eggs'][0]['status']=='QUEUED'
    assert queued['eggs'][0]['profession']=='nurse' and queued['eggs'][0]['level']==2
    checkpoint(page,'03-actual-css-egg-order-Lv2',made)
    # Install a READ-ONLY observer in the production simulation's onTick
    # extension point. This captures transient cargo during the SAME
    # authoritative tick, avoiding a 30-tick snapshot gap. No world mutation.
    page.evaluate("""()=>{
      window.__g4NaturalTrace=[];
      let lastKey='';
      __ANT_DEBUG__.game.onTick(game=>{
        const l=game.lifecycle, order=l.eggOrders[0],baby=l.brood[0];
        const carrier=game.colony.workers.find(a=>a.broodCargo)??null;
        const key=[order?.status??'DONE',baby?.stage??'NONE',
          baby?.carrierId??'',baby?.roomId??''].join('|');
        if(key!==lastKey||carrier){
          if(window.__g4NaturalTrace.length<200)
            window.__g4NaturalTrace.push({
              tick:game.clock.ticks,order:order?.status??'DONE',
              stage:baby?.stage??null,carrierId:baby?.carrierId??null,
              broodX:baby?.x??null,broodY:baby?.y??null,
              broodRoom:baby?.roomId??null,
              nurseId:carrier?.id??null,nurseX:carrier?.x??null,
              nurseY:carrier?.y??null});
          lastKey=key;
        }
      });
    }""")
    # Close overlay, then progress the real Game update until egg completes.
    tap(page,'.ui04-close')
    observed=set();positions=[];hatch=False
    for n in range(240):
        advance(page,3)
        current=snap(page)
        observed.update(o['status'] for o in current['eggs'])
        for b in current['brood']:
            observed.add('BROOD_'+b['stage'].upper())
            if b['carrierId'] and len(positions)<20:
                positions.append({'tick':current['ticks'],'carrier':b['carrierId'],
                  'x':b['x'],'y':b['y']})
        if current['births']>original['births']:
            hatch=True
            break
    final=snap(page)
    assert hatch,('natural hatch not finished within 7200 ticks',final,sorted(observed),positions)
    born=[a for a in final['workforce'] if a['profession']=='nurse' and a['level']==2]
    assert born,('no adult permanent nurse Lv.2 despite reported birth',final)
    assert 'INCUBATING' in observed and 'BROOD_LARVA' in observed and 'BROOD_PUPA' in observed,(
        'natural egg did not complete physical stages',sorted(observed),final)
    tick_trace=page.evaluate("window.__g4NaturalTrace")
    carried=[t for t in tick_trace if t['carrierId'] and t['nurseId']]
    assert carried,('no actual nurse cargo at any authoritative simulation tick',
                     sorted(observed),final,tick_trace)
    assert final['capacity']==4 and final['nurseries'][0]['status']=='ready'
    assert len(final['eggs'])==0 and len(final['brood'])==0
    checkpoint(page,'04-natural-egg-nurse-haul-hatch',queued,{
      'observedStatuses':sorted(observed),'sampleCarriedLocations':carried[:30],
      'tickTransitionTrace':tick_trace,'adult':born})
    assert not errors,('JS page errors',errors)
    print('G4-NATURAL PASS: builder room, nursery 4-slot, real CSS Lv2 egg, '
          'queen lay, nurse physical haul, egg/larva/pupa, permanent Lv2 adult; '
          'ticks='+str(final['ticks']),flush=True)

server=subprocess.Popen(['node','tools/dev-server.mjs'],cwd=ROOT,
  stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
try:
    for _ in range(80):
        try:
            with urlopen('http://127.0.0.1:4173/',timeout=1) as x:
                assert x.status==200
            break
        except Exception:time.sleep(.2)
    else:raise RuntimeError('G4 natural server unavailable')
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--no-sandbox'])
        ctx=browser.new_context(viewport={'width':390,'height':844},
          device_scale_factor=1,is_mobile=True,has_touch=True)
        try:run(ctx.new_page())
        finally:ctx.close();browser.close()
finally:
    (OUT/'evidence.json').write_text(json.dumps({
      'sha':SHA,'source_head_sha':SOURCE,'git_tree_sha':TREE,
      'scope':'G4 real worker room-build and hatch; starting stock fixture and accelerated authoritative ticks',
      'events':RECORDS},ensure_ascii=False,indent=2))
    server.terminate()
    try:server.wait(timeout=5)
    except subprocess.TimeoutExpired:server.kill()
