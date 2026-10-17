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


def run_capacity(page):
    """Separate fresh real-world test: connected 4x4 built by a worker,
    genuine UI egg reservations through all 16 slots, cancellation/refund.
    Starting supplies and a post-construction refill are explicitly seeded;
    no claim of foraging or 16 independent natural hatches.
    """
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:4173/?ui=renovation')
    page.wait_for_function('window.__ANT_DEBUG__?.renovationAdapter?.view?.home')
    page.wait_for_timeout(300)
    page.evaluate("""()=>{
      const d=__ANT_DEBUG__,g=d.game;
      g.setSpeed(0);g.colony.setForageSlots(0);g.lifecycle.setNurseSlots(0);
      Object.assign(g.foraging.inventory,{carbs:24,protein:24,water:24});
      g.rooms.syncInventory();d.ui.updateMetrics();d.renovationAdapter.notify();
    }""")
    baseline=snap(page)
    assert baseline['capacity']==0 and baseline['births']==0
    checkpoint(page,'05-16slot-fresh-world',details={
      'world':'new unchanged natural colony','fixture':'starting stock24 each, workforce quotas only'})
    tap(page,'[data-home-action="room"]')
    tap(page,'.ui05-type-trigger')
    tap(page,'.ui05-type-option[data-room-type="nursery"]')
    assert page.evaluate("document.getElementById('room-type').value")=='nursery'
    for _ in range(2):
        tap(page,'.ui05-dimension:first-child .ui05-step:last-child')
        tap(page,'.ui05-dimension:nth-child(2) .ui05-step:last-child')
    dims=page.locator('.ui05-dimension-value').all_inner_texts()
    assert dims==['4','4'],('real CSS 4x4 dimensions not displayed',dims)
    site=page.evaluate("""()=>{
      const d=__ANT_DEBUG__,g=d.game,q=g.colony.queen,c=d.cameras[g.layer],m=g.currentLayer;
      const options=[];
      for(let y=q.y-18;y<=q.y+18;y++)for(let x=q.x-18;x<=q.x+18;x++){
        if(!g.rooms.validate('nursery',x,y,4,4).ok)continue;
        options.push({x,y,dist:Math.abs(x-q.x)+Math.abs(y-q.y)});
      }
      options.sort((a,b)=>a.dist-b.dist||a.y-b.y||a.x-b.x);
      for(const p of options){
        c.x=(p.x+2)*28;c.y=(p.y+2)*28;
        c.clamp(m,d.renderer.width,d.renderer.height);
        const a=c.worldToScreen((p.x+.5)*28,(p.y+.5)*28,d.renderer.width,d.renderer.height);
        const b=c.worldToScreen((p.x+3.5)*28,(p.y+3.5)*28,d.renderer.width,d.renderer.height);
        if([a,b].every(z=>z.x>8&&z.x<d.renderer.width-8&&z.y>55&&
          z.y<d.renderer.height-55&&document.elementFromPoint(z.x,z.y)?.id==='game-canvas'))
          return {x:p.x,y:p.y,start:a,end:b,expectedPlan:g.rooms.validate('nursery',p.x,p.y,4,4).plan};
      }
      return {options:options.slice(0,8),error:'no unobstructed connected 4x4 site'};
    }""")
    assert 'start' in site,('no real reachable 4x4 chamber',site)
    # A true single real map pointer drag, not a direct room queue API.
    a,z=site['start'],site['end']
    page.mouse.move(a['x'],a['y']);page.mouse.down()
    page.mouse.move(z['x'],z['y'],steps=13);page.mouse.up()
    planned=snap(page)
    assert len(planned['nurseries'])==1 and planned['roomOrders']==1,(site,planned)
    room=planned['nurseries'][0]
    assert room['width']==4 and room['height']==4 and room['status'] in ('planned','building')
    checkpoint(page,'06-16slot-css-dimension-map-drag',baseline,{
      'site':site,'input':'real renovated CSS 4x4 dimension controls + genuine canvas mouse-pointer drag'})
    statuses=set()
    for _ in range(320):
        advance(page,3)
        st=snap(page)
        statuses.add(st['nurseries'][0]['status'])
        if st['nurseries'][0]['status']=='ready':break
    built=snap(page);room=built['nurseries'][0]
    assert 'building' in statuses and room['status']=='ready' and room['connected'],(statuses,built)
    assert room['progress']>=room['ticks'] and room['ticks']==260
    assert built['capacity']==16 and built['roomOrders']==0,(built['capacity'],built['roomOrders'])
    checkpoint(page,'07-16slot-natural-builder-finished',planned,{'buildStates':sorted(statuses)})

    # The queen depot capacity is 24. The 4x4 Nursery costs 12 carbs/8
    # protein to build. Explicitly reseed only the remaining depot balance,
    # capped at 24, so 16 UI reservations can be tested without mining.
    supply=page.evaluate("""()=>{
      const d=__ANT_DEBUG__,g=d.game;
      const before={...g.foraging.inventory};
      g.setSpeed(0);
      g.foraging.inventory.carbs=24;g.foraging.inventory.protein=24;
      g.rooms.syncInventory();d.ui.updateMetrics();d.renovationAdapter.notify();
      const queen=g.rooms.rooms[0];
      return {prior:before,now:{...g.foraging.inventory},queenDepot:{...queen.stock},
        queenCapacity:g.rooms.capacities()};
    }""")
    assert supply['queenDepot']['carbs']<=24 and supply['queenDepot']['protein']<=24,(
       'seed exceeds actual queen depot capacity',supply)
    page.wait_for_timeout(150)
    if not page.locator('.ui04-sheet').is_visible():
        assert page.locator('.ui04-reopen').is_visible(),('4x4 Nursery sheet absent',built)
        tap(page,'.ui04-reopen')
    assert page.locator('.ui04-sheet').is_visible()
    assert '0/16' in page.locator('.ui04-capacity').inner_text(),(
        'capacity UI does not show 16 slots',page.locator('.ui04-capacity').inner_text())
    assert page.locator('.ui04-primary').is_enabled()
    for n in range(16):
        page.locator('.ui04-primary').scroll_into_view_if_needed()
        tap(page,'.ui04-primary')
        cur=snap(page)
        assert len(cur['eggs'])==n+1 and all(e['status']=='QUEUED' for e in cur['eggs']),(
          'CSS booking failed at index',n,cur['eggs'],cur['stock'])
    full=snap(page)
    ids=[e['id'] for e in full['eggs']]
    coordinates=[(e['slot']['x'],e['slot']['y']) for e in full['eggs']]
    assert len(set(ids))==16 and len(set(coordinates))==16,('duplicate orders or slots',full)
    assert full['stock']['carbs']==8 and full['stock']['protein']==8,(
       'incorrect 16x miner Lv1 stock reservation',full['stock'])
    assert page.locator('.ui04-primary').is_disabled()
    assert '16/16' in page.locator('.ui04-capacity').inner_text()
    # Read-only effective full-state check is supplemented by a SINGLE
    # direct engine rejected 17th attempt, which is NOT a booking fixture.
    denied=page.evaluate("""id=>__ANT_DEBUG__.game.lifecycle.queueEgg(id,'miner',1)""",room['id'])
    assert denied=={'ok':False,'reason':'nursery-full'},('17th egg incorrectly accepted',denied)
    assert snap(page)['eggs']==full['eggs'] and snap(page)['stock']==full['stock']
    checkpoint(page,'08-16slot-sixteen-ui-bookings-full',built,{
      'postBuildRestockFixture':supply,'slots':coordinates,'denied17':denied,
      'input':'16 genuine CSS Nursery taps; direct rejected 17th engine boundary check'})

    first_id=ids[0]
    selector='.ui04-orders button[data-egg-id="'+first_id+'"]'
    page.locator(selector).scroll_into_view_if_needed()
    tap(page,selector)
    freed=snap(page)
    assert len(freed['eggs'])==15 and first_id not in [e['id'] for e in freed['eggs']]
    assert freed['stock']['carbs']==9 and freed['stock']['protein']==9
    assert '15/16' in page.locator('.ui04-capacity').inner_text()
    page.locator('.ui04-primary').scroll_into_view_if_needed()
    tap(page,'.ui04-primary')
    refilled=snap(page)
    assert len(refilled['eggs'])==16 and refilled['stock']==full['stock']
    assert len({(e['slot']['x'],e['slot']['y']) for e in refilled['eggs']})==16
    assert page.locator('.ui04-primary').is_disabled()
    checkpoint(page,'09-16slot-cancel-one-and-refill',full,{
      'cancelledOrder':first_id,'reusedSlot':refilled['eggs'][-1]['slot']})

    for order in list(refilled['eggs']):
        selector='.ui04-orders button[data-egg-id="'+order['id']+'"]'
        page.locator(selector).scroll_into_view_if_needed()
        tap(page,selector)
    cleared=snap(page)
    assert not cleared['eggs'] and not cleared['brood']
    assert cleared['capacity']==16 and cleared['stock']['carbs']==24 and cleared['stock']['protein']==24,(
      '16 booking cancellations did not fully refund test-seeded depot',cleared)
    assert '0/16' in page.locator('.ui04-capacity').inner_text()
    assert page.locator('.ui04-primary').is_enabled()
    checkpoint(page,'10-16slot-all-css-cancel-exact-refund',refilled,{
       'refunds':16,'expectedInitialAfterRefill':supply['now']})
    assert not errors,('JavaScript errors',errors)
    print('G4-NATURAL CAPACITY PASS: actual 4x4 room, 260 tick builder, 16 distinct '
      'CSS egg reservations, rejected 17th, cancel/requeue and 16 refunds; '
      'stock explicitly seeded; ticks='+str(cleared['ticks']),flush=True)

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
        try:
            run(ctx.new_page())
            run_capacity(ctx.new_page())
        finally:ctx.close();browser.close()
finally:
    (OUT/'evidence.json').write_text(json.dumps({
      'sha':SHA,'source_head_sha':SOURCE,'git_tree_sha':TREE,
      'scope':'G4 real worker room-build and hatch; starting stock fixture and accelerated authoritative ticks',
      'events':RECORDS},ensure_ascii=False,indent=2))
    server.terminate()
    try:server.wait(timeout=5)
    except subprocess.TimeoutExpired:server.kill()
