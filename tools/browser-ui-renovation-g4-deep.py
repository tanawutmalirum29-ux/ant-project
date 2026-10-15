"""G4 scoped real-game interaction evidence, not an independent QA signoff.
Real Chromium+WebKit, pinned SHA, UI pointer interactions and authoritative
Game state snapshots. Only the documented nursery-room test fixture is seeded.
No mocks of actions, event handlers, resources, combat or hatch costs.
"""
import os,json,time,subprocess
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts'/'g4-deep'
OUT.mkdir(parents=True,exist_ok=True)
SHA=os.environ.get('GITHUB_SHA','local-unpinned')
CASES=[(320,568),(568,320),(1440,900)]
EVIDENCE=[]
def state(page):
    return page.evaluate("""() => {
      const d=window.__ANT_DEBUG__,g=d.game,cc=d.ui.combatControls;
      return {seed:g.world.seedLabel,layer:g.layer,tool:d.ui.tool,
        resources:{...g.foraging.inventory},
        pendingDig:g.colony.pendingCount,
        queuedRooms:g.rooms.queuedCount,
        rooms:g.rooms.rooms.map(r=>({id:r.id,type:r.type,status:r.status,
          connected:r.connected,x:r.x,y:r.y,width:r.width,height:r.height})),
        eggOrders:g.lifecycle.eggOrders.map(e=>({id:e.id,roomId:e.roomId,
          profession:e.profession,level:e.level,status:e.status,cost:{...e.cost}})),
        brood:g.lifecycle.brood.length, births:g.lifecycle.births,
        population:g.population,
        squads:g.combat.getSquads().data.map(s=>({id:s.id,mode:s.mode,rally:s.rally,count:s.count})),
        selectedSquad:cc.selectedSquad,targeting:cc.targeting};
    }""")
def evidence(page,engine,w,h,name,before,details=None):
    shot=name+'.png'
    page.screenshot(path=str(OUT/(engine+'-'+str(w)+'x'+str(h)+'-'+shot)))
    EVIDENCE.append({'sha':SHA,'engine':engine,'viewport':[w,h],'scenario':name,
      'before':before,'after':state(page),'details':details,
      'screenshot':engine+'-'+str(w)+'x'+str(h)+'-'+shot})
def actual_tap(page,locator,touch):
    el=page.locator(locator)
    box=el.bounding_box()
    assert box and box['width']>0 and box['height']>0,(locator,box)
    x=box['x']+box['width']/2;y=box['y']+box['height']/2
    hit=page.evaluate("""p=>{
      const target=document.querySelector(p.selector),under=document.elementFromPoint(p.x,p.y);
      return !!target&&!!under&&(under===target||target.contains(under));}""",
      {'selector':locator,'x':x,'y':y})
    assert hit,(locator,'button obscured',box)
    if touch:page.touchscreen.tap(x,y)
    else:page.mouse.click(x,y)
def open_menu_domain(page,label,touch):
    actual_tap(page,'[data-home-action="menu"]',touch)
    page.get_by_role('button',name=label).click()
def set_fixture(page):
    return page.evaluate("""() => {
      const d=__ANT_DEBUG__,g=d.game,ui=d.ui;
      g.setSpeed(0);g.colony.setForageSlots(0);g.lifecycle.setNurseSlots(0);
      Object.assign(g.foraging.inventory,{carbs:24,protein:24,water:24});
      g.rooms.syncInventory();ui.updateMetrics();d.renovationAdapter.notify();
      return {queen:{x:g.colony.queen.x,y:g.colony.queen.y}};
    }""")
def add_nursery_fixture(page):
    return page.evaluate("""() => {
      const d=__ANT_DEBUG__,g=d.game,q=g.colony.queen;
      // This real ready-room fixture isolates lifecycle/UI commands from
      // construction time. The room object mirrors the existing browser-nursery
      // fixture and is processed by authoritative Rooms/Lifecycle on each tick.
      const room={id:'g4-ready-nursery',type:'nursery',x:q.x-4,y:q.y,
        width:2,height:2,status:'ready',connected:true,progress:65,ticks:65,
        workerId:null,broodSlots:4,stock:{carbs:0,protein:0,water:0},
        cost:{carbs:3,protein:2},capacity:{}};
      g.rooms.rooms.push(room);g.rooms.updateConnectivity();
      const valid=g.rooms.rooms.find(r=>r.id===room.id);
      if(valid.status!=='ready'||!valid.connected)
        throw Error('G4 nursery fixture disconnected');
      d.ui.select({layer:'underground',x:room.x,y:room.y});
      d.renovationAdapter.notify();
      return {id:room.id,status:valid.status,connected:valid.connected};
    }""")
def run(page,engine,w,h):
    touch=w<1200
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:4173/?ui=renovation',wait_until='domcontentloaded')
    page.wait_for_function('Boolean(window.__ANT_DEBUG__?.renovationC)',timeout=24000)
    fixture=set_fixture(page)
    start=state(page)
    assert start['seed']=='ANT-001' and start['queuedRooms']==0 and start['eggOrders']==[]
    evidence(page,engine,w,h,'first-boot',start,fixture)

    # Real renovated military controls → authoritative Squad B mode/order.
    open_menu_domain(page,'กองทหาร A/B',touch)
    before=state(page)
    actual_tap(page,'.uiv1-b-tabs [data-squad="B"]',touch)
    assert state(page)['selectedSquad']=='B',(engine,w,h,'squad B selection')
    actual_tap(page,'.uiv1-b [data-b-action="mode"][data-mode="retreat"]',touch)
    after=state(page)
    assert next(s for s in after['squads'] if s['id']=='B')['mode']=='retreat',after
    assert next(s for s in after['squads'] if s['id']=='A')['mode']==next(s for s in before['squads'] if s['id']=='A')['mode']
    evidence(page,engine,w,h,'squad-b-retreat',before)
    actual_tap(page,'.uiv1-b-head button',touch)

    # Start Rally from the NEW UI, then use the SAME original cancellation
    # handler, without a duplicate U6 quick-command dock.
    open_menu_domain(page,'กองทหาร A/B',touch)
    before=state(page)
    actual_tap(page,'.uiv1-b [data-b-action="rally"]',touch)
    assert state(page)['targeting'] is True
    assert page.locator('#u6-dock').is_hidden()
    assert page.locator('#u6-cancel-target').is_visible()
    evidence(page,engine,w,h,'squad-b-rally-targeting',before)
    actual_tap(page,'#u6-cancel-target',touch)
    assert state(page)['targeting'] is False
    evidence(page,engine,w,h,'squad-b-rally-cancel',before)

    # Nursery: setup only a physically connected, ready engine room; all
    # profession/level selection, booking and refund must use real CSS UI.
    valid=add_nursery_fixture(page)
    page.wait_for_timeout(260)
    if not page.locator('.ui04-sheet').is_visible():
        reopen=page.locator('.ui04-reopen')
        assert reopen.is_visible(),(engine,w,h,'nursery reopen not available',valid)
        reopen.click()
    assert page.locator('.ui04-sheet').is_visible(),(engine,w,h,'nursery absent')
    before=state(page)
    actual_tap(page,'.ui04-picker-trigger',touch)  # profession
    page.locator('.ui04-picker-menu:not([hidden]) [data-value="nurse"]').click()
    assert 'มดพี่เลี้ยง' in page.locator('.ui04-picker-trigger').first.inner_text()
    page.locator('.ui04-picker-trigger').nth(1).click()
    page.locator('.ui04-picker-menu:not([hidden]) [data-value="3"]').click()
    assert 'Lv.3' in page.locator('.ui04-picker-trigger').nth(1).inner_text()
    price=page.evaluate("__ANT_DEBUG__.game.lifecycle.eggCost('nurse',3)")
    actual_tap(page,'.ui04-primary',touch)
    queued=state(page)
    assert len(queued['eggOrders'])==1 and queued['eggOrders'][0]['status']=='QUEUED'
    assert queued['eggOrders'][0]['profession']=='nurse' and queued['eggOrders'][0]['level']==3
    assert queued['resources']['carbs']==before['resources']['carbs']-price['carbs']
    assert queued['resources']['protein']==before['resources']['protein']-price['protein']
    evidence(page,engine,w,h,'nursery-book-level3',before,{'cost':price})
    actual_tap(page,'.ui04-order .ui04-cancel',touch)
    refunded=state(page)
    assert refunded['eggOrders']==[]
    assert refunded['resources']==before['resources'],(engine,w,h,'refund mismatch',before,refunded)
    evidence(page,engine,w,h,'nursery-cancel-refund',queued)
    actual_tap(page,'.ui04-close',touch)
    assert page.locator('.ui04-sheet').is_hidden()

    # Construction engine: pointer and CSS tool must remain tied to the single
    # underlying map. A real validated room is ordered then refunded.
    before=state(page)
    actual_tap(page,'[data-home-action="room"]',touch)
    picker=page.locator('.ui05-type-trigger')
    picker.click()
    page.locator('.ui05-type-option').filter(has_text='คลังอาหาร').first.click()
    point=page.evaluate("""() => {
       const d=__ANT_DEBUG__,g=d.game,q=g.colony.queen,c=d.cameras[g.layer];
       const x=q.x+2,y=q.y;
       const p=c.worldToScreen((x+.5)*28,(y+.5)*28,d.renderer.width,d.renderer.height);
       return {x,y,sx:p.x,sy:p.y,valid:g.rooms.validate('food_store',x,y,2,2)};
    }""")
    assert point['valid']['ok'],(engine,w,h,'building-site fixture invalid',point)
    hit=page.evaluate('p=>document.elementFromPoint(p.sx,p.sy)?.id',point)
    assert hit=='game-canvas',(engine,w,h,'room map blocked',point,hit)
    if touch:page.touchscreen.tap(point['sx'],point['sy'])
    else:page.mouse.click(point['sx'],point['sy'])
    built=state(page)
    assert built['queuedRooms']==before['queuedRooms']+1,(engine,w,h,'room pointer did not place',built)
    room=next(r for r in built['rooms'] if r['type']=='food_store')
    assert room['width']==2 and room['height']==2
    evidence(page,engine,w,h,'room-pointer-queue',before,point)
    cancelled=page.evaluate("""id=>__ANT_DEBUG__.renovationAdapter.actions.cancelRoom(id)""",room['id'])
    assert cancelled['ok'] is True
    after=state(page)
    assert after['queuedRooms']==before['queuedRooms']
    assert after['resources']==before['resources'],(engine,w,h,'room refund mismatch',before,after)
    evidence(page,engine,w,h,'room-cancel-refund',built,{'cancelVia':'G1 authoritative action bridge'})
    actual_tap(page,'[data-home-action="inspect"]',touch)
    assert state(page)['tool']=='inspect'

    # World reset via the fully interactive CSS Settings Seed confirmation.
    before=state(page)
    open_menu_domain(page,'ตั้งค่าและ Seed',touch)
    seed='G4-'+engine+'-'+str(w)
    page.locator('#ui-settings-seed-input').fill(seed)
    page.get_by_role('button',name='สร้างโลกใหม่…').click()
    assert page.locator('.ui-settings-confirm').evaluate('(d)=>d.open')
    assert state(page)['seed']==before['seed']
    page.get_by_role('button',name='กลับไปแก้ไข').click()
    assert state(page)['seed']==before['seed']
    evidence(page,engine,w,h,'reset-cancel-no-mutation',before)
    page.get_by_role('button',name='สร้างโลกใหม่…').click()
    page.get_by_role('button',name='ยืนยันสร้างโลกใหม่').click()
    end=state(page)
    assert end['seed']==seed and end['queuedRooms']==0 and end['eggOrders']==[]
    assert end['targeting'] is False and len(end['rooms'])==1
    evidence(page,engine,w,h,'reset-confirm-clears-world',before)
    assert not errors,(engine,w,h,'JS errors',errors)
    print('G4-DEEP PASS',engine,str(w)+'x'+str(h),'scenarios=10',flush=True)
    return len(EVIDENCE)

server=subprocess.Popen(['node','tools/dev-server.mjs'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
try:
    for _ in range(80):
        try:
            with urlopen('http://127.0.0.1:4173/',timeout=1) as result:
                assert result.status==200
            break
        except Exception:time.sleep(.2)
    else:raise RuntimeError('G4 server unavailable')
    with sync_playwright() as pw:
        for engine in [pw.chromium,pw.webkit]:
            browser=engine.launch(headless=True,args=['--no-sandbox'] if engine.name=='chromium' else [])
            for w,h in CASES:
                ctx=browser.new_context(viewport={'width':w,'height':h},device_scale_factor=1,
                    is_mobile=w<1200,has_touch=w<1200)
                try:run(ctx.new_page(),engine.name,w,h)
                finally:ctx.close()
            browser.close()
finally:
    (OUT/'evidence.json').write_text(json.dumps({
      'sha':SHA,'scope':'G4 focused game-action tests; not full G4 signoff',
      'engines':['chromium','webkit'],'viewports':CASES,'events':EVIDENCE
    },ensure_ascii=False,indent=2))
    server.terminate()
    try:server.wait(timeout=5)
    except subprocess.TimeoutExpired:server.kill()
