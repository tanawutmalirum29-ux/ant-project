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
SOURCE_HEAD_SHA=os.environ.get('SOURCE_HEAD_SHA',SHA)
GIT_TREE_SHA=subprocess.run(['git','rev-parse','HEAD^{tree}'],
    cwd=ROOT,check=True,capture_output=True,text=True).stdout.strip()
CASES=[(320,568),(568,320),(1440,900)]
EVIDENCE=[]
TOUCH_TIMING=[]
# A requested 50ms delay yields approximately 100ms actual browser-pointerup
# to button-pointerdown on CI. The requested 0ms case remains a non-gating
# edge/stress diagnostic; no hardware or literal zero-delay claims are made.
FAST_TOUCH_GATED_GAPS=(50,100,250,430)
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
        selectedSquad:cc.selectedSquad,targeting:cc.targeting,armedSquad:cc.armedSquad??null,
        activeDigSelection:!!d.ui.digSelection,
        soldiers:g.combat.soldiers.map(a=>({id:a.id,level:a.level,hp:a.combatHP,
          maxHP:g.combat.maxHP(a),squad:a.squadId,state:a.state,x:a.x,y:a.y}))};
    }""")
def evidence(page,engine,w,h,name,before,details=None):
    shot=name+'.png'
    page.screenshot(path=str(OUT/(engine+'-'+str(w)+'x'+str(h)+'-'+shot)))
    EVIDENCE.append({'sha':SHA,'source_head_sha':SOURCE_HEAD_SHA,'git_tree_sha':GIT_TREE_SHA,
      'engine':engine,'viewport':[w,h],'scenario':name,
      'before':before,'after':state(page),'details':details,
      'screenshot':engine+'-'+str(w)+'x'+str(h)+'-'+shot})
def actual_tap(page,locator,touch):
    el=page.locator(locator).first
    box=el.bounding_box()
    assert box and box['width']>0 and box['height']>0,(locator,box)
    x=box['x']+box['width']/2;y=box['y']+box['height']/2
    hit=page.evaluate("""p=>{
      const target=document.querySelector(p.selector),under=document.elementFromPoint(p.x,p.y);
      return !!target&&!!under&&(under===target||target.contains(under));}""",
      {'selector':locator,'x':x,'y':y})
    if not hit:
        blocking=page.evaluate("""p=>{
          const el=document.elementFromPoint(p.x,p.y);
          const parents=[];for(let e=el,i=0;e&&i<6;e=e.parentElement,i++)parents.push({tag:e.tagName,id:e.id,cls:e.className});
          return {tag:el?.tagName,id:el?.id,classes:el?.className,
            ancestors:parents,
            nurseryReopen:document.querySelector('.ui04-reopen')?.getBoundingClientRect().toJSON(),
            roomsRoot:document.querySelector('.ui05-root')?.getBoundingClientRect().toJSON(),
            overlay:window.__ANT_DEBUG__.renovationShell.overlay.active};}""",{'x':x,'y':y})
        raise AssertionError((locator,'button obscured',box,blocking))
    if touch:page.touchscreen.tap(x,y)
    else:page.mouse.click(x,y)
def cdp_touch(session,kind,points):
    """Chromium DevTools genuine browser-input touch delivery, not DOM.dispatchEvent.
    Do not attribute this platform-specific evidence to WebKit or hardware."""
    session.send('Input.dispatchTouchEvent',{'type':kind,
      'touchPoints':[{'x':round(p[0],2),'y':round(p[1],2),'id':i+1}
                     for i,p in enumerate(points)]})

def cdp_touch_drag(session,a,b,steps=11,cancel=False,step_delay_ms=0):
    pa=(a['x'],a['y']);pb=(b['x'],b['y'])
    cdp_touch(session,'touchStart',[pa])
    for i in range(1,steps+1):
        t=i/steps
        cdp_touch(session,'touchMove',[(pa[0]+(pb[0]-pa[0])*t,
                                       pa[1]+(pb[1]-pa[1])*t)])
        if step_delay_ms:time.sleep(step_delay_ms/1000)
    cdp_touch(session,'touchCancel' if cancel else 'touchEnd',[])

def native_touch_timing_matrix(page,session,a,b,engine,w,h):
    """Chromium-only timed native touch matrix with enforced first-tap gate
    for request gaps >=50ms and a non-gating 0ms stress diagnostic.
    Recovery attempts are separately recorded, never counted as first-tap passes.
    No DOM-dispatched events, force clicks or automatic locator retries.
    """
    assert state(page)['pendingDig']==0 and not state(page)['activeDigSelection']
    page.evaluate("""() => {
      if(window.__g4TimingInstalled)return;
      window.__g4TimingInstalled=true;
      window.__g4TimingEvents=[];
      const canvas=document.getElementById('game-canvas');
      for(const kind of ['pointerdown','pointermove','pointerup','pointercancel'])
        canvas.addEventListener(kind,e=>{
          if(e.pointerType==='touch'&&(kind!=='pointermove'||window.__g4TimingEvents.length<500))
            window.__g4TimingEvents.push({target:'canvas',kind,timeMs:performance.now(),
              trusted:e.isTrusted,pointerType:e.pointerType});
        },{capture:true});
      for(const kind of ['pointerdown','pointerup','click'])
        document.addEventListener(kind,e=>{
          if(e.target?.closest?.('.ui05-dig .ui05-danger'))
            window.__g4TimingEvents.push({target:'cancel-button',kind,timeMs:performance.now(),
              trusted:e.isTrusted,pointerType:e.pointerType??null});
        },true);
    }""")
    for gap in [0,50,100,250,430]:
        # Each pair of drags has realistic paced move events (18ms/step);
        # a pause between first drag and overlap avoids compressing two
        # separate finger gestures into one physically impossible sequence.
        page.wait_for_timeout(470)
        baseline=state(page)
        assert baseline['pendingDig']==0 and not baseline['activeDigSelection'],(engine,w,h,gap,baseline)
        page.evaluate("window.__g4TimingEvents=[]")
        cdp_touch_drag(session,a,b,step_delay_ms=18)
        first=state(page)
        assert first['pendingDig']==4 and not first['activeDigSelection'],(engine,w,h,gap,'add',first)
        page.wait_for_timeout(180)
        cdp_touch_drag(session,a,b,step_delay_ms=18)
        selected=state(page)
        assert selected['pendingDig']==4 and selected['activeDigSelection'],(engine,w,h,gap,'select',selected)
        probe=page.evaluate("""() => {
          const btn=document.querySelector('.ui05-dig .ui05-danger');
          const rect=btn?.getBoundingClientRect();
          if(!rect)return null;
          const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
          const target=document.elementFromPoint(x,y);
          const hits=!!target&&(target===btn||btn.contains(target));
          const events=window.__g4TimingEvents;
          return {x,y,hit: hits,under:{tag:target?.tagName,id:target?.id,
            cls:target?.className},buttonDisabled:btn.disabled,
            overlayMode:__ANT_DEBUG__.renovationShell.overlay.mode,
            lastCanvasPointerUpMs:[...events].reverse().find(e=>e.target==='canvas'&&e.kind==='pointerup')?.timeMs??null,
            testedAtMs:performance.now()};
        }""")
        assert probe and probe['hit'],(engine,w,h,gap,'tap target occluded',probe)
        if gap:time.sleep(gap/1000)
        # This second probe is intentionally adjacent to the FIRST tap:
        # disabled immediately after drag can change on the next UI frame.
        pre_tap=page.evaluate("""() => {
          const btn=document.querySelector('.ui05-dig .ui05-danger');
          const r=btn.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
          const el=document.elementFromPoint(x,y);
          return {timeMs:performance.now(),disabled:btn.disabled,
            hit:el===btn||btn.contains(el),
            x,y,tool:__ANT_DEBUG__.ui.tool,
            gameSelection:!!__ANT_DEBUG__.ui.digSelection,
            pendingDig:__ANT_DEBUG__.game.colony.pendingCount};
        }""")
        # Single raw browser touchscreen tap. No locator, click(), auto-wait,
        # retries, force flag or action replay for the first-tap verdict.
        page.touchscreen.tap(pre_tap['x'],pre_tap['y'])
        page.wait_for_timeout(95)
        observed=state(page)
        tap_events=page.evaluate("window.__g4TimingEvents")
        btn_events=[e for e in tap_events if e['target']=='cancel-button']
        first_down=next((e['timeMs'] for e in btn_events if e['kind']=='pointerdown'),None)
        actual_gap=None if first_down is None or probe['lastCanvasPointerUpMs'] is None else round(
            first_down-probe['lastCanvasPointerUpMs'],2)
        first_success=(observed['pendingDig']==0 and not observed['activeDigSelection'])
        screenshot=f'touch-timing-{engine}-{w}x{h}-{gap}ms.png'
        page.screenshot(path=str(OUT/screenshot))
        expected_sequence=['pointerdown','pointerup','click']
        actual_sequence=[e['kind'] for e in btn_events]
        authentic_button_events=(actual_sequence==expected_sequence and
            all(e['trusted'] and e['pointerType']=='touch' for e in btn_events))
        gate_reasons=[]
        if not pre_tap['hit'] or pre_tap['disabled']:
            gate_reasons.append('BUTTON_BLOCKED_OR_DISABLED')
        if not first_success:
            gate_reasons.append('FIRST_TOUCH_FAILED_TO_CANCEL')
        if not authentic_button_events:
            gate_reasons.append('TRUSTED_FIRST_TOUCH_POINTER_AND_CLICK_SEQUENCE_MISSING')
        if observed['pendingDig'] != 0 or observed['activeDigSelection']:
            gate_reasons.append('DIG_ORDERS_OR_SELECTION_REMAIN')
        gate_eligible=gap in FAST_TOUCH_GATED_GAPS
        result={'engine':engine,'viewport':[w,h],'requestedGapMs':gap,
          'input':'Chromium CDP touch drags, native touchscreen.tap first attempt',
          'dragStepDelayMs':18,'betweenDragGapMs':180,
          'actualPointerUpToButtonDownMs':actual_gap,
          'buttonProbe':probe,'preFirstTap':pre_tap,
          'firstTapSucceeded':first_success,'gateEligible':gate_eligible,
          'gatePassed':len(gate_reasons)==0,'gateFailures':gate_reasons,
          'firstTapTrustedButtonSequence':authentic_button_events,
          'firstTapClassification':('CANCELLED' if first_success else
            'DISABLED_AT_FIRST_TAP' if pre_tap['disabled'] else
            'NO_BUTTON_POINTERDOWN' if not first_down else
            'POINTER_DELIVERED_NO_CANCELLATION'),
          'firstTapButtonEvents':btn_events,'rawTouchEvents':tap_events,
          'before':baseline,'afterPairOfDrags':selected,'afterFirstTap':observed,
          'screenshot':screenshot}
        if not first_success:
            # This is a separately identified RETRY after an extra 500ms,
            # never counted as a first-tap PASS. Keep exact lost-tap proof.
            page.wait_for_timeout(500)
            page.touchscreen.tap(probe['x'],probe['y'])
            page.wait_for_timeout(95)
            result['recovery']={'after':state(page),
              'buttonEvents':[e for e in page.evaluate('window.__g4TimingEvents')
                              if e['target']=='cancel-button']}
        else:
            result['recovery']=None
        TOUCH_TIMING.append(result)
        cleaned=state(page)
        assert cleaned['pendingDig']==0 and not cleaned['activeDigSelection'],(
          engine,w,h,gap,'even recovery tap did not cancel queued jobs',result)
    trials=[x for x in TOUCH_TIMING if x['engine']==engine and x['viewport']==[w,h]]
    gated=[x for x in trials if x['gateEligible']]
    failed=[x for x in gated if not x['gatePassed']]
    print('G4-TOUCH-TIMING',engine,str(w)+'x'+str(h),
      'first-pass='+str(sum(x['firstTapSucceeded'] for x in trials))+'/5',
      'GATED='+str(len(gated)-len(failed))+'/'+str(len(gated)),
      'intervals=0,50,100,250,430 (0=diagnostic)',flush=True)
    # Assert only after all five first attempts and any separate recovery were
    # persisted into TOUCH_TIMING, so even failed CI keeps exact evidence ZIP.
    assert not failed,(engine,w,h,'genuine first-touch regression gate failure',
                      [(x['requestedGapMs'],x['gateFailures'],
                        x['actualPointerUpToButtonDownMs']) for x in failed])

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
    # Module-ready != first frame drawn. Read actual 2D canvas pixels and
    # require visible textured terrain, not the blank startup/background fill.
    # This establishes "first settled paint" only for synthetic browser QA.
    page.wait_for_function("""() => {
      const canvas=document.getElementById('game-canvas');
      if(!canvas || canvas.width<100 || canvas.height<100)return false;
      const ctx=canvas.getContext('2d');
      const keys=new Set(),w=canvas.width,h=canvas.height;
      for(let y=1;y<=8;y++)for(let x=1;x<=12;x++){
        const px=ctx.getImageData(Math.floor(w*x/13),Math.floor(h*y/9),1,1).data;
        keys.add(px[0]+','+px[1]+','+px[2]);
      }
      return keys.size>=5;
    }""",timeout=15000)
    fixture=set_fixture(page)
    start=state(page)
    assert start['seed']=='ANT-001' and start['queuedRooms']==0 and start['eggOrders']==[]
    evidence(page,engine,w,h,'first-boot',start,fixture)

    # Two REAL authoritative military soldier entities are created using the
    # Lifecycle.promote engine fixture API; this is a seeded roster fixture,
    # NOT evidence of an independently completed Nursery hatch lifecycle.
    soldiers=page.evaluate("""() => {
      const d=__ANT_DEBUG__,g=d.game,q=g.colony.queen;
      for(const level of [2,3])g.lifecycle.promote({
        profession:'soldier',level,x:q.x,y:q.y});
      g.workforce.reconcile();d.renovationAdapter.notify();
      return g.combat.getSquads().data.map(s=>({id:s.id,count:s.count,hp:s.hpCurrent,max:s.hpMax}));
    }""")
    assert next(x for x in soldiers if x['id']=='A')['count']==2
    assert next(x for x in soldiers if x['id']=='A')['hp']>0
    evidence(page,engine,w,h,'soldier-roster-fixture',start,{'rosterOrigin':'Lifecycle.promote fixture; not full hatch','squads':soldiers})

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
    # Actual CSS troop transfer from A to B; B must be nonempty, have
    # authoritative current/max HP, and render a real roster row.
    actual_tap(page,'.uiv1-b-tabs [data-squad="A"]',touch)
    page.wait_for_timeout(190)
    soldier_before=state(page)
    transfer_selector='.uiv1-b-unit [data-b-action="transfer"]'
    assert page.locator(transfer_selector).count()>=2,(engine,w,h,'no real soldier transfer row')
    page.locator(transfer_selector).first.scroll_into_view_if_needed()
    actual_tap(page,transfer_selector,touch)
    moved=state(page)
    assert next(a for a in moved['squads'] if a['id']=='B')['count']==1,moved
    assert next(a for a in moved['squads'] if a['id']=='A')['count']==1,moved
    assert moved['soldiers'][0]['squad']=='B' and moved['soldiers'][0]['hp']>0
    evidence(page,engine,w,h,'soldier-a-to-b-ui-transfer',soldier_before)
    actual_tap(page,'.uiv1-b-head button',touch)

    # Start Rally from the NEW UI, then use the SAME original cancellation
    # handler, without a duplicate U6 quick-command dock.
    open_menu_domain(page,'กองทหาร A/B',touch)
    actual_tap(page,'.uiv1-b-tabs [data-squad="B"]',touch)
    before=state(page)
    assert before['selectedSquad']=='B'
    assert next(s for s in before['squads'] if s['id']=='B')['count']==1
    actual_tap(page,'.uiv1-b [data-b-action="rally"]',touch)
    armed=state(page)
    assert armed['targeting'] is True and armed['armedSquad']=='B',armed
    assert armed['selectedSquad']=='B'
    assert armed['squads']==before['squads'],(engine,w,h,'arming unexpectedly changes squad orders',armed)
    assert 'กอง B' in page.locator('#u6-target-tip').inner_text()
    assert page.locator('#u6-dock').is_hidden()
    assert page.locator('#u6-cancel-target').is_visible()
    evidence(page,engine,w,h,'squad-b-rally-targeting',before)
    actual_tap(page,'#u6-cancel-target',touch)
    cancelled=state(page)
    assert cancelled['targeting'] is False and cancelled['armedSquad'] is None
    assert cancelled['squads']==before['squads'],(engine,w,h,'cancel mutated A/B standing orders',before,cancelled)
    assert cancelled['selectedSquad']=='B'
    evidence(page,engine,w,h,'squad-b-rally-cancel',armed)

    # Re-arm B from the new CSS UI and actually tap one navigable map tile,
    # rather than only checking armed state. This tests authoritative rally
    # coordinate issuance, NONZERO B roster and the target click arbitration.
    open_menu_domain(page,'กองทหาร A/B',touch)
    actual_tap(page,'.uiv1-b-tabs [data-squad="B"]',touch)
    rally_before=state(page)
    actual_tap(page,'.uiv1-b [data-b-action="rally"]',touch)
    rally_point=page.evaluate("""() => {
      const d=__ANT_DEBUG__,q=d.game.colony.queen,c=d.cameras[d.game.layer];
      c.x=(q.x+.5)*28;c.y=(q.y+.5)*28;
      c.clamp(d.game.currentLayer,d.renderer.width,d.renderer.height);
      const pos=c.worldToScreen((q.x+.5)*28,(q.y+.5)*28,d.renderer.width,d.renderer.height);
      return {sx:pos.x,sy:pos.y,x:q.x,y:q.y,layer:d.game.layer,
        onCanvas:document.elementFromPoint(pos.x,pos.y)?.id==='game-canvas'};
    }""")
    assert rally_point['onCanvas'],(engine,w,h,'rally map obstructed',rally_point)
    if touch:page.touchscreen.tap(rally_point['sx'],rally_point['sy'])
    else:page.mouse.click(rally_point['sx'],rally_point['sy'])
    placed=state(page)
    squad_b=next(s for s in placed['squads'] if s['id']=='B')
    assert not placed['targeting'] and placed['armedSquad'] is None and squad_b['count']==1
    assert squad_b['mode']=='rally' and squad_b['rally']=={
      'layer':rally_point['layer'],'x':rally_point['x'],'y':rally_point['y']},(engine,w,h,squad_b,rally_point)
    evidence(page,engine,w,h,'squad-b-map-rally-placed',rally_before,rally_point)

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
    # A short-landscape Nursery roster legitimately scrolls internally.
    # Simulate an actual wheel gesture into its visible scroll area instead
    # of expecting a below-the-fold egg row to be initially onscreen or
    # letting Playwright's locator.click auto-scroll without verifying hits.
    list_rect=page.locator('.ui04-scroll').bounding_box()
    assert list_rect and list_rect['width']>40 and list_rect['height']>40,(engine,w,h,'nursery scroll area absent',list_rect)
    scroll_x=min(w-10,max(10,list_rect['x']+list_rect['width']/2))
    scroll_y=min(h-10,max(10,list_rect['y']+min(list_rect['height']/2,75)))
    if engine=='webkit' and touch:
        # Playwright 1.57 WebKit mobile explicitly rejects Mouse.wheel().
        # Controlled scroll setup only; the CANCEL TAP remains a true touch
        # gesture and is hit-tested. Do NOT count this as a touch-swipe test.
        page.evaluate("document.querySelector('.ui04-scroll').scrollTop=10000")
    else:
        page.mouse.move(scroll_x,scroll_y)
        page.mouse.wheel(0,1250)
    page.wait_for_timeout(110)
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
       // The initial camera is centered on the portal (y15), not the
       // queen-room worksite (y24). Pan the real camera to the site first;
       // tapping a world tile hidden *under* the bottom command row is not
       // an appropriate map-gesture test.
       c.x=(q.x+.5)*28;c.y=(q.y+.5)*28;
       c.clamp(g.currentLayer,d.renderer.width,d.renderer.height);
       const x=q.x+2,y=q.y;
       const p=c.worldToScreen((x+.5)*28,(y+.5)*28,d.renderer.width,d.renderer.height);
       return {x,y,sx:p.x,sy:p.y,valid:g.rooms.validate('food_store',x,y,2,2)};
    }""")
    assert point['valid']['ok'],(engine,w,h,'building-site fixture invalid',point)
    hit=page.evaluate('p=>document.elementFromPoint(p.sx,p.sy)?.id',point)
    if hit!='game-canvas':
        actual=page.evaluate("""p=>{
           const el=document.elementFromPoint(p.sx,p.sy);
           const parents=[];for(let e=el,i=0;e&&i<6;e=e.parentElement,i++)
             parents.push({tag:e.tagName,id:e.id,cls:e.className,rect:e.getBoundingClientRect().toJSON()});
           return {parents,roomPanel:document.querySelector('.ui05-root')?.getBoundingClientRect().toJSON(),
             nurseryReopen:document.querySelector('.ui04-reopen')?.getBoundingClientRect().toJSON(),
             mode:window.__ANT_DEBUG__.ui.tool};
          }""",point)
        raise AssertionError((engine,w,h,'room map blocked',point,hit,actual))
    if touch:page.touchscreen.tap(point['sx'],point['sy'])
    else:page.mouse.click(point['sx'],point['sy'])
    built=state(page)
    assert built['queuedRooms']==before['queuedRooms']+1,(engine,w,h,'room pointer did not place',built)
    room=next(r for r in built['rooms'] if r['type']=='food_store')
    assert room['width']==2 and room['height']==2
    evidence(page,engine,w,h,'room-pointer-queue',before,point)
    # Cancel via the actual Engineer C CSS UI, never by invoking
    # adapter.actions.cancelRoom() from the test console.
    page.wait_for_timeout(190)
    cancel_btn=page.locator('.ui05-inspect .ui05-danger')
    assert cancel_btn.is_visible(),(engine,w,h,'room cancel UI missing')
    cancel_btn.scroll_into_view_if_needed()
    actual_tap(page,'.ui05-inspect .ui05-danger',touch)
    after=state(page)
    assert after['queuedRooms']==before['queuedRooms']
    assert after['resources']==before['resources'],(engine,w,h,'room refund mismatch',before,after)
    evidence(page,engine,w,h,'room-cancel-refund',built,{'cancelVia':'real CSS room-cancel button'})
    actual_tap(page,'[data-home-action="inspect"]',touch)
    assert state(page)['tool']=='inspect'

    # A real two-step multi-tile dig/cancel lifecycle, with the historical
    # legacy canvas owning pointer capture and exactly-once dig commitments.
    # Mouse-pointer dragging is used in *both* Chromium and WebKit. This is
    # a real input event, but NOT claimed to be a mobile touch-swipe/pinch test.
    actual_tap(page,'[data-home-action="dig"]',touch)
    before_dig=state(page)
    chosen=page.evaluate("""() => {
      const d=__ANT_DEBUG__,g=d.game,q=g.colony.queen,c=d.cameras[g.layer],map=g.currentLayer;
      // The Queen room is an open chamber. On 568x320 every nearby
      // virgin 2x2 diggable rectangle lies beyond the small visible map band.
      // Recenter the actual camera on the nearest feasible worksite, then
      // prove BOTH drag endpoints are real canvas hits. Never simulate
      // a game order or force an obscured pointer event.
      const sites=[];
      for(let y=q.y-18;y<=q.y+18;y++)for(let x=q.x-18;x<=q.x+18;x++){
        if(x<2||y<2||x+1>=map.width-2||y+1>=map.height-2)continue;
        if([0,1].every(dy=>[0,1].every(dx=>[10,11].includes(map.cells[(y+dy)*map.width+x+dx]))))
          sites.push({x,y,score:Math.abs(x-q.x)+Math.abs(y-q.y)});
      }
      sites.sort((a,b)=>a.score-b.score);
      for(const site of sites){
        c.x=(site.x+1)*28;c.y=(site.y+1)*28;
        c.clamp(map,d.renderer.width,d.renderer.height);
        const a=c.worldToScreen((site.x+.5)*28,(site.y+.5)*28,d.renderer.width,d.renderer.height);
        const b=c.worldToScreen((site.x+1.5)*28,(site.y+1.5)*28,d.renderer.width,d.renderer.height);
        if([a,b].every(p=>p.x>6&&p.x<d.renderer.width-6&&p.y>55&&p.y<d.renderer.height-65&&
          document.elementFromPoint(p.x,p.y)?.id==='game-canvas'))
          return {...site,start:a,end:b,camera:{x:c.x,y:c.y}};
      }
      return null;
    }""")
    assert chosen,(engine,w,h,'no valid unobstructed two-by-two diggable map area')
    a,b=chosen['start'],chosen['end']
    page.mouse.move(a['x'],a['y'])
    page.mouse.down()
    page.mouse.move(b['x'],b['y'],steps=11)
    page.mouse.up()
    placed_dig=state(page)
    assert placed_dig['pendingDig']>=before_dig['pendingDig']+4,(engine,w,h,'dig drag did not commit four orders',before_dig,placed_dig,chosen)
    evidence(page,engine,w,h,'dig-2x2-pointer-add',before_dig,{'rectangle':chosen,'input':'real mouse pointer drag, not touchscreen'})
    page.mouse.move(a['x'],a['y'])
    page.mouse.down()
    page.mouse.move(b['x'],b['y'],steps=11)
    page.mouse.up()
    page.wait_for_timeout(180)
    selected_dig=state(page)
    assert selected_dig['activeDigSelection'],(engine,w,h,'existing dig tasks not selected',selected_dig)
    assert page.locator('.ui05-dig .ui05-danger').is_enabled()
    evidence(page,engine,w,h,'dig-select-existing-overlap',placed_dig,{'rectangle':chosen})
    page.locator('.ui05-dig .ui05-danger').scroll_into_view_if_needed()
    actual_tap(page,'.ui05-dig .ui05-danger',touch)
    removed=state(page)
    assert removed['pendingDig']==before_dig['pendingDig'],(engine,w,h,'dig cancel not exactly once',removed)
    assert not removed['activeDigSelection']
    evidence(page,engine,w,h,'dig-2x2-ui-cancel',selected_dig)

    # Real browser-input touchscreen gestures through Chromium DevTools only.
    # Playwright's WebKit transport has no equivalent trusted multi-touch API.
    # This is emulator/browser evidence, NOT actual-hardware certification.
    if engine=='chromium' and touch:
        session=page.context.new_cdp_session(page)
        page.evaluate("""() => {
          window.__g4TouchLog=[];
          for(const name of ['pointerdown','pointermove','pointerup','pointercancel']){
            document.getElementById('game-canvas').addEventListener(name,e=>{
              if(e.pointerType==='touch')window.__g4TouchLog.push({
                name,isTrusted:e.isTrusted,pointerType:e.pointerType});
            },{capture:true});
          }
        }""")
        touch_before=state(page)
        cdp_touch_drag(session,a,b)
        touch_added=state(page)
        events=page.evaluate("window.__g4TouchLog")
        assert touch_added['pendingDig']==touch_before['pendingDig']+4,(
            engine,w,h,'trusted touch drag failed to queue four dig orders',touch_before,touch_added,events)
        assert any(e['name']=='pointermove' and e['isTrusted'] for e in events),events
        assert all(e['pointerType']=='touch' and e['isTrusted'] for e in events),events
        evidence(page,engine,w,h,'trusted-touch-dig-2x2-add',touch_before,{
          'input':'Chromium native Input.dispatchTouchEvent','touchEvents':events})
        page.evaluate("window.__g4TouchLog=[]")
        cdp_touch_drag(session,a,b)
        touch_selected=state(page)
        assert touch_selected['activeDigSelection'] and touch_selected['pendingDig']==touch_added['pendingDig']
        evidence(page,engine,w,h,'trusted-touch-dig-overlap-selection',touch_added)
        # Browser touch gesture recognition may suppress clicks issued in the
        # same frame as the previous completed touch drag. This is a measured
        # real-user action gap, not a direct call to the domain cancellation.
        page.wait_for_timeout(430)
        page.evaluate("""() => {
          window.__g4ButtonTapLog=[];
          const el=document.querySelector('.ui05-dig .ui05-danger');
          for(const kind of ['pointerdown','pointerup','click'])el.addEventListener(kind,e=>
            window.__g4ButtonTapLog.push({kind,isTrusted:e.isTrusted,pointerType:e.pointerType})
          );
        }""")
        actual_tap(page,'.ui05-dig .ui05-danger',True)
        page.wait_for_timeout(190)
        after_touch_cancel=state(page)
        diagnostic=page.evaluate("""() => ({
          uiFeedback:document.querySelector('.ui05-feedback')?.textContent,
          legacySummary:document.querySelector('#dig-action-summary')?.textContent,
          rootMode:__ANT_DEBUG__.renovationShell.overlay.mode,
          selection:__ANT_DEBUG__.ui.digSelection,
          rootVisible:!document.querySelector('.ui05-root')?.hidden
        })""")
        assert after_touch_cancel['pendingDig']==touch_before['pendingDig'] and not after_touch_cancel['activeDigSelection'],(
          engine,w,h,'touch-selected dig cancel did not restore original pending count',
          before_dig,touch_before,touch_added,touch_selected,after_touch_cancel,diagnostic,
          {'gesture':page.evaluate('window.__g4TouchLog'),
           'buttonTap':page.evaluate('window.__g4ButtonTapLog')})
        evidence(page,engine,w,h,'trusted-touch-dig-css-cancel',touch_selected)

        # Real OS-initiated input cancellation must discard the in-flight
        # rectangle; never commit a dig on pointercancel/lost capture.
        page.evaluate("window.__g4TouchLog=[]")
        cancel_before=state(page)
        cdp_touch_drag(session,a,b,cancel=True)
        page.wait_for_timeout(70)
        cancel_after=state(page)
        cancel_log=page.evaluate("window.__g4TouchLog")
        assert cancel_after['pendingDig']==cancel_before['pendingDig'] and not cancel_after['activeDigSelection']
        assert page.evaluate("__ANT_DEBUG__.ui.digPreview===null")
        assert any(e['name']=='pointercancel' and e['isTrusted'] for e in cancel_log),cancel_log
        evidence(page,engine,w,h,'trusted-touch-pointercancel-no-commit',cancel_before,{
          'input':'Chromium genuine touchCancel','touchEvents':cancel_log})

        # Separate diagnostic suite; NOT incorporated into 23-case gated
        # baseline nor used to hide lost first taps behind recovery clicks.
        native_touch_timing_matrix(page,session,a,b,engine,w,h)

        # Actual two-finger touch should zoom the map, not create a dig job.
        midx=(a['x']+b['x'])/2;midy=(a['y']+b['y'])/2
        pts=[(midx-15,midy),(midx+15,midy)]
        points_out=[(midx-43,midy),(midx+43,midy)]
        ok_hit=page.evaluate("""(ps)=>ps.every(p=>{
          const t=document.elementFromPoint(p[0],p[1]);return t?.id==='game-canvas';
        })""",pts+points_out)
        assert ok_hit,(engine,w,h,'pinch endpoints occluded',pts,points_out)
        old_zoom=page.evaluate("__ANT_DEBUG__.cameras[__ANT_DEBUG__.game.layer].zoom")
        cdp_touch(session,'touchStart',[pts[0]])
        cdp_touch(session,'touchStart',pts)
        for i in range(1,9):
            t=i/8
            cdp_touch(session,'touchMove',[
              (pts[0][0]+(points_out[0][0]-pts[0][0])*t,midy),
              (pts[1][0]+(points_out[1][0]-pts[1][0])*t,midy)])
        cdp_touch(session,'touchEnd',[])
        page.wait_for_timeout(100)
        new_zoom=page.evaluate("__ANT_DEBUG__.cameras[__ANT_DEBUG__.game.layer].zoom")
        pinch_after=state(page)
        assert new_zoom>old_zoom+0.12,(engine,w,h,'native two-finger pinch did not zoom',old_zoom,new_zoom)
        assert pinch_after['pendingDig']==cancel_after['pendingDig']
        assert not pinch_after['activeDigSelection']
        evidence(page,engine,w,h,'trusted-touch-pinch-no-dig-order',cancel_after,{
          'input':'Chromium native two-finger pinch gesture','zoomBefore':old_zoom,'zoomAfter':new_zoom})
        session.detach()

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
    assert end['armedSquad'] is None and end['selectedSquad']=='A',(
        engine,w,h,'reset published stale squad selection from old Game',end)
    assert end['soldiers']==[] and all(s['count']==0 for s in end['squads'])
    assert page.evaluate("""() => {
       const d=__ANT_DEBUG__,cc=d.ui.combatControls;
       return cc.lastGame===d.game &&
         d.renovationAdapter.view.military.selectedSquad==='A' &&
         d.renovationShell.overlay.mode==='inspect'
    }"""),(engine,w,h,'reset facade and controller not synchronized')
    evidence(page,engine,w,h,'reset-confirm-clears-world',before)
    page.wait_for_timeout(320)
    settled=state(page)
    assert settled['selectedSquad']=='A' and settled['armedSquad'] is None
    assert settled['squads']==end['squads'],(engine,w,h,'squad changed after frame',end,settled)
    evidence(page,engine,w,h,'reset-after-next-hud-tick',end)

    # Exercise a SECOND real UI reset from a newly selected B, including a
    # standing B retreat order, to detect stale Game handlers and duplicate
    # subscriptions across world swaps. This is genuine UI, no reset API call.
    open_menu_domain(page,'กองทหาร A/B',touch)
    actual_tap(page,'.uiv1-b-tabs [data-squad="B"]',touch)
    actual_tap(page,'.uiv1-b [data-b-action="mode"][data-mode="retreat"]',touch)
    second_before=state(page)
    assert second_before['selectedSquad']=='B'
    assert next(s for s in second_before['squads'] if s['id']=='B')['mode']=='retreat'
    actual_tap(page,'.uiv1-b-head button',touch)
    open_menu_domain(page,'ตั้งค่าและ Seed',touch)
    new_seed=seed+'-R2'
    page.locator('#ui-settings-seed-input').fill(new_seed)
    page.get_by_role('button',name='สร้างโลกใหม่…').click()
    page.get_by_role('button',name='ยืนยันสร้างโลกใหม่').click()
    second_after=state(page)
    assert second_after['seed']==new_seed and second_after['selectedSquad']=='A'
    assert second_after['armedSquad'] is None and second_after['targeting'] is False
    assert all(s['count']==0 and s['rally'] is None for s in second_after['squads'])
    assert next(s for s in second_after['squads'] if s['id']=='B')['mode']=='defend'
    assert page.evaluate("""() => {
      const d=__ANT_DEBUG__,cc=d.ui.combatControls;
      return cc.lastGame===d.game &&
        d.renovationAdapter.view.military.selectedSquad==='A' &&
        d.renovationShell.overlay.stack.length===0
    }""")
    evidence(page,engine,w,h,'reset-second-from-b-to-a',second_before)
    page.wait_for_timeout(310)
    late=state(page)
    assert late['selectedSquad']=='A' and late['armedSquad'] is None
    assert late['squads']==second_after['squads']
    assert not errors,(engine,w,h,'JS errors',errors)
    print('G4-DEEP PASS',engine,str(w)+'x'+str(h),'scenarios='+str(23 if engine=='chromium' and touch else 18),flush=True)
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
    (OUT/'touch-timing.json').write_text(json.dumps({
      'sha':SHA,'source_head_sha':SOURCE_HEAD_SHA,'git_tree_sha':GIT_TREE_SHA,
      'scope':'Chromium CDP touch timing: first-attempt CI gated at requested 50/100/250/430ms; requested 0ms stress trial diagnostic-only. Browser emulation, NOT physical-device certification.',
      'requestedGapsMs':[0,50,100,250,430],
      'gatedRequestedGapsMs':list(FAST_TOUCH_GATED_GAPS),
      'trials':TOUCH_TIMING,
      'firstTapSuccessCount':sum(x['firstTapSucceeded'] for x in TOUCH_TIMING),
      'gatePassCount':sum(x['gatePassed'] for x in TOUCH_TIMING if x['gateEligible']),
      'gateTotal':sum(x['gateEligible'] for x in TOUCH_TIMING),
      'total':len(TOUCH_TIMING)
    },ensure_ascii=False,indent=2))
    (OUT/'evidence.json').write_text(json.dumps({
      'sha':SHA,'source_head_sha':SOURCE_HEAD_SHA,'git_tree_sha':GIT_TREE_SHA,
      'scope':'G4 focused game-action tests; not full G4 signoff',
      'engines':['chromium','webkit'],'viewports':CASES,'events':EVIDENCE
    },ensure_ascii=False,indent=2))
    server.terminate()
    try:server.wait(timeout=5)
    except subprocess.TimeoutExpired:server.kill()
