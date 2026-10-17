"""G3 Engineer A real-game integration QA; Chromium+WebKit and responsive pointers.
Old HUD stays active in production; browser adds a temporary TEST-ONLY style to
isolate future shell for honest geometry and interaction evidence."""
from pathlib import Path
from urllib.request import urlopen
import subprocess,time
from playwright.sync_api import sync_playwright

def assert_sheet_geometry(page,sheet_selector,close_selector,engine,w,h):
    """No Playwright auto-scroll: verify this visible sheet is really on screen.

    A prior green G3 run only used is_visible(); later sheet hosts lived below
    the shell clip, so all screenshot pixels showed only a dark backdrop.
    """
    result=page.evaluate("""([sheetSel,closeSel])=>{
        const sheet=document.querySelector(sheetSel);
        const close=document.querySelector(closeSel);
        const visual=window.visualViewport;
        const viewport={x:visual?.offsetLeft??0,y:visual?.offsetTop??0,
          w:visual?.width??innerWidth,h:visual?.height??innerHeight};
        function describe(el){
          if(!el)return null;
          const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
          const hit=document.elementFromPoint(x,y);
          return {x:r.x,y:r.y,w:r.width,h:r.height,
            hit:!!hit&&(hit===el||el.contains(hit))};
        }
        const host=sheet?.closest('.ui-feature-panel');
        return {viewport,sheet:describe(sheet),close:describe(close),
          host:describe(host),hostTop:host?.getBoundingClientRect().top,
          docOverflow:document.documentElement.scrollWidth-innerWidth};
      }""",[sheet_selector,close_selector]);
    v=result['viewport'];s=result['sheet'];c=result['close']
    assert s and c,(engine,w,h,sheet_selector,'missing panel/close',result)
    assert s['w']>40 and s['h']>40 and s['hit'],(engine,w,h,sheet_selector,'panel not painted/hit',result)
    assert s['x']>=v['x']-2 and s['y']>=v['y']-2,(engine,w,h,sheet_selector,'panel begins offscreen',result)
    assert s['x']+s['w']<=v['x']+v['w']+2,(engine,w,h,sheet_selector,'panel exceeds right viewport',result)
    assert s['y']+s['h']<=v['y']+v['h']+2,(engine,w,h,sheet_selector,'panel exceeds bottom viewport',result)
    assert c['w']>=43.9 and c['h']>=43.9 and c['hit'],(engine,w,h,close_selector,'close control not hittable',result)
    assert c['x']>=v['x']-2 and c['y']>=v['y']-2 and c['x']+c['w']<=v['x']+v['w']+2 and c['y']+c['h']<=v['y']+v['h']+2,(engine,w,h,close_selector,'close offscreen',result)
    assert result['docOverflow']<=1,(engine,w,h,'horizontal document overflow',result)
    return result

def tap_close_no_scroll(page,selector,mobile):
    """Genuine pointer/touch without locator.click() scrolling hidden controls."""
    bounds=page.locator(selector).bounding_box()
    assert bounds is not None,(selector,'no bounds')
    x=bounds['x']+bounds['width']/2;y=bounds['y']+bounds['height']/2
    if mobile:page.touchscreen.tap(x,y)
    else:page.mouse.click(x,y)

def assert_legacy_military_suppressed(page,engine,w,h,state):
    """A BODY-owned legacy command dock must have no rendered hit targets."""
    result=page.evaluate("""() => {
      const dock=document.querySelector('body > #u6-dock');
      const tip=document.querySelector('body > #u6-target-tip');
      const oldDialog=document.querySelector('body > #u6-dialog');
      return {bodyMode:document.body.dataset.uiRenovationQa,
        dockFound:!!dock,dockDisplay:dock?getComputedStyle(dock).display:null,
        dockRects:dock?.getClientRects().length ?? -1,
        dockVisibleButtons:!dock?[]:[...dock.querySelectorAll('button')]
          .filter(b=>!!b.getClientRects().length).map(b=>b.id),
        tipReparented:!!tip,tipHidden:tip?.hidden,
        dialogOpen:oldDialog?.open===true};
    }""")
    assert result['bodyMode']=='true' and result['dockFound'],(engine,w,h,state,result)
    assert result['dockDisplay']=='none' and result['dockRects']==0,(engine,w,h,state,'old dock painted',result)
    assert not result['dockVisibleButtons'] and result['tipReparented'],(engine,w,h,state,'old command surface still active',result)
    assert not result['dialogOpen'],(engine,w,h,state,'old military modal unexpectedly open',result)

ROOT=Path(__file__).resolve().parents[1]
SHOTS=ROOT/'artifacts'/'g3-engineer-a'
SHOTS.mkdir(parents=True,exist_ok=True)
server=subprocess.Popen(['node','tools/dev-server.mjs'],cwd=ROOT,
                        stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
try:
    for _ in range(70):
        try:
            with urlopen('http://127.0.0.1:4173/',timeout=1) as reply:
                assert reply.status==200
            break
        except Exception:
            time.sleep(.2)
    else: raise RuntimeError('server failed')
    with sync_playwright() as pw:
        for engine in [pw.chromium,pw.webkit]:
            browser=engine.launch(headless=True,
                args=['--no-sandbox'] if engine.name=='chromium' else [])
            for w,h in [(320,568),(360,640),(375,667),(390,844),(430,932),
                        (568,320),(667,375),(844,390),(768,1024),(820,1180),
                        (1024,768),(1280,720),(1440,900),(1920,1080)]:
                mobile=w<1200
                ctx=browser.new_context(viewport={'width':w,'height':h},
                    device_scale_factor=1,is_mobile=mobile,has_touch=mobile)
                page=ctx.new_page()
                errs=[]
                page.on('pageerror',lambda e: errs.append(str(e)))
                page.goto('http://127.0.0.1:4173/?ui=renovation',wait_until='domcontentloaded')
                page.wait_for_timeout(500)
                if errs: print('G3-A startup browser errors:',repr(errs),flush=True)
                page.wait_for_function('Boolean(window.__ANT_DEBUG__?.renovationA)',timeout=25000)
                assert page.locator('#ui-renovation-root').is_visible(),(engine.name,w,'opt-in renovation shell missing')
                assert page.locator('#game-canvas').is_visible()
                assert page.locator('#app').get_attribute('data-ui-renovation-qa')=='true'
                assert page.locator('.topbar').is_hidden(),(engine.name,w,'legacy HUD must be hidden in QA opt-in')
                assert_legacy_military_suppressed(page,engine.name,w,h,'initial')
                assert page.evaluate('''() => {
                    const d=window.__ANT_DEBUG__;
                    return d.renovationA.mounted.length===4 &&
                      d.renovationShell.overlay.registry.has('home-menu') &&
                      d.renovationShell.overlay.registry.has('settings');
                }'''),(engine.name,w,'module mount missing')
                assert page.locator('.ui-home-toolbar .ui-home-action').count()==5
                assert page.locator('.ui-renovation-slot[data-ui-region="PRIMARY_COMMAND"] .ui-home-action[data-home-action="layer"]').count()==1
                assert page.locator('.ui-home-hud').is_visible()
                geometry=page.evaluate('''() => {
                    const shell=__ANT_DEBUG__.renovationShell,nav=document.querySelector('.ui-home-toolbar');
                    const bounds=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
                    const hud=bounds(shell.getRegion('HUD_TOP')),map=bounds(shell.getRegion('MAP_VIEWPORT'));
                    const cmd=bounds(shell.getRegion('PRIMARY_COMMAND'));
                    const controls=[...nav.querySelectorAll('button')].map(b=>{
                       const r=b.getBoundingClientRect();
                       const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
                       return {id:b.dataset.homeAction,...bounds(b),hit:top===b||b.contains(top)};
                    });
                    return {hud,map,cmd,controls};
                }''')
                assert geometry['map']['w']>100 and geometry['map']['h']>80,(engine.name,w,h,geometry)
                for b in geometry['controls']:
                    assert b['w']>=43.9 and b['h']>=43.9 and b['hit'],(engine.name,w,h,b)
                    assert b['x']>=-1 and b['y']>=-1 and b['x']+b['w']<=w+1 and b['y']+b['h']<=h+1,(engine.name,w,h,b)
                layer=page.locator('.ui-home-action[data-home-action="layer"]')
                for _ in range(20):
                    before=page.evaluate('__ANT_DEBUG__.game.layer')
                    layer.click()
                    assert page.evaluate('__ANT_DEBUG__.game.layer')!=before,(engine.name,w,'layer flip')
                    assert page.evaluate('''() => {
                      const d=__ANT_DEBUG__;
                      return d.renovationShell.overlay.mode===
                        (d.combatControls?.targeting?'rally':d.ui.tool);
                    }'''),(engine.name,w,'tool mode desynchronized')
                assert page.evaluate('__ANT_DEBUG__.game.layer')=='underground'
                page.locator('[data-home-action="dig"]').click()
                assert page.evaluate('__ANT_DEBUG__.ui.tool')=='dig'
                layer.click()
                assert page.evaluate('__ANT_DEBUG__.ui.tool')=='inspect'
                assert not page.locator('[data-home-action="dig"]').is_enabled()
                layer.click()

                page.screenshot(path=str(SHOTS/f'{engine.name}-{w}x{h}-hud.png'))
                menu=page.locator('[data-home-action="menu"]')
                menu.click()
                assert page.locator('.ui-home-menu').is_visible()
                assert_sheet_geometry(page,'.ui-home-menu','.ui-home-menu-close',engine.name,w,h)
                assert page.locator('.ui-renovation-backdrop').is_visible()
                assert menu.get_attribute('aria-expanded')=='true'
                assert_legacy_military_suppressed(page,engine.name,w,h,'home menu')
                page.screenshot(path=str(SHOTS/f'{engine.name}-{w}x{h}-menu.png'))
                # Actual outside click goes to shell-owned blocker, not map.
                pbox=page.locator('.ui-renovation-backdrop').bounding_box()
                page.locator('.ui-renovation-backdrop').click(position={'x':2,'y':h/2})
                assert not page.locator('.ui-home-menu').is_visible()
                assert page.evaluate('__ANT_DEBUG__.ui.selection') is None
                menu.click()
                page.get_by_role('button',name='ตั้งค่าและ Seed').click()
                assert page.locator('.ui-settings-sheet').is_visible()
                assert_sheet_geometry(page,'.ui-settings-sheet','.ui-settings-close',engine.name,w,h)
                assert not page.locator('.ui-home-menu').is_visible()
                assert page.locator('.ui-renovation-backdrop').is_visible()
                # Force a prior-visit scroll: sticky Close remains visible and a
                # later re-open must reset scrollTop before the first button focus.
                page.evaluate("document.querySelector('.ui-settings-sheet').scrollTop=100000")
                assert_sheet_geometry(page,'.ui-settings-sheet','.ui-settings-close',engine.name,w,h)
                page.evaluate("document.querySelector('.ui-settings-sheet').scrollTop=0")
                assert_legacy_military_suppressed(page,engine.name,w,h,'settings')
                page.screenshot(path=str(SHOTS/f'{engine.name}-{w}x{h}-settings.png'))

                seed_input=page.locator('#ui-settings-seed-input')
                seed_input.fill('   ')
                page.get_by_role('button',name='สร้างโลกใหม่…').click()
                assert 'กรุณา' in page.locator('.ui-settings-sheet .ui-settings-error').inner_text()
                assert not page.locator('.ui-settings-confirm').evaluate('(e)=>e.open')
                original=page.evaluate('__ANT_DEBUG__.game.world.seedLabel')
                intended=f'G3-{engine.name}-{w}'
                seed_input.fill(intended)
                page.get_by_role('button',name='สร้างโลกใหม่…').click()
                assert page.locator('.ui-settings-confirm').evaluate('(e)=>e.open')
                assert page.evaluate('__ANT_DEBUG__.game.world.seedLabel')==original
                dialog=page.locator('.ui-settings-confirm').bounding_box()
                assert dialog and dialog['x']>=-1 and dialog['y']>=-1
                assert dialog['x']+dialog['width']<=w+1 and dialog['y']+dialog['height']<=h+1,(engine.name,w,h,dialog)
                page.screenshot(path=str(SHOTS/f'{engine.name}-{w}x{h}-confirm.png'))
                page.get_by_role('button',name='กลับไปแก้ไข').click()
                assert page.locator('.ui-settings-sheet').is_visible()
                assert seed_input.input_value()==intended
                assert page.evaluate('__ANT_DEBUG__.game.world.seedLabel')==original
                assert page.evaluate('document.activeElement?.id')=='ui-settings-seed-input',(engine.name,w,'focus restore')
                page.get_by_role('button',name='สร้างโลกใหม่…').click()
                assert page.locator('.ui-settings-confirm').evaluate('(e)=>e.open')
                page.get_by_role('button',name='ยืนยันสร้างโลกใหม่').click()
                assert page.evaluate('__ANT_DEBUG__.game.world.seedLabel')==intended
                assert not page.locator('.ui-settings-confirm').evaluate('(e)=>e.open')
                assert not page.locator('.ui-settings-sheet').is_visible()
                assert page.evaluate('''() => __ANT_DEBUG__.renovationAdapter.pendingReset''') is None
                assert page.evaluate('''() => __ANT_DEBUG__.game.population''')==6
                assert page.evaluate('''() => __ANT_DEBUG__.ui.tool''')=='inspect'
                assert 'Seed: '+intended in page.locator('.ui-home-seed').inner_text()
                # The Settings close must work as an actual unassisted tap.
                menu.click()
                page.get_by_role('button',name='ตั้งค่าและ Seed').click()
                assert_sheet_geometry(page,'.ui-settings-sheet','.ui-settings-close',engine.name,w,h)
                tap_close_no_scroll(page,'.ui-settings-close',mobile)
                assert page.locator('.ui-settings-sheet').is_hidden()
                assert page.locator('.ui-renovation-backdrop').is_hidden()
                # Coordinator G3-B: real buttons/overlay navigation against the
                # full game, not a synthetic DOM or a re-created facade.
                assert page.evaluate('''() => {
                    const d=__ANT_DEBUG__;
                    return d.renovationB?.mounted?.join(',')==='military,ants' &&
                        d.renovationShell.overlay.registry.has('ui02-military') &&
                        d.renovationShell.overlay.registry.has('ui03-ants');
                }'''),(engine.name,w,'B modules not mounted')
                menu.click()
                page.get_by_role('button',name='มดในอาณาจักร').click()
                assert page.locator('.uiv1-a').is_visible(),(engine.name,w,'ant panel missing')
                assert_sheet_geometry(page,'.uiv1-a','.uiv1-a-head button',engine.name,w,h)
                assert page.locator('.uiv1-a-unit').count()>=5,(engine.name,w,'ant roster empty')
                assert page.locator('.ui-home-menu').is_hidden()
                assert_legacy_military_suppressed(page,engine.name,w,h,'ant roster')
                page.screenshot(path=str(SHOTS/f'{engine.name}-{w}x{h}-ants.png'))
                tap_close_no_scroll(page,'.uiv1-a-head button',mobile)
                assert page.locator('.uiv1-a').is_hidden()
                menu.click()
                page.get_by_role('button',name='กองทหาร A/B').click()
                assert page.locator('.uiv1-b').is_visible(),(engine.name,w,'military panel missing')
                assert_sheet_geometry(page,'.uiv1-b','.uiv1-b-head button',engine.name,w,h)
                assert page.locator('.uiv1-b-tabs button').count()==2
                assert page.locator('.ui-home-menu').is_hidden()
                assert_legacy_military_suppressed(page,engine.name,w,h,'new military')
                page.screenshot(path=str(SHOTS/f'{engine.name}-{w}x{h}-military.png'))
                # Preserve the single existing tactical controller. An actual
                # renovated rally button must expose its original cancel tip
                # while the old three-button dock stays entirely absent.
                page.locator('.uiv1-b [data-b-action="rally"]').click()
                assert page.locator('.uiv1-b').is_hidden()
                assert page.evaluate('__ANT_DEBUG__.renovationAdapter.view.military.targeting')
                assert page.locator('#u6-target-tip').is_visible(),(engine.name,w,h,'no rally cancel affordance')
                assert_legacy_military_suppressed(page,engine.name,w,h,'targeting')
                tip_cancel=page.locator('#u6-cancel-target')
                tip_box=tip_cancel.bounding_box()
                assert tip_box and tip_box['y']>=0 and tip_box['y']+tip_box['height']<=h+1,(engine.name,w,h,'rally cancel offscreen',tip_box)
                tap_close_no_scroll(page,'#u6-cancel-target',mobile)
                assert not page.evaluate('__ANT_DEBUG__.renovationAdapter.view.military.targeting')
                assert page.locator('#u6-target-tip').is_hidden()
                assert_legacy_military_suppressed(page,engine.name,w,h,'target cancelled')
                # All six actual G3 modules must be mounted.  C is sourced
                # from real G1 snapshots and still protected by dormant shell.
                assert page.evaluate('''() => {
                    const d=window.__ANT_DEBUG__;
                    return d.renovationC?.mounted?.join(',')==='nursery,rooms' &&
                        d.renovationShell.overlay.registry.has('ui04-nursery') &&
                        d.renovationShell.overlay.registry.has('ui05-room-options');
                }'''),(engine.name,w,'C mount unavailable')
                page.locator('[data-home-action="dig"]').click()
                assert page.locator('.ui05-dig').is_visible(),(engine.name,w,'dig tool unavailable')
                assert page.locator('.ui05-actions button').count()==3
                page.screenshot(path=str(SHOTS/f'{engine.name}-{w}x{h}-dig.png'))
                page.locator('[data-home-action="room"]').click()
                assert page.locator('.ui05-build').is_visible(),(engine.name,w,'build tool unavailable')
                page.locator('.ui05-type-trigger').click()
                assert page.locator('.ui05-type-list').is_visible(),(engine.name,w,'room CSS picker missing')
                assert page.locator('.ui05-type-option').count()>=2
                page.locator('.ui05-type-option').nth(1).click()
                assert page.evaluate('''() => {
                    const d=__ANT_DEBUG__, picker=document.querySelector('#room-type');
                    return d.ui.tool==='room' && picker &&
                        d.renovationAdapter.view.rooms.canvas.roomType===picker.value;
                }'''),(engine.name,w,'room type source desynchronized')
                assert_legacy_military_suppressed(page,engine.name,w,h,'room picker')
                page.screenshot(path=str(SHOTS/f'{engine.name}-{w}x{h}-room.png'))
                layer.click()
                assert page.locator('.ui05-root').is_hidden(),(engine.name,w,'map action did not dismiss')
                assert page.evaluate('__ANT_DEBUG__.ui.tool')=='inspect'
                layer.click()
                assert page.evaluate('__ANT_DEBUG__.game.layer')=='underground'
                assert not errs,(engine.name,w,h,errs)
                # Standard bare URL must keep the original BODY-owned dock and
                # its real open/close behavior until full release cutover.
                page.goto('http://127.0.0.1:4173/?ui=legacy',wait_until='domcontentloaded')
                page.wait_for_function('Boolean(window.__ANT_DEBUG__?.game)',timeout=25000)
                assert page.locator('#u6-dock').is_visible(),(engine.name,w,h,'legacy dock lost on default URL')
                assert page.evaluate('document.body.dataset.uiRenovationQa') is None
                assert page.evaluate("document.querySelector('#u6-target-tip').parentElement.id")=='u6-dock'
                page.locator('#u6-open').click()
                assert page.locator('#u6-dialog').evaluate('(d)=>d.open')
                page.locator('#u6-close').click()
                assert not page.locator('#u6-dialog').evaluate('(d)=>d.open')
                assert not errs,(engine.name,w,h,'legacy reload',errs)
                print(f'G3-A PASS {engine.name} {w}x{h}: 5 true hit targets, layer 20x, sheets, outside click, Seed cancel+confirm, no JS errors')
                ctx.close()
            browser.close()
finally:
    server.terminate()
    try:server.wait(timeout=4)
    except subprocess.TimeoutExpired:server.kill()
